const FOOD_CATEGORIES = new Set([
  "RESTAURANT",
  "BAKERY",
  "FOOD_TRUCK",
  "GROCERY",
  "CONVENIENCE_STORE",
  "MEAT_MARKET",
  "FOOD_PACKAGE"
]);

const ACTIVE_STATUSES = ["NEW", "ACCEPTED", "ASSIGNED", "EN_ROUTE_TO_PICKUP", "PICKED_UP", "EN_ROUTE_TO_CUSTOMER"];
const FALLBACK_PROVIDERS = ["UBER_DIRECT", "DOORDASH", "SHIPDAY"];

export async function handleDispatchCenter(request, env, ctx) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/dispatch-center/")) return null;
  if (!env.DISPATCH_DB) return json({ error: "Dispatch database unavailable" }, 500);

  if (url.pathname === "/api/dispatch-center/intake" && request.method === "POST") {
    if (!authorizedIntake(request, env)) return json({ error: "Unauthorized" }, 401);
    return createIntake(request, env);
  }

  if (!authorizedAdmin(request, env)) return json({ error: "Unauthorized" }, 401);

  if (url.pathname === "/api/dispatch-center/loads" && request.method === "GET") {
    await enrollFoodDispatchOrders(env);
    const result = await env.DISPATCH_DB.prepare(`
      SELECT id, source, restaurant_name, customer_name, customer_phone,
             pickup_address, delivery_address, delivery_postal_code,
             shipment_category, status, claim_status, claim_deadline,
             claimed_at, claimed_by, fallback_provider, fallback_status,
             assigned_driver_id, delivery_fee_cents, created_at, updated_at
        FROM dispatch_orders
       WHERE shipment_category IN ('RESTAURANT','BAKERY','FOOD_TRUCK','GROCERY','CONVENIENCE_STORE','MEAT_MARKET','FOOD_PACKAGE')
         AND status IN ('NEW','ACCEPTED','ASSIGNED','EN_ROUTE_TO_PICKUP','PICKED_UP','EN_ROUTE_TO_CUSTOMER')
       ORDER BY CASE claim_status WHEN 'LCS_PRIORITY' THEN 0 WHEN 'CLAIMED' THEN 1 ELSE 2 END,
                claim_deadline ASC, id DESC
       LIMIT 250
    `).all();
    return json({ success: true, service: "LCS Dispatch Center", serverTime: new Date().toISOString(), loads: result.results || [] });
  }

  const claim = url.pathname.match(/^\/api\/dispatch-center\/loads\/(\d+)\/claim$/);
  if (claim && request.method === "POST") return claimLoad(Number(claim[1]), request, env);

  const release = url.pathname.match(/^\/api\/dispatch-center\/loads\/(\d+)\/release$/);
  if (release && request.method === "POST") {
    const id = Number(release[1]);
    const order = await env.DISPATCH_DB.prepare("SELECT id,status,claim_status FROM dispatch_orders WHERE id=?").bind(id).first();
    if (!order) return json({ error: "Shipment not found" }, 404);
    if (!ACTIVE_STATUSES.includes(order.status)) return json({ error: "Shipment is no longer active" }, 409);
    await env.DISPATCH_DB.batch([
      env.DISPATCH_DB.prepare("UPDATE dispatch_orders SET claim_status='FALLBACK_PENDING',fallback_status='PENDING',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id),
      env.DISPATCH_DB.prepare("INSERT INTO dispatch_events(order_id,status,note) VALUES (?,'FALLBACK_PENDING','Released by LCS dispatcher')").bind(id)
    ]);
    if (ctx?.waitUntil) ctx.waitUntil(processFallbackOrder(env, id));
    return json({ success: true, dispatchOrderId: id, claimStatus: "FALLBACK_PENDING" });
  }

  if (url.pathname === "/api/dispatch-center/process-expired" && request.method === "POST") {
    const result = await processExpiredPriorityLoads(env);
    return json({ success: true, ...result });
  }

  return json({ error: "Dispatch Center route not found" }, 404);
}

async function createIntake(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const category = normalizeCategory(body.category);
  if (!FOOD_CATEGORIES.has(category)) return json({ error: "Unsupported shipment category", allowedCategories: [...FOOD_CATEGORIES] }, 400);
  const pickup = clean(body.pickupAddress);
  const delivery = clean(body.deliveryAddress);
  const intakeKey = clean(body.intakeKey);
  if (!pickup || !delivery || !intakeKey) return json({ error: "pickupAddress, deliveryAddress, and intakeKey are required" }, 400);
  const deadline = new Date(Date.now() + priorityWindowMs(env)).toISOString();
  try {
    const result = await env.DISPATCH_DB.prepare(`
      INSERT INTO dispatch_orders
        (source,restaurant_name,customer_name,customer_phone,pickup_address,
         delivery_address,delivery_postal_code,shipment_category,status,
         dispatch_provider,claim_status,claim_deadline,intake_key,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,'internal','LCS_PRIORITY',?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    `).bind(
      clean(body.source) || "lcs_dispatch_api", clean(body.businessName) || null,
      clean(body.customerName) || null, clean(body.customerPhone) || null,
      pickup, delivery, clean(body.deliveryPostalCode) || null, category,
      "NEW", deadline, intakeKey
    ).run();
    const id = Number(result.meta?.last_row_id);
    await env.DISPATCH_DB.prepare("INSERT INTO dispatch_events(order_id,status,note) VALUES (?,'LCS_PRIORITY',?)")
      .bind(id, `LCS priority window opened until ${deadline}`).run();
    return json({ success: true, dispatchOrderId: id, claimStatus: "LCS_PRIORITY", claimDeadline: deadline }, 201);
  } catch (error) {
    if (String(error?.message || error).toLowerCase().includes("unique")) {
      const existing = await env.DISPATCH_DB.prepare("SELECT id,claim_status,claim_deadline FROM dispatch_orders WHERE intake_key=?").bind(intakeKey).first();
      return json({ success: true, duplicate: true, dispatchOrderId: existing?.id, claimStatus: existing?.claim_status, claimDeadline: existing?.claim_deadline });
    }
    throw error;
  }
}

async function claimLoad(id, request, env) {
  let body = {};
  try { body = await request.json(); } catch {}
  const driverId = Number(body.driverId || 0);
  const claimedBy = clean(body.claimedBy) || "LCS Dispatch";
  let driver = null;
  if (driverId) {
    driver = await env.DISPATCH_DB.prepare("SELECT id,name,status FROM drivers WHERE id=?").bind(driverId).first();
    if (!driver) return json({ error: "Driver not found" }, 404);
  }
  const result = await env.DISPATCH_DB.prepare(`
    UPDATE dispatch_orders
       SET claim_status='CLAIMED', claimed_at=CURRENT_TIMESTAMP, claimed_by=?,
           assigned_driver_id=COALESCE(?,assigned_driver_id),
           status=CASE WHEN ? IS NOT NULL THEN 'ASSIGNED' ELSE 'ACCEPTED' END,
           dispatch_provider='internal', fallback_status=NULL, updated_at=CURRENT_TIMESTAMP
     WHERE id=? AND claim_status IN ('LCS_PRIORITY','FALLBACK_PENDING')
       AND status IN ('NEW','ACCEPTED')
  `).bind(claimedBy, driverId || null, driverId || null, id).run();
  if (!Number(result.meta?.changes)) return json({ error: "Shipment was already claimed, released, or is no longer available" }, 409);
  const statements = [env.DISPATCH_DB.prepare("INSERT INTO dispatch_events(order_id,status,note) VALUES (?,'CLAIMED',?)").bind(id, driver ? `Claimed by LCS and assigned to ${driver.name}` : `Claimed by ${claimedBy}`)];
  if (driver) statements.push(env.DISPATCH_DB.prepare("UPDATE drivers SET status='BUSY' WHERE id=?").bind(driverId));
  await env.DISPATCH_DB.batch(statements);
  return json({ success: true, dispatchOrderId: id, claimStatus: "CLAIMED", status: driver ? "ASSIGNED" : "ACCEPTED", driver });
}

export async function processExpiredPriorityLoads(env) {
  if (!env.DISPATCH_DB) return { released: 0, processed: 0 };
  await enrollFoodDispatchOrders(env);
  const expired = await env.DISPATCH_DB.prepare(`
    SELECT id FROM dispatch_orders
     WHERE claim_status='LCS_PRIORITY' AND claim_deadline<=?
       AND status IN ('NEW','ACCEPTED') LIMIT 50
  `).bind(new Date().toISOString()).all();
  let released = 0;
  for (const row of expired.results || []) {
    const changed = await env.DISPATCH_DB.prepare("UPDATE dispatch_orders SET claim_status='FALLBACK_PENDING',fallback_status='PENDING',updated_at=CURRENT_TIMESTAMP WHERE id=? AND claim_status='LCS_PRIORITY'").bind(row.id).run();
    if (!Number(changed.meta?.changes)) continue;
    released += 1;
    await env.DISPATCH_DB.prepare("INSERT INTO dispatch_events(order_id,status,note) VALUES (?,'FALLBACK_PENDING','Five-minute LCS priority window expired')").bind(row.id).run();
    await processFallbackOrder(env, row.id);
  }
  return { released, processed: released };
}

export async function enrollFoodDispatchOrders(env) {
  return env.DISPATCH_DB.prepare(`
    UPDATE dispatch_orders
       SET shipment_category = CASE
             WHEN lower(COALESCE(restaurant_name,'')) LIKE '%bakery%' OR lower(COALESCE(restaurant_name,'')) LIKE '%cupcak%' OR lower(COALESCE(restaurant_name,'')) LIKE '%donut%' THEN 'BAKERY'
             WHEN lower(COALESCE(restaurant_name,'')) LIKE '%food truck%' THEN 'FOOD_TRUCK'
             WHEN lower(COALESCE(restaurant_name,'')) LIKE '%hannaford%' OR lower(COALESCE(restaurant_name,'')) LIKE '%shaw%' OR lower(COALESCE(restaurant_name,'')) LIKE '%walmart%' THEN 'GROCERY'
             WHEN lower(COALESCE(restaurant_name,'')) LIKE '%7-eleven%' OR lower(COALESCE(restaurant_name,'')) LIKE '%cumberland farms%' OR lower(COALESCE(restaurant_name,'')) LIKE '%convenience%' THEN 'CONVENIENCE_STORE'
             WHEN lower(COALESCE(restaurant_name,'')) LIKE '%meat market%' OR lower(COALESCE(restaurant_name,'')) LIKE '%butcher%' THEN 'MEAT_MARKET'
             ELSE 'RESTAURANT'
           END,
           claim_status = COALESCE(claim_status,'LCS_PRIORITY'),
           claim_deadline = COALESCE(claim_deadline,datetime(created_at,'+5 minutes')),
           updated_at = CURRENT_TIMESTAMP
     WHERE shipment_category IS NULL
       AND lower(COALESCE(source,'')) IN ('courier_eats','corporate_delivery_link','square','square_restaurant','doordash','uber_eats','marketplace','retail_pickup')
       AND status IN ('NEW','ACCEPTED')
  `).run();
}

export async function processFallbackOrder(env, orderId) {
  const order = await env.DISPATCH_DB.prepare("SELECT * FROM dispatch_orders WHERE id=? AND claim_status='FALLBACK_PENDING'").bind(orderId).first();
  if (!order) return { accepted: false, reason: "not_pending" };
  for (const provider of FALLBACK_PROVIDERS) {
    const config = providerConfig(env, provider);
    if (!config.url || !config.token) continue;
    let response;
    let responseText = "";
    try {
      response = await fetch(config.url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.token}` },
        body: JSON.stringify({ event: "shipment.offer", provider, shipment: publicOffer(order) })
      });
      responseText = (await response.text()).slice(0, 2000);
    } catch (error) { responseText = String(error?.message || error).slice(0, 2000); }
    await env.DISPATCH_DB.prepare(`INSERT INTO dispatch_provider_attempts(order_id,provider,status,response_code,response_body) VALUES (?,?,?,?,?)`)
      .bind(orderId, provider, response?.ok ? "ACCEPTED" : "FAILED", response?.status || null, responseText || null).run();
    if (response?.ok) {
      await env.DISPATCH_DB.batch([
        env.DISPATCH_DB.prepare("UPDATE dispatch_orders SET claim_status='OFFERED',fallback_provider=?,fallback_status='ACCEPTED',fallback_attempted_at=CURRENT_TIMESTAMP,dispatch_provider=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND claim_status='FALLBACK_PENDING'").bind(provider, provider.toLowerCase(), orderId),
        env.DISPATCH_DB.prepare("INSERT INTO dispatch_events(order_id,status,note) VALUES (?,'OFFERED',?)").bind(orderId, `Accepted by ${provider} fallback adapter`)
      ]);
      return { accepted: true, provider };
    }
  }
  await env.DISPATCH_DB.prepare("UPDATE dispatch_orders SET fallback_status='NO_PROVIDER_ACCEPTED',fallback_attempted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND claim_status='FALLBACK_PENDING'").bind(orderId).run();
  return { accepted: false, reason: "no_provider_accepted" };
}

export function normalizeCategory(value) {
  return clean(value).toUpperCase().replace(/[&/ -]+/g, "_").replace(/_+/g, "_");
}
export function priorityWindowMs(env = {}) {
  const minutes = Math.max(1, Math.min(Number(env.LCS_PRIORITY_MINUTES || 5) || 5, 60));
  return minutes * 60 * 1000;
}
function providerConfig(env, provider) {
  return { url: clean(env[`${provider}_OFFER_URL`]), token: clean(env[`${provider}_OFFER_TOKEN`]) };
}
function publicOffer(order) {
  return { id: order.id, category: order.shipment_category, pickupAddress: order.pickup_address, deliveryAddress: order.delivery_address, deliveryPostalCode: order.delivery_postal_code, businessName: order.restaurant_name, customerName: order.customer_name, customerPhone: order.customer_phone };
}
function authorizedAdmin(request, env) {
  const supplied = clean(request.headers.get("x-admin-key")) || clean(request.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  return safeEqual(supplied, clean(env.ADMIN_API_KEY));
}
function authorizedIntake(request, env) {
  const supplied = clean(request.headers.get("x-intake-key")) || clean(request.headers.get("authorization")).replace(/^Bearer\s+/i, "");
  return safeEqual(supplied, clean(env.DISPATCH_INTAKE_KEY || env.ADMIN_API_KEY));
}
function safeEqual(a, b) { if (!a || !b || a.length !== b.length) return false; let diff = 0; for (let i=0;i<a.length;i++) diff |= a.charCodeAt(i)^b.charCodeAt(i); return diff===0; }
function clean(value) { return String(value ?? "").trim(); }
function json(data, status=200) { return new Response(JSON.stringify(data,null,2),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}}); }
