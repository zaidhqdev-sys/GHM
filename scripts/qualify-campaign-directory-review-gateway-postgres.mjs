import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import 'dotenv/config';
import { createActorGatewayAssertion } from '../dist/actor-gateway/request-assertion.js';
import { assertActorGatewayDatabasePrivileges, readActorGatewayDatabasePrivileges } from '../dist/actor-gateway/database-privileges.js';
import { assertRuntimeDatabaseFunctionPrivileges, readRuntimeDatabaseFunctionPrivileges } from '../dist/db/runtime-database-privileges.js';
import { PostgresCampaignDirectoryReviewGatewayReader } from '../dist/actor-gateway/campaign-directory-review-reader.js';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const gatewayUrl = process.env.GHM_ACTOR_GATEWAY_DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
const secretText = process.env.GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET;
if (!runtimeUrl || !gatewayUrl || !migratorUrl || new Set([runtimeUrl, gatewayUrl, migratorUrl]).size !== 3) {
  throw new Error('Three distinct GHM runtime, Actor Gateway and migrator database principals are required');
}
if (process.env.GHM_QUALIFICATION_DATABASE_NAME !== 'ghm_disposable_test'
  || process.env.GHM_QUALIFICATION_DATABASE_HOST !== 'localhost') {
  throw new Error('Campaign/directory-review gateway qualification is restricted to disposable localhost PostgreSQL');
}
const key = Buffer.from(secretText ?? '', 'base64');
if (key.length !== 32 || key.toString('base64') !== secretText) {
  throw new Error('A canonical base64 32-byte Actor Gateway assertion key is required');
}
const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false;
const runtime = new Pool({ connectionString: runtimeUrl, ssl });
const gateway = new Pool({ connectionString: gatewayUrl, ssl });
const migrator = new Pool({ connectionString: migratorUrl, ssl });
const marker = 'gw-campaign-review-' + randomUUID();
const ids = { accounts: [], businesses: [], campaigns: [] };

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
  } finally { client.release(); }
};
const denied = async (work, label, acceptedCodes = ['42501', 'P0001']) => {
  let error;
  try { await work(); } catch (caught) { error = caught; }
  assert.ok(error, label + ' unexpectedly succeeded');
  assert.ok(acceptedCodes.includes(error.code), label + ' returned unexpected SQLSTATE ' + error.code);
  console.log(label + ': PASS');
  return error;
};

try {
  for (const [pool, role, label] of [
    [runtime, 'ghm_runtime', 'RESOURCE API RUNTIME'],
    [gateway, 'ghm_actor_gateway', 'ACTOR GATEWAY'],
    [migrator, 'ghm_migrator', 'MIGRATOR'],
  ]) {
    const identity = await pool.query('SELECT current_database() AS db, session_user, current_user');
    assert.equal(identity.rows[0].db, 'ghm_disposable_test');
    assert.equal(identity.rows[0].session_user, role);
    assert.equal(identity.rows[0].current_user, role);
    console.log(label + ' DATABASE IDENTITY: PASS');
  }

  const accounts = await setup(
    "INSERT INTO ghm.account_identity(full_name,role) VALUES($1,'business'),($2,'business'),($3,'business') RETURNING id",
    [marker + ' owner', marker + ' administrator', marker + ' outsider'],
  );
  const ownerId = Number(accounts.rows[0].id);
  const administratorId = Number(accounts.rows[1].id);
  const outsiderId = Number(accounts.rows[2].id);
  ids.accounts.push(ownerId, administratorId, outsiderId);

  const business = await setup(
    "INSERT INTO ghm.business(name,slug,verification_status,is_verified,is_active) VALUES($1,$2,'unverified',false,true) RETURNING id",
    [marker + ' business', marker + '-business'],
  );
  const otherBusiness = await setup(
    "INSERT INTO ghm.business(name,slug,verification_status,is_verified,is_active) VALUES($1,$2,'unverified',false,true) RETURNING id",
    [marker + ' other', marker + '-other'],
  );
  const businessId = Number(business.rows[0].id);
  const otherBusinessId = Number(otherBusiness.rows[0].id);
  ids.businesses.push(businessId, otherBusinessId);

  await setup(
    `INSERT INTO ghm.business_membership(business_id,account_id,membership_role,membership_status,created_by)
     VALUES ($1,$2,'owner','active',$2),($1,$3,'administrator','active',$2),($4,$5,'owner','active',$5)`,
    [businessId, ownerId, administratorId, otherBusinessId, outsiderId],
  );

  const applyManualCutover = async (path) => {
    const sql = readFileSync(path, 'utf8')
      .replace(/^\\s*BEGIN;\\s*/i, '')
      .replace(/\\s*COMMIT;\\s*$/i, '');
    const client = await migrator.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE ghm_schema_owner');
      await client.query(sql);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally { client.release(); }
  };
  const privilegeMatrix = async () => {
    const result = await gateway.query(`
      SELECT has_function_privilege('ghm_runtime','ghm.create_campaign(bigint,bigint,text)','EXECUTE') AS runtime_create,
             has_function_privilege('ghm_runtime','ghm.update_campaign(bigint,bigint,text,text)','EXECUTE') AS runtime_update,
             has_function_privilege('ghm_runtime','ghm.get_business_directory_review_presentation(bigint,bigint)','EXECUTE') AS runtime_review,
             has_function_privilege('ghm_actor_gateway','ghm.gateway_create_campaign(bigint,bigint,uuid,text,text,bigint,text)','EXECUTE') AS gateway_create,
             has_function_privilege('ghm_actor_gateway','ghm.gateway_update_campaign(bigint,bigint,uuid,text,text,bigint,text,text)','EXECUTE') AS gateway_update,
             has_function_privilege('ghm_actor_gateway','ghm.gateway_get_business_directory_review_presentation(bigint,bigint,uuid,text,text,bigint)','EXECUTE') AS gateway_review
    `);
    return result.rows[0];
  };

  await applyManualCutover('database/cutovers/20261112160000_campaign_directory_review_actor_gateway.sql');
  assertRuntimeDatabaseFunctionPrivileges(await readRuntimeDatabaseFunctionPrivileges(runtime));
  assertActorGatewayDatabasePrivileges(await readActorGatewayDatabasePrivileges(gateway));
  assert.deepEqual(await privilegeMatrix(), {
    runtime_create: false, runtime_update: false, runtime_review: false,
    gateway_create: true, gateway_update: true, gateway_review: true,
  });
  console.log('MANUAL CAMPAIGN/REVIEW CUTOVER ACL MATRIX: PASS');

  const acl = await gateway.query(`
    SELECT has_table_privilege('ghm_runtime','ghm.campaign','SELECT') AS runtime_campaign_read,
           has_function_privilege('ghm_runtime','ghm.create_campaign(bigint,bigint,text)','EXECUTE') AS runtime_legacy_create,
           has_function_privilege('ghm_runtime','ghm.update_campaign(bigint,bigint,text,text)','EXECUTE') AS runtime_legacy_update,
           has_function_privilege('ghm_runtime','ghm.get_business_directory_review_presentation(bigint,bigint)','EXECUTE') AS runtime_legacy_review,
           has_function_privilege('ghm_runtime','ghm.gateway_create_campaign(bigint,bigint,uuid,text,text,bigint,text)','EXECUTE') AS runtime_gateway_create,
           has_function_privilege('ghm_runtime','ghm.gateway_update_campaign(bigint,bigint,uuid,text,text,bigint,text,text)','EXECUTE') AS runtime_gateway_update,
           has_function_privilege('ghm_runtime','ghm.gateway_get_business_directory_review_presentation(bigint,bigint,uuid,text,text,bigint)','EXECUTE') AS runtime_gateway_review,
           has_function_privilege('ghm_actor_gateway','ghm.gateway_create_campaign(bigint,bigint,uuid,text,text,bigint,text)','EXECUTE') AS gateway_create,
           has_function_privilege('ghm_actor_gateway','ghm.gateway_update_campaign(bigint,bigint,uuid,text,text,bigint,text,text)','EXECUTE') AS gateway_update,
           has_function_privilege('ghm_actor_gateway','ghm.gateway_get_business_directory_review_presentation(bigint,bigint,uuid,text,text,bigint)','EXECUTE') AS gateway_review
  `);
  assert.deepEqual(acl.rows[0], {
    runtime_campaign_read: true,
    runtime_legacy_create: false,
    runtime_legacy_update: false,
    runtime_legacy_review: false,
    runtime_gateway_create: false,
    runtime_gateway_update: false,
    runtime_gateway_review: false,
    gateway_create: true,
    gateway_update: true,
    gateway_review: true,
  });
  console.log('RUNTIME READ-ONLY / ACTOR GATEWAY EXECUTE-ONLY ACL MATRIX: PASS');

  await denied(
    () => runtime.query('SELECT * FROM ghm.create_campaign($1,$2,$3)', [ownerId, businessId, 'direct runtime']),
    'RUNTIME LEGACY CAMPAIGN CREATE EXECUTE DENIED',
  );
  await denied(
    () => runtime.query('SELECT * FROM ghm.update_campaign($1,$2,$3,$4)', [ownerId, 1, 'forged', null]),
    'RUNTIME LEGACY CAMPAIGN UPDATE EXECUTE DENIED',
  );
  await denied(
    () => runtime.query('SELECT * FROM ghm.get_business_directory_review_presentation($1,$2)', [ownerId, businessId]),
    'RUNTIME LEGACY DIRECTORY REVIEW READ EXECUTE DENIED',
  );
  await denied(
    () => runtime.query('SELECT * FROM ghm.gateway_create_campaign(1,0,$1,$2,$3,1,$4)', [randomUUID(), '{}', '0'.repeat(64), 'runtime']),
    'RUNTIME ACTOR GATEWAY WRAPPER EXECUTE DENIED',
  );

  // Rehearse the guarded rollback in a transaction and roll that transaction
  // back, restoring the post-cutover state for the remaining qualification.
  const rollbackSql = readFileSync('database/cutovers/20261112161000_campaign_directory_review_actor_gateway_rollback.sql', 'utf8')
    .replace(/^\\s*BEGIN;\\s*/i, '')
    .replace(/\\s*COMMIT;\\s*$/i, '');
  const rollbackClient = await migrator.connect();
  try {
    await rollbackClient.query('BEGIN');
    await rollbackClient.query('SET LOCAL ROLE ghm_schema_owner');
    await rollbackClient.query(rollbackSql);
    assert.deepEqual(await privilegeMatrix(), {
      runtime_create: true, runtime_update: true, runtime_review: true,
      gateway_create: false, gateway_update: false, gateway_review: false,
    });
    console.log('MANUAL CAMPAIGN/REVIEW ROLLBACK ACL REHEARSAL: PASS');
    await rollbackClient.query('ROLLBACK');
  } catch (error) {
    await rollbackClient.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { rollbackClient.release(); }
  assert.deepEqual(await privilegeMatrix(), {
    runtime_create: false, runtime_update: false, runtime_review: false,
    gateway_create: true, gateway_update: true, gateway_review: true,
  });
  console.log('CAMPAIGN/REVIEW POST-ROLLBACK RESTORATION: PASS');
  await applyManualCutover('database/cutovers/20261112160000_campaign_directory_review_actor_gateway.sql');
  assert.deepEqual(await privilegeMatrix(), {
    runtime_create: false, runtime_update: false, runtime_review: false,
    gateway_create: true, gateway_update: true, gateway_review: true,
  });
  console.log('CAMPAIGN/REVIEW CUTOVER RE-APPLICATION: PASS');

  const reader = new PostgresCampaignDirectoryReviewGatewayReader(gateway, secretText);
  const created = await reader.createCampaign(ownerId, { businessId, title: 'Signed Campaign' });
  ids.campaigns.push(created.id);
  assert.equal(created.createdByAccountId, ownerId);
  assert.equal(created.businessId, businessId);
  assert.equal(created.title, 'Signed Campaign');
  console.log('SIGNED CAMPAIGN CREATE + DATABASE ACTOR PROVENANCE: PASS');

  const updated = await reader.updateCampaign(administratorId, created.id, { title: 'Administrator Update', status: 'active' });
  assert.equal(updated.title, 'Administrator Update');
  assert.equal(updated.status, 'active');
  console.log('SIGNED CAMPAIGN UPDATE BY ACTIVE ADMINISTRATOR: PASS');

  await denied(
    () => reader.updateCampaign(outsiderId, created.id, { title: 'Cross-business takeover' }),
    'CROSS-BUSINESS CAMPAIGN UPDATE DENIED',
  );

  const review = await reader.getDirectoryReviewPresentation(ownerId, businessId);
  assert.equal(review.business_id, businessId);
  assert.equal(typeof review.verification_status, 'string');
  console.log('SIGNED OWNER DIRECTORY-REVIEW PRESENTATION READ: PASS');

  await denied(
    () => reader.getDirectoryReviewPresentation(outsiderId, businessId),
    'CROSS-BUSINESS DIRECTORY-REVIEW PRESENTATION READ DENIED',
  );

  const actorSubstitution = createActorGatewayAssertion(key, ownerId, 'campaign.create', {
    businessId, title: 'Signed actor substitution',
  });
  await denied(
    () => gateway.query(
      'SELECT * FROM ghm.gateway_create_campaign($1,$2,$3,$4,$5,$6,$7)',
      [outsiderId, actorSubstitution.issuedAt, actorSubstitution.nonce, actorSubstitution.context,
        actorSubstitution.signature, businessId, 'Signed actor substitution'],
    ),
    'SIGNED CAMPAIGN ACTOR-ID SUBSTITUTION DENIED',
  );

  const updateActorSubstitution = createActorGatewayAssertion(key, ownerId, 'campaign.update', {
    campaignId: created.id, title: 'Forged update', status: null,
  });
  await denied(
    () => gateway.query(
      'SELECT * FROM ghm.gateway_update_campaign($1,$2,$3,$4,$5,$6,$7,$8)',
      [outsiderId, updateActorSubstitution.issuedAt, updateActorSubstitution.nonce, updateActorSubstitution.context,
        updateActorSubstitution.signature, created.id, 'Forged update', null],
    ),
    'SIGNED CAMPAIGN UPDATE ACTOR-ID SUBSTITUTION DENIED',
  );

  const reviewActorSubstitution = createActorGatewayAssertion(key, ownerId, 'directory_review.presentation.read', {
    businessId,
  });
  await denied(
    () => gateway.query(
      'SELECT * FROM ghm.gateway_get_business_directory_review_presentation($1,$2,$3,$4,$5,$6)',
      [outsiderId, reviewActorSubstitution.issuedAt, reviewActorSubstitution.nonce,
        reviewActorSubstitution.context, reviewActorSubstitution.signature, businessId],
    ),
    'SIGNED DIRECTORY-REVIEW ACTOR-ID SUBSTITUTION DENIED',
  );

  const wrongCampaignTarget = createActorGatewayAssertion(key, ownerId, 'campaign.create', {
    businessId: otherBusinessId, title: 'Wrong target',
  });
  await denied(
    () => gateway.query(
      'SELECT * FROM ghm.gateway_create_campaign($1,$2,$3,$4,$5,$6,$7)',
      [ownerId, wrongCampaignTarget.issuedAt, wrongCampaignTarget.nonce, wrongCampaignTarget.context,
        wrongCampaignTarget.signature, businessId, 'Wrong target'],
    ),
    'SIGNED CAMPAIGN REQUEST-TARGET SUBSTITUTION DENIED',
  );

  const replay = createActorGatewayAssertion(key, ownerId, 'campaign.create', {
    businessId, title: 'Replay campaign',
  });
  const replayArgs = [ownerId, replay.issuedAt, replay.nonce, replay.context, replay.signature, businessId, 'Replay campaign'];
  const replayed = await gateway.query(
    'SELECT * FROM ghm.gateway_create_campaign($1,$2,$3,$4,$5,$6,$7)', replayArgs,
  );
  ids.campaigns.push(Number(replayed.rows[0].id));
  await denied(
    () => gateway.query('SELECT * FROM ghm.gateway_create_campaign($1,$2,$3,$4,$5,$6,$7)', replayArgs),
    'SIGNED CAMPAIGN ASSERTION REPLAY DENIED',
  );

  const disabled = await setup("UPDATE ghm.account_identity SET account_status='disabled' WHERE id=$1", [ownerId]);
  assert.equal(disabled.rowCount, 1);
  await denied(
    () => reader.getDirectoryReviewPresentation(ownerId, businessId),
    'DISABLED ACTOR DIRECTORY-REVIEW ACCESS DENIED',
  );
  await setup("UPDATE ghm.account_identity SET account_status='active' WHERE id=$1", [ownerId]);

  console.log('GHM CAMPAIGN + DIRECTORY-REVIEW SIGNED ACTOR GATEWAY QUALIFICATION: PASS');
} finally {
  try {
    await setup('DELETE FROM ghm.campaign WHERE id = ANY($1::bigint[])', [ids.campaigns]);
    await setup('DELETE FROM ghm.business_membership WHERE business_id = ANY($1::bigint[])', [ids.businesses]);
    await setup('DELETE FROM ghm.business WHERE id = ANY($1::bigint[])', [ids.businesses]);
    await setup('DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])', [ids.accounts]);
    console.log('CAMPAIGN/DIRECTORY-REVIEW QUALIFICATION CLEANUP: PASS');
  } catch (error) {
    console.error('Campaign/directory-review qualification cleanup failed:', error.message);
    process.exitCode = 1;
  }
  await Promise.all([runtime.end(), gateway.end(), migrator.end()]);
}
