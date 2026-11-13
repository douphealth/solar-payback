-- SolarPayback Aurora v7.5.0 — Cloudflare D1 Commercial Database Schema (8 Tables)
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL,
  verified_at TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  jurisdiction TEXT NOT NULL DEFAULT 'GR',
  status TEXT NOT NULL DEFAULT 'draft',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  hash TEXT NOT NULL,
  validated_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS quote_fields (
  project_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  unit TEXT,
  confidence TEXT NOT NULL,
  user_confirmed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, document_id, key)
);

CREATE TABLE IF NOT EXISTS analysis_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  inputs_json TEXT NOT NULL,
  source_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  status TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  stripe_session_id TEXT UNIQUE,
  payment_intent_id TEXT,
  charge_id TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  created_at TEXT NOT NULL,
  refunded_at TEXT,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  analysis_run_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  sha256_hash TEXT,
  engine_version TEXT DEFAULT '7.5.0',
  created_at TEXT NOT NULL,
  access_status TEXT NOT NULL DEFAULT 'pending',
  FOREIGN KEY (analysis_run_id) REFERENCES analysis_runs(id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);
