import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('database/migrations/20261111130000_add_signed_business_hours_gateway.sql', 'utf8');
const cutover = readFileSync('database/cutovers/20261111130000_revoke_legacy_business_hours_runtime.sql', 'utf8');

test('Business Hours replacement requires the signed v2 actor assertion', () => {
  assert.match(migration, /'business\.hours\.replace'/);
  assert.match(migration, /session_user<>'ghm_actor_gateway'/);
  assert.match(migration, /FOR v_i IN 0\.\.31 LOOP/);
  assert.match(migration, /gateway_replace_business_hours[\s\S]*?assert_actor_gateway_capability\(p_actor,'business\.hours\.replace'/);
});

test('Business Hours gateway binds the exact business and schedule payload', () => {
  assert.match(migration, /jsonb_build_object\('businessId',p_business_id,'hours',p_hours\)/);
  assert.match(migration, /replace_business_hours\(p_business_id,p_actor,p_hours\)/);
});

test('Business Hours gateway wrapper is executable only by the Actor Gateway', () => {
  const signature = 'gateway_replace_business_hours(bigint,bigint,uuid,text,text,bigint,jsonb)';
  assert.ok(migration.includes('REVOKE ALL ON FUNCTION ghm.' + signature + ' FROM PUBLIC,ghm_runtime,ghm_migrator'));
  assert.ok(migration.includes('GRANT EXECUTE ON FUNCTION ghm.' + signature + ' TO ghm_actor_gateway'));
});

test('legacy Business Hours replacement revocation is a separate manual cutover', () => {
  assert.match(cutover, /MANUAL CUTOVER ONLY/);
  assert.match(cutover, /REVOKE ALL ON FUNCTION ghm\.replace_business_hours\(bigint,bigint,jsonb\) FROM PUBLIC,ghm_runtime/);
  assert.doesNotMatch(cutover, /GRANT EXECUTE/);
});


test('Business Hours member read is signed and public read is a visibility-filtered projection', () => {
  assert.match(migration, /'business\.hours\.read'/);
  assert.match(migration, /gateway_get_business_hours[\s\S]*?assert_actor_gateway_capability\(p_actor,'business\.hours\.read'/);
  assert.match(migration, /bm\.membership_role IN \('owner','administrator','member'\)/);
  assert.match(migration, /CREATE FUNCTION ghm\.get_public_business_hours[\s\S]*?b\.is_active=true AND b\.is_verified=true/);
  assert.match(migration, /b\.verification_status='approved'/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION ghm\.get_public_business_hours\(bigint\) TO ghm_runtime/);
});

test('Business Hours manual cutover revokes direct table and sequence access', () => {
  assert.match(cutover, /REVOKE SELECT ON TABLE ghm\.business_hours FROM PUBLIC,ghm_runtime/);
  assert.match(cutover, /REVOKE ALL ON SEQUENCE ghm\.business_hours_id_seq FROM PUBLIC,ghm_runtime/);
});
