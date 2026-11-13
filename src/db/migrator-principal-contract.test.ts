import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migrationRunner = fs.readFileSync(path.resolve(process.cwd(), 'src/db/migrate.ts'), 'utf8');

test('migration runner verifies the dedicated migrator role before SET ROLE', () => {
  const verifier = migrationRunner.indexOf('assertMigratorDatabaseIdentity(migratorPrincipal.rows[0])');
  const setRole = migrationRunner.indexOf('SET ROLE ${MIGRATION_OWNER_ROLE}');
  assert.ok(verifier >= 0 && setRole > verifier, 'migrator ACL verification must precede schema-owner role activation');
  assert.match(migrationRunner, /FROM pg_auth_members/);
  assert.match(migrationRunner, /membership\.admin_option = false/);
  assert.match(migrationRunner, /membership\.inherit_option = false/);
  assert.match(migrationRunner, /membership\.set_option = true/);
  assert.match(migrationRunner, /has_database_privilege\('ghm_migrator'/);
  assert.match(migrationRunner, /has_schema_privilege\('ghm_migrator'/);
  assert.match(migrationRunner, /has_table_privilege\('ghm_migrator'/);
  assert.match(migrationRunner, /has_sequence_privilege\('ghm_migrator'/);
  assert.match(migrationRunner, /direct_membership_count/);
  assert.match(migrationRunner, /schema_owner_direct_membership_count/);
  assert.match(migrationRunner, /migrator_untrusted_member_count/);
  assert.match(migrationRunner, /migrator_admin_member_count/);
  assert.match(migrationRunner, /exact_migrator_admin_membership/);
  assert.match(migrationRunner, /membership.admin_option = true/);
  assert.match(migrationRunner, /membership.inherit_option = false/);
  assert.match(migrationRunner, /membership.set_option = false/);
  assert.match(migrationRunner, /schema_owner_untrusted_member_count/);
  assert.match(migrationRunner, /schema_owner_admin_member_count/);
  assert.match(migrationRunner, /exact_schema_owner_admin_membership/);
  assert.match(migrationRunner, /member_role\.rolname <> 'ghm_db_user'/);
  assert.match(migrationRunner, /member_role\.rolname NOT IN \('ghm_db_user', 'ghm_migrator'\)/);
  assert.match(migrationRunner, /migrator\.rolcreaterole AS migrator_rolcreaterole/);
  assert.match(migrationRunner, /schema_owner\.rolcanlogin AS schema_owner_rolcanlogin/);
  assert.match(migrationRunner, /identity\.rows\[0\]\?\.current_user !== MIGRATION_OWNER_ROLE/);
  assert.match(migrationRunner, /identity\.rows\[0\]\?\.session_user !== 'ghm_migrator'/);
});


test('migration runner verifies schema-owner database CREATE and GHM schema ownership', () => {
  assert.match(migrationRunner, /has_database_privilege\('ghm_schema_owner', current_database\(\), 'CREATE'\) AS schema_owner_database_create_privilege/);
  assert.match(migrationRunner, /owned_schema\.nspowner = schema_owner\.oid/);
});
