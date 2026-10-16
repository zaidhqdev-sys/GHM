import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const migration = readFileSync(join(process.cwd(), 'database/migrations/20261016120000_create_account_external_mapping.sql'), 'utf8');

test('account external mapping is distinct and references canonical GHM accounts', () => {
  assert.match(migration, /CREATE TABLE ghm\.account_external_mapping/i);
  assert.match(migration, /UNIQUE \(provider, external_account_id\)/i);
  assert.match(migration, /account_id bigint NOT NULL\s+REFERENCES ghm\.account_identity\(id\)\s+ON DELETE RESTRICT/i);
  assert.match(migration, /CHECK \(btrim\(provider\) <> ''\)/i);
  assert.match(migration, /CHECK \(btrim\(external_account_id\) <> ''\)/i);
});

test('account mapping is not directly accessible to runtime or migrator', () => {
  assert.match(migration, /REVOKE ALL ON TABLE ghm\.account_external_mapping\s+FROM PUBLIC, ghm_runtime, ghm_migrator/i);
  assert.match(migration, /REVOKE ALL ON FUNCTION ghm\.auth_lookup_account_external_mapping\(text, text\)\s+FROM PUBLIC, ghm_runtime/i);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION ghm\.auth_lookup_account_external_mapping\(text, text\)\s+TO ghm_migrator/i);
});

test('lookup is fail-closed for blank input and never links by email', () => {
  assert.match(migration, /btrim\(p_provider\) <> ''/i);
  assert.match(migration, /btrim\(p_external_account_id\) <> ''/i);
  assert.match(migration, /mapping\.provider = btrim\(p_provider\)/i);
  assert.match(migration, /mapping\.external_account_id = btrim\(p_external_account_id\)/i);
  assert.doesNotMatch(migration, /(?:WHERE|AND)\\s+[^;]*email\\s*(?:=|ILIKE)/is);
  assert.match(migration, /Not an auth endpoint/i);
});
