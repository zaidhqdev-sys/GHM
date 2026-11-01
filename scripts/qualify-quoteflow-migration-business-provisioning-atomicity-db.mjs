import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import 'dotenv/config';

// Separate rollback-only atomicity exercise. This installs test-only DDL inside
// one transaction and rolls the trigger, function, and all test work back.
assert.equal(process.env.GHM_BUSINESS_QUALIFICATION_ACK, 'I_HAVE_CONFIRMED_ISOLATED_NON_PRODUCTION',
  'Explicit isolated-database qualification acknowledgement is required');
assert.equal(process.env.GHM_BUSINESS_QUALIFICATION_DATABASE, 'ghm_qualification',
  'Database name must be exactly ghm_qualification');
assert.equal(process.env.DATABASE_SSL, 'true', 'Strict TLS is required');
assert.equal(process.env.GHM_BUSINESS_QUALIFICATION_OWNER_IS_SYNTHETIC, 'YES',
  'The configured owner must be a synthetic qualification fixture');
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
const ownerAccountId = Number(process.env.GHM_BUSINESS_QUALIFICATION_OWNER_ACCOUNT_ID);
assert(migratorUrl, 'Migrator connection URL is required');
assert(Number.isSafeInteger(ownerAccountId) && ownerAccountId > 0,
  'A synthetic active business-role owner account ID is required');

const client = new Client({ connectionString: migratorUrl, ssl: { rejectUnauthorized: true } });
const runId = randomUUID().replaceAll('-', '');
const sourceId = `atomicity-${runId}`;
const slug = `atomicity-${runId}`;
const functionName = `__qualify_audit_failure_${runId}`;
const triggerName = `__qualify_audit_failure_${runId}`;
const evidence = `qualification/atomicity/${runId}`;
const reviewer = 'isolated-db-qualification';
const reviewedAt = new Date('2026-10-31T12:00:00.000Z');
let outerTransactionOpen = false;

try {
  await client.connect();
  const identity = await client.query(
    'select current_database() as database_name, current_user as login_role',
  );
  assert.equal(identity.rows[0].database_name, 'ghm_qualification');
  assert.equal(identity.rows[0].login_role, 'ghm_migrator');

  await client.query('begin');
  outerTransactionOpen = true;
  await client.query('set local role ghm_schema_owner');

  const owner = await client.query(
    "select id from ghm.account_identity where id=$1 and account_status='active' and role='business'",
    [ownerAccountId],
  );
  assert.equal(owner.rowCount, 1, 'Synthetic owner fixture must be active with business role');

  // runId is generated locally from hex characters; all dynamic identifiers
  // and the injected source key therefore contain only safe identifier/text characters.
  await client.query(`
    create function ghm.${functionName}() returns trigger
    language plpgsql
    as $body$
    begin
      if new.provider = 'supabase' and new.external_business_id = '${sourceId}' then
        raise exception 'qualification injected audit failure' using errcode = 'P0001';
      end if;
      return new;
    end;
    $body$;
  `);
  await client.query(`
    create trigger ${triggerName}
    before insert on ghm.quoteflow_migration_business_provisioning_audit
    for each row execute function ghm.${functionName}()
  `);

  await client.query('savepoint provisioning_attempt');
  let injectedFailure;
  try {
    await client.query(
      'select * from ghm.auth_provision_quoteflow_migration_business($1,$2,$3,$4,$5,$6,$7,$8)',
      ['supabase', sourceId, 'Atomicity Qualification Business', slug, ownerAccountId,
        evidence, reviewer, reviewedAt],
    );
  } catch (error) {
    injectedFailure = error;
  }

  assert(injectedFailure, 'Provisioning unexpectedly succeeded; injected audit failure did not fire');
  assert.equal(injectedFailure.code, 'P0001', 'Expected the deliberate non-unique exception SQLSTATE');
  assert.match(injectedFailure.message, /qualification injected audit failure/,
    'Failure must originate from the audit trigger, after earlier insert statements');

  await client.query('rollback to savepoint provisioning_attempt');

  const partialRows = await client.query(`
    select
      (select count(*)::int from ghm.business where slug=$1) as business_count,
      (select count(*)::int from ghm.business_membership bm
         join ghm.business b on b.id=bm.business_id where b.slug=$1) as membership_count,
      (select count(*)::int from ghm.business_external_mapping
         where provider='supabase' and external_business_id=$2) as mapping_count,
      (select count(*)::int from ghm.quoteflow_migration_business_provisioning_audit
         where provider='supabase' and external_business_id=$2) as audit_count
  `, [slug, sourceId]);
  assert.deepEqual(partialRows.rows[0], {
    business_count: 0,
    membership_count: 0,
    mapping_count: 0,
    audit_count: 0,
  }, 'A propagated non-unique exception must roll back all earlier provisioning writes');

  await client.query('rollback');
  outerTransactionOpen = false;

  const artifacts = await client.query(`
    select
      to_regprocedure($1) is not null as function_persisted,
      exists (select 1 from pg_trigger where tgname=$2 and not tgisinternal) as trigger_persisted
  `, [`ghm.${functionName}()`, triggerName]);
  assert.deepEqual(artifacts.rows[0], {
    function_persisted: false,
    trigger_persisted: false,
  }, 'Test-only trigger/function must not persist after outer rollback');

  console.log('QuoteFlow Business provisioning Test A (forced mid-write atomicity): PASS');
  console.log(JSON.stringify({
    database: 'ghm_qualification',
    failure_stage: 'audit insert trigger',
    sqlstate: injectedFailure.code,
    resources_without_partial_rows: ['ghm.business', 'ghm.business_membership',
      'ghm.business_external_mapping', 'ghm.quoteflow_migration_business_provisioning_audit'],
    test_ddl_persisted: false,
    committed_mutations: false,
  }, null, 2));
} catch (error) {
  if (outerTransactionOpen) await client.query('rollback').catch(() => {});
  throw error;
} finally {
  await client.end().catch(() => {});
}
