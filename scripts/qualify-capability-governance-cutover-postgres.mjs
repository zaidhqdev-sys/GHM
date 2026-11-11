import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const gatewayUrl = process.env.GHM_ACTOR_GATEWAY_DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
const databaseName = process.env.GHM_QUALIFICATION_DATABASE_NAME;
const databaseHost = process.env.GHM_QUALIFICATION_DATABASE_HOST;
const assertionSecret = process.env.GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET;
if (!assertionSecret || Buffer.from(assertionSecret, 'base64').length !== 32) throw new Error('A 32-byte capability assertion test key is required');

if (!runtimeUrl || !gatewayUrl || !migratorUrl || new Set([runtimeUrl, gatewayUrl, migratorUrl]).size !== 3) {
  throw new Error('Dedicated runtime, actor gateway and migrator connections are required');
}
if (databaseName !== 'ghm_disposable_test' || databaseHost !== 'localhost') {
  throw new Error('Capability governance cutover qualification is restricted to the disposable local PostgreSQL database');
}

const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false;
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const gatewayPool = new Pool({ connectionString: gatewayUrl, ssl });
const migratorPool = new Pool({ connectionString: migratorUrl, ssl });
const marker = `ghm-capability-cutover-${randomUUID()}`;
const capabilityIds = [];
let adminId;
const signAssertion = (accountId, operation) => { const issuedAt=Math.floor(Date.now()/1000),nonce=randomUUID(); const payload=`ghm-actor-gateway:v1|${accountId}|${operation}|${issuedAt}|${nonce}`; const signature=createHmac('sha256',Buffer.from(assertionSecret,'base64')).update(payload,'utf8').digest('hex'); return {issuedAt,nonce,signature}; };
const gatewayCall = (accountId, operation, sql, args=[]) => { const a=signAssertion(accountId,operation); return gatewayPool.query(sql,[accountId,a.issuedAt,a.nonce,a.signature,...args]); };

const expectDenied = async (work, label) => {
  try {
    await work();
  } catch (error) {
    if (error?.code !== '42501') {
      throw new Error(`${label}: expected PostgreSQL permission-denied (42501), received ${error?.code ?? error?.message}`);
    }
    console.log(`${label} PASS`);
    return;
  }
  throw new Error(`${label}: operation unexpectedly succeeded`);
};

const cleanup = async () => {
  const client = await migratorPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    for (const id of capabilityIds) {
      await client.query('DELETE FROM ghm.capability WHERE id = $1', [id]);
    }
    if (adminId) {
      await client.query('DELETE FROM ghm.account_identity WHERE id = $1', [adminId]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`Capability cutover cleanup failed: ${error?.message ?? error}`);
  } finally {
    client.release();
  }
};

try {
  const provision = await migratorPool.connect();
  try { await provision.query('BEGIN'); await provision.query('SET LOCAL ROLE ghm_schema_owner'); await provision.query("INSERT INTO ghm.actor_gateway_capability_assertion_secret(singleton,secret) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET secret=EXCLUDED.secret",[Buffer.from(assertionSecret,'base64')]); await provision.query('COMMIT'); } catch(e) { await provision.query('ROLLBACK').catch(()=>{}); throw e; } finally { provision.release(); }
  const setup = await migratorPool.connect();
  try {
    await setup.query('BEGIN');
    await setup.query('SET LOCAL ROLE ghm_schema_owner');
    const account = await setup.query(
      "INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'admin') RETURNING id",
      [marker],
    );
    adminId = Number(account.rows[0].id);
    await setup.query('COMMIT');
  } catch (error) {
    await setup.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    setup.release();
  }

  const cutoverSql = await readFile(
    fileURLToPath(new URL('../database/cutovers/20261111010000_revoke_legacy_capability_governance_runtime.sql', import.meta.url)),
    'utf8',
  );
  const cutover = await migratorPool.connect();
  try {
    await cutover.query('SET ROLE ghm_schema_owner');
    await cutover.query(cutoverSql);
    await cutover.query('RESET ROLE');
  } finally {
    cutover.release();
  }
  console.log('MANUAL CAPABILITY CUTOVER SQL APPLIED TO DISPOSABLE DATABASE PASS');

  await expectDenied(
    () => runtimePool.query(
      'SELECT * FROM ghm.create_capability_draft($1,$2,$3,$4,$5,$6,$7,$8)',
      [adminId, `${marker} Runtime Forbidden`, `${marker}-runtime-forbidden`, null, null, 0, null, 1],
    ),
    'RUNTIME DIRECT LEGACY CAPABILITY RPC DENIAL',
  );

  await expectDenied(
    () => gatewayPool.query(
      'SELECT * FROM ghm.create_capability_draft($1,$2,$3,$4,$5,$6,$7,$8)',
      [adminId, `${marker} Gateway Direct Forbidden`, `${marker}-gateway-direct-forbidden`, null, null, 0, null, 1],
    ),
    'GATEWAY DIRECT LEGACY CAPABILITY RPC DENIAL',
  );

  const gatewayList = await gatewayCall(adminId,'capability.list','SELECT * FROM ghm.gateway_list_capabilities($1,$2,$3,$4)');
  if (!Array.isArray(gatewayList.rows)) throw new Error('Gateway list wrapper failed after legacy RPC revocation');
  console.log('GATEWAY CAPABILITY LIST REMAINS AVAILABLE AFTER CUTOVER PASS');

  const created = await gatewayCall(adminId,'capability.create',
    'SELECT * FROM ghm.gateway_create_capability_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
    [`${marker} Gateway Draft`, `${marker}-gateway-draft`, null, null, 0, null, 1]);
  const capabilityId = created.rows[0]?.id;
  if (!capabilityId || created.rows[0]?.lifecycle_status !== 'draft') {
    throw new Error('Gateway draft creation failed after legacy RPC revocation');
  }
  capabilityIds.push(capabilityId);
  console.log('GATEWAY CAPABILITY DRAFT CREATION REMAINS AVAILABLE AFTER CUTOVER PASS');

  await expectDenied(
    () => runtimePool.query(
      'SELECT * FROM ghm.update_capability_draft($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [adminId, capabilityId, `${marker} Runtime Update Forbidden`, `${marker}-runtime-update-forbidden`, null, null, 0, null, 1],
    ),
    'RUNTIME DIRECT LEGACY CAPABILITY UPDATE DENIAL',
  );
  await expectDenied(
    () => runtimePool.query(
      'SELECT * FROM ghm.transition_capability_lifecycle($1,$2,$3,$4,$5)',
      [adminId, capabilityId, 'active', null, 1],
    ),
    'RUNTIME DIRECT LEGACY CAPABILITY TRANSITION DENIAL',
  );
  await expectDenied(
    () => gatewayPool.query(
      'SELECT * FROM ghm.update_capability_draft($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [adminId, capabilityId, `${marker} Gateway Direct Update Forbidden`, `${marker}-gateway-direct-update-forbidden`, null, null, 0, null, 1],
    ),
    'GATEWAY DIRECT LEGACY CAPABILITY UPDATE DENIAL',
  );
  await expectDenied(
    () => gatewayPool.query(
      'SELECT * FROM ghm.transition_capability_lifecycle($1,$2,$3,$4,$5)',
      [adminId, capabilityId, 'active', null, 1],
    ),
    'GATEWAY DIRECT LEGACY CAPABILITY TRANSITION DENIAL',
  );

  const gatewayUpdated = await gatewayCall(adminId,'capability.update',
    'SELECT * FROM ghm.gateway_update_capability_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    [capabilityId, `${marker} Gateway Draft Updated`, `${marker}-gateway-draft`, null, null, 0, null, 1]);
  if (gatewayUpdated.rows[0]?.name !== `${marker} Gateway Draft Updated`) {
    throw new Error('Gateway update wrapper failed after legacy RPC revocation');
  }
  console.log('GATEWAY CAPABILITY UPDATE REMAINS AVAILABLE AFTER CUTOVER PASS');

  const gatewayTransition = await gatewayCall(adminId,'capability.transition',
    'SELECT * FROM ghm.gateway_transition_capability_lifecycle($1,$2,$3,$4,$5,$6,$7,$8)',
    [capabilityId, 'active', null, 1]);
  if (gatewayTransition.rows[0]?.lifecycle_status !== 'active') {
    throw new Error('Gateway transition wrapper failed after legacy RPC revocation');
  }
  console.log('GATEWAY CAPABILITY TRANSITION REMAINS AVAILABLE AFTER CUTOVER PASS');

  const privileges = await runtimePool.query(
    `SELECT
       has_function_privilege(current_user, 'ghm.create_capability_draft(bigint,text,text,text,uuid,integer,text,integer)', 'EXECUTE') AS runtime_can_create,
       has_function_privilege(current_user, 'ghm.update_capability_draft(bigint,uuid,text,text,text,uuid,integer,text,integer)', 'EXECUTE') AS runtime_can_update,
       has_function_privilege(current_user, 'ghm.transition_capability_lifecycle(bigint,uuid,text,uuid,integer)', 'EXECUTE') AS runtime_can_transition,
       has_function_privilege(current_user, 'ghm.gateway_create_capability_draft(bigint,text,text,text,uuid,integer,text,integer)', 'EXECUTE') AS runtime_can_gateway_create`,
  );
  const p = privileges.rows[0];
  if (p.runtime_can_create || p.runtime_can_update || p.runtime_can_transition || p.runtime_can_gateway_create) {
    throw new Error(`Runtime capability RPC privilege leak after cutover: ${JSON.stringify(p)}`);
  }
  console.log('RUNTIME LEGACY AND GATEWAY RPC PRIVILEGE DENIAL PASS');
  console.log('GHM CAPABILITY GOVERNANCE CUTOVER QUALIFICATION: PASS');
} finally {
  await cleanup();
  await runtimePool.end();
  await gatewayPool.end();
  await migratorPool.end();
}
