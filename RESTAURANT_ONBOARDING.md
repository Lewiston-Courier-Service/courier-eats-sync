# Courier Eats Restaurant Onboarding

## Public flow

- `GET /restaurant-onboarding` — seller application and status page.
- `POST /api/restaurants/onboarding` — create an onboarding application.
- `GET /api/restaurants/onboarding/status?token=...` — seller-safe status lookup.
- `GET /api/restaurants/onboarding/square/start?token=...` — connect a submitted Square restaurant using Square OAuth.

The public form never accepts POS passwords, Square access tokens, API keys, or webhook signing secrets.

The operational application also captures:

- pickup, delivery, or both;
- typical prep time;
- restaurant hours;
- pickup/driver instructions;
- menu source and menu URL;
- number of locations;
- primary order-contact method; and
- special operating instructions.

A browser-generated submission key prevents ordinary network retries from creating duplicate onboarding records. A hidden honeypot field provides lightweight automated-form abuse resistance without collecting additional credentials.

## Admin flow

- `GET /restaurant-onboarding/admin` — browser admin console.
- `GET /api/admin/restaurants/onboarding` — list applications; requires `ADMIN_API_KEY`.
- `POST /api/admin/restaurants/onboarding/update` — update status, monthly platform fee, fee waiver date, internal note, and supported operational fields; requires `ADMIN_API_KEY`.

Supported statuses: `SUBMITTED`, `CONNECTING_SQUARE`, `CONNECTED`, `APPROVED`, `PAUSED`, and `REJECTED`.

## Square connection

Square onboarding reuses the existing `/api/connect/square/start` flow owned by `square-menu-sync.js`, so the seller grants `ITEMS_READ` along with merchant/order/payment permissions. The generated OAuth `state` is linked to the exact onboarding application in D1. The existing Square callback is wrapped only when the state belongs to onboarding; unrelated Square callbacks continue to the existing connector.

## Database migrations

Migration `003` creates the onboarding and Square-state tables. It has already been applied to the remote Courier Eats D1 database and should not be rewritten to add new fields.

Operational fields are added by migration `004`:

```bat
..\node_modules\.bin\wrangler.cmd d1 execute courier-eats-dispatch --remote --file migrations/004-restaurant-onboarding-operations.sql
```

Verify the operational columns after applying migration `004`:

```bat
..\node_modules\.bin\wrangler.cmd d1 execute courier-eats-dispatch --remote --command "PRAGMA table_info('restaurant_onboarding');"
```

## Pre-deploy checks

1. Run the Cloudflare Worker validation/dry-run on the exact PR head.
2. Apply migration `004-restaurant-onboarding-operations.sql` to the intended D1 environment.
3. Submit one clearly labeled non-production onboarding record.
4. Verify the public status token and operational fields.
5. Verify the admin API can read and update that record using `ADMIN_API_KEY`.
6. Submit the same browser request again and confirm retry protection does not create a second application.
7. For a Square test seller, verify OAuth returns to the onboarding status page and records the Square merchant ID.
8. Keep production assets synchronized before any production Worker deploy; the repository `dist` directory must not be allowed to roll back newer live front-end assets.
9. Keep the PR in draft until these checks pass on the exact head intended for merge.
