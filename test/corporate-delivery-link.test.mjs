import test from "node:test";
import assert from "node:assert/strict";
import { handleCorporateDeliveryLink } from "../corporate-delivery-link.js";

test("lists configured corporate restaurants", async () => {
  const response = await handleCorporateDeliveryLink(
    new Request("https://couriereats.test/api/corporate/restaurants"),
    {}
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.restaurants[0].id, "popeyes-lewiston");
  assert.equal(body.restaurants[0].integrationStatus, "CORPORATE_NOT_INTEGRATED");
  assert.equal(body.restaurants[0].pickupAddress, "841 Lisbon St, Lewiston, ME 04240");
});

test("returns the configured Twin City delivery rate", async () => {
  const response = await handleCorporateDeliveryLink(
    new Request("https://couriereats.test/api/delivery/rate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ miles: 5 })
    }),
    {}
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.customerPriceCents, 1199);
  assert.deepEqual(body.fulfillmentPriority, ["LCS", "UBER_DIRECT", "APPROVED_FALLBACK"]);
});

test("sends distances beyond the configured table to manual review", async () => {
  const response = await handleCorporateDeliveryLink(
    new Request("https://couriereats.test/api/delivery/rate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ miles: 10.1 })
    }),
    {}
  );
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.manualReview, true);
});

test("rejects arbitrary client supplied delivery payment amounts", async () => {
  const response = await handleCorporateDeliveryLink(
    new Request("https://couriereats.test/api/corporate/delivery-payment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dispatchOrderId: 1, amountCents: 100 })
    }),
    {
      DISPATCH_DB: {},
      SQUARE_ACCESS_TOKEN: "test-token",
      SQUARE_LOCATION_ID: "test-location"
    }
  );
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /configured Courier Eats rate/i);
});
