const SQUARE_VERSION = "2026-08-19";

export async function handleSquareRestaurantConnector(request, env) {
  const url = new URL(request.url);

  const connectorRoutes = new Set([
    "/api/connect/square/start",
    "/api/connect/square/callback",
    "/api/connect/square/status",
    "/api/webhooks/square-restaurants"
  ]);

  if (!connectorRoutes.has(url.pathname)) {
    return null;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: connectorCorsHeaders()
    });
  }

  try {
    if (url.pathname === "/api/connect/square/start" && request.method === "GET") {
      return await startSquareOAuth(url, env);
    }

    if (url.pathname === "/api/connect/square/callback" && request.method === "GET") {
      return await finishSquareOAuth(url, env);
    }

    if (url.pathname === "/api/connect/square/status" && request.method === "GET") {
      return await squareConnectorStatus(request, env);
    }

    if (
      url.pathname === "/api/webhooks/square-restaurants" &&
      request.method === "POST"
    ) {
      return await handleRestaurantSquareWebhook(request, env, url);
    }

    return connectorJson({ error: "Method not allowed" }, 405);
  } catch (error) {
    console.error("Square restaurant connector error:", error);
    return connectorJson(
      {
        error: "Square restaurant connector error",
        message: "Internal server error"
      },
      500
    );
  }
}

async function startSquareOAuth(url, env) {
  const ready = connectorConfigReady(env);
  if (!ready.ok) {
    return connectorJson({ error: ready.error }, 503);
  }

  if (!env.DISPATCH_DB) {
    return connectorJson({ error: "Dispatch database is not bound" }, 500);
  }

  const restaurantName = String(url.searchParams.get("restaurant") || "").trim();
  const state = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await env.DISPATCH_DB
    .prepare(
      `INSERT INTO square_oauth_states
        (state, restaurant_name, expires_at)
       VALUES (?, ?, ?)`
    )
    .bind(state, restaurantName || null, expiresAt)
    .run();

  const scope = [
    "MERCHANT_PROFILE_READ",
    "ORDERS_READ",
    "ORDERS_WRITE",
    "PAYMENTS_READ"
  ].join(" ");

  const authorizeUrl = new URL("https://connect.squareup.com/oauth2/authorize");
  authorizeUrl.searchParams.set("client_id", env.SQUARE_APP_ID);
  authorizeUrl.searchParams.set("scope", scope);
  authorizeUrl.searchParams.set("session", "false");
  authorizeUrl.searchParams.set("state", state);

  if (env.SQUARE_OAUTH_REDIRECT_URL) {
    authorizeUrl.searchParams.set(
      "redirect_uri",
      env.SQUARE_OAUTH_REDIRECT_URL
    );
  }

  return Response.redirect(authorizeUrl.toString(), 302);
}

async function finishSquareOAuth(url, env) {
  const ready = connectorConfigReady(env);
  if (!ready.ok) {
    return connectorJson({ error: ready.error }, 503);
  }

  if (!env.DISPATCH_DB) {
    return connectorJson({ error: "Dispatch database is not bound" }, 500);
  }

  const error = url.searchParams.get("error");
  if (error) {
    return connectorJson(
      {
        connected: false,
        error,
        errorDescription: url.searchParams.get("error_description") || ""
      },
      400
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return connectorJson({ error: "Missing Square authorization code or state" }, 400);
  }

  const savedState = await env.DISPATCH_DB
    .prepare(
      `SELECT state, restaurant_name, expires_at
       FROM square_oauth_states
       WHERE state = ?`
    )
    .bind(state)
    .first();

  if (!savedState) {
    return connectorJson({ error: "Invalid or expired OAuth state" }, 400);
  }

  if (Date.parse(savedState.expires_at) < Date.now()) {
    await deleteOAuthState(env, state);
    return connectorJson({ error: "OAuth state expired" }, 400);
  }

  const tokenResponse = await fetch("https://connect.squareup.com/oauth2/token", {
    method: "POST",
    headers: {
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: env.SQUARE_APP_ID,
      client_secret: env.SQUARE_APP_SECRET,
      code,
      grant_type: "authorization_code",
      ...(env.SQUARE_OAUTH_REDIRECT_URL
        ? { redirect_uri: env.SQUARE_OAUTH_REDIRECT_URL }
        : {})
    })
  });

  const tokenData = await safeConnectorJson(tokenResponse);

  if (!tokenResponse.ok || !tokenData.access_token || !tokenData.merchant_id) {
    return connectorJson(
      {
        connected: false,
        error: "Square token exchange failed",
        details: tokenData
      },
      tokenResponse.status || 502
    );
  }

  const merchantId = tokenData.merchant_id;
  let restaurantName = String(savedState.restaurant_name || "").trim();

  const merchantResponse = await fetch(
    `https://connect.squareup.com/v2/merchants/${encodeURIComponent(merchantId)}`,
    {
      method: "GET",
      headers: squareOAuthHeaders(tokenData.access_token)
    }
  );

  const merchantData = await safeConnectorJson(merchantResponse);
  if (merchantResponse.ok && merchantData.merchant?.business_name) {
    restaurantName = merchantData.merchant.business_name;
  }

  const accessTokenEncrypted = await encryptConnectorSecret(
    tokenData.access_token,
    env.CONNECTOR_ENCRYPTION_KEY
  );

  const refreshTokenEncrypted = tokenData.refresh_token
    ? await encryptConnectorSecret(
        tokenData.refresh_token,
        env.CONNECTOR_ENCRYPTION_KEY
      )
    : null;

  const scopes = Array.isArray(tokenData.scopes)
    ? tokenData.scopes.join(" ")
    : "";

  await env.DISPATCH_DB
    .prepare(
      `INSERT INTO square_restaurant_connections
        (
          merchant_id,
          restaurant_name,
          access_token_enc,
          refresh_token_enc,
          expires_at,
          scopes,
          status,
          auto_dispatch_delivery,
          updated_at
        )
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 1, CURRENT_TIMESTAMP)
       ON CONFLICT(merchant_id) DO UPDATE SET
         restaurant_name = excluded.restaurant_name,
         access_token_enc = excluded.access_token_enc,
         refresh_token_enc = excluded.refresh_token_enc,
         expires_at = excluded.expires_at,
         scopes = excluded.scopes,
         status = 'ACTIVE',
         updated_at = CURRENT_TIMESTAMP`
    )
    .bind(
      merchantId,
      restaurantName || null,
      accessTokenEncrypted,
      refreshTokenEncrypted,
      tokenData.expires_at || null,
      scopes
    )
    .run();

  await deleteOAuthState(env, state);

  return connectorJson({
    connected: true,
    provider: "square",
    merchantId,
    restaurantName,
    autoDispatchDelivery: true
  });
}

async function squareConnectorStatus(request, env) {
  if (!env.DISPATCH_DB) {
    return connectorJson({ error: "Dispatch database is not bound" }, 500);
  }

  if (!isAdminRequest(request, env)) {
    return connectorJson({ error: "Unauthorized" }, 401);
  }

  const result = await env.DISPATCH_DB
    .prepare(
      `SELECT
         merchant_id AS merchantId,
         restaurant_name AS restaurantName,
         expires_at AS expiresAt,
         scopes,
         status,
         auto_dispatch_delivery AS autoDispatchDelivery,
         created_at AS createdAt,
         updated_at AS updatedAt
       FROM square_restaurant_connections
       ORDER BY restaurant_name, merchant_id`
    )
    .all();

  return connectorJson({
    service: "Courier Eats Square Restaurant Connector",
    enabled: env.SQUARE_RESTAURANT_CONNECTOR_ENABLED === "true",
    count: result.results?.length || 0,
    restaurants: result.results || []
  });
}

async function handleRestaurantSquareWebhook(request, env, url) {
  if (!env.DISPATCH_DB) {
    return connectorJson({ error: "Dispatch database is not bound" }, 500);
  }

  if (!env.SQUARE_RESTAURANT_WEBHOOK_SIGNATURE_KEY) {
    return connectorJson(
      { error: "Restaurant webhook signature key is not configured" },
      503
    );
  }

  const signature =
    request.headers.get("x-square-hmacsha256-signature") || "";
  const rawBody = await request.text();

  const notificationUrl =
    env.SQUARE_RESTAURANT_WEBHOOK_NOTIFICATION_URL ||
    `${url.origin}${url.pathname}`;

  const validSignature = await verifySquareSignature({
    rawBody,
    signature,
    signatureKey: env.SQUARE_RESTAURANT_WEBHOOK_SIGNATURE_KEY,
    notificationUrl
  });

  if (!validSignature) {
    return connectorJson({ error: "Invalid Square webhook signature" }, 403);
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return connectorJson({ error: "Invalid JSON webhook body" }, 400);
  }

  const eventId = event.event_id || null;
  const eventType = event.type || "";
  const merchantId = event.merchant_id || null;

  if (eventId) {
    const duplicate = await env.DISPATCH_DB
      .prepare(
        "SELECT event_id FROM square_restaurant_webhook_events WHERE event_id = ?"
      )
      .bind(eventId)
      .first();

    if (duplicate) {
      return connectorJson({ received: true, duplicate: true });
    }
  }

  if (eventType !== "payment.updated") {
    await rememberRestaurantWebhook(
      env,
      eventId,
      merchantId,
      eventType,
      null,
      "IGNORED_EVENT_TYPE"
    );
    return connectorJson({
      received: true,
      ignored: true,
      reason: "event type"
    });
  }

  const payment = event.data?.object?.payment;
  const orderId = payment?.order_id || null;

  if (!payment || payment.status !== "COMPLETED" || !orderId || !merchantId) {
    await rememberRestaurantWebhook(
      env,
      eventId,
      merchantId,
      eventType,
      orderId,
      "IGNORED_PAYMENT"
    );
    return connectorJson({
      received: true,
      ignored: true,
      reason: "payment not completed or missing merchant/order"
    });
  }

  const connection = await env.DISPATCH_DB
    .prepare(
      `SELECT *
       FROM square_restaurant_connections
       WHERE merchant_id = ?
         AND status = 'ACTIVE'
         AND auto_dispatch_delivery = 1
       LIMIT 1`
    )
    .bind(merchantId)
    .first();

  if (!connection) {
    await rememberRestaurantWebhook(
      env,
      eventId,
      merchantId,
      eventType,
      orderId,
      "IGNORED_NOT_CONNECTED"
    );
    return connectorJson({
      received: true,
      ignored: true,
      reason: "merchant not connected"
    });
  }

  const existingDispatch = await env.DISPATCH_DB
    .prepare(
      `SELECT id, status
       FROM dispatch_orders
       WHERE square_order_id = ?
       LIMIT 1`
    )
    .bind(orderId)
    .first();

  if (existingDispatch) {
    await rememberRestaurantWebhook(
      env,
      eventId,
      merchantId,
      eventType,
      orderId,
      "ALREADY_DISPATCHED"
    );
    return connectorJson({
      received: true,
      duplicate: true,
      dispatchOrderId: existingDispatch.id,
      dispatchStatus: existingDispatch.status
    });
  }

  const accessToken = await getUsableRestaurantAccessToken(connection, env);

  const orderResponse = await fetch(
    `https://connect.squareup.com/v2/orders/${encodeURIComponent(orderId)}`,
    {
      method: "GET",
      headers: squareOAuthHeaders(accessToken)
    }
  );

  const orderData = await safeConnectorJson(orderResponse);

  if (!orderResponse.ok || !orderData.order) {
    console.error("Unable to retrieve connected restaurant Square order", orderData);
    return connectorJson({ error: "Unable to retrieve restaurant order" }, 502);
  }

  const order = orderData.order;
  const deliveryFulfillment = getDeliveryFulfillment(order);

  if (!deliveryFulfillment) {
    await rememberRestaurantWebhook(
      env,
      eventId,
      merchantId,
      eventType,
      orderId,
      "IGNORED_NOT_DELIVERY"
    );
    return connectorJson({
      received: true,
      ignored: true,
      reason: "order is not a delivery fulfillment"
    });
  }

  const recipient = deliveryFulfillment.delivery_details?.recipient || null;
  const deliveryAddress = formatConnectorAddress(recipient?.address);
  const customerName = recipient?.display_name || "";
  const customerPhone = recipient?.phone_number || "";
  const locationId = order.location_id || payment.location_id || "";

  let restaurantName = connection.restaurant_name || "";
  let pickupAddress = "";

  if (locationId) {
    const locationResponse = await fetch(
      `https://connect.squareup.com/v2/locations/${encodeURIComponent(locationId)}`,
      {
        method: "GET",
        headers: squareOAuthHeaders(accessToken)
      }
    );

    const locationData = await safeConnectorJson(locationResponse);
    if (locationResponse.ok && locationData.location) {
      restaurantName = locationData.location.name || restaurantName;
      pickupAddress = formatConnectorAddress(locationData.location.address);
    }
  }

  const orderTotal = Number(
    order.total_money?.amount ?? payment.amount_money?.amount ?? 0
  );

  const insertResult = await env.DISPATCH_DB
    .prepare(
      `INSERT OR IGNORE INTO dispatch_orders
        (
          square_order_id,
          source,
          restaurant_name,
          restaurant_location_id,
          customer_name,
          customer_phone,
          pickup_address,
          delivery_address,
          order_total,
          status,
          dispatch_provider,
          created_at,
          updated_at
        )
       VALUES (?, 'square_restaurant', ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    )
    .bind(
      orderId,
      nullIfBlank(restaurantName),
      nullIfBlank(locationId),
      nullIfBlank(customerName),
      nullIfBlank(customerPhone),
      nullIfBlank(pickupAddress),
      nullIfBlank(deliveryAddress),
      orderTotal,
      env.DISPATCH_MODE || "internal"
    )
    .run();

  const dispatchRow = await env.DISPATCH_DB
    .prepare(
      `SELECT id, status
       FROM dispatch_orders
       WHERE square_order_id = ?
       LIMIT 1`
    )
    .bind(orderId)
    .first();

  if (dispatchRow?.id && Number(insertResult.meta?.changes || 0) > 0) {
    await env.DISPATCH_DB
      .prepare(
        `INSERT INTO dispatch_events (order_id, status, note)
         VALUES (?, 'NEW', 'Connected Square restaurant delivery order received')`
      )
      .bind(dispatchRow.id)
      .run();
  }

  await rememberRestaurantWebhook(
    env,
    eventId,
    merchantId,
    eventType,
    orderId,
    "PROCESSED"
  );

  return connectorJson({
    received: true,
    merchantId,
    orderId,
    dispatchOrderId: dispatchRow?.id || null,
    dispatchStatus: dispatchRow?.status || "NEW"
  });
}

async function getUsableRestaurantAccessToken(connection, env) {
  const accessToken = await decryptConnectorSecret(
    connection.access_token_enc,
    env.CONNECTOR_ENCRYPTION_KEY
  );

  const expiresAt = connection.expires_at
    ? Date.parse(connection.expires_at)
    : Number.NaN;

  const refreshNeeded =
    Number.isFinite(expiresAt) && expiresAt <= Date.now() + 24 * 60 * 60 * 1000;

  if (!refreshNeeded) {
    return accessToken;
  }

  if (!connection.refresh_token_enc) {
    return accessToken;
  }

  const refreshToken = await decryptConnectorSecret(
    connection.refresh_token_enc,
    env.CONNECTOR_ENCRYPTION_KEY
  );

  const refreshResponse = await fetch(
    "https://connect.squareup.com/oauth2/token",
    {
      method: "POST",
      headers: {
        "Square-Version": SQUARE_VERSION,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        client_id: env.SQUARE_APP_ID,
        client_secret: env.SQUARE_APP_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken
      })
    }
  );

  const refreshData = await safeConnectorJson(refreshResponse);

  if (!refreshResponse.ok || !refreshData.access_token) {
    throw new Error("Unable to refresh connected Square access token");
  }

  const newAccessTokenEncrypted = await encryptConnectorSecret(
    refreshData.access_token,
    env.CONNECTOR_ENCRYPTION_KEY
  );

  const newRefreshTokenEncrypted = refreshData.refresh_token
    ? await encryptConnectorSecret(
        refreshData.refresh_token,
        env.CONNECTOR_ENCRYPTION_KEY
      )
    : connection.refresh_token_enc;

  await env.DISPATCH_DB
    .prepare(
      `UPDATE square_restaurant_connections
       SET access_token_enc = ?,
           refresh_token_enc = ?,
           expires_at = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE merchant_id = ?`
    )
    .bind(
      newAccessTokenEncrypted,
      newRefreshTokenEncrypted,
      refreshData.expires_at || null,
      connection.merchant_id
    )
    .run();

  return refreshData.access_token;
}

function connectorConfigReady(env) {
  if (env.SQUARE_RESTAURANT_CONNECTOR_ENABLED !== "true") {
    return {
      ok: false,
      error: "Square restaurant connector is disabled"
    };
  }

  const missing = [
    "SQUARE_APP_ID",
    "SQUARE_APP_SECRET",
    "CONNECTOR_ENCRYPTION_KEY"
  ].filter(name => !env[name]);

  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing connector configuration: ${missing.join(", ")}`
    };
  }

  return { ok: true };
}

function isAdminRequest(request, env) {
  if (!env.ADMIN_API_KEY) {
    return false;
  }

  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  const headerKey = request.headers.get("x-admin-key") || "";
  return bearer === env.ADMIN_API_KEY || headerKey === env.ADMIN_API_KEY;
}

async function deleteOAuthState(env, state) {
  await env.DISPATCH_DB
    .prepare("DELETE FROM square_oauth_states WHERE state = ?")
    .bind(state)
    .run();
}

async function rememberRestaurantWebhook(
  env,
  eventId,
  merchantId,
  eventType,
  orderId,
  result
) {
  if (!eventId) {
    return;
  }

  await env.DISPATCH_DB
    .prepare(
      `INSERT OR IGNORE INTO square_restaurant_webhook_events
        (event_id, merchant_id, event_type, square_order_id, result)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      eventId,
      merchantId || null,
      eventType || "unknown",
      orderId || null,
      result || "PROCESSED"
    )
    .run();
}

async function encryptConnectorSecret(value, base64Key) {
  if (!value) {
    return null;
  }

  const key = await importConnectorKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(value);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext)
  );

  return `v1:${bytesToBase64(iv)}:${bytesToBase64(ciphertext)}`;
}

async function decryptConnectorSecret(value, base64Key) {
  if (!value) {
    throw new Error("Missing encrypted connector secret");
  }

  const parts = String(value).split(":");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new Error("Unsupported encrypted connector secret format");
  }

  const iv = base64ToBytes(parts[1]);
  const ciphertext = base64ToBytes(parts[2]);
  if (!iv || !ciphertext) {
    throw new Error("Invalid encrypted connector secret");
  }

  const key = await importConnectorKey(base64Key);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
}

async function importConnectorKey(base64Key) {
  const bytes = base64ToBytes(base64Key || "");
  if (!bytes || bytes.length !== 32) {
    throw new Error(
      "CONNECTOR_ENCRYPTION_KEY must be a base64-encoded 32-byte key"
    );
  }

  return crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function verifySquareSignature({
  rawBody,
  signature,
  signatureKey,
  notificationUrl
}) {
  if (!rawBody || !signature || !signatureKey || !notificationUrl) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signatureKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const signatureBytes = base64ToBytes(signature);
  if (!signatureBytes) {
    return false;
  }

  return crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    new TextEncoder().encode(notificationUrl + rawBody)
  );
}

function squareOAuthHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Square-Version": SQUARE_VERSION,
    "Content-Type": "application/json"
  };
}

function getDeliveryFulfillment(order) {
  const fulfillments = Array.isArray(order.fulfillments)
    ? order.fulfillments
    : [];

  return (
    fulfillments.find(
      fulfillment =>
        fulfillment?.type === "DELIVERY" ||
        Boolean(fulfillment?.delivery_details)
    ) || null
  );
}

function formatConnectorAddress(address) {
  if (!address) {
    return "";
  }

  const street = [
    address.address_line_1,
    address.address_line_2,
    address.address_line_3
  ]
    .filter(Boolean)
    .join(", ");

  const cityStatePostal = [
    address.locality,
    address.administrative_district_level_1,
    address.postal_code
  ]
    .filter(Boolean)
    .join(" ");

  return [street, cityStatePostal].filter(Boolean).join(", ");
}

function nullIfBlank(value) {
  const text = String(value || "").trim();
  return text || null;
}

async function safeConnectorJson(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      error: "Non-JSON response",
      body: text.slice(0, 1000)
    };
  }
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function connectorCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Admin-Key, X-Square-HmacSha256-Signature"
  };
}

function connectorJson(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...connectorCorsHeaders()
    }
  });
}
