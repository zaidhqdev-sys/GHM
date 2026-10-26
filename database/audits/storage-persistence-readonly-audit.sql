-- READ-ONLY audit for storage persistence readiness.
-- Run with an approved audit connection against ONE explicitly selected target.
-- Do not run migrations or set role from this file. No writes are issued here.
-- Record current_database/current_user/session_user with the output and keep
-- production and sandbox results separate. Missing rows/relations are findings.

SELECT current_database() AS database_name,
       current_user AS current_role,
       session_user AS session_role,
       current_setting('transaction_read_only') AS transaction_read_only;

-- Required roles and security-relevant attributes.
SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
       rolcanlogin, rolreplication, rolbypassrls
FROM pg_catalog.pg_roles
WHERE rolname IN ('ghm_schema_owner', 'ghm_migrator', 'ghm_runtime', 'ghm_app_user')
ORDER BY rolname;

-- Storage relation presence and owner if present.
SELECT c.oid::regclass AS relation_name,
       pg_catalog.pg_get_userbyid(c.relowner) AS relation_owner,
       c.relkind,
       c.relrowsecurity AS row_level_security_enabled,
       c.relforcerowsecurity AS row_level_security_forced
FROM pg_catalog.pg_class AS c
WHERE c.oid = pg_catalog.to_regclass('ghm.storage_object');

-- Lifecycle routine ownership, SECURITY DEFINER flag, fixed search_path,
-- and effective ACL entries. Compare the exact signatures with migrations.
SELECT p.oid::regprocedure AS function_signature,
       pg_catalog.pg_get_userbyid(p.proowner) AS function_owner,
       p.prosecdef AS security_definer,
       p.proconfig AS function_settings,
       CASE WHEN p.proacl IS NULL THEN '(default ACL)' ELSE p.proacl::text END AS raw_acl
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'ghm'
  AND p.proname IN (
    'storage_create_pending',
    'storage_mark_available',
    'storage_mark_deletion_pending',
    'storage_mark_deleted',
    'storage_get_object'
  )
ORDER BY p.proname, p.oid::regprocedure::text;

-- Expand effective function ACLs (including PostgreSQL defaults where proacl is NULL).
SELECT p.oid::regprocedure AS function_signature,
       CASE WHEN acl.grantee = 0 THEN 'PUBLIC'
            ELSE pg_catalog.pg_get_userbyid(acl.grantee) END AS grantee,
       acl.privilege_type,
       acl.is_grantable
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(
  COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
) AS acl
WHERE n.nspname = 'ghm'
  AND p.proname IN (
    'storage_create_pending',
    'storage_mark_available',
    'storage_mark_deletion_pending',
    'storage_mark_deleted',
    'storage_get_object'
  )
ORDER BY p.proname, p.oid::regprocedure::text, grantee, acl.privilege_type;

-- Direct table DML privilege checks. NULL means the table/role was not resolvable;
-- treat that as unresolved, not as a pass.
SELECT pg_catalog.to_regclass('ghm.storage_object')::text AS storage_table,
       CASE WHEN pg_catalog.to_regclass('ghm.storage_object') IS NULL THEN NULL
            ELSE pg_catalog.has_table_privilege('ghm_runtime', 'ghm.storage_object', 'SELECT') END AS runtime_select,
       CASE WHEN pg_catalog.to_regclass('ghm.storage_object') IS NULL THEN NULL
            ELSE pg_catalog.has_table_privilege('ghm_runtime', 'ghm.storage_object', 'INSERT') END AS runtime_insert,
       CASE WHEN pg_catalog.to_regclass('ghm.storage_object') IS NULL THEN NULL
            ELSE pg_catalog.has_table_privilege('ghm_runtime', 'ghm.storage_object', 'UPDATE') END AS runtime_update,
       CASE WHEN pg_catalog.to_regclass('ghm.storage_object') IS NULL THEN NULL
            ELSE pg_catalog.has_table_privilege('ghm_runtime', 'ghm.storage_object', 'DELETE') END AS runtime_delete;

-- Migration ledger location/presence; inspect row counts/checksums separately
-- using the approved migration-audit procedure if either relation exists.
SELECT pg_catalog.to_regclass('ghm.ghm_schema_migrations')::text AS ghm_ledger,
       pg_catalog.to_regclass('public.ghm_schema_migrations')::text AS public_ledger;

-- The unscoped one-argument metadata getter must be absent after the scoped
-- lookup migration. The expected two-argument overload must be present.
SELECT
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'ghm' AND p.proname = 'storage_get_object'
      AND p.pronargs = 1 AND p.proargtypes[0] = 'bigint'::regtype
  ) AS unscoped_getter_present,
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'ghm' AND p.proname = 'storage_get_object'
      AND p.pronargs = 2 AND p.proargtypes[0] = 'bigint'::regtype AND p.proargtypes[1] = 'bigint'::regtype
  ) AS account_scoped_getter_present;
