CREATE TABLE IF NOT EXISTS marketplace_restaurant_links (
  source TEXT NOT NULL,
  external_store_id TEXT NOT NULL,
  restaurant_id TEXT,
  merchant_id TEXT,
  location_id TEXT,
  restaurant_name TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source, external_store_id)
);

CREATE TABLE IF NOT EXISTS marketplace_orders (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  external_order_id TEXT NOT NULL,
  external_store_id TEXT,
  restaurant_id TEXT,
  merchant_id TEXT,
  location_id TEXT,
  restaurant_name TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  fulfillment_type TEXT,
  delivery_address_json TEXT,
  items_json TEXT NOT NULL DEFAULT '[]',
  subtotal_amount INTEGER NOT NULL DEFAULT 0,
  tax_amount INTEGER NOT NULL DEFAULT 0,
  tip_amount INTEGER NOT NULL DEFAULT 0,
  delivery_fee_amount INTEGER NOT NULL DEFAULT 0,
  total_amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'NEW',
  provider_status TEXT,
  provider_created_at TEXT,
  dispatch_order_id TEXT,
  raw_order_json TEXT,
  received_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (source, external_order_id)
);

CREATE TABLE IF NOT EXISTS marketplace_order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  marketplace_order_id TEXT,
  source TEXT NOT NULL,
  external_event_id TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (source, external_event_id),
  FOREIGN KEY (marketplace_order_id) REFERENCES marketplace_orders(id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_orders_source_status
  ON marketplace_orders(source, status);

CREATE INDEX IF NOT EXISTS idx_marketplace_orders_restaurant
  ON marketplace_orders(restaurant_id, received_at);

CREATE INDEX IF NOT EXISTS idx_marketplace_orders_store
  ON marketplace_orders(source, external_store_id);

CREATE INDEX IF NOT EXISTS idx_marketplace_events_order
  ON marketplace_order_events(marketplace_order_id, created_at);
