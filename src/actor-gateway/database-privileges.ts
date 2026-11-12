import type { Pool } from 'pg';

export interface ActorGatewayDatabasePrivileges {
  database_connect_privilege: boolean;
  database_create_privilege: boolean;
  schema_usage: boolean;
  schema_create: boolean;
  direct_relation_privileges: boolean;
  executable_functions: string[];
  expected_functions: string[];
  public_executable_functions: string[];
  runtime_executable_functions: string[];
  unsafe_function_defaults: boolean;
  unsafe_security_definer_functions: string[];
  public_executable_security_definer_functions: string[];
  unsafe_function_grantees: string[];
}

export const assertActorGatewayDatabasePrivileges = (
  privileges: ActorGatewayDatabasePrivileges,
): void => {
  const actual = [...privileges.executable_functions].sort();
  const expected = [...privileges.expected_functions].sort();
  const publicFunctions = [...privileges.public_executable_functions].sort();
  const runtimeFunctions = [...privileges.runtime_executable_functions].sort();
  const failures: string[] = [];

  if (privileges.database_connect_privilege !== true) failures.push('database_connect_missing');
  if (privileges.database_create_privilege !== false) failures.push('database_create_granted');
  if (privileges.schema_usage !== true) failures.push('schema_usage_missing');
  if (privileges.schema_create !== false) failures.push('schema_create_granted');
  if (privileges.direct_relation_privileges !== false) failures.push('direct_relation_privileges');
  if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push('gateway_function_allow_list_mismatch');
  if (publicFunctions.length !== 0) failures.push('public_gateway_function_execution');
  if (runtimeFunctions.length !== 0) failures.push('runtime_gateway_function_execution');
  if (privileges.unsafe_function_defaults !== false) failures.push('unsafe_future_function_defaults');
  if (privileges.unsafe_security_definer_functions.length !== 0) failures.push('unsafe_security_definer_functions');
  if (privileges.public_executable_security_definer_functions.length !== 0) failures.push('public_executable_security_definer_functions');
  if (privileges.unsafe_function_grantees.length !== 0) failures.push('unsafe_function_grantees');

  if (failures.length > 0) {
    throw new Error(`Actor Gateway database privileges failed least-privilege verification: ${failures.join(',')}`);
  }
};

export const ACTOR_GATEWAY_DATABASE_PRIVILEGES_SQL = `
  WITH expected_signatures(signature) AS (
    SELECT unnest(ARRAY[
      'ghm.assert_actor_gateway_capability(bigint, text, bigint, uuid, text, text)',
      'ghm.gateway_calculate_business_trust_score(bigint, bigint, uuid, text, text, bigint)',
      'ghm.gateway_create_capability_draft(bigint, bigint, uuid, text, text, text, text, text, uuid, integer, text, integer)',
      'ghm.gateway_create_saved_business(bigint, bigint, uuid, text, text, bigint)',
      'ghm.gateway_delete_saved_business(bigint, bigint, uuid, text, text, bigint)',
      'ghm.gateway_get_actor_identity(bigint, bigint, uuid, text, text)',
      'ghm.gateway_get_business_hours(bigint, bigint, uuid, text, text, bigint)',
      'ghm.gateway_get_trust_score(bigint, bigint, uuid, text, text, bigint)',
      'ghm.gateway_get_saved_business(bigint, bigint, uuid, text, text, bigint)',
      'ghm.gateway_list_capabilities(bigint, bigint, uuid, text, text)',
      'ghm.gateway_list_saved_businesses(bigint, bigint, uuid, text, text)',
      'ghm.gateway_list_trust_scores(bigint, bigint, uuid, text, text, text)',
      'ghm.gateway_read_business_registration_identity(bigint, bigint, uuid, text, text, bigint)',
      'ghm.gateway_replace_business_capability_assertions(bigint, bigint, uuid, text, text, bigint, jsonb)',
      'ghm.gateway_replace_business_hours(bigint, bigint, uuid, text, text, bigint, jsonb)',
      'ghm.gateway_provision_connect_business(bigint, bigint, uuid, text, text, text, text, text)',
      'ghm.gateway_set_business_logo_object(bigint, bigint, uuid, text, text, bigint, bigint)',
      'ghm.gateway_storage_create_pending(bigint, bigint, uuid, text, text, bigint, text, bigint, text, text, text, bigint, text, text)',
      'ghm.gateway_storage_get_object(bigint, bigint, uuid, text, text, bigint)',
      'ghm.gateway_storage_mark_deletion_pending(bigint, bigint, uuid, text, text, bigint)',
      'ghm.gateway_submit_business_capability_evidence(bigint, bigint, uuid, text, text, bigint, text, text, text, text, text, text, date, date, text)',
      'ghm.gateway_transition_business_capability_evidence(bigint, bigint, uuid, text, text, bigint, text, text)',
      'ghm.gateway_transition_business_capability_verification(bigint, bigint, uuid, text, text, bigint, text, text, text)',
      'ghm.gateway_transition_capability_lifecycle(bigint, bigint, uuid, text, text, uuid, text, uuid, integer)',
      'ghm.gateway_update_business_profile(bigint, bigint, uuid, text, text, bigint, jsonb)',
      'ghm.gateway_update_business_registration_identity(bigint, bigint, uuid, text, text, bigint, text, text, text)',
      'ghm.gateway_update_business_supplier_classification(bigint, bigint, uuid, text, text, bigint, boolean)',
      'ghm.gateway_update_capability_draft(bigint, bigint, uuid, text, text, uuid, text, text, text, uuid, integer, text, integer)'
    ]::text[])
  ),
  gateway_functions AS (
    SELECT p.oid, p.oid::regprocedure::text AS signature, p.proacl, p.proowner
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'ghm'
       AND p.prorettype <> 'trigger'::regtype
       AND has_function_privilege(session_user, p.oid, 'EXECUTE')
  )
  SELECT
    has_database_privilege(session_user, current_database(), 'CONNECT') AS database_connect_privilege,
    has_database_privilege(session_user, current_database(), 'CREATE') AS database_create_privilege,
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
      SELECT signature FROM gateway_functions ORDER BY signature
    ) AS executable_functions,
    ARRAY(
      SELECT signature::regprocedure::text
        FROM expected_signatures
       ORDER BY 1
    ) AS expected_functions,
    ARRAY(
      SELECT f.signature
        FROM gateway_functions f
        CROSS JOIN LATERAL aclexplode(COALESCE(f.proacl, acldefault('f', f.proowner))) acl
       WHERE acl.grantee = 0
         AND acl.privilege_type = 'EXECUTE'
       ORDER BY 1
    ) AS public_executable_functions,
    ARRAY(
      SELECT p.oid::regprocedure::text
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'ghm'
         AND p.prorettype <> 'trigger'::regtype
         AND (p.proname = 'assert_actor_gateway' OR p.proname = 'assert_actor_gateway_capability' OR left(p.proname, 8) = 'gateway_')
         AND has_function_privilege('ghm_runtime', p.oid, 'EXECUTE')
       ORDER BY 1
    ) AS runtime_executable_functions,
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
           AND (d.defaclnamespace = 0 OR d.defaclnamespace = 'ghm'::regnamespace)
           AND d.defaclobjtype = 'f'
           AND acl.privilege_type = 'EXECUTE'
           AND acl.grantee <> d.defaclrole
      )
    ) AS unsafe_function_defaults,
    ARRAY(
      SELECT p.oid::regprocedure::text
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
       WHERE n.nspname = 'ghm'
         AND p.prosecdef
         AND acl.privilege_type = 'EXECUTE'
         AND acl.grantee = 0
       ORDER BY 1
    ) AS public_executable_security_definer_functions,
    ARRAY(
      SELECT p.oid::regprocedure::text
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'ghm'
         AND p.prosecdef
         AND (
           pg_get_userbyid(p.proowner) IS DISTINCT FROM 'ghm_schema_owner'
           OR NOT EXISTS (
             SELECT 1
               FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS setting
              WHERE setting = 'search_path=pg_catalog, ghm, pg_temp'
           )
         )
       ORDER BY 1
    ) AS unsafe_security_definer_functions,
    ARRAY(
      SELECT f.signature
        FROM gateway_functions f
        CROSS JOIN LATERAL aclexplode(COALESCE(f.proacl, acldefault('f', f.proowner))) acl
       WHERE acl.privilege_type = 'EXECUTE'
         AND acl.grantee <> f.proowner
         AND acl.grantee <> 'ghm_actor_gateway'::regrole
       ORDER BY 1
    ) AS unsafe_function_grantees
`;

export async function readActorGatewayDatabasePrivileges(
  pool: Pick<Pool, 'query'>,
): Promise<ActorGatewayDatabasePrivileges> {
  const result = await pool.query<ActorGatewayDatabasePrivileges>(ACTOR_GATEWAY_DATABASE_PRIVILEGES_SQL);
  const privileges = result.rows[0];
  if (!privileges) throw new Error('Actor Gateway database privileges could not be resolved');
  return privileges;
}
