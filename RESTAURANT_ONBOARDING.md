# Courier Eats Restaurant Onboarding

## Public flow

- `GET /restaurant-onboarding` — seller application and status page.
- `POST /api/restaurants/onboarding` — create an onboarding application.
- `GET /api/restaurants/onboarding/status?token=...` — seller-safe status lookup.
- `GET /api/restaurants/onboarding/square/start?token=...` — connect a submitted Square restaurant using Square OAuth.

The public form never accepts POS passwords, Square access tokens, API keys, or webhook signing secrets.

## Admin flow

- `GET /restaurant-onboarding/admin` — browser admin console.
- `GET /api/admin/restaurants/onboarding` — list applications; requires `ADMIN_API_KEY`.
- `POST /api/admin/restaurants/onboarding/update` — update status, monthly platform fee, fee waiver date, and internal note; requires `ADMIN_API_KEY`.

Supported statuses: `SUBMITTED`, `CONNECTING_SQUARE`, `CONNECTED`, `APPROVED`, `PAUSED`, and `REJECTED`.

## Square connection

Square onboarding reuses the existing `/api/connect/square/start` flow owned by `square-menu-sync.js`, so the seller grants `ITEMS_READ` along with merchant/order/payment permissions. The generated OAuth `state` is linked to the exact onboarding application in D1. The existing Square callback is wrapped only when the state belongs to onboarding; unrelated Square callbacks continue to the existing connector.

## Database migration

Apply before enabling the onboarding routes in production:

```bat
..\node_modules\.bin\wrangler.cmd d1 execute courier-eats-dispatch --remote --file migrations/003-restaurant-onboarding.sql
```

Verify:

```bat
..\node_modules\.bin\wrangler.cmd d1 execute courier-eats-dispatch --remote --command "PRAGMA table_info('restaurant_onboarding');"
```

## Pre-deploy checks

1. `npx wrangler deploy --dry-run`
2. Submit one non-production onboarding record.
3. Verify its public status token works.
4. Verify the admin page can read and update that record using `ADMIN_API_KEY`.
5. For a Square test seller, verify OAuth returns to the onboarding status page and records the Square merchant ID.
6. Do not merge to `main` until the production/local Worker handlers missing from GitHub have been synced.
