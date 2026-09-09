CREATE TABLE IF NOT EXISTS restaurant_catering_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  onboarding_id INTEGER NOT NULL UNIQUE,
  offers_catering INTEGER NOT NULL DEFAULT 1,
  catering_order_url TEXT,
  catering_order_minimum_cents INTEGER,
  delivery_base_fee_cents INTEGER,
  delivery_included_miles REAL,
  delivery_per_mile_cents INTEGER,
  large_order_surcharge_cents INTEGER,
  advance_notice_hours INTEGER,
  catering_notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (onboarding_id) REFERENCES restaurant_onboarding(id)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_catering_onboarding
  ON restaurant_catering_profiles(onboarding_id);

CREATE INDEX IF NOT EXISTS idx_restaurant_catering_offers
  ON restaurant_catering_profiles(offers_catering);
