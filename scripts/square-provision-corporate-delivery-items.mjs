import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { CORPORATE_RESTAURANTS } from "../corporate-delivery-link.js";

const cwd = process.cwd();
const fileVars = readSimpleEnvFile(path.join(cwd, ".dev.vars"));
const args = new Set(process.argv.slice(2));

const production = args.has("--production");
const sandbox = args.has("--sandbox");
const apply = args.has("--apply");

if (production === sandbox) {
  throw new Error("Choose exactly one environment: --production or --sandbox");
}

if (!apply) {
  throw new Error("This script changes Square. Re-run with --apply after reviewing the target environment.");
}

const apiBase = production
  ? "https://connect.squareup.com"
  : "https://connect.squareupsandbox.com";

const token = String(
  production
    ? process.env.SQUARE_PRODUCTION_ACCESS_TOKEN ||
      fileVars.SQUARE_PRODUCTION_ACCESS_TOKEN ||
      ""
    : process.env.SQUARE_ACCESS_TOKEN ||
      fileVars.SQUARE_ACCESS_TOKEN ||
      ""
).trim();

if (!token || /replace_with|placeholder|change-me/i.test(token)) {
  throw new Error(
    production
      ? "SQUARE_PRODUCTION_ACCESS_TOKEN is missing."
      : "SQUARE_ACCESS_TOKEN is missing."
  );
}

const squareVersion = "2026-09-16";
const categoryName = "Courier Eats - Corporate Delivery-Link";

console.log(`Target Square environment: ${production ? "PRODUCTION" : "SANDBOX"}`);
console.log("Creating/updating Courier Eats delivery service entries only.");
console.log("Restaurant food/menu items are NOT being copied into Square.\n");

const catalog = await listCatalog(apiBase, token, squareVersion);
let category = catalog.find(
  object =>
    object.type === "CATEGORY" &&
    object.category_data?.name === categoryName &&
    !object.is_deleted
);

if (!category) {
  const created = await upsertObject(
    apiBase,
    token,
    squareVersion,
    {
      type: "CATEGORY",
      id: "#courier-eats-corporate-delivery-link",
      present_at_all_locations: true,
      category_data: {
        name: categoryName
      }
    }
  );
  category = created.catalog_object;
  console.log(`Created Square category: ${categoryName}`);
} else {
  console.log(`Square category already exists: ${categoryName}`);
}

const existingNames = new Set(
  catalog
    .filter(object => object.type === "ITEM" && !object.is_deleted)
    .map(object => object.item_data?.name || "")
);

for (const restaurant of CORPORATE_RESTAURANTS) {
  const itemName = `Courier Eats Delivery - ${restaurant.name}`;

  if (existingNames.has(itemName)) {
    console.log(`SKIP: ${itemName} already exists`);
    continue;
  }

  const itemId = `#ce-${slug(restaurant.id)}`;
  const variationId = `#ce-${slug(restaurant.id)}-delivery`;

  await upsertObject(
    apiBase,
    token,
    squareVersion,
    {
      type: "ITEM",
      id: itemId,
      present_at_all_locations: true,
      item_data: {
        name: itemName,
        description:
          "Independent Lewiston Courier Service delivery after the customer orders and pays the restaurant directly. Restaurant food is not included in this Square item.",
        product_type: "REGULAR",
        categories: [{ id: category.id }],
        variations: [
          {
            type: "ITEM_VARIATION",
            id: variationId,
            present_at_all_locations: true,
            item_variation_data: {
              item_id: itemId,
              name: "Delivery",
              pricing_type: "VARIABLE_PRICING"
            }
          }
        ]
      }
    }
  );

  console.log(`CREATED: ${itemName}`);
}

console.log("\nSquare corporate delivery service provisioning complete.");
console.log(
  "Dynamic customer checkout still uses Courier Eats CreatePaymentLink pricing, so customers cannot set the delivery price themselves."
);

async function listCatalog(apiBase, token, version) {
  const objects = [];
  let cursor = "";

  do {
    const url = new URL(apiBase + "/v2/catalog/list");
    url.searchParams.set("types", "CATEGORY,ITEM");
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url, {
      headers: squareHeaders(token, version)
    });
    const data = await safeJson(response);

    if (!response.ok) {
      throw new Error(
        `Square catalog list failed (HTTP ${response.status}): ${JSON.stringify(data)}`
      );
    }

    if (Array.isArray(data.objects)) objects.push(...data.objects);
    cursor = data.cursor || "";
  } while (cursor);

  return objects;
}

async function upsertObject(apiBase, token, version, object) {
  const response = await fetch(apiBase + "/v2/catalog/object", {
    method: "POST",
    headers: squareHeaders(token, version),
    body: JSON.stringify({
      idempotency_key: randomUUID(),
      object
    })
  });
  const data = await safeJson(response);

  if (!response.ok || !data.catalog_object) {
    throw new Error(
      `Square catalog upsert failed (HTTP ${response.status}): ${JSON.stringify(data)}`
    );
  }

  return data;
}

function squareHeaders(token, version) {
  return {
    Authorization: `Bearer ${token}`,
    "Square-Version": version,
    "Content-Type": "application/json"
  };
}

function readSimpleEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: "Non-JSON response", body: text.slice(0, 1000) };
  }
}
