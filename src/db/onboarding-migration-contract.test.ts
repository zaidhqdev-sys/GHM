import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../../database/migrations/20261110100000_create_account_onboarding_progress.sql', import.meta.url), 'utf8');

test('onboarding persistence is account-owned and lifecycle constrained', () => {
  assert.match(migration, /account_id bigint NOT NULL REFERENCES ghm\.account_identity\(id\)/);
  assert.match(migration, /UNIQUE \(account_id, journey_id, step_id\)/);
  assert.match(migration, /journey_id ~ '\^\[a-z\]/);
  assert.match(migration, /status IN \('pending', 'completed', 'dismissed'\)/);
  assert.match(migration, /completed_at IS NOT NULL AND dismissed_at IS NULL/);
  assert.match(migration, /completed_at IS NULL AND dismissed_at IS NOT NULL/);
});

test('runtime can read and mutate only its own progress through the repository boundary', () => {
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE ON ghm\.account_onboarding_progress TO ghm_runtime/);
  assert.match(migration, /REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON ghm\.account_onboarding_progress FROM ghm_runtime/);
  assert.match(migration, /GRANT USAGE, SELECT ON SEQUENCE ghm\.account_onboarding_progress_id_seq TO ghm_runtime/);
});
