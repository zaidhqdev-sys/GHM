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


## Additional live-service checks — 2026-10-28 00:52 UTC

- Source inspection of the deployed mainline commit confirms `src/http/app.ts` defines `GET /healthz`; `src/server.ts` also defines `GET /readyz` based on its startup readiness flag. Render service metadata configures `/healthz` as its health-check path.
- Attempted to fetch `https://ghm-internal-runtime.onrender.com/healthz` and the root URL from available web/network tools; both were inaccessible from this environment. A local network probe also failed DNS resolution, so this is a limitation of the current checking environment, not proof of service failure.
- Render request logs for 2026-10-28 00:40–01:00 UTC returned no rows. HTTP request-count metrics for the same interval returned an empty data series. These results do not establish whether the service is receiving requests or healthy.
- The next meaningful test needs a client with network access to the Render hostname and a safe authenticated application context. Do not use a fabricated token or an unscoped object ID. The database function invocation above is the only live call currently verified.


## Render startup evidence — 2026-10-28 00:55 UTC

A broader Render application-log query for 00:26–00:55 UTC returned the successful startup sequence for deployed commit `60814931bd3905c4be95a2366ea4b16957b48cb1`:

- `npm start` ran `node dist/server.js`.
- `GHM Core Engine listening on port 10000` at 00:27:16.997 UTC.
- Render reported `Your service is live` at 00:27:22.664 UTC and detected port 10000 later.
- No application error was present in this startup sequence.

This confirms the deployed process started and Render marked it live at that time. It does **not** prove the current live HTTP health endpoint or authenticated storage route works after the database grant. External HTTP requests from this checking environment still fail due to DNS/network access, and no HTTP request metrics/logs were returned in the checked interval.


## Final diagnostic pass — 2026-10-28 00:56 UTC

A fresh read-only catalog query against primary `ghm_db` reports:

- `session_user = ghm_app_user`
- `current_user = ghm_db_user`
- `pg_has_role(current_user, 'ghm_runtime', 'MEMBER') = true`
- `ghm.ghm_schema_migrations` exists; `public.ghm_schema_migrations` does not.
- The Render query connection cannot SELECT from the migration ledger (`has_table_privilege(current_user, 'ghm.ghm_schema_migrations', 'SELECT') = false`).
- The scoped getter exists.

This is good confirmation that the DB connection's configured app login is switching to `ghm_db_user` and inheriting the runtime role. The ledger entry remains inaccessible to the current connection; do not grant ledger SELECT to the application role just for diagnosis.

## User-network HTTP smoke test (non-mutating)

The checking environment cannot resolve/reach the public Render hostname, so the remaining HTTP smoke test must be run from a network that can reach it. In PowerShell:

```powershell
$base = 'https://ghm-internal-runtime.onrender.com'
Invoke-WebRequest -Uri "$base/healthz" -TimeoutSec 20 | Select-Object StatusCode, Content
Invoke-WebRequest -Uri "$base/readyz" -TimeoutSec 20 | Select-Object StatusCode, Content
```

If the health endpoint returns success but readiness does not, record both statuses and response bodies; do not treat a timeout/DNS error from the current tool environment as proof of an outage. These unauthenticated endpoints do not exercise storage. An end-to-end storage check requires an existing valid app session/token and a known object ID that the session is authorized to access; use `GET /api/v1/storage/objects/:objectId/access` (read-only grant creation, not object deletion) only with those real values. Do not paste bearer tokens or signed URLs into chat or handover docs.

No migration was rerun in this pass. The role grant and direct database function invocation are verified; authenticated HTTP lookup and the migration-ledger row are still pending.


## HTTPS failure reported from user's PowerShell — 2026-10-28 00:57 UTC

User ran `Invoke-WebRequest "$base/healthz" -TimeoutSec 20` and received "The underlying connection was closed: An unexpected error occurred on a receive." The `/readyz` request timed out after 20 seconds.

Render control-plane diagnostics collected immediately afterward show a new documentation-triggered deploy:

- Deploy `dep-dbgkginb9u1s73cu2qo0` from docs-only commit `86dda225ad040d8ac467cb360d86bfe09173e6a6`.
- Deployment began 00:56:42 UTC and finished successfully/live at 00:57:25.845 UTC.
- New instance logged `GHM Core Engine listening on port 10000` at 00:57:20.093 UTC; Render marked service live at 00:57:26 UTC.
- The service is configured with one instance and health-check path `/healthz`. Source shows `/healthz` returns static JSON `{"status":"ok"}`; `/readyz` returns 200 only after the server's initial `SELECT 1` completes and listen callback sets readiness.
- No HTTP request-count metrics were available in the inspected time range. App logs contained startup/deploy records but no request logs. These observations do not show whether the user's requests reached the app.

The requests happened close to the docs-triggered redeploy window, so transient routing during restart is plausible but not proven. Do not diagnose an app bug or change runtime code based only on these two errors.

### Next diagnostic from Windows PowerShell

Windows PowerShell's TLS defaults may cause compatibility issues; test TLS 1.2 explicitly and also use `curl.exe` to separate PowerShell/.NET behavior from the endpoint itself:

```powershell
$base = 'https://ghm-internal-runtime.onrender.com'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

try {
  $r = Invoke-WebRequest "$base/healthz" -TimeoutSec 25 -UseBasicParsing
  "healthz status=$([int]$r.StatusCode) body=$($r.Content)"
} catch {
  "healthz error: $($_.Exception.Message)"
}

try {
  $r = Invoke-WebRequest "$base/readyz" -TimeoutSec 25 -UseBasicParsing
  "readyz status=$([int]$r.StatusCode) body=$($r.Content)"
} catch {
  "readyz error: $($_.Exception.Message)"
}

curl.exe -sS -v --connect-timeout 10 --max-time 25 "$base/healthz" -o NUL
```

Share only status/error text and curl's TLS/HTTP diagnostic lines; do not share cookies, authorization headers, or tokens. If both still fail after the deploy has settled, inspect DNS/TLS/network path and Render events/logs before changing app code. Do not rerun migrations for an HTTP transport symptom.
