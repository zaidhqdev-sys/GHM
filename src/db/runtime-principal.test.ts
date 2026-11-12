import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertRuntimeDatabaseIdentity, type RuntimeDatabaseIdentity } from './runtime-principal';

const leastPrivilegeRuntime: RuntimeDatabaseIdentity = {
  session_user: 'ghm_runtime',
  current_user: 'ghm_runtime',
  database_connect_privilege: true,
  database_create_privilege: false,
  schema_usage: true,
  schema_create: false,
  rolcanlogin: true,
  rolinherit: false,
  rolsuper: false,
  rolcreatedb: false,
  rolcreaterole: false,
  rolreplication: false,
  rolbypassrls: false,
  no_untrusted_role_memberships: true,
};

test('accepts the dedicated restricted runtime login with only trusted administrator membership', () => {
  assert.doesNotThrow(() => assertRuntimeDatabaseIdentity(leastPrivilegeRuntime));
});

test('rejects the Dashboard-managed application and effective administrator identities', () => {
  assert.throws(
    () => assertRuntimeDatabaseIdentity({
      ...leastPrivilegeRuntime,
      session_user: 'ghm_app_user',
      current_user: 'ghm_db_user',
    }),
    /least-privilege verification/,
  );
});

test('rejects role substitution after connecting as the runtime login', () => {
  assert.throws(
    () => assertRuntimeDatabaseIdentity({
      ...leastPrivilegeRuntime,
      current_user: 'ghm_schema_owner',
    }),
    /least-privilege verification/,
  );
});

test('rejects database or schema creation privileges', () => {
  for (const override of [
    { database_create_privilege: true },
    { schema_create: true },
  ]) {
    assert.throws(
      () => assertRuntimeDatabaseIdentity({ ...leastPrivilegeRuntime, ...override }),
      /least-privilege verification/,
    );
  }
});

test('rejects elevated login attributes and untrusted memberships', () => {
  const overrides: Partial<RuntimeDatabaseIdentity>[] = [
    { rolinherit: true },
    { rolsuper: true },
    { rolcreatedb: true },
    { rolcreaterole: true },
    { rolreplication: true },
    { rolbypassrls: true },
    { no_untrusted_role_memberships: false },
    { rolcanlogin: false },
    { database_connect_privilege: false },
    { schema_usage: false },
  ];
  for (const override of overrides) {
    assert.throws(
      () => assertRuntimeDatabaseIdentity({ ...leastPrivilegeRuntime, ...override }),
      /least-privilege verification/,
    );
  }
});
