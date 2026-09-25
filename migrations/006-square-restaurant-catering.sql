ALTER TABLE square_oauth_states
ADD COLUMN catering TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE square_restaurant_connections
ADD COLUMN catering TEXT NOT NULL DEFAULT 'unknown';
