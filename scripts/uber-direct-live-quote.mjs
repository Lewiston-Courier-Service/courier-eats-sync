import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const fileVars = readSimpleEnvFile(path.join(cwd, ".dev.vars"));
const vars = {
  ...process.env,
  ...fileVars
};

const required = [
  "UBER_DIRECT_CLIENT_ID",
  "UBER_DIRECT_CLIENT_SECRET",
  "UBER_DIRECT_CUSTOMER_ID"
];

for (const name of required) {
  const value = String(vars[name] || "").trim();
  if (!value || /change-me|your-|placeholder/i.test(value)) {
    throw new Error(`${name} is missing or still a placeholder in .dev.vars.`);
  }
}

const pickupAddress = "841 Lisbon St, Lewiston, ME 04240";
const pickupPostalCode = "04240";
const dropoffAddress =
  getArg("--dropoff") || "1 Great Falls Plaza, Auburn, ME 04210";
const dropoffPostalCode = getArg("--zip") || extractPostalCode(dropoffAddress);

if (!dropoffPostalCode) {
  throw new Error(
    "Could not determine the dropoff ZIP. Pass --zip 04210 (or another ZIP)."
  );
}

console.log("Uber Direct live quote test");
console.log(`Pickup:  ${pickupAddress}`);
console.log(`Dropoff: ${dropoffAddress}`);
console.log("This test requests a quote only. It does NOT create a delivery.\n");

const tokenResponse = await fetch("https://auth.uber.com/oauth/v2/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: vars.UBER_DIRECT_CLIENT_ID,
    client_secret: vars.UBER_DIRECT_CLIENT_SECRET,
    grant_type: "client_credentials",
    scope: "eats.deliveries"
  })
});

const tokenData = await safeJson(tokenResponse);

if (!tokenResponse.ok || !tokenData.access_token) {
  console.error(`FAIL: Uber OAuth returned HTTP ${tokenResponse.status}.`);
  console.error(JSON.stringify(redact(tokenData), null, 2));
  process.exit(1);
}

console.log("PASS: Uber OAuth authentication succeeded.");

const quoteResponse = await fetch(
  `https://api.uber.com/v1/customers/${encodeURIComponent(
    vars.UBER_DIRECT_CUSTOMER_ID
  )}/delivery_quotes`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      pickup_address: normalizeUberAddress(pickupAddress, pickupPostalCode),
      dropoff_address: normalizeUberAddress(
        dropoffAddress,
        dropoffPostalCode
      )
    })
  }
);

const quote = await safeJson(quoteResponse);

if (!quoteResponse.ok) {
  console.error(
    `FAIL: Uber Direct Create Quote returned HTTP ${quoteResponse.status}.`
  );
  console.error(JSON.stringify(redact(quote), null, 2));
  process.exit(1);
}

const uberFeeCents = Number(quote.fee || 0);
if (!Number.isInteger(uberFeeCents) || uberFeeCents <= 0) {
  console.error("FAIL: Uber Direct returned a quote without a valid fee.");
  console.error(JSON.stringify(redact(quote), null, 2));
  process.exit(1);
}

const minimumMarginCents = Number(vars.MIN_GROSS_MARGIN_CENTS || 400);
const customerPriceCents = calculateProtectedCustomerPrice(
  uberFeeCents,
  minimumMarginCents
);
const grossMarginCents = customerPriceCents - uberFeeCents;

console.log("PASS: Uber Direct quote succeeded.\n");
console.log(`Quote ID:          ${quote.id || "(none)"}`);
console.log(`Uber fee:          $${(uberFeeCents / 100).toFixed(2)}`);
console.log(
  `Courier Eats price: $${(customerPriceCents / 100).toFixed(2)}`
);
console.log(`Gross margin:       $${(grossMarginCents / 100).toFixed(2)}`);
console.log(`Quote expires:      ${quote.expires || "(not returned)"}`);
console.log(
  `Pickup duration:    ${quote.pickup_duration ?? "(not returned)"} min`
);
console.log(
  `Total duration:     ${quote.duration ?? "(not returned)"} min`
);
console.log(
  `Margin protected:   ${grossMarginCents >= minimumMarginCents ? "YES" : "NO"}`
);
console.log("\nNo Uber delivery was created.");

function normalizeUberAddress(address, postalCode = "") {
  return JSON.stringify({
    street_address: [String(address || "").trim()],
    zip_code: String(postalCode || "").trim(),
    country: "US"
  });
}

function calculateProtectedCustomerPrice(
  uberFeeCents,
  minimumMarginCents = 400
) {
  const protectedPrice = uberFeeCents + minimumMarginCents;
  const roundedToNinetyNine =
    Math.ceil((protectedPrice + 1) / 100) * 100 - 1;
  return Math.max(1199, roundedToNinetyNine);
}

function extractPostalCode(address) {
  const match = String(address || "").match(/\b\d{5}(?:-\d{4})?\b/);
  return match ? match[0] : "";
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
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

async function safeJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: "Non-JSON response", body: text.slice(0, 1000) };
  }
}

function redact(value) {
  const secretKeys = new Set([
    "access_token",
    "client_secret",
    "client_id",
    "customer_id"
  ]);

  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;

  const copy = {};
  for (const [key, item] of Object.entries(value)) {
    copy[key] = secretKeys.has(key.toLowerCase()) ? "[REDACTED]" : redact(item);
  }
  return copy;
}
