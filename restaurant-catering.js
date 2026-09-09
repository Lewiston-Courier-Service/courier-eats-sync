const PUBLIC_PAGE = "/restaurant-onboarding/catering";
const ADMIN_PAGE = "/restaurant-onboarding/catering/admin";
const PUBLIC_API = "/api/restaurants/onboarding/catering";
const ADMIN_API = "/api/admin/restaurants/onboarding/catering";

export async function handleRestaurantCatering(request, env) {
  const url = new URL(request.url);
  if (![PUBLIC_PAGE, ADMIN_PAGE, PUBLIC_API, ADMIN_API].includes(url.pathname)) return null;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    if (url.pathname === PUBLIC_PAGE && request.method === "GET") return html(publicPage());
    if (url.pathname === ADMIN_PAGE && request.method === "GET") return html(adminPage());
    if (url.pathname === PUBLIC_API && request.method === "GET") return await getProfile(url, env);
    if (url.pathname === PUBLIC_API && request.method === "POST") return await saveProfile(request, env);
    if (url.pathname === ADMIN_API && request.method === "GET") return await listProfiles(request, env);
    if (url.pathname === ADMIN_API && request.method === "POST") return await updatePricing(request, env);
    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    console.error("Catering onboarding error", error);
    return json({ error: "Catering onboarding error", message: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
}

async function getProfile(url, env) {
  requireDb(env);
  const token = clean(url.searchParams.get("token"), 120);
  if (!token) return json({ error: "Missing onboarding token" }, 400);
  const row = await profileByToken(env, token);
  if (!row) return json({ error: "Onboarding application not found" }, 404);
  return json({ success: true, catering: publicRow(row) });
}

async function saveProfile(request, env) {
  requireDb(env);
  const body = await requestJson(request);
  const token = clean(body.token, 120);
  if (!token) return json({ error: "Missing onboarding token" }, 400);

  const onboarding = await env.DISPATCH_DB.prepare(
    "SELECT id, restaurant_name FROM restaurant_onboarding WHERE public_token = ? LIMIT 1"
  ).bind(token).first();
  if (!onboarding) return json({ error: "Onboarding application not found" }, 404);

  const offers = body.offersCatering === true ? 1 : 0;
  const orderUrl = nullIfBlank(clean(body.cateringOrderUrl, 300));
  const minimum = optionalInteger(body.cateringOrderMinimumCents, "cateringOrderMinimumCents", 0, 100000000);
  const notice = optionalInteger(body.advanceNoticeHours, "advanceNoticeHours", 0, 720);
  const notes = nullIfBlank(clean(body.cateringNotes, 1500));

  await env.DISPATCH_DB.prepare(
    `INSERT INTO restaurant_catering_profiles
      (onboarding_id, offers_catering, catering_order_url, catering_order_minimum_cents, advance_notice_hours, catering_notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(onboarding_id) DO UPDATE SET
       offers_catering = excluded.offers_catering,
       catering_order_url = excluded.catering_order_url,
       catering_order_minimum_cents = excluded.catering_order_minimum_cents,
       advance_notice_hours = excluded.advance_notice_hours,
       catering_notes = excluded.catering_notes,
       updated_at = CURRENT_TIMESTAMP`
  ).bind(onboarding.id, offers, orderUrl, minimum, notice, notes).run();

  return json({ success: true, catering: publicRow(await profileByToken(env, token)) });
}

async function listProfiles(request, env) {
  requireDb(env);
  if (!isAdmin(request, env)) return json({ error: "Unauthorized" }, 401);
  const result = await env.DISPATCH_DB.prepare(
    `SELECT o.id AS onboarding_id, o.restaurant_name, o.contact_name, o.email, o.phone, o.status,
            c.offers_catering, c.catering_order_url, c.catering_order_minimum_cents,
            c.delivery_base_fee_cents, c.delivery_included_miles, c.delivery_per_mile_cents,
            c.large_order_surcharge_cents, c.advance_notice_hours, c.catering_notes, c.updated_at
     FROM restaurant_onboarding o
     JOIN restaurant_catering_profiles c ON c.onboarding_id = o.id
     WHERE c.offers_catering = 1
     ORDER BY c.updated_at DESC, o.restaurant_name ASC
     LIMIT 250`
  ).all();
  return json({ success: true, count: result.results?.length || 0, restaurants: (result.results || []).map(adminRow) });
}

async function updatePricing(request, env) {
  requireDb(env);
  if (!isAdmin(request, env)) return json({ error: "Unauthorized" }, 401);
  const body = await requestJson(request);
  const onboardingId = Number(body.onboardingId || 0);
  if (!Number.isInteger(onboardingId) || onboardingId <= 0) return json({ error: "Valid onboardingId is required" }, 400);

  const baseFee = optionalInteger(body.deliveryBaseFeeCents, "deliveryBaseFeeCents", 0, 10000000);
  const includedMiles = optionalNumber(body.deliveryIncludedMiles, "deliveryIncludedMiles", 0, 500);
  const perMile = optionalInteger(body.deliveryPerMileCents, "deliveryPerMileCents", 0, 1000000);
  const surcharge = optionalInteger(body.largeOrderSurchargeCents, "largeOrderSurchargeCents", 0, 10000000);

  const existing = await env.DISPATCH_DB.prepare(
    "SELECT onboarding_id FROM restaurant_catering_profiles WHERE onboarding_id = ? AND offers_catering = 1 LIMIT 1"
  ).bind(onboardingId).first();
  if (!existing) return json({ error: "Catering profile not found" }, 404);

  await env.DISPATCH_DB.prepare(
    `UPDATE restaurant_catering_profiles
     SET delivery_base_fee_cents = ?, delivery_included_miles = ?, delivery_per_mile_cents = ?,
         large_order_surcharge_cents = ?, updated_at = CURRENT_TIMESTAMP
     WHERE onboarding_id = ?`
  ).bind(baseFee, includedMiles, perMile, surcharge, onboardingId).run();

  const row = await profileByOnboardingId(env, onboardingId);
  return json({ success: true, restaurant: adminRow(row) });
}

async function profileByToken(env, token) {
  return await env.DISPATCH_DB.prepare(
    `SELECT o.id AS onboarding_id, o.restaurant_name, o.contact_name, o.email, o.phone, o.status, o.public_token,
            c.offers_catering, c.catering_order_url, c.catering_order_minimum_cents,
            c.delivery_base_fee_cents, c.delivery_included_miles, c.delivery_per_mile_cents,
            c.large_order_surcharge_cents, c.advance_notice_hours, c.catering_notes, c.updated_at
     FROM restaurant_onboarding o
     LEFT JOIN restaurant_catering_profiles c ON c.onboarding_id = o.id
     WHERE o.public_token = ? LIMIT 1`
  ).bind(token).first();
}

async function profileByOnboardingId(env, id) {
  return await env.DISPATCH_DB.prepare(
    `SELECT o.id AS onboarding_id, o.restaurant_name, o.contact_name, o.email, o.phone, o.status,
            c.offers_catering, c.catering_order_url, c.catering_order_minimum_cents,
            c.delivery_base_fee_cents, c.delivery_included_miles, c.delivery_per_mile_cents,
            c.large_order_surcharge_cents, c.advance_notice_hours, c.catering_notes, c.updated_at
     FROM restaurant_onboarding o
     JOIN restaurant_catering_profiles c ON c.onboarding_id = o.id
     WHERE o.id = ? LIMIT 1`
  ).bind(id).first();
}

function publicRow(row) {
  return {
    onboardingId: row.onboarding_id,
    restaurantName: row.restaurant_name,
    offersCatering: Boolean(row.offers_catering),
    cateringOrderUrl: row.catering_order_url || null,
    cateringOrderMinimumCents: row.catering_order_minimum_cents ?? null,
    advanceNoticeHours: row.advance_notice_hours ?? null,
    cateringNotes: row.catering_notes || null,
    deliveryPricing: {
      baseFeeCents: row.delivery_base_fee_cents ?? null,
      includedMiles: row.delivery_included_miles ?? null,
      perMileCents: row.delivery_per_mile_cents ?? null,
      largeOrderSurchargeCents: row.large_order_surcharge_cents ?? null,
      summary: priceSummary(row)
    },
    updatedAt: row.updated_at || null
  };
}

function adminRow(row) {
  return { ...publicRow(row), contactName: row.contact_name || null, email: row.email || null, phone: row.phone || null, onboardingStatus: row.status || null };
}

function priceSummary(row) {
  if (row.delivery_base_fee_cents == null && row.delivery_per_mile_cents == null) return "Catering delivery price not set yet.";
  const parts = [];
  if (row.delivery_base_fee_cents != null) parts.push(`$${(Number(row.delivery_base_fee_cents) / 100).toFixed(2)} base delivery`);
  if (row.delivery_included_miles != null) parts.push(`${Number(row.delivery_included_miles)} miles included`);
  if (row.delivery_per_mile_cents != null) parts.push(`$${(Number(row.delivery_per_mile_cents) / 100).toFixed(2)}/mile after included miles`);
  if (row.large_order_surcharge_cents != null) parts.push(`$${(Number(row.large_order_surcharge_cents) / 100).toFixed(2)} large-order handling`);
  return parts.join(" · ");
}

function isAdmin(request, env) {
  if (!env.ADMIN_API_KEY) return false;
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const headerKey = request.headers.get("x-admin-key") || "";
  return bearer === env.ADMIN_API_KEY || headerKey === env.ADMIN_API_KEY;
}

function requireDb(env) { if (!env.DISPATCH_DB) throw new Error("Dispatch database is not bound"); }
function clean(value, max = 500) { return String(value ?? "").trim().slice(0, max); }
function nullIfBlank(value) { return value ? value : null; }
function optionalInteger(value, name, min, max) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} is invalid`);
  return n;
}
function optionalNumber(value, name, min, max) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${name} is invalid`);
  return Math.round(n * 100) / 100;
}
async function requestJson(request) {
  if (!(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) throw new Error("Content-Type must be application/json");
  return await request.json();
}
function corsHeaders() { return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Key", "Cache-Control": "no-store" }; }
function json(data, status = 200) { return new Response(JSON.stringify(data, null, 2), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() } }); }
function html(content, status = 200) { return new Response(content, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } }); }
function esc(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]); }

function publicPage() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Catering | Courier Eats</title><style>${css()}</style></head><body><main><h1>Courier Eats Catering</h1><p>Tell us whether your restaurant offers catering. Lewiston Courier Service sets the delivery price separately.</p><section class="card"><label>Onboarding tracking token<input id="token"></label><button id="load">Load restaurant</button><div id="status"></div></section><form id="form" class="card" hidden><h2 id="name"></h2><label><input id="offers" type="checkbox"> We offer catering</label><label>Catering ordering/menu URL<input id="url" placeholder="https://"></label><label>Minimum catering order ($)<input id="minimum" type="number" min="0" step="0.01"></label><label>Advance notice (hours)<input id="notice" type="number" min="0" max="720"></label><label>Catering notes<textarea id="notes" rows="4"></textarea></label><button>Save catering profile</button><div id="pricing"></div></form></main><script>
const q=new URLSearchParams(location.search); const token=document.getElementById('token'); token.value=q.get('token')||''; const form=document.getElementById('form'); const status=document.getElementById('status');
const money=v=>v==null?'':(Number(v)/100).toFixed(2);
async function load(){const t=token.value.trim(); if(!t)return; const r=await fetch('/api/restaurants/onboarding/catering?token='+encodeURIComponent(t)); const d=await r.json(); if(!r.ok){status.textContent=d.error||'Unable to load';return;} const c=d.catering; document.getElementById('name').textContent=c.restaurantName; document.getElementById('offers').checked=c.offersCatering; document.getElementById('url').value=c.cateringOrderUrl||''; document.getElementById('minimum').value=money(c.cateringOrderMinimumCents); document.getElementById('notice').value=c.advanceNoticeHours??''; document.getElementById('notes').value=c.cateringNotes||''; document.getElementById('pricing').textContent='LCS delivery pricing: '+c.deliveryPricing.summary; form.hidden=false; history.replaceState(null,'','?token='+encodeURIComponent(t));}
document.getElementById('load').onclick=load; form.onsubmit=async e=>{e.preventDefault(); const payload={token:token.value.trim(),offersCatering:document.getElementById('offers').checked,cateringOrderUrl:document.getElementById('url').value,cateringOrderMinimumCents:document.getElementById('minimum').value===''?null:Math.round(Number(document.getElementById('minimum').value)*100),advanceNoticeHours:document.getElementById('notice').value===''?null:Number(document.getElementById('notice').value),cateringNotes:document.getElementById('notes').value}; const r=await fetch('/api/restaurants/onboarding/catering',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); const d=await r.json(); status.textContent=r.ok?'Catering profile saved.':(d.error||d.message||'Unable to save'); if(r.ok)load();}; if(token.value)load();
</script></body></html>`;
}

function adminPage() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Catering Admin | Courier Eats</title><style>${css()}</style></head><body><main><h1>Catering delivery pricing</h1><section class="card"><label>Admin API key<input id="key" type="password"></label><button id="load">Load catering restaurants</button></section><div id="apps"></div></main><script>
const key=document.getElementById('key'); key.value=sessionStorage.getItem('courierEatsAdminKey')||''; const apps=document.getElementById('apps'); const dollars=v=>v==null?'':(Number(v)/100).toFixed(2);
async function api(method,body){sessionStorage.setItem('courierEatsAdminKey',key.value.trim()); const r=await fetch('/api/admin/restaurants/onboarding/catering',{method,headers:{'x-admin-key':key.value.trim(),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'}); const d=await r.json(); if(!r.ok)throw new Error(d.error||'Request failed'); return d;}
function card(r){return '<section class="card" data-id="'+r.onboardingId+'"><h2>'+esc(r.restaurantName)+'</h2><p>'+esc(r.contactName||'')+'</p><p>Minimum catering order: $'+esc(dollars(r.cateringOrderMinimumCents)||'not set')+'</p><label>Base delivery fee ($)<input data-base type="number" min="0" step="0.01" value="'+dollars(r.deliveryPricing.baseFeeCents)+'"></label><label>Included miles<input data-miles type="number" min="0" step="0.1" value="'+(r.deliveryPricing.includedMiles??'')+'"></label><label>Per-mile charge after included miles ($)<input data-milefee type="number" min="0" step="0.01" value="'+dollars(r.deliveryPricing.perMileCents)+'"></label><label>Large-order handling fee ($)<input data-large type="number" min="0" step="0.01" value="'+dollars(r.deliveryPricing.largeOrderSurchargeCents)+'"></label><button data-save>Save pricing</button><p>'+esc(r.deliveryPricing.summary)+'</p></section>';}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function load(){try{const d=await api('GET'); apps.innerHTML=d.restaurants.map(card).join('')||'<section class="card">No catering restaurants yet.</section>'; document.querySelectorAll('[data-save]').forEach(b=>b.onclick=save);}catch(e){apps.innerHTML='<section class="card">'+esc(e.message)+'</section>';}}
async function save(e){const c=e.target.closest('[data-id]'); const cents=sel=>{const v=c.querySelector(sel).value; return v===''?null:Math.round(Number(v)*100)}; await api('POST',{onboardingId:Number(c.dataset.id),deliveryBaseFeeCents:cents('[data-base]'),deliveryIncludedMiles:c.querySelector('[data-miles]').value===''?null:Number(c.querySelector('[data-miles]').value),deliveryPerMileCents:cents('[data-milefee]'),largeOrderSurchargeCents:cents('[data-large]')}); await load();}
document.getElementById('load').onclick=load;
</script></body></html>`;
}

function css() { return `:root{font-family:Inter,system-ui,sans-serif;color:#171717;background:#f5f5f5}*{box-sizing:border-box}body{margin:0}main{width:min(900px,calc(100% - 28px));margin:auto;padding:28px 0 56px}.card{background:#fff;border:1px solid #ddd;border-radius:18px;padding:22px;margin:16px 0}label{display:grid;gap:7px;margin:12px 0;font-weight:650}input,textarea{width:100%;font:inherit;padding:11px 12px;border:1px solid #bbb;border-radius:10px}button{border:0;border-radius:11px;padding:12px 17px;background:#171717;color:#fff;font-weight:800;cursor:pointer}`; }
