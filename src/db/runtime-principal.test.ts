import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRuntimeDatabaseIdentity, type RuntimeDatabaseIdentity } from './runtime-principal';

const leastPrivilegeRuntime: RuntimeDatabaseIdentity = {
  session_user: 'ghm_runtime',
  current_user: 'ghm_runtime',
  rolcanlogin: true,
  rolinherit: false,
  rolsuper: false,
  rolcreatedb: false,
  rolcreaterole: false,
  rolreplication: false,
  rolbypassrls: false,
  no_role_memberships: true,
};

test('accepts only the dedicated least-privilege ghm_runtime principal', () => {
  assert.doesNotThrow(() => assertRuntimeDatabaseIdentity(leastPrivilegeRuntime));
});

test('rejects a generic or over-privileged login principal', () => {
  assert.throws(
    () => assertRuntimeDatabaseIdentity({
      ...leastPrivilegeRuntime,
      session_user: 'ghm_app_user',
      current_user: 'ghm_db_user',
    }),
    /Runtime database principal failed least-privilege verification/,
  );
});

test('rejects an unexpected effective role even when the login is ghm_runtime', () => {
  assert.throws(
    () => assertRuntimeDatabaseIdentity({
      ...leastPrivilegeRuntime,
      current_user: 'ghm_schema_owner',
    }),
    /Runtime database principal failed least-privilege verification/,
  );
});

test('rejects CREATEROLE and privileged role memberships', () => {
  for (const override of [
    { rolcreaterole: true },
    { rolsuper: true },
    { no_role_memberships: false },
    { rolcreatedb: true },
    { rolreplication: true },
    { rolbypassrls: true },
    { rolinherit: true },
  ]) {
    assert.throws(
      () => assertRuntimeDatabaseIdentity({ ...leastPrivilegeRuntime, ...override }),
      /Runtime database principal failed least-privilege verification/,
    );
  }
});
