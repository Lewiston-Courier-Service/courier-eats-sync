ALTER TABLE restaurant_onboarding ADD COLUMN business_type TEXT NOT NULL DEFAULT 'RESTAURANT';

CREATE INDEX IF NOT EXISTS idx_restaurant_onboarding_business_type
  ON restaurant_onboarding(business_type);

CREATE TABLE IF NOT EXISTS restaurant_food_truck_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  onboarding_id INTEGER NOT NULL,
  location_name TEXT NOT NULL,
  address_line_1 TEXT,
  city TEXT,
  state TEXT DEFAULT 'ME',
  postal_code TEXT,
  day_of_week TEXT,
  start_time TEXT,
  end_time TEXT,
  notes TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (onboarding_id) REFERENCES restaurant_onboarding(id)
);

CREATE INDEX IF NOT EXISTS idx_food_truck_locations_onboarding
  ON restaurant_food_truck_locations(onboarding_id);

CREATE INDEX IF NOT EXISTS idx_food_truck_locations_day
  ON restaurant_food_truck_locations(day_of_week);
