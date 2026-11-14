import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('database/migrations/20261111060000_bind_gateway_assertions_to_request_context.sql', 'utf8');

test('v2 assertion signs the exact serialized request context', () => {
  assert.match(migration, /ghm-actor-gateway:v2\|/);
  assert.match(migration, /encode\(convert_to\(p_context,'UTF8'\),'hex'\)/);
  assert.match(migration, /p_context::jsonb<>jsonb_build_object/);
  assert.match(migration, /Actor assertion context mismatch/);
  assert.match(migration, /FOR v_i IN 0\.\.31 LOOP/);
  assert.match(migration, /Actor assertion replay detected/);
  assert.match(migration, /actor_gateway_capability_assertion_nonce_expires_at_idx/);
  assert.match(migration, /GREATEST\(clock_timestamp\(\),to_timestamp\(p_issued\)\)\+interval '60 seconds'/);
  assert.match(migration, /octet_length\(convert_to\(p_context,'UTF8'\)\)>32768/);
  assert.match(migration, /p_operation NOT IN \('capability\.list','capability\.create','capability\.update','capability\.transition'/);
  assert.match(migration, /p_operation IS NULL OR p_operation NOT IN/);
});

test('every gateway wrapper checks the context against its actual arguments', () => {
  const expected = [
    'capability.list',
    'capability.create',
    'capability.update',
    'capability.transition',
    'supplier.classification.update',
    'business.profile.update',
    'actor.identity.read',
    'business.registration.read',
    'business.registration.update',
  ];
  for (const operation of expected) assert.ok(migration.includes(`'${operation}'`));
  assert.equal((migration.match(/Actor assertion context mismatch/g) ?? []).length, 9);
  assert.match(migration, /jsonb_build_object\('businessId',p_business,'patch',p_patch\)/);
  assert.match(migration, /p_patch \? 'isSupplier' OR p_patch \? 'is_supplier'/);
  assert.match(migration, /jsonb_build_object\('capabilityId',p_id,'targetStatus',p_status,'replacedByCapabilityId',p_replacement,'version',p_version\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION ghm\.gateway_update_business_profile\(bigint,bigint,uuid,text,text,bigint,jsonb\) FROM PUBLIC,ghm_runtime,ghm_migrator/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION ghm\.gateway_update_business_profile\(bigint,bigint,uuid,text,text,bigint,jsonb\) TO ghm_actor_gateway/);
});
