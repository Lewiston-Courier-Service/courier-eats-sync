ALTER TABLE restaurant_onboarding ADD COLUMN service_mode TEXT NOT NULL DEFAULT 'BOTH';
ALTER TABLE restaurant_onboarding ADD COLUMN prep_time_minutes INTEGER;
ALTER TABLE restaurant_onboarding ADD COLUMN restaurant_hours TEXT;
ALTER TABLE restaurant_onboarding ADD COLUMN pickup_instructions TEXT;
ALTER TABLE restaurant_onboarding ADD COLUMN menu_source TEXT;
ALTER TABLE restaurant_onboarding ADD COLUMN menu_url TEXT;
ALTER TABLE restaurant_onboarding ADD COLUMN location_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE restaurant_onboarding ADD COLUMN order_contact_method TEXT;
ALTER TABLE restaurant_onboarding ADD COLUMN special_instructions TEXT;
ALTER TABLE restaurant_onboarding ADD COLUMN submission_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_restaurant_onboarding_submission_key
  ON restaurant_onboarding(submission_key)
  WHERE submission_key IS NOT NULL;
