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

## Remaining authority work — reconciled against later mainline

The list below records the status of this 2026-09-10 qualification after later mainline work:

1. **OPEN:** Bootstrap `ghm_db_user` memberships granted by bootstrap `postgres` still require an independent provider/bootstrap authority path for cleanup.
2. **CLOSED for the current `ghm` schema slice:** Dedicated-schema default privileges have since been reconciled; any new object still requires its own migration and least-privilege review.
3. **CLOSED for the current runtime boundary:** TEMP privilege is recorded as **NO GRANT REQUIRED**; revisit only if a future runtime contract proves it necessary.
4. **OPEN / gated:** Final removal of the old `ghm_app_user -> ghm_db_user` authority path remains deferred until replacement and recovery paths are independently qualified and the required bootstrap authority is available.

## Safety boundary

This instruction governed the isolated construction branch and qualification activity on 2026-09-10; it is a historical scope restriction, not a current instruction to prevent subsequently reviewed and merged mainline work. It remains true that this qualification itself did not authorize Connect or QuoteFlow cutover or changes to their production Supabase configuration or traffic. Current merge and cutover status is governed by `GHM_CURRENT_STATE.md` and the current remaining-work register.
