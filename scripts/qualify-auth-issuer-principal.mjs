import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { assertAuthIssuerDatabaseIdentity } from '../dist/auth-issuer/database-principal.js';

const connectionString = process.env.GHM_AUTH_ISSUER_DATABASE_URL?.trim();
if (!connectionString) throw new Error('GHM_AUTH_ISSUER_DATABASE_URL is required');

const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 1,
  connectionTimeoutMillis: 5_000,
});

try {
  const identityResult = await pool.query(`
    SELECT session_user,
           current_user,
           r.rolcanlogin,
           r.rolinherit,
           r.rolsuper,
           r.rolcreatedb,
           r.rolcreaterole,
           r.rolreplication,
           r.rolbypassrls,
           NOT EXISTS (
             SELECT 1
               FROM pg_auth_members m
               JOIN pg_roles member_role ON member_role.oid = m.member
              WHERE m.member = r.oid
                 OR (
                   m.roleid = r.oid
                   AND (
                     member_role.rolname <> 'ghm_db_user'
                     OR m.admin_option IS DISTINCT FROM true
                     OR m.inherit_option IS DISTINCT FROM false
                     OR m.set_option IS DISTINCT FROM false
                   )
                 )
           ) AS no_untrusted_role_memberships
      FROM pg_roles r
     WHERE r.rolname = session_user
  `);
  assert.equal(identityResult.rowCount, 1, 'issuer login must resolve to exactly one PostgreSQL role');
  assertAuthIssuerDatabaseIdentity(identityResult.rows[0]);

  const callableAuthFunctions = await pool.query(`
    SELECT p.oid::regprocedure::text AS signature
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'ghm'
       AND p.proname LIKE 'auth\\_%' ESCAPE '\\'
       AND has_function_privilege(session_user, p.oid, 'EXECUTE')
     ORDER BY p.oid::regprocedure::text
  `);
  assert.deepEqual(
    callableAuthFunctions.rows,
    [],
    'new issuer principal must receive no auth-function EXECUTE privileges before the reviewed allow-list is granted',
  );

  const directRelationPrivileges = await pool.query(`
    SELECT c.relname AS table_name, privilege.privilege
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS privilege(privilege)
     WHERE n.nspname = 'ghm'
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
       AND has_table_privilege(session_user, c.oid, privilege.privilege)
     ORDER BY c.relname, privilege.privilege
  `);
  assert.deepEqual(
    directRelationPrivileges.rows,
    [],
    'issuer must not receive direct privileges on any GHM table/view; all access remains through reviewed SECURITY DEFINER functions',
  );

  process.stdout.write(JSON.stringify({
    principal: identityResult.rows[0].session_user,
    roleIsolation: 'passed',
    callableAuthFunctionsBeforeAllowList: 0,
    directRelationPrivileges: 0,
  }) + '\\n');
} finally {
  await pool.end();
}
