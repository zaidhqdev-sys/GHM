# GHM SQL / Privilege Inventory

## Status

Construction inventory reconciled against the current GHM source tree and the captured live PostgreSQL catalog.

No PostgreSQL roles or privileges were changed by this documentation reconciliation.

## Runtime SQL inventory

### `src/server.ts`

The canonical runtime shell creates a PostgreSQL pool and performs exactly one database query during startup:

```sql
SELECT 1
```

This query verifies database connectivity only. It does not read or write an application table.

Therefore, **current runtime source requires database connectivity but no application table CRUD privileges**.

The runtime also exposes health/readiness HTTP routes, but those routes do not issue additional SQL.

### `src/db/pool.ts`

Defines the shared PostgreSQL pool. It contains no SQL statements of its own.

### `src/db/transaction.ts`

Defines the transaction boundary and issues only transaction-control commands around caller work:

- `BEGIN`
- caller-supplied repository work
- `COMMIT`
- `ROLLBACK`

The transaction wrapper itself does not establish a table or schema privilege requirement. Future repository SQL determines those requirements.

### `src/db/authorized-transaction.ts`

Passes the authenticated `AuthContext` through the same checked-out PostgreSQL client/transaction. It contains no SQL of its own.

### `src/resources/profile/repository.ts`

The profile repository is intentionally contract-only. It performs authorization checks and then throws a reconciliation-blocking error. It currently executes **no SQL**.

This is deliberate: no table privilege is being invented before the canonical schema and repository contract are qualified.

## Migration SQL inventory

### `src/db/migrate.ts`

The migration runner is separate from application startup and therefore belongs to migration authority, not runtime authority.

Its database interactions are:

1. `BEGIN`
2. `SELECT pg_advisory_xact_lock($1)`
3. `SELECT to_regclass($1) IS NOT NULL AS exists`
4. `SELECT version, checksum FROM ghm_schema_migrations` when the ledger exists
5. execution of repository migration SQL
6. `INSERT INTO ghm_schema_migrations (version, name, checksum) ...`
7. `COMMIT`
8. `ROLLBACK` on failure

The migration runner is now qualified using `GHM_MIGRATOR_DATABASE_URL`, connecting as `ghm_migrator` and explicitly setting `ghm_schema_owner` for migration work. Identity, ledger reconciliation, repeat/no-op behavior, commit, and checksum integrity have passed for the current construction migrations.

The exact DDL authority remains with `ghm_schema_owner`; the runtime role must not inherit migration/schema-owner authority.

## Current source-to-privilege conclusion

At the current construction stage:

| Capability | Current source requirement | Target authority |
|---|---|---|
| PostgreSQL connection | Yes | Runtime |
| `SELECT 1` startup probe | Yes | Runtime |
| Application table SELECT | No current SQL | Add only when repository SQL exists |
| Application table INSERT | No current SQL | Add only when repository SQL exists |
| Application table UPDATE | No current SQL | Add only when repository SQL exists |
| Application table DELETE | No current SQL | Add only when repository SQL exists |
| Sequence usage | No current SQL | Add only when repository SQL exists |
| Schema CREATE | No | Migration/schema-owner only |
| Arbitrary DDL | No | Migration/schema-owner only |
| `CREATEDB` | No | Never runtime |
| `CREATEROLE` | No | Never runtime |
| `TRUNCATE` | No | Not runtime unless a measured exceptional requirement exists |
| `REFERENCES` | No | Not runtime unless a measured exceptional requirement exists |
| `TRIGGER` | No | Not runtime unless a measured exceptional requirement exists |
| Migration ledger read/write | Migration runner only | Migration authority |
| Migration advisory lock | Migration runner only | Migration authority |

## Live privilege reconciliation

The captured live database shows the current effective legacy role `ghm_db_user` has broad database/schema/table authority, including grantable table privileges and database/schema creation authority.

That authority exceeds the current runtime source requirement and the intended runtime authority model.

The discrepancy is therefore confirmed as architectural over-privilege, not as a demonstrated runtime requirement.

The legacy bootstrap relationship remains unchanged pending a controlled cleanup through the independent bootstrap/provider authority. Do not attempt to revoke those memberships through the current `ghm_app_user`/`ghm_db_user` path.

## Canonical application schema boundary

The captured legacy database contains:

- `users`
- `profiles`
- `password_reset_tokens`
- `files`
- `todos`

These are not sufficient grounds for authoring product business tables.

The first canonical GHM Business Identity slice has now been introduced through repository-owned migrations and applied to the construction database. Its objects are `account_identity`, `business`, `business_membership`, `ghm_schema_migrations`, and their identity sequences.

This first slice is canonical for GHM construction, but it is not the complete product schema and does not authorize arbitrary additional business tables. Each subsequent capability must be reconciled from verified product evidence before its migration and repository SQL are introduced.

## Qualification implications

The current runtime source can remain substantially less privileged than the legacy `ghm_db_user` authority because no currently implemented repository operation requires broad application-table or DDL privileges.

The dedicated runtime and migration authorities have now been qualified for the current first slice. Remaining privilege work is controlled cleanup and extension of the authority model as additional governed repository capabilities are introduced.

## Next gate

1. Resolve the bootstrap `ghm_db_user` memberships through the independent provider/bootstrap authority path.
2. Establish the dedicated GHM application schema and reconcile future-object defaults before relying on them.
3. Measure and decide the final TEMP privilege for `ghm_runtime`.
4. Implement and qualify repository SQL for the next explicitly authorized capability.
5. Derive exact runtime table/sequence/function privileges from that repository SQL.
6. Complete transaction/authentication/authorization qualification and positive/negative privilege tests.
7. Only then remove unnecessary privileges from the legacy construction authority.

## Production safety

Zaid Connect and QuoteFlow remain on their existing Supabase production backends throughout this construction work. No production routing, credentials, DNS, environment variables, or traffic were changed.
