import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('database/migrations/20261111160000_add_signed_business_logo_gateway.sql', 'utf8');
const cutover = readFileSync('database/cutovers/20261111160000_revoke_legacy_business_logo_runtime.sql', 'utf8');

test('Business Logo binding requires the signed v2 actor assertion', () => {
  assert.match(migration, /'business\.logo\.bind'/);
  assert.match(migration, /session_user<>'ghm_actor_gateway'/);
  assert.match(migration, /FOR v_i IN 0\.\.31 LOOP/);
  assert.match(migration, /gateway_set_business_logo_object[\s\S]*?assert_actor_gateway_capability\(p_actor,'business\.logo\.bind'/);
});

test('Business Logo gateway binds the exact Business and nullable object target', () => {
  assert.match(migration, /jsonb_build_object\('businessId',p_business_id,'objectId',p_storage_object_id\)/);
  assert.match(migration, /set_business_logo_object\(v_actor,p_business_id,p_storage_object_id\)/);
});

test('Business Logo gateway wrapper is executable only by Actor Gateway', () => {
  const signature = 'gateway_set_business_logo_object(bigint,bigint,uuid,text,text,bigint,bigint)';
  assert.ok(migration.includes('REVOKE ALL ON FUNCTION ghm.' + signature + ' FROM PUBLIC,ghm_runtime,ghm_migrator'));
  assert.ok(migration.includes('GRANT EXECUTE ON FUNCTION ghm.' + signature + ' TO ghm_actor_gateway'));
});

test('legacy Business Logo binding revocation remains a separate manual cutover', () => {
  assert.match(cutover, /MANUAL CUTOVER ONLY/);
  assert.match(cutover, /REVOKE ALL ON FUNCTION ghm\.set_business_logo_object\(bigint,bigint,bigint\) FROM PUBLIC,ghm_runtime/);
  assert.doesNotMatch(cutover, /GRANT EXECUTE/);
});
