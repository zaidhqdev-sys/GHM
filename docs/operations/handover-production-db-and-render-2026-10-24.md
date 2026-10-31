# Production DB and Render Runtime Handover — 2026-10-24

## Scope and safety boundary

This handover records the production database credential/migration investigation and Render runtime checks completed through 2026-10-24 00:59 UTC. Work was diagnostic and read-only during this window. No production migrations were run, and no schema, application data, role/grant, runtime-routing, or service-setting changes were made as part of these checks. Do not put database passwords or full connection URLs in this document.

## Production and sandbox targets

- Production Render Postgres: database `ghm_db`, service/DB ID `dpg-dag0sdtbedkc7389vi2g-a`, host `dpg-dag0sdtbedkc7389vi2g-a.frankfurt-postgres.render.com`.
- PayFast sandbox: database `ghm_payfast_sandbox_db`, service/DB ID `dpg-db4416vlk1mc73eocug0-a`, host `dpg-db4416vlk1mc73eocug0-a.frankfurt-postgres.render.com`.
- The sandbox credentials were reported as working. Keep sandbox and production connection strings distinct.
- Production `GHM_MIGRATOR_DATABASE_URL` had its password reset earlier with approval, and the updated value was validated against production, including the ability to `SET ROLE ghm_schema_owner`. The current secret is already set in Render and the original local `.env`; do not reset it again absent new evidence.
- Production `DATABASE_URL` points to `ghm_db` as `ghm_app_user`; the migration runner uses the separate `GHM_MIGRATOR_DATABASE_URL`. Do not replace the runtime URL with the migrator URL.
- An earlier local `.env` had the migrator URL pointed at the sandbox. The production audit was deliberately run from a separate worktree with a process-scoped environment override, not by overwriting that file.

## Migration reconciliation — PASS

Repository/live commit: `8376c88cc99db156e9cd3488669ec35e4ed498cf` (`Fix forensic migration checksum reconciliation policy (#140)`).

A read-only production audit completed successfully with these results:

| Check | Result |
|---|---:|
| Expected database | `ghm_db` |
| Initial current/session user | `ghm_migrator` / `ghm_migrator` |
| `can_set_schema_owner` | `true` |
| Current user after role switch | `ghm_schema_owner` |
| Repository migration count | 78 |
| Live ledger count | 78 |
| Canonical checksum matches | 7 |
| Supported legacy CRLF matches | 62 |
| Approved historical-provenance matches | 9 |
| Missing migrations | 0 |
| Unexplained checksum mismatches | 0 |
| Migration-name mismatches | 0 |
| Extra ledger entries | 0 |
| Orphaned exceptions | 0 |
| Redundant exceptions | 7 |
| Overall verdict | **PASS** |

The seven redundant exceptions are informational cleanup only: the current migration bytes already match the registered hash. The audit transaction was read-only and rolled back; it did not change the database. The latest recorded migration is `20261012120000`. There is no evidence from this audit that a production migration is required.

Important runner behavior: `npm run migrate` builds and executes `dist/db/migrate.js`; the runner uses `GHM_MIGRATOR_DATABASE_URL`, switches to `ghm_schema_owner`, checks expected identity, and may apply pending migrations in a normal run. Render's `npm start` runs `node dist/server.js`; migrations do not automatically run on service startup. **Do not run `npm run migrate` without explicit authorization to make production schema changes.**

## Render runtime checks

- Workspace: `ZAID Technologies` (`tea-d9svua6417fc73bhcutg`).
- Service: `GHM-Internal-Runtime` (`srv-damupsek1f9s73eq8kkg`).
- URL: https://ghm-internal-runtime.onrender.com
- Dashboard: https://dashboard.render.com/web/srv-damupsek1f9s73eq8kkg
- Region: Frankfurt; plan: Free; branch: `main`; auto-deploy: disabled; health-check path: `/healthz`; configured start command: `npm start`.
- User manually checked the health endpoint and reported response `{"status":"ok"}`.

Recent deployment history:

| UTC time | Deployment | Result |
|---|---|---|
| 2026-10-23 23:58:23–23:58:45 | `dep-dbdv97navr4c739hqm5g` | Succeeded; later deactivated by next deploy |
| 2026-10-24 00:26:03–00:26:26 | `dep-dbdvm6rncjis73dlnh9g` | Succeeded; latest recorded deployment |

The 00:26 deployment event reports `envUpdated: true`; it is the same repository commit and was not a new code commit. Render service metadata was last updated at 00:26:26 UTC. Application logs show successful startup at 23:58 and 00:26, with `GHM Core Engine listening on port 10000`.

A further application startup appears in logs at 2026-10-24 00:54:31 UTC on instance `srv-damupsek1f9s73eq8kkg-6vqht`; the app logged `GHM Core Engine listening on port 10000` at 00:54:35 UTC. The Render event-history queries returned no restart/deploy/failure event corresponding to 00:54, and no application error was present in the queried log window. This confirms the process started successfully, but **the cause of the 00:54 startup remains unconfirmed**. Do not infer a manual restart, platform recovery, or crash from the available evidence.

A request-log query for `/healthz` returned no matching records, and the metrics query returned empty arrays; neither result alone proves endpoint failure. The manually observed `{"status":"ok"}` response is positive health evidence.

## Local/repository notes

- Original worktree: `C:\GHM`; existing uncommitted change `M scripts/qualify-business-identity-runtime.mjs`. Leave it untouched.
- Separate audit worktree: `C:\GHM-prod-migration-audit`; used for the production audit.
- A separate diagnostic branch `diagnostics/local-db-credential-check-20261023` at commit `1f86dd66cbdedee9eb97719b1446033ca484d9c4` contains `scripts/diagnose-local-db-connections.mjs`; it is not the live deployment.
- A Render Postgres query tool could not read the `ghm` schema because its own SQL session lacked schema permissions; this was not evidence that the production credentials used in the audit were invalid.
- Windows `psql.exe` was unavailable locally; no Render psql CLI operation was performed.
- Existing documented role-membership/grant cleanup involving `ghm_db_user` was not changed; do not revoke memberships or alter grants as part of this handover without a separate approved plan.

## Current status

- [x] Production migrator credentials validated against the production database.
- [x] Read-only production migration/checksum reconciliation passed (78/78; no missing or unexplained mismatches).
- [x] Latest Render deployment reported live/succeeded.
- [x] App startup and manually checked health endpoint succeeded.
- [x] No production migration or database mutation performed during this verification.
- [ ] Explain the 00:54 UTC application startup/restart from Render lifecycle/platform records, if those records become available.
- [ ] Treat the seven redundant checksum exceptions as optional documentation/policy cleanup; no urgent action indicated.

## Recommended next steps

1. If investigating the 00:54 startup further, inspect Render dashboard Events and instance/lifecycle details around `2026-10-24 00:54 UTC`; the API event history queried so far does not identify a trigger.
2. Do not restart/redeploy, rotate credentials, alter grants, or run migrations just to address the unexplained startup. The evidence currently shows the app is listening and the health endpoint returns OK.
3. Preserve production/sandbox separation and keep all secrets out of handover notes and chat logs.


## Follow-up investigation — 2026-10-24 13:53 UTC

A second read-only Render inspection was performed after the initial handover was committed.

- Service metadata still reports `autoDeploy: no`, `suspended: not_suspended`, the same service ID, and the same latest recorded deployment `dep-dbdvm6rncjis73dlnh9g`.
- Event history from 00:40–01:10 UTC returned no events. Event history from 00:26 through 13:53 UTC showed only the 00:26 successful deployment start/end; no restart, server failure, or additional deployment event was returned.
- The queried app logs for 00:40–01:10 UTC contained no warning/error entries.
- App and request logs for 12:50–13:53 UTC returned no entries, including the `/healthz` request-log query. This is inconclusive: absence of logs is not proof that the service is down or healthy.
- Attempting to open the health URL through the web inspection path was not accessible there. The earlier user-reported direct response `{"status":"ok"}` remains the last positive endpoint observation, at approximately 00:58 UTC.

**Conclusion unchanged:** the 00:54 UTC process startup is confirmed, but its trigger remains unknown in the available Render event history. No evidence surfaced of a subsequent deployment or reported service failure. This follow-up was read-only; no deploy, restart, configuration, credential, or database changes were made.

### Next action

If current availability needs confirmation, request `https://ghm-internal-runtime.onrender.com/healthz` directly in a browser or from an approved external health monitor and record the timestamp/status. For the 00:54 trigger, check the Render dashboard's instance/lifecycle details or Render support; the service event API and log queries above did not expose a cause. Do not rotate credentials or run migrations based on this unresolved startup alone.


## Follow-up — 2026-10-24 13:55 UTC

A further read-only check was made to establish whether there was a newer deploy or lifecycle failure and whether current health could be independently confirmed.

- Render deployment listing still shows `dep-dbdvm6rncjis73dlnh9g` as the latest live deployment, for commit `8376c88cc99db156e9cd3488669ec35e4ed498cf`, started 00:26:05 and finished 00:26:25 UTC. No later deploy appears in the returned list.
- Filtered service events from 00:00–14:00 UTC returned only the 00:26 deploy-start/deploy-end events; no `server_restarted`, `server_failed`, `server_hardware_failure`, `server_available`, or service suspend/resume event was returned.
- Render service metadata remains `autoDeploy: no`, `suspended: not_suspended`, one instance, with `/healthz` configured as the health-check path.
- App and request log queries from 12:50–13:53 UTC returned no entries, so they do not independently establish current endpoint health.
- A direct endpoint fetch from the investigation environment could not be completed because DNS resolution failed in that environment. The web inspection tool also could not access the endpoint. These are limitations of the checking environment, **not proof that the service endpoint is down**.
- The last positive endpoint observation remains the user's earlier direct check returning `{"status":"ok"}` around 00:58 UTC.

**Current conclusion:** no newer deployment or failure event was found, but current external health could not be independently verified from this environment. The 00:54 UTC startup trigger remains unresolved. No production or Render settings were changed. To close the health check, open `https://ghm-internal-runtime.onrender.com/healthz` directly in a browser or query it from an approved external monitor, then record the timestamp, HTTP status, and response. For the startup trigger, use Render dashboard instance/lifecycle details or Render support if the dashboard exposes no additional event. Do not restart/redeploy or change database credentials based on the current evidence alone.

## Render environment-variable inventory — recorded 2026-10-24 14:50 UTC

Recorded from the operator-provided inventories in chat. This section records **variable names and safe, non-secret connection-target metadata only**. It deliberately excludes passwords, private-key contents, token/pepper values, merchant keys, passphrases, invite codes, and complete connection URLs. Treat the Render dashboard as the source of truth for current values.

### GHM-Internal-Runtime

- `CORS_ORIGINS`
- `DATABASE_SSL`
- `DATABASE_URL` — PostgreSQL target: database `ghm_db`, runtime user `ghm_runtime`, production Postgres ID `dpg-dag0sdtbedkc7389vi2g-a` (Frankfurt).
- `GHM_AUTH_TOKEN_PEPPER`
- `GHM_JWT_ES256_KID`
- `GHM_JWT_ES256_PRIVATE_KEY_PEM`
- `GHM_JWT_ES256_PUBLIC_KEY_PEM`
- `GHM_MIGRATOR_DATABASE_URL` — **operator confirms this was the later addition to GHM-Internal-Runtime**; migration connection is separate from the runtime `DATABASE_URL`.
- `INVITE_CODE`
- `JWT_SECRET` — legacy variable, noted as legacy by operator.
- `NODE_ENV`
- `TRUST_PROXY`

### GHM PayFast Sandbox Runtime

- `CORS_ORIGINS`
- `DATABASE_SSL`
- `DATABASE_URL` — PostgreSQL target: database `ghm_payfast_sandbox_db`, runtime user `ghm_runtime`, sandbox Postgres ID `dpg-db4416vlk1mc73eocug0-a`.
- `GHM_AUTH_TOKEN_PEPPER`
- `GHM_JWT_ES256_KID`
- `GHM_JWT_ES256_PRIVATE_KEY_PEM`
- `GHM_JWT_ES256_PUBLIC_KEY_PEM`
- `GHM_MIGRATOR_DATABASE_URL` — PostgreSQL target: database `ghm_payfast_sandbox_db`, migration user `ghm_migrator`, sandbox Postgres ID `dpg-db4416vlk1mc73eocug0-a`.
- `GHM_QUALIFICATION_DATABASE_NAME` — value reported: `ghm_payfast_sandbox_db`.
- `INVITE_CODE`
- `NODE_ENV`
- `PAYFAST_CANCEL_URL`
- `PAYFAST_ENVIRONMENT`
- `PAYFAST_MERCHANT_ID`
- `PAYFAST_MERCHANT_KEY`
- `PAYFAST_NOTIFY_URL`
- `PAYFAST_PASSPHRASE`
- `PAYFAST_RETURN_URL`

### GHM Identity Qualification

- `CORS_ORIGINS`
- `DATABASE_SSL`
- `DATABASE_URL` — PostgreSQL target reported as database `ghm_payfast_sandbox_db`, runtime user `ghm_runtime`, sandbox Postgres ID `dpg-db4416vlk1mc73eocug0-a`.
- `GHM_AUTH_TOKEN_PEPPER`
- `GHM_JWT_ES256_KID`
- `GHM_JWT_ES256_PRIVATE_KEY_PEM`
- `GHM_JWT_ES256_PUBLIC_KEY_PEM`
- `GHM_MIGRATOR_DATABASE_URL` — PostgreSQL target reported as database `ghm_payfast_sandbox_db`, migration user `ghm_migrator`, with a credential different from the runtime credential; operator supplied a Frankfurt fully qualified hostname for this connection.
- `GHM_NONPRODUCTION_DATABASE_NAME` — value not included in the inventory message.
- `GHM_QUALIFICATION_DATABASE_NAME` — value not included in the inventory message.
- `INVITE_CODE`
- `NODE_ENV`
- `PAYFAST_CANCEL_URL`
- `PAYFAST_ENVIRONMENT`
- `PAYFAST_MERCHANT_ID`
- `PAYFAST_MERCHANT_KEY`
- `PAYFAST_NOTIFY_URL`
- `PAYFAST_PASSPHRASE`
- `PAYFAST_RETURN_URL`

### Reconciliation notes

- The three lists above are the operator-provided inventories; do not silently normalize one service to another or remove variables because they appear redundant.
- The only subsequent change explicitly identified by the operator is adding `GHM_MIGRATOR_DATABASE_URL` to `GHM-Internal-Runtime`. Its inclusion above records that update; do not infer any other environment changes.
- The Identity Qualification service's runtime and migrator URLs were both reported as targeting `ghm_payfast_sandbox_db`, while using different credentials. Confirm intended routing against the Render dashboard before making any change; this handover entry is documentation, not approval to modify configuration.
- Variable names are not proof that each value is valid or that each feature is fully wired. No Render variables were read back or changed as part of recording this inventory.


## Cloudflare R2 storage integration status — recorded 2026-10-24 14:57 UTC

- Operator reports that the Cloudflare storage setup has been created, but its credentials have **not** been added to any of the three Render services listed above.
- Treat this as a known, pending integration task—not as an unexplained difference or a runtime regression. No Render environment variables were changed as part of recording this status.
- The repository's storage configuration contract in `src/storage/config.ts` names these variables: `STORAGE_PROVIDER`, `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, and optional `STORAGE_FORCE_PATH_STYLE`, `STORAGE_UPLOAD_URL_TTL_SECONDS`, `STORAGE_DOWNLOAD_URL_TTL_SECONDS`. The configuration module alone does not establish which deployed service currently invokes the storage integration.
- Before adding variables, verify the Cloudflare R2 bucket/account endpoint and intended service ownership, then confirm the application's deployed upload/download path and required URL-signing behavior. Add only the variables needed by the owning service through Render's environment settings.
- Do not put access-key secrets in this handover, source control, or chat. After integration, run a controlled upload/download test and verify bucket permissions and signed-URL behavior.

## Architecture clarification — production vs. sandbox — recorded 2026-10-24 15:06 UTC

The operator clarified the intended service/database layout; this section supersedes any ambiguity in earlier notes about ownership or sandbox database separation:

- **Production:** `GHM-Internal-Runtime` is the production runtime and uses the production GHM DB. Cloudflare R2 storage credentials are intended to live in this production service when the integration is ready.
- **Sandbox testing:** `GHM PayFast Sandbox Runtime` and `GHM Identity Qualification` are separate services that share the same sandbox database, `ghm_payfast_sandbox_db`. Identity Qualification was created to separate qualification/testing work from the PayFast sandbox runtime at the service level; it was not intended to introduce a separate database.
- Do not treat the two sandbox services' shared database as an unresolved design choice, and do not create or configure another database based on the earlier caution.
- R2 credentials have not yet been added to any Render service. Do not copy sandbox payment credentials into production. No Render environment configuration was changed by recording this clarification.

## R2 integration code-path review — recorded 2026-10-24 15:10 UTC

Repository review confirms the S3-compatible storage building blocks already exist: `src/storage/config.ts`, `src/storage/s3-provider.ts`, `src/storage/factory.ts`, `src/storage/service.ts`, and `src/storage/repository.ts`. The configuration supports an HTTPS custom endpoint, credentials, bucket/region, path-style addressing, and bounded signed-grant TTLs. The environment template already lists the `STORAGE_*` variables.

**Important deployment gap:** the current `src/http/app.ts` does not import or register the storage service/router, and `src/config.ts` does not load storage configuration. Therefore, adding R2 credentials to Render alone would not connect the feature to the running API. The provider/service/repository code exists, but the application-level request path is not wired in the reviewed app entry point.

Next implementation work is to complete and test the authenticated storage HTTP path, construct the provider and metadata store from runtime config, connect the existing authorization and database storage functions, and verify the relevant schema/migration is present and deployed. Only after this code path is complete should R2 settings be added to **GHM-Internal-Runtime**. Do not add storage credentials to either sandbox service. This review did not change application code or Render settings, and no secret values are recorded here.

## R2 runtime wiring implementation — 2026-10-24 15:15 UTC

Implementation is available for review in draft PR [#184 — Wire authenticated storage API for Cloudflare R2](https://github.com/zaidhqdev-sys/GHM/pull/184), branch `feat/cloudflare-r2-runtime-wiring`.

- Added authenticated API routes for business-logo upload grants, upload completion, signed access grants, and deletion. Upload bytes are sent directly to the S3-compatible provider using the short-lived signed URL; completion verifies provider content type and byte size before metadata becomes available.
- Added a tenant-aware authorization adapter using existing business membership transactions and the existing storage metadata lifecycle functions.
- Runtime wiring is conditional: if storage credentials are absent, storage routes remain disabled and the API can start as before. If credentials are partially supplied, configuration fails closed instead of silently enabling a broken integration.
- GitHub Actions CI for commit `a483e48ee2c5c062006414b28e7db50805a68116` completed successfully: build, test suite, migration audit policy tests, and runtime-boundary verification passed.
- This is not yet merged or deployed. Before enabling in production, review the PR and confirm the existing storage schema/functions and privileges are present in the production GHM DB; then configure the Cloudflare R2 environment variables only on `GHM-Internal-Runtime`, validate R2 bucket CORS for the intended web origins, and run the live-provider qualification using a disposable object.
- No Render environment settings, database schema, or live storage credentials were changed.

## Live database preflight — 2026-10-24 15:22 UTC

Read-only Render Postgres queries were run against the actual production database and PayFast sandbox database using the configured Render workspace:

- Production `ghm_db` (Postgres service ID `dpg-dag0sdtbedkc7389vi2g-a`): `ghm.storage_object` does **not** exist; none of the five expected lifecycle routines (`storage_create_pending`, `storage_mark_available`, `storage_mark_deletion_pending`, `storage_mark_deleted`, `storage_get_object`) were found in schema `ghm`.
- Sandbox `ghm_payfast_sandbox_db` (service ID `dpg-db4416vlk1mc73eocug0-a`): same result; storage table absent and lifecycle routine count is zero.
- Queries were read-only. No migrations, data, credentials, or Render configuration were changed.

**Production enablement remains blocked:** the API storage repository calls the above canonical database lifecycle routines, so the storage migration must be located/reviewed and applied through the established migration process before enabling R2. Do not add production R2 credentials or enable the storage routes until that schema/privilege prerequisite is satisfied. This is a verified live preflight result, not an assumption based on source code.

- Follow-up source review on the default `main` branch searched for the canonical table and lifecycle function definitions and found no checked-in migration definition. The PR therefore must not be merged as production-ready until the schema migration is located or authored, reviewed against the database security conventions, and validated in qualification before production rollout.


## R2 readiness correction — 2026-10-25 21:52 UTC

The earlier notes saying the storage schema was absent are superseded. The feature branch contains three canonical migrations: `20261004220000_create_storage_object.sql`, `20261004221000_establish_storage_persistence_boundary.sql`, and `20261004222000_harden_storage_persistence_function_authority.sql`. Read-only catalog checks observed the storage table and five lifecycle routines in both production and shared sandbox databases. Current branch head CI run 1623 passed. PR #184 remains draft and unmerged.

The Render SQL inspection connection lacks USAGE on schema `ghm`, so it cannot read the migration ledger. Applied migration checksums and full live-DDL equivalence remain unverified. Lifecycle routines do not independently enforce end-user tenant membership; real membership-backed integration testing is still required.

Caution: `scripts/qualify-storage-persistence.mjs` performs writes. Its direct-INSERT denial probe passes a bind parameter to a statement with no placeholder, so a parameter-count error could falsely appear to prove privilege denial. Do not run it on production or shared sandbox. Correct the probe and use only a disposable database.

Do not add R2 variables, run migrations, or merge as production-ready until authorized migration/DDL review and disposable-database lifecycle/privilege plus tenant-isolation tests pass. When explicitly approved, production R2 credentials belong only on `GHM-Internal-Runtime`. No database or Render changes were made in this continuation.


## Storage qualification probe hardening — 2026-10-25 21:54 UTC

Follow-up code review found and corrected a false-positive risk in `scripts/qualify-storage-persistence.mjs`: its direct-INSERT denial probe previously passed a bind parameter to a statement without a placeholder. The probe now uses the selected tenant ID in `$1` and a unique generated provider key. Because this script performs lifecycle writes, it now refuses to run unless `GHM_STORAGE_QUALIFICATION_ALLOW_MUTATIONS=true` is explicitly set and the connected database name includes `qualification`, `qual`, `test`, or `disposable`. This is a guardrail, not a replacement for checking the target connection before use.

The updated script has not yet reported a CI run and has not been executed against any database. Validate it in CI and then only against a dedicated disposable database. Do not run it against production or the shared PayFast sandbox. No database or Render settings were changed.


## Latest continuation — 2026-10-25 21:56 UTC

- Current PR #184 head is `5e69a2cfb59c9adfb22413d19547ae683b8aceb4`; CI run 1628 completed successfully. PR remains draft/unmerged.
- Re-inspection of `scripts/qualify-storage-persistence.mjs` found a remaining safety weakness: it still falls back from `GHM_QUALIFICATION_DATABASE_URL` to `GHM_RUNTIME_DATABASE_URL` and then `DATABASE_URL`. Although it requires `GHM_STORAGE_QUALIFICATION_ALLOW_MUTATIONS=true` and checks the connected database name after connecting, the URL fallback should be removed so this mutating qualification utility accepts only the dedicated qualification URL. The code update was blocked by a repository tool safety check, so do not treat this improvement as applied. The script also still needs CI coverage and execution only on a disposable DB.
- The script's `storage_get_object` final-state query calls the composite-returning function multiple times in one SELECT; change it to `SELECT * FROM ghm.storage_get_object($1)` and use `SELECT * FROM ghm.storage_create_pending(...)` for the create result to avoid repeated function expressions and keep the row shape aligned with the repository's current query pattern. These follow-up changes are not applied.
- Continue to prohibit running the mutating qualification script against production or shared sandbox. Migration-ledger reconciliation still needs the approved read-only `ghm_schema_owner` audit path; real membership-backed tenant isolation remains unqualified.
- Both this handover and the R2 readiness tracker have been updated in this branch. No database writes, migrations, or Render changes were made.


## Storage qualification hardening applied — 2026-10-25 21:58 UTC

The qualification script safety improvements that were previously blocked are now applied on this branch:

- `GHM_QUALIFICATION_DATABASE_URL` is now the only accepted connection-string source; runtime and generic `DATABASE_URL` fallbacks have been removed.
- Mutations still require explicit `GHM_STORAGE_QUALIFICATION_ALLOW_MUTATIONS=true`, and the connected database name must clearly indicate qualification/test/disposable use.
- The direct-INSERT privilege probe now has a matching `$1` parameter and a unique provider key.
- Storage create/transition/final-read queries use `SELECT * FROM ghm.storage_...(...)` to avoid repeated composite function evaluation and expose columns consistently.

These changes are source-reviewed but have not yet been confirmed by CI at the latest branch head. Do not run the script until CI passes and a dedicated disposable database has been provisioned and verified. It must never target production or the shared PayFast sandbox. The authorized read-only migration-ledger/DDL review and real membership-backed tenant-isolation tests remain open. No database writes, migrations, or Render changes were made.


## Qualification assertion hardening — 2026-10-25 22:00 UTC

CI run 1634 passed for the branch before this latest test-hardening commit. The qualification script has now been tightened further: negative probes must fail with the expected SQLSTATE (`42501` for denied direct DML and `P0001` for an invalid lifecycle transition), rather than treating any arbitrary error (such as a bind-parameter mismatch or missing object) as proof of the security boundary. It also explicitly fails if runtime direct INSERT/UPDATE/DELETE privileges are present or if any required lifecycle EXECUTE privilege is absent. The final deletion transition now uses `SELECT * FROM ghm.storage_mark_deleted($1)` for consistent return handling.

CI run 1635 is queued for this change; do not count it as validated until it passes on the latest head. The Render read-only query still fails with permission denied for schema `ghm`, so migration ledger and live DDL checks remain unverified through that connection. No qualification script was executed; no database writes/migrations or Render changes were made. R2 variables remain on hold.


## Follow-up qualification guard review — 2026-10-26

CI run 1637 passed for the prior branch head. Further static review tightened the mutating qualification script: the connected database name must contain a delimited qualification/test/disposable token (not merely a substring), direct-DML privilege checks now fail closed if a privilege result is NULL/unknown, and the final lifecycle assertion now requires exactly one returned row with status `deleted`. These are newer code commits and remain unvalidated until CI passes on the current head. No database was connected to by the qualification script. No migration, database write, or Render setting was changed. R2 rollout remains blocked on authorized read-only ledger/DDL reconciliation, a verified disposable qualification target and runtime privilege/lifecycle test, and real membership-backed cross-tenant integration tests.


## Latest validation result — 2026-10-26

CI run 1639 passed for source commit `eec2d4dbb20d4a19e0984c537792279cc71401bf`. It includes the latest qualification-script hardening: delimited qualification/test/disposable database-name token, fail-closed privilege assertions, and strict final lifecycle row/status check. PR #184 remains draft/unmerged. This is repository CI only; the script has not been run against a database, and CI does not establish live production migration checksums, live grants, or real cross-tenant authorization. The two handover docs were updated after this source commit; no CI run is reported for the documentation-only commits. No database writes, migrations, or Render changes were made. R2 credentials remain on hold.


## Follow-up source review — 2026-10-26

The latest review found malformed literal `\\n` sequences in the final lifecycle assertion of `scripts/qualify-storage-persistence.mjs`, which would prevent the script from parsing. This has now been corrected to ordinary source newlines in commit `40fb35e44a71a440cf50c27192aaf4e986df8edc`. The PR head is this commit, but the workflow-run lookup returned no run for this commit; therefore the syntax repair is not yet CI-verified. Do not run the script or treat it as qualified until CI passes. No database was connected to, and no database writes, migrations, or Render changes were made.


## CI syntax gate added — 2026-10-26

Added an explicit `node --check scripts/qualify-storage-persistence.mjs` step to `.github/workflows/ci.yml` so syntax errors in the mutating qualification script are caught directly by CI. Current branch head is `61f083c7e5eeb1ea0983edf3a391dc6da8dd996c`; CI run 1647 is in progress. The qualification script has not been executed against a database. No DB writes, migrations, or Render changes were made. Continue to hold R2 variables pending CI pass, authorized read-only ledger/DDL reconciliation, disposable DB lifecycle qualification, and real membership-backed tenant-isolation tests.


## Storage migration authority clarification — 2026-10-26

Reviewed `src/db/migrate.ts` to resolve the open question about `ghm_schema_owner`. The established migration runner requires `GHM_MIGRATOR_DATABASE_URL`, executes `SET ROLE ghm_schema_owner`, verifies the effective role and session user (`ghm_schema_owner` / `ghm_migrator`), then runs migration SQL in a transaction. Thus a separate `ALTER FUNCTION OWNER` statement is not necessarily required for functions created under this runner's effective role. This is a source/process conclusion, not live verification of the storage functions' owner or grants. Before any storage migration, use the approved read-only audit to verify role attributes, function owners, and effective grants on the intended target, and qualify the migration against a disposable database. No DB or Render changes were made; PR #184 remains draft and unmerged.


## Read-only storage audit queries added — 2026-10-26

Added `database/audits/storage-persistence-readonly-audit.sql` on the feature branch. It only queries current connection identity, role attributes, storage relation ownership/RLS flags, lifecycle function owners/security settings/ACLs, runtime table DML privileges, and migration-ledger relation presence. It contains no DDL/DML and does not switch roles. Run it only with an approved audit connection against one explicitly selected database at a time; retain production and sandbox outputs separately. The audit file is a convenience for evidence gathering, not a qualification pass. No database or Render changes were made.


## Read-only role audit — 2026-10-26

CI run 1654 passed on the branch head containing the audit SQL and handover updates. I ran read-only role-attribute queries against both Render targets using the existing inspection connection. On production `ghm_db`, `ghm_schema_owner` exists with `rolcanlogin=false`, `rolsuper=false`, `rolbypassrls=false`; `ghm_migrator` and `ghm_runtime` exist, both non-superuser and `rolbypassrls=false`. On sandbox `ghm_payfast_sandbox_db`, the same three roles exist with `ghm_schema_owner` non-login and all three non-superuser/non-bypass-RLS. The production app role `ghm_app_user` also exists and is non-superuser/non-bypass-RLS. The inspection connection still cannot read relation/schema metadata under `ghm`: the read-only relation/ledger query failed with `permission denied for schema ghm` (SQLSTATE 42501) on both targets. Therefore storage table/function owners, grants, and ledger presence/checksums remain unverified; the query failure is not evidence that the objects are absent. No writes or migrations were run, and no Render settings changed.


## Updated live storage catalog audit — 2026-10-26

CI run 1656 passed for branch head `42db0304ad3b8adad3e01273dc9490cee1306117`. A new read-only query against PostgreSQL system catalogs (rather than `to_regclass`/direct `ghm` schema access) successfully inspected the current live objects in both production `ghm_db` and sandbox `ghm_payfast_sandbox_db`. In both databases, `ghm.storage_object` exists and is owned by `ghm_schema_owner`; all five `ghm.storage_*` lifecycle functions exist, are `SECURITY DEFINER`, are owned by `ghm_schema_owner`, use `search_path=pg_catalog, ghm`, and their ACLs show EXECUTE for `ghm_runtime` and `ghm_schema_owner` only. The `ghm_runtime` role has no direct SELECT/INSERT/UPDATE/DELETE privileges on `ghm.storage_object`. Catalog inspection also returned the expected lifecycle, status, visibility, size/content checks, provider-key uniqueness, primary key, and business FK constraints on the table. This supersedes earlier inference from the failed `to_regclass` query: the error was due to schema permissions, not proof the table/functions were absent.

Remaining gap: the inspection connection cannot SELECT rows from `ghm.ghm_schema_migrations` (it has no schema/table read privilege), so migration ledger versions/checksums are not verified. Do not grant privileges or switch roles ad hoc; use the approved audit path. This catalog review is read-only and did not execute storage functions or write data. It does not replace disposable-DB lifecycle qualification or real membership-backed cross-tenant integration tests. No migrations or Render settings changed.


## Qualification gates — follow-up review 2026-10-26

CI run 1658 passed for commit `265c877837cfbd1f73aeeb1bb564d2309dcd9485` (the latest branch head at the time of review). Source review confirms the mutating persistence qualification script requires the explicit `GHM_QUALIFICATION_DATABASE_URL` and `GHM_STORAGE_QUALIFICATION_ALLOW_MUTATIONS=true`, refuses to proceed unless the connected database name clearly identifies qualification/test/disposable use, and tests direct-DML denial plus the lifecycle state transitions. I have not run it because no dedicated disposable qualification database is provisioned/verified in this work session.

The HTTP tenant-auth tests currently use mocked storage services that throw `Business tenant access denied` for the tested calls. They demonstrate route-level 403 mapping and unauthenticated rejection, but do not exercise actual PostgreSQL membership lookup or end-to-end storage authorization against the live adapters. The adapter unit tests cover manager/non-manager and tenant mismatch branches with mocked transactions; they are not substitutes for the requested membership-backed integration tests.

The migration audit script requires `GHM_MIGRATOR_DATABASE_URL`, validates identity and `SET ROLE ghm_schema_owner`, and runs `BEGIN READ ONLY` before reading the ledger and comparing versions/checksums. The existing inspection connection cannot read that ledger. Do not provide or paste credentials into GitHub/chat. Next safe action is to run this script from the approved operational environment with the established migrator identity in read-only mode, save sanitized output to the handover, and run lifecycle mutation qualification only against a separate explicitly provisioned disposable database. No DB writes, migrations, or Render settings changed.


## Latest CI and operational handoff — 2026-10-26

CI run 1660 passed for branch head `48887b07118d7d995e40f9ba0ecd94680d7609b7`. The source/CI review is clean for the documentation and existing tests, but CI does not execute the live migration ledger reconciliation or mutating storage qualification. Those remain explicit operational gates. This session has no approved `GHM_MIGRATOR_DATABASE_URL` connection for the read-only reconciliation and no verified disposable qualification database; do not try to substitute production or sandbox for that database. Next action must be performed from the approved operational environment: run `scripts/forensic-migration-reconciliation.mjs` with `GHM_MIGRATION_AUDIT_DATABASE=ghm_db` (read-only transaction enforced by the script), capture sanitized output, then provision/verify a disposable database and run `scripts/qualify-storage-persistence.mjs` only there. Real DB-backed membership/tenant isolation integration tests remain open. No database writes, migrations, or Render settings changed; production R2 variables remain on hold.


## Storage deletion recovery fix — 2026-10-26

Code review found a lifecycle recovery gap: if provider deletion failed after metadata transitioned to `deletion_pending`, the service rejected retries because it only accepted `available` rows. Updated `src/storage/service.ts` to authorize and retry provider deletion for either `available` or `deletion_pending`; the transition to `deletion_pending` only runs for `available`, and the final `deleted` state is still written only after provider deletion succeeds. Added service tests for retrying a pending deletion and for the provider-failure retry path. Commits: `a1afb1d6a71c869e6971b04aa9291c2bb3f62b89` and `2633fde904e6fadbd7ac74585558c22e9a6dfa68`. CI for these new code commits has not yet been confirmed. No database or Render settings changed; R2 remains disabled/on hold.


## Additional least-privilege review finding — 2026-10-26

CI run 1666 passed for the branch head `b0519522d363324b74902c44a00a0c5721e4352f`, including the retryable deletion fix and tests. Follow-up review identified one database least-privilege question that must be resolved before production enablement: `ghm.storage_get_object(bigint)` is a `SECURITY DEFINER` function granted to `ghm_runtime` and returns a storage row by object ID without a tenant parameter. The current service performs authorization after fetching the row, which is correct for normal application flow, but any direct invocation under the runtime DB role can retrieve arbitrary storage metadata by ID. This does not expose provider credentials, but it weakens DB-level tenant isolation if the runtime credential or query path is abused. Do not silently treat this as fully qualified. Design a narrow access pattern that preserves intentional public-logo reads while restricting private metadata lookup to the authorized tenant, then add tests and a migration only after reviewing the persistence/authorization contract. No database or Render settings changed.


## Account-scoped storage metadata getter — source change 2026-10-26

Added migration `database/migrations/20261026120000_scope_storage_metadata_lookup.sql` on the R2 feature branch. It replaces the unscoped `ghm.storage_get_object(bigint)` function with `ghm.storage_get_object(bigint,bigint)`, returning an object only if it is an available public business logo for an active business or the supplied account has active membership in the object's business. Unauthorized and missing IDs produce the same error. Updated `src/storage/repository.ts` to pass the authenticated `AuthContext.userId`; added a repository regression test for the query signature and parameters; and extended the read-only audit SQL to check the new/old function signatures. This is a defense-in-depth restriction, not a replacement for application authorization because the database runtime credential is shared and can call functions with supplied parameters. Latest source commits: migration `0f62b0e2b63f5f4a42b8c1f3fe422b3f82f21150`, repository `222054b7c4f1d8f1cd29d66074741fc47594cb4a`, test `f8078e3e4d3d69c5f40cf79fdf3a2aab9b551d7a`, audit SQL `0c3278ed7b43a1e1fdef024110c8fd0a99ce756b`. CI for this combined head is not yet confirmed. No live DB migration or Render change was performed. Keep R2 credentials on hold.


## Scoped metadata lookup CI result — 2026-10-26

CI run [1678](https://github.com/zaidhqdev-sys/GHM/actions/runs/40242355456) passed for source head `9fea65df616abb9ee1c9b8e1fd19bad82209b942`, including the test suite, migration audit policy tests, and runtime-boundary verification. The immediately preceding run failed because two newly added tests over-escaped a regular expression; those assertions were corrected to use literal substring checks, and the new run passed. This validates source-level tests only. The new migration has not been applied to production or sandbox; no disposable-database migration test or real PostgreSQL membership-backed cross-tenant integration test has been completed. No live DB or Render changes were made. Keep R2 variables on hold.


## Storage metadata lookup — latest verification and migration-ledger reconciliation — 2026-10-26

### Source and test verification

- CI run #1682 was reported passing for source commit `0fdf3052d795473450561eb4dda2de78ea11a053`.
- Local `npm run build` completed successfully.
- Focused storage tests passed: 47 tests, 0 failures, 0 skipped.
- Migration-audit policy tests passed: 6 tests, 0 failures, 0 skipped.
- `git diff HEAD --check` passed and the worktree was clean on `feat/cloudflare-r2-runtime-wiring`, tracking its origin branch.
- The repository calls `ghm.storage_get_object($1, $2)` with the authenticated account ID. The migration drops the old one-argument function, adds the account-scoped function, and preserves the narrow active public business-logo path.

### Read-only sandbox migration audit

A read-only reconciliation was run against the explicitly named Render sandbox database `ghm_payfast_sandbox_db` using `ghm_migrator`, followed by `SET ROLE ghm_schema_owner` inside the script's read-only transaction. The authority checks passed: the actual database matched the expected sandbox name and the role switch succeeded. No write transaction was opened and no migration was applied.

The audit verdict was **INVESTIGATE**, not PASS:

- 79 migration files were present in the feature-branch repository and 86 rows were present in the sandbox ledger.
- 78 ledger checksums matched repository files under the supported historical CRLF checksum rule; there were no unexplained checksum mismatches or name mismatches.
- The new migration `20261026120000_scope_storage_metadata_lookup` was absent from the live ledger, as expected before application.
- Eight ledger entries were not present on this feature branch. Investigation found all eight migration files in `origin/integration/ghm-identity-merge-candidate-20261018`; six matched the sandbox ledger checksum exactly, and the QuoteFlow provisioning migration's ledger checksum matched an earlier Git blob, followed by a later additive reconciliation migration. This supports branch-history divergence as the explanation, but does not by itself establish which branch is the authoritative baseline for the shared sandbox.
- The candidate branch and feature branch are materially divergent: GitHub comparison reported the feature branch 126 commits ahead and 55 behind the candidate branch. Do not merge or rebase wholesale merely to make the audit counts match.
- Seven historical checksum exceptions were reported as redundant; there were no orphaned exceptions. Treat this as cleanup evidence, not permission to rewrite ledger rows.

### Next gates and safety constraints

1. Establish the intended migration baseline for the shared sandbox from the reviewed integration/merge history before interpreting its eight extra ledger rows as a defect.
2. Run the migration and positive/negative membership/public-logo checks against a dedicated disposable PostgreSQL database, not production and not the shared PayFast sandbox. The existing `qualify:storage-persistence` script is mutating and must only run after its database target is explicitly provisioned and verified disposable.
3. Add/perform real PostgreSQL membership-backed cross-tenant tests; the current 47 focused tests and HTTP tenant-auth tests do not replace live database integration coverage.
4. Re-run the read-only migration audit against the agreed baseline after reconciliation. Do not edit the live ledger or add checksum exceptions to make the result green.
5. Keep production R2 credentials/settings on hold until the database and authorization qualification gates pass.

No database writes, live migrations, production changes, or Render service/environment changes were made during this verification. The migration remains unapplied to both the sandbox and production. Do not place database credentials in this handover, GitHub comments, or chat.


### Follow-up: qualification database access and handover commit — 2026-10-26

Render inventory shows an existing PostgreSQL instance named `ghm_identity_qualification_20261018` (15 GB, paid `basic_256mb` plan), but its IP allowlist is empty. The hosted Render query tool cannot connect because of that allowlist. I did not change networking or broaden access, and I did not assume this database is disposable or repurpose it for storage qualification. The shared PayFast sandbox remains shared and is not an acceptable substitute for a disposable target.

The handover update is committed on the feature branch. CI run #1684 completed successfully for that documentation commit. PR #184 remains open and draft; no merge, deployment, database migration, database write, or Render environment change was performed.

Next concrete gate: use an approved local/operational connection to verify the purpose and contents of `ghm_identity_qualification_20261018` or provision a clearly disposable database with explicit approval for any associated cost. Only then run the mutating storage qualification against that isolated database, including the migration, runtime direct-DML denial, lifecycle transitions, public-logo read, and real membership-backed same-tenant/cross-tenant cases. Keep production R2 settings and credentials on hold until that gate and the baseline reconciliation are reviewed.


### Disposable PostgreSQL CI gate added — 2026-10-26

To close the gap where the feature branch CI only compiled and ran tests without applying the repository migrations, `.github/workflows/ci.yml` now provisions an ephemeral PostgreSQL 18 service for CI, creates isolated `ghm_schema_owner`, `ghm_migrator`, and `ghm_runtime` roles, runs the migration chain through the guarded migrator, and then runs the existing tests/policy/runtime-boundary checks. The role credentials and database exist only inside the ephemeral GitHub Actions job; this does not change Render or any persistent database.

- Workflow change commit: `1dfa38fec3265f0ca4c59c5cbb86e0950368d1dd`.
- Exact-head CI run [#1686](https://github.com/zaidhqdev-sys/GHM/actions/runs/40250770182) started and was in progress at the time this note was written.
- This step deliberately does not invoke `scripts/qualify-storage-persistence.mjs`: that script is mutating and currently expects an active business with active membership in its qualification DB. Run it only after a disposable CI fixture is implemented/verified or an explicitly approved disposable qualification DB is available.
- If the migration chain or DB-backed suite fails, fix the disposable CI fixture/migration contract before any live qualification; do not work around a failure by running against Render.


### Disposable PostgreSQL CI iteration — TLS policy correction — 2026-10-26

The first new migration-qualification run, [#1686](https://github.com/zaidhqdev-sys/GHM/actions/runs/40250770182), successfully started PostgreSQL 18, created the three isolated roles, and built the code, but migration execution failed because `src/db/migrate.ts` unconditionally requested TLS while the disposable local PostgreSQL service has TLS disabled. No live database was involved.

Corrected the migration runner to honor `DATABASE_SSL=true` for TLS, use plaintext only when explicitly configured for non-production, and refuse to run with TLS disabled when `NODE_ENV=production`. CI sets `DATABASE_SSL=false` only for its ephemeral PostgreSQL service. The correction is commit `0918217c70dfb88eb02efa5bd1af527e4fd90384`; the next exact-head CI result is pending. Do not describe disposable migration qualification as passed until that run completes.


### Disposable PostgreSQL CI iteration — UTF-8 BOM in historical migration — 2026-10-26

Runs [#1688](https://github.com/zaidhqdev-sys/GHM/actions/runs/40250865207) and [#1689](https://github.com/zaidhqdev-sys/GHM/actions/runs/40250877780) both got through PostgreSQL service startup, isolated role creation, and build, but failed while applying the existing migration chain. PostgreSQL identified a leading UTF-8 BOM (U+FEFF) in a historical migration as a syntax error. This is repository migration input, not a connection or live-database issue.

The migration runner now strips a leading BOM from the SQL string immediately before executing it while preserving the original file text for checksum calculation. This avoids changing historical migration files/checksums. Fix commit: `cfe5fed17aa6e51be78196ef820001e7d8bd12c7`. The new exact-head CI result is pending; do not mark the disposable migration gate passed until it finishes.


### Disposable PostgreSQL migration and storage getter qualification — CI green — 2026-10-26

- Fixed migration-runner TLS selection so disposable local PostgreSQL uses `DATABASE_SSL=false`, while `NODE_ENV=production` refuses TLS-disabled operation. No live database connection was changed.
- Added execution-time removal of a leading UTF-8 BOM for migration SQL while preserving original migration bytes for checksum calculation. Added a unit regression test for BOM normalization.
- CI run [#1694](https://github.com/zaidhqdev-sys/GHM/actions/runs/40251156201) passed: build, all repository migrations applied successfully to ephemeral PostgreSQL 18, full test suite, migration-audit policy tests, and runtime-boundary verification.
- Added `scripts/qualify-storage-getter-postgres.mjs`, an explicitly read-only test run as `ghm_runtime` against the ephemeral CI database. CI run [#1696](https://github.com/zaidhqdev-sys/GHM/actions/runs/40251325096) passed with this new step enabled. It checks:
  - scoped `storage_get_object(bigint,bigint)` exists and legacy unscoped overload is absent;
  - owner is `ghm_schema_owner`, function remains `SECURITY DEFINER`, and fixed `search_path` is `pg_catalog, ghm`;
  - runtime has EXECUTE, PUBLIC does not, and runtime lacks direct INSERT/UPDATE/DELETE on `ghm.storage_object`;
  - null IDs, non-positive account IDs, and nonexistent object IDs fail with the expected generic `P0001` error.
- This CI qualification does not insert fixtures or mutate data. It does **not** yet establish positive active-membership reads, cross-tenant denial for a real existing object, or public active business-logo reads. Those still need fixture-backed PostgreSQL tests, with test data isolated to a disposable database.
- The read-only sandbox audit remains `INVESTIGATE` because its eight extra ledger entries reflect a different branch history and the new migration has not been applied there. The shared sandbox is not used by CI and remains unchanged.
- Latest code commit with the new qualification step: `529e9237a4e3d2c45642ae8f7adfa43fc67fa43d`. PR #184 remains draft. Do not configure production R2 credentials or apply the migration to Render until the authoritative migration baseline and fixture-backed tenant/public-logo tests are reviewed.


### Fixture-backed PostgreSQL storage qualification — PASS — 2026-10-26

CI run [#1701](https://github.com/zaidhqdev-sys/GHM/actions/runs/40251687608) completed successfully end-to-end. The workflow uses the explicitly named ephemeral database `ghm_disposable_test` on PostgreSQL 18, with ephemeral `ghm_schema_owner`, `ghm_migrator`, and `ghm_runtime` roles. It applied the complete migration chain, seeded one synthetic active business plus an active owner membership, and then ran:

1. Read-only storage getter/catalog/privilege qualification as `ghm_runtime`.
2. Fixture-backed lifecycle qualification via `scripts/qualify-storage-persistence.mjs`, with mutations enabled only for the disposable CI database.
3. Full application test suite.
4. Migration-audit policy tests.
5. Runtime-boundary verification.

The fixture-backed storage qualification passed, including denial of direct runtime INSERT/UPDATE/DELETE, active-member scoped read, denial to a non-member for a real private object, public active business-logo read without membership, and valid lifecycle transitions. The read-only getter test also verified the unscoped overload is absent and the scoped function has the expected owner, SECURITY DEFINER status, fixed search path, and privileges.

The qualification script's legacy-function privilege query was updated to use `to_regprocedure` so a deliberately removed overload is treated as absent rather than causing the catalog check itself to error. The CI target is named `ghm_disposable_test` and the qualification runner checks that explicit disposable name before mutating data.

- Successful exact-head run: [CI #1701](https://github.com/zaidhqdev-sys/GHM/actions/runs/40251687608).
- The shared Render sandbox audit remains `INVESTIGATE` because its eight extra ledger entries belong to another branch's migration history. The storage migration is still unapplied there.
- No Render database writes, live migrations, production configuration changes, or R2 credential changes were made.
- Remaining release gate: confirm the authoritative migration baseline for the shared sandbox and review the proposed live migration/rollout plan. Keep PR #184 in draft and production R2 settings on hold until that review is complete.


### Migration baseline authority clarification — 2026-10-26

Further GitHub review confirms PR [#142](https://github.com/zaidhqdev-sys/GHM/pull/142), which carries the eight extra migration files seen in the sandbox ledger, is still **open and draft**, based on `main`, and explicitly says the candidate is not merge or deployment authorization. Its exact candidate head had successful CI, but the branch has not been merged into `main`. PR #165's QuoteFlow correction is merged into that candidate branch, not thereby established as the live production migration baseline.

This means the sandbox ledger is consistent with an unmerged integration-candidate history, but there is no safe basis to declare that candidate authoritative for the shared sandbox or to merge/rebase PR #142 wholesale. Resolve the intended migration baseline with the maintainers/approved integration plan before applying the storage migration to any persistent database. Continue to leave the shared sandbox and production unchanged.


### Handover validation after baseline note — 2026-10-26

The exact-head CI run for the previous handover update, [#1703](https://github.com/zaidhqdev-sys/GHM/actions/runs/40251833412), has now completed successfully. This confirms the handover-only commit itself is green; the substantive storage qualification remains green on [#1702](https://github.com/zaidhqdev-sys/GHM/actions/runs/40251782080).

Current safe next step is governed baseline reconciliation, not a live migration. The eight extra ledger entries are traceable to open draft integration candidate PR #142; because that PR explicitly disclaims merge/deployment authorization and is not merged to `main`, do not treat it as the authoritative persistent-database baseline without maintainer sign-off. Keep the shared sandbox and production unchanged, and keep production R2 configuration on hold.


A tracked maintainer decision item is now open: [Issue #185 — Reconcile shared Render sandbox migration baseline before storage rollout](https://github.com/zaidhqdev-sys/GHM/issues/185). It records the evidence, the required baseline decision, and the no-live-change safety boundary. Treat this as the next operational gate.


### Controlled rollout checklist for storage getter — prepared, not authorized — 2026-10-26

This checklist is intentionally a plan only. Do not execute the persistent-database steps until Issue #185 records an explicit maintainer-approved migration baseline and rollout decision.

#### Go/no-go prerequisites

- [ ] Issue #185 records the approved baseline for both the shared sandbox and production, including treatment of the eight extra ledger entries and QuoteFlow checksum provenance.
- [ ] The exact commit containing `20261026120000_scope_storage_metadata_lookup.sql` is reviewed against that approved baseline; CI is green for that exact commit.
- [ ] A database owner confirms the target database name, host, session/current role, and backup/restore point without printing credentials.
- [ ] A controlled sandbox window and operator are named; production and R2 credential changes are explicitly out of scope.
- [ ] The operator has verified the migration ledger and schema/function catalog read-only before applying anything.

#### Sandbox execution sequence after approval

1. Capture a fresh read-only preflight: `current_database()`, `session_user`, `current_user`, effective ability to `SET ROLE ghm_schema_owner`, current migration ledger, and existing storage getter overloads/owner/security/search-path/grants. Abort if any identity or baseline differs from the approved plan.
2. Apply the migration using the repository's approved migration runner and migrator credential only after confirming the runner's target database guard. Never use the production-bound internal runtime service or its environment.
3. Re-run the read-only catalog qualification as `ghm_runtime`; require the two-argument getter, no one-argument overload, owner `ghm_schema_owner`, `SECURITY DEFINER`, fixed `search_path=pg_catalog, ghm`, runtime EXECUTE, no PUBLIC EXECUTE, and no direct runtime table DML.
4. Run the fixture-backed authorization/lifecycle qualification only against a newly provisioned disposable database. Do not run the mutating qualification script against the shared Render sandbox because it creates objects and changes lifecycle state.
5. Verify through approved integration tests that active membership can read, another tenant cannot read an existing private object, and an active public business logo remains readable without membership. Record results and migration ledger evidence without credentials or object payloads.
6. Stop for review. Do not proceed to production or configure R2 credentials as a consequence of sandbox success alone.

#### Failure and rollback handling

- If the migration fails before commit, confirm the transaction rolled back and re-run read-only preflight before retrying; do not blindly retry.
- After commit, do **not** restore the old one-argument `SECURITY DEFINER` getter as a rollback. It is the unscoped entry point this change removes. If an issue is found, stop storage traffic/rollout as appropriate and prepare a reviewed forward-fix migration that preserves tenant scoping, or restore application code only if it still uses the scoped signature.
- Preserve the migration ledger; never edit historical checksums to force reconciliation.
- Record the exact commit, database identity (no secrets), ledger diff, catalog evidence, test output, operator, and approval in the issue before any further step.

Current decision: Issue #185 has no maintainer baseline approval recorded at this checkpoint. Therefore this checklist is **not authorization to execute**; shared sandbox and production remain unchanged.


### Rollout checklist CI verification — PASS — 2026-10-26

The exact-head workflow for checklist commit `9643c8f41d36e9417995f30ba965a3194ee4c4a6` passed as [CI #1706](https://github.com/zaidhqdev-sys/GHM/actions/runs/40323967117). All steps succeeded: isolated least-privilege PostgreSQL roles, qualification script syntax, build, full migrations on disposable PostgreSQL, fixture seeding, getter/catalog checks, lifecycle and tenant authorization qualification, full test suite, migration-audit policy tests, and runtime-boundary verification.

This confirms the checklist documentation commit and storage qualification are green. It does not resolve migration-baseline authority: Issue #185 remains open with the required decision unchecked, and PRs #142 and #184 remain drafts. Do not run the checklist against Render until the baseline decision and controlled rollout approval are recorded.


### Integration-candidate divergence assessment — 2026-10-26

Read-only GitHub comparison confirms `main` is the repository default branch and the integration candidate `integration/ghm-identity-merge-candidate-20261018` is **diverged**, not a simple forward-only migration addition: candidate is 55 commits ahead and 9 commits behind `main` (merge base `8376c88cc99db156e9cd3488669ec35e4ed498cf`; main head at comparison `a966ada3695f2cfed1f7ad64679565be4d25c46d`). The comparison includes broad application, auth, API, migration-runner, CI, and database changes, not only the eight extra ledger files.

Therefore do not merge PR #142 wholesale as a migration-ledger repair, and do not infer the production baseline from that branch alone. Maintainers should choose an explicit integration strategy after reviewing the full branch diff, then reconcile the sandbox ledger against the selected baseline. The storage migration remains independently qualified on disposable PostgreSQL; that does not authorize persistent changes.

Latest handover/PR CI checkpoint: [CI #1707](https://github.com/zaidhqdev-sys/GHM/actions/runs/40324507287) passed. No Render database was modified.


### Latest CI and integration strategy checkpoint — 2026-10-26

Exact-head CI for the prior handover commit `9447b273139472bbd6ee53bfd5b40aeaa482bc4c` passed in [CI #1708](https://github.com/zaidhqdev-sys/GHM/actions/runs/40325048127), including all migration application, disposable fixture setup, scoped getter/catalog checks, tenant/lifecycle qualification, full tests, migration-audit policy tests, and runtime-boundary verification.

A full read-only compare of `main` to the candidate confirms 10 added migration files in the branch diff (the eight ledger entries discussed in the sandbox audit plus two additional migrations that are not among those eight ledger extras), and broad application changes. The candidate modifies `.github/workflows/ci.yml`, `src/db/migrate.ts`, `src/db/postgres-target-guard.ts`, migration checksum tests, auth/config/app/API handlers, and adds business registration identity and engagement functionality. This is not a surgical migration-baseline patch.

Recommended safe decision path:
1. Maintainers choose whether candidate integration is still wanted and nominate a reviewer/owner for the full 55-commit diff.
2. If wanted, integrate/rebase/merge it through the normal reviewed PR path, resolve the nine commits of divergence from `main`, and pass CI on the resulting target branch; do not use the sandbox ledger as the reason to force-merge it.
3. Independently reconcile the shared sandbox ledger to the approved commit history, preserving historical checksums and recording provenance.
4. Re-review the storage migration on the selected baseline and only then approve a separately controlled sandbox application.

No decision has been supplied on Issue #185 as of this checkpoint. This is an explicit governance blocker, not a reason to perform speculative writes. Shared sandbox and production remain unchanged; production R2 remains on hold.


### Final verification checkpoint for integration-path note — 2026-10-26

Exact-head CI for commit `ad4c487741ffe0ced4f4ad53a25296b238d836fc` passed in [CI #1709](https://github.com/zaidhqdev-sys/GHM/actions/runs/40325419562). All workflow steps succeeded, including isolated least-privilege database roles, build, all migrations on disposable PostgreSQL, fixture setup, scoped getter/catalog checks, storage lifecycle and tenant authorization qualification, full tests, migration-audit policy tests, and runtime-boundary verification.

The shared Render sandbox ledger remains read-only-audited, not changed. Issue #185 still has no recorded maintainer decision on the approved migration baseline or integration strategy. The candidate branch divergence is documented; no PR merge, ledger rewrite, persistent DB migration, or production/R2 configuration change is authorized by this CI result.


### Latest handover CI confirmation — 2026-10-26 evening

Exact-head workflow [CI #1710](https://github.com/zaidhqdev-sys/GHM/actions/runs/40325755365) completed successfully. Every job step passed, including isolated least-privilege PostgreSQL roles, build, full migrations on disposable PostgreSQL, storage fixture setup, scoped getter/catalog qualification, lifecycle and tenant-authorization qualification, full tests, migration-audit policy tests, and runtime-boundary verification.

The operational blocker remains unchanged: Issue #185 has no maintainer-approved migration baseline/integration decision, and PRs #142 and #184 remain open drafts. Do not apply the storage migration to the shared Render sandbox, alter historical migration checksums, merge the diverged integration candidate wholesale, or change production R2 configuration without the explicit approved baseline and rollout authorization.

No persistent database was modified by this CI run.


### Latest exact-head verification and decision request — 2026-10-26

The handover-only commit `6aabb57ba176d9af1f33fde5993c0314d8ce4358` passed [CI #1711](https://github.com/zaidhqdev-sys/GHM/actions/runs/40386125737). The quality job completed successfully with every step green, including least-privilege PostgreSQL role setup, build, all migrations on disposable PostgreSQL, storage fixtures, scoped getter/catalog verification, lifecycle and tenant authorization checks, full tests, migration-audit policy tests, and runtime-boundary verification.

To make the remaining decision actionable, maintainers can reply on [Issue #185](https://github.com/zaidhqdev-sys/GHM/issues/185) with:
- **Approved baseline:** exact branch/commit for shared sandbox and production.
- **Integration candidate:** accept, revise/rebase, or decline PR #142, with a named reviewer/owner for its 55-ahead/9-behind divergence.
- **Ledger provenance:** confirm review of the eight extra entries and historical QuoteFlow checksum, preserving applied checksums.
- **Storage rollout:** approve or defer a separately scheduled sandbox migration after re-review against that baseline.

Until those items are explicitly decided, this remains a deployment blocker. CI success is not deployment approval. No persistent database, migration ledger, production service, or R2 configuration was changed.


### Exact-head CI #1712 result — 2026-10-26

[CI #1711](https://github.com/zaidhqdev-sys/GHM/actions/runs/40386125737) passed on handover commit `6aabb57ba176d9af1f33fde5993c0314d8ce4358`. The subsequent handover-only commit `2233183502068a87ff0dfb51af8060d0260a93b2` was validated by [CI #1712](https://github.com/zaidhqdev-sys/GHM/actions/runs/40386514328), whose quality job and every step completed successfully. The checks include disposable PostgreSQL migration application, storage getter/catalog checks, fixture-backed tenant/lifecycle qualification, full tests, migration-audit policy tests, and runtime-boundary verification.

No maintainer has checked off the baseline decision in Issue #185. Do not apply the migration to Render, merge the diverged candidate, edit historical checksums, or change production R2 settings without explicit approval. No persistent database writes were performed.

## GHM Identity Qualification — storage environment configuration (2026-10-26)

The project owner reports that the environment variables below have been saved and deployed on the Render service **GHM Identity Qualification**. This records the reported configuration state; it does not independently verify each value or prove that Cloudflare R2 operations succeed.

- Service: `ghm-identity-qualification` (Render service ID `srv-dbahvenbtjjs73f83rlg`).
- Dashboard: https://dashboard.render.com/web/srv-dbahvenbtjjs73f83rlg
- Deployment/environment state: owner-confirmed saved and deployed on 2026-10-26.
- Configured variable names:
  - `CORS_ORIGINS`
  - `DATABASE_SSL`
  - `DATABASE_URL`
  - `GHM_AUTH_TOKEN_PEPPER`
  - `GHM_JWT_ES256_KID`
  - `GHM_JWT_ES256_PRIVATE_KEY_PEM`
  - `GHM_JWT_ES256_PUBLIC_KEY_PEM`
  - `GHM_MIGRATOR_DATABASE_URL`
  - `GHM_NONPRODUCTION_DATABASE_NAME`
  - `GHM_QUALIFICATION_DATABASE_NAME`
  - `INVITE_CODE`
  - `NODE_ENV`
  - `PAYFAST_CANCEL_URL`
  - `PAYFAST_ENVIRONMENT`
  - `PAYFAST_MERCHANT_ID`
  - `PAYFAST_MERCHANT_KEY`
  - `PAYFAST_NOTIFY_URL`
  - `PAYFAST_PASSPHRASE`
  - `PAYFAST_RETURN_URL`
  - `STORAGE_ACCESS_KEY_ID`
  - `STORAGE_BUCKET`
  - `STORAGE_DOWNLOAD_GRANT_MAX_TTL_SECONDS`
  - `STORAGE_ENDPOINT`
  - `STORAGE_FORCE_PATH_STYLE`
  - `STORAGE_PROVIDER`
  - `STORAGE_REGION`
  - `STORAGE_SECRET_ACCESS_KEY`
  - `STORAGE_UPLOAD_GRANT_TTL_SECONDS`

Secret values and connection strings are intentionally excluded from this handover. Do not copy secret values into repository files, commits, issues, or chat.

### Storage qualification status

- [x] Owner reports all required storage environment variable names are present on GHM Identity Qualification.
- [x] Owner reports the environment changes were saved and deployed.
- [ ] Confirm the deployed service is running the intended Cloudflare R2/S3 storage-wiring code revision; environment presence alone does not establish code-version alignment.
- [ ] Check the service deployment/startup logs for storage configuration validation errors.
- [ ] Run a non-destructive storage qualification against the configured R2 bucket (for example, upload/read/delete a uniquely named test object if the qualification procedure supports it), and verify account-scoped metadata authorization.
- [ ] Record the qualification result and deployed commit after those checks complete.

Do not change the production-connected `GHM-Internal-Runtime` service or its database/migrator configuration as part of this sandbox/qualification work. Keep qualification, sandbox, and production targets separate.

## Identity Qualification R2 follow-up — 2026-10-26 20:25 UTC

- Owner confirmed the 28 environment variable names listed above are saved and deployed on `ghm-identity-qualification` (`srv-dbahvenbtjjs73f83rlg`).
- Live Render service metadata confirms the service was running from `integration/ghm-identity-merge-candidate-20261018` at commit `e5462b05e8b2b9cbc7a445c8464590a4f6d32a53`. That revision contains the storage provider classes but does not load storage configuration or register storage HTTP routes in `src/config.ts` / `src/http/app.ts`; environment variables alone therefore did not activate the R2 API.
- Created draft PR [#186](https://github.com/zaidhqdev-sys/GHM/pull/186) to integrate the storage runtime into the identity-qualification branch without replacing its identity work. The draft adds config/runtime wiring, authenticated routes and authorization adapter, the account-scoped metadata getter migration, and storage tests.
- CI run [#1724](https://github.com/zaidhqdev-sys/GHM/actions/runs/40395254306) **passed** on 2026-10-26: build, disposable PostgreSQL migration chain, qualification, and test suite succeeded.
- **Not deployed yet.** Render's service is configured with auto-deploy off and remains on the integration branch. Do not run migrations using `GHM_MIGRATOR_DATABASE_URL` until its target is confirmed as the qualification database. The migration runner requires explicit `GHM_MIGRATION_DATABASE_NAME` and `GHM_MIGRATION_DATABASE_HOST` guards; those names were not in the owner's reported environment list. Do not weaken the target guard or point it at production.
- Next safe sequence: align the qualification service to the PR branch after reviewing/merging the storage integration; explicitly identify the qualification database/host for the migration guard; apply the pending storage migration only to that non-production target; then deploy and verify startup, authenticated upload/access/delete flow, and tenant-isolation behavior. Leave `GHM-Internal-Runtime` untouched.

## Rollout update — 2026-10-26 20:28 UTC

- Storage runtime integration was merged into `integration/ghm-identity-merge-candidate-20261018` via [PR #186](https://github.com/zaidhqdev-sys/GHM/pull/186), merge commit `ef09793aaf8484ffa163fac0fcc80c0face3dae5`.
- Post-merge CI [run #1726](https://github.com/zaidhqdev-sys/GHM/actions/runs/40396014963) completed successfully.
- The Render service `ghm-identity-qualification` remains configured for the integration branch with manual deploy only; its currently live deploy is still commit `e5462b05e8b2b9cbc7a445c8464590a4f6d32a53`. No deployment of the new merge commit has been triggered.
- **Deployment is intentionally held at the database-migration gate.** The service's migration runner requires `GHM_MIGRATION_DATABASE_NAME` and `GHM_MIGRATION_DATABASE_HOST`, neither of which appears in the owner-reported environment-variable list. Render's available SQL interface is read-only and cannot apply the migration. The live value of `GHM_MIGRATOR_DATABASE_URL` cannot be verified from the service metadata, so do not assume it targets `ghm_payfast_sandbox_db`.
- Next operation must use a writable, explicitly verified qualification-database migration path with target guards, then deploy the already-merged commit and run live storage smoke tests. Keep the production-connected `GHM-Internal-Runtime` untouched.

## Addendum — storage and migration reconciliation (2026-10-26 21:39 UTC)

This addendum supersedes earlier next-step statements in this handover that said the sandbox migration was still blocked or had not yet been applied. It does not change the production safety boundary.

### Qualification database migration — PASS

- Target: Render PostgreSQL database `ghm_payfast_sandbox_db` (`dpg-db4416vlk1mc73eocug0-a`).
- The local `npm run migrate` completed with PowerShell `$LASTEXITCODE = 0` on 2026-10-26.
- Before the successful run, commit [`5229b37700f2e21ac4caf2d4c5547bb929ab2de8`](https://github.com/zaidhqdev-sys/GHM/commit/5229b37700f2e21ac4caf2d4c5547bb929ab2de8) restored the exact historical SQL bytes for `20261020130000_create_quoteflow_migration_business_provisioning.sql`, resolving its applied-checksum mismatch. The restored file matches the historical database checksum; the migration runner accepted supported legacy line-ending checksums and exited successfully.
- Read-only catalog checks after migration confirmed `ghm.storage_get_object(bigint,bigint)` exists, the legacy one-argument overload is absent, storage lifecycle functions are `SECURITY DEFINER` owned by `ghm_schema_owner`, and execution is granted to `ghm_runtime`. The storage table ACL did not grant direct runtime DML.
- No production migration was run. Keep `GHM-Internal-Runtime` and production database `ghm_db` untouched.

### Live R2 provider qualification — PASS

Command run locally on 2026-10-26:
`npm run qualify:storage-live-provider`

Build and all live checks passed: signed upload grant, signed PUT, provider HEAD, content-type/size metadata match, signed download grant, downloaded payload integrity (39 bytes), provider DELETE, and confirmation that the deleted object was absent. Evidence is recorded in `docs/evidence/STORAGE_LIVE_PROVIDER_QUALIFICATION_2026-10-26.md`.

The existing bucket was `zaid-ghm-production`, the only bucket created so far. The test object key was `qualification/storage-live/1793050677636-1c3c234d-7b62-4c99-805d-b95a15020b1f.bin`; the qualification reported deletion and absence checks PASS. Because the bucket name indicates production, do not treat this as a dedicated non-production bucket or run additional mutation tests there by default. No credentials or signed URLs belong in source control or handover notes.

### Still open

- The live provider test does **not** qualify the authenticated application/API path or the database-backed storage persistence harness end to end.
- Run `scripts/qualify-storage-persistence.mjs` only against the explicitly guarded qualification database, using the intended restricted qualification/runtime role and the script's required mutation opt-in. Do not substitute the migrator URL or production database.
- Application composition-root wiring, full tenant/resource authorization, failure recovery/orphan reconciliation, backup/recovery, HTTP/product exposure, and production enablement/cutover remain separate gates.
- The old paragraph above saying the next operation must first apply the sandbox migration is historical and superseded by this addendum; the sandbox migration run is complete.


## Addendum — runtime database identity guard deployed and verified (2026-10-31)

This addendum records a qualification-only code deployment. It does not authorize production deployment, database changes, role/grant changes, or product cutover.

### Implementation and local checks

- Commit: [`7a17a781a9a1910a6ea76b8819f4714680ac282e`](https://github.com/zaidhqdev-sys/GHM/commit/7a17a781a9a1910a6ea76b8819f4714680ac282e) on `integration/ghm-identity-merge-candidate-20261018`.
- `src/db/runtime-identity.ts` checks that PostgreSQL `session_user` and `current_user` are both `ghm_runtime`; `src/db/runtime-startup.ts` runs this check before the HTTP listener is opened.
- Local validation: 680 tests passed, 0 failed, 1 skipped; TypeScript build passed; `git diff --check` clean.

### Render qualification deployment

- Service: `ghm-identity-qualification`; ID `srv-dbahvenbtjjs73f83rlg`.
- Target: owner-confirmed sandbox database `ghm_payfast_sandbox_db` (`ghm-payfast-sandbox-db`), not production `ghm_db`.
- Deployment: `dep-dbildsu417fc73a3cpu0`; status `live`; deployed commit `7a17a781a9a1910a6ea76b8819f4714680ac282e`.
- Render build command `npm ci --include=dev && npm run build` completed successfully. Startup log: `GHM Core Engine listening on port 10000`.
- Live readiness probe on 2026-10-31: `GET https://ghm-identity-qualification.onrender.com/readyz` returned HTTP 200 and `{"status":"ready"}`.

### Database role audit and limitations

- Read-only sandbox catalog inspection found `ghm_runtime` is not a superuser and has no CREATEROLE, CREATEDB, REPLICATION, or BYPASSRLS attribute; the inspected role-membership closure contained no memberships.
- The runtime identity query also selects `current_database()`, but the current code does **not** assert an expected database name. This remains a code-level limitation to address only through a separately reviewed change.
- These checks do not prove the full effective table/object privilege surface or qualify all product/API workflows.
- Render build output reported 3 npm audit findings: 1 moderate, 1 high, 1 critical. Dependency triage remains open; do not blindly run `npm audit fix`.

No production service, production database, credentials, environment variables, database roles/grants, network allowlists, payment settings, or product routing were changed. Do not point qualification or migration commands at `ghm_db`; keep `GHM-Internal-Runtime` and production configuration untouched.
