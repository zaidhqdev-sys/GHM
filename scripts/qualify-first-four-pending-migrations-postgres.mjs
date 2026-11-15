import assert from 'node:assert/strict';
import { Pool } from 'pg';

if (process.env.NODE_ENV !== 'test') {
  throw new Error('First-prefix migration qualification is restricted to NODE_ENV=test');
}
const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
const expectedDatabase = process.env.GHM_QUALIFICATION_DATABASE_NAME;
const expectedHost = process.env.GHM_QUALIFICATION_DATABASE_HOST;
if (!runtimeUrl || !migratorUrl || runtimeUrl === migratorUrl ||
    expectedDatabase !== 'ghm_disposable_test' || expectedHost !== 'localhost') {
  throw new Error('Distinct disposable runtime/migrator URLs and localhost ghm_disposable_test are required');
}
for (const [label, value] of [['runtime', runtimeUrl], ['migrator', migratorUrl]]) {
  const parsed = new URL(value);
  if (parsed.hostname !== 'localhost' || parsed.pathname.slice(1) !== expectedDatabase) {
    throw new Error(`${label} connection is not the approved disposable PostgreSQL target`);
  }
}
const runtime = new Pool({ connectionString: runtimeUrl, ssl: false });
const migrator = new Pool({ connectionString: migratorUrl, ssl: false });
const expectPrivilege = async (client, role, object, privilege, expected) => {
  const result = await client.query(
    'SELECT has_table_privilege($1, $2, $3) AS allowed',
    [role, object, privilege],
  );
  assert.equal(result.rows[0]?.allowed, expected, `${role} ${privilege} on ${object}`);
};
try {
  const identity = await runtime.query('SELECT current_database() AS db, session_user, current_user');
  assert.deepEqual(identity.rows[0], {
    db: expectedDatabase, session_user: 'ghm_runtime', current_user: 'ghm_runtime',
  });

  // Migration 2: onboarding table is runtime read/insert/update only.
  for (const privilege of ['SELECT', 'INSERT', 'UPDATE']) {
    await expectPrivilege(runtime, 'ghm_runtime', 'ghm.account_onboarding_progress', privilege, true);
  }
  for (const privilege of ['DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
    await expectPrivilege(runtime, 'ghm_runtime', 'ghm.account_onboarding_progress', privilege, false);
  }
  const onboardingSequence = await runtime.query(
    "SELECT has_sequence_privilege('ghm_runtime', 'ghm.account_onboarding_progress_id_seq', 'USAGE') AS usage, has_sequence_privilege('ghm_runtime', 'ghm.account_onboarding_progress_id_seq', 'SELECT') AS select",
  );
  assert.deepEqual(onboardingSequence.rows[0], { usage: true, select: true });
  const onboardingConstraints = await migrator.query(
    "SELECT conname FROM pg_constraint WHERE conrelid = 'ghm.account_onboarding_progress'::regclass AND convalidated",
  );
  for (const name of [
    'account_onboarding_progress_identity_unique',
    'account_onboarding_progress_journey_valid',
    'account_onboarding_progress_step_valid',
    'account_onboarding_progress_status_valid',
    'account_onboarding_progress_lifecycle_valid',
    'account_onboarding_progress_time_valid',
  ]) assert.ok(onboardingConstraints.rows.some(row => row.conname === name), `missing validated onboarding constraint ${name}`);
  console.log('MIGRATION 2 ONBOARDING EFFECTIVE ACLS + VALIDATED CONSTRAINTS: PASS');

  // Migration 3: relationship/outcome projections are SELECT-only for runtime.
  for (const table of [
    'ghm.relationship_type', 'ghm.business_relationship', 'ghm.outcome_type', 'ghm.outcome',
  ]) {
    await expectPrivilege(runtime, 'ghm_runtime', table, 'SELECT', true);
    for (const privilege of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
      await expectPrivilege(runtime, 'ghm_runtime', table, privilege, false);
    }
  }
  const seeds = await migrator.query(`
    SELECT
      (SELECT count(*)::int FROM ghm.relationship_type WHERE code IN ('supplier','customer','partner','subcontractor','referral') AND version = 1) AS relationship_seed_count,
      (SELECT count(*)::int FROM ghm.outcome_type WHERE code IN ('response','acceptance','completion','cancellation','dispute','repeat_engagement') AND version = 1) AS outcome_seed_count
  `);
  assert.equal(seeds.rows[0].relationship_seed_count, 5);
  assert.equal(seeds.rows[0].outcome_seed_count, 6);
  const modelConstraints = await migrator.query(`
    SELECT conrelid::regclass::text AS table_name, conname
      FROM pg_constraint
     WHERE conrelid IN (
       'ghm.relationship_type'::regclass,
       'ghm.business_relationship'::regclass,
       'ghm.outcome_type'::regclass,
       'ghm.outcome'::regclass
     ) AND convalidated
  `);
  for (const name of [
    'business_relationship_distinct_businesses',
    'business_relationship_lifecycle_status_check',
    'business_relationship_provenance_type_check',
    'business_relationship_authority_type_check',
    'business_relationship_verification_status_check',
    'business_relationship_visibility_check',
    'business_relationship_valid_range_check',
    'business_relationship_metadata_object',
    'outcome_has_subject_context',
    'outcome_assertion_source_check',
    'outcome_verification_status_check',
    'outcome_lifecycle_status_check',
    'outcome_visibility_check',
    'outcome_metadata_object',
  ]) assert.ok(modelConstraints.rows.some(row => row.conname === name), `missing validated relationship/outcome constraint ${name}`);
  console.log('MIGRATION 3 READ-ONLY EFFECTIVE ACLS + SEED DATA + VALIDATED CONSTRAINTS: PASS');

  // Migration 4: inspect every existing disposable storage row against the new lifecycle predicate.
  const storage = await migrator.query(`
    SELECT status, count(*)::int AS row_count,
           count(*) FILTER (WHERE NOT (
             (status = 'pending' AND available_at IS NULL AND deleted_at IS NULL)
             OR (status = 'available' AND available_at IS NOT NULL AND deleted_at IS NULL)
             OR (status = 'deletion_pending' AND deleted_at IS NULL)
             OR (status = 'deleted' AND deleted_at IS NOT NULL)
           ))::int AS invalid_count
      FROM ghm.storage_object
     GROUP BY status ORDER BY status
  `);
  assert.ok(storage.rows.every(row => row.invalid_count === 0), 'existing storage rows violate the new lifecycle predicate');
  const storageConstraint = await migrator.query(`
    SELECT c.convalidated, pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c
     WHERE c.conrelid = 'ghm.storage_object'::regclass
       AND c.conname = 'storage_object_lifecycle_check'
  `);
  assert.equal(storageConstraint.rows.length, 1, 'expected exactly one storage lifecycle constraint');
  assert.equal(storageConstraint.rows[0].convalidated, true);
  assert.match(storageConstraint.rows[0].definition, /deletion_pending/);
  const fn = await migrator.query(`
    SELECT p.prosecdef, pg_get_userbyid(p.proowner) AS owner,
           p.proconfig, has_function_privilege('ghm_runtime', p.oid, 'EXECUTE') AS runtime_execute
      FROM pg_proc p
     WHERE p.oid = 'ghm.storage_mark_deletion_pending(bigint)'::regprocedure
  `);
  assert.equal(fn.rows.length, 1);
  assert.equal(fn.rows[0].prosecdef, true);
  assert.equal(fn.rows[0].owner, 'ghm_schema_owner');
  assert.equal(fn.rows[0].runtime_execute, true);
  assert.ok((fn.rows[0].proconfig ?? []).some(value => value.includes('search_path=pg_catalog, ghm')));
  console.log('MIGRATION 4 STORAGE ROW COMPATIBILITY + VALIDATED CONSTRAINT + FUNCTION ACL: PASS');
  console.log('DISPOSABLE FIRST-FOUR MIGRATION POST-APPLY QUALIFICATION: PASS');
} finally {
  await Promise.all([runtime.end(), migrator.end()]);
}
