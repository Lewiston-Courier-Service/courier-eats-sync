const CORPORATE_RESTAURANTS = [
  {
    id: "popeyes-lewiston",
    name: "Popeyes Lewiston",
    orderingMode: "DELIVERY_LINK",
    integrationStatus: "CORPORATE_NOT_INTEGRATED",
    coreMarket: "Twin City",
    corePostalCodes: ["04240", "04210"],
    orderUrl: "https://www.popeyes.com/",
    pickupAddress: "841 Lisbon St, Lewiston, ME 04240",
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
        restaurant.pickupAddress,
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

  if (url.pathname === "/api/corporate/delivery-payment" && request.method === "POST") {
    if (!env.DISPATCH_DB) return json({ error: "Dispatch database is not bound" }, 500);
    if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID) {
      return json({ error: "Square delivery-payment configuration is incomplete" }, 503);
    }

    const body = await readJson(request);
    const dispatchOrderId = Number(body.dispatchOrderId || 0);
    const amountCents = Number(body.amountCents || 0);

    if (!Number.isInteger(dispatchOrderId) || dispatchOrderId <= 0) {
      return json({ error: "Valid dispatchOrderId is required" }, 400);
    }
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return json({ error: "Valid delivery amount is required" }, 400);
    }

    const allowedDeliveryAmounts = new Set(
      TWIN_CITY_RATES.map((entry) => entry.customerPriceCents)
    );

    if (!allowedDeliveryAmounts.has(amountCents)) {
      return json({
        error: "Delivery amount does not match a configured Courier Eats rate"
      }, 400);
    }

    const dispatchOrder = await env.DISPATCH_DB
      .prepare(`SELECT id, restaurant_name, restaurant_location_id, status
                 FROM dispatch_orders
                 WHERE id = ? AND source = 'corporate_delivery_link' LIMIT 1`)
      .bind(dispatchOrderId)
      .first();

    if (!dispatchOrder) return json({ error: "Delivery-Link order not found" }, 404);
    if (dispatchOrder.status !== "AWAITING_DELIVERY_PAYMENT") {
      return json({ error: "Order is not awaiting delivery payment", status: dispatchOrder.status }, 409);
    }

    const squareResponse = await fetch("https://connect.squareup.com/v2/online-checkout/payment-links", {
      method: "POST",
      headers: squareHeaders(env),
      body: JSON.stringify({
        idempotency_key: `lcs-delivery-${dispatchOrderId}-${amountCents}`,
        quick_pay: {
          name: `LCS Delivery - ${dispatchOrder.restaurant_name || "Courier Eats"}`,
          price_money: { amount: amountCents, currency: "USD" },
          location_id: env.SQUARE_LOCATION_ID
        },
        checkout_options: {
          redirect_url: `https://couriereats.com/?delivery=paid&dispatch=${dispatchOrderId}`,
          ask_for_shipping_address: false,
          allow_tipping: true
        },
        payment_note: `Courier Eats Delivery-Link dispatch #${dispatchOrderId}`
      })
    });

    const squareData = await safeJson(squareResponse);
    if (!squareResponse.ok) return json(squareData, squareResponse.status);

    const squareOrderId = squareData.payment_link?.order_id || null;
    const checkoutUrl = squareData.payment_link?.url || squareData.payment_link?.long_url || null;

    if (!squareOrderId || !checkoutUrl) {
      return json({ error: "Square did not return a delivery checkout link" }, 502);
    }

    await env.DISPATCH_DB
      .prepare(`UPDATE dispatch_orders
                SET square_order_id = ?, order_total = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND status = 'AWAITING_DELIVERY_PAYMENT'`)
      .bind(squareOrderId, amountCents, dispatchOrderId)
      .run();

    return json({ success: true, dispatchOrderId, squareOrderId, checkoutUrl, amountCents });
  }

  if (url.pathname === "/api/uber-direct/quote" && request.method === "POST") {
    if (!env.UBER_DIRECT_CLIENT_ID || !env.UBER_DIRECT_CLIENT_SECRET || !env.UBER_DIRECT_CUSTOMER_ID) {
      return json({ error: "Uber Direct credentials are not configured" }, 503);
    }

    const body = await readJson(request);
    const pickupAddress = body.pickupAddress;
    const dropoffAddress = body.dropoffAddress;

    if (!pickupAddress || !dropoffAddress) {
      return json({ error: "pickupAddress and dropoffAddress are required" }, 400);
    }

    const token = await getUberAccessToken(env);
    if (!token.ok) return json({ error: "Unable to authenticate with Uber Direct", details: token.error }, 502);

    const quoteResponse = await fetch(
      `https://api.uber.com/v1/customers/${encodeURIComponent(env.UBER_DIRECT_CUSTOMER_ID)}/delivery_quotes`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          pickup_address: normalizeUberAddress(pickupAddress),
          dropoff_address: normalizeUberAddress(dropoffAddress)
        })
      }
    );

    const quote = await safeJson(quoteResponse);
    if (!quoteResponse.ok) return json(quote, quoteResponse.status);

    const feeCents = Number(quote.fee || 0);
    const customerPriceCents = Number(body.customerPriceCents || 0);
    const minimumMarginCents = Number(env.MIN_GROSS_MARGIN_CENTS || DEFAULT_MIN_GROSS_MARGIN_CENTS);
    const grossMarginCents = customerPriceCents > 0 ? customerPriceCents - feeCents : null;

    return json({
      success: true,
      quote,
      fulfillmentPriority: ["LCS", "UBER_DIRECT", "APPROVED_FALLBACK"],
      margin: {
        customerPriceCents: customerPriceCents || null,
        uberFeeCents: feeCents || null,
        grossMarginCents,
        minimumMarginCents,
        uberEligible: grossMarginCents == null ? null : grossMarginCents >= minimumMarginCents
      }
    });
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


async function getUberAccessToken(env) {
  const form = new URLSearchParams({
    client_id: env.UBER_DIRECT_CLIENT_ID,
    client_secret: env.UBER_DIRECT_CLIENT_SECRET,
    grant_type: "client_credentials",
    scope: "eats.deliveries"
  });

  const response = await fetch("https://auth.uber.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });

  const data = await safeJson(response);
  if (!response.ok || !data.access_token) {
    return { ok: false, error: data };
  }
  return { ok: true, accessToken: data.access_token };
}

function normalizeUberAddress(address) {
  return typeof address === "string" ? address : JSON.stringify(address);
}

function squareHeaders(env) {
  return {
    Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
    "Square-Version": "2026-09-16",
    "Content-Type": "application/json"
  };
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); }
  catch { return { error: "Non-JSON response", body: text.slice(0, 1000) }; }
}
