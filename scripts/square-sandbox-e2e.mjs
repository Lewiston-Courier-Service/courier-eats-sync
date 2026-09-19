import {
  existsSync,
  readFileSync,
  rmSync
} from "node:fs";
import path from "node:path";
import {
  execFileSync,
  spawn,
  spawnSync
} from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const cwd = process.cwd();
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const stateDir = path.resolve(cwd, ".wrangler/state/square-sandbox-e2e");
const baseUrl = "http://127.0.0.1:8788";
const vars = {
  ...readSimpleEnvFile(path.join(cwd, ".dev.vars")),
  ...process.env
};

requireSandboxConfiguration(vars);

let worker = null;

try {
  rmSync(stateDir, { recursive: true, force: true });

  runWrangler([
    "d1", "execute", "courier-eats-dispatch",
    "--local",
    "--persist-to", stateDir,
    "--file=test/fixtures/dispatch-schema-pre-005.sql"
  ]);

  runWrangler([
    "d1", "execute", "courier-eats-dispatch",
    "--local",
    "--persist-to", stateDir,
    "--file=migrations/005-corporate-delivery-link.sql"
  ]);

  worker = spawn(
    npx,
    [
      "wrangler", "dev",
      "--local",
      "--port", "8788",
      "--persist-to", stateDir
    ],
    {
      cwd,
      env: process.env,
      stdio: ["ignore", "inherit", "inherit"]
    }
  );

  await waitForWorker();

  const restaurantOrderId = `SANDBOX-${Date.now()}`;
  const createResponse = await fetch(`${baseUrl}/api/corporate/delivery-link`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      restaurantId: "popeyes-lewiston",
      restaurantOrderId,
      customerName: "Square Sandbox Test",
      customerPhone: "2075550100",
      deliveryAddress: "1 Great Falls Plaza, Auburn, ME 04210",
      deliveryPostalCode: "04210"
    })
  });

  const created = await createResponse.json();

  if (!createResponse.ok || !created.dispatchOrderId) {
    throw new Error(
      `Unable to create sandbox Delivery-Link order: ${JSON.stringify(created)}`
    );
  }

  const dispatchOrderId = Number(created.dispatchOrderId);

  // This test isolates Square Checkout from the Uber quote dependency.
  // Production still requires a server-side quote before payment.
  runWrangler([
    "d1", "execute", "courier-eats-dispatch",
    "--local",
    "--persist-to", stateDir,
    "--command",
    `UPDATE dispatch_orders
       SET delivery_fee_cents = 1199,
           pricing_basis = 'square_sandbox_e2e',
           uber_quote_expires_at = NULL
       WHERE id = ${dispatchOrderId};`
  ]);

  const paymentResponse = await fetch(
    `${baseUrl}/api/corporate/delivery-payment`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dispatchOrderId })
    }
  );

  const payment = await paymentResponse.json();

  if (!paymentResponse.ok || !payment.checkoutUrl) {
    throw new Error(
      `Unable to create Square Sandbox checkout: ${JSON.stringify(payment)}`
    );
  }

  console.log("\nSquare Sandbox checkout created successfully.");
  console.log(`Dispatch order: ${dispatchOrderId}`);
  console.log(`Restaurant order: ${restaurantOrderId}`);
  console.log("\nOPEN THIS SANDBOX CHECKOUT LINK:");
  console.log(payment.checkoutUrl);
  console.log(
    "\nComplete the Square Sandbox payment, then return here. " +
    "Do not use a real card."
  );

  const rl = readline.createInterface({ input, output });
  await rl.question("\nPress Enter after the Sandbox payment is complete...");
  rl.close();

  const reconciled = await waitForReconciliation(dispatchOrderId);

  if (!reconciled) {
    throw new Error(
      "Square Sandbox payment was not confirmed before the test timed out."
    );
  }

  console.log("\nPASS: Square Sandbox payment was verified.");
  console.log(
    "PASS: Corporate Delivery-Link moved from " +
    "AWAITING_DELIVERY_PAYMENT to NEW."
  );
  console.log(
    "The real external webhook is not exercised by this localhost test; " +
    "that path is covered by the signed webhook integration test in npm test."
  );
} finally {
  stopWorker(worker);
}

function readSimpleEnvFile(filePath) {
  if (!existsSync(filePath)) return {};

  const values = {};

  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function requireSandboxConfiguration(values) {
  const required = [
    "SQUARE_ACCESS_TOKEN",
    "SQUARE_LOCATION_ID",
    "ADMIN_API_KEY"
  ];

  const missing = required.filter((key) => {
    const value = String(values[key] || "");
    return !value || /replace_with|placeholder/i.test(value);
  });

  if (missing.length) {
    throw new Error(
      "Missing Sandbox settings in .dev.vars: " + missing.join(", ")
    );
  }

  const apiBase = String(
    values.SQUARE_API_BASE_URL ||
    "https://connect.squareup.com"
  );

  if (!apiBase.includes("squareupsandbox.com")) {
    throw new Error(
      "Safety stop: SQUARE_API_BASE_URL must point to Square Sandbox. " +
      "Expected https://connect.squareupsandbox.com"
    );
  }
}

function runWrangler(args) {
  execFileSync(npx, ["wrangler", ...args], {
    cwd,
    stdio: "inherit"
  });
}

async function waitForWorker() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/corporate/restaurants`);
      if (response.ok) return;
    } catch {}

    await sleep(1000);
  }

  throw new Error("Local Wrangler Worker did not become ready.");
}

async function waitForReconciliation(dispatchOrderId) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/dispatch/reconcile`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-key": vars.ADMIN_API_KEY
      },
      body: JSON.stringify({ id: dispatchOrderId })
    });

    const body = await response.json();

    if (response.ok && body.status === "NEW") {
      return true;
    }

    if (response.status !== 409) {
      console.log(
        `Reconcile check ${attempt + 1}: ${JSON.stringify(body)}`
      );
    }

    await sleep(3000);
  }

  return false;
}

function stopWorker(child) {
  if (!child || child.killed) return;

  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore"
    });
    return;
  }

  child.kill("SIGTERM");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
