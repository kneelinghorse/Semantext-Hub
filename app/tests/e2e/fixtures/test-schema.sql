CREATE SCHEMA IF NOT EXISTS analytics;

CREATE TABLE analytics.users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE analytics.orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES analytics.users(id),
  total NUMERIC(10, 2) NOT NULL,
  placed_at TIMESTAMPTZ DEFAULT NOW()
);
