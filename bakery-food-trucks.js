import { handleRestaurantOnboardingOperations } from "./restaurant-onboarding-operations.js";

const BAKERY_PAGE = "/bakery";
const FOOD_TRUCK_PAGE = "/food-trucks";
const FOOD_TRUCK_LOCATIONS_PAGE = "/restaurant-onboarding/food-truck-locations";
const BAKERY_API = "/api/sections/bakery";
const FOOD_TRUCK_API = "/api/sections/food-trucks";
const FOOD_TRUCK_LOCATIONS_API = "/api/restaurants/onboarding/food-truck-locations";
const ONBOARDING_ROUTE = "/restaurant-onboarding";
const SUBMIT_ROUTE = "/api/restaurants/onboarding";
const STATUS_ROUTE = "/api/restaurants/onboarding/status";
const ADMIN_LIST_ROUTE = "/api/admin/restaurants/onboarding";

const BUSINESS_TYPES = new Set(["RESTAURANT", "BAKERY", "FOOD_TRUCK"]);
const DAYS = new Set(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY", "VARIES"]);

export async function handleBakeryFoodTrucks(request, env, ctx) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS" && [BAKERY_API, FOOD_TRUCK_API, FOOD_TRUCK_LOCATIONS_API].includes(url.pathname)) {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (url.pathname === BAKERY_PAGE && request.method === "GET") return html(sectionPage("Bakery", BAKERY_API));
  if (url.pathname === FOOD_TRUCK_PAGE && request.method === "GET") return html(foodTruckBrowsePage());
  if (url.pathname === FOOD_TRUCK_LOCATIONS_PAGE && request.method === "GET") return html(foodTruckLocationsPage());
  if (url.pathname === BAKERY_API && request.method === "GET") return await listBakery(env);
  if (url.pathname === FOOD_TRUCK_API && request.method === "GET") return await listFoodTrucks(env);
  if (url.pathname === FOOD_TRUCK_LOCATIONS_API && request.method === "GET") return await getFoodTruckLocations(url, env);
  if (url.pathname === FOOD_TRUCK_LOCATIONS_API && request.method === "POST") return await saveFoodTruckLocations(request, env);

  if (url.pathname === SUBMIT_ROUTE && request.method === "POST") {
    return await submitBusinessType(request, env, ctx);
  }

  if (url.pathname === STATUS_ROUTE && request.method === "GET") {
    const response = await handleRestaurantOnboardingOperations(request, env, ctx);
    return await enrichStatus(response, url, env);
  }

  if (url.pathname === ADMIN_LIST_ROUTE && request.method === "GET") {
    const response = await handleRestaurantOnboardingOperations(request, env, ctx);
    return await enrichAdminList(response, env);
  }

  const response = await handleRestaurantOnboardingOperations(request, env, ctx);
  if (!response) return null;

  if (url.pathname === ONBOARDING_ROUTE && request.method === "GET") {
    return await enhanceOnboardingPage(response);
  }

  return response;
}

async function submitBusinessType(request, env, ctx) {
  requireDb(env);
  let body;
  try {
    body = await request.clone().json();
  } catch {
    return json({ error: "Valid JSON is required" }, 400);
  }

  const businessType = clean(body.businessType, 30).toUpperCase() || "RESTAURANT";
  if (!BUSINESS_TYPES.has(businessType)) return json({ error: "Unsupported business type" }, 400);

  let locations = [];
  if (businessType === "FOOD_TRUCK") {
    const parsed = parseLocations(body.foodTruckLocations);
    if (parsed.error) return json({ error: parsed.error }, 400);
    locations = parsed.locations;
  }

  const response = await handleRestaurantOnboardingOperations(request, env, ctx);
  if (!response || !response.ok) return response;

  const data = await response.clone().json();
  const onboardingId = Number(data.onboardingId || 0);
  if (!Number.isInteger(onboardingId) || onboardingId <= 0) return response;

  await env.DISPATCH_DB.prepare(
    "UPDATE restaurant_onboarding SET business_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(businessType, onboardingId).run();

  if (businessType === "FOOD_TRUCK") {
    await replaceLocations(env, onboardingId, locations);
  }

  return replaceJsonResponse(response, {
    ...data,
    businessType,
    foodTruckLocations: businessType === "FOOD_TRUCK" ? locations : []
  });
}

async function enrichStatus(response, url, env) {
  if (!response || !response.ok || !env.DISPATCH_DB) return response;
  const token = clean(url.searchParams.get("token"), 120);
  if (!token) return response;

  const row = await env.DISPATCH_DB.prepare(
    "SELECT id, business_type FROM restaurant_onboarding WHERE public_token = ? LIMIT 1"
  ).bind(token).first();
  if (!row) return response;

  const data = await response.clone().json();
  const locations = row.business_type === "FOOD_TRUCK" ? await locationsFor(env, row.id) : [];
  return replaceJsonResponse(response, {
    ...data,
    businessType: row.business_type || "RESTAURANT",
    foodTruckLocations: locations,
    foodTruckLocationsUrl: row.business_type === "FOOD_TRUCK"
      ? `${url.origin}${FOOD_TRUCK_LOCATIONS_PAGE}?token=${encodeURIComponent(token)}`
      : null
  });
}

async function enrichAdminList(response, env) {
  if (!response || !response.ok || !env.DISPATCH_DB) return response;
  const data = await response.clone().json();
  const restaurants = Array.isArray(data.restaurants) ? data.restaurants : [];
  const ids = restaurants.map(r => Number(r.id)).filter(id => Number.isInteger(id) && id > 0);
  if (!ids.length) return response;

  const placeholders = ids.map(() => "?").join(",");
  const rows = await env.DISPATCH_DB.prepare(
    `SELECT id, business_type FROM restaurant_onboarding WHERE id IN (${placeholders})`
  ).bind(...ids).all();
  const types = new Map((rows.results || []).map(r => [Number(r.id), r.business_type || "RESTAURANT"]));

  data.restaurants = restaurants.map(r => ({ ...r, businessType: types.get(Number(r.id)) || "RESTAURANT" }));
  return replaceJsonResponse(response, data);
}

async function listBakery(env) {
  requireDb(env);
  const result = await env.DISPATCH_DB.prepare(
    `SELECT id, restaurant_name, city, state, postal_code, website, menu_url
     FROM restaurant_onboarding
     WHERE business_type = 'BAKERY' AND status = 'APPROVED'
     ORDER BY restaurant_name ASC
     LIMIT 250`
  ).all();
  return json({ section: "Bakery", count: result.results?.length || 0, businesses: result.results || [] });
}

async function listFoodTrucks(env) {
  requireDb(env);
  const result = await env.DISPATCH_DB.prepare(
    `SELECT id, restaurant_name, city, state, postal_code, website, menu_url
     FROM restaurant_onboarding
     WHERE business_type = 'FOOD_TRUCK' AND status = 'APPROVED'
     ORDER BY restaurant_name ASC
     LIMIT 250`
  ).all();

  const trucks = [];
  for (const row of result.results || []) {
    trucks.push({
      id: row.id,
      name: row.restaurant_name,
      homeCity: row.city || null,
      state: row.state || null,
      postalCode: row.postal_code || null,
      website: row.website || null,
      menuUrl: row.menu_url || null,
      locations: await locationsFor(env, row.id)
    });
  }
  return json({ section: "Food Trucks", count: trucks.length, businesses: trucks });
}

async function getFoodTruckLocations(url, env) {
  requireDb(env);
  const token = clean(url.searchParams.get("token"), 120);
  if (!token) return json({ error: "Missing onboarding token" }, 400);
  const truck = await env.DISPATCH_DB.prepare(
    "SELECT id, restaurant_name, business_type FROM restaurant_onboarding WHERE public_token = ? LIMIT 1"
  ).bind(token).first();
  if (!truck) return json({ error: "Onboarding application not found" }, 404);
  if (truck.business_type !== "FOOD_TRUCK") return json({ error: "This business is not set up as a food truck" }, 409);
  return json({ success: true, restaurantName: truck.restaurant_name, locations: await locationsFor(env, truck.id) });
}

async function saveFoodTruckLocations(request, env) {
  requireDb(env);
  const body = await requestJson(request);
  const token = clean(body.token, 120);
  if (!token) return json({ error: "Missing onboarding token" }, 400);

  const truck = await env.DISPATCH_DB.prepare(
    "SELECT id, restaurant_name, business_type FROM restaurant_onboarding WHERE public_token = ? LIMIT 1"
  ).bind(token).first();
  if (!truck) return json({ error: "Onboarding application not found" }, 404);
  if (truck.business_type !== "FOOD_TRUCK") return json({ error: "This business is not set up as a food truck" }, 409);

  const parsed = parseLocations(body.locations);
  if (parsed.error) return json({ error: parsed.error }, 400);
  await replaceLocations(env, truck.id, parsed.locations);
  return json({ success: true, restaurantName: truck.restaurant_name, locations: await locationsFor(env, truck.id) });
}

function parseLocations(value) {
  if (value == null) return { locations: [] };
  if (!Array.isArray(value)) return { error: "Food truck locations must be a list" };
  if (value.length > 25) return { error: "A food truck can save up to 25 locations/stops" };

  const locations = [];
  for (let i = 0; i < value.length; i += 1) {
    const item = value[i] || {};
    const locationName = clean(item.locationName, 160);
    if (!locationName) return { error: `Location ${i + 1} needs a name` };
    const dayOfWeek = clean(item.dayOfWeek, 20).toUpperCase() || "VARIES";
    if (!DAYS.has(dayOfWeek)) return { error: `Location ${i + 1} has an unsupported day` };
    const startTime = clean(item.startTime, 10) || null;
    const endTime = clean(item.endTime, 10) || null;
    if (startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) return { error: `Location ${i + 1} start time must use HH:MM` };
    if (endTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)) return { error: `Location ${i + 1} end time must use HH:MM` };
    locations.push({
      locationName,
      addressLine1: clean(item.addressLine1, 200) || null,
      city: clean(item.city, 100) || null,
      state: clean(item.state, 20).toUpperCase() || "ME",
      postalCode: clean(item.postalCode, 20) || null,
      dayOfWeek,
      startTime,
      endTime,
      notes: clean(item.notes, 800) || null,
      isPrimary: item.isPrimary === true
    });
  }
  return { locations };
}

async function replaceLocations(env, onboardingId, locations) {
  const statements = [
    env.DISPATCH_DB.prepare("DELETE FROM restaurant_food_truck_locations WHERE onboarding_id = ?").bind(onboardingId)
  ];
  locations.forEach((loc, index) => {
    statements.push(
      env.DISPATCH_DB.prepare(
        `INSERT INTO restaurant_food_truck_locations
          (onboarding_id, location_name, address_line_1, city, state, postal_code, day_of_week, start_time, end_time, notes, is_primary, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      ).bind(
        onboardingId,
        loc.locationName,
        loc.addressLine1,
        loc.city,
        loc.state,
        loc.postalCode,
        loc.dayOfWeek,
        loc.startTime,
        loc.endTime,
        loc.notes,
        loc.isPrimary || index === 0 ? 1 : 0
      )
    );
  });
  await env.DISPATCH_DB.batch(statements);
}

async function locationsFor(env, onboardingId) {
  const result = await env.DISPATCH_DB.prepare(
    `SELECT id, location_name, address_line_1, city, state, postal_code, day_of_week, start_time, end_time, notes, is_primary
     FROM restaurant_food_truck_locations
     WHERE onboarding_id = ?
     ORDER BY CASE day_of_week
       WHEN 'MONDAY' THEN 1 WHEN 'TUESDAY' THEN 2 WHEN 'WEDNESDAY' THEN 3 WHEN 'THURSDAY' THEN 4
       WHEN 'FRIDAY' THEN 5 WHEN 'SATURDAY' THEN 6 WHEN 'SUNDAY' THEN 7 ELSE 8 END,
       start_time, id`
  ).bind(onboardingId).all();
  return (result.results || []).map(row => ({
    id: row.id,
    locationName: row.location_name,
    addressLine1: row.address_line_1 || null,
    city: row.city || null,
    state: row.state || null,
    postalCode: row.postal_code || null,
    dayOfWeek: row.day_of_week || "VARIES",
    startTime: row.start_time || null,
    endTime: row.end_time || null,
    notes: row.notes || null,
    isPrimary: Boolean(row.is_primary)
  }));
}

async function enhanceOnboardingPage(response) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return response;
  let body = await response.text();

  const businessField = `
    <h2>Business type</h2>
    <label>What type of food business is this?
      <select name="businessType" id="businessType">
        <option value="RESTAURANT">Restaurant</option>
        <option value="BAKERY">Bakery</option>
        <option value="FOOD_TRUCK">Food truck</option>
      </select>
    </label>
`;
  body = body.replace("    <h2>Ordering / POS</h2>", `${businessField}\n    <h2>Ordering / POS</h2>`);

  const truckFields = `
    <fieldset id="foodTruckStops" hidden>
      <legend>Food truck locations / stops</legend>
      <p class="muted">Add recurring or regular stops. You can update these later as the truck moves.</p>
      <div id="foodTruckStopRows"></div>
      <button class="secondary" id="addFoodTruckStop" type="button">Add another location</button>
    </fieldset>
`;
  body = body.replace("    <label>Integration notes", `${truckFields}\n    <label>Integration notes`);

  body = body.replace(
    "    deliveryPlatforms: fd.getAll('deliveryPlatforms'),",
    "    deliveryPlatforms: fd.getAll('deliveryPlatforms'),\n    businessType: fd.get('businessType'),\n    foodTruckLocations: collectFoodTruckStops(),"
  );

  body = body.replace(
    "const params = new URLSearchParams(location.search);",
    `const businessType = document.getElementById('businessType');
const foodTruckStops = document.getElementById('foodTruckStops');
const foodTruckStopRows = document.getElementById('foodTruckStopRows');
const days = ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY','VARIES'];
function stopRow(data={}) { const wrap=document.createElement('div'); wrap.className='card food-truck-stop'; wrap.innerHTML='<div class="grid two"><label>Location name<input data-ft="locationName" maxlength="160" placeholder="Example: Kennedy Park" value="'+esc(data.locationName||'')+'"></label><label>Day<select data-ft="dayOfWeek">'+days.map(d=>'<option '+(d===(data.dayOfWeek||'VARIES')?'selected':'')+'>'+d+'</option>').join('')+'</select></label><label>Street / venue address<input data-ft="addressLine1" maxlength="200" value="'+esc(data.addressLine1||'')+'"></label><label>City<input data-ft="city" maxlength="100" value="'+esc(data.city||'Lewiston')+'"></label><label>State<input data-ft="state" maxlength="20" value="'+esc(data.state||'ME')+'"></label><label>ZIP<input data-ft="postalCode" maxlength="20" value="'+esc(data.postalCode||'')+'"></label><label>Start time<input data-ft="startTime" type="time" value="'+esc(data.startTime||'')+'"></label><label>End time<input data-ft="endTime" type="time" value="'+esc(data.endTime||'')+'"></label><label class="wide">Stop notes<input data-ft="notes" maxlength="800" placeholder="Seasonal dates, event name, parking lot, etc." value="'+esc(data.notes||'')+'"></label></div><button type="button" class="secondary" data-remove-stop>Remove location</button>'; wrap.querySelector('[data-remove-stop]').onclick=()=>wrap.remove(); return wrap; }
function addStop(data={}) { if(foodTruckStopRows.children.length>=25)return; foodTruckStopRows.appendChild(stopRow(data)); }
function collectFoodTruckStops(){ if(businessType.value!=='FOOD_TRUCK') return []; return [...foodTruckStopRows.querySelectorAll('.food-truck-stop')].map((row,index)=>{const get=n=>row.querySelector('[data-ft="'+n+'"]').value; return {locationName:get('locationName'),dayOfWeek:get('dayOfWeek'),addressLine1:get('addressLine1'),city:get('city'),state:get('state'),postalCode:get('postalCode'),startTime:get('startTime'),endTime:get('endTime'),notes:get('notes'),isPrimary:index===0};}).filter(x=>x.locationName.trim()); }
function syncBusinessType(){ foodTruckStops.hidden=businessType.value!=='FOOD_TRUCK'; if(businessType.value==='FOOD_TRUCK' && !foodTruckStopRows.children.length) addStop(); }
businessType.addEventListener('change',syncBusinessType); document.getElementById('addFoodTruckStop').onclick=()=>addStop(); syncBusinessType();

const params = new URLSearchParams(location.search);`
  );

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

function sectionPage(title, apiPath) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} | Courier Eats</title><style>${css()}</style></head><body><main><div class="brand">Courier Eats</div><h1>${title}</h1><p>Browse approved local ${title.toLowerCase()} businesses on Courier Eats.</p><div id="list" class="grid"></div></main><script>const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); fetch('${apiPath}',{cache:'no-store'}).then(r=>r.json()).then(d=>{document.getElementById('list').innerHTML=(d.businesses||[]).map(b=>'<section class="card"><h2>'+esc(b.restaurant_name||b.name)+'</h2><p>'+esc([b.city||b.homeCity,b.state].filter(Boolean).join(', '))+'</p>'+(b.menu_url||b.menuUrl?'<p><a href="'+esc(b.menu_url||b.menuUrl)+'">View menu</a></p>':'')+'</section>').join('')||'<section class="card">No approved businesses in this section yet.</section>';});</script></body></html>`;
}

function foodTruckBrowsePage() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Food Trucks | Courier Eats</title><style>${css()}</style></head><body><main><div class="brand">Courier Eats</div><h1>Food Trucks</h1><p>Find approved food trucks and their regular locations.</p><div id="list"></div></main><script>const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); fetch('${FOOD_TRUCK_API}',{cache:'no-store'}).then(r=>r.json()).then(d=>{document.getElementById('list').innerHTML=(d.businesses||[]).map(t=>'<section class="card"><h2>'+esc(t.name)+'</h2>'+((t.locations||[]).map(s=>'<div class="stop"><strong>'+esc(s.locationName)+'</strong><br>'+esc([s.addressLine1,s.city,s.state,s.postalCode].filter(Boolean).join(', '))+'<br>'+esc(s.dayOfWeek)+' '+esc(s.startTime||'')+(s.endTime?'–'+esc(s.endTime):'')+(s.notes?'<br>'+esc(s.notes):'')+'</div>').join('')||'<p>Current stop schedule not posted yet.</p>')+'</section>').join('')||'<section class="card">No approved food trucks yet.</section>';});</script></body></html>`;
}

function foodTruckLocationsPage() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Food Truck Locations | Courier Eats</title><style>${css()}</style></head><body><main><div class="brand">Courier Eats</div><h1>Food truck locations</h1><section class="card"><label>Private onboarding token<input id="token"></label><button id="load">Load locations</button><p id="msg"></p></section><form id="form" class="card" hidden><h2 id="name"></h2><textarea id="locations" rows="14" placeholder="One stop per line: Location | Address | City | State | ZIP | DAY | 11:00 | 14:00 | Notes"></textarea><p class="muted">Format: Location | Address | City | State | ZIP | DAY | start | end | notes</p><button>Save locations</button></form></main><script>const q=new URLSearchParams(location.search),token=document.getElementById('token'),form=document.getElementById('form'),msg=document.getElementById('msg'); token.value=q.get('token')||''; function line(s){return [s.locationName,s.addressLine1||'',s.city||'',s.state||'ME',s.postalCode||'',s.dayOfWeek||'VARIES',s.startTime||'',s.endTime||'',s.notes||''].join(' | ')} function parse(){return document.getElementById('locations').value.split('\n').map(x=>x.trim()).filter(Boolean).map((x,i)=>{const p=x.split('|').map(v=>v.trim());return {locationName:p[0],addressLine1:p[1],city:p[2],state:p[3],postalCode:p[4],dayOfWeek:p[5]||'VARIES',startTime:p[6],endTime:p[7],notes:p.slice(8).join(' | '),isPrimary:i===0};});} async function load(){const r=await fetch('${FOOD_TRUCK_LOCATIONS_API}?token='+encodeURIComponent(token.value.trim()));const d=await r.json();if(!r.ok){msg.textContent=d.error||'Unable to load';return;}document.getElementById('name').textContent=d.restaurantName;document.getElementById('locations').value=(d.locations||[]).map(line).join('\n');form.hidden=false;} document.getElementById('load').onclick=load;form.onsubmit=async e=>{e.preventDefault();const r=await fetch('${FOOD_TRUCK_LOCATIONS_API}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:token.value.trim(),locations:parse()})});const d=await r.json();msg.textContent=r.ok?'Locations saved.':(d.error||'Unable to save');if(r.ok)load();};if(token.value)load();</script></body></html>`;
}

function css() {
  return `:root{font-family:Inter,system-ui,sans-serif;color:#171717;background:#f5f5f5}*{box-sizing:border-box}body{margin:0}main{width:min(920px,calc(100% - 28px));margin:auto;padding:28px 0 56px}.brand{font-weight:900}.card{background:#fff;border:1px solid #ddd;border-radius:16px;padding:18px;margin:14px 0}.grid{display:grid;gap:14px}.stop{padding:12px 0;border-top:1px solid #eee}input,textarea,button{font:inherit}input,textarea{width:100%;padding:10px;border:1px solid #bbb;border-radius:9px}label{display:grid;gap:7px;margin:10px 0;font-weight:700}button{border:0;border-radius:9px;padding:11px 15px;font-weight:800;cursor:pointer}.muted{color:#666}`;
}

function requireDb(env) { if (!env.DISPATCH_DB) throw new Error("Dispatch database is not bound"); }
function clean(value, max = 500) { return String(value ?? "").trim().slice(0, max); }
async function requestJson(request) { if (!(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) throw new Error("Content-Type must be application/json"); return await request.json(); }
function corsHeaders() { return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Cache-Control": "no-store" }; }
function json(data, status = 200) { return new Response(JSON.stringify(data, null, 2), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() } }); }
function html(content, status = 200) { return new Response(content, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }); }
function replaceJsonResponse(response, data) { const headers=new Headers(response.headers);headers.set("Content-Type","application/json; charset=utf-8");headers.set("Cache-Control","no-store");return new Response(JSON.stringify(data,null,2),{status:response.status,statusText:response.statusText,headers}); }
