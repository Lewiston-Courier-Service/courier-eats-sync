CREATE TABLE IF NOT EXISTS square_restaurant_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_id TEXT NOT NULL UNIQUE,
  restaurant_name TEXT,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  expires_at TEXT,
  scopes TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  auto_dispatch_delivery INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS square_oauth_states (
  state TEXT PRIMARY KEY,
  restaurant_name TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS square_restaurant_webhook_events (
  event_id TEXT PRIMARY KEY,
  merchant_id TEXT,
  event_type TEXT NOT NULL,
  square_order_id TEXT,
  result TEXT NOT NULL DEFAULT 'PROCESSED',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_square_restaurant_connection_status
  ON square_restaurant_connections(status);

CREATE INDEX IF NOT EXISTS idx_square_restaurant_webhook_merchant
  ON square_restaurant_webhook_events(merchant_id);

CREATE INDEX IF NOT EXISTS idx_square_restaurant_webhook_order
  ON square_restaurant_webhook_events(square_order_id);
