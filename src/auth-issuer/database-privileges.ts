export interface AuthIssuerDatabasePrivileges {
  schema_usage: boolean;
  schema_create: boolean;
  direct_relation_privileges: boolean;
  executable_functions: string[];
  expected_functions: string[];
  unsafe_function_defaults: boolean;
  runtime_can_execute_auth_lifecycle_functions: boolean;
}

export const assertAuthIssuerDatabasePrivileges = (
  privileges: AuthIssuerDatabasePrivileges,
): void => {
  const actualFunctions = [...privileges.executable_functions].sort();
  const expectedFunctions = [...privileges.expected_functions].sort();
  const failures: string[] = [];

  if (privileges.schema_usage !== true) failures.push('schema_usage_missing');
  if (privileges.schema_create !== false) failures.push('schema_create_granted');
  if (privileges.direct_relation_privileges !== false) failures.push('direct_relation_privileges');
  if (JSON.stringify(actualFunctions) !== JSON.stringify(expectedFunctions)) {
    failures.push('issuer_function_allow_list_mismatch');
  }
  if (privileges.unsafe_function_defaults !== false) failures.push('unsafe_future_function_defaults');
  if (privileges.runtime_can_execute_auth_lifecycle_functions !== false) {
    failures.push('resource_runtime_auth_lifecycle_privileges_not_revoked');
  }

  if (failures.length > 0) {
    throw new Error(
      `Authentication Issuer database privileges failed least-privilege verification: ${failures.join(',')}`,
    );
  }
};
