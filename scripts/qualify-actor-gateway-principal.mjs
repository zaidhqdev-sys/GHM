import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL;
const gatewayUrl = process.env.GHM_ACTOR_GATEWAY_DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;

if (!runtimeUrl || !gatewayUrl || !migratorUrl) {
  throw new Error('GHM runtime, actor-gateway and migrator database URLs are all required');
}
if (new Set([runtimeUrl, gatewayUrl, migratorUrl]).size !== 3) {
  throw new Error('Runtime, actor-gateway and migrator database URLs must be distinct');
}

const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false;
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const gatewayPool = new Pool({ connectionString: gatewayUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });
const fixture = { marker: `ghm-actor-gateway-${randomUUID()}`, accountIds: [] };

const identity = async (pool, expectedUser) => {
  const { rows } = await pool.query(`
    SELECT current_database() AS database_name,
           session_user,
           current_user,
           current_role
  `);
  const row = rows[0];
  if (row.database_name !== 'ghm_disposable_test' || row.session_user !== expectedUser || row.current_user !== expectedUser || row.current_role !== expectedUser) {
    throw new Error(`Expected ghm_disposable_test/${expectedUser}; received ${JSON.stringify(row)}`);
  }
  return row;
};

const createFixtureAccount = async (fullName, status = 'active') => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const { rows } = await client.query(
      `INSERT INTO ghm.account_identity (full_name, role, account_status)
       VALUES ($1, 'business', $2)
       RETURNING id`,
      [fullName, status],
    );
    await client.query('COMMIT');
    const id = Number(rows[0].id);
    fixture.accountIds.push(id);
    return id;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const expectSqlState = async (work, code, label) => {
  try {
    await work();
  } catch (error) {
    if (error?.code !== code) {
      throw new Error(`${label}: expected SQLSTATE ${code}; received ${error?.code ?? error?.message}`);
    }
    console.log(`${label}: PASS`);
    return;
  }
  throw new Error(`${label}: operation unexpectedly succeeded`);
};

try {
  await identity(runtimePool, 'ghm_runtime');
  await identity(gatewayPool, 'ghm_actor_gateway');
  await identity(cleanupPool, 'ghm_migrator');
  console.log('DATABASE PRINCIPAL IDENTITY: PASS');

  const activeAccountId = await createFixtureAccount(`${fixture.marker}-active`);
  const disabledAccountId = await createFixtureAccount(`${fixture.marker}-disabled`, 'disabled');

  const roleState = await gatewayPool.query(`
    SELECT r.rolcanlogin,
           r.rolinherit,
           r.rolsuper,
           r.rolcreatedb,
           r.rolcreaterole,
           r.rolreplication,
           r.rolbypassrls,
           NOT EXISTS (
             SELECT 1 FROM pg_auth_members m
              WHERE m.member = r.oid OR m.roleid = r.oid
           ) AS no_memberships
      FROM pg_roles r
     WHERE r.rolname = 'ghm_actor_gateway'
  `);
  assert.equal(roleState.rowCount, 1);
  assert.deepEqual(roleState.rows[0], {
    rolcanlogin: true,
    rolinherit: false,
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolreplication: false,
    rolbypassrls: false,
    no_memberships: true,
  });
  console.log('GATEWAY LOGIN LEAST-PRIVILEGE ATTRIBUTES: PASS');

  const functionState = await gatewayPool.query(`
    SELECT pg_get_userbyid(p.proowner) AS owner,
           p.prosecdef AS security_definer,
           p.proconfig AS function_config,
           has_function_privilege('ghm_runtime', p.oid, 'EXECUTE') AS runtime_can_execute,
           has_function_privilege('ghm_actor_gateway', p.oid, 'EXECUTE') AS gateway_can_execute
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'ghm'
       AND p.proname = 'assert_actor_gateway'
       AND pg_get_function_identity_arguments(p.oid) = 'p_actor_account_id bigint'
  `);
  assert.equal(functionState.rowCount, 1);
  assert.equal(functionState.rows[0].owner, 'ghm_schema_owner');
  assert.equal(functionState.rows[0].security_definer, true);
  assert.equal(functionState.rows[0].runtime_can_execute, false);
  assert.equal(functionState.rows[0].gateway_can_execute, true);
  assert.ok(functionState.rows[0].function_config?.includes('search_path=pg_catalog, ghm'));
  console.log('GATEWAY FUNCTION OWNER, SEARCH PATH AND EXECUTE GRANTS: PASS');

  const tablePrivileges = await gatewayPool.query(`
    SELECT has_table_privilege(current_user, 'ghm.account_identity', 'SELECT') AS can_read_accounts,
           has_table_privilege(current_user, 'ghm.account_identity', 'UPDATE') AS can_update_accounts,
           has_table_privilege(current_user, 'ghm.authentication_session', 'SELECT') AS can_read_sessions,
           has_table_privilege(current_user, 'ghm.account_password_credential', 'SELECT') AS can_read_passwords
  `);
  assert.deepEqual(tablePrivileges.rows[0], {
    can_read_accounts: false,
    can_update_accounts: false,
    can_read_sessions: false,
    can_read_passwords: false,
  });
  console.log('GATEWAY HAS NO DIRECT ACCOUNT/AUTH TABLE ACCESS: PASS');

  const accepted = await gatewayPool.query(
    'SELECT ghm.assert_actor_gateway($1) AS actor_account_id',
    [activeAccountId],
  );
  assert.equal(Number(accepted.rows[0].actor_account_id), activeAccountId);
  console.log('GATEWAY ACCEPTS ACTIVE TOKEN-SUBJECT CANDIDATE: PASS');

  const ownIdentity = await gatewayPool.query(
    'SELECT account_id, account_role, full_name FROM ghm.gateway_get_actor_identity($1)',
    [activeAccountId],
  );
  assert.equal(ownIdentity.rowCount, 1);
  assert.deepEqual(ownIdentity.rows[0], {
    account_id: activeAccountId,
    account_role: 'business',
    full_name: `${fixture.marker}-active`,
  });
  console.log('TYPED GATEWAY SELF-IDENTITY READ: PASS');

  await expectSqlState(
    () => gatewayPool.query('SELECT ghm.assert_actor_gateway($1)', [disabledAccountId]),
    '42501',
    'DISABLED ACTOR DENIED',
  );
  await expectSqlState(
    () => gatewayPool.query('SELECT ghm.assert_actor_gateway(0)'),
    '22023',
    'INVALID ACTOR ID DENIED',
  );
  await expectSqlState(
    () => runtimePool.query('SELECT ghm.assert_actor_gateway($1)', [activeAccountId]),
    '42501',
    'ORDINARY RUNTIME CANNOT EXECUTE GATEWAY FUNCTION',
  );
  await expectSqlState(
    () => runtimePool.query('SELECT * FROM ghm.gateway_get_actor_identity($1)', [activeAccountId]),
    '42501',
    'ORDINARY RUNTIME CANNOT EXECUTE TYPED GATEWAY OPERATION',
  );
  await expectSqlState(
    () => runtimePool.query('SET ROLE ghm_actor_gateway'),
    '42501',
    'ORDINARY RUNTIME CANNOT ASSUME GATEWAY ROLE',
  );
  await expectSqlState(
    () => gatewayPool.query('SET ROLE ghm_schema_owner'),
    '42501',
    'GATEWAY CANNOT ASSUME SCHEMA OWNER',
  );
  await expectSqlState(
    () => gatewayPool.query('SELECT id FROM ghm.account_identity LIMIT 1'),
    '42501',
    'GATEWAY CANNOT READ ACCOUNT TABLE DIRECTLY',
  );

  console.log('GHM ACTOR GATEWAY DATABASE PRINCIPAL QUALIFICATION: PASS');
} finally {
  try {
    await cleanupPool.query('BEGIN');
    await cleanupPool.query('SET LOCAL ROLE ghm_schema_owner');
    await cleanupPool.query(
      'DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])',
      [fixture.accountIds],
    );
    await cleanupPool.query('COMMIT');
  } catch (error) {
    await cleanupPool.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await Promise.all([runtimePool.end(), gatewayPool.end(), cleanupPool.end()]);
  }
}
