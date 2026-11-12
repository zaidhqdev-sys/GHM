import type { Pool } from 'pg';

export interface AuthIssuerDatabasePrivileges {
  schema_usage: boolean;
  schema_create: boolean;
  direct_relation_privileges: boolean;
  executable_functions: string[];
  expected_functions: string[];
  unsafe_function_defaults: boolean;
  runtime_executable_auth_functions: string[];
  expected_runtime_auth_functions: string[];
}

export const assertAuthIssuerDatabasePrivileges = (
  privileges: AuthIssuerDatabasePrivileges,
): void => {
  const actualFunctions = [...privileges.executable_functions].sort();
  const expectedFunctions = [...privileges.expected_functions].sort();
  const runtimeFunctions = [...privileges.runtime_executable_auth_functions].sort();
  const expectedRuntimeFunctions = [...privileges.expected_runtime_auth_functions].sort();
  const failures: string[] = [];

  if (privileges.schema_usage !== true) failures.push('schema_usage_missing');
  if (privileges.schema_create !== false) failures.push('schema_create_granted');
  if (privileges.direct_relation_privileges !== false) failures.push('direct_relation_privileges');
  if (JSON.stringify(actualFunctions) !== JSON.stringify(expectedFunctions)) {
    failures.push('issuer_function_allow_list_mismatch');
  }
  if (privileges.unsafe_function_defaults !== false) failures.push('unsafe_future_function_defaults');
  if (JSON.stringify(runtimeFunctions) !== JSON.stringify(expectedRuntimeFunctions)) {
    failures.push('resource_runtime_auth_function_allow_list_mismatch');
  }

  if (failures.length > 0) {
    throw new Error(
      `Authentication Issuer database privileges failed least-privilege verification: ${failures.join(',')}`,
    );
  }
};


export const AUTH_ISSUER_DATABASE_PRIVILEGES_SQL = `
    WITH expected_signatures(signature) AS (
      SELECT unnest(ARRAY[
        'ghm.auth_create_account(text, text, text, text, text, integer, integer, integer)',
        'ghm.auth_lookup_password_by_normalized_email(text)',
        'ghm.auth_rehash_password_if_unchanged(bigint, text, text, integer, integer, integer)',
        'ghm.auth_create_session_with_refresh(bigint, bytea)',
        'ghm.auth_rotate_refresh(bytea, bytea)',
        'ghm.auth_revoke_by_refresh_hash(bytea, text)',
        'ghm.auth_issue_recovery(bigint, bytea, timestamptz)',
        'ghm.auth_reset_password_with_recovery(bytea, text, text, integer, integer, integer)',
        'ghm.auth_lookup_quoteflow_migration_reset_enrollment(text)',
        'ghm.auth_complete_quoteflow_migration_reset(bytea, text, integer, integer, integer)'
      ]::text[])
    ),

    SELECT
      has_schema_privilege(session_user, 'ghm', 'USAGE') AS schema_usage,
      has_schema_privilege(session_user, 'ghm', 'CREATE') AS schema_create,
      (
        EXISTS (
          SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                               ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(privilege)
           WHERE n.nspname = 'ghm'
             AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
             AND has_table_privilege(session_user, c.oid, p.privilege)
        )
        OR EXISTS (
          SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            CROSS JOIN (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) AS p(privilege)
           WHERE n.nspname = 'ghm'
             AND c.relkind = 'S'
             AND has_sequence_privilege(session_user, c.oid, p.privilege)
        )
      ) AS direct_relation_privileges,
      ARRAY(
        SELECT p.oid::regprocedure::text
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'ghm'
           AND has_function_privilege(session_user, p.oid, 'EXECUTE')
         ORDER BY 1
      ) AS executable_functions,
      ARRAY(
        SELECT signature::regprocedure::text
          FROM expected_signatures
         ORDER BY 1
      ) AS expected_functions,
      (
        NOT EXISTS (
          SELECT 1
            FROM pg_default_acl d
           WHERE d.defaclrole = 'ghm_schema_owner'::regrole
             AND d.defaclnamespace = 0
             AND d.defaclobjtype = 'f'
        )
        OR EXISTS (
          SELECT 1
            FROM pg_default_acl d
            CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
           WHERE d.defaclrole = 'ghm_schema_owner'::regrole
             AND d.defaclnamespace = 0
             AND d.defaclobjtype = 'f'
             AND acl.privilege_type = 'EXECUTE'
             AND acl.grantee IN (0, 'ghm_runtime'::regrole::oid, 'ghm_auth_issuer'::regrole::oid)
        )
      ) AS unsafe_function_defaults,
      ARRAY(
        SELECT p.oid::regprocedure::text
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'ghm'
           AND left(p.proname, 5) = 'auth_'
           AND has_function_privilege('ghm_runtime', p.oid, 'EXECUTE')
         ORDER BY 1
      ) AS runtime_executable_auth_functions,
      ARRAY(
        SELECT signature::regprocedure::text
          FROM unnest(ARRAY[
            'ghm.auth_lookup_external_identity(text, text)',
            'ghm.auth_link_business_external_mapping(text, text, bigint)',
            'ghm.auth_lookup_business_external_mapping(text, text)'
          ]::text[]) AS expected(signature)
         ORDER BY 1
      ) AS expected_runtime_auth_functions
  `;

export async function readAuthIssuerDatabasePrivileges(
  pool: Pick<Pool, 'query'>,
): Promise<AuthIssuerDatabasePrivileges> {
  const result = await pool.query<AuthIssuerDatabasePrivileges>(AUTH_ISSUER_DATABASE_PRIVILEGES_SQL);
  const privileges = result.rows[0];
  if (!privileges) throw new Error('Authentication Issuer database privileges could not be resolved');
  return privileges;
}
