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
  assert.equal(body.deliveryQuoteEnabled, false);
  assert.equal(body.restaurants[0].deliveryQuoteEnabled, false);
  assert.equal(body.restaurants[0].integrationStatus, "CORPORATE_NOT_INTEGRATED");
  assert.equal(body.restaurants[0].pickupAddress, "841 Lisbon St, Lewiston, ME 04240");
  assert.equal(body.restaurants.length, 12);
  assert.deepEqual(
    body.restaurants.map(restaurant => restaurant.id),
    [
      "popeyes-lewiston",
      "mcdonalds-lewiston-lisbon",
      "burger-king-lewiston-lisbon",
      "burger-king-auburn-center",
      "ihop-auburn-turner",
      "buffalo-wild-wings-auburn-turner",
      "olive-garden-auburn-subaru",
      "99-restaurant-auburn-center",
      "applebees-auburn-center",
      "longhorn-auburn-subaru",
      "dennys-auburn-court",
      "kfc-lewiston-lisbon"
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
  assert.equal(
    body.restaurants[4].pickupAddress,
    "649 Turner St, Auburn, ME 04210"
  );
  assert.equal(body.restaurants[4].primaryCategory, "Breakfast");
  assert.equal(body.restaurants[0].primaryCategory, "Chicken & Wings");
  assert.equal(body.restaurants[1].primaryCategory, "Burgers");
  assert.deepEqual(body.restaurants[1].mealPeriods, ["Breakfast", "Lunch", "Dinner"]);
  assert.deepEqual(body.restaurants[2].mealPeriods, ["Breakfast", "Lunch", "Dinner"]);
  assert.deepEqual(body.restaurants[3].mealPeriods, ["Breakfast", "Lunch", "Dinner"]);
  assert.deepEqual(body.restaurants[4].mealPeriods, ["Breakfast", "Lunch", "Dinner"]);
  assert.deepEqual(body.restaurants[10].mealPeriods, ["Breakfast", "Lunch", "Dinner"]);
  assert.deepEqual(body.restaurants[0].mealPeriods, ["Lunch", "Dinner"]);
  assert.equal(body.restaurants[6].primaryCategory, "Italian");
  assert.equal(body.restaurants[9].primaryCategory, "American Grill & Steak");
  assert.equal(
    body.restaurants[11].pickupAddress,
    "1201 Lisbon St, Lewiston, ME 04240"
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
    { DISPATCH_DB: {}, CORPORATE_DELIVERY_LINK_ENABLED: "true" }
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
      SQUARE_LOCATION_ID: "test-location",
      CORPORATE_DELIVERY_LINK_ENABLED: "true"
    }
  );

  assert.equal(response.status, 409);
  const body = await response.json();
  assert.match(body.error, /server-side delivery quote/i);
});
