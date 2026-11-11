import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('database/migrations/20261111150000_add_signed_trust_score_gateway.sql', 'utf8');
const cutover = readFileSync('database/cutovers/20261111150000_revoke_legacy_trust_score_runtime.sql', 'utf8');

test('Trust Score calculation requires signed actor provenance', () => {
  assert.match(migration, /'trust\.score\.calculate'/);
  assert.match(migration, /session_user<>'ghm_actor_gateway'/);
  assert.match(migration, /FOR v_i IN 0\.\.31 LOOP/);
  assert.match(migration, /gateway_calculate_business_trust_score[\s\S]*?assert_actor_gateway_capability\(p_actor,'trust\.score\.calculate'/);
});

test('Trust Score gateway binds the target Business and derives actor from the assertion', () => {
  assert.match(migration, /jsonb_build_object\('businessId',p_business_id\)/);
  assert.match(migration, /calculate_business_trust_score\(v_actor,p_business_id\)/);
});

test('Trust Score gateway wrapper is executable only by Actor Gateway', () => {
  const signature = 'gateway_calculate_business_trust_score(bigint,bigint,uuid,text,text,bigint)';
  assert.ok(migration.includes('REVOKE ALL ON FUNCTION ghm.' + signature + ' FROM PUBLIC,ghm_runtime,ghm_migrator'));
  assert.ok(migration.includes('GRANT EXECUTE ON FUNCTION ghm.' + signature + ' TO ghm_actor_gateway'));
});

test('Trust Score legacy calculation revocation remains a separate manual cutover', () => {
  assert.match(cutover, /MANUAL CUTOVER ONLY/);
  assert.match(cutover, /REVOKE ALL ON FUNCTION ghm\.calculate_business_trust_score\(bigint,bigint\) FROM PUBLIC,ghm_runtime/);
  assert.doesNotMatch(cutover, /GRANT EXECUTE/);
});
