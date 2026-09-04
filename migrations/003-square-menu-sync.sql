CREATE TABLE IF NOT EXISTS square_restaurant_locations (
  merchant_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  location_name TEXT,
  address TEXT,
  status TEXT,
  timezone TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (merchant_id, location_id)
);

CREATE TABLE IF NOT EXISTS square_restaurant_menu_items (
  merchant_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  variation_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  variation_name TEXT,
  description TEXT,
  category_id TEXT,
  category_name TEXT,
  categories_json TEXT NOT NULL DEFAULT '[]',
  price_amount INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  image_url TEXT,
  image_caption TEXT,
  location_ids_json TEXT NOT NULL DEFAULT '[]',
  modifier_list_ids_json TEXT NOT NULL DEFAULT '[]',
  item_json TEXT,
  variation_json TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (merchant_id, variation_id)
);

CREATE TABLE IF NOT EXISTS square_restaurant_menu_syncs (
  merchant_id TEXT PRIMARY KEY,
  last_synced_at TEXT,
  item_count INTEGER NOT NULL DEFAULT 0,
  image_count INTEGER NOT NULL DEFAULT 0,
  location_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_square_menu_items_merchant_category
  ON square_restaurant_menu_items(merchant_id, category_name);

CREATE INDEX IF NOT EXISTS idx_square_menu_items_item
  ON square_restaurant_menu_items(merchant_id, item_id);

CREATE INDEX IF NOT EXISTS idx_square_locations_merchant
  ON square_restaurant_locations(merchant_id);
