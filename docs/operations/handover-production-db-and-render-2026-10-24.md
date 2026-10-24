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
