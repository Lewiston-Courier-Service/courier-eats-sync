export async function handleRetailPickup(request, env) {
  const url = new URL(request.url);

  if (url.pathname !== "/api/retail-pickup") {
    return null;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!env.DISPATCH_DB) {
    return json({ error: "Dispatch database is not bound" }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const store = clean(body.store);
  const storeLocation = clean(body.storeLocation);
  const pickupName = clean(body.pickupName);
  const pickupNumber = clean(body.pickupNumber);
  const customerName = clean(body.customerName);
  const customerPhone = clean(body.customerPhone);
  const deliveryAddress = clean(body.deliveryAddress);
  const notes = clean(body.notes);
  const authorized = body.authorized === true;

  if (!store || !pickupName || !pickupNumber || !customerName || !customerPhone || !deliveryAddress) {
    return json({ error: "Missing required retail pickup information" }, 400);
  }

  if (!authorized) {
    return json({ error: "Pickup authorization is required" }, 400);
  }

  const pickupAddress = storeLocation ? `${store} - ${storeLocation}` : store;

  const result = await env.DISPATCH_DB
    .prepare(
      `INSERT INTO dispatch_orders
        (source, restaurant_name, customer_name, customer_phone, pickup_address, delivery_address, status, dispatch_provider, created_at, updated_at)
       VALUES ('retail_pickup', ?, ?, ?, ?, ?, 'NEW', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    )
    .bind(
      store,
      customerName,
      customerPhone,
      pickupAddress,
      deliveryAddress,
      env.DISPATCH_MODE || "internal"
    )
    .run();

  const dispatchOrderId = result.meta?.last_row_id || null;

  if (dispatchOrderId) {
    const note = [
      `Retail pickup: ${store}`,
      `Pickup name: ${pickupName}`,
      `Pickup/order number: ${pickupNumber}`,
      notes ? `Notes: ${notes}` : null,
      "Customer authorized Lewiston Courier Service to pick up this order on their behalf."
    ]
      .filter(Boolean)
      .join(" | ");

    await env.DISPATCH_DB
      .prepare(
        `INSERT INTO dispatch_events (order_id, status, note)
         VALUES (?, 'NEW', ?)`
      )
      .bind(dispatchOrderId, note)
      .run();
  }

  return json({
    success: true,
    service: "Retail Pickup",
    dispatchOrderId,
    dispatchStatus: "NEW"
  });
}

function clean(value) {
  return String(value ?? "").trim();
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
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
