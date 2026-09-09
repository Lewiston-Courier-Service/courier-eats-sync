const CHECKOUT_ROUTE = "/api/grocery-pickup/checkout";
const ADMIN_QUOTE_ROUTE = "/api/admin/grocery-pickup/quote";
const ADMIN_RECONCILE_ROUTE = "/api/admin/grocery-pickup/reconcile";
const SQUARE_WEBHOOK_ROUTE = "/api/webhooks/square";
const GROCERY_SOURCE = "retail_pickup";

export async function handleGroceryPaymentGate(request, env) {
  const url = new URL(request.url);

  if ([CHECKOUT_ROUTE, ADMIN_QUOTE_ROUTE, ADMIN_RECONCILE_ROUTE].includes(url.pathname) && request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (url.pathname === ADMIN_QUOTE_ROUTE && request.method === "POST") {
    return await setGroceryQuote(request, env);
  }

  if (url.pathname === CHECKOUT_ROUTE && request.method === "POST") {
    return await createGroceryCheckout(request, env);
  }

  if (url.pathname === ADMIN_RECONCILE_ROUTE && request.method === "POST") {
    return await reconcileGroceryPayment(request, env);
  }

  if (url.pathname === SQUARE_WEBHOOK_ROUTE && request.method === "POST") {
    return await handleSquareWebhookIfGrocery(request, env, url);
  }

  return null;
}

async function setGroceryQuote(request, env) {
  if (!isAdmin(request, env)) return json({ error: "Unauthorized" }, 401);
  if (!env.DISPATCH_DB) return json({ error: "Dispatch database is not bound" }, 500);

  const body = await requestJson(request);
  if (body.error) return json({ error: body.error }, 400);

  const dispatchOrderId = positiveInteger(body.value.dispatchOrderId);
  const lcsBillCents = moneyCents(body.value.lcsBillCents, 100, 1000000);

  if (!dispatchOrderId) return json({ error: "Valid dispatchOrderId is required" }, 400);
  if (!lcsBillCents.ok) return json({ error: "lcsBillCents must be a whole number from 100 to 1000000" }, 400);

  const order = await env.DISPATCH_DB.prepare(
    `SELECT id, status, source, order_total, square_order_id
     FROM dispatch_orders
     WHERE id = ? AND source = ?
     LIMIT 1`
  ).bind(dispatchOrderId, GROCERY_SOURCE).first();

  if (!order) return json({ error: "Grocery Pick Up dispatch order not found" }, 404);
  if (order.status !== "AWAITING_PAYMENT") {
    return json({ error: "Only orders awaiting payment can be quoted", status: order.status }, 409);
  }
  if (order.square_order_id) {
    return json({ error: "Checkout already exists; the LCS bill cannot be changed after Square checkout is created" }, 409);
  }

  await env.DISPATCH_DB.prepare(
    `UPDATE dispatch_orders
     SET order_total = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND source = ? AND status = 'AWAITING_PAYMENT' AND square_order_id IS NULL`
  ).bind(lcsBillCents.value, dispatchOrderId, GROCERY_SOURCE).run();

  await env.DISPATCH_DB.prepare(
    `INSERT INTO dispatch_events (order_id, status, note)
     VALUES (?, 'AWAITING_PAYMENT', ?)`
  ).bind(
    dispatchOrderId,
    `LCS Grocery Pick Up bill quoted at $${(lcsBillCents.value / 100).toFixed(2)}; courier remains blocked until Square confirms payment.`
  ).run();

  return json({
    success: true,
    dispatchOrderId,
    lcsBillCents: lcsBillCents.value,
    status: "AWAITING_PAYMENT",
    courierDispatchAllowed: false
  });
}

async function createGroceryCheckout(request, env) {
  if (!env.DISPATCH_DB) return json({ error: "Dispatch database is not bound" }, 500);
  if (!env.SQUARE_ACCESS_TOKEN) return json({ error: "Square access token is not configured" }, 503);
  if (!env.SQUARE_LOCATION_ID) return json({ error: "Square location ID is not configured" }, 503);

  const body = await requestJson(request);
  if (body.error) return json({ error: body.error }, 400);

  const dispatchOrderId = positiveInteger(body.value.dispatchOrderId);
  if (!dispatchOrderId) return json({ error: "Valid dispatchOrderId is required" }, 400);

  const order = await env.DISPATCH_DB.prepare(
    `SELECT id, status, source, order_total, square_order_id
     FROM dispatch_orders
     WHERE id = ? AND source = ?
     LIMIT 1`
  ).bind(dispatchOrderId, GROCERY_SOURCE).first();

  if (!order) return json({ error: "Grocery Pick Up dispatch order not found" }, 404);
  if (order.status !== "AWAITING_PAYMENT") {
    return json({ error: "Order is not awaiting payment", status: order.status }, 409);
  }

  const lcsBillCents = Number(order.order_total || 0);
  if (!Number.isInteger(lcsBillCents) || lcsBillCents <= 0) {
    return json({ error: "LCS delivery/service bill has not been quoted yet" }, 409);
  }

  const redirectUrl = `https://couriereats.com/?grocery=payment-complete&dispatch=${encodeURIComponent(dispatchOrderId)}`;
  const squareResponse = await fetch(
    "https://connect.squareup.com/v2/online-checkout/payment-links",
    {
      method: "POST",
      headers: squareHeaders(env),
      body: JSON.stringify({
        idempotency_key: `grocery-pickup-${dispatchOrderId}`,
        quick_pay: {
          name: `LCS Grocery Pick Up #${dispatchOrderId}`,
          price_money: { amount: lcsBillCents, currency: "USD" },
          location_id: env.SQUARE_LOCATION_ID
        },
        checkout_options: {
          redirect_url: redirectUrl,
          allow_tipping: true
        },
        payment_note: `LCS Grocery Pick Up delivery/service bill #${dispatchOrderId}`
      })
    }
  );

  const squareData = await safeJson(squareResponse);
  if (!squareResponse.ok) {
    return json({ error: "Unable to create Square Grocery Pick Up checkout", square: squareData }, squareResponse.status);
  }

  const squareOrderId = squareData.payment_link?.order_id || null;
  const checkoutUrl = squareData.payment_link?.url || squareData.payment_link?.long_url || null;

  if (!squareOrderId || !checkoutUrl) {
    return json({ error: "Square checkout did not return an order ID and payment URL" }, 502);
  }

  if (order.square_order_id && order.square_order_id !== squareOrderId) {
    return json({ error: "This Grocery Pick Up order is already tied to a different Square checkout" }, 409);
  }

  const updateResult = await env.DISPATCH_DB.prepare(
    `UPDATE dispatch_orders
     SET square_order_id = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND source = ? AND status = 'AWAITING_PAYMENT'
       AND (square_order_id IS NULL OR square_order_id = ?)`
  ).bind(squareOrderId, dispatchOrderId, GROCERY_SOURCE, squareOrderId).run();

  if (Number(updateResult?.meta?.changes ?? 0) !== 1) {
    return json({ error: "Unable to attach Square checkout to Grocery Pick Up order" }, 409);
  }

  if (!order.square_order_id) {
    await env.DISPATCH_DB.prepare(
      `INSERT INTO dispatch_events (order_id, status, note)
       VALUES (?, 'AWAITING_PAYMENT', ?)`
    ).bind(
      dispatchOrderId,
      "Square Grocery Pick Up checkout created. Tip is optional. Courier remains blocked until Square confirms the LCS bill is fully paid."
    ).run();
  }

  return json({
    success: true,
    dispatchOrderId,
    squareOrderId,
    checkoutUrl,
    lcsBillCents,
    tipping: { optional: true, requiredForDispatch: false },
    dispatchStatus: "AWAITING_PAYMENT",
    courierDispatchAllowed: false
  });
}

async function handleSquareWebhookIfGrocery(request, env, url) {
  if (!env.DISPATCH_DB) return null;

  const clone = request.clone();
  const rawBody = await clone.text();
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return null;
  }

  if (!["payment.created", "payment.updated"].includes(event.type || "")) return null;

  const payment = event.data?.object?.payment;
  const squareOrderId = payment?.order_id || null;
  if (!payment || payment.status !== "COMPLETED" || !squareOrderId) return null;

  const dispatchOrder = await env.DISPATCH_DB.prepare(
    `SELECT id, status, source, order_total, square_order_id
     FROM dispatch_orders
     WHERE square_order_id = ? AND source = ?
     ORDER BY id DESC
     LIMIT 1`
  ).bind(squareOrderId, GROCERY_SOURCE).first();

  if (!dispatchOrder) return null;

  if (!env.SQUARE_WEBHOOK_SIGNATURE_KEY) {
    return json({ error: "Square webhook signature key is not configured" }, 503);
  }

  const signature = request.headers.get("x-square-hmacsha256-signature") || "";
  const notificationUrl = env.SQUARE_WEBHOOK_NOTIFICATION_URL || `${url.origin}${url.pathname}`;
  const validSignature = await verifySquareWebhookSignature({
    rawBody,
    signature,
    signatureKey: env.SQUARE_WEBHOOK_SIGNATURE_KEY,
    notificationUrl
  });

  if (!validSignature) return json({ error: "Invalid Square webhook signature" }, 403);

  if (dispatchOrder.status !== "AWAITING_PAYMENT") {
    return json({
      received: true,
      groceryPickUp: true,
      dispatchOrderId: dispatchOrder.id,
      dispatchStatus: dispatchOrder.status,
      duplicate: true
    });
  }

  const verified = await verifySquareOrderPaid(env, dispatchOrder);
  if (!verified.ok) return json({ error: verified.error }, verified.status || 502);
  if (!verified.paid) {
    return json({
      received: true,
      groceryPickUp: true,
      dispatchOrderId: dispatchOrder.id,
      dispatchStatus: "AWAITING_PAYMENT",
      released: false,
      reason: verified.reason
    });
  }

  const released = await releaseGroceryOrder(env, dispatchOrder, "Square confirmed the LCS Grocery Pick Up bill is fully paid; courier dispatch released.");
  if (!released.released) {
    return json({
      received: true,
      groceryPickUp: true,
      dispatchOrderId: dispatchOrder.id,
      dispatchStatus: released.status || "NEW",
      duplicate: true
    });
  }

  return json({
    received: true,
    groceryPickUp: true,
    dispatchOrderId: dispatchOrder.id,
    squareOrderId,
    dispatchStatus: "NEW",
    courierDispatchAllowed: true
  });
}

async function reconcileGroceryPayment(request, env) {
  if (!isAdmin(request, env)) return json({ error: "Unauthorized" }, 401);
  if (!env.DISPATCH_DB) return json({ error: "Dispatch database is not bound" }, 500);

  const body = await requestJson(request);
  if (body.error) return json({ error: body.error }, 400);
  const dispatchOrderId = positiveInteger(body.value.dispatchOrderId);
  if (!dispatchOrderId) return json({ error: "Valid dispatchOrderId is required" }, 400);

  const dispatchOrder = await env.DISPATCH_DB.prepare(
    `SELECT id, status, source, order_total, square_order_id
     FROM dispatch_orders
     WHERE id = ? AND source = ?
     LIMIT 1`
  ).bind(dispatchOrderId, GROCERY_SOURCE).first();

  if (!dispatchOrder) return json({ error: "Grocery Pick Up dispatch order not found" }, 404);
  if (dispatchOrder.status !== "AWAITING_PAYMENT") {
    return json({ success: true, reconciled: false, status: dispatchOrder.status, reason: "Order is not awaiting payment" });
  }
  if (!dispatchOrder.square_order_id) return json({ error: "Grocery Pick Up order has no Square order ID" }, 409);

  const verified = await verifySquareOrderPaid(env, dispatchOrder);
  if (!verified.ok) return json({ error: verified.error }, verified.status || 502);
  if (!verified.paid) {
    return json({ success: false, reconciled: false, status: "AWAITING_PAYMENT", reason: verified.reason }, 409);
  }

  const released = await releaseGroceryOrder(env, dispatchOrder, "Admin reconciliation verified the LCS Grocery Pick Up bill is fully paid in Square; courier dispatch released.");
  return json({
    success: true,
    reconciled: released.released,
    dispatchOrderId,
    squareOrderId: dispatchOrder.square_order_id,
    status: released.status || "NEW",
    courierDispatchAllowed: released.status === "NEW"
  });
}

async function verifySquareOrderPaid(env, dispatchOrder) {
  if (!env.SQUARE_ACCESS_TOKEN) return { ok: false, status: 503, error: "Square access token is not configured" };

  const orderResponse = await fetch(
    `https://connect.squareup.com/v2/orders/${encodeURIComponent(dispatchOrder.square_order_id)}`,
    { method: "GET", headers: squareHeaders(env) }
  );
  const orderData = await safeJson(orderResponse);
  if (!orderResponse.ok || !orderData.order) {
    return { ok: false, status: 502, error: "Unable to retrieve Grocery Pick Up Square order" };
  }

  const squareOrder = orderData.order;
  const quoted = Number(dispatchOrder.order_total || 0);
  const squareTotal = Number(squareOrder.total_money?.amount ?? 0);
  const amountDue = Number(squareOrder.net_amount_due_money?.amount ?? squareTotal);

  if (!Number.isInteger(quoted) || quoted <= 0) {
    return { ok: false, status: 409, error: "Grocery Pick Up order has no valid LCS bill" };
  }

  if (squareTotal !== quoted) {
    return {
      ok: true,
      paid: false,
      reason: `Square order total (${squareTotal}) does not match the quoted LCS bill (${quoted})`
    };
  }

  if (amountDue !== 0) {
    return { ok: true, paid: false, reason: `Square still reports ${amountDue} cents due` };
  }

  const tenders = Array.isArray(squareOrder.tenders) ? squareOrder.tenders : [];
  let completedPaymentTotal = 0;

  for (const tender of tenders) {
    if (!tender.payment_id) continue;
    const paymentResponse = await fetch(
      `https://connect.squareup.com/v2/payments/${encodeURIComponent(tender.payment_id)}`,
      { method: "GET", headers: squareHeaders(env) }
    );
    const paymentData = await safeJson(paymentResponse);
    if (paymentResponse.ok && paymentData.payment?.status === "COMPLETED") {
      completedPaymentTotal += Number(paymentData.payment.amount_money?.amount ?? tender.amount_money?.amount ?? 0);
    }
  }

  if (completedPaymentTotal < quoted) {
    return { ok: true, paid: false, reason: "Square does not show enough completed payment to cover the LCS bill" };
  }

  return { ok: true, paid: true, squareTotal, amountDue, completedPaymentTotal };
}

async function releaseGroceryOrder(env, dispatchOrder, note) {
  const updateResult = await env.DISPATCH_DB.prepare(
    `UPDATE dispatch_orders
     SET status = 'NEW', dispatch_provider = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND source = ? AND square_order_id = ? AND status = 'AWAITING_PAYMENT'`
  ).bind(
    env.DISPATCH_MODE || "internal",
    dispatchOrder.id,
    GROCERY_SOURCE,
    dispatchOrder.square_order_id
  ).run();

  if (Number(updateResult?.meta?.changes ?? 0) !== 1) {
    const current = await env.DISPATCH_DB.prepare("SELECT status FROM dispatch_orders WHERE id = ? LIMIT 1").bind(dispatchOrder.id).first();
    return { released: false, status: current?.status || null };
  }

  await env.DISPATCH_DB.prepare(
    `INSERT INTO dispatch_events (order_id, status, note)
     VALUES (?, 'NEW', ?)`
  ).bind(dispatchOrder.id, note).run();

  return { released: true, status: "NEW" };
}

function isAdmin(request, env) {
  if (!env.ADMIN_API_KEY) return false;
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const headerKey = request.headers.get("x-admin-key") || "";
  return bearer === env.ADMIN_API_KEY || headerKey === env.ADMIN_API_KEY;
}

async function requestJson(request) {
  if (!(request.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
    return { error: "Content-Type must be application/json" };
  }
  try {
    return { value: await request.json() };
  } catch {
    return { error: "Valid JSON is required" };
  }
}

function positiveInteger(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function moneyCents(value, min, max) {
  const n = Number(value);
  return { ok: Number.isInteger(n) && n >= min && n <= max, value: n };
}

function squareHeaders(env) {
  return {
    Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
    "Square-Version": "2026-08-19",
    "Content-Type": "application/json"
  };
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: "Non-JSON response", body: text.slice(0, 1000) };
  }
}

async function verifySquareWebhookSignature({ rawBody, signature, signatureKey, notificationUrl }) {
  if (!signature || !signatureKey || !notificationUrl) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signatureKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const signatureBytes = base64ToBytes(signature);
  if (!signatureBytes) return false;
  return await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    encoder.encode(notificationUrl + rawBody)
  );
}

function base64ToBytes(value) {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Key",
    "Cache-Control": "no-store"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() }
  });
}
