import { handleSquareMenuSync } from "./square-menu-sync.js";
import { handleSquareRestaurantConnector } from "./square-restaurant-connector.js";

const ONBOARDING_ROUTE = "/restaurant-onboarding";
const ADMIN_ROUTE = "/restaurant-onboarding/admin";
const SUBMIT_ROUTE = "/api/restaurants/onboarding";
const STATUS_ROUTE = "/api/restaurants/onboarding/status";
const SQUARE_START_ROUTE = "/api/restaurants/onboarding/square/start";
const ADMIN_LIST_ROUTE = "/api/admin/restaurants/onboarding";
const ADMIN_UPDATE_ROUTE = "/api/admin/restaurants/onboarding/update";
const SQUARE_CALLBACK_ROUTE = "/api/connect/square/callback";

const ALLOWED_POS = new Set([
  "SQUARE",
  "TOAST",
  "SKYTAB",
  "CLOVER",
  "CHOWNOW",
  "FACEBOOK",
  "OTHER",
  "NONE"
]);

const ALLOWED_STATUSES = new Set([
  "SUBMITTED",
  "CONNECTING_SQUARE",
  "CONNECTED",
  "APPROVED",
  "PAUSED",
  "REJECTED"
]);

export async function handleRestaurantOnboarding(request, env, ctx) {
  const url = new URL(request.url);

  if (url.pathname === SQUARE_CALLBACK_ROUTE && request.method === "GET") {
    return await finishLinkedSquareOnboarding(request, env, ctx);
  }

  const routes = new Set([
    ONBOARDING_ROUTE,
    ADMIN_ROUTE,
    SUBMIT_ROUTE,
    STATUS_ROUTE,
    SQUARE_START_ROUTE,
    ADMIN_LIST_ROUTE,
    ADMIN_UPDATE_ROUTE
  ]);

  if (!routes.has(url.pathname)) {
    return null;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  try {
    if (url.pathname === ONBOARDING_ROUTE && request.method === "GET") {
      return html(onboardingPage());
    }

    if (url.pathname === ADMIN_ROUTE && request.method === "GET") {
      return html(adminPage());
    }

    if (url.pathname === SUBMIT_ROUTE && request.method === "POST") {
      return await submitOnboarding(request, env);
    }

    if (url.pathname === STATUS_ROUTE && request.method === "GET") {
      return await onboardingStatus(url, env);
    }

    if (url.pathname === SQUARE_START_ROUTE && request.method === "GET") {
      return await startLinkedSquareOnboarding(request, env, ctx);
    }

    if (url.pathname === ADMIN_LIST_ROUTE && request.method === "GET") {
      return await adminListOnboarding(request, env, url);
    }

    if (url.pathname === ADMIN_UPDATE_ROUTE && request.method === "POST") {
      return await adminUpdateOnboarding(request, env);
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    console.error("Restaurant onboarding error:", error);
    return json(
      {
        error: "Restaurant onboarding error",
        message: error instanceof Error ? error.message : "Internal server error"
      },
      500
    );
  }
}

async function submitOnboarding(request, env) {
  if (!env.DISPATCH_DB) {
    return json({ error: "Dispatch database is not bound" }, 500);
  }

  const body = await requestJson(request);
  const restaurantName = clean(body.restaurantName, 160);
  const contactName = clean(body.contactName, 160);
  const email = clean(body.email, 254).toLowerCase();
  const phone = clean(body.phone, 40);
  const addressLine1 = clean(body.addressLine1, 200);
  const city = clean(body.city, 100);
  const state = clean(body.state, 20).toUpperCase() || "ME";
  const postalCode = clean(body.postalCode, 20);
  const website = clean(body.website, 300);
  const posProvider = clean(body.posProvider, 30).toUpperCase() || "OTHER";
  const integrationNotes = clean(body.integrationNotes, 1500);
  const termsAccepted = body.termsAccepted === true;

  const deliveryPlatforms = Array.isArray(body.deliveryPlatforms)
    ? body.deliveryPlatforms.map(value => clean(value, 80)).filter(Boolean).slice(0, 12)
    : [];

  if (!restaurantName || !contactName) {
    return json({ error: "Restaurant name and contact name are required" }, 400);
  }

  if (!email && !phone) {
    return json({ error: "Email or phone is required" }, 400);
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "Enter a valid email address" }, 400);
  }

  if (!ALLOWED_POS.has(posProvider)) {
    return json({ error: "Unsupported POS selection" }, 400);
  }

  if (!termsAccepted) {
    return json({ error: "Onboarding terms must be accepted" }, 400);
  }

  const publicToken = randomToken();

  const result = await env.DISPATCH_DB
    .prepare(
      `INSERT INTO restaurant_onboarding
        (
          public_token,
          restaurant_name,
          contact_name,
          email,
          phone,
          address_line_1,
          city,
          state,
          postal_code,
          website,
          pos_provider,
          delivery_platforms,
          integration_notes,
          status,
          terms_accepted,
          terms_version,
          created_at,
          updated_at
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', 1, '2026-09-08', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    )
    .bind(
      publicToken,
      restaurantName,
      contactName,
      nullIfBlank(email),
      nullIfBlank(phone),
      nullIfBlank(addressLine1),
      nullIfBlank(city),
      state,
      nullIfBlank(postalCode),
      nullIfBlank(website),
      posProvider,
      JSON.stringify(deliveryPlatforms),
      nullIfBlank(integrationNotes)
    )
    .run();

  const id = Number(result.meta?.last_row_id || 0);
  const origin = new URL(request.url).origin;

  return json(
    {
      success: true,
      onboardingId: id || null,
      token: publicToken,
      restaurantName,
      posProvider,
      status: "SUBMITTED",
      nextStep: nextStepFor({ status: "SUBMITTED", pos_provider: posProvider }),
      statusUrl: `${origin}${ONBOARDING_ROUTE}?token=${encodeURIComponent(publicToken)}`,
      squareConnectUrl:
        posProvider === "SQUARE"
          ? `${origin}${SQUARE_START_ROUTE}?token=${encodeURIComponent(publicToken)}`
          : null
    },
    201
  );
}

async function onboardingStatus(url, env) {
  if (!env.DISPATCH_DB) {
    return json({ error: "Dispatch database is not bound" }, 500);
  }

  const token = clean(url.searchParams.get("token"), 120);
  if (!token) {
    return json({ error: "Missing onboarding token" }, 400);
  }

  const row = await env.DISPATCH_DB
    .prepare(
      `SELECT
         id,
         restaurant_name,
         pos_provider,
         status,
         square_merchant_id,
         monthly_fee_cents,
         fee_waived_until,
         created_at,
         updated_at
       FROM restaurant_onboarding
       WHERE public_token = ?
       LIMIT 1`
    )
    .bind(token)
    .first();

  if (!row) {
    return json({ error: "Onboarding application not found" }, 404);
  }

  return json({
    success: true,
    restaurantName: row.restaurant_name,
    posProvider: row.pos_provider,
    status: row.status,
    squareConnected: Boolean(row.square_merchant_id),
    monthlyFeeCents: row.monthly_fee_cents ?? null,
    feeWaivedUntil: row.fee_waived_until || null,
    nextStep: nextStepFor(row),
    squareConnectUrl:
      row.pos_provider === "SQUARE" && !row.square_merchant_id
        ? `${url.origin}${SQUARE_START_ROUTE}?token=${encodeURIComponent(token)}`
        : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}

async function startLinkedSquareOnboarding(request, env, ctx) {
  if (!env.DISPATCH_DB) {
    return json({ error: "Dispatch database is not bound" }, 500);
  }

  const url = new URL(request.url);
  const token = clean(url.searchParams.get("token"), 120);

  if (!token) {
    return json({ error: "Missing onboarding token" }, 400);
  }

  const onboarding = await env.DISPATCH_DB
    .prepare(
      `SELECT id, restaurant_name, pos_provider, status, square_merchant_id
       FROM restaurant_onboarding
       WHERE public_token = ?
       LIMIT 1`
    )
    .bind(token)
    .first();

  if (!onboarding) {
    return json({ error: "Onboarding application not found" }, 404);
  }

  if (onboarding.pos_provider !== "SQUARE") {
    return json({ error: "This onboarding application is not using Square" }, 409);
  }

  if (onboarding.square_merchant_id) {
    return Response.redirect(`${url.origin}${ONBOARDING_ROUTE}?token=${encodeURIComponent(token)}`, 302);
  }

  if (onboarding.status === "REJECTED") {
    return json({ error: "This onboarding application is not eligible to connect" }, 409);
  }

  const startUrl = new URL(request.url);
  startUrl.pathname = "/api/connect/square/start";
  startUrl.search = "";
  startUrl.searchParams.set("restaurant", onboarding.restaurant_name);

  const startRequest = new Request(startUrl.toString(), {
    method: "GET",
    headers: request.headers
  });

  // The menu-sync handler owns /api/connect/square/start in worker-entry.js and
  // requests ITEMS_READ in addition to order/payment permissions.
  const response = await handleSquareMenuSync(startRequest, env, ctx);

  if (!response) {
    return json({ error: "Square authorization route is unavailable" }, 503);
  }

  const location = response.headers.get("location");
  if (response.status < 300 || response.status >= 400 || !location) {
    const details = await safeResponseBody(response);
    return json(
      {
        error: "Unable to start Square authorization",
        details
      },
      response.status >= 400 ? response.status : 502
    );
  }

  const authorizeUrl = new URL(location);
  const state = authorizeUrl.searchParams.get("state");
  if (!state) {
    return json({ error: "Square authorization did not return a state" }, 502);
  }

  const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();

  await env.DISPATCH_DB
    .prepare(
      `INSERT OR REPLACE INTO restaurant_onboarding_square_states
        (state, onboarding_id, expires_at, created_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
    )
    .bind(state, onboarding.id, expiresAt)
    .run();

  await env.DISPATCH_DB
    .prepare(
      `UPDATE restaurant_onboarding
       SET status = 'CONNECTING_SQUARE',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .bind(onboarding.id)
    .run();

  return response;
}

async function finishLinkedSquareOnboarding(request, env, ctx) {
  if (!env.DISPATCH_DB) {
    return null;
  }

  const url = new URL(request.url);
  const state = clean(url.searchParams.get("state"), 2048);
  if (!state) {
    return null;
  }

  let link;
  try {
    link = await env.DISPATCH_DB
      .prepare(
        `SELECT
           s.state,
           s.onboarding_id,
           s.expires_at,
           o.public_token,
           o.restaurant_name
         FROM restaurant_onboarding_square_states s
         JOIN restaurant_onboarding o ON o.id = s.onboarding_id
         WHERE s.state = ?
         LIMIT 1`
      )
      .bind(state)
      .first();
  } catch (error) {
    // Before migration 003 is applied, do not interfere with the existing
    // Square callback used by already-connected restaurants.
    console.warn("Restaurant onboarding callback table unavailable:", error);
    return null;
  }

  if (!link) {
    return null;
  }

  if (Date.parse(link.expires_at) < Date.now()) {
    await cleanupOnboardingState(env, state);
    await env.DISPATCH_DB
      .prepare(
        `UPDATE restaurant_onboarding
         SET status = 'SUBMITTED', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(link.onboarding_id)
      .run();

    return html(
      callbackPage({
        ok: false,
        token: link.public_token,
        restaurantName: link.restaurant_name,
        message: "The Square connection expired. Return to onboarding and try Connect Square again."
      }),
      400
    );
  }

  const connectorResponse = await handleSquareRestaurantConnector(request, env, ctx);
  if (!connectorResponse) {
    return json({ error: "Square connector callback is unavailable" }, 503);
  }

  const data = await responseJson(connectorResponse.clone());

  if (connectorResponse.ok && data?.connected && data?.merchantId) {
    await env.DISPATCH_DB
      .prepare(
        `UPDATE restaurant_onboarding
         SET status = 'CONNECTED',
             square_merchant_id = ?,
             square_restaurant_name = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      )
      .bind(
        data.merchantId,
        nullIfBlank(data.restaurantName || link.restaurant_name),
        link.onboarding_id
      )
      .run();

    await cleanupOnboardingState(env, state);

    return html(
      callbackPage({
        ok: true,
        token: link.public_token,
        restaurantName: data.restaurantName || link.restaurant_name,
        message: "Square is connected. Courier Eats can now review the restaurant for activation."
      })
    );
  }

  await env.DISPATCH_DB
    .prepare(
      `UPDATE restaurant_onboarding
       SET status = 'SUBMITTED', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .bind(link.onboarding_id)
    .run();

  await cleanupOnboardingState(env, state);

  return html(
    callbackPage({
      ok: false,
      token: link.public_token,
      restaurantName: link.restaurant_name,
      message: data?.errorDescription || data?.error || "Square authorization was not completed."
    }),
    connectorResponse.status >= 400 ? connectorResponse.status : 400
  );
}

async function adminListOnboarding(request, env, url) {
  if (!env.DISPATCH_DB) {
    return json({ error: "Dispatch database is not bound" }, 500);
  }

  if (!isAdmin(request, env)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const status = clean(url.searchParams.get("status"), 40).toUpperCase();
  const query = status && ALLOWED_STATUSES.has(status)
    ? `SELECT * FROM restaurant_onboarding WHERE status = ? ORDER BY created_at DESC LIMIT 250`
    : `SELECT * FROM restaurant_onboarding ORDER BY created_at DESC LIMIT 250`;

  const result = status && ALLOWED_STATUSES.has(status)
    ? await env.DISPATCH_DB.prepare(query).bind(status).all()
    : await env.DISPATCH_DB.prepare(query).all();

  return json({
    success: true,
    count: result.results?.length || 0,
    restaurants: (result.results || []).map(adminRow)
  });
}

async function adminUpdateOnboarding(request, env) {
  if (!env.DISPATCH_DB) {
    return json({ error: "Dispatch database is not bound" }, 500);
  }

  if (!isAdmin(request, env)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await requestJson(request);
  const id = Number(body.id || 0);
  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: "Valid onboarding id is required" }, 400);
  }

  const existing = await env.DISPATCH_DB
    .prepare("SELECT * FROM restaurant_onboarding WHERE id = ? LIMIT 1")
    .bind(id)
    .first();

  if (!existing) {
    return json({ error: "Onboarding application not found" }, 404);
  }

  const requestedStatus = clean(body.status, 40).toUpperCase();
  const status = requestedStatus || existing.status;
  if (!ALLOWED_STATUSES.has(status)) {
    return json({ error: "Unsupported onboarding status" }, 400);
  }

  let monthlyFeeCents = existing.monthly_fee_cents;
  if (Object.prototype.hasOwnProperty.call(body, "monthlyFeeCents")) {
    if (body.monthlyFeeCents === null || body.monthlyFeeCents === "") {
      monthlyFeeCents = null;
    } else {
      monthlyFeeCents = Number(body.monthlyFeeCents);
      if (!Number.isInteger(monthlyFeeCents) || monthlyFeeCents < 0) {
        return json({ error: "monthlyFeeCents must be a non-negative integer or null" }, 400);
      }
    }
  }

  const feeWaivedUntil = Object.prototype.hasOwnProperty.call(body, "feeWaivedUntil")
    ? nullIfBlank(clean(body.feeWaivedUntil, 40))
    : existing.fee_waived_until;

  const adminNote = Object.prototype.hasOwnProperty.call(body, "adminNote")
    ? nullIfBlank(clean(body.adminNote, 2000))
    : existing.admin_note;

  await env.DISPATCH_DB
    .prepare(
      `UPDATE restaurant_onboarding
       SET status = ?,
           monthly_fee_cents = ?,
           fee_waived_until = ?,
           admin_note = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
    .bind(status, monthlyFeeCents, feeWaivedUntil, adminNote, id)
    .run();

  const updated = await env.DISPATCH_DB
    .prepare("SELECT * FROM restaurant_onboarding WHERE id = ? LIMIT 1")
    .bind(id)
    .first();

  return json({ success: true, restaurant: adminRow(updated) });
}

async function cleanupOnboardingState(env, state) {
  await env.DISPATCH_DB
    .prepare("DELETE FROM restaurant_onboarding_square_states WHERE state = ?")
    .bind(state)
    .run();
}

function adminRow(row) {
  return {
    id: row.id,
    restaurantName: row.restaurant_name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    addressLine1: row.address_line_1,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    website: row.website,
    posProvider: row.pos_provider,
    deliveryPlatforms: parseJsonArray(row.delivery_platforms),
    integrationNotes: row.integration_notes,
    status: row.status,
    squareMerchantId: row.square_merchant_id,
    squareRestaurantName: row.square_restaurant_name,
    monthlyFeeCents: row.monthly_fee_cents,
    feeWaivedUntil: row.fee_waived_until,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function nextStepFor(row) {
  switch (row.status) {
    case "APPROVED":
      return "Onboarding is approved. Courier Eats can activate ordering and delivery for this restaurant.";
    case "CONNECTED":
      return "Square is connected. Courier Eats is reviewing the restaurant for activation.";
    case "CONNECTING_SQUARE":
      return "Finish the Square authorization. If you closed the Square page, use Connect Square again.";
    case "PAUSED":
      return "Onboarding is temporarily on hold. Courier Eats will follow up with the restaurant.";
    case "REJECTED":
      return "This onboarding request is not being activated. Contact Courier Eats if you need a review.";
    default:
      return row.pos_provider === "SQUARE"
        ? "Connect Square to continue. Courier Eats will never ask you to paste your Square password or access token into this form."
        : "Application received. Courier Eats will confirm the POS/webhook integration path. Do not send passwords or secret API keys through this form.";
  }
}

function isAdmin(request, env) {
  if (!env.ADMIN_API_KEY) return false;
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const headerKey = request.headers.get("x-admin-key") || "";
  return bearer === env.ADMIN_API_KEY || headerKey === env.ADMIN_API_KEY;
}

function clean(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function nullIfBlank(value) {
  const text = clean(value, 5000);
  return text || null;
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function requestJson(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.toLowerCase().includes("application/json")) {
    throw new Error("Content-Type must be application/json");
  }
  return await request.json();
}

async function responseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function safeResponseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 1000);
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Key",
    "Cache-Control": "no-store"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}

function html(content, status = 200) {
  return new Response(content, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow"
    }
  });
}

function callbackPage({ ok, token, restaurantName, message }) {
  const safeName = escapeHtml(restaurantName || "Restaurant");
  const safeMessage = escapeHtml(message || "");
  const target = `${ONBOARDING_ROUTE}?token=${encodeURIComponent(token || "")}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Courier Eats Restaurant Onboarding</title>
<style>${sharedCss()}</style></head>
<body><main class="shell"><section class="card center">
<div class="brand">Courier Eats</div>
<h1>${ok ? "Square connected" : "Square connection incomplete"}</h1>
<p><strong>${safeName}</strong></p><p>${safeMessage}</p>
<a class="button" href="${target}">Return to onboarding status</a>
</section></main></body></html>`;
}

function onboardingPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Restaurant Onboarding | Courier Eats</title>
<style>${sharedCss()}</style>
</head>
<body>
<main class="shell">
  <section class="hero">
    <div class="brand">Courier Eats</div>
    <h1>Restaurant onboarding</h1>
    <p>Local restaurant ordering and delivery with <strong>0% restaurant commission</strong> and no Courier Eats-required menu price hikes. A monthly platform fee may apply after any introductory waiver.</p>
  </section>

  <section class="card" id="statusCard" hidden>
    <h2>Application status</h2>
    <div id="statusOutput"></div>
    <button class="secondary" id="newApplication" type="button">Start another application</button>
  </section>

  <form class="card" id="onboardingForm">
    <h2>Restaurant information</h2>
    <div class="grid two">
      <label>Restaurant name<input name="restaurantName" required maxlength="160"></label>
      <label>Owner / manager contact<input name="contactName" required maxlength="160"></label>
      <label>Email<input name="email" type="email" maxlength="254"></label>
      <label>Phone<input name="phone" type="tel" maxlength="40"></label>
      <label>Street address<input name="addressLine1" maxlength="200"></label>
      <label>City<input name="city" maxlength="100" value="Lewiston"></label>
      <label>State<input name="state" maxlength="20" value="ME"></label>
      <label>ZIP code<input name="postalCode" maxlength="20"></label>
      <label class="wide">Website / ordering page<input name="website" maxlength="300" placeholder="https://"></label>
    </div>

    <h2>Ordering / POS</h2>
    <label>POS or ordering system
      <select name="posProvider" required>
        <option value="SQUARE">Square</option>
        <option value="TOAST">Toast</option>
        <option value="SKYTAB">SkyTab</option>
        <option value="CLOVER">Clover</option>
        <option value="CHOWNOW">ChowNow</option>
        <option value="FACEBOOK">Facebook ordering</option>
        <option value="OTHER">Other</option>
        <option value="NONE">No POS / not sure</option>
      </select>
    </label>

    <fieldset><legend>Current delivery platforms</legend>
      <div class="checks">
        <label><input type="checkbox" name="deliveryPlatforms" value="Uber Eats"> Uber Eats</label>
        <label><input type="checkbox" name="deliveryPlatforms" value="DoorDash"> DoorDash</label>
        <label><input type="checkbox" name="deliveryPlatforms" value="Grubhub"> Grubhub</label>
        <label><input type="checkbox" name="deliveryPlatforms" value="Own drivers"> Own drivers</label>
        <label><input type="checkbox" name="deliveryPlatforms" value="None"> None</label>
      </div>
    </fieldset>

    <label>Integration notes<textarea name="integrationNotes" maxlength="1500" rows="4" placeholder="Tell us anything useful about your ordering setup. Do not enter passwords, access tokens, API keys, or other secrets."></textarea></label>

    <div class="notice"><strong>Security:</strong> never paste POS passwords, Square access tokens, API keys, webhook signing secrets, or other credentials into this form. Square restaurants connect through Square's authorization screen.</div>

    <label class="consent"><input type="checkbox" name="termsAccepted" required> I am authorized to submit this restaurant for Courier Eats onboarding and understand that final activation and any monthly platform fee are confirmed by Courier Eats.</label>

    <button class="button" type="submit">Submit restaurant</button>
    <p class="muted" id="formMessage"></p>
  </form>
</main>
<script>
const form = document.getElementById('onboardingForm');
const message = document.getElementById('formMessage');
const statusCard = document.getElementById('statusCard');
const statusOutput = document.getElementById('statusOutput');
const newApplication = document.getElementById('newApplication');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

async function loadStatus(token) {
  if (!token) return;
  const response = await fetch('/api/restaurants/onboarding/status?token=' + encodeURIComponent(token), {cache:'no-store'});
  const data = await response.json();
  if (!response.ok) {
    statusOutput.innerHTML = '<p>' + esc(data.error || 'Unable to load status') + '</p>';
    statusCard.hidden = false;
    return;
  }
  localStorage.setItem('courierEatsOnboardingToken', token);
  statusOutput.innerHTML =
    '<p><strong>' + esc(data.restaurantName) + '</strong></p>' +
    '<p class="pill">' + esc(data.status) + '</p>' +
    '<p>' + esc(data.nextStep) + '</p>' +
    (data.monthlyFeeCents !== null ? '<p>Monthly platform fee: $' + (Number(data.monthlyFeeCents)/100).toFixed(2) + '</p>' : '') +
    (data.feeWaivedUntil ? '<p>Fee waived until: ' + esc(data.feeWaivedUntil) + '</p>' : '') +
    (data.squareConnectUrl ? '<p><a class="button" href="' + esc(data.squareConnectUrl) + '">Connect Square</a></p>' : '') +
    '<details><summary>Application tracking token</summary><code>' + esc(token) + '</code></details>';
  statusCard.hidden = false;
  form.hidden = true;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  message.textContent = 'Submitting...';
  const fd = new FormData(form);
  const payload = {
    restaurantName: fd.get('restaurantName'),
    contactName: fd.get('contactName'),
    email: fd.get('email'),
    phone: fd.get('phone'),
    addressLine1: fd.get('addressLine1'),
    city: fd.get('city'),
    state: fd.get('state'),
    postalCode: fd.get('postalCode'),
    website: fd.get('website'),
    posProvider: fd.get('posProvider'),
    deliveryPlatforms: fd.getAll('deliveryPlatforms'),
    integrationNotes: fd.get('integrationNotes'),
    termsAccepted: fd.get('termsAccepted') === 'on'
  };
  try {
    const response = await fetch('/api/restaurants/onboarding', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to submit restaurant');
    history.replaceState(null, '', '/restaurant-onboarding?token=' + encodeURIComponent(data.token));
    await loadStatus(data.token);
  } catch (error) {
    message.textContent = error.message;
  }
});

newApplication.addEventListener('click', () => {
  localStorage.removeItem('courierEatsOnboardingToken');
  history.replaceState(null, '', '/restaurant-onboarding');
  statusCard.hidden = true;
  form.hidden = false;
  form.reset();
});

const params = new URLSearchParams(location.search);
const initialToken = params.get('token') || localStorage.getItem('courierEatsOnboardingToken');
if (initialToken) loadStatus(initialToken);
</script>
</body></html>`;
}

function adminPage() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Restaurant Onboarding Admin | Courier Eats</title><style>${sharedCss()}</style></head>
<body><main class="shell"><section class="hero"><div class="brand">Courier Eats</div><h1>Restaurant onboarding admin</h1><p>Review restaurant applications, connection status, monthly fee, and waivers.</p></section>
<section class="card"><label>Admin API key<input id="adminKey" type="password" autocomplete="off"></label><button id="load" class="button">Load applications</button><p class="muted">The key is kept in this browser tab only and is not placed in the URL.</p></section>
<section id="apps"></section></main>
<script>
const keyInput=document.getElementById('adminKey'); const apps=document.getElementById('apps');
keyInput.value=sessionStorage.getItem('courierEatsAdminKey')||'';
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
async function api(path, options={}) { const key=keyInput.value.trim(); sessionStorage.setItem('courierEatsAdminKey',key); const headers={...(options.headers||{}),'x-admin-key':key}; const r=await fetch(path,{...options,headers,cache:'no-store'}); const d=await r.json(); if(!r.ok) throw new Error(d.error||'Request failed'); return d; }
async function load(){ apps.innerHTML='<section class="card">Loading...</section>'; try{const data=await api('/api/admin/restaurants/onboarding'); apps.innerHTML=data.restaurants.map(card).join('')||'<section class="card">No applications yet.</section>'; document.querySelectorAll('[data-save]').forEach(b=>b.onclick=save);}catch(e){apps.innerHTML='<section class="card">'+esc(e.message)+'</section>';}}
function card(r){return '<section class="card" data-id="'+r.id+'"><div class="row"><div><h2>'+esc(r.restaurantName)+'</h2><p>'+esc(r.contactName)+' · '+esc(r.email||r.phone||'')+'</p><p>'+esc(r.city||'')+', '+esc(r.state||'')+' · POS: '+esc(r.posProvider)+'</p></div><span class="pill">'+esc(r.status)+'</span></div><p>Square: '+(r.squareMerchantId?'Connected':'Not connected')+'</p><label>Status<select data-status>'+['SUBMITTED','CONNECTING_SQUARE','CONNECTED','APPROVED','PAUSED','REJECTED'].map(s=>'<option '+(s===r.status?'selected':'')+'>'+s+'</option>').join('')+'</select></label><div class="grid two"><label>Monthly fee (cents)<input data-fee type="number" min="0" value="'+(r.monthlyFeeCents??'')+'"></label><label>Fee waived until<input data-waiver type="date" value="'+esc(r.feeWaivedUntil||'')+'"></label></div><label>Admin note<textarea data-note rows="3">'+esc(r.adminNote||'')+'</textarea></label><button class="button" data-save>Save</button></section>';}
async function save(e){const card=e.target.closest('[data-id]'); const id=Number(card.dataset.id); const fee=card.querySelector('[data-fee]').value; const payload={id,status:card.querySelector('[data-status]').value,monthlyFeeCents:fee===''?null:Number(fee),feeWaivedUntil:card.querySelector('[data-waiver]').value||null,adminNote:card.querySelector('[data-note]').value}; e.target.disabled=true; try{await api('/api/admin/restaurants/onboarding/update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); await load();}catch(err){alert(err.message); e.target.disabled=false;}}
document.getElementById('load').onclick=load;
</script></body></html>`;
}

function sharedCss() {
  return `:root{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#171717;background:#f5f5f5}*{box-sizing:border-box}body{margin:0}.shell{width:min(920px,calc(100% - 28px));margin:0 auto;padding:28px 0 56px}.hero{padding:22px 4px}.brand{font-weight:900;letter-spacing:.02em;font-size:1.05rem}.hero h1,.card h1{font-size:clamp(2rem,7vw,3.6rem);line-height:1;margin:.45rem 0 1rem}.hero p{max-width:720px;font-size:1.08rem;line-height:1.6}.card{background:white;border:1px solid #ddd;border-radius:18px;padding:22px;margin:16px 0;box-shadow:0 8px 24px rgba(0,0,0,.05)}.card h2{margin-top:0}.grid{display:grid;gap:14px}.grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}.wide{grid-column:1/-1}label{display:grid;gap:7px;font-weight:650;margin:12px 0}input,select,textarea{width:100%;font:inherit;border:1px solid #bbb;border-radius:10px;padding:11px 12px;background:#fff}textarea{resize:vertical}fieldset{border:1px solid #ddd;border-radius:12px;margin:16px 0;padding:12px}legend{font-weight:800}.checks{display:flex;flex-wrap:wrap;gap:12px}.checks label,.consent{display:flex;align-items:flex-start;gap:8px;font-weight:500}.checks input,.consent input{width:auto;margin-top:3px}.button,.secondary{display:inline-block;border:0;border-radius:11px;padding:12px 17px;font-weight:800;text-decoration:none;cursor:pointer}.button{background:#171717;color:#fff}.secondary{background:#eee;color:#171717}.notice{background:#fff7d6;border:1px solid #e8d37e;border-radius:12px;padding:13px;line-height:1.5}.muted{color:#666}.pill{display:inline-block;background:#eee;border-radius:999px;padding:5px 10px;font-size:.8rem;font-weight:800}.row{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.center{text-align:center}code{word-break:break-all}@media(max-width:680px){.grid.two{grid-template-columns:1fr}.wide{grid-column:auto}.card{padding:17px}.row{display:block}}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}
