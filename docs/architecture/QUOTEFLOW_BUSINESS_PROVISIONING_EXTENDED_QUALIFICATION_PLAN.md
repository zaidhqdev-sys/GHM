# QuoteFlow Business Provisioning — Extended Qualification Plan

> **Status:** DESIGN ONLY. This plan has not been executed. It does not authorize a database connection, migration, or mutation. Any database exercise requires separate explicit approval and a disposable, isolated, non-production database.

## Scope and invariant

Qualify only `ghm.auth_provision_quoteflow_migration_business` from migration `20261020130000` as reconciled by `20261020140000`. Keep the production service, production database, founder-owned accounts, and original integration branch out of scope.

The existing `qualify-quoteflow-migration-business-provisioning-db.mjs` remains a single-transaction, rollback-only test. Do not silently add a test that commits rows to it: its `committed_mutations: false` claim must remain true.

## Gate 0 — isolated fixture

Before any execution is separately authorized:

- Provision a disposable database named exactly `ghm_qualification`, not a shared sandbox and never production.
- Apply the required migrations only to that disposable database under a separately approved plan.
- Create one synthetic `ghm.account_identity` fixture with `account_status='active'` and `role='business'`; record its numeric ID.
- Provide distinct `ghm_runtime` and `ghm_migrator` connection identities and strict TLS certificate validation.
- Confirm the database can be discarded/recreated after testing. Do not use either founder-owned source account as a fixture.
- Keep secrets out of logs and pasted terminal output.

## Test A — forced mid-write failure / atomicity

Purpose: prove that an error after earlier inserts does not leave a partial Business, owner membership, external mapping, or audit record.

1. Use a unique synthetic source ID and slug in the disposable database.
2. In a transaction owned by `ghm_schema_owner`, install a temporary test-only trigger on the provisioning audit table. Its trigger function raises a deliberate, recognizable exception only for that synthetic source ID. The trigger and function must be created inside the transaction and must never be installed in a shared or production database.
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
4. Session B begins and calls the function with exactly the same source provider, source ID, Business name, slug, owner ID, evidence, reviewer, and timestamp. Confirm it is waiting on the transaction-scoped advisory lock; do not use arbitrary sleeps as the sole proof of contention.
5. Commit Session A. Session B must then complete with `already_provisioned`, returning the same Business and owner-membership IDs.
6. Verify exactly one Business, one active owner membership for the fixture account, one mapping, and one audit row exist for the source key. Verify the audit evidence matches exactly.
7. Discard/recreate the disposable database after the test. Do not rely on a cleanup DELETE as the primary safety boundary for this committed concurrency test.

Pass criteria: Session A returns `created`; Session B returns `already_provisioned`; both return the same IDs; each resource has exactly one row; there is exactly one active owner membership.

Failure handling: if Session B returns `created`, a conflicting result, different IDs, or duplicate rows, mark FAIL and stop. Capture SQLSTATE and lock-wait evidence without logging connection strings or credentials.

## Separation from existing qualification

- The existing rollback-only script may continue to test permissions, ordinary creation, exact retry within one transaction, evidence mismatch, invalid owner/provider, slug collision, and full transaction rollback.
- Test A is a separate rollback-only atomicity exercise that requires temporary test DDL.
- Test B is a separate commit-bearing concurrency exercise on a disposable database. Its database must be discarded after the run.
- Concurrency is not proven by the existing single-session script or by static inspection of `pg_advisory_xact_lock`.
- No result may be described as database-qualified until the corresponding approved test has actually run and its complete output has been reviewed.

## Authorization boundary

This document is a test design only. It does not authorize setting qualification environment variables, connecting to any database, applying migrations, creating fixtures, running either test, or changing production. Obtain separate explicit authorization for isolated non-production database qualification before any such action.
