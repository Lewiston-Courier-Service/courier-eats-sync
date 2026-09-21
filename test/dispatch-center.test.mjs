import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCategory, priorityWindowMs } from "../dispatch-center.js";

test("normalizes the supported food shipment labels", () => {
  assert.equal(normalizeCategory("food truck"), "FOOD_TRUCK");
  assert.equal(normalizeCategory("Convenience Store"), "CONVENIENCE_STORE");
  assert.equal(normalizeCategory("meat-market"), "MEAT_MARKET");
  assert.equal(normalizeCategory("food/package"), "FOOD_PACKAGE");
});

test("uses a five minute priority window by default", () => {
  assert.equal(priorityWindowMs({}), 300000);
  assert.equal(priorityWindowMs({ LCS_PRIORITY_MINUTES: "10" }), 600000);
});
