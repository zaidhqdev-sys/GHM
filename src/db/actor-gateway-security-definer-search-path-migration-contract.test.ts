import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'database/migrations/20261112090000_pin_security_definer_search_path.sql',
  'utf8',
);

test('SECURITY DEFINER hardening preflights every GHM function owner', () => {
  assert.match(migration, /FROM pg_proc p[\s\S]*JOIN pg_namespace n ON n\.oid = p\.pronamespace/);
  assert.match(migration, /n\.nspname = 'ghm'[\s\S]*AND p\.prosecdef/);
  assert.match(migration, /pg_get_userbyid\(p\.proowner\) IS DISTINCT FROM 'ghm_schema_owner'/);
  assert.match(migration, /SECURITY DEFINER ownership audit failed/);
});

test('SECURITY DEFINER hardening pins every GHM privileged function to the temp-safe path', () => {
  assert.match(migration, /WHERE n\.nspname = 'ghm'[\s\S]*AND p\.prosecdef/);
  assert.match(migration, /ALTER FUNCTION %s SET search_path = pg_catalog, ghm, pg_temp/);
  assert.match(migration, /ORDER BY p\.oid::regprocedure::text/);
  assert.doesNotMatch(migration, /ALTER DEFAULT PRIVILEGES/);
});
