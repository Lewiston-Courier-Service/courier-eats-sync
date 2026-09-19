import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateProtectedCustomerPrice,
  handleCorporateDeliveryLink
} from "../corporate-delivery-link.js";

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
  assert.equal(body.restaurants.length, 4);
  assert.deepEqual(
    body.restaurants.map(restaurant => restaurant.id),
    [
      "popeyes-lewiston",
      "mcdonalds-lewiston-lisbon",
      "burger-king-lewiston-lisbon",
      "burger-king-auburn-center"
    ]
  );
  assert.equal(
    body.restaurants[1].pickupAddress,
    "1035 Lisbon St, Lewiston, ME 04240"
  );
  assert.equal(
    body.restaurants[3].pickupAddress,
    "333 Center St, Auburn, ME 04210"
  );
});

test("protected pricing preserves the minimum four dollar spread and .99 pricing", () => {
  assert.equal(calculateProtectedCustomerPrice(799, 400), 1199);
  assert.equal(calculateProtectedCustomerPrice(899, 400), 1299);
  assert.equal(calculateProtectedCustomerPrice(999, 400), 1399);
  assert.equal(calculateProtectedCustomerPrice(1099, 400), 1499);
});

test("delivery rate endpoint no longer accepts client supplied mileage by itself", async () => {
  const response = await handleCorporateDeliveryLink(
    new Request("https://couriereats.test/api/delivery/rate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ miles: 5 })
    }),
    { DISPATCH_DB: {} }
  );
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /dispatchOrderId/i);
});

test("delivery payment requires a server-side quoted amount", async () => {
  const fakeDb = {
    prepare() {
      return {
        bind() {
          return {
            async first() {
              return {
                id: 1,
                restaurant_name: "Popeyes Lewiston",
                restaurant_order_id: "ABC123",
                status: "AWAITING_DELIVERY_PAYMENT",
                delivery_fee_cents: null,
                pricing_basis: null,
                uber_quote_expires_at: null
              };
            }
          };
        }
      };
    }
  };

  const response = await handleCorporateDeliveryLink(
    new Request("https://couriereats.test/api/corporate/delivery-payment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dispatchOrderId: 1, amountCents: 100 })
    }),
    {
      DISPATCH_DB: fakeDb,
      SQUARE_ACCESS_TOKEN: "test-token",
      SQUARE_LOCATION_ID: "test-location"
    }
  );

  assert.equal(response.status, 409);
  const body = await response.json();
  assert.match(body.error, /server-side delivery quote/i);
});
