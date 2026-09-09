-- GHM migration ledger foundation.
-- This is infrastructure only. Product/business tables must be introduced by
-- later migrations after the live PostgreSQL schema has been reconciled.

CREATE TABLE IF NOT EXISTS ghm_schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
