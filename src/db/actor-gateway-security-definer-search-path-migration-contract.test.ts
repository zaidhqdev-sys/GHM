import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'database/migrations/20261112090000_pin_security_definer_search_path.sql',
  'utf8',
);

test('SECURITY DEFINER hardening preflights every GHM function and procedure owner', () => {
  assert.match(migration, /FROM pg_proc p[\s\S]*JOIN pg_namespace n ON n\.oid = p\.pronamespace/);
  assert.match(migration, /n\.nspname = 'ghm'[\s\S]*AND p\.prosecdef[\s\S]*p\.prokind IN \('f', 'p'\)/);
  assert.match(migration, /pg_get_userbyid\(p\.proowner\) IS DISTINCT FROM 'ghm_schema_owner'/);
  assert.match(migration, /SECURITY DEFINER ownership audit failed/);
});

test('SECURITY DEFINER hardening pins functions and procedures to the temp-safe path', () => {
  assert.match(migration, /ALTER %s %I\.%I\(%s\) SET search_path = pg_catalog, ghm, pg_temp/);
  assert.match(migration, /WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION'/);
  assert.match(migration, /ORDER BY n\.nspname, p\.proname, pg_get_function_identity_arguments\(p\.oid\)/);
  assert.doesNotMatch(migration, /ALTER DEFAULT PRIVILEGES/);
});
