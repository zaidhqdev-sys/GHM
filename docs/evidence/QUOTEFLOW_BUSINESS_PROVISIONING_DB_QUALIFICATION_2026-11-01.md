# QuoteFlow Business Provisioning — isolated database qualification evidence

**Date:** 2026-11-01  
**Result:** QUALIFIED / PASS for the migration-backed provisioning function and the three database qualification scripts  
**Repository branch:** `reconciliation/ghm-identity-mainline-restored-20261031`  
**Source baseline:** `efe9168a616412c62fe5a4d38e6c0e180ce045c3`

## Scope and isolation

The user executed the qualification against a disposable, local PostgreSQL 18.6 cluster:

- Database: `ghm_qualification`
- Endpoint: `127.0.0.1:5440`
- TLS: certificate-verified connection (`sslmode=verify-full`; Node clients used `rejectUnauthorized: true`)
- Migration runner target guards: database `ghm_qualification`, host `127.0.0.1`
- Migration ledger: 91 applied migrations, from `00000000000000` through `20261101110000`
- Synthetic owner fixture: `ghm.account_identity.id = 1`, role `business`, status `active`, `is_system_admin=false`
- Separate database login roles: `ghm_migrator` and `ghm_runtime`; schema owner: `ghm_schema_owner`

No production database, founder-owned account, Render service, deployment, original integration branch, main branch, PR, or merge was involved.

## Results

| Stage | Result | Evidence |
|---|---|---|
| Baseline rollback-only qualification | **PASS** | Runtime execute/direct-DML denial; schema-owner execution; fresh provisioning; inactive/unverified Business; exact owner and provenance audit; exact retry; evidence mismatch conflict; missing owner and invalid provider blocked; slug collision conflict; full transaction rollback; `committed_mutations: false`. |
| Test A — forced mid-write atomicity | **PASS** | Deliberate audit-trigger exception SQLSTATE `P0001`; zero surviving Business, membership, external mapping, and audit rows; test trigger/function absent after outer rollback; `committed_mutations: false`. |
| Test B — two-session contention | **PASS** | Session A `created`; Session B `already_provisioned`; same Business and owner-membership IDs; PostgreSQL observed Session B in `wait_event_type=Lock`, `wait_event=advisory`, state `active`; final counts were exactly one Business, one active owner membership, one mapping, and one exact audit row. |
| Test B database disposition | **PASS** | Test exit code `0`; immediate database drop/recreate exit code `0`. |

### Qualification-only observer grants

Two permission gaps in the test harness's post-transaction observer checks were exposed and resolved only inside the disposable database:

1. Test A performs its final `to_regprocedure` / trigger-catalog check after rolling back the transaction and after `SET LOCAL ROLE ghm_schema_owner` has ended. The login `ghm_migrator` therefore needed `USAGE` on schema `ghm`.
2. Test B's final resource-count query runs on the observer connection as `ghm_migrator`, not under `ghm_schema_owner`. It therefore needed read-only `SELECT` on the four counted tables.

The following narrowly scoped grants were applied in the disposable database before the successful reruns:

```sql
GRANT USAGE ON SCHEMA ghm TO ghm_migrator;
GRANT SELECT ON
  ghm.business,
  ghm.business_membership,
  ghm.business_external_mapping,
  ghm.quoteflow_migration_business_provisioning_audit
TO ghm_migrator;
```

These grants did not grant DML or provisioning-function execution. They were confined to `ghm_qualification` and were discarded when that database was dropped.

The first Test A attempt stopped at its final catalog check with `42501 permission denied for schema ghm`; it passed after the schema USAGE grant. The first Test B attempt reached the final count query after the contention sequence but stopped with `42501 permission denied for table business`; the committed test database was immediately dropped/recreated. Test B then passed after the read-only observer grants.

## Final database state

Immediately after the successful Test B run, the user ran the prescribed disposal sequence:

- terminated any remaining sessions for `ghm_qualification`;
- dropped the database;
- recreated it owned by `ghm_schema_owner`;
- revoked CONNECT from PUBLIC;
- granted CONNECT to `ghm_migrator` and `ghm_runtime`.

Both the Test B process and database recreation returned exit code `0`. The final database is a newly recreated empty database; its migrations, synthetic fixture, qualification rows, and qualification-only grants were discarded. The local PostgreSQL cluster and its separate certificate material remain local and were not registered as a service.

## Qualification conclusion and limits

The migration-backed function `ghm.auth_provision_quoteflow_migration_business` passed the rollback-only baseline, forced mid-write atomicity test, and two-session advisory-lock/idempotency test on the isolated PostgreSQL 18.6 target.

This result qualifies the tested database contract and behavior only. It does not qualify production configuration, production data, application/HTTP integration of the attestation helper, deployment, cutover, or end-to-end QuoteFlow identity linking. No repository source or test script was changed as part of the qualification execution; this document records the user's observed terminal results.

See also:
- `docs/architecture/QUOTEFLOW_BUSINESS_PROVISIONING_EXTENDED_QUALIFICATION_PLAN.md`
- `docs/operations/RECONCILIATION_RECOVERY_HANDOVER_2026-10-31.md`
