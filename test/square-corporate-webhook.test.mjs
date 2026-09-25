import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { handleSquarePaymentHardening } from "../square-payment-hardening.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;
if (!globalThis.atob) {
  globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary");
}

class FakeDispatchDb {
  constructor() {
    this.status = "AWAITING_DELIVERY_PAYMENT";
    this.orderTotal = 0;
    this.dispatchEvents = [];
    this.webhookEvents = [];
  }

  prepare(sql) {
    const db = this;
    const normalized = String(sql).replace(/\s+/g, " ").trim();

    return {
      bind(...args) {
        return {
          async first() {
            if (normalized.includes("SELECT event_id FROM square_webhook_events")) {
              return null;
            }

            if (
              normalized.includes("FROM dispatch_orders") &&
              normalized.includes("square_order_id = ?")
            ) {
              return {
                id: 1,
                status: db.status,
                source: "corporate_delivery_link"
              };
            }

            if (normalized === "SELECT status FROM dispatch_orders WHERE id = ?") {
              return { status: db.status };
            }

            return null;
          },

          async run() {
            if (
              normalized.startsWith("UPDATE dispatch_orders") &&
              normalized.includes("source = 'corporate_delivery_link'")
            ) {
              const [orderTotal] = args;
              db.orderTotal = Number(orderTotal);
              db.status = "NEW";
              return { meta: { changes: 1 } };
            }

            if (normalized.startsWith("INSERT INTO dispatch_events")) {
              db.dispatchEvents.push({
                orderId: args[0],
                note: args[1]
              });
              return { meta: { changes: 1 } };
            }

            if (normalized.startsWith("INSERT OR IGNORE INTO square_webhook_events")) {
              db.webhookEvents.push({
                eventId: args[0],
                eventType: args[1],
                squareOrderId: args[2],
                result: args[3]
              });
              return { meta: { changes: 1 } };
            }

            return { meta: { changes: 0 } };
          }
        };
      }
    };
  }
}

async function hmacBase64(secret, text) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(text)
  );
  return Buffer.from(signature).toString("base64");
}

test("completed Square sandbox payment releases a corporate Delivery-Link order", async () => {
  const db = new FakeDispatchDb();
  const notificationUrl =
    "https://sandbox.couriereats.test/api/webhooks/square";
  const signatureKey = "square-test-signature-key";

  const event = {
    event_id: "evt-corporate-1",
    type: "payment.updated",
    data: {
      object: {
        payment: {
          id: "payment-1",
          status: "COMPLETED",
          order_id: "sq-order-1",
          amount_money: { amount: 1199, currency: "USD" }
        }
      }
    }
  };

  const rawBody = JSON.stringify(event);
  const signature = await hmacBase64(
    signatureKey,
    notificationUrl + rawBody
  );

  const originalFetch = globalThis.fetch;
  const seenUrls = [];

  globalThis.fetch = async (input) => {
    const url = String(input);
    seenUrls.push(url);

    if (
      url ===
      "https://connect.squareupsandbox.com/v2/orders/sq-order-1"
    ) {
      return new Response(
        JSON.stringify({
          order: {
            id: "sq-order-1",
            total_money: { amount: 1199, currency: "USD" }
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const response = await handleSquarePaymentHardening(
      new Request(notificationUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-square-hmacsha256-signature": signature
        },
        body: rawBody
      }),
      {
        DISPATCH_DB: db,
        DISPATCH_MODE: "internal",
        SQUARE_ACCESS_TOKEN: "sandbox-token",
        SQUARE_API_BASE_URL: "https://connect.squareupsandbox.com",
        SQUARE_WEBHOOK_SIGNATURE_KEY: signatureKey,
        SQUARE_WEBHOOK_NOTIFICATION_URL: notificationUrl
      }
    );

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.dispatchStatus, "NEW");
    assert.equal(body.dispatchOrderId, 1);
    assert.equal(db.status, "NEW");
    assert.equal(db.orderTotal, 1199);
    assert.equal(db.dispatchEvents.length, 1);
    assert.equal(db.webhookEvents.length, 1);
    assert.equal(db.webhookEvents[0].result, "PROCESSED");
    assert.deepEqual(seenUrls, [
      "https://connect.squareupsandbox.com/v2/orders/sq-order-1"
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
