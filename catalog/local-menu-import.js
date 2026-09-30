import fs from "node:fs";

const [,, manifestPath, mode = "--dry-run"] = process.argv;

if (!manifestPath) {
  console.error("Usage: node catalog/local-menu-import.js <manifest.json> [--dry-run|--apply-sandbox]");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const isApply = mode === "--apply-sandbox";

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function assertManifest(input) {
  if (!input.restaurantName) throw new Error("restaurantName is required");
  if (!input.square?.categoryName) throw new Error("square.categoryName is required");
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("items are required");

  for (const item of input.items) {
    if (!item.name) throw new Error("every item requires a name");
    if (!Number.isInteger(item.priceCents) || item.priceCents < 0) {
      throw new Error(`verified integer priceCents required for ${item.name}`);
    }
  }
}

function buildObjects(input) {
  const categoryId = `#category-${slug(input.restaurantId)}-${slug(input.square.categoryName)}`;
  const objects = [{
    type: "CATEGORY",
    id: categoryId,
    category_data: { name: input.square.categoryName }
  }];

  input.items.forEach((item, index) => {
    const itemId = `#item-${index + 1}-${slug(item.name)}`;
    const variationId = `#variation-${index + 1}-${slug(item.name)}`;

    objects.push({
      type: "ITEM",
      id: itemId,
      present_at_all_locations: false,
      item_data: {
        name: item.name,
        ...(item.description ? { description: item.description } : {}),
        categories: [{ id: categoryId }],
        variations: [{
          type: "ITEM_VARIATION",
          id: variationId,
          present_at_all_locations: false,
          item_variation_data: {
            item_id: itemId,
            name: "Regular",
            pricing_type: "FIXED_PRICING",
            price_money: {
              amount: item.priceCents,
              currency: input.importRules?.currency || "USD"
            }
          }
        }]
      }
    });
  });

  return objects;
}

async function main() {
  assertManifest(manifest);

  const objects = buildObjects(manifest);

  if (!isApply) {
    console.log(JSON.stringify({
      restaurant: manifest.restaurantName,
      source: manifest.source,
      targetLocationId: manifest.square.targetLocationId,
      objectCount: objects.length,
      itemCount: manifest.items.length,
      mode,
      objects
    }, null, 2));
    return;
  }

  if (process.env.SQUARE_ENVIRONMENT !== "sandbox") {
    throw new Error("Refusing write: --apply-sandbox requires SQUARE_ENVIRONMENT=sandbox");
  }

  if (process.env.ALLOW_CATALOG_WRITE !== "true") {
    throw new Error("Refusing write: set ALLOW_CATALOG_WRITE=true explicitly");
  }

  if (!manifest.square.targetLocationId) {
    throw new Error("Refusing write: manifest.square.targetLocationId must be set");
  }

  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("Refusing write: SQUARE_ACCESS_TOKEN is required");
  }

  for (const object of objects) {
    object.present_at_location_ids = [manifest.square.targetLocationId];
  }

  const response = await fetch("https://connect.squareupsandbox.com/v2/catalog/batch-upsert", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Square-Version": process.env.SQUARE_VERSION || "2026-08-20"
    },
    body: JSON.stringify({
      idempotency_key: crypto.randomUUID(),
      batches: [{ objects }]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(JSON.stringify(data, null, 2));
    throw new Error(`Square sandbox catalog upsert failed: ${response.status}`);
  }

  console.log(JSON.stringify({
    success: true,
    restaurant: manifest.restaurantName,
    targetLocationId: manifest.square.targetLocationId,
    itemCount: manifest.items.length,
    response: data
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
