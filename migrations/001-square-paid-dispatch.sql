CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatch_square_order_id
  ON dispatch_orders(square_order_id);

CREATE TABLE IF NOT EXISTS square_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  square_order_id TEXT,
  result TEXT NOT NULL DEFAULT 'PROCESSED',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_square_webhook_events_order_id
  ON square_webhook_events(square_order_id);
