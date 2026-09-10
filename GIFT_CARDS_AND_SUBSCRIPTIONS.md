# Courier Eats Gift Cards & Subscriptions

This feature is intentionally staged behind configuration. It does not issue gift-card value or create a paid subscription until the required Square settings are configured.

## Public routes

- `GET /gift-cards` — Courier Eats gift-card page.
- `GET /membership` — customer membership page.
- `GET /merchant-plans` — local restaurant subscription plans.
- `GET /api/commerce/plans` — public plan/config summary.
- `POST /api/commerce/subscription-checkout` — creates a Square-hosted subscription checkout when enabled.

## Gift cards

Launch approach: use Square's hosted eGift Card Order Site first.

Configure:

- `SQUARE_EGIFT_CARD_URL` — the hosted Square eGift Card Order Site URL.

Suggested denominations:

- $25
- $50
- $75
- $100
- Custom amount

A Courier Eats gift card should be described as redeemable through the Courier Eats/Square seller checkout that issued it. Do not promise that it can be redeemed directly at an independent partner restaurant's own register unless that merchant participates in the same Square gift-card program.

Custom Gift Cards API issuance is intentionally not enabled in this PR. Square requires the gift-card order to be paid before a digital card is created and activated. The hosted Square flow is the safer first launch path.

## Customer subscription recommendation

### Courier Eats Local Pass — $7.99/month

Suggested initial benefits:

- $1.50 off eligible Courier Eats delivery fees.
- No Courier Eats pickup service fee on eligible pickup orders.
- Member-only local restaurant promotions.
- Mileage, catering, large-order, waiting-time, and special-handling charges remain separately payable.

This is intentionally a delivery discount rather than unlimited free delivery because local independent restaurants use a 0% Courier Eats commission model and LCS still has to fund the delivery operation.

## Local restaurant subscription recommendation

### Local Connect — $49/month

- 0% Courier Eats commission unless a separate written agreement says otherwise.
- Courier Eats listing and ordering connection.
- Square/POS connection support.
- Google Business Profile order-link setup.
- Facebook/Instagram ordering-link setup.
- Cash App / Square ordering connection support.
- Menu and hours sync support.
- Standard order routing and support.

### Local Pro — $79/month

- Everything in Local Connect.
- Priority menu/channel updates.
- Multi-location support.
- Catering configuration and delivery-pricing support.
- Enhanced reporting and operational review.
- Priority integration support.

### Corporate / franchise

Use a negotiated commercial agreement with commission and authorized menu-pricing terms. Do not default a corporate/franchise account into the local 0% commission subscription model.

## Square subscription checkout

Square subscription checkout remains disabled until all required settings are configured:

- `SUBSCRIPTIONS_ENABLED=true`
- `SQUARE_LOCATION_ID`
- `SQUARE_SUB_PLAN_LOCAL_PASS`
- `SQUARE_SUB_PLAN_LOCAL_CONNECT`
- `SQUARE_SUB_PLAN_LOCAL_PRO`
- existing `SQUARE_ACCESS_TOKEN`

The three `SQUARE_SUB_PLAN_*` values must be Square subscription **plan variation IDs** that match the prices/cadences shown in Courier Eats.

When enabled, Courier Eats creates a Square-hosted payment link using `checkout_options.subscription_plan_id` so Square collects and stores the recurring payment method.

## Production checklist

1. Keep the feature draft until onboarding PR #3 is merged/rebased.
2. Create the corresponding Square subscription plan variations in a test/Sandbox environment first.
3. Configure only test IDs while validating checkout.
4. Verify the amount and cadence on the Square-hosted checkout page before completing a test subscription.
5. Configure the Square-hosted eGift Card Order Site and test one eGift purchase in the appropriate test environment/workflow.
6. Add the applicable customer/merchant terms acceptance to the final activation flow.
7. Do not publish subscription promises or gift-card redemption claims beyond what the configured Square seller account can actually honor.
8. Do not enable production charging until the exact production branch and front-end assets are verified.
