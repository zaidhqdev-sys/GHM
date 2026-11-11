import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
const gatewayUrl = process.env.GHM_ACTOR_GATEWAY_DATABASE_URL;
const assertionSecret = process.env.GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET;
if (!assertionSecret || Buffer.from(assertionSecret, 'base64').length !== 32) throw new Error('A 32-byte gateway assertion test key is required');
if (!runtimeUrl || !migratorUrl || !gatewayUrl || new Set([runtimeUrl, migratorUrl, gatewayUrl]).size !== 3) throw new Error('Distinct runtime, migrator and actor gateway database URLs are required');

const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const migratorPool = new Pool({ connectionString: migratorUrl, ssl });
const gatewayPool = new Pool({ connectionString: gatewayUrl, ssl });
const marker = `ghm-profile-contract-${randomUUID()}`;
let accountId;
let memberAccountId;
let businessId;
const usedNonces = new Set();
const freshNonce = () => { let nonce; do { nonce=randomUUID(); } while (usedNonces.has(nonce)); usedNonces.add(nonce); return nonce; };
const signAssertion = (actorId, operation = 'business.profile.update', issuedAt = Math.floor(Date.now()/1000), context = {}) => { const nonce=freshNonce(),contextJson=JSON.stringify(context),contextHex=Buffer.from(contextJson,'utf8').toString('hex'); const payload=`ghm-actor-gateway:v2|${actorId}|${operation}|${issuedAt}|${nonce}|${contextHex}`; const signature=createHmac('sha256',Buffer.from(assertionSecret,'base64')).update(payload,'utf8').digest('hex'); return {issuedAt,nonce,context:contextJson,signature}; };
const gatewayCall = (actorId,patch) => { const a=signAssertion(actorId,'business.profile.update',Math.floor(Date.now()/1000),{businessId,patch}); return gatewayPool.query('SELECT updated.* FROM ghm.gateway_update_business_profile($1,$2,$3,$4,$5,$6,$7::jsonb) AS updated',[actorId,a.issuedAt,a.nonce,a.context,a.signature,businessId,JSON.stringify(patch)]); };

try {
  const runtimeIdentity = await runtimePool.query(
    'SELECT current_database() AS database_name, session_user, current_user',
  );
  assert.equal(runtimeIdentity.rows[0].session_user, 'ghm_runtime');
  assert.equal(runtimeIdentity.rows[0].current_user, 'ghm_runtime');
  assert.equal(runtimeIdentity.rows[0].database_name, process.env.GHM_QUALIFICATION_DATABASE_NAME);
  console.log('PROFILE CONTRACT RUNTIME IDENTITY PASS');
  const gatewayIdentity = await gatewayPool.query('SELECT current_database() AS database_name, session_user, current_user');
  const provision = await migratorPool.connect();
  try { await provision.query('BEGIN'); await provision.query('SET LOCAL ROLE ghm_schema_owner'); await provision.query("INSERT INTO ghm.actor_gateway_capability_assertion_secret(singleton,secret) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET secret=EXCLUDED.secret",[Buffer.from(assertionSecret,'base64')]); await provision.query('COMMIT'); } catch(e) { await provision.query('ROLLBACK').catch(()=>{}); throw e; } finally { provision.release(); }
  assert.equal(gatewayIdentity.rows[0].session_user, 'ghm_actor_gateway');
  assert.equal(gatewayIdentity.rows[0].current_user, 'ghm_actor_gateway');
  console.log('PROFILE CONTRACT GATEWAY IDENTITY PASS');
  const resetAssertions = await migratorPool.connect();
  try { await resetAssertions.query('BEGIN'); await resetAssertions.query('SET LOCAL ROLE ghm_schema_owner'); await resetAssertions.query('DELETE FROM ghm.actor_gateway_capability_assertion_nonce'); await resetAssertions.query('COMMIT'); }
  catch(e) { await resetAssertions.query('ROLLBACK').catch(()=>{}); throw e; }
  finally { resetAssertions.release(); }

  const migrator = await migratorPool.connect();
  try {
    await migrator.query('SET ROLE ghm_schema_owner');
    const migrationIdentity = await migrator.query(
      'SELECT current_database() AS database_name, session_user, current_user',
    );
    assert.equal(migrationIdentity.rows[0].session_user, 'ghm_migrator');
    assert.equal(migrationIdentity.rows[0].current_user, 'ghm_schema_owner');
    await migrator.query('BEGIN');
    const account = await migrator.query(
      "INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'business') RETURNING id",
      [marker],
    );
    accountId = Number(account.rows[0].id);
    const member = await migrator.query(
      "INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'business') RETURNING id",
      [marker + '-member'],
    );
    memberAccountId = Number(member.rows[0].id);
    const business = await migrator.query(
      "INSERT INTO ghm.business (name, slug, verification_status, is_active) VALUES ($1, $2, 'unverified', true) RETURNING id",
      [marker, marker],
    );
    businessId = Number(business.rows[0].id);
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
  console.log('PROFILE CONTRACT FIXTURE CREATED');

  // Simulate the production-only legacy profile columns in this disposable DB.
  // This exercises the conditional dynamic-SQL path without touching a live clone.
  const schemaOwner = await migratorPool.connect();
  try {
    await schemaOwner.query('SET ROLE ghm_schema_owner');
    await schemaOwner.query('ALTER TABLE ghm.business ADD COLUMN IF NOT EXISTS category text');
    await schemaOwner.query('ALTER TABLE ghm.business ADD COLUMN IF NOT EXISTS is_supplier boolean');
  } finally {
    schemaOwner.release();
  }
  console.log('LEGACY PROFILE COLUMN SIMULATION PASS');

  await assert.rejects(
    () => runtimePool.query(
      'SELECT * FROM ghm.update_business_profile($1, $2, $3::jsonb)',
      [accountId, businessId, JSON.stringify({ description: 'Direct runtime spoof attempt' })],
    ),
    /permission denied/,
  );
  console.log('RUNTIME DIRECT BUSINESS PROFILE RPC DENIAL PASS');

  await assert.rejects(
    () => runtimePool.query(
      'SELECT * FROM ghm.gateway_update_business_profile($1,$2,$3,$4,$5,$6,$7::jsonb)',
      [accountId, Math.floor(Date.now()/1000), randomUUID(), JSON.stringify({businessId,patch:{description:'Gateway wrapper spoof attempt'}}), '0'.repeat(64), businessId, JSON.stringify({ description: 'Gateway wrapper spoof attempt' })],
    ),
    /permission denied/,
  );
  console.log('RUNTIME GATEWAY-ONLY BUSINESS PROFILE RPC DENIAL PASS');

  const catalog = await migratorPool.connect();
  let optionalLegacyColumns;
  try {
    await catalog.query('SET ROLE ghm_schema_owner');
    optionalLegacyColumns = await catalog.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'ghm' AND table_name = 'business'
          AND column_name IN ('category', 'is_supplier')`,
    );
  } finally {
    catalog.release();
  }
  const legacyColumnNames = new Set(optionalLegacyColumns.rows.map(row => row.column_name));
  assert.equal(legacyColumnNames.has('category'), true);
  assert.equal(legacyColumnNames.has('is_supplier'), true);
  const snakePatch = {
    physical_address: '10 Current Repository Road',
    avatar_letter: 'GH',
    avatar_color: '#12AbEF',
    years_in_business: 8,
    latitude: -29.8587,
    longitude: 31.0218,
  };
  if (legacyColumnNames.has('category')) snakePatch.category = 'construction';

  const forged = signAssertion(accountId,'business.profile.update',Math.floor(Date.now()/1000),{businessId,patch:{description:'forged'}});
  await assert.rejects(
    () => gatewayPool.query('SELECT updated.* FROM ghm.gateway_update_business_profile($1,$2,$3,$4,$5,$6,$7::jsonb) AS updated',[accountId,forged.issuedAt,forged.nonce,forged.context,'0'.repeat(64),businessId,JSON.stringify({description:'forged'})]),
    /Actor assertion signature invalid/,
  );
  console.log('DATABASE DENIES FORGED BUSINESS PROFILE ACTOR ASSERTION PASS');

  const snake = await gatewayCall(accountId,snakePatch);
  assert.equal(snake.rowCount, 1);
  assert.equal(snake.rows[0].physical_address, '10 Current Repository Road');
  assert.equal(snake.rows[0].avatar_letter, 'GH');
  assert.equal(snake.rows[0].avatar_color, '#12AbEF');
  assert.equal(Number(snake.rows[0].years_in_business), 8);
  assert.equal(Number(snake.rows[0].latitude), -29.8587);
  assert.equal(Number(snake.rows[0].longitude), 31.0218);
  if (legacyColumnNames.has('category')) assert.equal(snake.rows[0].category, 'construction');
  if (legacyColumnNames.has('is_supplier')) assert.equal(snake.rows[0].is_supplier, false);
  console.log('GATEWAY CURRENT REPOSITORY SNAKE_CASE PROFILE UPDATE PASS');
  const boundPatch={description:'authorized patch'};
  const bound=signAssertion(accountId,'business.profile.update',Math.floor(Date.now()/1000),{businessId,patch:boundPatch});
  await assert.rejects(() => gatewayPool.query('SELECT updated.* FROM ghm.gateway_update_business_profile($1,$2,$3,$4,$5,$6,$7::jsonb) AS updated',[accountId,bound.issuedAt,bound.nonce,bound.context,bound.signature,businessId,JSON.stringify({description:'tampered patch'})]),/Actor assertion context mismatch/);
  console.log('DATABASE DENIES BUSINESS PROFILE ASSERTION PAYLOAD SUBSTITUTION PASS');
  const targetBound = signAssertion(accountId,'business.profile.update',Math.floor(Date.now()/1000),{businessId,patch:{description:'target-bound patch'}});
  await assert.rejects(
    () => gatewayPool.query('SELECT updated.* FROM ghm.gateway_update_business_profile($1,$2,$3,$4,$5,$6,$7::jsonb) AS updated',[accountId,targetBound.issuedAt,targetBound.nonce,targetBound.context,targetBound.signature,businessId+999999,JSON.stringify({description:'target-bound patch'})]),
    /Actor assertion context mismatch/,
  );
  console.log('DATABASE DENIES BUSINESS PROFILE TARGET SUBSTITUTION PASS');

  const expired = signAssertion(accountId, 'business.profile.update', Math.floor(Date.now()/1000) - 61, {businessId,patch:{description:'expired'}});
  await assert.rejects(
    () => gatewayPool.query('SELECT updated.* FROM ghm.gateway_update_business_profile($1,$2,$3,$4,$5,$6,$7::jsonb) AS updated',[accountId,expired.issuedAt,expired.nonce,expired.context,expired.signature,businessId,JSON.stringify({description:'expired'})]),
    /Actor assertion expired/,
  );
  console.log('DATABASE DENIES EXPIRED BUSINESS PROFILE ASSERTION PASS');

  const wrongOperation = signAssertion(accountId, 'business.registration.update', Math.floor(Date.now()/1000), {businessId,patch:{description:'wrong operation'}});
  await assert.rejects(
    () => gatewayPool.query('SELECT updated.* FROM ghm.gateway_update_business_profile($1,$2,$3,$4,$5,$6,$7::jsonb) AS updated',[accountId,wrongOperation.issuedAt,wrongOperation.nonce,wrongOperation.context,wrongOperation.signature,businessId,JSON.stringify({description:'wrong operation'})]),
    /Actor assertion signature invalid/,
  );
  console.log('DATABASE BINDS BUSINESS PROFILE ASSERTION TO EXACT OPERATION PASS');

  const replay = signAssertion(accountId,'business.profile.update',Math.floor(Date.now()/1000),{businessId,patch:{description:'one-use assertion'}});
  const replaySql = 'SELECT updated.* FROM ghm.gateway_update_business_profile($1,$2,$3,$4,$5,$6,$7::jsonb) AS updated';
  const replayArgs = [accountId,replay.issuedAt,replay.nonce,replay.context,replay.signature,businessId,JSON.stringify({description:'one-use assertion'})];
  await gatewayPool.query(replaySql,replayArgs);
  await assert.rejects(
    () => gatewayPool.query(replaySql,replayArgs),
    /Actor assertion replay detected/,
  );
  console.log('DATABASE DENIES REPLAYED BUSINESS PROFILE ASSERTION PASS');

  const camel = await gatewayCall(accountId,{
      physicalAddress: '11 Historical API Avenue',
      avatarLetter: 'API',
      avatarColor: '#ABCDEF',
      yearsInBusiness: 9,
      latitude: -30.0,
      longitude: 30.0,
    });
  assert.equal(camel.rows[0].physical_address, '11 Historical API Avenue');
  assert.equal(camel.rows[0].avatar_letter, 'API');
  assert.equal(camel.rows[0].avatar_color, '#ABCDEF');
  assert.equal(Number(camel.rows[0].years_in_business), 9);
  assert.equal(Number(camel.rows[0].latitude), -30);
  assert.equal(Number(camel.rows[0].longitude), 30);
  if (legacyColumnNames.has('category')) assert.equal(camel.rows[0].category, 'construction');
  if (legacyColumnNames.has('is_supplier')) assert.equal(camel.rows[0].is_supplier, false);
  console.log('GATEWAY HISTORICAL CAMELCASE PROFILE UPDATE PASS');
  await assert.rejects(() => gatewayCall(accountId,{isSupplier:true}),/Supplier classification must use the dedicated gateway operation/);
  await assert.rejects(() => gatewayCall(accountId,{is_supplier:true}),/Supplier classification must use the dedicated gateway operation/);
  console.log('DATABASE PROFILE WRAPPER REJECTS SUPPLIER CLASSIFICATION BYPASS PASS');

  await assert.rejects(
    () => gatewayCall(accountId,{ physical_address: 'Conflict A', physicalAddress: 'Conflict B' }),
    /Conflicting Business profile aliases/,
  );
  console.log('CONFLICTING ALIAS REJECTION PASS');

  await assert.rejects(
    () => gatewayCall(accountId,{ latitude: -29.0 }),
    /Latitude and longitude must be supplied together/,
  );
  console.log('COORDINATE PAIR VALIDATION PASS');

  await assert.rejects(
    () => gatewayCall(memberAccountId,{ description: 'Unauthorized' }),
    /Business management permission required/,
  );
  console.log('GATEWAY MEMBER AUTHORIZATION ENFORCEMENT PASS');

  console.log('GHM BUSINESS PROFILE CONTRACT POSTGRES QUALIFICATION: PASS');
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
      console.log('PROFILE CONTRACT FIXTURE CLEANUP PASS');
    } catch (error) {
      await cleanup.query('ROLLBACK').catch(() => {});
      console.error(`PROFILE CONTRACT FIXTURE CLEANUP FAILED: ${error.message}`);
      process.exitCode = 1;
    } finally {
      cleanup.release();
    }
  }
  await Promise.all([runtimePool.end(), migratorPool.end(), gatewayPool.end()]);
}
