import { createHmac, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';
import { PostgresStorageMetadataGatewayReader } from '../dist/actor-gateway/storage-metadata-reader.js';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL;
const gatewayUrl = process.env.GHM_ACTOR_GATEWAY_DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
const actorSecret = process.env.GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET;
const providerSecret = process.env.GHM_STORAGE_PROVIDER_WORKFLOW_ATTESTATION_SECRET;
const expectedDatabase = process.env.GHM_QUALIFICATION_DATABASE_NAME || 'ghm_disposable_test';
if (!runtimeUrl || !gatewayUrl || !migratorUrl || !actorSecret || !providerSecret) {
  throw new Error('Explicit runtime, Actor Gateway, migrator and both qualification secrets are required');
}
if (process.env.GHM_STORAGE_PROVIDER_ATTESTATION_ALLOW_MUTATIONS !== 'true') {
  throw new Error('Refusing storage provider qualification without explicit disposable mutation opt-in');
}
for (const [name, url] of [['runtime', runtimeUrl], ['gateway', gatewayUrl], ['migrator', migratorUrl]]) {
  const parsed = new URL(url);
  if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) || parsed.pathname !== `/${expectedDatabase}`) {
    throw new Error(`Refusing storage provider qualification outside localhost disposable PostgreSQL (${name})`);
  }
}
if (new Set([runtimeUrl, gatewayUrl, migratorUrl]).size !== 3) {
  throw new Error('Runtime, Actor Gateway and migrator URLs must be distinct');
}
const providerKey = Buffer.from(providerSecret, 'base64');
if (providerKey.length !== 32 || providerKey.toString('base64') !== providerSecret) {
  throw new Error('Provider qualification secret must be canonical base64 for exactly 32 bytes');
}

const runtime = new Pool({ connectionString: runtimeUrl, ssl: false });
const gateway = new Pool({ connectionString: gatewayUrl, ssl: false });
const migrator = new Pool({ connectionString: migratorUrl, ssl: false });
const marker = `ghm-storage-provider-${randomUUID()}`;
let fixture;
const proof = (operation, context, nonce = randomUUID(), issuedAt = Math.floor(Date.now() / 1000)) => {
  const contextJson = JSON.stringify(context);
  const payload = `ghm-storage-provider:v1|${operation}|${issuedAt}|${nonce}|${Buffer.from(contextJson, 'utf8').toString('hex')}`;
  return {
    issuedAt, nonce, context: contextJson,
    signature: createHmac('sha256', providerKey).update(payload, 'utf8').digest('hex'),
  };
};
const expectDenied = async (label, work) => {
  let denied = false;
  try { await work(); } catch { denied = true; }
  if (!denied) throw new Error(`${label} was accepted`);
  console.log(`${label}: DENIED`);
};
try {
  for (const [pool, role] of [[runtime, 'ghm_runtime'], [gateway, 'ghm_actor_gateway'], [migrator, 'ghm_migrator']]) {
    const identity = await pool.query('SELECT current_database() AS db,session_user,current_user');
    const row = identity.rows[0];
    if (row.db !== expectedDatabase || row.session_user !== role || row.current_user !== role) {
      throw new Error(`Unexpected ${role} identity: ${JSON.stringify(row)}`);
    }
    console.log(`${role.toUpperCase()} IDENTITY: PASS`);
  }

  const setup = await migrator.connect();
  try {
    await setup.query('BEGIN');
    await setup.query('SET LOCAL ROLE ghm_schema_owner');
    const owner = await setup.query("INSERT INTO ghm.account_identity(full_name,role) VALUES($1,'business') RETURNING id", [marker]);
    const outsider = await setup.query("INSERT INTO ghm.account_identity(full_name,role) VALUES($1,'business') RETURNING id", [marker + '-outsider']);
    const member = await setup.query("INSERT INTO ghm.account_identity(full_name,role) VALUES($1,'business') RETURNING id", [marker + '-member']);
    const nonmember = await setup.query("INSERT INTO ghm.account_identity(full_name,role) VALUES($1,'business') RETURNING id", [marker + '-nonmember']);
    const inactive = await setup.query("INSERT INTO ghm.account_identity(full_name,role,account_status) VALUES($1,'business','disabled') RETURNING id", [marker + '-inactive']);
    const a = await setup.query("INSERT INTO ghm.business(name,slug,verification_status,is_verified,is_active) VALUES($1,$2,'approved',true,true) RETURNING id", [marker, marker]);
    const b = await setup.query("INSERT INTO ghm.business(name,slug,verification_status,is_verified,is_active) VALUES($1,$2,'approved',true,true) RETURNING id", [marker + '-other', marker + '-other']);
    const accountId = Number(owner.rows[0].id);
    const outsiderId = Number(outsider.rows[0].id);
    const memberId = Number(member.rows[0].id);
    const nonmemberId = Number(nonmember.rows[0].id);
    const inactiveId = Number(inactive.rows[0].id);
    const businessId = Number(a.rows[0].id);
    const otherBusinessId = Number(b.rows[0].id);
    await setup.query(
      "INSERT INTO ghm.business_membership(business_id,account_id,membership_role,membership_status,created_by) VALUES($1,$2,'owner','active',$2),($3,$4,'owner','active',$4),($1,$5,'member','active',$2),($1,$6,'administrator','active',$2)",
      [businessId, accountId, otherBusinessId, outsiderId, memberId, inactiveId],
    );
    const insertObject = async (business, status, suffix, visibility = 'public', objectClass = 'business_logo') => {
      const key = objectClass === 'business_logo'
        ? `media/logos/${business}/${randomUUID()}`
        : `media/private/${business}/${randomUUID()}`;
      const result = await setup.query(
        "INSERT INTO ghm.storage_object(tenant_business_id,resource_type,resource_id,object_class,provider_key,content_type,byte_size,visibility,status,available_at) VALUES($1,'business',$1,$2,$3,'image/png',1024,$4,$5,CASE WHEN $5 IN ('available','deletion_pending') THEN clock_timestamp() ELSE NULL END) RETURNING id",
        [business, objectClass, key, visibility, status],
      );
      return { objectId: Number(result.rows[0].id), businessId: business, providerKey: key, status, suffix };
    };
    const availableTarget = await insertObject(businessId, 'pending', 'available-target');
    const replayTarget = await insertObject(businessId, 'pending', 'replay-target');
    const replayTargetTwo = await insertObject(businessId, 'pending', 'replay-target-two');
    const badSignatureTarget = await insertObject(businessId, 'pending', 'bad-signature-target');
    const crossActorTarget = await insertObject(businessId, 'pending', 'cross-actor-target');
    const wrongState = await insertObject(businessId, 'available', 'wrong-state');
    const deletionTarget = await insertObject(businessId, 'deletion_pending', 'deletion-target');
    const nonManagerDeletionTarget = await insertObject(businessId, 'pending', 'non-manager-deletion-target');
    const metadataMismatchTarget = await insertObject(businessId, 'pending', 'metadata-mismatch-target');
    const privateReadTarget = await insertObject(businessId, 'pending', 'private-read-target', 'private', 'business_document');
    await setup.query('COMMIT');
    fixture = {
      accountId, outsiderId, memberId, nonmemberId, inactiveId, businessId, otherBusinessId,
      availableTarget, replayTarget, replayTargetTwo, badSignatureTarget, crossActorTarget,
      wrongState, deletionTarget, nonManagerDeletionTarget, metadataMismatchTarget, privateReadTarget,
    };
  } catch (error) {
    await setup.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { setup.release(); }

  console.log('DISPOSABLE PROVIDER SECRET PROVISIONING: PASS');

  const reader = new PostgresStorageMetadataGatewayReader(gateway, actorSecret);

  const createdKey = `media/logos/${fixture.businessId}/${randomUUID()}`;
  const created = await reader.createPending(fixture.accountId, {
    businessId: fixture.businessId, resourceType: 'business', resourceId: fixture.businessId,
    objectClass: 'business_logo', providerKey: createdKey, contentType: 'image/png',
    byteSize: 1024, visibility: 'public', originalFilename: null,
  });
  if (created.status !== 'pending') throw new Error('Legitimate signed metadata creation did not create a pending object');
  const createdRead = await reader.getObject(fixture.accountId, Number(created.id));
  if (!createdRead || createdRead.id !== created.id) throw new Error('Legitimate signed metadata read did not return the created object');
  console.log('LEGITIMATE ACTOR-ASSERTED METADATA CREATE + READ: PASS');

  const privateRead = await reader.getObject(fixture.accountId, fixture.privateReadTarget.objectId);
  if (!privateRead) throw new Error('Business member could not read its private storage metadata');
  const outsiderPrivateRead = await reader.getObject(fixture.outsiderId, fixture.privateReadTarget.objectId);
  if (outsiderPrivateRead) throw new Error('Cross-business actor read a private storage object');
  console.log('PRIVATE STORAGE METADATA CROSS-BUSINESS READ DENIED: PASS');

  await expectDenied('Non-member pending-object creation', () => reader.createPending(fixture.nonmemberId, {
    businessId: fixture.businessId, resourceType: 'business', resourceId: fixture.businessId,
    objectClass: 'business_logo', providerKey: `media/logos/${fixture.businessId}/${randomUUID()}`,
    contentType: 'image/png', byteSize: 1024, visibility: 'public', originalFilename: null,
  }));
  await expectDenied('Inactive actor with active administrator membership', () => reader.createPending(fixture.inactiveId, {
    businessId: fixture.businessId, resourceType: 'business', resourceId: fixture.businessId,
    objectClass: 'business_logo', providerKey: `media/logos/${fixture.businessId}/${randomUUID()}`,
    contentType: 'image/png', byteSize: 1024, visibility: 'public', originalFilename: null,
  }));
  await expectDenied('Member without manager authority cannot request deletion', () =>
    reader.markDeletionPending(fixture.memberId, fixture.nonManagerDeletionTarget.objectId));

  const createdAvailabilityProof = proof('storage.provider.mark_available', {
    businessId: fixture.businessId, objectId: Number(created.id), providerKey: createdKey,
    contentType: 'image/png', byteSize: 1024, checksum: 'sha256:created-object',
  });
  const createdAvailable = await reader.markAvailable(
    fixture.accountId, Number(created.id), 'sha256:created-object', createdKey, 'image/png', 1024, createdAvailabilityProof,
  );
  if (createdAvailable.status !== 'available') throw new Error('Created pending object did not complete provider-verified availability');
  const pendingDeletion = await reader.markDeletionPending(fixture.accountId, Number(created.id));
  if (pendingDeletion.status !== 'deletion_pending') throw new Error('Legitimate owner deletion request did not enter deletion_pending');
  const completedDeletion = await reader.markDeleted(
    fixture.accountId, Number(created.id), createdKey,
    proof('storage.provider.mark_deleted', {
      businessId: fixture.businessId, objectId: Number(created.id), providerKey: createdKey,
    }),
  );
  if (completedDeletion.status !== 'deleted') throw new Error('Legitimate created-object deletion lifecycle did not complete');
  console.log('LEGITIMATE SIGNED CREATE → READ → DELETION → PROVIDER COMPLETION: PASS');

  const target = fixture.availableTarget;
  const availableProof = proof('storage.provider.mark_available', {
    businessId: target.businessId, objectId: target.objectId, providerKey: target.providerKey,
    contentType: 'image/png', byteSize: 1024, checksum: 'sha256:qualification',
  });
  const available = await reader.markAvailable(
    fixture.accountId, target.objectId, 'sha256:qualification', target.providerKey, 'image/png', 1024, availableProof,
  );
  if (available.status !== 'available') throw new Error('Legitimate availability transition did not complete');
  console.log('LEGITIMATE ACTOR + PROVIDER DUAL-PROOF AVAILABILITY: PASS');

  const replay = fixture.replayTarget;
  const replayNonce = randomUUID();
  const replayProof = proof('storage.provider.mark_available', {
    businessId: replay.businessId, objectId: replay.objectId, providerKey: replay.providerKey,
    contentType: 'image/png', byteSize: 1024, checksum: 'sha256:replay',
  }, replayNonce);
  const replayed = await reader.markAvailable(
    fixture.accountId, replay.objectId, 'sha256:replay', replay.providerKey, 'image/png', 1024, replayProof,
  );
  if (replayed.status !== 'available') throw new Error('First nonce use did not complete');
  const secondObject = fixture.replayTargetTwo;
  const secondNonceProof = proof('storage.provider.mark_available', {
    businessId: secondObject.businessId, objectId: secondObject.objectId, providerKey: secondObject.providerKey,
    contentType: 'image/png', byteSize: 1024, checksum: 'sha256:wrong-state',
  }, replayNonce);
  await expectDenied('Provider attestation nonce replay across objects', () =>
    reader.markAvailable(fixture.accountId, secondObject.objectId, 'sha256:wrong-state', secondObject.providerKey, 'image/png', 1024, secondNonceProof));

  const deleteTarget = fixture.deletionTarget;
  const deletionContext = {
    businessId: deleteTarget.businessId, objectId: deleteTarget.objectId, providerKey: deleteTarget.providerKey,
  };
  await expectDenied('Wrong provider attestation operation', () =>
    reader.markDeleted(fixture.accountId, deleteTarget.objectId, deleteTarget.providerKey,
      proof('storage.provider.mark_available', deletionContext)));
  const deletionProof = proof('storage.provider.mark_deleted', deletionContext);
  const deleted = await reader.markDeleted(fixture.accountId, deleteTarget.objectId, deleteTarget.providerKey, deletionProof);
  if (deleted.status !== 'deleted') throw new Error('Legitimate deletion completion did not complete');
  console.log('LEGITIMATE ACTOR + PROVIDER DUAL-PROOF DELETION: PASS');

  const bad = fixture.badSignatureTarget;
  const badContext = {
    businessId: bad.businessId, objectId: bad.objectId, providerKey: bad.providerKey,
    contentType: 'image/png', byteSize: 1024, checksum: 'sha256:invalid',
  };
  await expectDenied('Invalid provider signature', () => reader.markAvailable(
    fixture.accountId, bad.objectId, 'sha256:invalid', bad.providerKey, 'image/png', 1024,
    { ...proof('storage.provider.mark_available', badContext), signature: '0'.repeat(64) },
  ));
  const stale = fixture.crossActorTarget;
  const staleContext = {
    businessId: stale.businessId, objectId: stale.objectId, providerKey: stale.providerKey,
    contentType: 'image/png', byteSize: 1024, checksum: 'sha256:stale',
  };
  await expectDenied('Expired provider attestation', () => reader.markAvailable(
    fixture.accountId, stale.objectId, 'sha256:stale', stale.providerKey, 'image/png', 1024,
    proof('storage.provider.mark_available', staleContext, randomUUID(), Math.floor(Date.now() / 1000) - 120),
  ));
  const contextSubstitution = proof('storage.provider.mark_available', badContext);
  await expectDenied('Provider context substitution', () => reader.markAvailable(
    fixture.accountId, stale.objectId, 'sha256:invalid', stale.providerKey, 'image/png', 1024, contextSubstitution,
  ));
  await expectDenied('Cross-business actor', () => reader.markAvailable(
    fixture.outsiderId, stale.objectId, 'sha256:outsider', stale.providerKey, 'image/png', 1024,
    proof('storage.provider.mark_available', {
      businessId: stale.businessId, objectId: stale.objectId, providerKey: stale.providerKey,
      contentType: 'image/png', byteSize: 1024, checksum: 'sha256:outsider',
    }),
  ));
  const wrong = fixture.wrongState;
  await expectDenied('Invalid storage lifecycle state', () => reader.markAvailable(
    fixture.accountId, wrong.objectId, 'sha256:state', wrong.providerKey, 'image/png', 1024,
    proof('storage.provider.mark_available', {
      businessId: wrong.businessId, objectId: wrong.objectId, providerKey: wrong.providerKey,
      contentType: 'image/png', byteSize: 1024, checksum: 'sha256:state',
    }),
  ));

  const mismatch = fixture.metadataMismatchTarget;
  await expectDenied('Provider metadata mismatch', () => reader.markAvailable(
    fixture.accountId, mismatch.objectId, 'sha256:mismatch', mismatch.providerKey, 'image/jpeg', 1024,
    proof('storage.provider.mark_available', {
      businessId: mismatch.businessId, objectId: mismatch.objectId, providerKey: mismatch.providerKey,
      contentType: 'image/jpeg', byteSize: 1024, checksum: 'sha256:mismatch',
    }),
  ));
  const mismatchRead = await reader.getObject(fixture.accountId, mismatch.objectId);
  if (!mismatchRead || mismatchRead.status !== 'pending') throw new Error('Provider metadata mismatch changed the object lifecycle state');

  const runtimeDenied = await runtime.query(
    "SELECT " +
      "has_function_privilege('ghm_runtime','ghm.gateway_storage_mark_available(bigint,bigint,uuid,text,text,bigint,uuid,text,text,bigint,text,text,text,bigint)','EXECUTE') AS runtime_available_wrapper, " +
      "has_function_privilege('ghm_runtime','ghm.gateway_storage_mark_deleted(bigint,bigint,uuid,text,text,bigint,uuid,text,text,bigint,text)','EXECUTE') AS runtime_deleted_wrapper, " +
      "has_function_privilege('ghm_actor_gateway','ghm.gateway_storage_mark_available(bigint,bigint,uuid,text,text,bigint,uuid,text,text,bigint,text,text,text,bigint)','EXECUTE') AS gateway_available_wrapper, " +
      "has_function_privilege('ghm_actor_gateway','ghm.gateway_storage_mark_deleted(bigint,bigint,uuid,text,text,bigint,uuid,text,text,bigint,text)','EXECUTE') AS gateway_deleted_wrapper, " +
      "has_function_privilege('ghm_runtime','ghm.assert_storage_provider_workflow_attestation(text,bigint,uuid,text,text)','EXECUTE') AS runtime_verifier, " +
      "has_function_privilege('ghm_actor_gateway','ghm.assert_storage_provider_workflow_attestation(text,bigint,uuid,text,text)','EXECUTE') AS gateway_verifier, " +
      "has_table_privilege('ghm_runtime','ghm.storage_provider_workflow_attestation_secret','SELECT') AS runtime_secret_read, " +
      "has_table_privilege('ghm_actor_gateway','ghm.storage_provider_workflow_attestation_secret','SELECT') AS gateway_secret_read",
  );
  const acl = runtimeDenied.rows[0];
  if (acl.runtime_available_wrapper || acl.runtime_deleted_wrapper
    || !acl.gateway_available_wrapper || !acl.gateway_deleted_wrapper
    || acl.runtime_verifier || acl.gateway_verifier
    || acl.runtime_secret_read || acl.gateway_secret_read) {
    throw new Error(`Unexpected provider workflow ACL: ${JSON.stringify(acl)}`);
  }
  console.log('PROVIDER WRAPPER, VERIFIER AND SECRET TABLE ACL BOUNDARIES: PASS');
  console.log('GHM STORAGE METADATA PROVIDER DUAL-PROOF QUALIFICATION: PASS');
} finally {
  const cleanup = await migrator.connect();
  try {
    await cleanup.query('BEGIN');
    await cleanup.query('SET LOCAL ROLE ghm_schema_owner');
    await cleanup.query('DELETE FROM ghm.storage_provider_workflow_attestation_secret WHERE singleton=true');
    if (fixture) {
      await cleanup.query('DELETE FROM ghm.business WHERE id IN ($1,$2)', [fixture.businessId, fixture.otherBusinessId]);
      await cleanup.query('DELETE FROM ghm.account_identity WHERE id IN ($1,$2,$3,$4,$5)', [fixture.accountId, fixture.outsiderId, fixture.memberId, fixture.nonmemberId, fixture.inactiveId]);
    }
    await cleanup.query('COMMIT');
  } catch (error) {
    await cleanup.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { cleanup.release(); }
  await Promise.all([runtime.end(), gateway.end(), migrator.end()]);
}
