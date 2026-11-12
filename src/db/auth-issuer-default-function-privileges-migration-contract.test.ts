import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = fs.readFileSync(path.resolve(
  process.cwd(),
  'database/migrations/20261112050000_revoke_public_default_function_execution.sql',
), 'utf8');
const issuerCutover = fs.readFileSync(path.resolve(
  process.cwd(),
  'database/cutovers/20261112010000_authentication_issuer_privilege_cutover.sql',
), 'utf8');
const issuerRollback = fs.readFileSync(path.resolve(
  process.cwd(),
  'database/cutovers/20261112020000_authentication_issuer_privilege_rollback.sql',
), 'utf8');
const qualification = fs.readFileSync(path.resolve(
  process.cwd(),
  'scripts/qualify-auth-issuer-cutover.mjs',
), 'utf8');
const securityDefinerMigration = fs.readFileSync(path.resolve(
  process.cwd(),
  'database/migrations/20261112090000_pin_security_definer_search_path.sql',
), 'utf8');
const preCutoverQualification = fs.readFileSync(path.resolve(
  process.cwd(),
  'scripts/qualify-auth-issuer-precutover.mjs',
), 'utf8');
const ciWorkflow = fs.readFileSync(path.resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8');

test('future GHM functions created by the schema owner do not inherit PUBLIC EXECUTE', () => {
  assert.ok(migration.includes('ALTER DEFAULT PRIVILEGES FOR ROLE ghm_schema_owner'));
  assert.ok(migration.includes('REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC'));
  assert.doesNotMatch(migration, /IN SCHEMA ghm/);
});

test('issuer allow-list is applied after clearing current function grants', () => {
  assert.ok(issuerCutover.includes('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA ghm FROM ghm_auth_issuer'));
  assert.ok(issuerCutover.includes('GRANT EXECUTE ON FUNCTION ghm.auth_create_account'));
});


test('manual issuer cutover and rollback require the dedicated migrator/schema-owner identity', () => {
  for (const script of [issuerCutover, issuerRollback]) {
    assert.ok(script.includes("session_user IS DISTINCT FROM 'ghm_migrator'"));
    assert.ok(script.includes("current_user IS DISTINCT FROM 'ghm_schema_owner'"));
    assert.ok(script.includes('issuer privilege operation requires session_user=ghm_migrator and current_user=ghm_schema_owner'));
  }
});


test('issuer startup ACL verifier inspects global and GHM-schema function defaults', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'src/auth-issuer/database-privileges.ts'), 'utf8');
  assert.match(source, /defaclnamespace = 0 OR d\.defaclnamespace = 'ghm'::regnamespace/);
});


test('issuer default ACL verifier rejects EXECUTE granted to any non-owner role', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'src/auth-issuer/database-privileges.ts'), 'utf8');
  assert.ok(source.includes('acl.grantee <> d.defaclrole'));
});


test('disposable qualification exercises and cleans up schema-scoped unexpected EXECUTE defaults', () => {
  assert.ok(qualification.includes('IN SCHEMA ghm GRANT EXECUTE ON FUNCTIONS TO postgres'));
  assert.ok(qualification.includes('IN SCHEMA ghm REVOKE EXECUTE ON FUNCTIONS FROM postgres'));
  assert.ok(qualification.includes('issuerWithUnexpectedDefault.unsafe_function_defaults'));
  assert.ok(qualification.includes('actorWithUnexpectedDefault.unsafe_function_defaults'));
});


test('SECURITY DEFINER migration preflights owner identity and pins pg_temp last', () => {
  assert.ok(securityDefinerMigration.includes("pg_get_userbyid(p.proowner) IS DISTINCT FROM 'ghm_schema_owner'"));
  assert.ok(securityDefinerMigration.includes('ALTER FUNCTION %s SET search_path = pg_catalog, ghm, pg_temp'));
  assert.ok(securityDefinerMigration.includes('AND p.prosecdef'));
});


test('issuer cutover role preflight uses a balanced named dollar-quote delimiter', () => {
  assert.ok(issuerCutover.includes('DO $issuer_role_guard$'));
  assert.ok(issuerCutover.includes('$issuer_role_guard$;'));
  assert.doesNotMatch(issuerCutover, /\\nDO \\$\\n/);
});


test('pre-cutover qualification locks the exact runtime grant state that rollback must restore', () => {
  assert.ok(preCutoverQualification.includes('expectedRuntimeAuthFunctions'));
  assert.ok(preCutoverQualification.includes('pre-issuer Resource API runtime must have exactly the documented 16-function authentication allow-list'));
  assert.ok(preCutoverQualification.includes('unexpected_auth_function_grantees'));
  assert.ok(preCutoverQualification.includes("acl.grantee = 'ghm_migrator'::regrole"));
  assert.ok(preCutoverQualification.includes("ghm.auth_lookup_business_external_mapping(text,text)"));
  const preCutoverStep = ciWorkflow.indexOf('Qualify exact pre-issuer Resource API authentication grants');
  const cutoverStep = ciWorkflow.indexOf('Apply guarded auth issuer manual cutover in disposable PostgreSQL only');
  assert.ok(preCutoverStep >= 0 && cutoverStep > preCutoverStep, 'pre-cutover grant snapshot must run before the manual SQL cutover');
});
