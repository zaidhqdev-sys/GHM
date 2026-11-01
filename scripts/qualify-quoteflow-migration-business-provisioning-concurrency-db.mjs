import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import 'dotenv/config';

// Commit-bearing concurrency test. Run only against a disposable database that
// will be discarded/recreated immediately after the test, including on failure.
assert.equal(process.env.GHM_BUSINESS_QUALIFICATION_ACK, 'I_HAVE_CONFIRMED_ISOLATED_NON_PRODUCTION',
  'Explicit isolated-database qualification acknowledgement is required');
assert.equal(process.env.GHM_BUSINESS_QUALIFICATION_DATABASE, 'ghm_qualification',
  'Database name must be exactly ghm_qualification');
assert.equal(process.env.GHM_BUSINESS_QUALIFICATION_OWNER_IS_SYNTHETIC, 'YES',
  'The configured owner must be a synthetic qualification fixture');
assert.equal(process.env.GHM_BUSINESS_QUALIFICATION_DISCARD_ACK,
  'DISCARD_GHM_QUALIFICATION_AFTER_TEST_B',
  'Explicit acknowledgement to discard/recreate ghm_qualification after this commit-bearing test is required');
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
const ownerAccountId = Number(process.env.GHM_BUSINESS_QUALIFICATION_OWNER_ACCOUNT_ID);
assert(migratorUrl, 'Migrator connection URL is required');
assert(Number.isSafeInteger(ownerAccountId) && ownerAccountId > 0,
  'A synthetic active business-role owner account ID is required');

const ssl = { rejectUnauthorized: true };
const sessionA = new Client({ connectionString: migratorUrl, ssl });
const sessionB = new Client({ connectionString: migratorUrl, ssl });
const observer = new Client({ connectionString: migratorUrl, ssl });
const runId = randomUUID().replaceAll('-', '');
const sourceId = `concurrency-${runId}`;
const slug = `concurrency-${runId}`;
const evidence = `qualification/concurrency/${runId}`;
const reviewer = 'isolated-db-qualification';
const reviewedAt = new Date('2026-10-31T12:00:00.000Z');
const args = ['supabase', sourceId, 'Concurrency Qualification Business', slug,
  ownerAccountId, evidence, reviewer, reviewedAt];

let aOpen = false;
let bOpen = false;
let bQueryPromise;

try {
  await Promise.all([sessionA.connect(), sessionB.connect(), observer.connect()]);
  for (const client of [sessionA, sessionB, observer]) {
    const identity = await client.query(
      'select current_database() as database_name, current_user as login_role',
    );
    assert.equal(identity.rows[0].database_name, 'ghm_qualification');
    assert.equal(identity.rows[0].login_role, 'ghm_migrator');
  }

  await sessionA.query('begin');
  aOpen = true;
  await sessionA.query('set local role ghm_schema_owner');
  const ownerA = await sessionA.query(
    "select id from ghm.account_identity where id=$1 and account_status='active' and role='business'",
    [ownerAccountId],
  );
  assert.equal(ownerA.rowCount, 1, 'Synthetic owner fixture must be active with business role');

  const resultA = await sessionA.query(
    'select * from ghm.auth_provision_quoteflow_migration_business($1,$2,$3,$4,$5,$6,$7,$8)',
    args,
  );
  assert.equal(resultA.rowCount, 1);
  assert.equal(resultA.rows[0].outcome, 'created');
  const businessId = String(resultA.rows[0].business_id);
  const membershipId = String(resultA.rows[0].owner_membership_id);
  assert(businessId !== 'null' && membershipId !== 'null');

  // A remains uncommitted and retains the advisory transaction lock.
  await sessionB.query('begin');
  bOpen = true;
  await sessionB.query('set local role ghm_schema_owner');
  const ownerB = await sessionB.query(
    "select id from ghm.account_identity where id=$1 and account_status='active' and role='business'",
    [ownerAccountId],
  );
  assert.equal(ownerB.rowCount, 1);

  const backendB = await sessionB.query('select pg_backend_pid() as pid');
  const pidB = backendB.rows[0].pid;
  bQueryPromise = sessionB.query(
    'select * from ghm.auth_provision_quoteflow_migration_business($1,$2,$3,$4,$5,$6,$7,$8)',
    args,
  );

  // Require direct PostgreSQL evidence that B is blocked on an advisory lock;
  // polling is bounded, and elapsed time alone is never accepted as proof.
  let lockEvidence = null;
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const wait = await observer.query(`
      select pid, wait_event_type, wait_event, state, query
        from pg_stat_activity
       where pid=$1
    `, [pidB]);
    const row = wait.rows[0];
    if (row?.wait_event_type === 'Lock' && row?.wait_event === 'advisory') {
      lockEvidence = {
        pid: row.pid,
        wait_event_type: row.wait_event_type,
        wait_event: row.wait_event,
        state: row.state,
      };
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (!lockEvidence) {
    // Release A without committing. If B proceeds and creates in its own
    // transaction, roll B back; this timeout path must not leave rows behind.
    await sessionA.query('rollback');
    aOpen = false;
    const timedOutResult = await bQueryPromise;
    bQueryPromise = undefined;
    assert.fail(`No advisory-lock wait was observed; B returned ${JSON.stringify(timedOutResult.rows[0])}`);
  }

  await sessionA.query('commit');
  aOpen = false;

  const resultB = await bQueryPromise;
  bQueryPromise = undefined;
  assert.equal(resultB.rowCount, 1);
  assert.equal(resultB.rows[0].outcome, 'already_provisioned');
  assert.equal(String(resultB.rows[0].business_id), businessId);
  assert.equal(String(resultB.rows[0].owner_membership_id), membershipId);
  await sessionB.query('commit');
  bOpen = false;

  const counts = await observer.query(`
    select
      (select count(*)::int from ghm.business where slug=$1) as business_count,
      (select count(*)::int from ghm.business_membership bm
         join ghm.business b on b.id=bm.business_id
        where b.slug=$1 and bm.account_id=$2 and bm.membership_role='owner'
          and bm.membership_status='active') as active_owner_membership_count,
      (select count(*)::int from ghm.business_external_mapping
        where provider='supabase' and external_business_id=$3) as mapping_count,
      (select count(*)::int from ghm.quoteflow_migration_business_provisioning_audit
        where provider='supabase' and external_business_id=$3
          and business_id=$4 and owner_account_id=$2
          and evidence_reference=$5 and reviewed_by=$6 and reviewed_at=$7) as exact_audit_count
  `, [slug, ownerAccountId, sourceId, businessId, evidence, reviewer, reviewedAt]);

  assert.deepEqual(counts.rows[0], {
    business_count: 1,
    active_owner_membership_count: 1,
    mapping_count: 1,
    exact_audit_count: 1,
  });

  console.log('QuoteFlow Business provisioning Test B (two-session contention): PASS');
  console.log(JSON.stringify({
    database: 'ghm_qualification',
    session_a_outcome: 'created',
    session_b_outcome: 'already_provisioned',
    same_business_id: true,
    same_owner_membership_id: true,
    observed_lock_wait: lockEvidence,
    exact_resource_counts: counts.rows[0],
    committed_mutations: true,
    required_disposition: 'DISCARD AND RECREATE ghm_qualification immediately; do not reuse this database',
  }, null, 2));
} catch (error) {
  if (bOpen) await sessionB.query('rollback').catch(() => {});
  if (aOpen) await sessionA.query('rollback').catch(() => {});
  throw error;
} finally {
  await Promise.all([
    sessionA.end().catch(() => {}),
    sessionB.end().catch(() => {}),
    observer.end().catch(() => {}),
  ]);
}
