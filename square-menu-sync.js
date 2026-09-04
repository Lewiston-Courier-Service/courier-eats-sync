const SQUARE_VERSION = "2026-08-19";
const START_ROUTE = "/api/connect/square/start";
const SYNC_ROUTE = "/api/connect/square/sync";
const MENU_ROUTE = "/api/connect/square/menu";

export async function handleSquareMenuSync(request, env) {
  const url = new URL(request.url);

  if (![START_ROUTE, SYNC_ROUTE, MENU_ROUTE].includes(url.pathname)) {
    return null;
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders()
    });
  }

  try {
    if (url.pathname === START_ROUTE && request.method === "GET") {
      return await startOAuthWithCatalogPermission(url, env);
    }

    if (url.pathname === SYNC_ROUTE && request.method === "POST") {
      return await syncRestaurantMenu(request, env);
    }

    if (url.pathname === MENU_ROUTE && request.method === "GET") {
      return await getSyncedMenu(url, env);
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    console.error("Square menu sync error:", error);
    return json(
      {
        error: "Square menu sync error",
        message: error instanceof Error ? error.message : "Internal server error"
      },
      500
    );
  }
}

async function startOAuthWithCatalogPermission(url, env) {
  if (env.SQUARE_RESTAURANT_CONNECTOR_ENABLED !== "true") {
    return json({ error: "Square restaurant connector is disabled" }, 503);
  }

  if (!env.DISPATCH_DB) {
    return json({ error: "Dispatch database is not bound" }, 500);
  }

  if (!env.SQUARE_APP_ID) {
    return json({ error: "SQUARE_APP_ID is not configured" }, 503);
  }

  const restaurantName = String(url.searchParams.get("restaurant") || "").trim();
  const state = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await env.DISPATCH_DB
    .prepare(
      `INSERT INTO square_oauth_states
        (state, restaurant_name, expires_at)
       VALUES (?, ?, ?)`
    )
    .bind(state, restaurantName || null, expiresAt)
    .run();

  const scope = [
    "MERCHANT_PROFILE_READ",
    "ORDERS_READ",
    "ORDERS_WRITE",
    "PAYMENTS_READ",
    "ITEMS_READ"
  ].join(" ");

  const authorizeUrl = new URL("https://connect.squareup.com/oauth2/authorize");
  authorizeUrl.searchParams.set("client_id", env.SQUARE_APP_ID);
  authorizeUrl.searchParams.set("scope", scope);
  authorizeUrl.searchParams.set("session", "false");
  authorizeUrl.searchParams.set("state", state);

  if (env.SQUARE_OAUTH_REDIRECT_URL) {
    authorizeUrl.searchParams.set("redirect_uri", env.SQUARE_OAUTH_REDIRECT_URL);
  }

  return Response.redirect(authorizeUrl.toString(), 302);
}

async function syncRestaurantMenu(request, env) {
  if (!env.DISPATCH_DB) {
    return json({ error: "Dispatch database is not bound" }, 500);
  }

  if (!isAdminRequest(request, env)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const body = await safeRequestJson(request);
  const merchantId = String(body.merchantId || "").trim();

  if (!merchantId) {
    return json({ error: "merchantId is required" }, 400);
  }

  const connection = await env.DISPATCH_DB
    .prepare(
      `SELECT *
       FROM square_restaurant_connections
       WHERE merchant_id = ?
         AND status = 'ACTIVE'
       LIMIT 1`
    )
    .bind(merchantId)
    .first();

  if (!connection) {
    return json({ error: "Connected Square restaurant not found" }, 404);
  }

  const scopes = String(connection.scopes || "")
    .split(/\s+/)
    .filter(Boolean);

  if (!scopes.includes("ITEMS_READ")) {
    return json(
      {
        error: "Square catalog permission is missing",
        reconnectRequired: true,
        requiredScope: "ITEMS_READ",
        reconnectUrl: `${new URL(request.url).origin}${START_ROUTE}?restaurant=${encodeURIComponent(connection.restaurant_name || "")}`
      },
      409
    );
  }

  const accessToken = await getUsableAccessToken(connection, env);
  const [locations, catalogObjects] = await Promise.all([
    fetchLocations(accessToken),
    fetchCatalog(accessToken)
  ]);

  const images = new Map();
  const categories = new Map();
  const standaloneVariations = new Map();

  for (const object of catalogObjects) {
    if (!object || object.is_deleted) continue;

    if (object.type === "IMAGE") {
      images.set(object.id, {
        url: object.image_data?.url || "",
        caption: object.image_data?.caption || ""
      });
    } else if (object.type === "CATEGORY") {
      categories.set(object.id, {
        id: object.id,
        name: object.category_data?.name || "",
        type: object.category_data?.category_type || ""
      });
    } else if (object.type === "ITEM_VARIATION") {
      standaloneVariations.set(object.id, object);
    }
  }

  const locationIds = locations
    .filter(location => location?.id)
    .map(location => location.id);

  const rows = [];
  let imageCount = 0;

  for (const object of catalogObjects) {
    if (!object || object.is_deleted || object.type !== "ITEM") continue;

    const itemData = object.item_data || {};
    const itemCategoryRefs = Array.isArray(itemData.categories)
      ? itemData.categories
      : [];
    const categoryIds = itemCategoryRefs
      .map(entry => entry?.id)
      .filter(Boolean);

    if (categoryIds.length === 0 && itemData.category_id) {
      categoryIds.push(itemData.category_id);
    }

    const categoryNames = categoryIds
      .map(categoryId => categories.get(categoryId)?.name || "")
      .filter(Boolean);

    const primaryCategoryId = categoryIds[0] || null;
    const primaryCategoryName = categoryNames[0] || null;
    const itemImageIds = Array.isArray(itemData.image_ids)
      ? itemData.image_ids
      : [];

    const embeddedVariations = Array.isArray(itemData.variations)
      ? itemData.variations
      : [];

    const variations = embeddedVariations.length
      ? embeddedVariations
      : Array.from(standaloneVariations.values()).filter(
          variation => variation.item_variation_data?.item_id === object.id
        );

    for (const variation of variations) {
      if (!variation || variation.is_deleted || !variation.id) continue;

      const variationData = variation.item_variation_data || {};
      const variationImageIds = Array.isArray(variationData.image_ids)
        ? variationData.image_ids
        : [];
      const imageIds = variationImageIds.length
        ? variationImageIds
        : itemImageIds;
      const primaryImage = imageIds.length ? images.get(imageIds[0]) : null;

      if (primaryImage?.url) imageCount += 1;

      const effectiveLocationIds = resolveLocationIds(
        variation,
        object,
        locationIds
      );

      const modifierListIds = Array.isArray(itemData.modifier_list_info)
        ? itemData.modifier_list_info
            .map(info => info?.modifier_list_id)
            .filter(Boolean)
        : [];

      rows.push({
        merchantId,
        itemId: object.id,
        variationId: variation.id,
        itemName: itemData.name || "",
        variationName: variationData.name || "",
        description:
          itemData.description_plaintext ||
          itemData.description ||
          stripHtml(itemData.description_html || ""),
        categoryId: primaryCategoryId,
        categoryName: primaryCategoryName,
        categoriesJson: JSON.stringify(
          categoryIds.map((id, index) => ({
            id,
            name: categoryNames[index] || categories.get(id)?.name || ""
          }))
        ),
        priceAmount: Number(variationData.price_money?.amount ?? 0),
        currency: variationData.price_money?.currency || "USD",
        imageUrl: primaryImage?.url || "",
        imageCaption: primaryImage?.caption || "",
        locationIdsJson: JSON.stringify(effectiveLocationIds),
        modifierListIdsJson: JSON.stringify(modifierListIds),
        itemJson: JSON.stringify(object),
        variationJson: JSON.stringify(variation)
      });
    }
  }

  await env.DISPATCH_DB
    .prepare("DELETE FROM square_restaurant_locations WHERE merchant_id = ?")
    .bind(merchantId)
    .run();

  await env.DISPATCH_DB
    .prepare("DELETE FROM square_restaurant_menu_items WHERE merchant_id = ?")
    .bind(merchantId)
    .run();

  await runInBatches(
    env.DISPATCH_DB,
    locations
      .filter(location => location?.id)
      .map(location =>
        env.DISPATCH_DB
          .prepare(
            `INSERT INTO square_restaurant_locations
              (merchant_id, location_id, location_name, address, status, timezone, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
          )
          .bind(
            merchantId,
            location.id,
            location.name || "",
            formatAddress(location.address),
            location.status || "",
            location.timezone || ""
          )
      )
  );

  await runInBatches(
    env.DISPATCH_DB,
    rows.map(row =>
      env.DISPATCH_DB
        .prepare(
          `INSERT INTO square_restaurant_menu_items
            (
              merchant_id,
              item_id,
              variation_id,
              item_name,
              variation_name,
              description,
              category_id,
              category_name,
              categories_json,
              price_amount,
              currency,
              image_url,
              image_caption,
              location_ids_json,
              modifier_list_ids_json,
              item_json,
              variation_json,
              updated_at
            )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
        )
        .bind(
          row.merchantId,
          row.itemId,
          row.variationId,
          row.itemName,
          row.variationName,
          row.description,
          row.categoryId,
          row.categoryName,
          row.categoriesJson,
          row.priceAmount,
          row.currency,
          row.imageUrl,
          row.imageCaption,
          row.locationIdsJson,
          row.modifierListIdsJson,
          row.itemJson,
          row.variationJson
        )
    )
  );

  await env.DISPATCH_DB
    .prepare(
      `INSERT INTO square_restaurant_menu_syncs
        (merchant_id, last_synced_at, item_count, image_count, location_count, status, last_error)
       VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, 'OK', NULL)
       ON CONFLICT(merchant_id) DO UPDATE SET
         last_synced_at = CURRENT_TIMESTAMP,
         item_count = excluded.item_count,
         image_count = excluded.image_count,
         location_count = excluded.location_count,
         status = 'OK',
         last_error = NULL`
    )
    .bind(merchantId, rows.length, imageCount, locations.length)
    .run();

  return json({
    synced: true,
    merchantId,
    restaurantName: connection.restaurant_name || "",
    locations: locations.length,
    menuRows: rows.length,
    menuRowsWithImages: imageCount
  });
}

async function getSyncedMenu(url, env) {
  if (!env.DISPATCH_DB) {
    return json({ error: "Dispatch database is not bound" }, 500);
  }

  const merchantId = String(url.searchParams.get("merchantId") || "").trim();
  const locationId = String(url.searchParams.get("location") || "").trim();

  if (!merchantId) {
    return json({ error: "merchantId is required" }, 400);
  }

  const connection = await env.DISPATCH_DB
    .prepare(
      `SELECT merchant_id AS merchantId, restaurant_name AS restaurantName
       FROM square_restaurant_connections
       WHERE merchant_id = ? AND status = 'ACTIVE'
       LIMIT 1`
    )
    .bind(merchantId)
    .first();

  if (!connection) {
    return json({ error: "Restaurant not found" }, 404);
  }

  const result = await env.DISPATCH_DB
    .prepare(
      `SELECT
         item_id AS itemId,
         variation_id AS variationId,
         item_name AS name,
         variation_name AS variationName,
         description,
         category_id AS categoryId,
         category_name AS categoryName,
         categories_json AS categoriesJson,
         price_amount AS priceAmount,
         currency,
         image_url AS imageUrl,
         image_caption AS imageCaption,
         location_ids_json AS locationIdsJson,
         modifier_list_ids_json AS modifierListIdsJson
       FROM square_restaurant_menu_items
       WHERE merchant_id = ?
       ORDER BY category_name, item_name, variation_name`
    )
    .bind(merchantId)
    .all();

  const items = (result.results || [])
    .map(row => ({
      ...row,
      categories: parseJsonArray(row.categoriesJson),
      locationIds: parseJsonArray(row.locationIdsJson),
      modifierListIds: parseJsonArray(row.modifierListIdsJson)
    }))
    .filter(item => !locationId || item.locationIds.includes(locationId))
    .map(({ categoriesJson, locationIdsJson, modifierListIdsJson, ...item }) => item);

  const sync = await env.DISPATCH_DB
    .prepare(
      `SELECT last_synced_at AS lastSyncedAt, status
       FROM square_restaurant_menu_syncs
       WHERE merchant_id = ?`
    )
    .bind(merchantId)
    .first();

  return json({
    merchantId,
    restaurantName: connection.restaurantName || "",
    locationId: locationId || null,
    lastSyncedAt: sync?.lastSyncedAt || null,
    count: items.length,
    items
  });
}

async function fetchLocations(accessToken) {
  const response = await fetch("https://connect.squareup.com/v2/locations", {
    method: "GET",
    headers: squareHeaders(accessToken)
  });
  const data = await safeResponseJson(response);

  if (!response.ok) {
    throw new Error(`Square locations request failed (${response.status})`);
  }

  return Array.isArray(data.locations) ? data.locations : [];
}

async function fetchCatalog(accessToken) {
  const objects = [];
  let cursor = "";

  do {
    const url = new URL("https://connect.squareup.com/v2/catalog/list");
    url.searchParams.set(
      "types",
      "CATEGORY,ITEM,ITEM_VARIATION,MODIFIER_LIST,MODIFIER,IMAGE"
    );
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: squareHeaders(accessToken)
    });
    const data = await safeResponseJson(response);

    if (!response.ok) {
      throw new Error(`Square catalog request failed (${response.status})`);
    }

    if (Array.isArray(data.objects)) objects.push(...data.objects);
    cursor = data.cursor || "";
  } while (cursor);

  return objects;
}

async function getUsableAccessToken(connection, env) {
  const accessToken = await decryptSecret(
    connection.access_token_enc,
    env.CONNECTOR_ENCRYPTION_KEY
  );

  const expiresAt = connection.expires_at
    ? Date.parse(connection.expires_at)
    : Number.NaN;

  const refreshNeeded =
    Number.isFinite(expiresAt) && expiresAt <= Date.now() + 24 * 60 * 60 * 1000;

  if (!refreshNeeded || !connection.refresh_token_enc) {
    return accessToken;
  }

  const refreshToken = await decryptSecret(
    connection.refresh_token_enc,
    env.CONNECTOR_ENCRYPTION_KEY
  );

  const response = await fetch("https://connect.squareup.com/oauth2/token", {
    method: "POST",
    headers: {
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: env.SQUARE_APP_ID,
      client_secret: env.SQUARE_APP_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });

  const data = await safeResponseJson(response);
  if (!response.ok || !data.access_token) {
    throw new Error("Unable to refresh connected Square access token");
  }

  const accessTokenEnc = await encryptSecret(
    data.access_token,
    env.CONNECTOR_ENCRYPTION_KEY
  );
  const refreshTokenEnc = data.refresh_token
    ? await encryptSecret(data.refresh_token, env.CONNECTOR_ENCRYPTION_KEY)
    : connection.refresh_token_enc;

  await env.DISPATCH_DB
    .prepare(
      `UPDATE square_restaurant_connections
       SET access_token_enc = ?,
           refresh_token_enc = ?,
           expires_at = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE merchant_id = ?`
    )
    .bind(
      accessTokenEnc,
      refreshTokenEnc,
      data.expires_at || null,
      connection.merchant_id
    )
    .run();

  return data.access_token;
}

function resolveLocationIds(variation, item, allLocationIds) {
  const source = hasLocationRules(variation) ? variation : item;

  if (source.present_at_all_locations !== false) {
    const absent = new Set(source.absent_at_location_ids || []);
    return allLocationIds.filter(id => !absent.has(id));
  }

  return Array.isArray(source.present_at_location_ids)
    ? source.present_at_location_ids
    : [];
}

function hasLocationRules(object) {
  return (
    Object.prototype.hasOwnProperty.call(object || {}, "present_at_all_locations") ||
    Array.isArray(object?.present_at_location_ids) ||
    Array.isArray(object?.absent_at_location_ids)
  );
}

async function runInBatches(db, statements, batchSize = 50) {
  for (let index = 0; index < statements.length; index += batchSize) {
    await db.batch(statements.slice(index, index + batchSize));
  }
}

function isAdminRequest(request, env) {
  if (!env.ADMIN_API_KEY) return false;
  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const headerKey = request.headers.get("x-admin-key") || "";
  return bearer === env.ADMIN_API_KEY || headerKey === env.ADMIN_API_KEY;
}

function squareHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Square-Version": SQUARE_VERSION,
    "Content-Type": "application/json"
  };
}

async function safeRequestJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function safeResponseJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: "Non-JSON response", body: text.slice(0, 1000) };
  }
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

async function encryptSecret(value, base64Key) {
  if (!value) return null;
  const key = await importKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(value);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext)
  );
  return `v1:${bytesToBase64(iv)}:${bytesToBase64(ciphertext)}`;
}

async function decryptSecret(value, base64Key) {
  if (!value) throw new Error("Missing encrypted connector secret");
  const parts = String(value).split(":");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new Error("Unsupported encrypted connector secret format");
  }

  const iv = base64ToBytes(parts[1]);
  const ciphertext = base64ToBytes(parts[2]);
  if (!iv || !ciphertext) throw new Error("Invalid encrypted connector secret");

  const key = await importKey(base64Key);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plaintext);
}

async function importKey(base64Key) {
  const bytes = base64ToBytes(base64Key || "");
  if (!bytes || bytes.length !== 32) {
    throw new Error("CONNECTOR_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Key"
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
