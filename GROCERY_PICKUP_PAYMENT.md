# Grocery Pick Up payment and dispatch gate

## Required sequence

1. The customer pays the grocery/store order directly with the store.
2. Courier Eats creates the Grocery Pick Up request in `AWAITING_PAYMENT`.
3. LCS sets the delivery/service quote on the dispatch order.
4. The customer opens the Square-hosted LCS checkout.
5. Square collects the LCS bill. Tipping is optional and is never required for dispatch.
6. A valid Square webhook is verified and the Square order is checked for a zero balance due and sufficient completed payment.
7. Only then does Courier Eats atomically change the dispatch order from `AWAITING_PAYMENT` to `NEW`.
8. `NEW` is the release point for courier dispatch.

## Routes

- `POST /api/grocery-pickup` — create the Grocery Pick Up request after the customer confirms the store items are already paid.
- `POST /api/admin/grocery-pickup/quote` — protected LCS/admin route to set the server-side delivery/service bill. Customer-supplied checkout totals are not trusted.
- `POST /api/grocery-pickup/checkout` — create/retrieve the idempotent Square-hosted checkout for the stored LCS bill.
- `POST /api/webhooks/square` — Grocery Pick Up payments are intercepted first, signature verified, full payment verified, and dispatch released only when the Square order is fully paid.
- `POST /api/admin/grocery-pickup/reconcile` — protected fallback to re-check Square if a webhook is delayed or missed.

## Safety

- The store merchandise amount is not charged by this flow; it must already be paid with the store.
- The LCS bill amount comes from the dispatch database, not a public customer amount field.
- The checkout uses Square `CreatePaymentLink` with `allow_tipping: true`.
- A tip is optional and never part of the dispatch requirement.
- Grocery checkout uses a deterministic idempotency key based on the dispatch order ID to avoid duplicate payment links on ordinary retries.
- Grocery payment release preserves the original grocery store/pickup/customer information and only changes the dispatch status/provider after payment verification.

## Configuration required before activation

- `SQUARE_ACCESS_TOKEN`
- `SQUARE_LOCATION_ID`
- `SQUARE_WEBHOOK_SIGNATURE_KEY`
- `SQUARE_WEBHOOK_NOTIFICATION_URL`
- `ADMIN_API_KEY`

No production deployment is performed by this feature branch.
