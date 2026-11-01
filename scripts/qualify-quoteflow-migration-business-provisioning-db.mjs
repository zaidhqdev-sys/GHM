import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import 'dotenv/config';

// This script is intentionally rollback-only and must never target production.
// It is source-only until a separate approval explicitly authorizes its execution.
const acknowledgement = 'I_HAVE_CONFIRMED_ISOLATED_NON_PRODUCTION';
assert.equal(process.env.GHM_BUSINESS_QUALIFICATION_ACK, acknowledgement,
  'Explicit isolated-database qualification acknowledgement is required');
assert.equal(process.env.GHM_BUSINESS_QUALIFICATION_DATABASE, 'ghm_qualification',
  'Qualification database name must be exactly ghm_qualification');
assert.equal(process.env.DATABASE_SSL, 'true',
  'Strict TLS is required for database qualification');
const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
const ownerAccountId = Number(process.env.GHM_BUSINESS_QUALIFICATION_OWNER_ACCOUNT_ID);
assert(runtimeUrl && migratorUrl, 'Runtime and migrator URLs are required');
assert.notEqual(runtimeUrl, migratorUrl, 'Runtime and migrator URLs must be distinct');
assert(Number.isSafeInteger(ownerAccountId) && ownerAccountId > 0,
  'A pre-existing synthetic active business-role owner account ID is required');

const ssl = { rejectUnauthorized: true };
const runtime = new Client({ connectionString: runtimeUrl, ssl });
const migrator = new Client({ connectionString: migratorUrl, ssl });
const runId = randomUUID();
const sourceId = `qualification-${runId}`;
const slug = `qualification-${runId}`;
const evidence = `qualification/${runId}`;
const reviewer = 'isolated-db-qualification';
const reviewedAt = new Date('2026-10-31T12:00:00.000Z');

try {
  await runtime.connect();
  await migrator.connect();

  const runtimeIdentity = await runtime.query(
    'select current_database() as database_name, current_user as role_name',
  );
  assert.equal(runtimeIdentity.rows[0].database_name, 'ghm_qualification');
  assert.equal(runtimeIdentity.rows[0].role_name, 'ghm_runtime');

  const runtimePrivileges = await runtime.query(`
    select
      has_function_privilege(current_user,
        'ghm.auth_provision_quoteflow_migration_business(text,text,text,text,bigint,text,text,timestamptz)', 'EXECUTE') can_execute,
      has_table_privilege(current_user, 'ghm.business_external_mapping', 'INSERT') can_insert_mapping,
      has_table_privilege(current_user, 'ghm.business_external_mapping', 'UPDATE') can_update_mapping,
      has_table_privilege(current_user, 'ghm.business_external_mapping', 'DELETE') can_delete_mapping
  `);
  assert.deepEqual(runtimePrivileges.rows[0], {
    can_execute: false,
    can_insert_mapping: false,
    can_update_mapping: false,
    can_delete_mapping: false,
  });

  await migrator.query('begin');
  const migratorIdentity = await migrator.query(
    'select current_database() as database_name, current_user as login_role',
  );
  assert.equal(migratorIdentity.rows[0].database_name, 'ghm_qualification');
  assert.equal(migratorIdentity.rows[0].login_role, 'ghm_migrator');
  await migrator.query('set local role ghm_schema_owner');

  const owner = await migrator.query(
    "select id from ghm.account_identity where id=$1 and account_status='active' and role='business'",
    [ownerAccountId],
  );
  assert.equal(owner.rowCount, 1, 'Configured fixture owner must already be active and have business role');

  const definition = await migrator.query(
    "select pg_get_functiondef('ghm.auth_provision_quoteflow_migration_business(text,text,text,text,bigint,text,text,timestamptz)'::regprocedure) as definition",
  );
  assert.match(definition.rows[0].definition, /SECURITY DEFINER/i);
  assert.match(definition.rows[0].definition, /pg_advisory_xact_lock/i);
  assert.match(definition.rows[0].definition, /INSERT INTO ghm\.business_membership/i);
  assert.match(definition.rows[0].definition, /INSERT INTO ghm\.business_external_mapping/i);
  assert.match(definition.rows[0].definition, /INSERT INTO ghm\.quoteflow_migration_business_provisioning_audit/i);

  const args = [
    'supabase', sourceId, 'Qualification Business', slug, ownerAccountId,
    evidence, reviewer, reviewedAt,
  ];
  const first = await migrator.query(
    'select * from ghm.auth_provision_quoteflow_migration_business($1,$2,$3,$4,$5,$6,$7,$8)',
    args,
  );
  assert.equal(first.rowCount, 1);
  assert.equal(first.rows[0].outcome, 'created');
  const businessId = String(first.rows[0].business_id);
  const membershipId = String(first.rows[0].owner_membership_id);
  assert(businessId !== 'null' && membershipId !== 'null');

  const state = await migrator.query(`
    select b.verification_status, b.is_active,
           bm.membership_role, bm.membership_status, bm.account_id,
           m.provider, m.external_business_id, m.business_id,
           a.owner_account_id, a.evidence_reference, a.reviewed_by, a.reviewed_at
      from ghm.business b
      join ghm.business_membership bm on bm.business_id=b.id
      join ghm.business_external_mapping m on m.business_id=b.id
      join ghm.quoteflow_migration_business_provisioning_audit a
        on a.business_id=b.id and a.provider=m.provider
       and a.external_business_id=m.external_business_id
     where b.id=$1
  `, [businessId]);
  assert.equal(state.rowCount, 1);
  assert.deepEqual(state.rows[0], {
    verification_status: 'unverified',
    is_active: false,
    membership_role: 'owner',
    membership_status: 'active',
    account_id: String(ownerAccountId),
    provider: 'supabase',
    external_business_id: sourceId,
    business_id: businessId,
    owner_account_id: String(ownerAccountId),
    evidence_reference: evidence,
    reviewed_by: reviewer,
    reviewed_at: reviewedAt,
  });

  const retry = await migrator.query(
    'select * from ghm.auth_provision_quoteflow_migration_business($1,$2,$3,$4,$5,$6,$7,$8)',
    args,
  );
  assert.equal(retry.rows[0].outcome, 'already_provisioned');
  assert.equal(String(retry.rows[0].business_id), businessId);
  assert.equal(String(retry.rows[0].owner_membership_id), membershipId);

  const evidenceConflict = await migrator.query(
    'select * from ghm.auth_provision_quoteflow_migration_business($1,$2,$3,$4,$5,$6,$7,$8)',
    ['supabase', sourceId, 'Qualification Business', slug, ownerAccountId, 'different-evidence', reviewer, reviewedAt],
  );
  assert.equal(evidenceConflict.rows[0].outcome, 'conflict');
  assert.equal(evidenceConflict.rows[0].reason_code, 'EXISTING_PROVISIONING_EVIDENCE_MISMATCH');

  const missingOwner = await migrator.query(
    'select * from ghm.auth_provision_quoteflow_migration_business($1,$2,$3,$4,$5,$6,$7,$8)',
    ['supabase', `missing-${runId}`, 'Missing Owner', `missing-${slug}`, 9223372036854775807n.toString(), evidence, reviewer, reviewedAt],
  );
  assert.equal(missingOwner.rows[0].outcome, 'blocked');
  assert.equal(missingOwner.rows[0].reason_code, 'OWNER_ACCOUNT_NOT_ELIGIBLE');

  const invalidProvider = await migrator.query(
    'select * from ghm.auth_provision_quoteflow_migration_business($1,$2,$3,$4,$5,$6,$7,$8)',
    ['not-supabase', `provider-${runId}`, 'Invalid Provider', `provider-${slug}`, ownerAccountId, evidence, reviewer, reviewedAt],
  );
  assert.equal(invalidProvider.rows[0].outcome, 'blocked');
  assert.equal(invalidProvider.rows[0].reason_code, 'SOURCE_PROVIDER_NOT_ALLOWED');

  const slugConflict = await migrator.query(
    'select * from ghm.auth_provision_quoteflow_migration_business($1,$2,$3,$4,$5,$6,$7,$8)',
    ['supabase', `slug-${runId}`, 'Slug Collision', slug, ownerAccountId, evidence, reviewer, reviewedAt],
  );
  assert.equal(slugConflict.rows[0].outcome, 'conflict');
  assert.equal(slugConflict.rows[0].reason_code, 'BUSINESS_SLUG_COLLISION');

  const auditCount = await migrator.query(
    'select count(*)::int as count from ghm.quoteflow_migration_business_provisioning_audit where provider=$1 and external_business_id=$2',
    ['supabase', sourceId],
  );
  assert.equal(auditCount.rows[0].count, 1);

  await migrator.query('rollback');
  await migrator.query('begin');
  await migrator.query('set local role ghm_schema_owner');
  const afterRollback = await migrator.query(
    'select (select count(*) from ghm.business_external_mapping where provider=$1 and external_business_id=$2) as mapping_count, (select count(*) from ghm.business where slug=$3) as business_count, (select count(*) from ghm.quoteflow_migration_business_provisioning_audit where provider=$1 and external_business_id=$2) as audit_count',
    ['supabase', sourceId, slug],
  );
  assert.deepEqual(afterRollback.rows[0], { mapping_count: '0', business_count: '0', audit_count: '0' });
  await migrator.query('commit');

  console.log('QuoteFlow Business provisioning isolated DB qualification: PASS');
  console.log(JSON.stringify({
    database: 'ghm_qualification',
    owner_fixture: ownerAccountId,
    checks: ['runtime execute and direct-DML denied', 'schema-owner execution', 'fresh provisioning',
      'inactive unverified Business', 'exact owner and provenance audit', 'exact retry',
      'evidence mismatch conflict', 'missing owner blocked', 'invalid provider blocked',
      'slug collision conflict against the in-transaction fixture Business', 'full transaction rollback'],
    concurrency: 'NOT TESTED',
    committed_mutations: false,
  }, null, 2));
} catch (error) {
  await migrator.query('rollback').catch(() => {});
  throw error;
} finally {
  await runtime.end().catch(() => {});
  await migrator.end().catch(() => {});
}
