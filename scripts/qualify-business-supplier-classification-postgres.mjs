import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { Pool } from 'pg';

if (process.env.NODE_ENV !== 'test') throw new Error('Supplier classification qualification is restricted to NODE_ENV=test');
const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
const gatewayUrl = process.env.GHM_ACTOR_GATEWAY_DATABASE_URL;
const assertionSecret = process.env.GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET;
if (!assertionSecret || Buffer.from(assertionSecret, 'base64').length !== 32) throw new Error('A 32-byte gateway assertion test key is required');
if (!runtimeUrl || !migratorUrl || !gatewayUrl || new Set([runtimeUrl, migratorUrl, gatewayUrl]).size !== 3) throw new Error('Distinct runtime, migrator and actor gateway database URLs are required');

const runtimePool = new Pool({ connectionString: runtimeUrl, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
const migratorPool = new Pool({ connectionString: migratorUrl, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
const gatewayPool = new Pool({ connectionString: gatewayUrl, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
const marker = `supplier-classification-${randomUUID()}`;
let accountId;
let memberAccountId;
let businessId;
const signAssertion = (actorId, operation = 'supplier.classification.update', issuedAt = Math.floor(Date.now()/1000), context = {}) => { const nonce=randomUUID(),contextJson=JSON.stringify(context),contextHex=Buffer.from(contextJson,'utf8').toString('hex'); const payload=`ghm-actor-gateway:v2|${actorId}|${operation}|${issuedAt}|${nonce}|${contextHex}`; const signature=createHmac('sha256',Buffer.from(assertionSecret,'base64')).update(payload,'utf8').digest('hex'); return {issuedAt,nonce,context:contextJson,signature}; };
const gatewayCall = (actorId,isSupplier) => { const a=signAssertion(actorId,'supplier.classification.update',Math.floor(Date.now()/1000),{businessId,isSupplier}); return gatewayPool.query('SELECT * FROM ghm.gateway_update_business_supplier_classification($1,$2,$3,$4,$5,$6,$7)',[actorId,a.issuedAt,a.nonce,a.context,a.signature,businessId,isSupplier]); };

try {
  const runtimeIdentity = await runtimePool.query('SELECT current_database() AS database_name, session_user, current_user');
  assert.equal(runtimeIdentity.rows[0].session_user, 'ghm_runtime');
  assert.equal(runtimeIdentity.rows[0].current_user, 'ghm_runtime');
  assert.equal(runtimeIdentity.rows[0].database_name, process.env.GHM_QUALIFICATION_DATABASE_NAME);
  const gatewayIdentity = await gatewayPool.query('SELECT current_database() AS database_name, session_user, current_user');
  const provision = await migratorPool.connect();
  try { await provision.query('BEGIN'); await provision.query('SET LOCAL ROLE ghm_schema_owner'); await provision.query("INSERT INTO ghm.actor_gateway_capability_assertion_secret(singleton,secret) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET secret=EXCLUDED.secret",[Buffer.from(assertionSecret,'base64')]); await provision.query('COMMIT'); } catch(e) { await provision.query('ROLLBACK').catch(()=>{}); throw e; } finally { provision.release(); }
  assert.equal(gatewayIdentity.rows[0].session_user, 'ghm_actor_gateway');
  assert.equal(gatewayIdentity.rows[0].current_user, 'ghm_actor_gateway');
  assert.equal(gatewayIdentity.rows[0].database_name, process.env.GHM_QUALIFICATION_DATABASE_NAME);
  const migrator = await migratorPool.connect();
  try {
    await migrator.query('SET ROLE ghm_schema_owner');
    const migratorIdentity = await migrator.query('SELECT current_database() AS database_name, session_user, current_user');
    assert.equal(migratorIdentity.rows[0].session_user, 'ghm_migrator');
    assert.equal(migratorIdentity.rows[0].current_user, 'ghm_schema_owner');
    assert.equal(migratorIdentity.rows[0].database_name, process.env.GHM_QUALIFICATION_DATABASE_NAME);
    await migrator.query('BEGIN');
    const owner = await migrator.query(
      "INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'business') RETURNING id",
      [marker + '-owner'],
    );
    accountId = Number(owner.rows[0].id);
    const member = await migrator.query(
      "INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'business') RETURNING id",
      [marker + '-member'],
    );
    memberAccountId = Number(member.rows[0].id);
    const business = await migrator.query(
      "INSERT INTO ghm.business (name, slug, verification_status, is_active) VALUES ($1, $2, 'unverified', true) RETURNING id, is_supplier",
      [marker, marker],
    );
    businessId = Number(business.rows[0].id);
    assert.equal(business.rows[0].is_supplier, false);
    await migrator.query(
      "INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status, created_by) VALUES ($1, $2, 'owner', 'active', $2), ($1, $3, 'member', 'active', $2)",
      [businessId, accountId, memberAccountId],
    );
    await migrator.query('COMMIT');
  } catch (error) {
    await migrator.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    migrator.release();
  }
  console.log('SUPPLIER CLASSIFICATION FIXTURE CREATED');

  await assert.rejects(
    () => runtimePool.query(
      'SELECT * FROM ghm.update_business_supplier_classification($1, $2, $3)',
      [accountId, businessId, true],
    ),
    /permission denied/,
  );
  console.log('RUNTIME DIRECT SUPPLIER RPC DENIAL PASS');

  await assert.rejects(
    () => runtimePool.query(
      'SELECT * FROM ghm.gateway_update_business_supplier_classification($1,$2,$3,$4,$5,$6,$7)',
      [accountId, Math.floor(Date.now()/1000), randomUUID(), JSON.stringify({businessId,isSupplier:true}), '0'.repeat(64), businessId, true],
    ),
    /permission denied/,
  );
  console.log('RUNTIME GATEWAY-ONLY RPC DENIAL PASS');

  await assert.rejects(
    () => runtimePool.query('SET ROLE ghm_actor_gateway'),
    /permission denied to set role/,
  );
  console.log('RUNTIME CANNOT ASSUME ACTOR GATEWAY ROLE PASS');

  const forged = signAssertion(accountId,'supplier.classification.update',Math.floor(Date.now()/1000),{businessId,isSupplier:true});
  await assert.rejects(
    () => gatewayPool.query('SELECT * FROM ghm.gateway_update_business_supplier_classification($1,$2,$3,$4,$5,$6,$7)', [accountId,forged.issuedAt,forged.nonce,forged.context,'0'.repeat(64),businessId,true]),
    /Actor assertion signature invalid/,
  );
  console.log('DATABASE DENIES FORGED SUPPLIER ACTOR ASSERTION PASS');

  const supplier = await gatewayCall(accountId,true);
  assert.equal(supplier.rowCount, 1);
  assert.equal(supplier.rows[0].is_supplier, true);
  console.log('GATEWAY OWNER SUPPLIER CLASSIFICATION UPDATE PASS');
  const bound=signAssertion(accountId,'supplier.classification.update',Math.floor(Date.now()/1000),{businessId,isSupplier:true});
  await assert.rejects(() => gatewayPool.query('SELECT * FROM ghm.gateway_update_business_supplier_classification($1,$2,$3,$4,$5,$6,$7)',[accountId,bound.issuedAt,bound.nonce,bound.context,bound.signature,businessId,false]),/Actor assertion context mismatch/);
  console.log('DATABASE DENIES SUPPLIER ASSERTION PAYLOAD SUBSTITUTION PASS');
  const targetBound = signAssertion(accountId,'supplier.classification.update',Math.floor(Date.now()/1000),{businessId,isSupplier:false});
  await assert.rejects(
    () => gatewayPool.query('SELECT * FROM ghm.gateway_update_business_supplier_classification($1,$2,$3,$4,$5,$6,$7)',[accountId,targetBound.issuedAt,targetBound.nonce,targetBound.context,targetBound.signature,businessId+999999,false]),
    /Actor assertion context mismatch/,
  );
  console.log('DATABASE DENIES SUPPLIER BUSINESS TARGET SUBSTITUTION PASS');

  const expired = signAssertion(accountId, 'supplier.classification.update', Math.floor(Date.now()/1000) - 61, {businessId,isSupplier:false});
  await assert.rejects(
    () => gatewayPool.query('SELECT * FROM ghm.gateway_update_business_supplier_classification($1,$2,$3,$4,$5,$6,$7)', [accountId,expired.issuedAt,expired.nonce,expired.context,expired.signature,businessId,false]),
    /Actor assertion expired/,
  );
  console.log('DATABASE DENIES EXPIRED SUPPLIER ASSERTION PASS');

  const wrongOperation = signAssertion(accountId, 'business.profile.update', Math.floor(Date.now()/1000), {businessId,isSupplier:false});
  await assert.rejects(
    () => gatewayPool.query('SELECT * FROM ghm.gateway_update_business_supplier_classification($1,$2,$3,$4,$5,$6,$7)', [accountId,wrongOperation.issuedAt,wrongOperation.nonce,wrongOperation.context,wrongOperation.signature,businessId,false]),
    /Actor assertion signature invalid/,
  );
  console.log('DATABASE BINDS SUPPLIER ASSERTION TO EXACT OPERATION PASS');

  const replay = signAssertion(accountId,'supplier.classification.update',Math.floor(Date.now()/1000),{businessId,isSupplier:false});
  const replaySql = 'SELECT * FROM ghm.gateway_update_business_supplier_classification($1,$2,$3,$4,$5,$6,$7)';
  const replayArgs = [accountId,replay.issuedAt,replay.nonce,replay.context,replay.signature,businessId,false];
  await gatewayPool.query(replaySql,replayArgs);
  await assert.rejects(
    () => gatewayPool.query(replaySql,replayArgs),
    /Actor assertion replay detected/,
  );
  console.log('DATABASE DENIES REPLAYED SUPPLIER ASSERTION PASS');

  const contractor = await gatewayCall(accountId,false);
  assert.equal(contractor.rows[0].is_supplier, false);
  console.log('GATEWAY OWNER CONTRACTOR CLASSIFICATION UPDATE PASS');

  await assert.rejects(() => gatewayCall(memberAccountId,true), /Business management permission required/);
  console.log('GATEWAY MEMBER CLASSIFICATION WRITE DENIAL PASS');

  await assert.rejects(() => gatewayCall(accountId,null), /Supplier classification must be true or false/);
  console.log('NULL CLASSIFICATION REJECTION PASS');
  console.log('GHM SUPPLIER CLASSIFICATION POSTGRES QUALIFICATION: PASS');
} finally {
  if (accountId && memberAccountId && businessId) {
    const cleanup = await migratorPool.connect();
    try {
      await cleanup.query('SET ROLE ghm_schema_owner');
      await cleanup.query('BEGIN');
      await cleanup.query('DELETE FROM ghm.business_membership WHERE business_id = $1', [businessId]);
      await cleanup.query('DELETE FROM ghm.business WHERE id = $1', [businessId]);
      await cleanup.query('DELETE FROM ghm.account_identity WHERE id IN ($1, $2)', [accountId, memberAccountId]);
      await cleanup.query('COMMIT');
      console.log('SUPPLIER CLASSIFICATION FIXTURE CLEANUP PASS');
    } catch (error) {
      await cleanup.query('ROLLBACK').catch(() => {});
      console.error(`SUPPLIER CLASSIFICATION FIXTURE CLEANUP FAILED: ${error.message}`);
      process.exitCode = 1;
    } finally {
      cleanup.release();
    }
  }
  await Promise.all([runtimePool.end(), migratorPool.end(), gatewayPool.end()]);
}
