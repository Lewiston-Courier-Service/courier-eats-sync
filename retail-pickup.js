const GROCERY_PICKUP_ROUTE = "/api/grocery-pickup";
const LEGACY_RETAIL_PICKUP_ROUTE = "/api/retail-pickup";

export async function handleRetailPickup(request, env) {
  const url = new URL(request.url);

  if (![GROCERY_PICKUP_ROUTE, LEGACY_RETAIL_PICKUP_ROUTE].includes(url.pathname)) {
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
  const itemsPaid = body.itemsPaid === true;
  const tipCents = optionalTipCents(body.tipCents);

  if (tipCents.error) {
    return json({ error: tipCents.error }, 400);
  }

  if (!store || !pickupName || !pickupNumber || !customerName || !customerPhone || !deliveryAddress) {
    return json({ error: "Missing required grocery pickup information" }, 400);
  }

  if (!authorized) {
    return json({ error: "Pickup authorization is required" }, 400);
  }

  if (!itemsPaid) {
    return json({
      error: "Grocery items must be paid with the store before LCS delivery checkout can begin"
    }, 409);
  }

  const pickupAddress = storeLocation ? `${store} - ${storeLocation}` : store;

  const result = await env.DISPATCH_DB
    .prepare(
      `INSERT INTO dispatch_orders
        (source, restaurant_name, customer_name, customer_phone, pickup_address, delivery_address, status, dispatch_provider, created_at, updated_at)
       VALUES ('retail_pickup', ?, ?, ?, ?, ?, 'AWAITING_PAYMENT', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
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
      `Grocery Pick Up: ${store}`,
      `Pickup name: ${pickupName}`,
      `Pickup/order number: ${pickupNumber}`,
      "Store merchandise payment confirmed by customer.",
      `Customer-selected tip: $${(tipCents.value / 100).toFixed(2)}`,
      notes ? `Notes: ${notes}` : null,
      "Tip is optional and selected by the customer; no gratuity is automatically added.",
      "Courier dispatch is blocked until the LCS delivery/service bill is paid.",
      "Customer authorized Lewiston Courier Service to pick up this grocery order on their behalf."
    ]
      .filter(Boolean)
      .join(" | ");

    await env.DISPATCH_DB
      .prepare(
        `INSERT INTO dispatch_events (order_id, status, note)
         VALUES (?, 'AWAITING_PAYMENT', ?)`
      )
      .bind(dispatchOrderId, note)
      .run();
  }

  return json({
    success: true,
    service: "Grocery Pick Up",
    endpoint: GROCERY_PICKUP_ROUTE,
    dispatchOrderId,
    dispatchStatus: "AWAITING_PAYMENT",
    paymentGate: {
      storeItemsPaid: true,
      lcsBillPaid: false,
      courierDispatchAllowed: false,
      requiredSequence: [
        "Store merchandise paid",
        "LCS delivery/service bill paid",
        "Courier dispatch released"
      ],
      nextStep: "Complete the LCS delivery/service checkout. The order can move to NEW only after confirmed payment."
    },
    tipping: {
      optional: true,
      requiredForDispatch: false,
      defaultTipCents: 0,
      customerSelectedTipCents: tipCents.value,
      charged: false,
      checkoutBehavior: "Customer may choose no tip, a suggested tip, or a custom tip when payment is connected.",
      note: "Tip amount is recorded for checkout/display only until the Grocery Pick Up payment flow is connected."
    }
  });
}

function optionalTipCents(value) {
  if (value === undefined || value === null || value === "") {
    return { value: 0 };
  }

  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 0 || amount > 50000) {
    return { error: "tipCents must be a whole number from 0 to 50000 ($500.00 maximum)" };
  }

  return { value: amount };
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
