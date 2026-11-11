import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('database/migrations/20261111020000_bind_capability_gateway_actor_to_signed_assertion.sql', 'utf8');

test('capability gateway actor identity is bound to a one-use HMAC assertion', () => {
  assert.match(migration, /actor_gateway_capability_assertion_secret/);
  assert.match(migration, /REVOKE ALL ON ghm\.actor_gateway_capability_assertion_secret FROM PUBLIC, ghm_runtime, ghm_actor_gateway, ghm_migrator/);
  assert.match(migration, /actor_gateway_capability_assertion_nonce/);
  assert.match(migration, /public\.hmac\(convert_to\(v_payload, 'UTF8'\), v_secret, 'sha256'\)/);
  assert.match(migration, /Actor assertion replay detected/);
  assert.match(migration, /abs\(extract\(epoch FROM clock_timestamp\(\)\)::bigint - p_issued_at\) > 60/);
  assert.match(migration, /session_user <> 'ghm_actor_gateway'/);
});

test('each capability wrapper binds its own operation and requires signed assertion fields', () => {
  for (const operation of ['capability.list', 'capability.create', 'capability.update', 'capability.transition']) {
    assert.ok(migration.includes(`'${operation}'`));
  }
  assert.match(migration, /DROP FUNCTION IF EXISTS ghm\.gateway_list_capabilities\(bigint\)/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION ghm\.gateway_list_capabilities\(bigint,bigint,uuid,text\) TO ghm_actor_gateway/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION ghm\.gateway_transition_capability_lifecycle\(bigint,bigint,uuid,text,uuid,text,uuid,integer\) TO ghm_actor_gateway/);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION ghm\.assert_actor_gateway\(bigint\) TO ghm_actor_gateway/);
});

test('capability assertion verifier compares the complete HMAC before branching', () => {
  assert.match(migration, /FOR v_i IN 0\.\.31 LOOP/);
  assert.match(migration, /get_byte\(v_expected,?\s*v_i\)\s*#\s*get_byte\(v_provided,?\s*v_i\)/);
  assert.doesNotMatch(migration, /v_expected\s*<>\s*decode\(p_signature/);
});
