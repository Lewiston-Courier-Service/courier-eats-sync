export async function applySquareLocationPricing(request, env, response) {
  const url = new URL(request.url);

  if (
    url.pathname !== "/api/menu" ||
    request.method !== "GET" ||
    !response?.ok
  ) {
    return response;
  }

  const locationId = url.searchParams.get("location");
  if (!locationId || !env.SQUARE_ACCESS_TOKEN) {
    return response;
  }

  let menu;
  try {
    menu = await response.clone().json();
  } catch {
    return response;
  }

  const variationIds = [
    ...new Set(
      (menu.items || [])
        .flatMap(item => item.variations || [])
        .map(variation => variation.id)
        .filter(Boolean)
    )
  ];

  if (variationIds.length === 0) {
    return response;
  }

  const effectivePricing = new Map();

  for (let offset = 0; offset < variationIds.length; offset += 1000) {
    const objectIds = variationIds.slice(offset, offset + 1000);
    const squareResponse = await fetch(
      "https://connect.squareup.com/v2/catalog/batch-retrieve",
      {
        method: "POST",
        headers: squareHeaders(env),
        body: JSON.stringify({
          object_ids: objectIds,
          include_related_objects: false
        })
      }
    );

    if (!squareResponse.ok) {
      console.warn(
        "Unable to retrieve Square variation location pricing",
        squareResponse.status
      );
      return response;
    }

    const data = await safeJson(squareResponse);

    for (const object of data.objects || []) {
      if (object.type !== "ITEM_VARIATION" || !object.id) continue;

      const variationData = object.item_variation_data || {};
      const locationOverride = Array.isArray(variationData.location_overrides)
        ? variationData.location_overrides.find(
            override => override.location_id === locationId
          )
        : null;

      const price =
        locationOverride?.price_money?.amount ??
        variationData.price_money?.amount ??
        null;
      const currency =
        locationOverride?.price_money?.currency ||
        variationData.price_money?.currency ||
        "USD";

      effectivePricing.set(object.id, { price, currency });
    }
  }

  menu.items = (menu.items || []).map(item => ({
    ...item,
    variations: (item.variations || []).map(variation => {
      const effective = effectivePricing.get(variation.id);
      return effective
        ? {
            ...variation,
            price: effective.price,
            currency: effective.currency
          }
        : variation;
    })
  }));

  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.set("Content-Type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(menu, null, 2), {
    status: response.status,
    headers
  });
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
    return {};
  }
}
