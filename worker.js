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
        const response = await fetch(
          "https://connect.squareup.com/v2/locations",
          {
            method: "GET",
            headers: squareHeaders(env)
          }
        );

        const data = await safeJson(response);

        if (!response.ok) {
          return json(data, response.status);
        }

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

        const restaurants = (data.locations || [])
          .filter(location => location.status === "ACTIVE")
          .filter(location => {
            const name = String(location.name || "").trim().toLowerCase();
            return name && !excludedNames.includes(name);
          })
          .map(location => ({
            name: location.name || "",
            locationId: location.id,
            city: location.address?.locality || "",
            state: location.address?.administrative_district_level_1 || "",
            postalCode: location.address?.postal_code || "",
            menuUrl: `/api/menu?location=${encodeURIComponent(location.id)}`
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        return json({
          service: "Courier Eats",
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

        return json({
          success: true,
          checkoutUrl:
            squareData.payment_link?.url ||
            squareData.payment_link?.long_url ||
            null,
          orderId: squareData.payment_link?.order_id || null
        });
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

        const result = await env.DISPATCH_DB
          .prepare("SELECT COUNT(*) AS count FROM dispatch_orders")
          .first();

        return json({
          service: "Lewiston Courier Dispatch",
          status: "online",
          dispatchMode: env.DISPATCH_MODE || "internal",
          database: "connected",
          orders: result?.count ?? 0
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
            "/api/dispatch/status"
          ]
        });
      }

      return json({ error: "Not found" }, 404);
    } catch (error) {
      return json(
        {
          error: "Worker error",
          message: error?.message || String(error)
        },
        500
      );
    }
  }
};

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
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
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
