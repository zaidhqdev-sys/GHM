import 'dotenv/config';
import { Client } from 'pg';

// Read-only catalog inventory. Deliberately restricted to the disposable local
// qualification database; this script never changes roles, grants, schemas or data.
const url = process.env.GHM_SECURITY_DEFINER_AUDIT_DATABASE_URL?.trim();
if (!url) throw new Error('Missing GHM_SECURITY_DEFINER_AUDIT_DATABASE_URL');
const target = new URL(url);
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(target.hostname) || target.pathname !== '/ghm_disposable_test') {
  throw new Error('SECURITY DEFINER inventory is restricted to local ghm_disposable_test');
}

const client = new Client({ connectionString: url, ssl: false, application_name: 'ghm-security-definer-readonly-audit' });
const query = (sql) => client.query(sql).then((result) => result.rows);

try {
  await client.connect();
  const server = await query(`
    SELECT current_database() AS database_name,
           session_user,
           current_user,
           current_setting('server_version') AS server_version,
           current_setting('server_version_num') AS server_version_num,
           current_setting('search_path') AS session_search_path
  `);
  if (server[0]?.database_name !== 'ghm_disposable_test') {
    throw new Error('Connected database is not ghm_disposable_test; refusing catalog audit');
  }

  const functions = await query(`
    SELECT n.nspname AS schema_name,
           p.proname AS function_name,
           format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS identity_signature,
           p.prokind AS routine_kind,
           owner_role.rolname AS owner,
           p.proowner AS owner_oid,
           p.prosecdef AS security_definer,
           p.proleakproof AS leakproof,
           p.provolatile AS volatility,
           p.proparallel AS parallel_safety,
           p.proconfig AS function_settings,
           pg_get_userbyid(p.proowner) AS owner_name,
           pg_get_function_identity_arguments(p.oid) AS identity_arguments,
           pg_get_function_result(p.oid) AS result_type,
           pg_get_functiondef(p.oid) AS definition,
           COALESCE(extension_members.extensions, '[]'::jsonb) AS extension_membership,
           COALESCE(acl_entries.entries, '[]'::jsonb) AS direct_acl,
           COALESCE(effective_roles.roles, '[]'::jsonb) AS effective_execute_roles
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_roles owner_role ON owner_role.oid = p.proowner
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'extension', e.extname,
          'extension_schema', en.nspname,
          'extension_owner', pg_get_userbyid(e.extowner)
        ) ORDER BY e.extname) AS extensions
          FROM pg_depend d
          JOIN pg_extension e ON e.oid = d.refobjid
          JOIN pg_namespace en ON en.oid = e.extnamespace
         WHERE d.classid = 'pg_proc'::regclass
           AND d.objid = p.oid
           AND d.refclassid = 'pg_extension'::regclass
           AND d.deptype = 'e'
      ) extension_members ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'grantee', CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END,
          'grantor', grantor_role.rolname,
          'privilege', acl.privilege_type,
          'grantable', acl.is_grantable
        ) ORDER BY acl.grantee, acl.privilege_type, acl.grantor) AS entries
          FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
          LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
          LEFT JOIN pg_roles grantor_role ON grantor_role.oid = acl.grantor
      ) acl_entries ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(r.rolname ORDER BY r.rolname) AS roles
          FROM pg_roles r
         WHERE has_function_privilege(r.oid, p.oid, 'EXECUTE')
      ) effective_roles ON true
     WHERE p.prokind IN ('f', 'p')
       AND p.prosecdef
       AND n.nspname <> 'information_schema'
       AND n.nspname NOT LIKE 'pg_%'
     ORDER BY n.nspname, p.proname, p.oid::regprocedure::text
  `);

  const memberships = await query(`
    SELECT member.rolname AS member,
           granted.rolname AS granted_role,
           m.admin_option,
           m.inherit_option,
           m.set_option
      FROM pg_auth_members m
      JOIN pg_roles member ON member.oid = m.member
      JOIN pg_roles granted ON granted.oid = m.roleid
     ORDER BY member.rolname, granted.rolname
  `);

  const defaultAcls = await query(`
    SELECT owner_role.rolname AS owner,
           CASE WHEN d.defaclnamespace = 0 THEN NULL ELSE n.nspname END AS schema_name,
           d.defaclobjtype AS object_type,
           acl.grantee = 0 AS grantee_is_public,
           CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END AS grantee,
           grantor_role.rolname AS grantor,
           acl.privilege_type AS privilege,
           acl.is_grantable AS grantable
      FROM pg_default_acl d
      JOIN pg_roles owner_role ON owner_role.oid = d.defaclrole
      LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
      CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
      LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
      LEFT JOIN pg_roles grantor_role ON grantor_role.oid = acl.grantor
     WHERE d.defaclobjtype = 'f'
     ORDER BY owner_role.rolname, schema_name, grantee, privilege
  `);

  const findings = [];
  for (const fn of functions) {
    const acl = fn.direct_acl ?? [];
    const nonOwnerExec = acl.filter((entry) =>
      entry.privilege === 'EXECUTE' && entry.grantee !== fn.owner && entry.grantee !== 'PUBLIC'
    );
    const publicExec = acl.filter((entry) =>
      entry.privilege === 'EXECUTE' && entry.grantee === 'PUBLIC'
    );
    const unsafeSearchPath = !(fn.function_settings ?? []).some((setting) =>
      setting === 'search_path=pg_catalog, ghm, pg_temp'
    );
    if (nonOwnerExec.length || publicExec.length || unsafeSearchPath) {
      findings.push({
        signature: fn.identity_signature,
        schema: fn.schema_name,
        owner: fn.owner,
        non_owner_execute_grants: nonOwnerExec,
        public_execute_grants: publicExec,
        pinned_search_path: !unsafeSearchPath,
      });
    }
  }

  process.stdout.write(JSON.stringify({
    audit: 'GHM SECURITY DEFINER whole-database catalog inventory',
    version: 1,
    captured_at: new Date().toISOString(),
    mutation: false,
    server: server[0],
    routine_count: functions.length,
    functions,
    role_memberships: memberships,
    function_default_acls: defaultAcls,
    preliminary_findings: findings,
    decision: 'REVIEW_REQUIRED_NO_AUTOMATIC_APPROVAL',
    limitations: [
      'Catalog inventory is limited to this disposable database and does not establish production state.',
      'Direct grants and effective role execution are reported separately; every grant needs a documented function-role justification.',
      'Owner, search_path, extension membership and role membership require human review.',
      'This report is an inventory, not a migration or permission-change script.',
    ],
  }, null, 2) + '\\n');
} finally {
  await client.end().catch(() => {});
}
