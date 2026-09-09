# GHM Migration Runner Qualification — 2026-09-10

## Scope

Construction-only qualification of the dedicated GHM migration runner against the construction PostgreSQL database. No Zaid Connect or QuoteFlow production systems were changed.

## Repository migration authority

The construction branch contains the canonical migration runner and migration files:

- `src/db/migrate.ts`
- `database/migrations/00000000000000_create_migration_ledger.sql`
- `database/migrations/20260909150000_create_business_identity.sql`

The Business Identity migration creates `account_identity`, `business`, and `business_membership`, with the reconciled constraints, indexes, and foreign keys.

## Credential boundary

The migration runner uses `GHM_MIGRATOR_DATABASE_URL`. The credential was supplied locally at runtime and is not recorded in the repository or this evidence document.

The login was qualified as:

```text
current_user     = ghm_migrator
session_user     = ghm_migrator
current_database = ghm_db
```

## Standalone connectivity qualification

A direct Node/`pg` connection using the configured migration connection successfully connected to `ghm_db` as `ghm_migrator` and returned the identity values above.

Result: PASS.

## Migration runner execution qualification

The compiled migration runner was instrumented externally for observation without modifying repository code. The observed execution sequence was:

```text
POOL.CONNECT
SET ROLE ghm_schema_owner
identity query
BEGIN
pg_advisory_xact_lock
migration ledger existence check
migration ledger SELECT
COMMIT
```

The `SET ROLE ghm_schema_owner` operation succeeded while `session_user` remained `ghm_migrator`.

The migration ledger was read successfully. Both known migrations were already represented with matching repository checksums, so no new migration SQL was executed during the repeat run.

The transaction committed successfully.

Result: PASS.

## Repeat/no-op behavior

The migration runner was executed again after the dedicated `ghm_migrator` credential was supplied. It completed without an authentication error and the instrumented execution confirmed the ledger was checked and the transaction committed without applying an additional migration.

Result: PASS.

## Qualification conclusion

```text
GHM DEDICATED MIGRATION RUNNER QUALIFICATION: PASS
```

This qualification establishes the dedicated `ghm_migrator` login, its SET ROLE path to `ghm_schema_owner`, PostgreSQL connectivity, migration-ledger reconciliation, and repeat/no-op transaction path for the current construction slice.

## Remaining work

This does not close the broader authority reconciliation. Still open:

1. Bootstrap `ghm_db_user` memberships granted by bootstrap `postgres`, requiring an independent provider/bootstrap authority path for cleanup.
2. Future-object default privileges, deferred until a dedicated GHM schema is reconciled.
3. Separate decision on database TEMP privilege if required by a future runtime contract.
4. Final removal of the old `ghm_app_user -> ghm_db_user` authority path only after replacement and recovery paths are independently qualified.

## Safety boundary

Do not merge this construction branch into `main`, do not cut over Zaid Connect or QuoteFlow, and do not alter their production Supabase configuration or traffic as part of this qualification.
