# Courier Eats Bakery and Food Trucks

## Business types

Restaurant onboarding now supports:

- `RESTAURANT`
- `BAKERY`
- `FOOD_TRUCK`

`Bakery` remains an existing menu category and also gets a dedicated `/bakery` browse section for approved bakery businesses.

## Food truck locations

Food trucks can save up to 25 recurring or regular stops. Each stop can include:

- location / venue name;
- street or venue address;
- city, state, and ZIP;
- day of week or `VARIES`;
- start and end time;
- stop-specific notes; and
- primary location flag.

Food-truck location management uses the private onboarding token and is available at:

- `GET /restaurant-onboarding/food-truck-locations?token=...`
- `GET /api/restaurants/onboarding/food-truck-locations?token=...`
- `POST /api/restaurants/onboarding/food-truck-locations`

Public browse routes:

- `GET /bakery`
- `GET /food-trucks`
- `GET /api/sections/bakery`
- `GET /api/sections/food-trucks`

Only approved businesses are returned by the public section APIs.

## Database

This feature reserves migration `006` because onboarding operations use migration `004` and catering is staged as migration `005`.

Before activating this feature, apply and verify:

```bat
..\node_modules\.bin\wrangler.cmd d1 execute courier-eats-dispatch --remote --file migrations/006-bakery-food-trucks.sql
```

Then verify both the `business_type` onboarding column and `restaurant_food_truck_locations` table.

## Production safety

Keep this PR draft until restaurant onboarding PR #3 is finalized. Do not deploy repository `dist` assets to production until the known stale-asset issue is resolved.
