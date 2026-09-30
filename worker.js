const BREAKFAST_RESTAURANTS = [
  {
    id: "happy-days-diner",
    name: "Happy Days Diner",
    categories: ["Breakfast", "Lunch"],
    address: "67 Mill St",
    city: "Auburn",
    state: "ME",
    postalCode: "04210",
    phone: "207-783-1800",
    menuUrl: "https://www.grubhub.com/restaurant/happy-days-diner-67-mill-st-auburn/6213000",
    orderUrl: "https://www.grubhub.com/restaurant/happy-days-diner-67-mill-st-auburn/6213000",
    orderingMode: "EXTERNAL",
    checkoutEnabled: false
  },
  {
    id: "rollys-diner",
    name: "Rolly's Diner",
    categories: ["Breakfast", "Lunch"],
    address: "87 Mill St",
    city: "Auburn",
    state: "ME",
    postalCode: "04210",
    phone: "207-753-0171",
    menuUrl: "https://www.rollysnewauburn.com/",
    orderUrl: null,
    orderingMode: "CALL_TO_ORDER",
    checkoutEnabled: false
  },
  {
    id: "frans-restaurant",
    name: "Fran's Restaurant",
    categories: ["Breakfast", "Lunch"],
    address: "1485 Lisbon St",
    city: "Lewiston",
    state: "ME",
    postalCode: "04240",
    phone: null,
    menuUrl: "https://www.allmenus.com/me/lewiston/747499-frans-restaurant/menu/",
    orderUrl: null,
    orderingMode: "CALL_TO_ORDER",
    checkoutEnabled: false
  },
  {
    id: "roys-all-steak-hamburgers",
    name: "Roy's All Steak Hamburgers",
    categories: ["Breakfast", "Lunch"],
    address: "5 Washington St",
    city: "Auburn",
    state: "ME",
    postalCode: "04210",
    phone: "207-783-4304",
    menuUrl: "https://menusinla.com/restaurants/roys-all-steak-hamburgers",
    orderUrl: null,
    orderingMode: "CALL_TO_ORDER",
    checkoutEnabled: false
  },
  {
    id: "station-grill",
    name: "Station Grill Restaurant",
    categories: ["Breakfast", "Lunch", "Dinner"],
    address: "103 Lincoln St",
    city: "Lewiston",
    state: "ME",
    postalCode: "04240",
    phone: "207-333-5062",
    menuUrl: "https://www.stationgrillrestaurant.com/breakfast-menu-the-station-grill-restaurant",
    orderUrl: "https://stationgrill.hrpos.heartland.us/menu",
    orderingMode: "EXTERNAL",
    checkoutEnabled: false
  },
  {
    id: "kristis-cafe",
    name: "Kristi's Cafe",
    categories: ["Breakfast", "Lunch"],
    address: "767 Minot Ave",
    city: "Auburn",
    state: "ME",
    postalCode: "04210",
    phone: "207-241-7460",
    menuUrl: "https://kristiscafe.com/breakfast-menu/",
    orderUrl: null,
    orderingMode: "CALL_TO_ORDER",
    checkoutEnabled: false
  },
  {
    id: "dubois-cafe",
    name: "Dubois Cafe",
    categories: ["Breakfast", "Lunch"],
    address: "906 Sabattus St",
    city: "Lewiston",
    state: "ME",
    postalCode: "04240",
    phone: null,
    menuUrl: "https://www.ubereats.com/store/dubois-cafe/4UIhO4HES62bO_vjrW1jsQ",
    orderUrl: "https://www.ubereats.com/store/dubois-cafe/4UIhO4HES62bO_vjrW1jsQ",
    orderingMode: "EXTERNAL",
    checkoutEnabled: false
  },
  {
    id: "forage-market-lewiston",
    name: "Forage Market",
    categories: ["Breakfast", "Lunch", "Bakery"],
    address: "180 Lisbon St",
    city: "Lewiston",
    state: "ME",
    postalCode: "04240",
    phone: "207-333-6840",
    menuUrl: "https://www.foragemarket.com/the-market",
    orderUrl: "https://order.toasttab.com/online/foragelewiston",
    orderingMode: "EXTERNAL",
    checkoutEnabled: false
  },
  {
    id: "governors-lewiston",
    name: "Governor's Restaurant & Bakery",
    categories: ["Breakfast", "Lunch", "Dinner", "Bakery", "Catering"],
    address: "1185 Lisbon St",
    city: "Lewiston",
    state: "ME",
    postalCode: "04240",
    phone: "207-753-0173",
    menuUrl: "https://www.governorsrestaurant.com/menus/",
    orderUrl: "https://www.governorsrestaurant.com/order/",
    orderingMode: "EXTERNAL",
    checkoutEnabled: false
  },
  {
    id: "italian-bakery-lewiston",
    name: "The Italian Bakery",
    categories: ["Breakfast", "Lunch", "Bakery", "Catering"],
    address: "225 Bartlett St",
    city: "Lewiston",
    state: "ME",
    postalCode: "04240",
    phone: "207-782-8312",
    menuUrl: "https://theitalianbakeryme.com/breakfast/",
    orderUrl: null,
    orderingMode: "CALL_TO_ORDER",
    checkoutEnabled: false
  },
  {
    id: "cupcakery-lewiston",
    name: "The Cupcakery Cafe & Bake Shop",
    categories: ["Breakfast", "Lunch", "Bakery", "Catering"],
    address: "56 Sabattus St",
    city: "Lewiston",
    state: "ME",
    postalCode: "04240",
    phone: "207-784-2253",
    menuUrl: "https://www.thecupcakery.org/menu",
    orderUrl: null,
    orderingMode: "CALL_TO_ORDER",
    checkoutEnabled: false
  },
  {
    id: "georgios-pizza-donut-shop",
    name: "Georgio's Pizza & Donut Shop",
    categories: ["Breakfast", "Lunch", "Dinner", "Pizza", "Bakery"],
    address: "740 Minot Ave",
    city: "Auburn",
    state: "ME",
    postalCode: "04210",
    phone: "207-783-2981",
    menuUrl: "https://georgiosauburn.com/menu/",
    orderUrl: "https://www.georgiospizzadonutshopmenu.com/",
    orderingMode: "EXTERNAL",
    checkoutEnabled: false
  }
];

function normalizeRestaurantName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    try {
      if (url.pathname === "/api/restaurants") {
        const requestedCategory = String(
          url.searchParams.get("category") || ""
        ).trim();

        const excludedNames = [
          "DumpIt4Me",
          "Dump",
          "Moving Services",
          "Assembly",
          "Legal Courier",
          "Courier Eats",
          "C EATS",
          "C express",
          "Wil_Smith"
        ].map(name => name.toLowerCase());

        const byName = new Map(
          BREAKFAST_RESTAURANTS.map(restaurant => [
            normalizeRestaurantName(restaurant.name),
            { ...restaurant, locationId: null }
          ])
        );

        if (env.SQUARE_ACCESS_TOKEN) {
          const response = await fetch(
            "https://connect.squareup.com/v2/locations",
            {
              method: "GET",
              headers: squareHeaders(env)
            }
          );

          const data = await safeJson(response);

          if (response.ok) {
            for (const location of data.locations || []) {
              if (location.status !== "ACTIVE") {
                continue;
              }

              const name = String(location.name || "").trim();
              if (!name || excludedNames.includes(name.toLowerCase())) {
                continue;
              }

              const key = normalizeRestaurantName(name);
              const directoryRestaurant = byName.get(key);

              byName.set(key, {
                ...(directoryRestaurant || {
                  id: key.replace(/\s+/g, "-"),
                  name,
                  categories: []
                }),
                name,
                locationId: location.id,
                city: location.address?.locality || directoryRestaurant?.city || "",
                state:
                  location.address?.administrative_district_level_1 ||
                  directoryRestaurant?.state ||
                  "",
                postalCode:
                  location.address?.postal_code ||
                  directoryRestaurant?.postalCode ||
                  "",
                menuUrl: `/api/menu?location=${encodeURIComponent(location.id)}`,
                orderUrl: null,
                orderingMode: "SQUARE",
                checkoutEnabled: true
              });
            }
          } else {
            console.warn(
              "Unable to load Square locations for restaurant directory",
              response.status
            );
          }
        }

        let restaurants = [...byName.values()];

        if (requestedCategory) {
          const wanted = requestedCategory.toLowerCase();
          restaurants = restaurants.filter(restaurant =>
            (restaurant.categories || []).some(
              category => String(category).toLowerCase() === wanted
            )
          );
        }

        restaurants.sort((a, b) => a.name.localeCompare(b.name));

        return json({
          service: "Courier Eats",
          category: requestedCategory || null,
          count: restaurants.length,
          restaurants
        });
      }

      if (url.pathname === "/api/locations") {
        return await squareProxy(
          "https://connect.squareup.com/v2/locations",
          env
        );
      }

      if (url.pathname === "/api/catalog") {
        return await squareProxy(
          "https://connect.squareup.com/v2/catalog/list?types=CATEGORY,ITEM,ITEM_VARIATION",
          env
        );
      }

      if (url.pathname === "/api/menu") {
        const locationId = url.searchParams.get("location");

        if (!locationId) {
          return json(
            {
              error: "Missing location",
              example: "/api/menu?location=LOCATION_ID"
            },
            400
          );
        }

        const response = await fetch(
          "https://connect.squareup.com/v2/catalog/search-catalog-items",
          {
            method: "POST",
            headers: squareHeaders(env),
            body: JSON.stringify({
              enabled_location_ids: [locationId],
              limit: 100
            })
          }
        );

        const data = await safeJson(response);

        if (!response.ok) {
          return json(data, response.status);
        }

        const rawItems = Array.isArray(data.items) ? data.items : [];

        const categoryIds = [
          ...new Set(
            rawItems.flatMap(item => {
              const modern = Array.isArray(item.item_data?.categories)
                ? item.item_data.categories.map(category => category.id).filter(Boolean)
                : [];

              const legacy = item.item_data?.category_id
                ? [item.item_data.category_id]
                : [];

              return [...modern, ...legacy];
            })
          )
        ];

        const categoryMap = {};

        if (categoryIds.length > 0) {
          const categoryResponse = await fetch(
            "https://connect.squareup.com/v2/catalog/batch-retrieve",
            {
              method: "POST",
              headers: squareHeaders(env),
              body: JSON.stringify({
                object_ids: categoryIds,
                include_related_objects: false
              })
            }
          );

          const categoryData = await safeJson(categoryResponse);

          if (categoryResponse.ok) {
            for (const object of categoryData.objects || []) {
              if (object.type === "CATEGORY") {
                categoryMap[object.id] = object.category_data?.name || "";
              }
            }
          }
        }

        const items = rawItems.map(item => {
          const modernIds = Array.isArray(item.item_data?.categories)
            ? item.item_data.categories.map(category => category.id).filter(Boolean)
            : [];

          const legacyIds = item.item_data?.category_id
            ? [item.item_data.category_id]
            : [];

          const ids = [...modernIds, ...legacyIds];

          const squareCategories = [
            ...new Set(ids.map(id => categoryMap[id]).filter(Boolean))
          ];

          return {
            id: item.id,
            name: item.item_data?.name || "",
            description: item.item_data?.description || "",
            courierCategory: classifyCourierCategory(
              item.item_data?.name || "",
              squareCategories
            ),
            squareCategories,
            categoryIds: [...new Set(ids)],
            variations: (item.item_data?.variations || []).map(variation => ({
              id: variation.id,
              name: variation.item_variation_data?.name || "",
              price: variation.item_variation_data?.price_money?.amount ?? null,
              currency:
                variation.item_variation_data?.price_money?.currency || "USD"
            }))
          };
        });

        return json({
          service: "Courier Eats",
          locationId,
          categories: [
            "Breakfast",
            "Lunch",
            "Dinner",
            "Bakery",
            "Pizza",
            "World Food",
            "Seafood"
          ],
          count: items.length,
          items,
          cursor: data.cursor || null
        });
      }

      if (url.pathname === "/api/checkout" && request.method === "POST") {
        const body = await request.json();
        const locationId = body.locationId;
        const cartItems = Array.isArray(body.items) ? body.items : [];

        if (!locationId) {
          return json({ error: "Missing locationId" }, 400);
        }

        if (cartItems.length === 0) {
          return json({ error: "Cart is empty" }, 400);
        }

        if (!env.DISPATCH_DB) {
          return json({ error: "Dispatch database is not bound" }, 500);
        }

        const lineItems = cartItems
          .filter(item => item.variationId)
          .map(item => ({
            catalog_object_id: item.variationId,
            quantity: String(
              Math.max(1, parseInt(item.quantity || 1, 10))
            )
          }));

        if (lineItems.length === 0) {
          return json(
            { error: "No valid Square item variations in cart" },
            400
          );
        }

        const squareResponse = await fetch(
          "https://connect.squareup.com/v2/online-checkout/payment-links",
          {
            method: "POST",
            headers: squareHeaders(env),
            body: JSON.stringify({
              idempotency_key: crypto.randomUUID(),
              order: {
                location_id: locationId,
                line_items: lineItems
              },
              checkout_options: {
                redirect_url: "https://couriereats.com/?order=complete",
                ask_for_shipping_address: true,
                allow_tipping: true
              },
              payment_note: "Courier Eats order"
            })
          }
        );

        const squareData = await safeJson(squareResponse);

        if (!squareResponse.ok) {
          return json(squareData, squareResponse.status);
        }

        const orderId = squareData.payment_link?.order_id || null;

        if (!orderId) {
          return json({ error: "Square checkout did not return an order ID" }, 502);
        }

        await env.DISPATCH_DB
          .prepare(
            `INSERT OR IGNORE INTO dispatch_orders
              (square_order_id, source, restaurant_location_id, status, dispatch_provider)
             VALUES (?, 'courier_eats', ?, 'AWAITING_PAYMENT', ?)`
          )
          .bind(orderId, locationId, env.DISPATCH_MODE || "internal")
          .run();

        return json({
          success: true,
          checkoutUrl:
            squareData.payment_link?.url ||
            squareData.payment_link?.long_url ||
            null,
          orderId
        });
      }

      if (url.pathname === "/api/webhooks/square" && request.method === "POST") {
        return await handleSquareWebhook(request, env, url);
      }

      if (url.pathname === "/api/dispatch/status") {
        if (!env.DISPATCH_DB) {
          return json(
            {
              service: "Lewiston Courier Dispatch",
              status: "error",
              dispatchMode: env.DISPATCH_MODE || "internal",
              database: "not bound"
            },
            500
          );
        }

        const total = await env.DISPATCH_DB
          .prepare("SELECT COUNT(*) AS count FROM dispatch_orders")
          .first();

        const ready = await env.DISPATCH_DB
          .prepare("SELECT COUNT(*) AS count FROM dispatch_orders WHERE status = 'NEW'")
          .first();

        const awaitingPayment = await env.DISPATCH_DB
          .prepare("SELECT COUNT(*) AS count FROM dispatch_orders WHERE status = 'AWAITING_PAYMENT'")
          .first();

        return json({
          service: "Lewiston Courier Dispatch",
          status: "online",
          dispatchMode: env.DISPATCH_MODE || "internal",
          database: "connected",
          orders: total?.count ?? 0,
          readyForDispatch: ready?.count ?? 0,
          awaitingPayment: awaitingPayment?.count ?? 0
        });
      }

      if (url.pathname === "/api" || url.pathname === "/api/") {
        return json({
          name: "Courier Eats API",
          status: "online",
          endpoints: [
            "/api/restaurants",
            "/api/locations",
            "/api/catalog",
            "/api/menu?location=LOCATION_ID",
            "/api/checkout",
            "/api/webhooks/square",
            "/api/dispatch/status"
          ]
        });
      }

      return json({ error: "Not found" }, 404);
    } catch (error) {
      console.error("Worker error:", error);
      return json(
        {
          error: "Worker error",
          message: "Internal server error"
        },
        500
      );
    }
  }
};

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

  if (eventType !== "payment.updated") {
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
    // Square sends payment webhooks for the whole seller account. Ignore payments
    // that were not first registered by Courier Eats checkout.
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
    return json({ error: "Unable to retrieve paid Square order" }, 502);
  }

  const order = orderData.order;
  const fulfillment = Array.isArray(order.fulfillments)
    ? order.fulfillments[0]
    : null;
  const recipient = getFulfillmentRecipient(fulfillment);
  const deliveryAddress = formatAddress(recipient?.address);
  const customerName = recipient?.display_name || "";
  const customerPhone = recipient?.phone_number || "";
  const locationId = order.location_id || payment.location_id || "";

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

  const orderTotal = Number(order.total_money?.amount ?? payment.amount_money?.amount ?? 0);

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
       WHERE id = ?`
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
      dispatchOrder.id
    )
    .run();

  await env.DISPATCH_DB
    .prepare(
      `INSERT INTO dispatch_events (order_id, status, note)
       VALUES (?, 'NEW', 'Square payment completed; order released to dispatch')`
    )
    .bind(dispatchOrder.id)
    .run();

  await rememberSquareWebhookEvent(env, eventId, eventType, orderId, "PROCESSED");

  return json({
    received: true,
    orderId,
    dispatchOrderId: dispatchOrder.id,
    dispatchStatus: "NEW"
  });
}

async function rememberSquareWebhookEvent(env, eventId, eventType, orderId, result) {
  if (!eventId) {
    return;
  }

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
  if (!fulfillment) {
    return null;
  }

  return (
    fulfillment.delivery_details?.recipient ||
    fulfillment.shipment_details?.recipient ||
    fulfillment.pickup_details?.recipient ||
    null
  );
}

function formatAddress(address) {
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

async function squareProxy(endpoint, env) {
  const response = await fetch(endpoint, {
    method: "GET",
    headers: squareHeaders(env)
  });

  const data = await safeJson(response);
  return json(data, response.status);
}

async function safeJson(response) {
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

function classifyCourierCategory(itemName, categoryNames = []) {
  const text = `${itemName} ${categoryNames.join(" ")}`.toLowerCase();

  if (/breakfast|brunch|pancake|waffle|omelet|omelette|egg|bacon/.test(text)) {
    return "Breakfast";
  }

  if (/bakery|pastry|bread|donut|doughnut|cake|cupcake|muffin|cookie|croissant/.test(text)) {
    return "Bakery";
  }

  if (/pizza|calzone/.test(text)) {
    return "Pizza";
  }

  if (/seafood|fish|lobster|shrimp|clam|haddock|scallop|crab/.test(text)) {
    return "Seafood";
  }

  if (/thai|indian|mexican|jamaican|chinese|greek|asian|italian|mediterranean|sushi|vietnamese|korean/.test(text)) {
    return "World Food";
  }

  if (/lunch|sandwich|wrap|burger|salad|soup/.test(text)) {
    return "Lunch";
  }

  return "Dinner";
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Square-HmacSha256-Signature"
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
