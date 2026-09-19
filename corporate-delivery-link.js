export const CORPORATE_RESTAURANTS = [
  {
    id: "popeyes-lewiston",
    brand: "Popeyes",
    name: "Popeyes Lewiston",
    orderingMode: "DELIVERY_LINK",
    integrationStatus: "CORPORATE_NOT_INTEGRATED",
    coreMarket: "Twin City",
    corePostalCodes: ["04240", "04210"],
    orderUrl: "https://www.popeyes.com/",
    pickupAddress: "841 Lisbon St, Lewiston, ME 04240",
    deliveryEnabled: true
  },
  {
    id: "mcdonalds-lewiston-lisbon",
    brand: "McDonald's",
    name: "McDonald's Lewiston - Lisbon St",
    orderingMode: "DELIVERY_LINK",
    integrationStatus: "CORPORATE_NOT_INTEGRATED",
    coreMarket: "Twin City",
    corePostalCodes: ["04240", "04210"],
    orderUrl: "https://www.mcdonalds.com/us/en-us.html",
    pickupAddress: "1035 Lisbon St, Lewiston, ME 04240",
    deliveryEnabled: true
  },
  {
    id: "burger-king-lewiston-lisbon",
    brand: "Burger King",
    name: "Burger King Lewiston - Lisbon St",
    orderingMode: "DELIVERY_LINK",
    integrationStatus: "CORPORATE_NOT_INTEGRATED",
    coreMarket: "Twin City",
    corePostalCodes: ["04240", "04210"],
    orderUrl: "https://www.bk.com/",
    pickupAddress: "827 Lisbon St, Lewiston, ME 04240",
    deliveryEnabled: true
  },
  {
    id: "burger-king-auburn-center",
    brand: "Burger King",
    name: "Burger King Auburn - Center St",
    orderingMode: "DELIVERY_LINK",
    integrationStatus: "CORPORATE_NOT_INTEGRATED",
    coreMarket: "Twin City",
    corePostalCodes: ["04240", "04210"],
    orderUrl: "https://www.bk.com/",
    pickupAddress: "333 Center St, Auburn, ME 04210",
    deliveryEnabled: true
  },
  {
    id: "ihop-auburn-turner",
    brand: "IHOP",
    name: "IHOP Auburn - Turner St",
    orderingMode: "DELIVERY_LINK",
    integrationStatus: "CORPORATE_NOT_INTEGRATED",
    coreMarket: "Twin City",
    corePostalCodes: ["04240", "04210"],
    orderUrl: "https://restaurants.ihop.com/en-us/me/auburn/breakfast-649-turner-st-3534",
    pickupAddress: "649 Turner St, Auburn, ME 04210",
    deliveryEnabled: true
  },
  {
    id: "buffalo-wild-wings-auburn-turner",
    brand: "Buffalo Wild Wings",
    name: "Buffalo Wild Wings Auburn - Turner St",
    orderingMode: "DELIVERY_LINK",
    integrationStatus: "CORPORATE_NOT_INTEGRATED",
    coreMarket: "Twin City",
    corePostalCodes: ["04240", "04210"],
    orderUrl: "https://www.buffalowildwings.com/",
    pickupAddress: "648 Turner St #2, Auburn, ME 04210",
    deliveryEnabled: true
  },
  {
    id: "olive-garden-auburn-subaru",
    brand: "Olive Garden",
    name: "Olive Garden Auburn - Subaru Dr",
    orderingMode: "DELIVERY_LINK",
    integrationStatus: "CORPORATE_NOT_INTEGRATED",
    coreMarket: "Twin City",
    corePostalCodes: ["04240", "04210"],
    orderUrl: "https://www.olivegarden.com/",
    pickupAddress: "10 Subaru Dr, Auburn, ME 04210",
    deliveryEnabled: true
  },
  {
    id: "99-restaurant-auburn-center",
    brand: "99 Restaurants",
    name: "99 Restaurant Auburn - Center St",
    orderingMode: "DELIVERY_LINK",
    integrationStatus: "CORPORATE_NOT_INTEGRATED",
    coreMarket: "Twin City",
    corePostalCodes: ["04240", "04210"],
    orderUrl: "https://www.99restaurants.com/locations/maine/auburn/",
    pickupAddress: "650 Center St, Auburn, ME 04210",
    deliveryEnabled: true
  },
  {
    id: "applebees-auburn-center",
    brand: "Applebee's",
    name: "Applebee's Auburn - Center St",
    orderingMode: "DELIVERY_LINK",
    integrationStatus: "CORPORATE_NOT_INTEGRATED",
    coreMarket: "Twin City",
    corePostalCodes: ["04240", "04210"],
    orderUrl: "https://restaurants.applebees.com/en-us/me/auburn/599-center-street-83062",
    pickupAddress: "599 Center St, Auburn, ME 04210",
    deliveryEnabled: true
  },
  {
    id: "longhorn-auburn-subaru",
    brand: "LongHorn Steakhouse",
    name: "LongHorn Steakhouse Auburn - Subaru Dr",
    orderingMode: "DELIVERY_LINK",
    integrationStatus: "CORPORATE_NOT_INTEGRATED",
    coreMarket: "Twin City",
    corePostalCodes: ["04240", "04210"],
    orderUrl: "https://www.longhornsteakhouse.com/",
    pickupAddress: "14 Subaru Dr, Auburn, ME 04210",
    deliveryEnabled: true
  },
  {
    id: "dennys-auburn-court",
    brand: "Denny's",
    name: "Denny's Auburn - Court St",
    orderingMode: "DELIVERY_LINK",
    integrationStatus: "CORPORATE_NOT_INTEGRATED",
    coreMarket: "Twin City",
    corePostalCodes: ["04240", "04210"],
    orderUrl: "https://locations.dennys.com/me/auburn/246354",
    pickupAddress: "211 Court St, Auburn, ME 04210",
    deliveryEnabled: true
  },
  {
    id: "kfc-lewiston-lisbon",
    brand: "KFC",
    name: "KFC Lewiston - Lisbon St",
    orderingMode: "DELIVERY_LINK",
    integrationStatus: "CORPORATE_NOT_INTEGRATED",
    coreMarket: "Twin City",
    corePostalCodes: ["04240", "04210"],
    orderUrl: "https://www.kfc.com/",
    pickupAddress: "1201 Lisbon St, Lewiston, ME 04240",
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
    const deliveryQuoteEnabled =
      String(env.CORPORATE_DELIVERY_LINK_ENABLED || "false").toLowerCase() === "true";

    return json({
      service: "Courier Eats Corporate Delivery-Link",
      deliveryQuoteEnabled,
      restaurants: CORPORATE_RESTAURANTS.map(restaurant => ({
        ...restaurant,
        deliveryQuoteEnabled
      }))
    });
  }

  if (
    url.pathname.startsWith("/api/corporate/") &&
    url.pathname !== "/api/corporate/restaurants" &&
    String(env.CORPORATE_DELIVERY_LINK_ENABLED || "false").toLowerCase() !== "true"
  ) {
    return json(
      {
        error: "Courier Eats corporate delivery pricing is temporarily unavailable",
        code: "CORPORATE_DELIVERY_TEMPORARILY_DISABLED"
      },
      503
    );
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

    const duplicate = await env.DISPATCH_DB
      .prepare(
        `SELECT id, status
         FROM dispatch_orders
         WHERE source = 'corporate_delivery_link'
           AND restaurant_name = ?
           AND restaurant_order_id = ?
         LIMIT 1`
      )
      .bind(restaurant.name, restaurantOrderId)
      .first();

    if (duplicate) {
      return json({
        error: "This restaurant order number is already in Courier Eats",
        dispatchOrderId: duplicate.id,
        status: duplicate.status
      }, 409);
    }

    const result = await env.DISPATCH_DB
      .prepare(
        `INSERT INTO dispatch_orders
          (source, restaurant_name, restaurant_location_id, restaurant_order_id,
           ordering_mode, customer_name, customer_phone, pickup_address,
           delivery_address, delivery_postal_code, status, dispatch_provider)
         VALUES ('corporate_delivery_link', ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 'AWAITING_DELIVERY_PAYMENT', 'internal')`
      )
      .bind(
        restaurant.name,
        restaurant.id,
        restaurantOrderId,
        restaurant.orderingMode,
        blankToNull(customerName),
        blankToNull(customerPhone),
        restaurant.pickupAddress,
        deliveryAddress,
        deliveryPostalCode
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

    if (!Number.isInteger(dispatchOrderId) || dispatchOrderId <= 0) {
      return json({ error: "Valid dispatchOrderId is required" }, 400);
    }

    const dispatchOrder = await env.DISPATCH_DB
      .prepare(
        `SELECT id, restaurant_name, restaurant_order_id, status,
                delivery_fee_cents, pricing_basis, uber_quote_expires_at
         FROM dispatch_orders
         WHERE id = ? AND source = 'corporate_delivery_link'
         LIMIT 1`
      )
      .bind(dispatchOrderId)
      .first();

    if (!dispatchOrder) return json({ error: "Delivery-Link order not found" }, 404);
    if (dispatchOrder.status !== "AWAITING_DELIVERY_PAYMENT") {
      return json({
        error: "Order is not awaiting delivery payment",
        status: dispatchOrder.status
      }, 409);
    }

    const amountCents = Number(dispatchOrder.delivery_fee_cents || 0);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return json({
        error: "A server-side delivery quote is required before payment"
      }, 409);
    }

    if (
      dispatchOrder.uber_quote_expires_at &&
      Date.parse(dispatchOrder.uber_quote_expires_at) <= Date.now()
    ) {
      return json({
        error: "The delivery quote expired. Request a new delivery rate before payment."
      }, 409);
    }

    const squareResponse = await fetch(`${squareApiBase(env)}/v2/online-checkout/payment-links`, {
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
      .prepare(
        `UPDATE dispatch_orders
         SET square_order_id = ?, order_total = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'AWAITING_DELIVERY_PAYMENT'`
      )
      .bind(squareOrderId, amountCents, dispatchOrderId)
      .run();

    return json({
      success: true,
      dispatchOrderId,
      squareOrderId,
      checkoutUrl,
      amountCents,
      pricingBasis: dispatchOrder.pricing_basis || null
    });
  }

  if (
    (url.pathname === "/api/uber-direct/quote" ||
      url.pathname === "/api/delivery/rate") &&
    request.method === "POST"
  ) {
    if (
      String(env.CORPORATE_DELIVERY_LINK_ENABLED || "false").toLowerCase() !== "true"
    ) {
      return json(
        {
          error: "Courier Eats corporate delivery pricing is temporarily unavailable",
          code: "CORPORATE_DELIVERY_TEMPORARILY_DISABLED"
        },
        503
      );
    }
    if (!env.DISPATCH_DB) {
      return json({ error: "Dispatch database is not bound" }, 500);
    }

    const body = await readJson(request);
    const dispatchOrderId = Number(body.dispatchOrderId || 0);

    if (!Number.isInteger(dispatchOrderId) || dispatchOrderId <= 0) {
      return json({ error: "Valid dispatchOrderId is required" }, 400);
    }

    if (
      !env.UBER_DIRECT_CLIENT_ID ||
      !env.UBER_DIRECT_CLIENT_SECRET ||
      !env.UBER_DIRECT_CUSTOMER_ID
    ) {
      return json({ error: "Uber Direct credentials are not configured" }, 503);
    }

    const dispatchOrder = await env.DISPATCH_DB
      .prepare(
        `SELECT id, restaurant_name, pickup_address, delivery_address,
                delivery_postal_code, status
         FROM dispatch_orders
         WHERE id = ? AND source = 'corporate_delivery_link'
         LIMIT 1`
      )
      .bind(dispatchOrderId)
      .first();

    if (!dispatchOrder) {
      return json({ error: "Delivery-Link order not found" }, 404);
    }

    if (dispatchOrder.status !== "AWAITING_DELIVERY_PAYMENT") {
      return json({
        error: "Order is not awaiting delivery pricing",
        status: dispatchOrder.status
      }, 409);
    }

    const quoteResult = await createUberDeliveryQuote(env, {
      pickupAddress: dispatchOrder.pickup_address,
      dropoffAddress: dispatchOrder.delivery_address,
      dropoffPostalCode: dispatchOrder.delivery_postal_code
    });

    if (!quoteResult.ok) {
      return json(quoteResult.error, quoteResult.status || 502);
    }

    const quote = quoteResult.quote;
    const uberFeeCents = Number(quote.fee || 0);
    if (!Number.isInteger(uberFeeCents) || uberFeeCents <= 0) {
      return json({ error: "Uber Direct returned an invalid delivery fee" }, 502);
    }

    const minimumMarginCents = Number(
      env.MIN_GROSS_MARGIN_CENTS || DEFAULT_MIN_GROSS_MARGIN_CENTS
    );
    const customerPriceCents = calculateProtectedCustomerPrice(
      uberFeeCents,
      minimumMarginCents
    );
    const grossMarginCents = customerPriceCents - uberFeeCents;

    await env.DISPATCH_DB
      .prepare(
        `UPDATE dispatch_orders
         SET delivery_fee_cents = ?,
             pricing_basis = 'uber_quote_plus_margin',
             uber_quote_id = ?,
             uber_quote_fee_cents = ?,
             uber_quote_expires_at = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND source = 'corporate_delivery_link'
           AND status = 'AWAITING_DELIVERY_PAYMENT'`
      )
      .bind(
        customerPriceCents,
        blankToNull(quote.id),
        uberFeeCents,
        blankToNull(quote.expires),
        dispatchOrderId
      )
      .run();

    return json({
      quoted: true,
      serverPriced: true,
      dispatchOrderId,
      customerPriceCents,
      customerPrice: (customerPriceCents / 100).toFixed(2),
      pricingBasis: "uber_quote_plus_margin",
      fulfillmentPriority: ["LCS", "UBER_DIRECT", "APPROVED_FALLBACK"],
      uberDirect: {
        quoteId: quote.id || null,
        quoteExpiresAt: quote.expires || null,
        feeCents: uberFeeCents,
        pickupDurationMinutes: quote.pickup_duration ?? null,
        durationMinutes: quote.duration ?? null,
        grossMarginCents,
        minimumMarginCents,
        marginProtected: grossMarginCents >= minimumMarginCents
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

async function createUberDeliveryQuote(env, {
  pickupAddress,
  dropoffAddress,
  dropoffPostalCode
}) {
  if (!pickupAddress || !dropoffAddress) {
    return {
      ok: false,
      status: 400,
      error: { error: "Pickup and delivery addresses are required" }
    };
  }

  const token = await getUberAccessToken(env);
  if (!token.ok) {
    return {
      ok: false,
      status: 502,
      error: {
        error: "Unable to authenticate with Uber Direct",
        details: token.error
      }
    };
  }

  const quoteResponse = await fetch(
    `https://api.uber.com/v1/customers/${encodeURIComponent(
      env.UBER_DIRECT_CUSTOMER_ID
    )}/delivery_quotes`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        pickup_address: normalizeUberAddress(
          pickupAddress,
          extractPostalCode(pickupAddress)
        ),
        dropoff_address: normalizeUberAddress(
          dropoffAddress,
          dropoffPostalCode
        )
      })
    }
  );

  const quote = await safeJson(quoteResponse);
  if (!quoteResponse.ok) {
    return { ok: false, status: quoteResponse.status, error: quote };
  }

  return { ok: true, quote };
}

function normalizeUberAddress(address, postalCode = "") {
  if (address && typeof address === "object") {
    return JSON.stringify(address);
  }

  const payload = {
    street_address: [String(address || "").trim()],
    country: "US"
  };

  if (postalCode) {
    payload.zip_code = String(postalCode).trim();
  }

  return JSON.stringify(payload);
}

function extractPostalCode(address) {
  const match = String(address || "").match(/\b\d{5}(?:-\d{4})?\b/);
  return match ? match[0] : "";
}

export function calculateProtectedCustomerPrice(
  uberFeeCents,
  minimumMarginCents = DEFAULT_MIN_GROSS_MARGIN_CENTS
) {
  const fee = Number(uberFeeCents);
  const margin = Number(minimumMarginCents);

  if (!Number.isInteger(fee) || fee <= 0) {
    throw new TypeError("uberFeeCents must be a positive integer");
  }

  if (!Number.isInteger(margin) || margin < 0) {
    throw new TypeError("minimumMarginCents must be a non-negative integer");
  }

  const protectedPrice = fee + margin;
  const roundedToNinetyNine = Math.ceil((protectedPrice + 1) / 100) * 100 - 1;
  return Math.max(TWIN_CITY_RATES[0].customerPriceCents, roundedToNinetyNine);
}

function squareApiBase(env) {
  return String(env.SQUARE_API_BASE_URL || "https://connect.squareup.com")
    .replace(/\/+$/, "");
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
