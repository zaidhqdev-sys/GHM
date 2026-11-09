import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync('database/migrations/20261109120000_serialize_business_capability_assertion_replacement.sql', 'utf8');

test('capability assertion replacement locks the Business before reading membership or mutating assertions', () => {
  const lock = migration.indexOf('FOR UPDATE;');
  const membership = migration.indexOf('SELECT bm.membership_role');
  const withdrawal = migration.indexOf('UPDATE ghm.business_capability');
  const insert = migration.indexOf('INSERT INTO ghm.business_capability');
  assert.ok(lock >= 0 && lock < membership && membership < withdrawal && withdrawal < insert);
  assert.match(migration, /PERFORM 1 FROM ghm\.business b[\s\S]*FOR UPDATE;[\s\S]*IF NOT FOUND THEN RAISE EXCEPTION 'Business tenant access denied'/);
});

test('changes to effective_until invalidate preserved capability verification', () => {
  const matches = migration.match(/ghm\.business_capability\.effective_until IS NOT DISTINCT FROM EXCLUDED\.effective_until/g) ?? [];
  assert.equal(matches.length, 6);
  assert.match(migration, /verification_status = CASE[\s\S]*effective_until IS NOT DISTINCT FROM EXCLUDED\.effective_until[\s\S]*THEN ghm\.business_capability\.verification_status ELSE 'unverified' END/);
  assert.match(migration, /verified_by = CASE[\s\S]*effective_until IS NOT DISTINCT FROM EXCLUDED\.effective_until[\s\S]*ELSE NULL END/);
  assert.match(migration, /verified_at = CASE[\s\S]*effective_until IS NOT DISTINCT FROM EXCLUDED\.effective_until[\s\S]*ELSE NULL END/);
});

test('corrected function retains narrow runtime execution authority', () => {
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /REVOKE ALL ON FUNCTION ghm\.replace_business_capability_assertions\(bigint,bigint,jsonb\) FROM PUBLIC/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION ghm\.replace_business_capability_assertions\(bigint,bigint,jsonb\) TO ghm_runtime/);
});
