import { Pool } from 'pg';

// Read-only inventory. Deliberately restricted to the disposable local database
// until the output and role/function exception matrix have been reviewed.
const databaseUrl = process.env.GHM_SECURITY_AUDIT_DATABASE_URL?.trim()
  || process.env.GHM_MIGRATOR_DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('GHM_SECURITY_AUDIT_DATABASE_URL or GHM_MIGRATOR_DATABASE_URL is required');
const target = new URL(databaseUrl);
if (!['localhost', '127.0.0.1'].includes(target.hostname) || target.pathname !== '/ghm_disposable_test') {
  throw new Error('SECURITY DEFINER inventory is restricted to local ghm_disposable_test');
}

const pool = new Pool({ connectionString: databaseUrl, ssl: false, max: 1, connectionTimeoutMillis: 5_000 });
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const identity = await client.query(
      'SELECT current_database() AS database, session_user, current_user, current_setting(\'server_version\') AS server_version',
    );
    if (identity.rows[0]?.database !== 'ghm_disposable_test') throw new Error('Unexpected database identity');

    const inventory = await client.query(
      `WITH non_system_schemas AS (
         SELECT n.oid, n.nspname
           FROM pg_namespace n
          WHERE n.nspname <> 'information_schema'
            AND n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\\\'
       ), function_inventory AS (
         SELECT p.oid, n.nspname AS schema_name, p.proname AS function_name,
                p.oid::regprocedure::text AS identity_arguments,
                pg_get_userbyid(p.proowner) AS owner_name,
                p.proconfig,
                COALESCE(p.proacl, acldefault('f', p.proowner)) AS effective_acl,
                EXISTS (
                  SELECT 1 FROM pg_depend d
                   WHERE d.classid = 'pg_proc'::regclass
                     AND d.objid = p.oid AND d.deptype = 'e'
                ) AS extension_member
           FROM pg_proc p
           JOIN non_system_schemas n ON n.oid = p.pronamespace
          WHERE p.prosecdef
       ), expanded_acl AS (
         SELECT f.*, acl.grantee, acl.grantor, acl.privilege_type, acl.is_grantable,
                CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END AS grantee_name,
                CASE WHEN acl.grantor = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantor) END AS grantor_name
           FROM function_inventory f
           CROSS JOIN LATERAL aclexplode(f.effective_acl) acl
          WHERE acl.privilege_type = 'EXECUTE'
       )
       SELECT schema_name, function_name, identity_arguments, owner_name,
              COALESCE(proconfig, ARRAY[]::text[]) AS function_settings,
              extension_member,
              grantee_name, grantor_name, is_grantable,
              CASE WHEN grantee = 0 THEN ARRAY[]::text[] ELSE ARRAY(
                SELECT member.rolname
                  FROM pg_roles member
                 WHERE member.rolcanlogin
                   AND pg_has_role(member.oid, grantee, 'USAGE')
                 ORDER BY member.rolname
              ) END AS login_roles_with_effective_execute,
              (grantee = 0) AS is_public,
              (grantee <> 0 AND grantee_name <> owner_name) AS is_non_owner_grant
         FROM expanded_acl
        ORDER BY schema_name, function_name, identity_arguments, grantee_name`,
    );
    const functions = await client.query(
      `SELECT n.nspname AS schema_name, p.oid::regprocedure::text AS identity_arguments,
              pg_get_userbyid(p.proowner) AS owner_name,
              COALESCE(p.proconfig, ARRAY[]::text[]) AS function_settings,
              EXISTS (
                SELECT 1 FROM pg_depend d
                 WHERE d.classid = 'pg_proc'::regclass
                   AND d.objid = p.oid AND d.deptype = 'e'
              ) AS extension_member
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.prosecdef
          AND n.nspname <> 'information_schema'
          AND n.nspname NOT LIKE 'pg\\_%' ESCAPE '\\\\'
        ORDER BY n.nspname, p.oid::regprocedure::text`,
    );
    const summary = {
      identity: identity.rows[0],
      securityDefinerFunctionCount: functions.rowCount,
      functions: functions.rows,
      executeAclEntries: inventory.rows,
      reviewRequired: true,
      note: 'No role/function grant is presumed safe by this inventory. Reconcile every non-owner EXECUTE entry against a separately approved exact-signature exception matrix.',
    };
    process.stdout.write(JSON.stringify(summary, null, 2) + '\\n');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
