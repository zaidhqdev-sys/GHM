# GHM SQL / Privilege Inventory

## Status

**Construction inventory — reconciled against the current GHM source tree and captured PostgreSQL evidence.**

No PostgreSQL roles or privileges are changed by this documentation reconciliation.

## Runtime SQL inventory

### `src/server.ts`

The canonical runtime shell performs one database connectivity query during startup:

```sql
SELECT 1
```

It does not mutate application schema or create product tables. Health/readiness routes have explicit operational contracts.

### Resource repositories

The current construction resource repositories now contain governed SQL for the qualified Business Identity, Project, Enquiry, and Review slices. Their exact table/column and authorization requirements are owned by their respective resource contracts and qualification evidence.

Runtime privilege grants are therefore derived from measured repository SQL for each qualified slice rather than inferred from legacy database ownership.

### `src/db/pool.ts`

Defines the shared PostgreSQL pool. It contains no SQL statements of its own.

### `src/db/transaction.ts`

Defines the transaction boundary and issues only transaction-control commands around caller work:

- `BEGIN`
- caller repository work
- `COMMIT`
- `ROLLBACK`

### `src/db/authorized-transaction.ts`

Passes the authenticated `AuthContext` through the same checked-out PostgreSQL client/transaction. It contains no independent database pool or unawaited authorization query.

## Migration SQL inventory

### `src/db/migrate.ts`

The migration runner is separate from application startup and belongs to migration authority, not runtime authority.

Its database interactions include transaction control, advisory locking, migration-ledger reconciliation, repository migration execution, checksum recording, and rollback on failure.

The migration runner is qualified using `GHM_MIGRATOR_DATABASE_URL`, connecting as `ghm_migrator` and explicitly setting `ghm_schema_owner` for migration work. Identity, ledger reconciliation, repeat/no-op behavior, commit, and checksum integrity have passed for the current construction migrations.

The exact DDL authority remains with `ghm_schema_owner`; runtime must not inherit migration/schema-owner authority.

## Current source-to-privilege conclusion

At the current construction stage:

| Capability | Current source requirement | Target authority |
|---|---|---|
| PostgreSQL connection | Yes | Runtime |
| `SELECT 1` startup probe | Yes | Runtime |
| Qualified resource SELECT/INSERT/UPDATE | Yes, per governed repository | Runtime, exact measured grants |
| Qualified resource DELETE | Only where a contract explicitly requires it | Not granted by default |
| Sequence usage | Only where identity inserts require it | Runtime, exact measured grants |
| Schema CREATE | No | Migration/schema-owner only |
| Arbitrary DDL | No | Migration/schema-owner only |
| `CREATEDB` | No | Never runtime |
| `CREATEROLE` | No | Never runtime |
| `TRUNCATE` | No | Not runtime |
| `REFERENCES` | No | Not runtime unless explicitly qualified |
| `TRIGGER` | No | Not runtime unless explicitly qualified |
| Migration ledger read/write | Migration runner only | Migration authority |
| Migration advisory lock | Migration runner only | Migration authority |

## Live privilege reconciliation

The captured legacy database still contains the broad legacy `ghm_db_user` authority. That exceeds the intended measured runtime boundary.

The dedicated `ghm_runtime` boundary has been independently qualified for the current construction slice, including positive ACL checks and negative probes for DDL, destructive operations, migration-ledger mutation, sequence mutation, and role escalation.

The unresolved bootstrap memberships remain provider/bootstrap-authority work and must not be represented as runtime authority.

## Canonical GHM schema boundary

The first canonical GHM Business Identity slice is repository-owned and migration-controlled. Subsequent qualified construction slices have been added through the same governed process.

The legacy public-schema objects remain evidence of the old construction database and are not grounds for copying a product schema wholesale. Each future capability requires source evidence, an explicit contract, migration ownership, repository SQL, authorization, and qualification.

## Qualification implications

The runtime privilege model is now capability-derived rather than based on legacy ownership. Qualified resource operations have corresponding measured authority; runtime retains no schema-owner or migrator escalation path.

Remaining authority work is controlled cleanup and future extension, not reconstruction of the already-qualified first slices.

## Remaining authority work

1. Resolve bootstrap `ghm_db_user` memberships through the independent provider/bootstrap authority path.
2. Establish/reconcile the dedicated GHM application schema and future-object defaults before relying on them broadly.
3. Measure and decide the final TEMP privilege for `ghm_runtime`.
4. Derive exact privileges for each future governed resource from its repository SQL.
5. Remove unnecessary legacy authority only after recovery/replacement gates permit it.

## Production safety

Zaid Connect and QuoteFlow remain on their existing Supabase production backends throughout this construction work. No production routing, credentials, DNS, environment variables, or traffic were changed.