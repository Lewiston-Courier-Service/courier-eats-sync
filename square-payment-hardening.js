export async function handleSquarePaymentHardening(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/api/webhooks/square" && request.method === "POST") {
    return await handleSquareWebhook(request, env, url);
  }

  if (url.pathname === "/api/dispatch/reconcile" && request.method === "POST") {
    return await handleSquareReconcile(request, env);
  }

  return null;
}

async function handleSquareWebhook(request, env, url) {
  if (!env.DISPATCH_DB) {
    return json({ error: "Dispatch database is not bound" }, 500);
  }

  if (!env.SQUARE_WEBHOOK_SIGNATURE_KEY) {
    return json({ error: "Square webhook signature key is not configured" }, 503);
  }

  const signature = request.headers.get("x-square-hmacsha256-signature") || "";
  const rawBody = await request.text();
  const notificationUrl =
    env.SQUARE_WEBHOOK_NOTIFICATION_URL || `${url.origin}${url.pathname}`;

  const validSignature = await verifySquareWebhookSignature({
    rawBody,
    signature,
    signatureKey: env.SQUARE_WEBHOOK_SIGNATURE_KEY,
    notificationUrl
  });

  if (!validSignature) {
    return json({ error: "Invalid Square webhook signature" }, 403);
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON webhook body" }, 400);
  }

  const eventId = event.event_id || null;
  const eventType = event.type || "";

  if (eventId) {
    const alreadyProcessed = await env.DISPATCH_DB
      .prepare("SELECT event_id FROM square_webhook_events WHERE event_id = ?")
      .bind(eventId)
      .first();

    if (alreadyProcessed) {
      return json({ received: true, duplicate: true });
    }
  }

  if (!["payment.created", "payment.updated"].includes(eventType)) {
    await rememberSquareWebhookEvent(env, eventId, eventType, null, "IGNORED");
    return json({ received: true, ignored: true, reason: "event type" });
  }

  const payment = event.data?.object?.payment;
  const orderId = payment?.order_id || null;

  if (!payment || payment.status !== "COMPLETED" || !orderId) {
    await rememberSquareWebhookEvent(env, eventId, eventType, orderId, "IGNORED");
    return json({
      received: true,
      ignored: true,
      reason: "payment not completed or missing order"
    });
  }

  const dispatchOrder = await env.DISPATCH_DB
    .prepare(
      `SELECT id, status
       FROM dispatch_orders
       WHERE square_order_id = ? AND source = 'courier_eats'
       ORDER BY id DESC
       LIMIT 1`
    )
    .bind(orderId)
    .first();

  if (!dispatchOrder) {
    await rememberSquareWebhookEvent(env, eventId, eventType, orderId, "IGNORED");
    return json({ received: true, ignored: true, reason: "not a Courier Eats order" });
  }

  if (dispatchOrder.status !== "AWAITING_PAYMENT") {
    await rememberSquareWebhookEvent(env, eventId, eventType, orderId, "ALREADY_READY");
    return json({
      received: true,
      orderId,
      dispatchStatus: dispatchOrder.status,
      duplicate: true
    });
  }

  const released = await releaseSquareOrderToDispatch(env, dispatchOrder.id, orderId, {
    fallbackLocationId: payment.location_id || "",
    fallbackTotal: payment.amount_money?.amount ?? 0,
    note: "Square payment completed; order released to dispatch"
  });

  if (!released.ok) {
    return json({ error: released.error }, released.status || 502);
  }

  await rememberSquareWebhookEvent(env, eventId, eventType, orderId, "PROCESSED");

  return json({
    received: true,
    orderId,
    dispatchOrderId: dispatchOrder.id,
    dispatchStatus: "NEW"
  });
}

async function handleSquareReconcile(request, env) {
  if (!env.ADMIN_API_KEY) {
    return json({ error: "Admin API key is not configured" }, 503);
  }

  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.replace(/^Bearer\s+/i, "");
  const headerKey = request.headers.get("x-admin-key") || "";

  if (bearer !== env.ADMIN_API_KEY && headerKey !== env.ADMIN_API_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (!env.DISPATCH_DB) {
    return json({ error: "Dispatch database is not bound" }, 500);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const id = Number(body.id || 0);

  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: "Valid dispatch order id is required" }, 400);
  }

  const dispatchOrder = await env.DISPATCH_DB
    .prepare(
      `SELECT id, square_order_id, status
       FROM dispatch_orders
       WHERE id = ? AND source = 'courier_eats'
       LIMIT 1`
    )
    .bind(id)
    .first();

  if (!dispatchOrder) {
    return json({ error: "Dispatch order not found" }, 404);
  }

  if (dispatchOrder.status !== "AWAITING_PAYMENT") {
    return json({
      success: true,
      reconciled: false,
      reason: "Order is not awaiting payment",
      status: dispatchOrder.status
    });
  }

  if (!dispatchOrder.square_order_id) {
    return json({ error: "Dispatch order has no Square order ID" }, 400);
  }

  const orderResponse = await fetch(
    `https://connect.squareup.com/v2/orders/${encodeURIComponent(dispatchOrder.square_order_id)}`,
    {
      method: "GET",
      headers: squareHeaders(env)
    }
  );

  const orderData = await safeJson(orderResponse);

  if (!orderResponse.ok || !orderData.order) {
    return json({ error: "Unable to retrieve Square order" }, 502);
  }

  const order = orderData.order;
  const total = Number(order.total_money?.amount ?? 0);
  const amountDue = Number(order.net_amount_due_money?.amount ?? total);
  const tenders = Array.isArray(order.tenders) ? order.tenders : [];

  let completedPaymentTotal = 0;

  for (const tender of tenders) {
    if (!tender.payment_id) continue;

    const paymentResponse = await fetch(
      `https://connect.squareup.com/v2/payments/${encodeURIComponent(tender.payment_id)}`,
      {
        method: "GET",
        headers: squareHeaders(env)
      }
    );

    const paymentData = await safeJson(paymentResponse);

    if (paymentResponse.ok && paymentData.payment?.status === "COMPLETED") {
      completedPaymentTotal += Number(
        paymentData.payment.amount_money?.amount ??
          tender.amount_money?.amount ??
          0
      );
    }
  }

  if (amountDue !== 0 || completedPaymentTotal < total) {
    return json(
      {
        success: false,
        reconciled: false,
        reason: "Square order is not fully paid",
        orderTotal: total,
        amountDue,
        completedPaymentTotal
      },
      409
    );
  }

  const released = await releaseSquareOrderToDispatch(
    env,
    dispatchOrder.id,
    dispatchOrder.square_order_id,
    {
      fallbackLocationId: order.location_id || "",
      fallbackTotal: total,
      note: "Square payment reconciliation verified completed payment and zero balance due"
    },
    order
  );

  if (!released.ok) {
    return json({ error: released.error }, released.status || 502);
  }

  return json({
    success: true,
    reconciled: true,
    dispatchOrderId: dispatchOrder.id,
    squareOrderId: dispatchOrder.square_order_id,
    status: "NEW",
    orderTotal: total,
    amountDue,
    completedPaymentTotal
  });
}

async function releaseSquareOrderToDispatch(
  env,
  dispatchOrderId,
  orderId,
  options = {},
  suppliedOrder = null
) {
  let order = suppliedOrder;

  if (!order) {
    const orderResponse = await fetch(
      `https://connect.squareup.com/v2/orders/${encodeURIComponent(orderId)}`,
      {
        method: "GET",
        headers: squareHeaders(env)
      }
    );

    const orderData = await safeJson(orderResponse);

    if (!orderResponse.ok || !orderData.order) {
      console.error("Unable to retrieve Square order for dispatch", orderData);
      return { ok: false, status: 502, error: "Unable to retrieve paid Square order" };
    }

    order = orderData.order;
  }

  const fulfillment = Array.isArray(order.fulfillments)
    ? order.fulfillments[0]
    : null;
  const recipient = getFulfillmentRecipient(fulfillment);
  const deliveryAddress = formatAddress(recipient?.address);
  const customerName = recipient?.display_name || "";
  const customerPhone = recipient?.phone_number || "";
  const locationId = order.location_id || options.fallbackLocationId || "";

  let restaurantName = "";
  let pickupAddress = "";

  if (locationId) {
    const locationResponse = await fetch(
      `https://connect.squareup.com/v2/locations/${encodeURIComponent(locationId)}`,
      {
        method: "GET",
        headers: squareHeaders(env)
      }
    );

    const locationData = await safeJson(locationResponse);

    if (locationResponse.ok && locationData.location) {
      restaurantName = locationData.location.name || "";
      pickupAddress = formatAddress(locationData.location.address);
    }
  }

  const orderTotal = Number(
    order.total_money?.amount ?? options.fallbackTotal ?? 0
  );

  await env.DISPATCH_DB
    .prepare(
      `UPDATE dispatch_orders
       SET restaurant_name = COALESCE(?, restaurant_name),
           restaurant_location_id = COALESCE(?, restaurant_location_id),
           customer_name = COALESCE(?, customer_name),
           customer_phone = COALESCE(?, customer_phone),
           pickup_address = COALESCE(?, pickup_address),
           delivery_address = COALESCE(?, delivery_address),
           order_total = ?,
           status = 'NEW',
           dispatch_provider = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'AWAITING_PAYMENT'`
    )
    .bind(
      blankToNull(restaurantName),
      blankToNull(locationId),
      blankToNull(customerName),
      blankToNull(customerPhone),
      blankToNull(pickupAddress),
      blankToNull(deliveryAddress),
      orderTotal,
      env.DISPATCH_MODE || "internal",
      dispatchOrderId
    )
    .run();

  await env.DISPATCH_DB
    .prepare(
      `INSERT INTO dispatch_events (order_id, status, note)
       VALUES (?, 'NEW', ?)`
    )
    .bind(dispatchOrderId, options.note || "Square payment released to dispatch")
    .run();

  return { ok: true };
}

async function rememberSquareWebhookEvent(env, eventId, eventType, orderId, result) {
  if (!eventId) return;

  await env.DISPATCH_DB
    .prepare(
      `INSERT OR IGNORE INTO square_webhook_events
        (event_id, event_type, square_order_id, result)
       VALUES (?, ?, ?, ?)`
    )
    .bind(eventId, eventType || "unknown", orderId || null, result || "PROCESSED")
    .run();
}

async function verifySquareWebhookSignature({
  rawBody,
  signature,
  signatureKey,
  notificationUrl
}) {
  if (!signature || !signatureKey || !notificationUrl) {
    return false;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signatureKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );

  const signatureBytes = base64ToBytes(signature);
  if (!signatureBytes) {
    return false;
  }

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
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function getFulfillmentRecipient(fulfillment) {
  if (!fulfillment) return null;

  return (
    fulfillment.delivery_details?.recipient ||
    fulfillment.shipment_details?.recipient ||
    fulfillment.pickup_details?.recipient ||
    null
  );
}

function formatAddress(address) {
  if (!address) return "";

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

function blankToNull(value) {
  const text = String(value || "").trim();
  return text || null;
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
    return {
      error: "Non-JSON response",
      body: text.slice(0, 1000)
    };
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
