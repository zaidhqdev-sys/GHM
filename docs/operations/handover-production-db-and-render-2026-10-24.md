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
