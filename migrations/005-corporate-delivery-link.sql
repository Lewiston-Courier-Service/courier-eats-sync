ALTER TABLE dispatch_orders ADD COLUMN restaurant_order_id TEXT;
ALTER TABLE dispatch_orders ADD COLUMN delivery_postal_code TEXT;
ALTER TABLE dispatch_orders ADD COLUMN ordering_mode TEXT;
ALTER TABLE dispatch_orders ADD COLUMN delivery_fee_cents INTEGER;
ALTER TABLE dispatch_orders ADD COLUMN pricing_basis TEXT;
ALTER TABLE dispatch_orders ADD COLUMN uber_quote_id TEXT;
ALTER TABLE dispatch_orders ADD COLUMN uber_quote_fee_cents INTEGER;
ALTER TABLE dispatch_orders ADD COLUMN uber_quote_expires_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatch_corporate_restaurant_order
  ON dispatch_orders(source, restaurant_name, restaurant_order_id)
  WHERE source = 'corporate_delivery_link'
    AND restaurant_order_id IS NOT NULL;
