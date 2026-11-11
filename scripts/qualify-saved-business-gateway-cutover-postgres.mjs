import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import 'dotenv/config';
import { PostgresSavedBusinessGatewayReader } from '../dist/actor-gateway/saved-business-reader.js';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL;
const gatewayUrl = process.env.GHM_ACTOR_GATEWAY_DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
const secretText = process.env.GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET;
if (!runtimeUrl || !gatewayUrl || !migratorUrl || new Set([runtimeUrl, gatewayUrl, migratorUrl]).size !== 3) {
  throw new Error('Three distinct GHM database principals are required');
}
if (process.env.GHM_QUALIFICATION_DATABASE_NAME !== 'ghm_disposable_test'
  || process.env.GHM_QUALIFICATION_DATABASE_HOST !== 'localhost') {
  throw new Error('Saved Business gateway cutover qualification is restricted to disposable localhost PostgreSQL');
}
const key = Buffer.from(secretText ?? '', 'base64');
if (key.length !== 32 || key.toString('base64') !== secretText) {
  throw new Error('A canonical base64 32-byte Actor Gateway assertion key is required');
}
const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false;
const runtime = new Pool({ connectionString: runtimeUrl, ssl });
const gateway = new Pool({ connectionString: gatewayUrl, ssl });
const migrator = new Pool({ connectionString: migratorUrl, ssl });
const marker = 'gw-saved-business-' + randomUUID();
const ids = { accounts: [], businesses: [], saved: [] };

const sign = (actor, operation, context) => {
  const issuedAt = Math.floor(Date.now() / 1000);
  const nonce = randomUUID();
  const json = JSON.stringify(context);
  const hex = Buffer.from(json, 'utf8').toString('hex');
  const payload = 'ghm-actor-gateway:v2|' + actor + '|' + operation + '|' + issuedAt + '|' + nonce + '|' + hex;
  return { issuedAt, nonce, context: json, signature: createHmac('sha256', key).update(payload, 'utf8').digest('hex') };
};
const setup = async (sql, args = []) => {
  const client = await migrator.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const result = await client.query(sql, args);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};
const denied = async (work, label) => {
  let error;
  try { await work(); } catch (caught) { error = caught; }
  assert.ok(error, label + ' unexpectedly succeeded');
  assert.equal(error.code, '42501', label + ' returned an unexpected SQLSTATE');
  console.log(label + ': PASS');
  return error;
};

try {
  for (const [pool, expected, label] of [
    [runtime, 'ghm_runtime', 'RUNTIME'],
    [gateway, 'ghm_actor_gateway', 'ACTOR GATEWAY'],
    [migrator, 'ghm_migrator', 'MIGRATOR'],
  ]) {
    const identity = await pool.query('SELECT current_database() AS db, session_user, current_user');
    assert.equal(identity.rows[0].db, 'ghm_disposable_test');
    assert.equal(identity.rows[0].session_user, expected);
    assert.equal(identity.rows[0].current_user, expected);
    console.log(label + ' DATABASE IDENTITY: PASS');
  }

  const accounts = await setup(
    "INSERT INTO ghm.account_identity(full_name,role) VALUES($1,'customer'),($2,'customer') RETURNING id",
    [marker + ' owner', marker + ' outsider'],
  );
  const owner = Number(accounts.rows[0].id);
  const outsider = Number(accounts.rows[1].id);
  ids.accounts.push(owner, outsider);
  const business = await setup(
    "INSERT INTO ghm.business(name,slug,verification_status,is_verified,is_active) VALUES($1,$2,'approved',true,true) RETURNING id",
    [marker, marker],
  );
  const businessId = Number(business.rows[0].id);
  ids.businesses.push(businessId);
  const replayBusiness = await setup(
    "INSERT INTO ghm.business(name,slug,verification_status,is_verified,is_active) VALUES($1,$2,'approved',true,true) RETURNING id",
    [marker + ' replay', marker + '-replay'],
  );
  const replayBusinessId = Number(replayBusiness.rows[0].id);
  ids.businesses.push(replayBusinessId);

  const cutover = await readFile(fileURLToPath(new URL('../database/cutovers/20261111110000_revoke_legacy_saved_business_runtime.sql', import.meta.url)), 'utf8');
  const cutoverStatements = cutover.replace(/^\s*BEGIN;\s*/i, '').replace(/\s*COMMIT;\s*$/i, '');
  await setup(cutoverStatements);
  console.log('MANUAL SAVED BUSINESS CUTOVER APPLIED TO DISPOSABLE POSTGRESQL: PASS');

  await denied(() => runtime.query('SELECT * FROM ghm.saved_business'), 'RUNTIME DIRECT SAVED BUSINESS SELECT DENIED');
  const columnReads = await setup(`
    SELECT a.attname
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'ghm' AND c.relname = 'saved_business'
       AND a.attnum > 0 AND NOT a.attisdropped
       AND has_column_privilege('ghm_runtime', c.oid, a.attnum, 'SELECT')
  `);
  assert.equal(columnReads.rowCount, 0, 'runtime must not retain column-level SELECT privileges');
  console.log('RUNTIME COLUMN-LEVEL SAVED BUSINESS SELECT DENIED: PASS');
  await denied(() => runtime.query('SELECT * FROM ghm.create_saved_business($1,$2)', [owner, businessId]), 'RUNTIME LEGACY CREATE EXECUTE DENIED');
  await denied(() => runtime.query('SELECT ghm.delete_saved_business($1,$2)', [owner, 1]), 'RUNTIME LEGACY DELETE EXECUTE DENIED');
  await denied(() => runtime.query("SELECT nextval('ghm.saved_business_id_seq')"), 'RUNTIME SAVED BUSINESS SEQUENCE ACCESS DENIED');

  const privileges = await setup(`
    SELECT has_table_privilege('ghm_runtime','ghm.saved_business','SELECT') AS runtime_select,
           has_function_privilege('ghm_runtime','ghm.create_saved_business(bigint,bigint)','EXECUTE') AS runtime_create,
           has_function_privilege('ghm_runtime','ghm.delete_saved_business(bigint,bigint)','EXECUTE') AS runtime_delete,
           has_function_privilege('ghm_actor_gateway','ghm.gateway_list_saved_businesses(bigint,bigint,uuid,text,text)','EXECUTE') AS gateway_list,
           has_function_privilege('ghm_actor_gateway','ghm.gateway_get_saved_business(bigint,bigint,uuid,text,text,bigint)','EXECUTE') AS gateway_get,
           has_function_privilege('ghm_actor_gateway','ghm.gateway_create_saved_business(bigint,bigint,uuid,text,text,bigint)','EXECUTE') AS gateway_create,
           has_function_privilege('ghm_actor_gateway','ghm.gateway_delete_saved_business(bigint,bigint,uuid,text,text,bigint)','EXECUTE') AS gateway_delete
  `);
  assert.deepEqual(privileges.rows[0], {
    runtime_select: false, runtime_create: false, runtime_delete: false,
    gateway_list: true, gateway_get: true, gateway_create: true, gateway_delete: true,
  });
  console.log('POST-CUTOVER SAVED BUSINESS PRIVILEGE MATRIX: PASS');

  const reader = new PostgresSavedBusinessGatewayReader(gateway, secretText);
  assert.deepEqual(await reader.list(owner), []);
  const created = await reader.create(owner, businessId);
  ids.saved.push(created.id);
  assert.equal(created.accountId, owner);
  assert.equal(created.businessId, businessId);
  console.log('SIGNED GATEWAY CREATE AND OWNER PROVENANCE: PASS');

  const ownerList = await reader.list(owner);
  assert.equal(ownerList.length, 1);
  assert.equal(ownerList[0].id, created.id);
  assert.equal(await reader.get(owner, created.id) !== null, true);
  assert.equal(await reader.get(outsider, created.id), null);
  assert.equal(await reader.delete(outsider, created.id), false);
  assert.equal((await reader.list(owner)).length, 1);
  console.log('SIGNED GATEWAY LIST/GET AND CROSS-ACCOUNT ISOLATION: PASS');

  const assertion = sign(owner, 'saved_business.create', { businessId });
  await denied(
    () => gateway.query(
      'SELECT * FROM ghm.gateway_create_saved_business($1,$2,$3,$4,$5,$6)',
      [outsider, assertion.issuedAt, assertion.nonce, assertion.context, assertion.signature, businessId],
    ),
    'SIGNED ACTOR SUBSTITUTION DENIED',
  );

  const replay = sign(owner, 'saved_business.create', { businessId: replayBusinessId });
  const replayArgs = [owner, replay.issuedAt, replay.nonce, replay.context, replay.signature, replayBusinessId];
  const replayCreate = await gateway.query(
    'SELECT * FROM ghm.gateway_create_saved_business($1,$2,$3,$4,$5,$6)', replayArgs,
  );
  ids.saved.push(Number(replayCreate.rows[0].id));
  await denied(
    () => gateway.query('SELECT * FROM ghm.gateway_create_saved_business($1,$2,$3,$4,$5,$6)', replayArgs),
    'SIGNED ASSERTION REPLAY DENIED',
  );

  const wrongContext = sign(owner, 'saved_business.create', { businessId: businessId + 1 });
  await denied(
    () => gateway.query(
      'SELECT * FROM ghm.gateway_create_saved_business($1,$2,$3,$4,$5,$6)',
      [owner, wrongContext.issuedAt, wrongContext.nonce, wrongContext.context, wrongContext.signature, businessId],
    ),
    'SIGNED REQUEST TARGET SUBSTITUTION DENIED',
  );

  assert.equal(await reader.delete(owner, created.id), true);
  assert.equal(await reader.get(owner, created.id), null);
  console.log('SIGNED GATEWAY DELETE AND OWNER SCOPE: PASS');
  console.log('GHM SAVED BUSINESS SIGNED GATEWAY CUTOVER QUALIFICATION: PASS');
} finally {
  try {
    await setup('DELETE FROM ghm.saved_business WHERE id = ANY($1::bigint[])', [ids.saved]);
    await setup('DELETE FROM ghm.business WHERE id = ANY($1::bigint[])', [ids.businesses]);
    await setup('DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])', [ids.accounts]);
  } catch (error) {
    console.error('Saved Business qualification cleanup failed:', error.message);
  }
  await Promise.all([runtime.end(), gateway.end(), migrator.end()]);
}
