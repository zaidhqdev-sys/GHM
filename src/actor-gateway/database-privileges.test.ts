import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertActorGatewayDatabasePrivileges,
  type ActorGatewayDatabasePrivileges,
} from './database-privileges';

const leastPrivilege: ActorGatewayDatabasePrivileges = {
  schema_usage: true,
  schema_create: false,
  direct_relation_privileges: false,
  executable_functions: ['ghm.assert_actor_gateway(bigint)'],
  expected_functions: ['ghm.assert_actor_gateway(bigint)'],
  public_executable_functions: [],
  runtime_executable_functions: [],
  unsafe_function_defaults: false,
};

test('accepts only the exact Actor Gateway database function and relation boundary', () => {
  assert.doesNotThrow(() => assertActorGatewayDatabasePrivileges(leastPrivilege));
});

test('rejects extra/missing executable functions and public/runtime grants', () => {
  for (const override of [
    { executable_functions: [...leastPrivilege.executable_functions, 'ghm.unreviewed()'] },
    { executable_functions: [] },
    { public_executable_functions: ['ghm.gateway_unreviewed()'] },
    { runtime_executable_functions: ['ghm.gateway_unreviewed()'] },
  ]) {
    assert.throws(
      () => assertActorGatewayDatabasePrivileges({ ...leastPrivilege, ...override }),
      /Actor Gateway database privileges failed least-privilege verification/,
    );
  }
});

test('rejects schema CREATE, direct relation access and unsafe future function defaults', () => {
  for (const override of [
    { schema_usage: false },
    { schema_create: true },
    { direct_relation_privileges: true },
    { unsafe_function_defaults: true },
  ]) {
    assert.throws(
      () => assertActorGatewayDatabasePrivileges({ ...leastPrivilege, ...override }),
      /Actor Gateway database privileges failed least-privilege verification/,
    );
  }
});
