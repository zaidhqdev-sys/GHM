import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl || !migratorUrl || runtimeUrl === migratorUrl) throw new Error('Dedicated runtime and migrator connections are required');

const { BusinessCapabilityServiceImpl } = await import('../dist/resources/business-capability/service.js');
const { PostgresBusinessCapabilityRepository } = await import('../dist/resources/business-capability/repository.js');

const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false;
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });
const marker = `ghm-business-capability-lifecycle-${randomUUID()}`;
const ids = { accounts: [], businesses: [], capabilities: [], businessCapabilities: [], evidenceIds: [] };

const expectReject = async (work, label, text) => {
  try { await work(); }
  catch (error) {
    if (text && !String(error?.message).includes(text)) throw new Error(`${label}: expected ${text}, got ${error?.message}`);
    console.log(label);
    return;
  }
  throw new Error(`${label}: operation unexpectedly succeeded`);
};

const cleanup = async () => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    if (ids.evidenceIds.length) await client.query('DELETE FROM ghm.business_capability_evidence WHERE id = ANY($1::bigint[])', [ids.evidenceIds]);
    if (ids.businesses.length) await client.query('DELETE FROM ghm.business_capability WHERE business_id = ANY($1::bigint[])', [ids.businesses]);
    if (ids.businessCapabilities.length) await client.query('DELETE FROM ghm.business_capability WHERE id = ANY($1::bigint[])', [ids.businessCapabilities]);
    if (ids.businesses.length) await client.query('DELETE FROM ghm.business WHERE id = ANY($1::bigint[])', [ids.businesses]);
    if (ids.capabilities.length) await client.query('DELETE FROM ghm.capability WHERE id = ANY($1::uuid[])', [ids.capabilities]);
    if (ids.accounts.length) await client.query('DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])', [ids.accounts]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); console.error(`cleanup failed: ${error?.message ?? error}`); }
  finally { client.release(); }
};

try {
  const client = await cleanupPool.connect();
  let fixture;
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const accountRows = await client.query(
      `INSERT INTO ghm.account_identity (full_name, role)
       VALUES ($1, 'business'), ($2, 'admin'), ($3, 'customer')
       RETURNING id, role`,
      [`${marker} owner`, `${marker} verifier`, `${marker} customer`],
    );
    const ownerId = Number(accountRows.rows.find(row => row.role === 'business').id);
    const verifierId = Number(accountRows.rows.find(row => row.role === 'admin').id);
    const customerId = Number(accountRows.rows.find(row => row.role === 'customer').id);
    ids.accounts.push(ownerId, verifierId, customerId);

    const business = await client.query(
      `INSERT INTO ghm.business (name, slug, verification_status, is_verified, is_active)
       VALUES ($1, $2, 'approved', true, true) RETURNING id`,
      [`${marker} business`, `${marker}-business`],
    );
    const businessId = Number(business.rows[0].id);
    ids.businesses.push(businessId);
    await client.query(
      `INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status, created_by)
       VALUES ($1, $2, 'owner', 'active', $2)`,
      [businessId, ownerId],
    );

    const capabilityId = randomUUID();
    const alternateCapabilityId = randomUUID();
    ids.capabilities.push(capabilityId, alternateCapabilityId);
    await client.query(
      `INSERT INTO ghm.capability (id, name, slug, lifecycle_status, taxonomy_version, source_authority, is_selectable)
       VALUES ($1, $2, $3, 'active', 1, 'GHM qualification', true),
              ($4, $5, $6, 'active', 1, 'GHM qualification', true)`,
      [capabilityId, `${marker} capability`, `${marker}-capability`, alternateCapabilityId, `${marker} alternate capability`, `${marker}-alternate-capability`],
    );
    await client.query('COMMIT');
    fixture = { ownerId, verifierId, customerId, businessId, capabilityId, alternateCapabilityId };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }

  const { businessId, ownerId, verifierId, capabilityId, alternateCapabilityId } = fixture;

  const repository = new PostgresBusinessCapabilityRepository(runtimePool);
  const service = new BusinessCapabilityServiceImpl(repository);
  const owner = { userId: fixture.ownerId, role: 'business' };
  const admin = { userId: fixture.verifierId, role: 'admin' };
  const customer = { userId: fixture.customerId, role: 'customer' };

  const created = await service.createBusinessCapability(owner, { businessId: fixture.businessId, capabilityId: fixture.capabilityId, description: 'Lifecycle qualification', sourceReference: 'runtime' });
  ids.businessCapabilities.push(created.id);
  if (created.verificationStatus !== 'unverified' || created.verifiedBy !== null || created.verifiedAt !== null) throw new Error('Unexpected initial verification state');
  console.log(`INITIAL UNVERIFIED PASS: id=${created.id}`);

  await expectReject(
    () => service.transitionBusinessCapabilityVerification(customer, { businessCapabilityId: created.id, expectedStatus: 'unverified', targetStatus: 'pending' }),
    'NON-ADMIN DENIAL PASS',
    'requires admin role',
  );

  await expectReject(
    () => service.transitionBusinessCapabilityVerification(owner, { businessCapabilityId: created.id, expectedStatus: 'unverified', targetStatus: 'pending' }),
    'OWNER NON-ADMIN DENIAL PASS',
    'requires admin role',
  );

  const pending = await service.transitionBusinessCapabilityVerification(admin, { businessCapabilityId: created.id, expectedStatus: 'unverified', targetStatus: 'pending' });
  if (pending.verificationStatus !== 'pending' || pending.verifiedBy !== null || pending.verifiedAt !== null || pending.verificationReason !== null) throw new Error('Invalid pending state');
  console.log('UNVERIFIED TO PENDING PASS');

  await expectReject(
    () => service.transitionBusinessCapabilityVerification(admin, { businessCapabilityId: created.id, expectedStatus: 'unverified', targetStatus: 'verified' }),
    'INVALID TRANSITION DENIAL PASS',
    'stale',
  );

  await expectReject(
    () => service.transitionBusinessCapabilityVerification(admin, { businessCapabilityId: created.id, expectedStatus: 'pending', targetStatus: 'rejected' }),
    'REASON REQUIREMENT DENIAL PASS',
    'reason is required',
  );

  const verified = await service.transitionBusinessCapabilityVerification(admin, { businessCapabilityId: created.id, expectedStatus: 'pending', targetStatus: 'verified' });
  if (verified.verificationStatus !== 'verified' || verified.verifiedBy !== fixture.verifierId || !verified.verifiedAt || verified.verificationReason !== null) throw new Error('Invalid verified state');
  if (verified.description !== created.description || verified.sourceReference !== created.sourceReference || verified.assertionStatus !== created.assertionStatus) throw new Error('Assertion fields changed during verification');
  console.log('PENDING TO VERIFIED + VERIFIER PROVENANCE PASS');

  await expectReject(
    () => service.transitionBusinessCapabilityVerification(admin, { businessCapabilityId: created.id, expectedStatus: 'pending', targetStatus: 'verified' }),
    'STALE STATE DENIAL PASS',
    'stale',
  );

  const revoked = await service.transitionBusinessCapabilityVerification(admin, { businessCapabilityId: created.id, expectedStatus: 'verified', targetStatus: 'revoked', reason: 'Qualification revoke' });
  if (revoked.verificationStatus !== 'revoked' || revoked.verificationReason !== 'Qualification revoke' || revoked.verifiedBy !== fixture.verifierId || !revoked.verifiedAt) throw new Error('Invalid revoked state');
  console.log('VERIFIED TO REVOKED + REASON PASS');

  const reopened = await service.transitionBusinessCapabilityVerification(admin, { businessCapabilityId: created.id, expectedStatus: 'revoked', targetStatus: 'pending' });
  if (reopened.verificationStatus !== 'pending' || reopened.verifiedBy !== null || reopened.verifiedAt !== null || reopened.verificationReason !== null) throw new Error('Invalid reopened state');
  console.log('REVOKED TO PENDING RESET PASS');

  await expectReject(
    () => runtimePool.query(`UPDATE ghm.business_capability SET description = 'unauthorized' WHERE id = $1`, [created.id]),
    'RUNTIME UPDATE DENIAL PASS',
    'permission denied',
  );
  await expectReject(
    () => runtimePool.query(`DELETE FROM ghm.business_capability WHERE id = $1`, [created.id]),
    'RUNTIME DELETE DENIAL PASS',
    'permission denied',
  );

  // Exercise the migration's Business-row lock with two independent runtime sessions.
  // The final active assertion set must be exactly one submitted replacement set, never a mix.
  const replacementA = [{ capabilityId, proficiencyLevel: 'advanced', description: 'replacement A', sourceReference: 'qualification-A' }];
  const replacementB = [{ capabilityId: alternateCapabilityId, proficiencyLevel: 'expert', description: 'replacement B', sourceReference: 'qualification-B' }];
  const concurrentReplacement = await Promise.allSettled([
    runtimePool.query('SELECT * FROM ghm.replace_business_capability_assertions($1, $2, $3::jsonb)', [businessId, ownerId, JSON.stringify(replacementA)]),
    runtimePool.query('SELECT * FROM ghm.replace_business_capability_assertions($1, $2, $3::jsonb)', [businessId, ownerId, JSON.stringify(replacementB)]),
  ]);
  const replacementFailures = concurrentReplacement.filter(result => result.status === 'rejected');
  if (replacementFailures.length) throw new Error(`Concurrent assertion replacement failed: ${replacementFailures.map(result => result.reason?.message).join('; ')}`);
  const activeAfterReplacement = await runtimePool.query(
    `SELECT capability_id, description, source_reference
       FROM ghm.business_capability
      WHERE business_id = $1 AND assertion_status = 'active'`,
    [businessId],
  );
  const activeIds = activeAfterReplacement.rows.map(row => row.capability_id);
  const finalSetIsA = activeIds.length === 1 && activeIds[0] === capabilityId
    && activeAfterReplacement.rows[0].description === 'replacement A'
    && activeAfterReplacement.rows[0].source_reference === 'qualification-A';
  const finalSetIsB = activeIds.length === 1 && activeIds[0] === alternateCapabilityId
    && activeAfterReplacement.rows[0].description === 'replacement B'
    && activeAfterReplacement.rows[0].source_reference === 'qualification-B';
  if (!finalSetIsA && !finalSetIsB) throw new Error(`Concurrent replacements produced a mixed or partial set: ${JSON.stringify(activeAfterReplacement.rows)}`);
  console.log(`TWO-SESSION ASSERTION REPLACEMENT SERIALIZATION PASS: final set=${finalSetIsA ? 'A' : 'B'}`);

  // Runtime evidence submission must use the database's pending default.
  const statusPrivilege = await runtimePool.query(
    "SELECT has_column_privilege(current_user, 'ghm.business_capability_evidence', 'verification_status', 'INSERT') AS allowed"
  );
  if (statusPrivilege.rows[0].allowed !== false) throw new Error('Runtime may explicitly set evidence verification_status');
  await runtimePool.query(
    `INSERT INTO ghm.business_capability_evidence
       (business_capability_id, evidence_type, title, submitted_by, visibility)
     VALUES ($1, 'certification', 'Runtime submission qualification', $2, 'private')`,
    [created.id, fixture.ownerId],
  );
  const evidenceStatusClient = await cleanupPool.connect();
  let submittedEvidenceId;
  let submittedEvidenceStatus;
  try {
    await evidenceStatusClient.query('BEGIN');
    await evidenceStatusClient.query('SET LOCAL ROLE ghm_schema_owner');
    const status = await evidenceStatusClient.query(
      `SELECT id, verification_status
         FROM ghm.business_capability_evidence
        WHERE business_capability_id = $1
          AND submitted_by = $2
          AND title = 'Runtime submission qualification'
        ORDER BY id DESC
        LIMIT 1`,
      [created.id, fixture.ownerId],
    );
    submittedEvidenceId = Number(status.rows[0]?.id);
    submittedEvidenceStatus = status.rows[0]?.verification_status;
    await evidenceStatusClient.query('COMMIT');
  } catch (error) {
    await evidenceStatusClient.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    evidenceStatusClient.release();
  }
  if (!submittedEvidenceId || submittedEvidenceStatus !== 'pending') throw new Error('Runtime evidence did not default to pending');
  console.log('RUNTIME EVIDENCE STATUS PRIVILEGE PASS');
  ids.evidenceIds.push(submittedEvidenceId);
  const removeSubmission = await cleanupPool.connect();
  try {
    await removeSubmission.query('BEGIN');
    await removeSubmission.query('SET LOCAL ROLE ghm_schema_owner');
    await removeSubmission.query('DELETE FROM ghm.business_capability_evidence WHERE id = $1', [submittedEvidence.rows[0].id]);
    await removeSubmission.query('COMMIT');
    ids.evidenceIds.pop();
  } catch (error) {
    await removeSubmission.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    removeSubmission.release();
  }
  // Two evidence rows exercise aggregate parent state across separate decisions.
  const evidenceClient = await cleanupPool.connect();
  try {
    await evidenceClient.query('BEGIN');
    await evidenceClient.query('SET LOCAL ROLE ghm_schema_owner');
    const evidenceRows = await evidenceClient.query(
      `INSERT INTO ghm.business_capability_evidence
         (business_capability_id, evidence_type, title, submitted_by, visibility)
       VALUES ($1, 'certification', 'Qualification evidence A', $2, 'private'),
              ($1, 'licence', 'Qualification evidence B', $2, 'private')
       RETURNING id`,
      [created.id, fixture.ownerId],
    );
    ids.evidenceIds.push(...evidenceRows.rows.map(row => Number(row.id)));
    await evidenceClient.query('COMMIT');
  } catch (error) { await evidenceClient.query('ROLLBACK').catch(() => {}); throw error; }
  finally { evidenceClient.release(); }

  await runtimePool.query(
    'SELECT ghm.transition_business_capability_evidence($1, $2, $3, $4)',
    [ids.evidenceIds[0], 'rejected', fixture.verifierId, 'Qualification rejection fixture'],
  );
  const afterFirstEvidenceDecision = await runtimePool.query(
    'SELECT verification_status FROM ghm.business_capability WHERE id = $1', [created.id],
  );
  if (afterFirstEvidenceDecision.rows[0]?.verification_status !== 'pending') {
    throw new Error(`Parent assertion left pending while another evidence item remained pending: ${JSON.stringify(afterFirstEvidenceDecision.rows[0])}`);
  }
  console.log('MULTI-ROW EVIDENCE AGGREGATION PASS: rejected item does not reject parent while another remains pending');

  await runtimePool.query(
    'SELECT ghm.transition_business_capability_evidence($1, $2, $3, $4)',
    [ids.evidenceIds[1], 'verified', fixture.verifierId, null],
  );
  const afterFinalEvidenceDecision = await runtimePool.query(
    'SELECT verification_status, verified_by, verified_at FROM ghm.business_capability WHERE id = $1', [created.id],
  );
  if (afterFinalEvidenceDecision.rows[0]?.verification_status !== 'verified'
      || Number(afterFinalEvidenceDecision.rows[0]?.verified_by) !== fixture.verifierId
      || !afterFinalEvidenceDecision.rows[0]?.verified_at) {
    throw new Error(`Parent assertion did not become verified after remaining evidence was verified: ${JSON.stringify(afterFinalEvidenceDecision.rows[0])}`);
  }
  console.log('MULTI-ROW EVIDENCE FINAL VERIFICATION PASS');

  const privilege = await runtimePool.query(
    `SELECT has_table_privilege(current_user, 'ghm.business_capability', 'UPDATE') AS can_update,
            has_table_privilege(current_user, 'ghm.business_capability', 'DELETE') AS can_delete,
            has_function_privilege(current_user, 'ghm.transition_business_capability_verification(bigint,text,text,bigint,text)', 'EXECUTE') AS can_transition`,
  );
  const p = privilege.rows[0];
  if (p.can_update || p.can_delete || !p.can_transition) throw new Error(`Unexpected transition privileges: ${JSON.stringify(p)}`);
  console.log('RUNTIME PRIVILEGE BOUNDARY PASS: UPDATE=no DELETE=no TRANSITION=execute');

  const final = await service.getBusinessCapability(owner, created.id);
  if (!final || final.verificationStatus !== 'verified') throw new Error(`Final persisted evidence state reconciliation failed: ${JSON.stringify(final)}`);
  console.log('PERSISTED EVIDENCE STATE RECONCILIATION PASS');
  console.log('GHM BUSINESS CAPABILITY LIFECYCLE RUNTIME QUALIFICATION: PASS');
} finally {
  await cleanup();
  await runtimePool.end();
  await cleanupPool.end();
}
