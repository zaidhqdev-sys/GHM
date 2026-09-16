import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;

if (!runtimeUrl) throw new Error('Missing GHM_RUNTIME_DATABASE_URL or DATABASE_URL for the dedicated runtime qualification connection');
if (!migratorUrl) throw new Error('Missing GHM_MIGRATOR_DATABASE_URL for construction cleanup authority');
if (runtimeUrl === migratorUrl) throw new Error('Runtime and migrator connections must be distinct');

const { BusinessCapabilityServiceImpl } = await import('../dist/resources/business-capability/service.js');
const { PostgresBusinessCapabilityRepository } = await import('../dist/resources/business-capability/repository.js');

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });

const fixture = {
  marker: `ghm-business-capability-${randomUUID()}`,
  accountIds: [],
  businessIds: [],
  capabilityIds: [],
  businessCapabilityIds: [],
};

const assertRejected = async (work, label, expectedMessage) => {
  try {
    await work();
  } catch (error) {
    if (expectedMessage && !String(error?.message).includes(expectedMessage)) {
      throw new Error(`${label}: expected error containing ${expectedMessage}; received ${error?.message}`);
    }
    console.log(label);
    return;
  }
  throw new Error(`${label}: operation unexpectedly succeeded`);
};

const identity = async (pool, expectedUser, label) => {
  const { rows } = await pool.query(`SELECT current_database() AS database_name, session_user, current_user, current_role`);
  const value = rows[0];
  if (value.database_name !== 'ghm_db' || value.session_user !== expectedUser || value.current_user !== expectedUser || value.current_role !== expectedUser) {
    throw new Error(`${label} refused: received ${JSON.stringify(value)}`);
  }
  return value;
};

const createFixture = async () => {
  const client = await cleanupPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ghm_schema_owner');

    const accountResult = await client.query(
      `INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'business') RETURNING id`,
      [`${fixture.marker} owner`],
    );
    const memberResult = await client.query(
      `INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'business') RETURNING id`,
      [`${fixture.marker} member`],
    );
    const outsiderResult = await client.query(
      `INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'business') RETURNING id`,
      [`${fixture.marker} outsider`],
    );
    const customerResult = await client.query(
      `INSERT INTO ghm.account_identity (full_name, role) VALUES ($1, 'customer') RETURNING id`,
      [`${fixture.marker} customer`],
    );
    const ownerId = Number(accountResult.rows[0].id);
    const memberId = Number(memberResult.rows[0].id);
    const outsiderId = Number(outsiderResult.rows[0].id);
    const customerId = Number(customerResult.rows[0].id);
    fixture.accountIds.push(ownerId, memberId, outsiderId, customerId);

    const businessResult = await client.query(
      `INSERT INTO ghm.business (name, slug, verification_status, is_verified, is_active) VALUES ($1, $2, 'approved', true, true) RETURNING id`,
      [`${fixture.marker} business`, `${fixture.marker}-business`],
    );
    const businessId = Number(businessResult.rows[0].id);
    fixture.businessIds.push(businessId);

    await client.query(
      `INSERT INTO ghm.business_membership (business_id, account_id, membership_role, membership_status, created_by)
       VALUES ($1, $2, 'owner', 'active', $2), ($1, $3, 'member', 'active', $2)`,
      [businessId, ownerId, memberId],
    );

    const selectableId = randomUUID();
    const nonSelectableId = randomUUID();
    const draftId = randomUUID();
    fixture.capabilityIds.push(selectableId, nonSelectableId, draftId);

    await client.query(
      `INSERT INTO ghm.capability (id, name, slug, lifecycle_status, taxonomy_version, source_authority, is_selectable)
       VALUES ($1, $2, $3, 'active', 1, 'GHM qualification', true),
              ($4, $5, $6, 'active', 1, 'GHM qualification', false),
              ($7, $8, $9, 'draft', 1, 'GHM qualification', true)`,
      [
        selectableId, `${fixture.marker} selectable`, `${fixture.marker}-selectable`,
        nonSelectableId, `${fixture.marker} nonselectable`, `${fixture.marker}-nonselectable`,
        draftId, `${fixture.marker} draft`, `${fixture.marker}-draft`,
      ],
    );

    await client.query('COMMIT');
    return { ownerId, memberId, outsiderId, customerId, businessId, selectableId, nonSelectableId, draftId };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

try {
  const [runtime, cleanup] = await Promise.all([
    identity(runtimePool, 'ghm_runtime', 'Runtime qualification'),
    identity(cleanupPool, 'ghm_migrator', 'Cleanup authority'),
  ]);
  console.log(`RUNTIME IDENTITY PASS: ${runtime.database_name}/${runtime.current_user}`);
  console.log(`CLEANUP AUTHORITY PASS: ${cleanup.database_name}/${cleanup.current_user}`);

  const fixtureData = await createFixture();
  const { ownerId, memberId, outsiderId, customerId, businessId, selectableId, nonSelectableId, draftId } = fixtureData;

  const repository = new PostgresBusinessCapabilityRepository(runtimePool);
  const service = new BusinessCapabilityServiceImpl(repository);
  const ownerContext = { userId: ownerId, role: 'business' };
  const memberContext = { userId: memberId, role: 'business' };
  const outsiderContext = { userId: outsiderId, role: 'business' };
  const customerContext = { userId: customerId, role: 'customer' };

  const created = await service.createBusinessCapability(ownerContext, {
    businessId,
    capabilityId: selectableId,
    proficiencyLevel: 'advanced',
    description: '  Qualification-created capability  ',
    sourceReference: '  runtime-qualification  ',
  });
  fixture.businessCapabilityIds.push(created.id);
  if (
    created.businessId !== businessId ||
    created.capabilityId !== selectableId ||
    created.proficiencyLevel !== 'advanced' ||
    created.description !== 'Qualification-created capability' ||
    created.sourceReference !== 'runtime-qualification' ||
    created.assertionStatus !== 'active' ||
    created.assertionBasis !== 'self_declared' ||
    created.verificationStatus !== 'unverified' ||
    created.createdBy !== ownerId ||
    created.verifiedBy !== null ||
    created.verifiedAt !== null ||
    created.verificationReason !== null
  ) {
    throw new Error(`Unexpected Business Capability creation result: ${JSON.stringify(created)}`);
  }
  console.log(`BUSINESS CAPABILITY CREATE + DEFAULTS + PROVENANCE PASS: id=${created.id}`);

  const memberRead = await service.getBusinessCapability(memberContext, created.id);
  if (!memberRead || memberRead.id !== created.id) throw new Error('Authorized member read failed');
  console.log('BUSINESS MEMBER READ PASS');

  const memberList = await service.listBusinessCapabilities(memberContext, businessId);
  if (!memberList.some((row) => row.id === created.id)) throw new Error('Authorized member list failed');
  console.log('BUSINESS MEMBER LIST PASS');

  await assertRejected(
    () => service.createBusinessCapability(memberContext, { businessId, capabilityId: selectableId }),
    'NON-MANAGEMENT CREATE REJECTION PASS',
    'Business management permission required',
  );

  await assertRejected(
    () => service.createBusinessCapability(outsiderContext, { businessId, capabilityId: selectableId }),
    'UNAUTHORIZED BUSINESS CREATE REJECTION PASS',
    'Business management permission required',
  );

  await assertRejected(
    () => service.getBusinessCapability(outsiderContext, created.id),
    'UNAUTHORIZED BUSINESS READ REJECTION PASS',
    'Business access required',
  );

  await assertRejected(
    () => service.createBusinessCapability(customerContext, { businessId, capabilityId: selectableId }),
    'CUSTOMER CREATE REJECTION PASS',
    'Business management permission required',
  );

  await assertRejected(
    () => service.createBusinessCapability(ownerContext, { businessId, capabilityId: nonSelectableId }),
    'NON-SELECTABLE CAPABILITY REJECTION PASS',
    'Capability not found or not selectable',
  );

  await assertRejected(
    () => service.createBusinessCapability(ownerContext, { businessId, capabilityId: draftId }),
    'INACTIVE-LIFECYCLE CAPABILITY REJECTION PASS',
    'Capability not found or not selectable',
  );

  const concurrentResults = await Promise.allSettled([
    service.createBusinessCapability(ownerContext, { businessId, capabilityId: selectableId }),
    service.createBusinessCapability(ownerContext, { businessId, capabilityId: selectableId }),
  ]);
  const concurrentSuccesses = concurrentResults.filter((result) => result.status === 'fulfilled');
  const concurrentFailures = concurrentResults.filter((result) => result.status === 'rejected');
  if (concurrentSuccesses.length !== 0 || concurrentFailures.length !== 2) {
    throw new Error(`Duplicate concurrency qualification expected two failures; received ${concurrentSuccesses.length} successes/${concurrentFailures.length} failures`);
  }
  console.log('DUPLICATE + CONCURRENCY REJECTION PASS');

  const persisted = await runtimePool.query(
    `SELECT business_id, capability_id, assertion_status, assertion_basis, verification_status, created_by,
            verified_by, verified_at, verification_reason
       FROM ghm.business_capability
      WHERE id = $1`,
    [created.id],
  );
  const row = persisted.rows[0];
  if (!row || Number(row.business_id) !== businessId || row.capability_id !== selectableId || row.assertion_status !== 'active' || row.assertion_basis !== 'self_declared' || row.verification_status !== 'unverified' || Number(row.created_by) !== ownerId || row.verified_by !== null || row.verified_at !== null || row.verification_reason !== null) {
    throw new Error(`Persisted reconciliation failed: ${JSON.stringify(row)}`);
  }
  console.log('PERSISTED RECONCILIATION PASS');

  const updateError = await runtimePool.query(
    `SELECT has_table_privilege(current_user, 'ghm.business_capability', 'UPDATE') AS can_update,
            has_table_privilege(current_user, 'ghm.business_capability', 'DELETE') AS can_delete,
            has_table_privilege(current_user, 'ghm.business_capability', 'INSERT') AS can_insert`,
  );
  if (updateError.rows[0].can_update || updateError.rows[0].can_delete || !updateError.rows[0].can_insert) {
    throw new Error(`Unexpected Business Capability runtime privileges: ${JSON.stringify(updateError.rows[0])}`);
  }
  console.log('RUNTIME PRIVILEGE PASS: INSERT=yes UPDATE=no DELETE=no');

  await assertRejected(
    () => runtimePool.query(`UPDATE ghm.business_capability SET description = 'unauthorized' WHERE id = $1`, [created.id]),
    'RUNTIME UPDATE DENIAL PASS',
    'permission denied',
  );

  await assertRejected(
    () => runtimePool.query(`DELETE FROM ghm.business_capability WHERE id = $1`, [created.id]),
    'RUNTIME DELETE DENIAL PASS',
    'permission denied',
  );

  const final = await runtimePool.query(`SELECT description, assertion_status, verification_status FROM ghm.business_capability WHERE id = $1`, [created.id]);
  if (!final.rows[0] || final.rows[0].description !== 'Qualification-created capability' || final.rows[0].assertion_status !== 'active' || final.rows[0].verification_status !== 'unverified') {
    throw new Error('Runtime denial attempts altered persisted state');
  }
  console.log('RUNTIME DENIAL PERSISTENCE PASS');

  console.log('GHM BUSINESS CAPABILITY RUNTIME QUALIFICATION: PASS');
} finally {
  try {
    await cleanupPool.query('BEGIN');
    await cleanupPool.query('SET LOCAL ROLE ghm_schema_owner');
    if (fixture.businessCapabilityIds.length > 0) await cleanupPool.query(`DELETE FROM ghm.business_capability WHERE id = ANY($1::bigint[])`, [fixture.businessCapabilityIds]);
    if (fixture.businessIds.length > 0) await cleanupPool.query(`DELETE FROM ghm.business WHERE id = ANY($1::bigint[])`, [fixture.businessIds]);
    if (fixture.capabilityIds.length > 0) await cleanupPool.query(`DELETE FROM ghm.capability WHERE id = ANY($1::uuid[])`, [fixture.capabilityIds]);
    if (fixture.accountIds.length > 0) await cleanupPool.query(`DELETE FROM ghm.account_identity WHERE id = ANY($1::bigint[])`, [fixture.accountIds]);
    await cleanupPool.query('COMMIT');
  } catch (cleanupError) {
    await cleanupPool.query('ROLLBACK').catch(() => {});
    console.error(`Qualification cleanup failed: ${cleanupError?.message ?? cleanupError}`);
  } finally {
    await runtimePool.end();
    await cleanupPool.end();
  }
}
