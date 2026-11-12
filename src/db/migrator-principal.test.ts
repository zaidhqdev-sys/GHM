import assert from 'node:assert/strict';
import test from 'node:test';
import { assertMigratorDatabaseIdentity, type MigratorDatabaseIdentity } from './migrator-principal';

const leastPrivilegeMigrator: MigratorDatabaseIdentity = {
  current_database: 'ghm_disposable_test',
  current_user: 'ghm_migrator',
  session_user: 'ghm_migrator',
  migrator_rolcanlogin: true,
  migrator_rolinherit: false,
  migrator_rolsuper: false,
  migrator_rolcreatedb: false,
  migrator_rolcreaterole: false,
  migrator_rolreplication: false,
  migrator_rolbypassrls: false,
  direct_membership_count: 1,
  exact_schema_owner_membership: true,
  schema_owner_rolcanlogin: false,
  schema_owner_rolsuper: false,
  schema_owner_rolcreatedb: false,
  schema_owner_rolcreaterole: false,
  schema_owner_rolreplication: false,
  schema_owner_rolbypassrls: false,
};

test('accepts only the dedicated migrator with one non-inheritable SET path to the NOLOGIN schema owner', () => {
  assert.doesNotThrow(() => assertMigratorDatabaseIdentity(leastPrivilegeMigrator));
});

test('rejects missing, additional or incorrectly configured role memberships', () => {
  for (const override of [
    { direct_membership_count: 0 },
    { direct_membership_count: 2 },
    { exact_schema_owner_membership: false },
  ]) {
    assert.throws(
      () => assertMigratorDatabaseIdentity({ ...leastPrivilegeMigrator, ...override }),
      /Migration database principal failed least-privilege verification/,
    );
  }
});

test('rejects over-privileged migrator or login-capable schema owner roles', () => {
  for (const override of [
    { migrator_rolinherit: true },
    { migrator_rolsuper: true },
    { migrator_rolcreatedb: true },
    { migrator_rolcreaterole: true },
    { migrator_rolreplication: true },
    { migrator_rolbypassrls: true },
    { schema_owner_rolcanlogin: true },
    { schema_owner_rolsuper: true },
    { schema_owner_rolcreatedb: true },
    { schema_owner_rolcreaterole: true },
  ]) {
    assert.throws(
      () => assertMigratorDatabaseIdentity({ ...leastPrivilegeMigrator, ...override }),
      /Migration database principal failed least-privilege verification/,
    );
  }
});

test('rejects a generic or unexpected effective migration identity', () => {
  for (const override of [
    { current_user: 'postgres' },
    { session_user: 'ghm_runtime' },
  ]) {
    assert.throws(
      () => assertMigratorDatabaseIdentity({ ...leastPrivilegeMigrator, ...override }),
      /Migration database principal failed least-privilege verification/,
    );
  }
});
