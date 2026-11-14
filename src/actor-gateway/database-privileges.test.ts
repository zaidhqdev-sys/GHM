import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertActorGatewayDatabasePrivileges,
  type ActorGatewayDatabasePrivileges,
} from './database-privileges';

const leastPrivilege: ActorGatewayDatabasePrivileges = {
  database_connect_privilege: true,
  database_create_privilege: false,
  schema_usage: true,
  schema_create: false,
  direct_relation_privileges: false,
  executable_functions: ['ghm.assert_actor_gateway_capability(bigint, text, bigint, uuid, text, text)'],
  expected_functions: ['ghm.assert_actor_gateway_capability(bigint, text, bigint, uuid, text, text)'],
  public_executable_functions: [],
  runtime_executable_functions: [],
  unsafe_function_defaults: false,
  unsafe_security_definer_functions: [],
  public_executable_security_definer_functions: [],
  unsafe_function_grantees: [],
};

test('accepts only the exact Actor Gateway database function and relation boundary', () => {
  assert.doesNotThrow(() => assertActorGatewayDatabasePrivileges(leastPrivilege));
});

test('rejects extra/missing executable functions and public/runtime grants', () => {
  for (const override of [
    { database_connect_privilege: false },
    { database_create_privilege: true },
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


test('rejects SECURITY DEFINER functions with unexpected owners or unsafe search_path', () => {
  assert.throws(
    () => assertActorGatewayDatabasePrivileges({
      ...leastPrivilege,
      unsafe_security_definer_functions: ['ghm.gateway_sensitive_operation()'],
    }),
    /unsafe_security_definer_functions/,
  );
});


test('rejects Actor Gateway function grants to any non-owner principal other than the gateway', () => {
  assert.throws(
    () => assertActorGatewayDatabasePrivileges({
      ...leastPrivilege,
      unsafe_function_grantees: ['ghm.gateway_unreviewed()'],
    }),
    /unsafe_function_grantees/,
  );
});


test('rejects PUBLIC EXECUTE on any SECURITY DEFINER function', () => {
  assert.throws(
    () => assertActorGatewayDatabasePrivileges({
      ...leastPrivilege,
      public_executable_security_definer_functions: ['ghm.gateway_sensitive_operation()'],
    }),
    /public_executable_security_definer_functions/,
  );
});


test('accepts only the exact pre-migration and post-migration Campaign gateway function sets', () => {
  const campaignReview = [
    'ghm.gateway_create_campaign(bigint, bigint, uuid, text, text, bigint, text)',
    'ghm.gateway_update_campaign(bigint, bigint, uuid, text, text, bigint, text, text)',
    'ghm.gateway_get_business_directory_review_presentation(bigint, bigint, uuid, text, text, bigint)',
  ];
  const expected = [...leastPrivilege.expected_functions, ...campaignReview];
  assert.doesNotThrow(() => assertActorGatewayDatabasePrivileges({
    ...leastPrivilege,
    expected_functions: expected,
    executable_functions: expected.filter(signature => !campaignReview.includes(signature)),
  }));
  assert.doesNotThrow(() => assertActorGatewayDatabasePrivileges({
    ...leastPrivilege,
    expected_functions: expected,
    executable_functions: expected,
  }));
  assert.throws(() => assertActorGatewayDatabasePrivileges({
    ...leastPrivilege,
    expected_functions: expected,
    executable_functions: [...expected, 'ghm.gateway_unreviewed(bigint)'],
  }), /gateway_function_allow_list_mismatch/);
});
