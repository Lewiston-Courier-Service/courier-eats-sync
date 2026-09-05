export async function handleMarketplaceOrders(request, env) {
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/marketplace/")) {
    return null;
  }

  if (!env.DISPATCH_DB) {
    return json({ error: "Dispatch database is not bound" }, 500);
  }

  if (url.pathname === "/api/marketplace/status" && request.method === "GET") {
    return json({
      service: "Courier Eats Marketplace Orders",
      status: "online",
      providers: {
        doordash: {
          webhookConfigured: Boolean(env.DOORDASH_MARKETPLACE_WEBHOOK_TOKEN)
        },
        uberEats: {
          webhookConfigured: Boolean(env.UBER_EATS_CLIENT_SECRET)
        }
      }
    });
  }

  if (url.pathname === "/api/marketplace/orders" && request.method === "GET") {
    if (!isAdmin(request, env)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100);
    const source = clean(url.searchParams.get("source")).toUpperCase();
    const status = clean(url.searchParams.get("status")).toUpperCase();

    let sql = `SELECT id, source, external_order_id, external_store_id,
                      restaurant_id, restaurant_name, customer_name,
                      fulfillment_type, subtotal_amount, tax_amount,
                      tip_amount, delivery_fee_amount, total_amount,
                      currency, status, provider_status, dispatch_order_id,
                      provider_created_at, received_at, updated_at
                 FROM marketplace_orders`;
    const where = [];
    const binds = [];

    if (source) {
      where.push("source = ?");
      binds.push(source);
    }

    if (status) {
      where.push("status = ?");
      binds.push(status);
    }

    if (where.length) {
      sql += ` WHERE ${where.join(" AND ")}`;
    }

    sql += " ORDER BY received_at DESC LIMIT ?";
    binds.push(limit);

    const result = await env.DISPATCH_DB.prepare(sql).bind(...binds).all();
    return json({ count: result.results?.length || 0, orders: result.results || [] });
  }

  if (url.pathname === "/api/marketplace/doordash/webhook" && request.method === "POST") {
    return handleDoorDashWebhook(request, env);
  }

  if (url.pathname === "/api/marketplace/ubereats/webhook" && request.method === "POST") {
    return handleUberEatsWebhook(request, env);
  }

  return json({ error: "Not found" }, 404);
}

async function handleDoorDashWebhook(request, env) {
  if (!env.DOORDASH_MARKETPLACE_WEBHOOK_TOKEN) {
    return json({ error: "DoorDash marketplace webhook is not configured" }, 503);
  }

  const supplied = extractDoorDashToken(request);
  if (!supplied || !safeEqual(supplied, String(env.DOORDASH_MARKETPLACE_WEBHOOK_TOKEN))) {
    return json({ error: "Invalid DoorDash webhook authorization" }, 401);
  }

  const raw = await request.text();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const eventType = clean(payload?.event?.type || payload?.event_type || "unknown");
  const externalEventId = clean(
    payload?.event?.id || payload?.event_id || payload?.event?.reference || ""
  ) || null;

  const order = payload?.order && typeof payload.order === "object" ? payload.order : null;
  const externalOrderId = order
    ? clean(order.id || order.order_id || order.external_order_id || order.merchant_supplied_id)
    : "";

  let marketplaceOrderId = null;
  if (order && externalOrderId) {
    marketplaceOrderId = await upsertDoorDashOrder(env, order, payload);
  }

  await recordEvent(env, {
    marketplaceOrderId,
    source: "DOORDASH",
    externalEventId,
    eventType: eventType || "unknown",
    payloadJson: raw
  });

  return new Response(null, { status: 200 });
}

async function handleUberEatsWebhook(request, env) {
  if (!env.UBER_EATS_CLIENT_SECRET) {
    return json({ error: "Uber Eats marketplace webhook is not configured" }, 503);
  }

  const raw = await request.text();
  const signature = clean(request.headers.get("X-Uber-Signature")).toLowerCase();

  if (!signature || !(await verifyHmacSha256(raw, env.UBER_EATS_CLIENT_SECRET, signature))) {
    return json({ error: "Invalid Uber Eats webhook signature" }, 401);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const eventType = clean(payload?.event_type || "unknown");
  const externalEventId = clean(payload?.event_id || "") || null;
  const resourceId = clean(payload?.resource_id || payload?.meta?.resource_id || "");
  const storeId = clean(payload?.store_id || payload?.meta?.user_id || payload?.meta?.store_id || "");

  let marketplaceOrderId = null;
  if (eventType === "orders.notification" && resourceId) {
    marketplaceOrderId = await upsertUberNotification(env, {
      resourceId,
      storeId,
      payload,
      raw
    });
  }

  await recordEvent(env, {
    marketplaceOrderId,
    source: "UBER_EATS",
    externalEventId,
    eventType: eventType || "unknown",
    payloadJson: raw
  });

  return new Response(null, { status: 200 });
}

async function upsertDoorDashOrder(env, order, payload) {
  const externalOrderId = clean(
    order.id || order.order_id || order.external_order_id || order.merchant_supplied_id
  );
  const externalStoreId = clean(
    order?.store?.merchant_supplied_id || order?.store_id || payload?.store?.merchant_supplied_id
  );
  const id = `doordash:${externalOrderId}`;

  const restaurantLink = externalStoreId
    ? await getRestaurantLink(env, "DOORDASH", externalStoreId)
    : null;

  const totals = extractDoorDashTotals(order);

  await env.DISPATCH_DB
    .prepare(
      `INSERT INTO marketplace_orders
        (id, source, external_order_id, external_store_id, restaurant_id,
         merchant_id, location_id, restaurant_name, customer_name,
         customer_phone, fulfillment_type, delivery_address_json,
         items_json, subtotal_amount, tax_amount, tip_amount,
         delivery_fee_amount, total_amount, currency, status,
         provider_status, provider_created_at, raw_order_json,
         received_at, updated_at)
       VALUES (?, 'DOORDASH', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(source, external_order_id) DO UPDATE SET
         external_store_id = excluded.external_store_id,
         restaurant_id = COALESCE(excluded.restaurant_id, marketplace_orders.restaurant_id),
         merchant_id = COALESCE(excluded.merchant_id, marketplace_orders.merchant_id),
         location_id = COALESCE(excluded.location_id, marketplace_orders.location_id),
         restaurant_name = COALESCE(excluded.restaurant_name, marketplace_orders.restaurant_name),
         customer_name = excluded.customer_name,
         customer_phone = excluded.customer_phone,
         fulfillment_type = excluded.fulfillment_type,
         delivery_address_json = excluded.delivery_address_json,
         items_json = excluded.items_json,
         subtotal_amount = excluded.subtotal_amount,
         tax_amount = excluded.tax_amount,
         tip_amount = excluded.tip_amount,
         delivery_fee_amount = excluded.delivery_fee_amount,
         total_amount = excluded.total_amount,
         currency = excluded.currency,
         provider_status = excluded.provider_status,
         provider_created_at = excluded.provider_created_at,
         raw_order_json = excluded.raw_order_json,
         updated_at = CURRENT_TIMESTAMP`
    )
    .bind(
      id,
      externalOrderId,
      externalStoreId || null,
      restaurantLink?.restaurant_id || null,
      restaurantLink?.merchant_id || null,
      restaurantLink?.location_id || null,
      restaurantLink?.restaurant_name || null,
      clean(order?.customer?.first_name || order?.customer?.name) || null,
      clean(order?.customer?.phone_number || order?.customer?.phone) || null,
      clean(order?.fulfillment_type || order?.delivery_method || order?.fulfillment?.type) || null,
      JSON.stringify(order?.delivery_address || order?.dropoff_address || order?.fulfillment?.delivery_address || null),
      JSON.stringify(order?.items || order?.order_items || []),
      totals.subtotal,
      totals.tax,
      totals.tip,
      totals.deliveryFee,
      totals.total,
      clean(order?.currency || "USD") || "USD",
      clean(payload?.event?.status || order?.status) || null,
      clean(order?.created_at || order?.createdAt) || null,
      JSON.stringify(order)
    )
    .run();

  return id;
}

async function upsertUberNotification(env, { resourceId, storeId, payload, raw }) {
  const id = `uber_eats:${resourceId}`;
  const restaurantLink = storeId
    ? await getRestaurantLink(env, "UBER_EATS", storeId)
    : null;

  await env.DISPATCH_DB
    .prepare(
      `INSERT INTO marketplace_orders
        (id, source, external_order_id, external_store_id, restaurant_id,
         merchant_id, location_id, restaurant_name, status, provider_status,
         raw_order_json, received_at, updated_at)
       VALUES (?, 'UBER_EATS', ?, ?, ?, ?, ?, ?, 'NOTIFIED', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(source, external_order_id) DO UPDATE SET
         external_store_id = excluded.external_store_id,
         restaurant_id = COALESCE(excluded.restaurant_id, marketplace_orders.restaurant_id),
         merchant_id = COALESCE(excluded.merchant_id, marketplace_orders.merchant_id),
         location_id = COALESCE(excluded.location_id, marketplace_orders.location_id),
         restaurant_name = COALESCE(excluded.restaurant_name, marketplace_orders.restaurant_name),
         provider_status = excluded.provider_status,
         raw_order_json = excluded.raw_order_json,
         updated_at = CURRENT_TIMESTAMP`
    )
    .bind(
      id,
      resourceId,
      storeId || null,
      restaurantLink?.restaurant_id || null,
      restaurantLink?.merchant_id || null,
      restaurantLink?.location_id || null,
      restaurantLink?.restaurant_name || null,
      clean(payload?.event_type || "orders.notification"),
      raw
    )
    .run();

  return id;
}

async function recordEvent(env, event) {
  try {
    await env.DISPATCH_DB
      .prepare(
        `INSERT INTO marketplace_order_events
          (marketplace_order_id, source, external_event_id, event_type, payload_json)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(
        event.marketplaceOrderId || null,
        event.source,
        event.externalEventId || null,
        event.eventType,
        event.payloadJson
      )
      .run();
  } catch (error) {
    if (!String(error?.message || error).toLowerCase().includes("unique")) {
      throw error;
    }
  }
}

async function getRestaurantLink(env, source, externalStoreId) {
  return env.DISPATCH_DB
    .prepare(
      `SELECT restaurant_id, merchant_id, location_id, restaurant_name
         FROM marketplace_restaurant_links
        WHERE source = ? AND external_store_id = ? AND active = 1
        LIMIT 1`
    )
    .bind(source, externalStoreId)
    .first();
}

function extractDoorDashTotals(order) {
  const money = order?.pricing || order?.totals || order?.order_value || {};
  return {
    subtotal: cents(money.subtotal || order?.subtotal),
    tax: cents(money.tax || order?.tax),
    tip: cents(money.tip || order?.tip),
    deliveryFee: cents(money.delivery_fee || order?.delivery_fee),
    total: cents(money.total || order?.total)
  };
}

function cents(value) {
  if (value == null) return 0;
  if (typeof value === "number") return Math.round(value);
  if (typeof value === "object") {
    const amount = value.amount ?? value.value ?? value.unit_amount;
    return Number.isFinite(Number(amount)) ? Math.round(Number(amount)) : 0;
  }
  return Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;
}

function extractDoorDashToken(request) {
  const auth = clean(request.headers.get("Authorization"));
  const alternate = clean(request.headers.get("X-Webhook-Token"));
  const value = auth || alternate;
  return value.replace(/^Bearer\s+/i, "");
}

function isAdmin(request, env) {
  if (!env.ADMIN_API_KEY) return false;
  const auth = clean(request.headers.get("Authorization")).replace(/^Bearer\s+/i, "");
  const key = clean(request.headers.get("X-API-Key"));
  return safeEqual(auth || key, String(env.ADMIN_API_KEY));
}

async function verifyHmacSha256(rawBody, secret, expectedHex) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody)
  );
  const actual = Array.from(new Uint8Array(signature))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
  return safeEqual(actual, expectedHex.toLowerCase());
}

function safeEqual(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

function clean(value) {
  return String(value ?? "").trim();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
