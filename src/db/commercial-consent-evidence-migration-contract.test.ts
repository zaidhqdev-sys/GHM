import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = fs.readFileSync(
  path.resolve(process.cwd(), 'database/migrations/20261116150000_create_commercial_consent_evidence.sql'),
  'utf8',
);

test('commercial document catalogue pins immutable exact versions and content hashes', () => {
  assert.match(migration, /CREATE TABLE ghm\.commercial_document_version/);
  assert.match(migration, /document_type IN \('trial_terms', 'subscription_terms'\)/);
  assert.match(migration, /content_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(migration, /UNIQUE \(document_type, document_key, version\)/);
  assert.doesNotMatch(migration, /INSERT INTO ghm\.commercial_document_version/i);
});

test('document approval and withdrawal are append-only lifecycle events', () => {
  assert.match(migration, /CREATE TABLE ghm\.commercial_document_status_event/);
  assert.match(migration, /status IN \('draft', 'approved', 'withdrawn', 'superseded'\)/);
  assert.match(migration, /document_version_id bigint NOT NULL[\s\S]*REFERENCES ghm\.commercial_document_version/);
});

test('consent evidence binds Business, authenticated account, exact document version and idempotency', () => {
  assert.match(migration, /CREATE TABLE ghm\.commercial_consent_event/);
  assert.match(migration, /business_id bigint NOT NULL REFERENCES ghm\.business\(id\)/);
  assert.match(migration, /account_id bigint NOT NULL REFERENCES ghm\.account_identity\(id\)/);
  assert.match(migration, /document_version_id bigint NOT NULL[\s\S]*REFERENCES ghm\.commercial_document_version/);
  assert.match(migration, /consent_action = 'accepted'/);
  assert.match(migration, /UNIQUE \(idempotency_key\)/);
});

test('all commercial consent evidence rejects update, delete and truncate', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION ghm\.reject_commercial_evidence_mutation/);
  for (const table of ['commercial_document_version', 'commercial_document_status_event', 'commercial_consent_event']) {
    assert.match(migration, new RegExp(`CREATE TRIGGER ${table}_immutable[\\s\\S]*?BEFORE UPDATE OR DELETE ON ghm\\.${table}`));
    assert.match(migration, new RegExp(`CREATE TRIGGER ${table}_no_truncate[\\s\\S]*?BEFORE TRUNCATE ON ghm\\.${table}`));
  }
});

test('no runtime principal can read or mutate commercial legal evidence before a governed route exists', () => {
  assert.match(migration, /No application\/runtime role receives direct read or write access yet/);
  assert.match(migration, /TO ghm_migrator/);
  assert.doesNotMatch(migration, /TO ghm_runtime|TO ghm_actor_gateway|TO PUBLIC/i);
});
