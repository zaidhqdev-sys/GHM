# Handover — production storage getter permission fix (2026-10-28)

## Current status

The production database permission gap for the scoped storage metadata getter has been corrected interactively.

- Repository: `zaidhqdev-sys/GHM`
- Production runtime: Render service `GHM-Internal-Runtime`
- Runtime URL: https://ghm-internal-runtime.onrender.com
- Primary database: `ghm_db` (Render Postgres resource `dpg-dag0sdtbedkc7389vi2g-a`)
- Application login configured in the user's session: `ghm_app_user`, with role setting `role=ghm_db_user`
- Migration/deployment code baseline: commit `60814931bd3905c4be95a2366ea4b16957b48cb1` (PR #189 merged)

## Change applied and verified

The user executed this SQL against the primary `ghm_db` database:

```sql
GRANT ghm_runtime TO ghm_db_user;
```

Post-change output from the user's own database session:

```
 schema_usage | scoped_getter_execute
--------------+-----------------------
 t            | t
```

Independent read-only Render catalog verification also returned:

- `pg_has_role('ghm_db_user', 'ghm_runtime', 'MEMBER') = true`
- `has_schema_privilege('ghm_db_user', 'ghm', 'USAGE') = true`
- `has_function_privilege('ghm_db_user', 'ghm.storage_get_object(bigint,bigint)', 'EXECUTE') = true`
- `to_regprocedure('ghm.storage_get_object(bigint,bigint)') IS NOT NULL = true`

The scoped getter exists as `ghm.storage_get_object(bigint,bigint)`, is owned by `ghm_schema_owner`, is SECURITY DEFINER, and has a fixed `search_path=pg_catalog, ghm`. Its function ACL grants execution to `ghm_runtime` and `ghm_schema_owner`; it does not grant PUBLIC access.

## What is not yet verified

1. **Application-level end-to-end call is still unverified.** The database privilege/catalog checks are successful, but they do not prove that a live request through the Render service successfully invokes the getter.
2. The Render query tool uses a separate read-only connection. It cannot read `ghm.ghm_schema_migrations` because that connection lacks SELECT on the ledger. The ledger columns are `version`, `name`, `checksum`, and `applied_at`; the target migration row has not been verified through that tool.
3. A direct web-tool request to the runtime URL and `/healthz` could not be fetched by that tool, so this is **not** evidence of an application outage or success.
4. No migration was rerun as part of this permission correction.

## Relevant implementation

- Migration: `database/migrations/20261026120000_scope_storage_metadata_lookup.sql`
- Repository call: `src/storage/repository.ts`, `getById()`, calls:
  `SELECT * FROM ghm.storage_get_object($1, $2)`
- Migration runner: `src/db/migrate.ts`
- The application runtime is configured to start with `npm start`; deployment does not automatically run migrations.
- PR #189 added production migration guards and the storage migration transaction-boundary fix. Its CI included build/tests, migration audit/runtime boundary checks, and disposable-Postgres storage qualification.

## Next steps

1. Check the Render service logs around a real request that exercises storage metadata lookup. The previously queried short log interval returned no matching application logs; absence of logs does not establish success.
2. Exercise a safe, authenticated application path that calls `getById` for an object the account is allowed to access. Confirm both the expected response and absence of SQL permission errors. Avoid inventing a storage object/account ID or running a destructive write just for testing.
3. Verify migration ledger state through an authorized application/migrator connection, or through the local migration runner's documented read path, without broadening production ledger permissions just for diagnostics.
4. Do not rerun migrations merely to fix the role membership. The grant is already applied. Only run the migration runner if ledger/schema checks establish that a migration is missing and the target database guard confirms `ghm_db`.
5. After an end-to-end test, append the observed request/result and timestamp here and update `docs/GHM_CURRENT_STATE.md` if the operational status changes.

## Safety / separation

- Use the primary `ghm_db` for this production issue; do not confuse it with `ghm_payfast_sandbox_db`.
- Do not copy database URLs, passwords, or secret environment values into handover documentation.
- The Render Postgres query interface is read-only; it cannot apply SQL changes. The role grant above was executed by the user directly and was verified afterward.


## Follow-up direct function invocation — 2026-10-28

After the role grant, a read-only call through the Render Postgres query connection attempted:

```sql
SELECT count(*) AS rows_for_nonexistent_object
FROM ghm.storage_get_object(9223372036854775807::bigint, 1::bigint);
```

The function was invoked and returned its designed generic `storage object does not exist` exception (SQLSTATE `P0001`), **not** a schema/function permission-denied error. The deliberately out-of-range object ID does not select or mutate a real object. This is stronger evidence that the scoped function is callable under the query connection's effective role after the grant, but it is not an end-to-end request through the Render application and does not validate migration-ledger state.
