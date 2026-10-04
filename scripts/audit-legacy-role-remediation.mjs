import 'dotenv/config';
import { Client } from 'pg';

const url = process.env.GHM_MIGRATOR_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
if (!url) throw new Error('Missing GHM_MIGRATOR_DATABASE_URL or DATABASE_URL');

const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const q = (sql, params = []) => c.query(sql, params).then(r => r.rows);

try {
  await c.connect();

  const server = await q("SELECT current_database() AS database_name,current_user,current_schema(),current_setting('server_version_num') AS server_version_num");

  const roles = await q(`
    SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,
           rolreplication,rolbypassrls,rolvaliduntil::text
    FROM pg_roles
    WHERE rolname IN ('ghm_app_user','ghm_db_user','ghm_runtime','ghm_migrator','ghm_schema_owner')
    ORDER BY rolname
  `);

  const memberships = await q(`
    SELECT member.rolname AS member,
           parent.rolname AS granted_role,
           m.admin_option,
           member.rolinherit AS member_inherit
    FROM pg_auth_members m
    JOIN pg_roles member ON member.oid=m.member
    JOIN pg_roles parent ON parent.oid=m.roleid
    WHERE member.rolname IN ('ghm_app_user','ghm_db_user','ghm_runtime','ghm_migrator','ghm_schema_owner')
       OR parent.rolname IN ('ghm_app_user','ghm_db_user','ghm_runtime','ghm_migrator','ghm_schema_owner')
    ORDER BY member.rolname,parent.rolname
  `);

  const ownership = await q(`
    SELECT n.nspname AS schema_name,c.relname AS object_name,c.relkind,
           r.rolname AS owner
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_roles r ON r.oid=c.relowner
    WHERE r.rolname IN ('ghm_app_user','ghm_db_user')
    ORDER BY n.nspname,c.relname
  `);

  const schemaPrivileges = await q(`
    SELECT r.rolname AS role_name,n.nspname AS schema_name,
           has_schema_privilege(r.rolname,n.oid,'USAGE') AS usage,
           has_schema_privilege(r.rolname,n.oid,'CREATE') AS create_priv
    FROM pg_roles r
    CROSS JOIN pg_namespace n
    WHERE r.rolname IN ('ghm_app_user','ghm_db_user','ghm_runtime','ghm_migrator','ghm_schema_owner')
      AND n.nspname NOT LIKE 'pg_%'
      AND n.nspname <> 'information_schema'
    ORDER BY r.rolname,n.nspname
  `);

  const tablePrivileges = await q(`
    SELECT table_schema AS schema_name,table_name,grantee,privilege_type,is_grantable
    FROM information_schema.role_table_grants
    WHERE grantee IN ('ghm_app_user','ghm_db_user','ghm_runtime','ghm_migrator','ghm_schema_owner')
      AND table_schema NOT IN ('pg_catalog','information_schema')
    ORDER BY grantee,table_schema,table_name,privilege_type
  `);

  const databasePrivileges = await q(`
    SELECT rolname AS role_name,
           has_database_privilege(rolname,current_database(),'CONNECT') AS connect,
           has_database_privilege(rolname,current_database(),'CREATE') AS create_priv,
           has_database_privilege(rolname,current_database(),'TEMP') AS temp
    FROM pg_roles
    WHERE rolname IN ('ghm_app_user','ghm_db_user','ghm_runtime','ghm_migrator','ghm_schema_owner')
    ORDER BY rolname
  `);

  const dangerousRoleMemberships = memberships.filter(x =>
    (x.member === 'ghm_app_user' && x.granted_role === 'ghm_db_user') ||
    (x.member === 'ghm_db_user' && ['ghm_migrator','ghm_runtime','ghm_schema_owner'].includes(x.granted_role))
  );

  const dangerousAttributes = roles.filter(x =>
    (x.rolname === 'ghm_db_user' && (x.rolcreaterole || x.rolcreatedb)) ||
    (x.rolname === 'ghm_app_user' && (x.rolcanlogin))
  ).map(x => ({
    role: x.rolname,
    createrole: x.rolcreaterole,
    createdb: x.rolcreatedb,
    canlogin: x.rolcanlogin
  }));

  const legacyOwnership = ownership.filter(x =>
    x.owner === 'ghm_db_user' && x.schema_name === 'public'
  );

  const findings = [];
  if (dangerousAttributes.some(x => x.role === 'ghm_db_user' && x.createrole))
    findings.push('ghm_db_user has CREATEROLE authority');
  if (dangerousAttributes.some(x => x.role === 'ghm_db_user' && x.createdb))
    findings.push('ghm_db_user has CREATEDB authority');
  if (dangerousRoleMemberships.some(x => x.member === 'ghm_app_user' && x.granted_role === 'ghm_db_user'))
    findings.push('ghm_app_user can inherit ghm_db_user authority');
  for (const role of ['ghm_migrator','ghm_runtime','ghm_schema_owner']) {
    if (dangerousRoleMemberships.some(x => x.member === 'ghm_db_user' && x.granted_role === role && x.admin_option))
      findings.push(`ghm_db_user has ADMIN OPTION on ${role}`);
  }

  const pgRoleMembershipPaths = await q(`
    WITH RECURSIVE paths(member_oid, granted_oid, depth, path) AS (
      SELECT m.member, m.roleid, 1, ARRAY[m.member,m.roleid]::oid[]
      FROM pg_auth_members m
      UNION ALL
      SELECT p.member_oid, m.roleid, p.depth + 1, p.path || m.roleid
      FROM paths p
      JOIN pg_auth_members m ON m.member = p.granted_oid
      WHERE p.depth < 8
        AND NOT m.roleid = ANY(p.path)
    )
    SELECT member.rolname AS source_role,
           granted.rolname AS reachable_role,
           p.depth,
           array_to_string(ARRAY(
             SELECT r.rolname
             FROM unnest(p.path) WITH ORDINALITY u(oid,ord)
             JOIN pg_roles r ON r.oid=u.oid
             ORDER BY u.ord
           ), ' -> ') AS role_path
    FROM paths p
    JOIN pg_roles member ON member.oid=p.member_oid
    JOIN pg_roles granted ON granted.oid=p.granted_oid
    WHERE member.rolname IN ('ghm_app_user','ghm_db_user')
      AND granted.rolname IN ('ghm_migrator','ghm_runtime','ghm_schema_owner')
    ORDER BY member.rolname,p.depth,granted.rolname
  `);

  console.log(JSON.stringify({
    audit: 'GHM legacy role remediation audit',
    version: 1,
    captured_at: new Date().toISOString(),
    mutation: false,
    server,
    roles,
    direct_memberships: memberships,
    transitive_role_paths: pgRoleMembershipPaths,
    legacy_role_ownership: legacyOwnership,
    schema_privileges: schemaPrivileges,
    table_privileges: tablePrivileges,
    database_privileges: databasePrivileges,
    findings,
    remediation_boundary: {
      status: 'REMEDIATION_PENDING',
      required_before_mutation: [
        'prove current application/runtime/migration credentials do not depend on legacy roles',
        'prove no operational recovery process depends on ghm_db_user or ghm_app_user',
        'preserve or archive the two legacy users before object retirement',
        'define canonical role ownership and least-privilege end state',
        'remove legacy role memberships before removing role authority',
        'reconcile ownership of every legacy object before role retirement',
        'perform role/privilege mutation only in an explicitly approved migration slice'
      ],
      forbidden_in_this_audit: [
        'GRANT','REVOKE','ALTER ROLE','DROP ROLE','DROP OWNED',
        'REASSIGN OWNED','ALTER TABLE OWNER','DDL','DML'
      ]
    },
    decision: 'DO_NOT_MUTATE_LEGACY_ROLES_FROM_THIS_AUDIT'
  }, null, 2));
} finally {
  await c.end().catch(() => {});
}
