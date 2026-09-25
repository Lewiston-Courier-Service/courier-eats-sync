CREATE TABLE IF NOT EXISTS dispatch_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  square_order_id TEXT,
  source TEXT DEFAULT 'courier_eats',
  restaurant_name TEXT,
  restaurant_location_id TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  pickup_address TEXT,
  delivery_address TEXT,
  order_total INTEGER DEFAULT 0,
  status TEXT DEFAULT 'NEW',
  dispatch_provider TEXT DEFAULT 'internal',
  provider_order_id TEXT,
  assigned_driver_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatch_square_order_id
  ON dispatch_orders(square_order_id);

CREATE TABLE IF NOT EXISTS drivers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  status TEXT DEFAULT 'AVAILABLE',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dispatch_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  note TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS square_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  square_order_id TEXT,
  result TEXT NOT NULL DEFAULT 'PROCESSED',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_square_webhook_events_order_id
  ON square_webhook_events(square_order_id);
