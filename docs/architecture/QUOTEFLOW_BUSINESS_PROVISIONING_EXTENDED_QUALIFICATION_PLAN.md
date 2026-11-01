# QuoteFlow Business Provisioning — Extended Qualification Plan

> **Status:** IMPLEMENTED AS SOURCE-ONLY TEST HARNESS; NOT EXECUTED. The user has separately authorized qualification against a disposable, isolated, non-production database named `ghm_qualification`. No database connection, migration, fixture creation, or mutation has been performed by this assistant. Production, founder-owned accounts, and the original integration branch remain out of scope.

## Scope and invariant

Qualify only `ghm.auth_provision_quoteflow_migration_business` from migration `20261020130000` as reconciled by `20261020140000`. Keep the production service, production database, founder-owned accounts, and original integration branch out of scope.

The existing `qualify-quoteflow-migration-business-provisioning-db.mjs` remains a single-transaction, rollback-only test. Do not silently add a test that commits rows to it: its `committed_mutations: false` claim must remain true.

Two separate scripts implement the extended tests:

- Test A: `scripts/qualify-quoteflow-migration-business-provisioning-atomicity-db.mjs` — rollback-only; installs a temporary audit trigger and function inside a transaction.
- Test B: `scripts/qualify-quoteflow-migration-business-provisioning-concurrency-db.mjs` — commit-bearing; requires explicit discard acknowledgement and a disposable database that will be discarded/recreated immediately after the test, including on failure.

Both scripts are source-only until run by the user in the isolated qualification environment. They require strict TLS and verify the database name and migrator login. They do not print connection strings or credentials.

## Gate 0 — isolated fixture

Before execution:

- Provision a disposable database named exactly `ghm_qualification`, not a shared sandbox and never production.
- Apply the required migration chain only to that disposable database. Confirm the target database before every migration operation.
- Create one synthetic `ghm.account_identity` fixture with `account_status='active'` and `role='business'`; record its numeric ID.
- Provide a distinct `ghm_migrator` connection identity and strict TLS certificate validation. The rollback-only baseline script additionally uses a separate `ghm_runtime` connection identity to verify runtime denials.
- Confirm the database can be discarded/recreated after testing. Do not use either founder-owned source account as a fixture.
- Keep secrets out of logs and pasted terminal output.
- Do not use a shared sandbox. Test B commits real rows and the database must be discarded/recreated even if the script reports failure.

Required environment for Test A and Test B:

- `GHM_BUSINESS_QUALIFICATION_ACK=I_HAVE_CONFIRMED_ISOLATED_NON_PRODUCTION`
- `GHM_BUSINESS_QUALIFICATION_DATABASE=ghm_qualification`
- `DATABASE_SSL=true`
- `GHM_MIGRATOR_DATABASE_URL` — connection string for login role `ghm_migrator`
- `GHM_BUSINESS_QUALIFICATION_OWNER_ACCOUNT_ID` — numeric ID of the synthetic active business-role fixture
- `GHM_BUSINESS_QUALIFICATION_OWNER_IS_SYNTHETIC=YES`

Test B additionally requires:

- `GHM_BUSINESS_QUALIFICATION_DISCARD_ACK=DISCARD_GHM_QUALIFICATION_AFTER_TEST_B`

The scripts use `rejectUnauthorized: true`. Do not weaken TLS to make a connection succeed.

## Test A — forced mid-write failure / atomicity

Purpose: prove that an error after earlier inserts does not leave a partial Business, owner membership, external mapping, or audit record.

1. Use a unique synthetic source ID and slug in the disposable database.
2. In a transaction owned by `ghm_schema_owner`, install a temporary test-only trigger on the provisioning audit table. Its trigger function raises a deliberate, recognizable exception only for that synthetic source ID. The trigger and function are created inside the transaction and must never be installed in a shared or production database.
3. Call the provisioning function with valid provider, owner, evidence, and review data. The failure must occur at the audit insert, after the Business, membership, and external mapping insert statements have been reached.
4. Catch the expected exception at a savepoint boundary; roll back to that savepoint so the test transaction can continue. Do not treat a returned `blocked` or `conflict` outcome as a successful atomicity test.
5. While still in the outer transaction, query by the synthetic slug/source ID and assert zero rows in all four resources: `ghm.business`, `ghm.business_membership`, `ghm.business_external_mapping`, and `ghm.quoteflow_migration_business_provisioning_audit`.
6. Roll back the outer transaction. Verify the test trigger/function did not persist.

Pass criteria: the injected error is observed at the audit stage and no partial resource rows remain. If the trigger does not fire, the failure occurs before the intended stage, or any row remains, mark FAIL and stop.

Implementation note: this test exercises a non-`unique_violation` exception. The function's nested exception block explicitly handles `unique_violation`; other exceptions should propagate while PostgreSQL rolls back the nested PL/pgSQL subtransaction. Confirm this behavior on the disposable database rather than assuming the source text alone proves it.

## Test B — two-session idempotency under contention

Purpose: prove that concurrent calls for the same exact source organization and canonical slug serialize and leave exactly one provisioned Business and owner membership.

This test necessarily commits the winner transaction so the waiting session can observe its committed mapping. It MUST NOT be added to the rollback-only script.

1. Use a fresh disposable database (or a disposable database snapshot dedicated to this test) with the synthetic owner fixture.
2. Open two independent migrator sessions. Verify both are connected to `ghm_qualification` as `ghm_migrator`; set `ROLE ghm_schema_owner` locally in each transaction.
3. Session A begins a transaction and calls the function with one unique set of exact inputs. Confirm `created`, then hold the transaction open without committing.
4. Session B begins and calls the function with exactly the same source provider, source ID, Business name, slug, owner ID, evidence, reviewer, and timestamp. The script polls `pg_stat_activity` and requires direct evidence that B is waiting on an advisory lock; elapsed time alone is not accepted as proof.
5. Commit Session A. Session B must then complete with `already_provisioned`, returning the same Business and owner-membership IDs.
6. Verify exactly one Business, one active owner membership for the fixture account, one mapping, and one audit row exist for the source key. Verify the audit evidence matches exactly.
7. Discard/recreate the disposable database after the test, even if the test fails. Do not rely on cleanup DELETE as the primary safety boundary for this committed concurrency test.

Pass criteria: Session A returns `created`; Session B returns `already_provisioned`; both return the same IDs; each resource has exactly one row; there is exactly one active owner membership; PostgreSQL reports Session B waiting on an advisory lock before Session A commits.

Failure handling: if Session B returns `created`, a conflicting result, different IDs, duplicate rows, or no observable advisory-lock wait, mark FAIL and stop. If Test B has committed Session A's transaction, discard/recreate the entire qualification database; do not reuse it.

## Execution order

1. Confirm the isolated database and synthetic fixture; apply the required migrations only there.
2. Run the existing rollback-only qualification script.
3. Run Test A:
   `node scripts/qualify-quoteflow-migration-business-provisioning-atomicity-db.mjs`
4. If Test A passes, run Test B only after confirming the discard acknowledgement and ability to recreate the database:
   `node scripts/qualify-quoteflow-migration-business-provisioning-concurrency-db.mjs`
5. Immediately discard/recreate `ghm_qualification` after Test B, whether it passes or fails.
6. Preserve sanitized complete output, SQLSTATE, and lock-wait evidence. Never paste credentials or full connection strings.

## Separation from existing qualification

- The existing rollback-only script may continue to test permissions, ordinary creation, exact retry within one transaction, evidence mismatch, invalid owner/provider, slug collision, and full transaction rollback.
- Test A is a separate rollback-only atomicity exercise that requires temporary test DDL.
- Test B is a separate commit-bearing concurrency exercise on a disposable database. Its database must be discarded after the run.
- Concurrency is not proven by the existing single-session script or by static inspection of `pg_advisory_xact_lock`.
- No result may be described as database-qualified until the corresponding approved test has actually run and its complete output has been reviewed.

## Authorization boundary

The user has explicitly authorized qualification against the disposable, isolated, non-production `ghm_qualification` database, including required migrations and Tests A and B. That authorization does not extend to production, founder-owned accounts, the original integration branch, deployment, merge, or PR creation. Do not connect to a different database or weaken the database-name, role, fixture, TLS, or discard guards.
