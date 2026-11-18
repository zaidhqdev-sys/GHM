import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL;
const gatewayUrl = process.env.GHM_ACTOR_GATEWAY_DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
const expectedDatabase = process.env.GHM_QUALIFICATION_DATABASE_NAME || 'ghm_disposable_test';
if (!runtimeUrl || !gatewayUrl || !migratorUrl) throw new Error('Explicit runtime, Actor Gateway and migrator URLs are required');
if (process.env.GHM_STORAGE_QUALIFICATION_ALLOW_MUTATIONS !== 'true') {
  throw new Error('Refusing grant cutover qualification without explicit disposable mutation opt-in');
}
for (const [name, url] of [['runtime', runtimeUrl], ['gateway', gatewayUrl], ['migrator', migratorUrl]]) {
  const parsed = new URL(url);
  if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) || parsed.pathname !== `/${expectedDatabase}`) {
    throw new Error(`Refusing grant qualification outside localhost disposable PostgreSQL (${name})`);
  }
}
if (new Set([runtimeUrl, gatewayUrl, migratorUrl]).size !== 3) throw new Error('Role URLs must be distinct');

const runtime = new Pool({ connectionString: runtimeUrl, ssl: false });
const gateway = new Pool({ connectionString: gatewayUrl, ssl: false });
const migrator = new Pool({ connectionString: migratorUrl, ssl: false });
const readSqlBody = relativePath => {
  const path = new URL(relativePath, import.meta.url);
  const sql = readFileSync(path, 'utf8');
  const withoutHeaderComments = sql.replace(/^\s*(?:--[^\n]*\n\s*)*/i, '');
  if (!/^BEGIN;\s*/i.test(withoutHeaderComments) || !/\s*COMMIT;\s*$/.test(withoutHeaderComments)) {
    throw new Error(`Expected one outer BEGIN/COMMIT in ${path.pathname}`);
  }
  const body = withoutHeaderComments.replace(/^BEGIN;\s*/i, '').replace(/\s*COMMIT;\s*$/, '');
  if (/^\s*(?:BEGIN|COMMIT);/im.test(body)) throw new Error(`Nested transaction boundary in ${path.pathname}`);
  return body;
};
const cutoverSql = readSqlBody('../database/cutovers/20261116010000_revoke_legacy_storage_metadata_runtime.sql');
const rollbackSql = readSqlBody('../database/cutovers/20261116010000_restore_legacy_storage_metadata_runtime.sql');
const names = [
  'storage_create_pending',
  'storage_get_object',
  'storage_mark_available',
  'storage_mark_deletion_pending',
  'storage_mark_deleted',
];
let snapshots = [];
let cutoverApplied = false;

const assertIdentity = async (pool, role) => {
  const r = await pool.query('SELECT current_database() AS db,session_user,current_user');
  const row = r.rows[0];
  if (row.db !== expectedDatabase || row.session_user !== role || row.current_user !== role) {
    throw new Error(`Unexpected ${role} identity: ${JSON.stringify(row)}`);
  }
};
const withSchemaOwner = async (work) => {
  const client = await migrator.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const identity = await client.query('SELECT session_user,current_user');
    if (identity.rows[0]?.session_user !== 'ghm_migrator' || identity.rows[0]?.current_user !== 'ghm_schema_owner') {
      throw new Error('Schema-owner role identity mismatch');
    }
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
};
const restoreOriginalAcl = async () => {
  if (!cutoverApplied || snapshots.length === 0) return;
  await withSchemaOwner(async client => client.query(rollbackSql));
  cutoverApplied = false;
};

try {
  await assertIdentity(runtime, 'ghm_runtime');
  await assertIdentity(gateway, 'ghm_actor_gateway');
  await assertIdentity(migrator, 'ghm_migrator');

  snapshots = await migrator.query(`
    SELECT
      p.oid::regprocedure::text AS signature,
      p.proname,
      pg_get_userbyid(p.proowner) AS owner,
      p.prosecdef AS security_definer,
      p.proconfig AS function_settings,
      COALESCE(bool_or(a.grantee = 0 AND a.privilege_type = 'EXECUTE'), false) AS public_execute,
      COALESCE(bool_or(a.grantee = runtime_role.oid AND a.privilege_type = 'EXECUTE'), false) AS runtime_direct_execute,
      COALESCE(bool_or(a.grantee = migrator_role.oid AND a.privilege_type = 'EXECUTE'), false) AS migrator_direct_execute,
      COALESCE(bool_or(a.grantee = gateway_role.oid AND a.privilege_type = 'EXECUTE'), false) AS gateway_direct_execute,
      has_function_privilege('ghm_runtime', p.oid, 'EXECUTE') AS runtime_execute,
      has_function_privilege('ghm_migrator', p.oid, 'EXECUTE') AS migrator_execute,
      has_function_privilege('ghm_actor_gateway', p.oid, 'EXECUTE') AS gateway_execute,
      (
        SELECT string_agg(format('NULL::%s', format_type(arg_type, NULL)), ', ' ORDER BY ord)
        FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY AS args(arg_type, ord)
      ) AS null_arguments
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_roles runtime_role ON runtime_role.rolname = 'ghm_runtime'
    JOIN pg_roles migrator_role ON migrator_role.rolname = 'ghm_migrator'
    JOIN pg_roles gateway_role ON gateway_role.rolname = 'ghm_actor_gateway'
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
    WHERE n.nspname = 'ghm'
      AND p.proname = ANY($1::text[])
    GROUP BY p.oid,p.proname,p.proargtypes
    ORDER BY p.proname
  `, [names]).then(r => r.rows);

  if (snapshots.length !== names.length || names.some(name => snapshots.filter(row => row.proname === name).length !== 1)) {
    throw new Error(`Expected exactly five unambiguous legacy storage functions; found ${JSON.stringify(snapshots.map(x => x.signature))}`);
  }
  if (snapshots.some(row => row.owner !== 'ghm_schema_owner' || row.security_definer !== true
    || !row.function_settings?.some(setting => setting === 'search_path=pg_catalog, ghm' || setting === 'search_path=pg_catalog, ghm, pg_temp')
    || row.public_execute || !row.runtime_execute || row.migrator_execute || row.gateway_execute
    || !row.runtime_direct_execute || row.migrator_direct_execute || row.gateway_direct_execute)) {
    throw new Error(`Legacy storage ACL does not match the reviewed pre-cutover baseline: ${JSON.stringify(snapshots)}`);
  }
  console.log('FIVE LEGACY STORAGE FUNCTION SIGNATURES + ACL SNAPSHOT: PASS');

  await withSchemaOwner(async client => client.query(cutoverSql));
  cutoverApplied = true;
  console.log('DISPOSABLE LEGACY STORAGE FUNCTION GRANT REVOCATION: APPLIED');

  const after = await migrator.query(`
    SELECT
      p.oid::regprocedure::text AS signature,
      COALESCE(bool_or(a.grantee = 0 AND a.privilege_type = 'EXECUTE'), false) AS public_execute,
      has_function_privilege('ghm_runtime', p.oid, 'EXECUTE') AS runtime_execute,
      has_function_privilege('ghm_migrator', p.oid, 'EXECUTE') AS migrator_execute,
      has_function_privilege('ghm_actor_gateway', p.oid, 'EXECUTE') AS gateway_execute
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
    WHERE n.nspname='ghm' AND p.proname = ANY($1::text[])
    GROUP BY p.oid
  `, [names]);
  if (after.rows.length !== snapshots.length || after.rows.some(row => row.public_execute || row.runtime_execute || row.migrator_execute || row.gateway_execute)) {
    throw new Error(`Legacy runtime/PUBLIC execute grants remain after cutover: ${JSON.stringify(after.rows)}`);
  }
  console.log('PUBLIC + RUNTIME EXECUTE REVOKED ON ALL FIVE LEGACY STORAGE FUNCTIONS: PASS');

  for (const item of snapshots) {
    for (const [role, pool] of [['ghm_runtime', runtime], ['ghm_migrator', migrator], ['ghm_actor_gateway', gateway]]) {
      let probeError = null;
      const probeClient = await pool.connect();
      try {
        await probeClient.query('BEGIN');
        try {
          await probeClient.query(`SELECT ghm.${item.proname}(${item.null_arguments})`);
        } catch (error) {
          probeError = error;
        } finally {
          await probeClient.query('ROLLBACK');
        }
      } finally {
        probeClient.release();
      }
      const denialMessage = probeError && typeof probeError === 'object'
        ? String(probeError.message)
        : '';
      // PostgreSQL may reject the qualified call at schema USAGE before it
      // reaches the function EXECUTE check. The independent effective-ACL
      // assertions above must still prove function EXECUTE is absent.
      const denied = probeError && typeof probeError === 'object'
        && probeError.code === '42501'
        && (
          denialMessage.includes(`permission denied for function ${item.proname}`)
          || denialMessage === 'permission denied for schema ghm'
        );
      if (!denied) {
        const diagnostic = await migrator.query(`
          SELECT
            $1::text AS tested_role,
            $2::text AS function_signature,
            has_function_privilege($1, p.oid, 'EXECUTE') AS effective_execute,
            owner_role.rolname AS function_owner,
            COALESCE((
              SELECT json_agg(json_build_object(
                'grant_to', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE grantee_role.rolname END,
                'privilege', a.privilege_type,
                'grantable', a.is_grantable,
                'inherited_by_tested_role', CASE WHEN a.grantee = 0 THEN true
                  ELSE pg_has_role($1, a.grantee, 'USAGE') END
              ))
              FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
              LEFT JOIN pg_roles grantee_role ON grantee_role.oid = a.grantee
              WHERE a.privilege_type = 'EXECUTE'
                AND (a.grantee = 0 OR pg_has_role($1, a.grantee, 'USAGE'))
            ), '[]'::json) AS effective_acl_sources,
            COALESCE((
              SELECT json_agg(json_build_object('role', inherited.rolname, 'rolinherit', inherited.rolinherit))
              FROM pg_roles inherited
              WHERE pg_has_role($1, inherited.oid, 'USAGE')
            ), '[]'::json) AS inherited_roles
          FROM pg_proc p
          JOIN pg_roles owner_role ON owner_role.oid = p.proowner
          WHERE p.oid = to_regprocedure($2)
        `, [role, item.signature]);
        throw new Error(`${role} direct function execution was not denied for ${item.signature}; probe_error: ${JSON.stringify(probeError ? { code: probeError.code, message: probeError.message } : null)}; privilege diagnostics: ${JSON.stringify(diagnostic.rows[0] ?? null)}`);
      }
    }
  }
  console.log('RUNTIME, MIGRATOR AND ACTOR GATEWAY ACTUAL FUNCTION EXECUTION DENIED FOR ALL FIVE LEGACY FUNCTIONS: PASS');

  const wrapperAcl = await gateway.query(`
    SELECT
      has_function_privilege('ghm_actor_gateway','ghm.gateway_storage_create_pending(bigint,bigint,uuid,text,text,bigint,text,bigint,text,text,text,bigint,text,text)','EXECUTE') AS create_wrapper,
      has_function_privilege('ghm_actor_gateway','ghm.gateway_storage_get_object(bigint,bigint,uuid,text,text,bigint)','EXECUTE') AS read_wrapper,
      has_function_privilege('ghm_actor_gateway','ghm.gateway_storage_mark_deletion_pending(bigint,bigint,uuid,text,text,bigint)','EXECUTE') AS deletion_request_wrapper,
      has_function_privilege('ghm_actor_gateway','ghm.gateway_storage_mark_available(bigint,bigint,uuid,text,text,bigint,uuid,text,text,bigint,text,text,text,bigint)','EXECUTE') AS available_wrapper,
      has_function_privilege('ghm_actor_gateway','ghm.gateway_storage_mark_deleted(bigint,bigint,uuid,text,text,bigint,uuid,text,text,bigint,text)','EXECUTE') AS deleted_wrapper
  `);
  if (Object.values(wrapperAcl.rows[0]).some(value => value !== true)) {
    throw new Error(`Actor Gateway storage wrapper grants changed unexpectedly: ${JSON.stringify(wrapperAcl.rows[0])}`);
  }
  console.log('ACTOR GATEWAY STORAGE WRAPPERS RETAIN EXECUTE: PASS');

  await restoreOriginalAcl();
  const restored = await migrator.query(`
    SELECT p.oid::regprocedure::text AS signature,
      COALESCE(bool_or(a.grantee = 0 AND a.privilege_type = 'EXECUTE'), false) AS public_execute,
      has_function_privilege('ghm_runtime', p.oid, 'EXECUTE') AS runtime_execute,
      has_function_privilege('ghm_migrator', p.oid, 'EXECUTE') AS migrator_execute,
      has_function_privilege('ghm_actor_gateway', p.oid, 'EXECUTE') AS gateway_execute
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
    WHERE n.nspname='ghm' AND p.proname = ANY($1::text[])
    GROUP BY p.oid
  `, [names]);
  for (const original of snapshots) {
    const current = restored.rows.find(row => row.signature === original.signature);
    if (!current || current.public_execute !== original.public_execute
      || current.runtime_execute !== original.runtime_execute
      || current.migrator_execute !== original.migrator_execute
      || current.gateway_execute !== original.gateway_execute) {
      throw new Error(`ACL rollback mismatch for ${original.signature}: ${JSON.stringify({ original, current })}`);
    }
  }
  console.log('EXACT LEGACY FUNCTION ACL ROLLBACK: PASS');
  console.log('GHM STORAGE METADATA LEGACY GRANT CUTOVER + ROLLBACK QUALIFICATION: PASS');
} finally {
  if (cutoverApplied) await restoreOriginalAcl().catch(error => {
    console.error('CRITICAL: failed to restore disposable ACL snapshot', error);
    process.exitCode = 3;
  });
  await Promise.all([runtime.end(), gateway.end(), migrator.end()]);
}
