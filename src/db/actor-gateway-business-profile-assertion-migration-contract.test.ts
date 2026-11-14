import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('database/migrations/20261111040000_bind_business_profile_gateway_actor_to_signed_assertion.sql', 'utf8');

test('Business profile wrapper requires a signed operation-bound actor assertion', () => {
  assert.match(migration, /business\.profile\.update/);
  assert.match(migration, /GREATEST\(clock_timestamp\(\),to_timestamp\(p_issued_at\)\)\+interval '60 seconds'/);
  assert.match(migration, /DROP FUNCTION ghm\.gateway_update_business_profile\(bigint,bigint,jsonb\)/);
  assert.match(migration, /gateway_update_business_profile\(bigint,bigint,uuid,text,bigint,jsonb\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION ghm\.gateway_update_business_profile\(bigint,bigint,uuid,text,bigint,jsonb\) FROM PUBLIC,ghm_runtime,ghm_migrator/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION ghm\.gateway_update_business_profile\(bigint,bigint,uuid,text,bigint,jsonb\) TO ghm_actor_gateway/);
});

test('Business profile assertion verifier compares the complete HMAC before branching', () => {
  assert.match(migration, /FOR v_i IN 0\.\.31 LOOP/);
  assert.match(migration, /get_byte\(v_expected,?\s*v_i\)\s*#\s*get_byte\(v_provided,?\s*v_i\)/);
  assert.doesNotMatch(migration, /v_expected\s*<>\s*decode\(p_signature/);
});
