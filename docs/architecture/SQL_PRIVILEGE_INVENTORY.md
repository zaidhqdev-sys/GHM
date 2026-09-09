# GHM SQL / Privilege Inventory

## Status

Read-only construction inventory completed against the current GHM source tree and the captured live PostgreSQL catalog.

No PostgreSQL roles or privileges were changed by this inventory.

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

This is deliberate: no table privilege is being invented before the canonical schema is authorized.

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

The first repository migration contains:

```sql
CREATE TABLE IF NOT EXISTS ghm_schema_migrations (...)
```

Therefore migration execution requires authority to create/modify the repository-owned migration ledger and later canonical schema objects. The exact DDL grant set must be designed against the final schema ownership model rather than granted to the runtime role.

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

The captured live database shows the current effective role `ghm_db_user` has broad database/schema/table authority, including grantable table privileges and database/schema creation authority.

That authority exceeds the current runtime source requirement and the intended runtime authority model.

The discrepancy is therefore confirmed as architectural over-privilege, not as a demonstrated runtime requirement.

The existing role relationship remains unchanged pending a controlled reconciliation plan.

## Canonical application schema boundary

The current GHM database contains only legacy/infrastructure tables:

- `users`
- `profiles`
- `password_reset_tokens`
- `files`
- `todos`

These are not sufficient grounds for authoring product business tables.

The canonical GHM application schema remains **not yet authorized**. Business tables will be introduced only from verified product capability evidence through repository-owned migrations.

## Qualification implications

The current runtime can be made substantially less privileged than the existing `ghm_db_user` without losing any currently implemented repository operation, because the canonical runtime currently performs only a connectivity probe and no application-table SQL.

However, privilege mutation is still deferred because the migration/admin ownership model must first be established and the first real repository SQL must be known.

## Next gate

1. Complete concrete remote/backend inventory for Zaid Connect and QuoteFlow where required for GHM capability design.
2. Define the first canonical GHM identity/domain migration from verified product evidence, not legacy-table inference.
3. Implement repository SQL for one explicitly authorized capability.
4. Derive the exact runtime table/sequence/function privileges from that repository SQL.
5. Create and qualify dedicated runtime and migration authorities.
6. Run positive and negative privilege tests against the construction database.
7. Only then remove unnecessary privileges from the legacy construction authority.

## Production safety

Zaid Connect and QuoteFlow remain on their existing Supabase production backends throughout this construction work. No production routing, credentials, DNS, environment variables, or traffic were changed.
