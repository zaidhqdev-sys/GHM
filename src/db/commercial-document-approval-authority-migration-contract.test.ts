import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = fs.readFileSync(
  path.resolve(process.cwd(), 'database/migrations/20261116160000_add_commercial_document_approval_authority.sql'),
  'utf8',
);

test('approval authority is a separate scoped grant/revoke event ledger', () => {
  assert.match(migration, /CREATE TABLE ghm\.commercial_document_approval_authority_event/);
  assert.match(migration, /event_type IN \('granted', 'revoked'\)/);
  assert.match(migration, /authority_account_id bigint NOT NULL REFERENCES ghm\.account_identity/);
  assert.match(migration, /recorded_by_account_id bigint NOT NULL REFERENCES ghm\.account_identity/);
  assert.match(migration, /document_type text NOT NULL/);
  assert.match(migration, /document_key text NOT NULL/);
  assert.match(migration, /jurisdiction_country_id bigint REFERENCES ghm\.country/);
  assert.match(migration, /authority_id uuid NOT NULL/);
});

test('document approval must cite a specific authority grant event', () => {
  assert.match(migration, /ADD COLUMN approval_authority_event_id bigint[\s\S]*REFERENCES ghm\.commercial_document_approval_authority_event/);
  assert.match(migration, /status = 'approved' AND approval_authority_event_id IS NOT NULL/);
  assert.match(migration, /status <> 'approved' AND approval_authority_event_id IS NULL/);
  assert.match(migration, /must also verify that the grant remains active/);
});

test('approval authority history is append-only', () => {
  assert.match(migration, /BEFORE UPDATE OR DELETE ON ghm\.commercial_document_approval_authority_event/);
  assert.match(migration, /BEFORE TRUNCATE ON ghm\.commercial_document_approval_authority_event/);
});

test('authority is not seeded or exposed to application roles', () => {
  assert.doesNotMatch(migration, /INSERT INTO ghm\.commercial_document_approval_authority_event/i);
  assert.match(migration, /TO ghm_migrator/);
  assert.doesNotMatch(migration, /TO ghm_runtime|TO ghm_actor_gateway|TO PUBLIC/i);
  assert.match(migration, /GHM admin status alone does not confer this authority/);
});
