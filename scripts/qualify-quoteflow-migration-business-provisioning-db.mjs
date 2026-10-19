import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
const expectedNonProductionHost = process.env.GHM_NONPRODUCTION_DATABASE_HOST;
assert(runtimeUrl && migratorUrl && runtimeUrl !== migratorUrl,
  'Distinct GHM_RUNTIME_DATABASE_URL and GHM_MIGRATOR_DATABASE_URL are required');
assert(expectedNonProductionHost,
  'GHM_NONPRODUCTION_DATABASE_HOST must be set to the approved isolated non-production database hostname');

const runtimeHost = new URL(runtimeUrl).hostname;
const migratorHost = new URL(migratorUrl).hostname;
assert.equal(runtimeHost, expectedNonProductionHost,
  'Runtime database host does not match the explicitly approved non-production host');
assert.equal(migratorHost, expectedNonProductionHost,
  'Migration database host does not match the explicitly approved non-production host');

const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
const runtime = new Client({ connectionString: runtimeUrl, ...(ssl ? { ssl } : {}) });
const migrator = new Client({ connectionString: migratorUrl, ...(ssl ? { ssl } : {}) });
const runId = randomUUID();
const provider = 'supabase';
const sourceIds = [0, 1, 2, 3].map(i => `qualify-quoteflow-org-${runId}-${i}`);
const slugBase = `qualify-quoteflow-${runId}`;
let ownerId;
let disabledOwnerId;
let alternateOwnerId;
const evidenceReference = () => `synthetic:quoteflow-business-${runId}`;
const reviewedAt = new Date('2026-10-20T00:00:00.000Z');
const businessIds = new Set();

const provision = (sourceId, name, slug, accountId = ownerId, sourceProvider = provider) =>
  migrator.query(
    'select * from ghm.auth_provision_quoteflow_migration_business($1,$2,$3,$4,$5,$6,$7,$8)',
    [sourceProvider, sourceId, name, slug, accountId, evidenceReference(), 'synthetic-qualification-reviewer', reviewedAt],
  );

try {
  await runtime.connect();
  await migrator.connect();
  await migrator.query('set role ghm_schema_owner');

  const runtimeIdentity = await runtime.query('select current_database() as db, current_user as role');
  assert.equal(runtimeIdentity.rows[0].db, 'ghm_db');
  assert.equal(runtimeIdentity.rows[0].role, 'ghm_runtime');

  const migrationIdentity = await migrator.query('select current_database() as db, current_user as role');
  assert.equal(migrationIdentity.rows[0].db, 'ghm_db');
  assert.equal(migrationIdentity.rows[0].role, 'ghm_schema_owner');

  const privileges = await runtime.query(`
    select
      has_function_privilege(current_user,
        'ghm.auth_provision_quoteflow_migration_business(text,text,text,text,bigint,text,text,timestamptz)', 'EXECUTE') as can_execute,
      has_table_privilege(current_user, 'ghm.business_external_mapping', 'INSERT') as can_insert_mapping,
      has_table_privilege(current_user, 'ghm.business_external_mapping', 'UPDATE') as can_update_mapping,
      has_table_privilege(current_user, 'ghm.business_external_mapping', 'DELETE') as can_delete_mapping,
      has_table_privilege(current_user, 'ghm.quoteflow_migration_business_provisioning_audit', 'INSERT') as can_insert_audit,
      has_table_privilege(current_user, 'ghm.quoteflow_migration_business_provisioning_audit', 'UPDATE') as can_update_audit,
      has_table_privilege(current_user, 'ghm.quoteflow_migration_business_provisioning_audit', 'DELETE') as can_delete_audit
  `);
  assert.deepEqual(privileges.rows[0], {
    can_execute: false, can_insert_mapping: false, can_update_mapping: false, can_delete_mapping: false,
    can_insert_audit: false, can_update_audit: false, can_delete_audit: false,
  });

  const migrationPrivilege = await migrator.query(`
    select has_function_privilege(current_user,
      'ghm.auth_provision_quoteflow_migration_business(text,text,text,text,bigint,text,text,timestamptz)', 'EXECUTE') as can_execute
  `);
  assert.equal(migrationPrivilege.rows[0].can_execute, true);

  const owner = await migrator.query(`
    insert into ghm.account_identity (full_name, role, account_status, is_system_admin)
    values ('Synthetic QuoteFlow Business Migration Owner', 'business', 'active', false)
    returning id
  `);
  ownerId = Number(owner.rows[0].id);
  const disabledOwner = await migrator.query(`
    insert into ghm.account_identity (full_name, role, account_status, is_system_admin)
    values ('Synthetic Disabled Migration Owner', 'business', 'disabled', false)
    returning id
  `);
  disabledOwnerId = Number(disabledOwner.rows[0].id);
  const alternateOwner = await migrator.query(
    `insert into ghm.account_identity (full_name, role, account_status, is_system_admin)
     values ('Synthetic Alternate Migration Owner', 'customer', 'active', false) returning id`,
  );
  alternateOwnerId = Number(alternateOwner.rows[0].id);

  const created = await provision(sourceIds[0], 'Synthetic QuoteFlow Business', `${slugBase}-fresh`);
  assert.equal(created.rows[0].outcome, 'created');
  assert.equal(created.rows[0].reason_code, 'CREATED_PENDING_REVIEW');
  const businessId = Number(created.rows[0].business_id);
  const membershipId = Number(created.rows[0].owner_membership_id);
  businessIds.add(businessId);

  const state = await migrator.query(`
    select b.verification_status, b.is_active, bm.membership_role, bm.membership_status,
           m.provider, m.external_business_id, m.business_id,
           a.evidence_reference, a.reviewed_by, a.reviewed_at
      from ghm.business b
      join ghm.business_membership bm on bm.business_id=b.id and bm.account_id=$2
      join ghm.business_external_mapping m on m.business_id=b.id
      join ghm.quoteflow_migration_business_provisioning_audit a on a.business_id=b.id and a.provider=m.provider and a.external_business_id=m.external_business_id
     where b.id=$1
  `, [businessId, ownerId]);
  assert.equal(state.rowCount, 1);
  assert.equal(state.rows[0].verification_status, 'pending');
  assert.equal(state.rows[0].is_active, false);
  assert.equal(state.rows[0].membership_role, 'owner');
  assert.equal(state.rows[0].membership_status, 'active');
  assert.equal(state.rows[0].provider, provider);
  assert.equal(state.rows[0].external_business_id, sourceIds[0]);
  assert.equal(Number(state.rows[0].business_id), businessId);
  assert.equal(state.rows[0].evidence_reference, evidenceReference());
  assert.equal(state.rows[0].reviewed_by, 'synthetic-qualification-reviewer');
  assert.equal(new Date(state.rows[0].reviewed_at).toISOString(), reviewedAt.toISOString());

  const retry = await provision(sourceIds[0], 'Ignored Retry Name', `${slugBase}-fresh`);
  assert.equal(retry.rows[0].outcome, 'already_provisioned');
  assert.equal(Number(retry.rows[0].business_id), businessId);
  assert.equal(Number(retry.rows[0].owner_membership_id), membershipId);

  const ownerConflict = await provision(sourceIds[0], 'Synthetic QuoteFlow Business', `${slugBase}-fresh`, alternateOwnerId);
  assert.equal(ownerConflict.rows[0].outcome, 'conflict');
  assert.equal(ownerConflict.rows[0].reason_code, 'EXISTING_MAPPING_NOT_AUDITED_FOR_OWNER');

  const slugConflict = await provision(sourceIds[1], 'Different Synthetic Business', `${slugBase}-fresh`);
  assert.equal(slugConflict.rows[0].outcome, 'conflict');
  assert.equal(slugConflict.rows[0].reason_code, 'BUSINESS_SLUG_COLLISION');

  const disabled = await provision(sourceIds[2], 'Disabled Owner Business', `${slugBase}-disabled`, disabledOwnerId);
  assert.equal(disabled.rows[0].outcome, 'blocked');
  assert.equal(disabled.rows[0].reason_code, 'OWNER_ACCOUNT_NOT_ELIGIBLE');

  const nonBusinessRole = await provision(sourceIds[2], 'Customer Role Owner Business', `${slugBase}-customer-role`, alternateOwnerId);
  assert.equal(nonBusinessRole.rows[0].outcome, 'blocked');
  assert.equal(nonBusinessRole.rows[0].reason_code, 'OWNER_ACCOUNT_NOT_ELIGIBLE');

  const invalidProvider = await provision(sourceIds[2], 'Invalid Provider Business', `${slugBase}-provider`, ownerId, 'not-supabase');
  assert.equal(invalidProvider.rows[0].outcome, 'blocked');
  assert.equal(invalidProvider.rows[0].reason_code, 'SOURCE_PROVIDER_NOT_ALLOWED');

  const concurrent = await Promise.all(Array.from({ length: 4 }, () =>
    provision(sourceIds[3], 'Concurrent Synthetic Business', `${slugBase}-concurrent`)));
  assert.equal(concurrent.filter(x => x.rows[0].outcome === 'created').length, 1);
  assert.equal(concurrent.filter(x => x.rows[0].outcome === 'already_provisioned').length, 3);
  assert.equal(new Set(concurrent.map(x => String(x.rows[0].business_id))).size, 1);
  businessIds.add(Number(concurrent[0].rows[0].business_id));

  await migrator.query('begin');
  const rolled = await provision(`qualify-quoteflow-org-rollback-${runId}`, 'Rollback Synthetic Business', `${slugBase}-rollback`);
  assert.equal(rolled.rows[0].outcome, 'created');
  const rollbackBusinessId = Number(rolled.rows[0].business_id);
  await migrator.query('rollback');
  const rollbackCheck = await migrator.query(`
    select
      (select count(*)::int from ghm.business where id=$1) as business_count,
      (select count(*)::int from ghm.business_membership where id=$2) as membership_count,
      (select count(*)::int from ghm.business_external_mapping where provider=$3 and external_business_id=$4) as mapping_count,
      (select count(*)::int from ghm.quoteflow_migration_business_provisioning_audit where provider=$3 and external_business_id=$4) as audit_count
  `, [rollbackBusinessId, Number(rolled.rows[0].owner_membership_id), provider, `qualify-quoteflow-org-rollback-${runId}`]);
  assert.deepEqual(rollbackCheck.rows[0], { business_count: 0, membership_count: 0, mapping_count: 0, audit_count: 0 });

  console.log('QuoteFlow migration Business provisioning DB qualification: PASS');
  console.log(JSON.stringify({
    checks: ['fresh atomic provision', 'inactive/pending Business', 'active owner membership', 'exact provenance mapping',
      'durable review evidence', 'idempotent retry', 'alternate-owner conflict', 'slug collision fail-closed',
      'disabled owner blocked', 'non-business owner role blocked', 'invalid provider blocked', 'four-way concurrency', 'transaction rollback',
      'runtime cannot execute provisioning or write mapping/audit; migration role can execute'],
    created_businesses: businessIds.size,
    mutation_scope: 'synthetic qualification records only',
  }, null, 2));
} finally {
  if (ownerId !== undefined) {
    await migrator.query('begin').catch(() => {});
    await migrator.query('set local role ghm_schema_owner').catch(() => {});
    await migrator.query('delete from ghm.quoteflow_migration_business_provisioning_audit where provider=$1 and external_business_id like $2', [provider, `qualify-quoteflow-org-%${runId}%`]).catch(() => {});
    await migrator.query('delete from ghm.quoteflow_migration_business_provisioning_audit where provider=$1 and external_business_id like $2', [provider, `qualify-quoteflow-org-rollback-%${runId}`]).catch(() => {});
    await migrator.query('delete from ghm.business_external_mapping where provider=$1 and external_business_id like $2', [provider, `qualify-quoteflow-org-%${runId}%`]).catch(() => {});
    await migrator.query('delete from ghm.business_external_mapping where provider=$1 and external_business_id like $2', [provider, `qualify-quoteflow-org-rollback-%${runId}`]).catch(() => {});
    await migrator.query('delete from ghm.business_membership where account_id = any($1::bigint[]) or business_id in (select id from ghm.business where slug like $2)', [[ownerId, disabledOwnerId].filter(Boolean), `${slugBase}%`]).catch(() => {});
    await migrator.query('delete from ghm.business where slug like $1', [`${slugBase}%`]).catch(() => {});
    await migrator.query('delete from ghm.account_identity where id = any($1::bigint[])', [[ownerId, disabledOwnerId, alternateOwnerId].filter(Boolean)]).catch(() => {});
    await migrator.query('commit').catch(() => {});
  }
  await runtime.end().catch(() => {});
  await migrator.end().catch(() => {});
}
