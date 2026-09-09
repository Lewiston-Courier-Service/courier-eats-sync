import { handleRestaurantOnboarding } from "./restaurant-onboarding.js";

const ONBOARDING_ROUTE = "/restaurant-onboarding";
const SUBMIT_ROUTE = "/api/restaurants/onboarding";
const STATUS_ROUTE = "/api/restaurants/onboarding/status";
const ADMIN_LIST_ROUTE = "/api/admin/restaurants/onboarding";
const ADMIN_UPDATE_ROUTE = "/api/admin/restaurants/onboarding/update";

const SERVICE_MODES = new Set(["BOTH", "DELIVERY", "PICKUP"]);
const MENU_SOURCES = new Set(["SQUARE", "WEBSITE", "PDF", "MANUAL", "OTHER"]);
const ORDER_CONTACT_METHODS = new Set(["POS", "TABLET", "TEXT", "EMAIL", "PHONE", "OTHER"]);

export async function handleRestaurantOnboardingOperations(request, env, ctx) {
  const url = new URL(request.url);

  if (url.pathname === SUBMIT_ROUTE && request.method === "POST") {
    return await submitWithOperations(request, env, ctx);
  }

  if (url.pathname === STATUS_ROUTE && request.method === "GET") {
    const response = await handleRestaurantOnboarding(request, env, ctx);
    return await enrichStatusResponse(response, url, env);
  }

  if (url.pathname === ADMIN_LIST_ROUTE && request.method === "GET") {
    const response = await handleRestaurantOnboarding(request, env, ctx);
    return await enrichAdminListResponse(response, env);
  }

  if (url.pathname === ADMIN_UPDATE_ROUTE && request.method === "POST") {
    return await adminUpdateWithOperations(request, env, ctx);
  }

  const response = await handleRestaurantOnboarding(request, env, ctx);
  if (!response) return null;

  if (url.pathname === ONBOARDING_ROUTE && request.method === "GET") {
    return await enhanceOnboardingPage(response);
  }

  return response;
}

async function submitWithOperations(request, env, ctx) {
  if (!env.DISPATCH_DB) {
    return json({ error: "Dispatch database is not bound" }, 500);
  }

  let body;
  try {
    body = await request.clone().json();
  } catch {
    return json({ error: "Valid JSON is required" }, 400);
  }

  if (clean(body.businessFax, 200)) {
    return json({ error: "Unable to submit restaurant" }, 400);
  }

  const parsed = parseOperationalFields(body);
  if (parsed.error) return json({ error: parsed.error }, 400);

  if (parsed.submissionKey) {
    const existing = await env.DISPATCH_DB
      .prepare(
        `SELECT id, public_token, restaurant_name, pos_provider, status, square_merchant_id
         FROM restaurant_onboarding
         WHERE submission_key = ?
         LIMIT 1`
      )
      .bind(parsed.submissionKey)
      .first();

    if (existing) {
      return existingSubmissionResponse(request, existing);
    }
  }

  const response = await handleRestaurantOnboarding(request, env, ctx);
  if (!response || !response.ok) return response;

  const data = await response.clone().json();
  const onboardingId = Number(data.onboardingId || 0);
  if (!Number.isInteger(onboardingId) || onboardingId <= 0) return response;

  try {
    await env.DISPATCH_DB
      .prepare(
        `UPDATE restaurant_onboarding
         SET service_mode = ?,
             prep_time_minutes = ?,
             restaurant_hours = ?,
             pickup_instructions = ?,
             menu_source = ?,
             menu_url = ?,
             location_count = ?,
             order_contact_method = ?,
             special_instructions = ?,
             submission_key = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(
        parsed.serviceMode,
        parsed.prepTimeMinutes,
        parsed.restaurantHours,
        parsed.pickupInstructions,
        parsed.menuSource,
        parsed.menuUrl,
        parsed.locationCount,
        parsed.orderContactMethod,
        parsed.specialInstructions,
        parsed.submissionKey,
        onboardingId
      )
      .run();
  } catch (error) {
    if (parsed.submissionKey) {
      const existing = await env.DISPATCH_DB
        .prepare(
          `SELECT id, public_token, restaurant_name, pos_provider, status, square_merchant_id
           FROM restaurant_onboarding
           WHERE submission_key = ?
           LIMIT 1`
        )
        .bind(parsed.submissionKey)
        .first();
      if (existing) return existingSubmissionResponse(request, existing);
    }
    throw error;
  }

  return replaceJsonResponse(response, {
    ...data,
    serviceMode: parsed.serviceMode,
    prepTimeMinutes: parsed.prepTimeMinutes,
    locationCount: parsed.locationCount,
    menuSource: parsed.menuSource,
    orderContactMethod: parsed.orderContactMethod
  });
}

async function enrichStatusResponse(response, url, env) {
  if (!response || !response.ok || !env.DISPATCH_DB) return response;

  const token = clean(url.searchParams.get("token"), 120);
  if (!token) return response;

  const row = await env.DISPATCH_DB
    .prepare(
      `SELECT service_mode, prep_time_minutes, restaurant_hours, pickup_instructions,
              menu_source, menu_url, location_count, order_contact_method, special_instructions
       FROM restaurant_onboarding
       WHERE public_token = ?
       LIMIT 1`
    )
    .bind(token)
    .first();

  if (!row) return response;
  const data = await response.clone().json();
  return replaceJsonResponse(response, { ...data, ...operationalRow(row) });
}

async function enrichAdminListResponse(response, env) {
  if (!response || !response.ok || !env.DISPATCH_DB) return response;
  const data = await response.clone().json();
  const restaurants = Array.isArray(data.restaurants) ? data.restaurants : [];
  const ids = restaurants.map(item => Number(item.id)).filter(id => Number.isInteger(id) && id > 0);
  if (!ids.length) return response;

  const placeholders = ids.map(() => "?").join(",");
  const result = await env.DISPATCH_DB
    .prepare(
      `SELECT id, service_mode, prep_time_minutes, restaurant_hours, pickup_instructions,
              menu_source, menu_url, location_count, order_contact_method, special_instructions
       FROM restaurant_onboarding
       WHERE id IN (${placeholders})`
    )
    .bind(...ids)
    .all();

  const byId = new Map((result.results || []).map(row => [Number(row.id), row]));
  data.restaurants = restaurants.map(item => {
    const row = byId.get(Number(item.id));
    return row ? { ...item, ...operationalRow(row) } : item;
  });

  return replaceJsonResponse(response, data);
}

async function adminUpdateWithOperations(request, env, ctx) {
  let body;
  try {
    body = await request.clone().json();
  } catch {
    return json({ error: "Valid JSON is required" }, 400);
  }

  const response = await handleRestaurantOnboarding(request, env, ctx);
  if (!response || !response.ok || !env.DISPATCH_DB) return response;

  const id = Number(body.id || 0);
  if (!Number.isInteger(id) || id <= 0) return response;

  const existing = await env.DISPATCH_DB
    .prepare("SELECT * FROM restaurant_onboarding WHERE id = ? LIMIT 1")
    .bind(id)
    .first();
  if (!existing) return response;

  const merged = {
    serviceMode: Object.prototype.hasOwnProperty.call(body, "serviceMode") ? body.serviceMode : existing.service_mode,
    prepTimeMinutes: Object.prototype.hasOwnProperty.call(body, "prepTimeMinutes") ? body.prepTimeMinutes : existing.prep_time_minutes,
    restaurantHours: Object.prototype.hasOwnProperty.call(body, "restaurantHours") ? body.restaurantHours : existing.restaurant_hours,
    pickupInstructions: Object.prototype.hasOwnProperty.call(body, "pickupInstructions") ? body.pickupInstructions : existing.pickup_instructions,
    menuSource: Object.prototype.hasOwnProperty.call(body, "menuSource") ? body.menuSource : existing.menu_source,
    menuUrl: Object.prototype.hasOwnProperty.call(body, "menuUrl") ? body.menuUrl : existing.menu_url,
    locationCount: Object.prototype.hasOwnProperty.call(body, "locationCount") ? body.locationCount : existing.location_count,
    orderContactMethod: Object.prototype.hasOwnProperty.call(body, "orderContactMethod") ? body.orderContactMethod : existing.order_contact_method,
    specialInstructions: Object.prototype.hasOwnProperty.call(body, "specialInstructions") ? body.specialInstructions : existing.special_instructions,
    submissionKey: existing.submission_key
  };

  const parsed = parseOperationalFields(merged, { requireSubmissionKey: false });
  if (parsed.error) return json({ error: parsed.error }, 400);

  await env.DISPATCH_DB
    .prepare(
      `UPDATE restaurant_onboarding
       SET service_mode = ?, prep_time_minutes = ?, restaurant_hours = ?, pickup_instructions = ?,
           menu_source = ?, menu_url = ?, location_count = ?, order_contact_method = ?,
           special_instructions = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .bind(
      parsed.serviceMode,
      parsed.prepTimeMinutes,
      parsed.restaurantHours,
      parsed.pickupInstructions,
      parsed.menuSource,
      parsed.menuUrl,
      parsed.locationCount,
      parsed.orderContactMethod,
      parsed.specialInstructions,
      id
    )
    .run();

  const updated = await env.DISPATCH_DB
    .prepare(
      `SELECT service_mode, prep_time_minutes, restaurant_hours, pickup_instructions,
              menu_source, menu_url, location_count, order_contact_method, special_instructions
       FROM restaurant_onboarding WHERE id = ? LIMIT 1`
    )
    .bind(id)
    .first();

  const data = await response.clone().json();
  return replaceJsonResponse(response, {
    ...data,
    restaurant: data.restaurant ? { ...data.restaurant, ...operationalRow(updated || {}) } : data.restaurant
  });
}

function parseOperationalFields(body, options = {}) {
  const serviceMode = clean(body.serviceMode, 20).toUpperCase() || "BOTH";
  const menuSource = clean(body.menuSource, 30).toUpperCase() || "OTHER";
  const orderContactMethod = clean(body.orderContactMethod, 30).toUpperCase() || "OTHER";
  const restaurantHours = nullIfBlank(clean(body.restaurantHours, 3000));
  const pickupInstructions = nullIfBlank(clean(body.pickupInstructions, 1500));
  const menuUrl = nullIfBlank(clean(body.menuUrl, 500));
  const specialInstructions = nullIfBlank(clean(body.specialInstructions, 2000));
  const submissionKey = nullIfBlank(clean(body.submissionKey, 120));

  if (!SERVICE_MODES.has(serviceMode)) return { error: "Unsupported pickup/delivery selection" };
  if (!MENU_SOURCES.has(menuSource)) return { error: "Unsupported menu source" };
  if (!ORDER_CONTACT_METHODS.has(orderContactMethod)) return { error: "Unsupported primary order contact method" };
  if (menuUrl && !isHttpUrl(menuUrl)) return { error: "Menu URL must start with http:// or https://" };

  const prepTimeMinutes = optionalInteger(body.prepTimeMinutes, 0, 240);
  if (prepTimeMinutes.error) return { error: "Prep time must be a whole number from 0 to 240 minutes" };

  const locationCount = optionalInteger(body.locationCount ?? 1, 1, 500);
  if (locationCount.error) return { error: "Location count must be a whole number from 1 to 500" };

  if (options.requireSubmissionKey !== false && submissionKey && submissionKey.length < 16) {
    return { error: "Invalid submission key" };
  }

  return {
    serviceMode,
    prepTimeMinutes: prepTimeMinutes.value,
    restaurantHours,
    pickupInstructions,
    menuSource,
    menuUrl,
    locationCount: locationCount.value ?? 1,
    orderContactMethod,
    specialInstructions,
    submissionKey
  };
}

function operationalRow(row) {
  return {
    serviceMode: row.service_mode || "BOTH",
    prepTimeMinutes: row.prep_time_minutes ?? null,
    restaurantHours: row.restaurant_hours || null,
    pickupInstructions: row.pickup_instructions || null,
    menuSource: row.menu_source || null,
    menuUrl: row.menu_url || null,
    locationCount: row.location_count ?? 1,
    orderContactMethod: row.order_contact_method || null,
    specialInstructions: row.special_instructions || null
  };
}

async function enhanceOnboardingPage(response) {
  if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return response;
  let body = await response.text();

  const fields = `
    <h2>Operations</h2>
    <div class="grid two">
      <label>Pickup / delivery
        <select name="serviceMode">
          <option value="BOTH">Pickup and delivery</option>
          <option value="DELIVERY">Delivery only</option>
          <option value="PICKUP">Pickup only</option>
        </select>
      </label>
      <label>Typical prep time (minutes)<input name="prepTimeMinutes" type="number" min="0" max="240" step="1" placeholder="20"></label>
      <label>Number of locations<input name="locationCount" type="number" min="1" max="500" step="1" value="1"></label>
      <label>Primary order contact method
        <select name="orderContactMethod">
          <option value="POS">POS</option>
          <option value="TABLET">Tablet</option>
          <option value="TEXT">Text</option>
          <option value="EMAIL">Email</option>
          <option value="PHONE">Phone</option>
          <option value="OTHER">Other / not sure</option>
        </select>
      </label>
      <label>Menu source
        <select name="menuSource">
          <option value="SQUARE">Square catalog</option>
          <option value="WEBSITE">Website</option>
          <option value="PDF">PDF / menu link</option>
          <option value="MANUAL">Manual menu</option>
          <option value="OTHER">Other / not sure</option>
        </select>
      </label>
      <label>Menu URL<input name="menuUrl" type="url" maxlength="500" placeholder="https://"></label>
      <label class="wide">Restaurant hours<textarea name="restaurantHours" maxlength="3000" rows="4" placeholder="Example: Mon–Thu 11am–9pm; Fri–Sat 11am–10pm; Sun 12pm–8pm"></textarea></label>
      <label class="wide">Pickup instructions<textarea name="pickupInstructions" maxlength="1500" rows="3" placeholder="Parking, pickup door, counter, who the driver should ask for, or other driver instructions."></textarea></label>
      <label class="wide">Special instructions<textarea name="specialInstructions" maxlength="2000" rows="3" placeholder="Catering, large orders, restricted items, packaging, or anything else Courier Eats should know."></textarea></label>
    </div>
    <input name="businessFax" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden">
`;

  body = body.replace("    <label>Integration notes", `${fields}\n    <label>Integration notes`);
  body = body.replace(
    "    deliveryPlatforms: fd.getAll('deliveryPlatforms'),\n    integrationNotes: fd.get('integrationNotes'),",
    "    deliveryPlatforms: fd.getAll('deliveryPlatforms'),\n    serviceMode: fd.get('serviceMode'),\n    prepTimeMinutes: fd.get('prepTimeMinutes'),\n    locationCount: fd.get('locationCount'),\n    orderContactMethod: fd.get('orderContactMethod'),\n    menuSource: fd.get('menuSource'),\n    menuUrl: fd.get('menuUrl'),\n    restaurantHours: fd.get('restaurantHours'),\n    pickupInstructions: fd.get('pickupInstructions'),\n    specialInstructions: fd.get('specialInstructions'),\n    businessFax: fd.get('businessFax'),\n    submissionKey: sessionStorage.getItem('courierEatsOnboardingSubmissionKey') || '',\n    integrationNotes: fd.get('integrationNotes'),"
  );
  body = body.replace(
    "form.addEventListener('submit', async event => {",
    "if (!sessionStorage.getItem('courierEatsOnboardingSubmissionKey')) { sessionStorage.setItem('courierEatsOnboardingSubmissionKey', crypto.randomUUID()); }\n\nform.addEventListener('submit', async event => {"
  );
  body = body.replace(
    "    history.replaceState(null, '', '/restaurant-onboarding?token=' + encodeURIComponent(data.token));",
    "    sessionStorage.removeItem('courierEatsOnboardingSubmissionKey');\n    history.replaceState(null, '', '/restaurant-onboarding?token=' + encodeURIComponent(data.token));"
  );
  body = body.replace(
    "  form.reset();\n});",
    "  form.reset();\n  sessionStorage.setItem('courierEatsOnboardingSubmissionKey', crypto.randomUUID());\n});"
  );

  return new Response(body, {
    status: response.status,
    headers: response.headers
  });
}

function existingSubmissionResponse(request, row) {
  const origin = new URL(request.url).origin;
  const token = row.public_token;
  return json({
    success: true,
    duplicateRetry: true,
    onboardingId: Number(row.id),
    token,
    restaurantName: row.restaurant_name,
    posProvider: row.pos_provider,
    status: row.status,
    statusUrl: `${origin}${ONBOARDING_ROUTE}?token=${encodeURIComponent(token)}`,
    squareConnectUrl:
      row.pos_provider === "SQUARE" && !row.square_merchant_id
        ? `${origin}/api/restaurants/onboarding/square/start?token=${encodeURIComponent(token)}`
        : null
  }, 200);
}

function optionalInteger(value, min, max) {
  if (value === null || value === undefined || value === "") return { value: null };
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) return { error: true };
  return { value: number };
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function clean(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function nullIfBlank(value) {
  const text = clean(value, 5000);
  return text || null;
}

function replaceJsonResponse(response, data) {
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data, null, 2), {
    status: response.status,
    headers
  });
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
