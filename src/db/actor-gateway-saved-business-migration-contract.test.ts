import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('database/migrations/20261111100000_add_signed_saved_business_gateway.sql', 'utf8');
const cutover = readFileSync('database/cutovers/20261111110000_revoke_legacy_saved_business_runtime.sql', 'utf8');

test('Saved Business gateway operations are included in the v2 assertion allowlist', () => {
  for (const operation of ['saved_business.read', 'saved_business.create', 'saved_business.delete']) {
    assert.ok(migration.includes(operation));
  }
  assert.match(migration, /session_user<>'ghm_actor_gateway'/);
  assert.match(migration, /FOR v_i IN 0\.\.31 LOOP/);
});

test('Saved Business read wrappers bind reads to the signed actor account', () => {
  assert.match(migration, /gateway_list_saved_businesses[\s\S]*?s\.account_id=p_actor/);
  assert.match(migration, /gateway_get_saved_businesses?\([\s\S]*?s\.account_id=p_actor/);
  assert.match(migration, /jsonb_build_object\('savedBusinessId',p_saved_business_id\)/);
  assert.match(migration, /'saved_business\.read'/);
});

test('Saved Business create and delete wrappers derive owner from the signed actor', () => {
  assert.match(migration, /gateway_create_saved_business[\s\S]*?create_saved_business\(p_actor,p_business_id\)/);
  assert.match(migration, /gateway_delete_saved_business[\s\S]*?delete_saved_business\(p_actor,p_saved_business_id\)/);
  assert.match(migration, /jsonb_build_object\('businessId',p_business_id\)/);
});

test('all new Saved Business wrappers are gateway-only', () => {
  for (const signature of [
    'gateway_list_saved_businesses(bigint,bigint,uuid,text,text)',
    'gateway_get_saved_business(bigint,bigint,uuid,text,text,bigint)',
    'gateway_create_saved_business(bigint,bigint,uuid,text,text,bigint)',
    'gateway_delete_saved_business(bigint,bigint,uuid,text,text,bigint)',
  ]) {
    assert.ok(migration.includes('REVOKE ALL ON FUNCTION ghm.' + signature + ' FROM PUBLIC,ghm_runtime,ghm_migrator'));
    assert.ok(migration.includes('GRANT EXECUTE ON FUNCTION ghm.' + signature + ' TO ghm_actor_gateway'));
  }
});

test('legacy Saved Business privilege revocation is manual-only and not part of automatic migrations', () => {
  assert.match(cutover, /MANUAL CUTOVER ONLY/);
  assert.match(cutover, /REVOKE SELECT, INSERT, UPDATE, DELETE[\s\S]*ghm\.saved_business/);
  assert.match(cutover, /REVOKE ALL[\s\S]*saved_business_id_seq/);
  assert.match(cutover, /REVOKE ALL[\s\S]*create_saved_business/);
  assert.match(cutover, /REVOKE ALL[\s\S]*delete_saved_business/);
  assert.doesNotMatch(cutover, /GRANT EXECUTE/);
});
