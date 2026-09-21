ALTER TABLE dispatch_orders ADD COLUMN shipment_category TEXT;
ALTER TABLE dispatch_orders ADD COLUMN claim_status TEXT DEFAULT 'LCS_PRIORITY';
ALTER TABLE dispatch_orders ADD COLUMN claim_deadline TEXT;
ALTER TABLE dispatch_orders ADD COLUMN claimed_at TEXT;
ALTER TABLE dispatch_orders ADD COLUMN claimed_by TEXT;
ALTER TABLE dispatch_orders ADD COLUMN fallback_provider TEXT;
ALTER TABLE dispatch_orders ADD COLUMN fallback_status TEXT;
ALTER TABLE dispatch_orders ADD COLUMN fallback_attempted_at TEXT;
ALTER TABLE dispatch_orders ADD COLUMN intake_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatch_intake_key
  ON dispatch_orders(intake_key)
  WHERE intake_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dispatch_claim_queue
  ON dispatch_orders(claim_status, claim_deadline, status);

CREATE TABLE IF NOT EXISTS dispatch_provider_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  response_code INTEGER,
  response_body TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_provider_attempt_order
  ON dispatch_provider_attempts(order_id, id DESC);
