import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertAuthIssuerDatabasePrivileges,
  type AuthIssuerDatabasePrivileges,
} from './database-privileges';

const leastPrivilege: AuthIssuerDatabasePrivileges = {
  schema_usage: true,
  schema_create: false,
  direct_relation_privileges: false,
  executable_functions: ['ghm.auth_login(text)'],
  expected_functions: ['ghm.auth_login(text)'],
  unsafe_function_defaults: false,
  runtime_can_execute_auth_lifecycle_functions: false,
};

test('accepts only the exact issuer function allow-list and isolated database privileges', () => {
  assert.doesNotThrow(() => assertAuthIssuerDatabasePrivileges(leastPrivilege));
});

test('rejects missing schema usage, schema CREATE and direct relation privileges', () => {
  for (const override of [
    { schema_usage: false },
    { schema_create: true },
    { direct_relation_privileges: true },
  ]) {
    assert.throws(
      () => assertAuthIssuerDatabasePrivileges({ ...leastPrivilege, ...override }),
      /database privileges failed least-privilege verification/,
    );
  }
});

test('rejects extra/missing issuer functions and unsafe future defaults', () => {
  for (const override of [
    { executable_functions: [...leastPrivilege.executable_functions, 'ghm.auth_unreviewed()'] },
    { executable_functions: [] },
    { unsafe_function_defaults: true },
    { runtime_can_execute_auth_lifecycle_functions: true },
  ]) {
    assert.throws(
      () => assertAuthIssuerDatabasePrivileges({ ...leastPrivilege, ...override }),
      /database privileges failed least-privilege verification/,
    );
  }
});
