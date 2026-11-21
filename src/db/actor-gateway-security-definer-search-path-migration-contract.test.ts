import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  'database/migrations/20261112090000_pin_security_definer_search_path.sql',
  'utf8',
);
const qualification = readFileSync('scripts/qualify-security-definer-search-path-postgres.mjs', 'utf8');
const packageJson = readFileSync('package.json', 'utf8');
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');

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

test('disposable PostgreSQL qualification proves caller pg_temp objects cannot shadow GHM SECURITY DEFINER references', () => {
  assert.match(qualification, /GHM_QUALIFICATION_DATABASE_NAME !== expectedDatabase/);
  assert.match(qualification, /localhost.*127\.0\.0\.1/);
  assert.match(qualification, /CREATE TEMP TABLE security_definer_path_probe/);
  assert.match(qualification, /FROM security_definer_path_probe/);
  assert.match(qualification, /pg_catalog, ghm, pg_temp/);
  assert.match(qualification, /ghm-schema-object/);
  assert.match(qualification, /pg-temp-shadow-object/);
  assert.match(qualification, /GRANT USAGE ON SCHEMA ghm TO ghm_migrator/);
  assert.match(qualification, /ROLLBACK/);
  assert.match(qualification, /SECURITY DEFINER TEMP-OBJECT SHADOWING QUALIFICATION: PASS/);
  assert.match(packageJson, /qualify:security-definer-search-path/);
  assert.match(workflow, /Qualify SECURITY DEFINER temporary-object shadowing on disposable PostgreSQL[\s\S]*npm run qualify:security-definer-search-path/);
});


test('full disposable migration qualification compares authority and rolls back fixtures', () => {
  const source = readFileSync(
    'scripts/qualify-security-definer-search-path-migration-postgres.mjs',
    'utf8',
  );
  assert.match(source, /NODE_ENV !== 'test'/);
  assert.match(source, /GHM_MIGRATOR_DATABASE_URL/);
  assert.match(source, /localhost.*127\.0\.0\.1/);
  assert.match(source, /ghm_disposable_test/);
  assert.match(source, /BEGIN/);
  assert.match(source, /SET LOCAL ROLE ghm_schema_owner/);
  assert.match(source, /20261112090000_pin_security_definer_search_path/);
  assert.match(source, /role attributes/);
  assert.match(source, /role memberships/);
  assert.match(source, /database ACLs/);
  assert.match(source, /schema ACLs/);
  assert.match(source, /relation ACLs/);
  assert.match(source, /column ACLs/);
  assert.match(source, /default ACLs/);
  assert.match(source, /non-search_path routine metadata or ACL changed/);
  assert.match(source, /all exact search_path=pg_catalog, ghm, pg_temp/);
  assert.match(source, /ROLLBACK/);
  assert.match(packageJson, /qualify:security-definer-search-path-migration/);
  assert.match(workflow, /Compare SECURITY DEFINER migration authority before and after on disposable PostgreSQL[\s\S]*npm run qualify:security-definer-search-path-migration/);
});
