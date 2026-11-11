import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('database/migrations/20261111050000_bind_registration_and_self_identity_to_signed_gateway_actor.sql', 'utf8');

test('registration identity and actor self-read wrappers require operation-bound HMAC assertions', () => {
  for (const operation of ['actor.identity.read','business.registration.read','business.registration.update']) assert.ok(migration.includes(`'${operation}'`));
  assert.match(migration, /GREATEST\(clock_timestamp\(\),to_timestamp\(p_issued_at\)\)\+interval '60 seconds'/);
  assert.match(migration, /DROP FUNCTION ghm\.gateway_get_actor_identity\(bigint\)/);
  assert.match(migration, /gateway_get_actor_identity\(bigint,bigint,uuid,text\)/);
  assert.match(migration, /gateway_read_business_registration_identity\(bigint,bigint,uuid,text,bigint\)/);
  assert.match(migration, /gateway_update_business_registration_identity\(bigint,bigint,uuid,text,bigint,text,text,text\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION ghm\.gateway_update_business_registration_identity\(bigint,bigint,uuid,text,bigint,text,text,text\) FROM PUBLIC,ghm_runtime,ghm_migrator/);
  assert.match(migration, /FOR v_i IN 0\.\.31 LOOP/);
  assert.match(migration, /get_byte\(v_expected,v_i\) # get_byte\(v_provided,v_i\)/);
  assert.doesNotMatch(migration, /v_expected\s*<>\s*decode\(p_signature/);
});


const registrationCutover = readFileSync('database/cutovers/20261111020000_revoke_legacy_registration_identity_runtime.sql', 'utf8');
const requestContextMigration = readFileSync('database/migrations/20261111060000_bind_gateway_assertions_to_request_context.sql', 'utf8');

test('registration identity manual cutover removes direct legacy RPC access but preserves signed gateway wrappers', () => {
  assert.match(registrationCutover, /MANUAL CUTOVER ONLY/);
  assert.match(registrationCutover, /REVOKE ALL ON FUNCTION ghm\.read_business_registration_identity\(bigint, bigint\)\s+FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway/);
  assert.match(registrationCutover, /REVOKE ALL ON FUNCTION ghm\.update_business_registration_identity\(bigint, bigint, text, text, text\)\s+FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway/);
  assert.doesNotMatch(registrationCutover, /GRANT EXECUTE/);
  assert.match(requestContextMigration, /GRANT EXECUTE ON FUNCTION ghm\.gateway_read_business_registration_identity\(bigint,bigint,uuid,text,text,bigint\) TO ghm_actor_gateway/);
  assert.match(requestContextMigration, /GRANT EXECUTE ON FUNCTION ghm\.gateway_update_business_registration_identity\(bigint,bigint,uuid,text,text,bigint,text,text,text\) TO ghm_actor_gateway/);
});
