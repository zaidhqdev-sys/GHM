import { config } from 'dotenv';
import { Pool } from 'pg';

config();

const runtimeConnectionString = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorConnectionString = process.env.GHM_MIGRATOR_DATABASE_URL;

if (!runtimeConnectionString) throw new Error('GHM_RUNTIME_DATABASE_URL or DATABASE_URL is required.');
if (!migratorConnectionString) throw new Error('GHM_MIGRATOR_DATABASE_URL is required.');

const runtimePool = new Pool({ connectionString: runtimeConnectionString });
const migratorPool = new Pool({ connectionString: migratorConnectionString });

const cleanupIds = {
  businessId: null,
  ownerId: null,
  memberId: null,
  customerId: null,
  selectableId: null,
  inactiveId: null,
  nonSelectableId: null,
  createdId: null,
};

async function assertRejected(operation, label, expectedFragment) {
  try {
    await operation();
  } catch (error) {
    const message = String(error?.message ?? error);
    if (!message.toLowerCase().includes(expectedFragment.toLowerCase())) {
      throw new Error(`${label}: unexpected error: ${message}`);
    }
    console.log(label);
    return;
  }
  throw new Error(`${label}: operation unexpectedly succeeded`);
}

async function main() {
  const runtimeIdentity = await runtimePool.query(`SELECT current_database() AS database_name, current_user AS user_name`);
  const identity = runtimeIdentity.rows[0];
  if (identity.database_name !== 'ghm_db' || identity.user_name !== 'ghm_runtime') {
    throw new Error(`Unexpected runtime identity: ${JSON.stringify(identity)}`);
  }
  console.log(`RUNTIME IDENTITY PASS: ${identity.database_name}/${identity.user_name}`);

  const cleanupIdentity = await migratorPool.query(`SELECT current_database() AS database_name, current_user AS user_name`);
  const cleanup = cleanupIdentity.rows[0];
  if (cleanup.database_name !== 'ghm_db' || cleanup.user_name !== 'ghm_migrator') {
    throw new Error(`Unexpected cleanup identity: ${JSON.stringify(cleanup)}`);
  }
  console.log(`CLEANUP AUTHORITY PASS: ${cleanup.database_name}/${cleanup.user_name}`);

  const business = await migratorPool.query(
    `INSERT INTO ghm.business (name, slug, verification_status, is_verified, is_active)
     VALUES ('Business Capability Qualification', 'business-capability-qualification', 'approved', true, true)
     RETURNING id`,
  );
  cleanupIds.businessId = business.rows[0].id;

  const owner = await migratorPool.query(
    `INSERT INTO ghm.account_identity (email, display_name)
     VALUES ('business-capability-owner@qualification.invalid', 'Business Capability Owner')
     RETURNING id`,
  );
  cleanupIds.ownerId = owner.rows[0].id;

  await migratorPool.query(
    `INSERT INTO ghm.business_membership (business_id, account_identity_id, role, is_active)
     VALUES ($1, $2, 'owner', true)`,
    [cleanupIds.businessId, cleanupIds.ownerId],
  );

  const member = await migratorPool.query(
    `INSERT INTO ghm.account_identity (email, display_name)
     VALUES ('business-capability-member@qualification.invalid', 'Business Capability Member')
     RETURNING id`,
  );
  cleanupIds.memberId = member.rows[0].id;

  await migratorPool.query(
    `INSERT INTO ghm.business_membership (business_id, account_identity_id, role, is_active)
     VALUES ($1, $2, 'member', true)`,
    [cleanupIds.businessId, cleanupIds.memberId],
  );

  const customer = await migratorPool.query(
    `INSERT INTO ghm.account_identity (email, display_name)
     VALUES ('business-capability-customer@qualification.invalid', 'Business Capability Customer')
     RETURNING id`,
  );
  cleanupIds.customerId = customer.rows[0].id;

  const selectable = await migratorPool.query(
    `SELECT id
       FROM ghm.capability
      WHERE is_active = true
        AND is_selectable = true
      ORDER BY id
      LIMIT 1`,
  );
  if (!selectable.rows[0]) throw new Error('No active selectable capability fixture exists.');
  cleanupIds.selectableId = selectable.rows[0].id;

  const inactive = await migratorPool.query(
    `SELECT id
       FROM ghm.capability
      WHERE is_active = false
      ORDER BY id
      LIMIT 1`,
  );
  if (!inactive.rows[0]) throw new Error('No inactive capability fixture exists.');
  cleanupIds.inactiveId = inactive.rows[0].id;

  const nonSelectable = await migratorPool.query(
    `SELECT id
       FROM ghm.capability
      WHERE is_active = true
        AND is_selectable = false
      ORDER BY id
      LIMIT 1`,
  );
  if (!nonSelectable.rows[0]) throw new Error('No non-selectable capability fixture exists.');
  cleanupIds.nonSelectableId = nonSelectable.rows[0].id;

  const { BusinessCapabilityRepository } = await import('../dist/resources/business-capability/repository.js');
  const { makeAuthContext } = await import('../dist/auth/context.js');
  const repository = new BusinessCapabilityRepository(runtimePool);

  const ownerContext = makeAuthContext({ userId: String(cleanupIds.ownerId), role: 'business' });
  const memberContext = makeAuthContext({ userId: String(cleanupIds.memberId), role: 'business' });
  const customerContext = makeAuthContext({ userId: String(cleanupIds.customerId), role: 'customer' });
  const unauthorizedBusinessContext = makeAuthContext({ userId: String(cleanupIds.customerId), role: 'business' });

  const created = await repository.create(ownerContext, {
    businessId: String(cleanupIds.businessId),
    capabilityId: cleanupIds.selectableId,
    proficiencyLevel: 'advanced',
    description: 'Business Capability qualification fixture',
    sourceReference: 'qualification-fixture',
  });
  cleanupIds.createdId = created.id;

  if (created.assertionStatus !== 'active' || created.assertionBasis !== 'self_declared' || created.verificationStatus !== 'unverified' || String(created.createdBy) !== String(cleanupIds.ownerId)) {
    throw new Error(`Create defaults/provenance failed: ${JSON.stringify(created)}`);
  }
  console.log(`BUSINESS CAPABILITY CREATE + DEFAULTS + PROVENANCE PASS: id=${created.id}`);

  const memberRead = await repository.getById(memberContext, created.id);
  if (String(memberRead.id) !== String(created.id)) throw new Error('Business member read failed.');
  console.log('BUSINESS MEMBER READ PASS');

  const memberList = await repository.listByBusiness(memberContext, String(cleanupIds.businessId));
  if (!memberList.some((row) => String(row.id) === String(created.id))) throw new Error('Business member list failed.');
  console.log('BUSINESS MEMBER LIST PASS');

  await assertRejected(
    () => repository.create(memberContext, {
      businessId: String(cleanupIds.businessId),
      capabilityId: cleanupIds.inactiveId,
      description: 'non-management create',
    }),
    'NON-MANAGEMENT CREATE REJECTION PASS',
    'business management authority',
  );

  await assertRejected(
    () => repository.create(unauthorizedBusinessContext, {
      businessId: String(cleanupIds.businessId),
      capabilityId: cleanupIds.selectableId,
      description: 'unauthorized business create',
    }),
    'UNAUTHORIZED BUSINESS CREATE REJECTION PASS',
    'business management authority',
  );

  await assertRejected(
    () => repository.getById(unauthorizedBusinessContext, created.id),
    'UNAUTHORIZED BUSINESS READ REJECTION PASS',
    'business management authority',
  );

  await assertRejected(
    () => repository.create(customerContext, {
      businessId: String(cleanupIds.businessId),
      capabilityId: cleanupIds.selectableId,
      description: 'customer create',
    }),
    'CUSTOMER CREATE REJECTION PASS',
    'business management authority',
  );

  await assertRejected(
    () => repository.create(ownerContext, {
      businessId: String(cleanupIds.businessId),
      capabilityId: cleanupIds.nonSelectableId,
      description: 'non-selectable capability',
    }),
    'NON-SELECTABLE CAPABILITY REJECTION PASS',
    'active and selectable',
  );

  await assertRejected(
    () => repository.create(ownerContext, {
      businessId: String(cleanupIds.businessId),
      capabilityId: cleanupIds.inactiveId,
      description: 'inactive lifecycle capability',
    }),
    'INACTIVE-LIFECYCLE CAPABILITY REJECTION PASS',
    'active and selectable',
  );

  await assertRejected(
    () => repository.create(ownerContext, {
      businessId: String(cleanupIds.businessId),
      capabilityId: cleanupIds.selectableId,
      description: 'duplicate capability',
    }),
    'DUPLICATE + CONCURRENCY REJECTION PASS',
    'duplicate',
  );

  const concurrentResults = await Promise.allSettled([
    repository.create(ownerContext, {
      businessId: String(cleanupIds.businessId),
      capabilityId: cleanupIds.selectableId,
      description: 'concurrent capability one',
    }),
    repository.create(ownerContext, {
      businessId: String(cleanupIds.businessId),
      capabilityId: cleanupIds.selectableId,
      description: 'concurrent capability two',
    }),
  ]);
  const concurrentSuccesses = concurrentResults.filter((result) => result.status === 'fulfilled');
  const concurrentFailures = concurrentResults.filter((result) => result.status === 'rejected');
  if (concurrentSuccesses.length !== 0 || concurrentFailures.length !== 2) {
    throw new Error(`Duplicate concurrency qualification expected two failures; received ${concurrentSuccesses.length} successes/${concurrentFailures.length} failures`);
  }

  const persisted = await runtimePool.query(
    `SELECT business_id, capability_id, assertion_status, assertion_basis, verification_status, created_by,
            verified_by, verified_at, verification_reason
       FROM ghm.business_capability
      WHERE id = $1`,
    [created.id],
  );
  const row = persisted.rows[0];
  if (!row || Number(row.business_id) !== Number(cleanupIds.businessId) || row.capability_id !== cleanupIds.selectableId || row.assertion_status !== 'active' || row.assertion_basis !== 'self_declared' || row.verification_status !== 'unverified' || Number(row.created_by) !== Number(cleanupIds.ownerId) || row.verified_by !== null || row.verified_at !== null || row.verification_reason !== null) {
    throw new Error(`Persisted reconciliation failed: ${JSON.stringify(row)}`);
  }
  console.log('PERSISTED RECONCILIATION PASS');

  const privilegeColumns = [
    'business_id',
    'capability_id',
    'proficiency_level',
    'description',
    'effective_from',
    'effective_until',
    'source_reference',
    'created_by',
  ];
  const protectedColumns = [
    'assertion_status',
    'assertion_basis',
    'verification_status',
    'submitted_at',
    'verified_by',
    'verified_at',
    'verification_reason',
    'created_at',
    'updated_at',
  ];
  const privilegeChecks = await runtimePool.query(
    `SELECT
       has_table_privilege(current_user, 'ghm.business_capability', 'SELECT') AS can_select,
       has_table_privilege(current_user, 'ghm.business_capability', 'UPDATE') AS can_update,
       has_table_privilege(current_user, 'ghm.business_capability', 'DELETE') AS can_delete,
       ${privilegeColumns.map((column) => `has_column_privilege(current_user, 'ghm.business_capability', '${column}', 'INSERT') AS insert_${column}`).join(',\n       ')},
       ${protectedColumns.map((column) => `has_column_privilege(current_user, 'ghm.business_capability', '${column}', 'INSERT') AS protected_insert_${column}`).join(',\n       ')}`,
  );
  const privileges = privilegeChecks.rows[0];
  const expectedInsert = Object.fromEntries(privilegeColumns.map((column) => [`insert_${column}`, true]));
  const expectedProtected = Object.fromEntries(protectedColumns.map((column) => [`protected_insert_${column}`, false]));
  if (!privileges.can_select || privileges.can_update || privileges.can_delete || Object.entries(expectedInsert).some(([key, expected]) => privileges[key] !== expected) || Object.entries(expectedProtected).some(([key, expected]) => privileges[key] !== expected)) {
    throw new Error(`Unexpected Business Capability runtime privileges: ${JSON.stringify(privileges)}`);
  }
  console.log('RUNTIME PRIVILEGE PASS: SELECT=yes INSERT=approved-columns-only UPDATE=no DELETE=no');

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

  await migratorPool.query('BEGIN');
  try {
    await migratorPool.query('DELETE FROM ghm.business_capability WHERE business_id = $1', [cleanupIds.businessId]);
    await migratorPool.query('DELETE FROM ghm.business_membership WHERE business_id = $1', [cleanupIds.businessId]);
    await migratorPool.query('DELETE FROM ghm.business WHERE id = $1', [cleanupIds.businessId]);
    await migratorPool.query('DELETE FROM ghm.account_identity WHERE id IN ($1, $2, $3)', [cleanupIds.ownerId, cleanupIds.memberId, cleanupIds.customerId]);
    await migratorPool.query('COMMIT');
  } catch (error) {
    await migratorPool.query('ROLLBACK');
    throw error;
  }

  console.log('BUSINESS CAPABILITY RUNTIME QUALIFICATION PASS');
}

main()
  .catch(async (error) => {
    console.error(error);
    try {
      if (cleanupIds.businessId) {
        await migratorPool.query('BEGIN');
        await migratorPool.query('DELETE FROM ghm.business_capability WHERE business_id = $1', [cleanupIds.businessId]);
        await migratorPool.query('DELETE FROM ghm.business_membership WHERE business_id = $1', [cleanupIds.businessId]);
        await migratorPool.query('DELETE FROM ghm.business WHERE id = $1', [cleanupIds.businessId]);
        await migratorPool.query('DELETE FROM ghm.account_identity WHERE id IN ($1, $2, $3)', [cleanupIds.ownerId, cleanupIds.memberId, cleanupIds.customerId]);
        await migratorPool.query('COMMIT');
      }
    } catch (cleanupError) {
      console.error(`Cleanup failed: ${cleanupError?.message ?? cleanupError}`);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await runtimePool.end();
    await migratorPool.end();
  });
