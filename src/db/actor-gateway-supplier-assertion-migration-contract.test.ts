import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('database/migrations/20261111030000_bind_supplier_gateway_actor_to_signed_assertion.sql', 'utf8');

test('supplier classification wrapper requires a signed operation-bound actor assertion', () => {
  assert.match(migration, /supplier\.classification\.update/);
  assert.match(migration, /GREATEST\(clock_timestamp\(\),to_timestamp\(p_issued_at\)\)\+interval '60 seconds'/);
  assert.match(migration, /DROP FUNCTION ghm\.gateway_update_business_supplier_classification\(bigint,bigint,boolean\)/);
  assert.match(migration, /gateway_update_business_supplier_classification\(bigint,bigint,uuid,text,bigint,boolean\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION ghm\.gateway_update_business_supplier_classification\(bigint,bigint,uuid,text,bigint,boolean\) FROM PUBLIC,ghm_runtime,ghm_migrator/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION ghm\.gateway_update_business_supplier_classification\(bigint,bigint,uuid,text,bigint,boolean\) TO ghm_actor_gateway/);
});

test('supplier assertion verifier compares the complete HMAC before branching', () => {
  assert.match(migration, /FOR v_i IN 0\.\.31 LOOP/);
  assert.match(migration, /get_byte\(v_expected,?\s*v_i\)\s*#\s*get_byte\(v_provided,?\s*v_i\)/);
  assert.doesNotMatch(migration, /v_expected\s*<>\s*decode\(p_signature/);
});

const prepareMigration = readFileSync('database/migrations/20261110260000_gateway_supplier_classification_cutover.sql', 'utf8');
const manualCutover = readFileSync('database/cutovers/20261120010000_revoke_legacy_supplier_classification_runtime.sql', 'utf8');

test('supplier legacy runtime access is retained until the separately gated manual cutover', () => {
  assert.doesNotMatch(prepareMigration, /REVOKE ALL ON FUNCTION ghm\.update_business_supplier_classification\([^;]+FROM ghm_runtime/);
  assert.match(prepareMigration, /FROM PUBLIC/);
  assert.match(manualCutover, /MANUAL CUTOVER ONLY/);
  assert.match(manualCutover, /REVOKE ALL ON FUNCTION ghm\.update_business_supplier_classification\([^;]+FROM PUBLIC, ghm_runtime, ghm_migrator, ghm_actor_gateway/);
});
