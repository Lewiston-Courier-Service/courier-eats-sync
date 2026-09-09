CREATE TABLE IF NOT EXISTS restaurant_onboarding (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_token TEXT NOT NULL UNIQUE,
  restaurant_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address_line_1 TEXT,
  city TEXT,
  state TEXT DEFAULT 'ME',
  postal_code TEXT,
  website TEXT,
  pos_provider TEXT NOT NULL DEFAULT 'OTHER',
  delivery_platforms TEXT,
  integration_notes TEXT,
  status TEXT NOT NULL DEFAULT 'SUBMITTED',
  square_merchant_id TEXT,
  square_restaurant_name TEXT,
  monthly_fee_cents INTEGER,
  fee_waived_until TEXT,
  admin_note TEXT,
  terms_accepted INTEGER NOT NULL DEFAULT 0,
  terms_version TEXT NOT NULL DEFAULT '2026-09-08',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS restaurant_onboarding_square_states (
  state TEXT PRIMARY KEY,
  onboarding_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (onboarding_id) REFERENCES restaurant_onboarding(id)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_onboarding_status
  ON restaurant_onboarding(status);

CREATE INDEX IF NOT EXISTS idx_restaurant_onboarding_name
  ON restaurant_onboarding(restaurant_name);

CREATE INDEX IF NOT EXISTS idx_restaurant_onboarding_square_merchant
  ON restaurant_onboarding(square_merchant_id);

CREATE INDEX IF NOT EXISTS idx_restaurant_onboarding_square_state_id
  ON restaurant_onboarding_square_states(onboarding_id);
