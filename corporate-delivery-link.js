const CORPORATE_RESTAURANTS = [
  {
    id: "popeyes-lewiston",
    name: "Popeyes Lewiston",
    orderingMode: "DELIVERY_LINK",
    integrationStatus: "CORPORATE_NOT_INTEGRATED",
    coreMarket: "Twin City",
    corePostalCodes: ["04240", "04210"],
    orderUrl: "https://www.popeyes.com/",
    deliveryEnabled: true
  }
];

const TWIN_CITY_RATES = [
  { maxMiles: 5, customerPriceCents: 1199 },
  { maxMiles: 6, customerPriceCents: 1299 },
  { maxMiles: 7, customerPriceCents: 1399 },
  { maxMiles: 10, customerPriceCents: 1499 }
];

const DEFAULT_MIN_GROSS_MARGIN_CENTS = 400;

export async function handleCorporateDeliveryLink(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/api/corporate/restaurants" && request.method === "GET") {
    return json({
      service: "Courier Eats Corporate Delivery-Link",
      restaurants: CORPORATE_RESTAURANTS
    });
  }

  if (url.pathname === "/api/corporate/delivery-link" && request.method === "POST") {
    if (!env.DISPATCH_DB) {
      return json({ error: "Dispatch database is not bound" }, 500);
    }

    const body = await readJson(request);
    const restaurant = CORPORATE_RESTAURANTS.find(
      (entry) => entry.id === String(body.restaurantId || "")
    );

    if (!restaurant) {
      return json({ error: "Corporate restaurant is not configured" }, 404);
    }

    const restaurantOrderId = String(body.restaurantOrderId || "").trim();
    const customerName = String(body.customerName || "").trim();
    const customerPhone = String(body.customerPhone || "").trim();
    const deliveryAddress = String(body.deliveryAddress || "").trim();
    const deliveryPostalCode = String(body.deliveryPostalCode || "").trim();
    const pickupAddress = String(body.pickupAddress || "").trim();

    if (!restaurantOrderId) {
      return json({ error: "Restaurant order number is required" }, 400);
    }

    if (!deliveryAddress || !deliveryPostalCode) {
      return json({ error: "Delivery address and postal code are required" }, 400);
    }

    const result = await env.DISPATCH_DB
      .prepare(
        `INSERT INTO dispatch_orders
          (source, restaurant_name, restaurant_location_id, customer_name,
           customer_phone, pickup_address, delivery_address, status, dispatch_provider)
         VALUES ('corporate_delivery_link', ?, ?, ?, ?, ?, ?, 'AWAITING_DELIVERY_PAYMENT', 'internal')`
      )
      .bind(
        restaurant.name,
        `${restaurant.id}:${restaurantOrderId}`,
        blankToNull(customerName),
        blankToNull(customerPhone),
        blankToNull(pickupAddress),
        deliveryAddress
      )
      .run();

    const dispatchOrderId = Number(result?.meta?.last_row_id || 0);

    if (dispatchOrderId) {
      await env.DISPATCH_DB
        .prepare(
          `INSERT INTO dispatch_events (order_id, status, note)
           VALUES (?, 'AWAITING_DELIVERY_PAYMENT', ?)`
        )
        .bind(
          dispatchOrderId,
          `Restaurant order ${restaurantOrderId}; delivery ZIP ${deliveryPostalCode}`
        )
        .run();
    }

    return json({
      success: true,
      dispatchOrderId,
      restaurant: restaurant.name,
      restaurantOrderId,
      deliveryPostalCode,
      coreTwinCityZone: restaurant.corePostalCodes.includes(deliveryPostalCode),
      status: "AWAITING_DELIVERY_PAYMENT",
      next: "Create/confirm LCS delivery charge before releasing to dispatch"
    }, 201);
  }

  if (url.pathname === "/api/delivery/rate" && request.method === "POST") {
    const body = await readJson(request);
    const miles = Number(body.miles);

    if (!Number.isFinite(miles) || miles < 0) {
      return json({ error: "Valid miles value is required" }, 400);
    }

    const rate = TWIN_CITY_RATES.find((entry) => miles <= entry.maxMiles);

    if (!rate) {
      return json({
        quoted: false,
        manualReview: true,
        reason: "Distance is outside the configured 10-mile table"
      }, 202);
    }

    const uberQuoteCents =
      body.uberQuoteCents == null ? null : Number(body.uberQuoteCents);
    const minimumMarginCents = Number(
      env.MIN_GROSS_MARGIN_CENTS || DEFAULT_MIN_GROSS_MARGIN_CENTS
    );

    const grossMarginCents =
      Number.isFinite(uberQuoteCents)
        ? rate.customerPriceCents - uberQuoteCents
        : null;

    return json({
      quoted: true,
      miles,
      customerPriceCents: rate.customerPriceCents,
      customerPrice: (rate.customerPriceCents / 100).toFixed(2),
      fulfillmentPriority: ["LCS", "UBER_DIRECT", "APPROVED_FALLBACK"],
      uberDirect: {
        quoteRequiredBeforeDispatch: true,
        grossMarginCents,
        minimumMarginCents,
        marginProtected:
          grossMarginCents == null ? null : grossMarginCents >= minimumMarginCents
      }
    });
  }

  return null;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function blankToNull(value) {
  const text = String(value || "").trim();
  return text || null;
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
