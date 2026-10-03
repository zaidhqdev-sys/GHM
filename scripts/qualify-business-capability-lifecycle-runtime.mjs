import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl || !migratorUrl || runtimeUrl === migratorUrl) throw new Error('Dedicated runtime and migrator connections are required');

const { BusinessCapabilityServiceImpl } = await import('../dist/resources/business-capability/service.js');
const { PostgresBusinessCapabilityRepository } = await import('../dist/resources/business-capability/repository.js');

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });
const marker = `ghm-business-capability-lifecycle-${randomUUID()}`;
const ids = { accounts: [], businesses: [], capabilities: [], businessCapabilities: [] };

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
    ids.capabilities.push(capabilityId);
    await client.query(
      `INSERT INTO ghm.capability (id, name, slug, lifecycle_status, taxonomy_version, source_authority, is_selectable)
       VALUES ($1, $2, $3, 'active', 1, 'GHM qualification', true)`,
      [capabilityId, `${marker} capability`, `${marker}-capability`],
    );
    await client.query('COMMIT');
    fixture = { ownerId, verifierId, customerId, businessId, capabilityId };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }

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

  const privilege = await runtimePool.query(
    `SELECT has_table_privilege(current_user, 'ghm.business_capability', 'UPDATE') AS can_update,
            has_table_privilege(current_user, 'ghm.business_capability', 'DELETE') AS can_delete,
            has_function_privilege(current_user, 'ghm.transition_business_capability_verification(bigint,text,text,bigint,text)', 'EXECUTE') AS can_transition`,
  );
  const p = privilege.rows[0];
  if (p.can_update || p.can_delete || !p.can_transition) throw new Error(`Unexpected transition privileges: ${JSON.stringify(p)}`);
  console.log('RUNTIME PRIVILEGE BOUNDARY PASS: UPDATE=no DELETE=no TRANSITION=execute');

  const final = await service.getBusinessCapability(owner, created.id);
  if (!final || final.description !== created.description || final.verificationStatus !== 'pending') throw new Error('Final persisted state reconciliation failed');
  console.log('PERSISTED ASSERTION IMMUTABILITY RECONCILIATION PASS');
  console.log('GHM BUSINESS CAPABILITY LIFECYCLE RUNTIME QUALIFICATION: PASS');
} finally {
  await cleanup();
  await runtimePool.end();
  await cleanupPool.end();
}
