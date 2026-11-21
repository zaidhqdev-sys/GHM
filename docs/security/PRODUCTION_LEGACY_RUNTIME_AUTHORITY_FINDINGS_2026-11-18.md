# Production Legacy Runtime Authority Findings — 18 November 2026

**Status:** READ-ONLY EVIDENCE — REMEDIATION BLOCKED; DO NOT MUTATE  
**Target:** Render `ghm-db` / database `ghm_db`  
**Runtime service:** Render `GHM-Internal-Runtime` (`srv-damupsek1f9s73eq8kkg`)  
**Branch reviewed:** `feat/actor-gateway-production-migration-batches`  
**Current consolidated draft PR:** #298  
**No production action authorized by this report.**

## 1. Required handover and PR review completed first

Before the database and service inspection, this pass re-read:
- `docs/security/PRODUCTION_ROLE_SERVICE_DEPENDENCY_MAP_2026-11-18.md`;
- `docs/security/PRODUCTION_MIGRATOR_AUTHORITY_REMEDIATION_PLAN_2026-11-18.md`;
- `docs/architecture/GHM_LEGACY_ROLE_DEPENDENCY_QUALIFICATION.md`;
- `docs/architecture/GHM_LEGACY_ROLE_REMEDIATION_AUDIT.md`;
- `docs/architecture/GHM_LEGACY_BOOTSTRAP_AUTHORITY_AUDIT.md`;
- `docs/HANDOVER_2026-11-12_DATABASE_GRANT_AUTHORITY_REVIEW.md`;
- production migration reconciliation and Actor Gateway migration-batch handovers;
- PR #275 (merged), #298 (draft), #296 (draft) and #299 (draft), including the PR #275 merge contract.

PR #275, **Isolate Resource API runtime database login**, merged on 12 November as merge commit `ad4fea43f2eb7bf959042b9db77e0f0f86e6bb531` (PR metadata exact merge SHA recorded in the PR). Its code contract requires production `GHM_RUNTIME_DATABASE_URL` and startup identity `session_user = current_user = ghm_runtime`. Its own release notes explicitly say not to deploy until the dedicated runtime credential is provisioned through the controlled secret-management path and end-to-end identity is verified.

## 2. Production deployment state corrects the prior assumption

Render service metadata and deployment history show:

- Service branch: `main`.
- Auto-deploy: OFF.
- Region: Frankfurt.
- Current live deployment commit: `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf` (10 November 2026).
- A 15 November build for `8f3ee5748679c736aaefc7bcf9f6716b5453314a` failed.
- A subsequent 15 November deployment for `fe5a82d856f8733d0094e7d4599733da93537719` failed during deploy with non-zero exit.
- The live deployment remains `c7cf1eb`; the failed newer deploys did not replace it.

The exact source at the live commit was fetched from GitHub:

- `src/config.ts` unconditionally requires `DATABASE_URL`; it does not require `GHM_RUNTIME_DATABASE_URL`.
- `src/db/pool.ts` uses `config.databaseUrl`.
- `src/server.ts` only executes `SELECT 1` before listening. It has no runtime principal assertion and no role privilege startup guard.

Therefore the merged PR #275 isolation contract is **not yet in the production deployment**. The 15 November listening logs do not prove runtime identity; they are consistent with the old `SELECT 1` startup check.

The Render environment-variable values were not read. This report does not assert which exact PostgreSQL login the live `DATABASE_URL` resolves to. It establishes that the deployed code does not enforce the dedicated `ghm_runtime` identity. The identity of the live process remains unqualified until the controlled secret/deployment gate is completed.

## 3. Live legacy authority chain and effective privileges

Fresh read-only PostgreSQL catalogue queries reconfirmed:

| Membership | ADMIN | INHERIT | SET | Grantor |
|---|---:|---:|---:|---|
| `ghm_app_user -> ghm_db_user` | false | true | true | `postgres` |
| `ghm_db_user -> ghm_runtime` | true (bootstrap edge) | false | false | `postgres` |
| `ghm_db_user -> ghm_runtime` | false (separate edge) | true | true | `ghm_db_user` |
| `ghm_db_user -> ghm_migrator` | true | false | false | `postgres` |
| `ghm_db_user -> ghm_schema_owner` | true | false | false | `postgres` |

The complete six bootstrap ADMIN OPTION list remains in the role/service dependency map and remediation plan; this table only highlights the edges relevant to the legacy runtime chain.

Role flags:
- `ghm_app_user`: LOGIN/INHERIT, no SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS flags.
- `ghm_db_user`: LOGIN/INHERIT, CREATEDB=true and CREATEROLE=true; no SUPERUSER/REPLICATION/BYPASSRLS.
- `ghm_runtime`: LOGIN/NOINHERIT, no elevated attributes.

The membership `ghm_app_user -> ghm_db_user` has SET=true and INHERIT=true. Effective privilege checks show `ghm_app_user` has public-schema CREATE and effective SELECT/INSERT/UPDATE/DELETE on all five legacy public tables. This is the live legacy application authority path; the application login can assume the legacy role through the granted SET path. Do not remove this path until production runtime cutover and recovery dependencies are proven.

## 4. Legacy object ownership and access snapshot

Current `ghm_db_user` ownership in non-system schemas:

- Schema: `public`.
- Tables: `public.files`, `public.password_reset_tokens`, `public.profiles`, `public.todos`, `public.users` (five).
- Sequences: corresponding five `*_id_seq` sequences.
- Indexes: ten indexes across those tables.
- PostgreSQL TOAST internals: four TOAST tables and four TOAST indexes under `pg_toast`.
- No routines owned by either legacy role were returned.
- No default ACL rows owned by either legacy role were returned.
- No large objects exist.
- No public-schema triggers were returned.
- No database is owned by either legacy role; `public` schema is owned by `ghm_db_user`.

Effective access check:
- `ghm_app_user`: SELECT/INSERT/UPDATE/DELETE on each of the five legacy tables; public schema USAGE and CREATE.
- `ghm_runtime`: no SELECT/INSERT/UPDATE/DELETE on those five legacy tables; public schema USAGE but no CREATE.
- `ghm_migrator`: no direct SELECT/INSERT/UPDATE/DELETE on those five legacy tables; no public schema CREATE.

The no-direct-access result for `ghm_runtime` and `ghm_migrator` is desirable isolation, but it does not establish that the currently deployed API uses `ghm_runtime`. The current live commit still accepts only `DATABASE_URL` and does not assert identity.

The legacy data audit and QuoteFlow provenance handover must continue to preserve the two legacy `public.users` rows until their disposition is separately reconciled. This pass queried metadata and privilege booleans only; it did not read user records or row contents.

## 5. Runtime and migration source contract

Merged PR #275 source requires:
- production `GHM_RUNTIME_DATABASE_URL`;
- `session_user = current_user = ghm_runtime`;
- no database CREATE or schema CREATE;
- database CONNECT and `ghm` schema USAGE;
- NOINHERIT and no elevated attributes;
- no untrusted membership paths, except the explicitly documented trusted Render administrator membership.

The current live source predates that contract and uses generic `DATABASE_URL`. The standalone migrator contract separately requires `GHM_MIGRATOR_DATABASE_URL`, exact `ghm_migrator` identity, and explicit SET ROLE to `ghm_schema_owner`. This pass did not run either qualification script because the production credential values were not accessed and no credential identity was supplied to this read-only investigation.

## 6. Decision and safe sequence

**Current decision: REMEDIATION_PENDING — DO NOT REVOKE OR ALTER ROLES.**

Required sequence:
1. Through the controlled secret-management path, establish whether the intended production `GHM_RUNTIME_DATABASE_URL` credential exists and resolves to `ghm_runtime`; do not expose the URL or password.
2. Reconcile the failed 15 November deployment/build blockers and the required startup guard before considering any deployment. Auto-deploy remains OFF; no deploy is authorized by this report.
3. Only after a controlled production cutover and successful runtime identity/privilege qualification, prove no application request, background process, recovery procedure, or support operation uses `ghm_app_user` / `ghm_db_user`.
4. Separately qualify the migration credential and exact production ledger/backup evidence.
5. Preserve the legacy public user rows and reconcile every owned object before any membership removal, ownership transfer, or role retirement.
6. Prepare a separate narrowly scoped mutation plan with exact preconditions, rollback, post-checks and provider/bootstrap authority. This report does not authorize that plan's execution.

## 7. Change record

Only GitHub source/PR/handover reads, Render service/deploy/log metadata reads, and PostgreSQL SELECT/catalogue queries were used. No secret values or environment variable values were read. No database data was changed; no role, membership, ACL, schema, object ownership, credential, service, environment variable, deployment, migration, backup, payment state, CI or schedule was changed. No additional cost was incurred.


## 18 November 2026 — exact Render deployment blockers established

Added `docs/security/PRODUCTION_RUNTIME_DEPLOYMENT_BLOCKERS_2026-11-18.md` (commit `ddfebdf6fbe90b4d893690254ce6335b0ad09419`). This review first re-read the runtime findings, role/service map, migrator plan, migration reconciliation, database authority, Actor Gateway hosting handover and PR #275/#298/#296/#299.

Render event/log evidence now establishes both November 15 failures:
1. Deploy `dep-dbsv8cuk1f9s73ada3ig`, commit `8f3ee574...`: build command was `npm ci && npm run build`; TypeScript failed TS7016 for `pg`, `express`, `jsonwebtoken`, plus TS7006 implicit-any errors caused by missing Express types. The exact repository manifest has `@types/pg`, `@types/express`, and `@types/jsonwebtoken` in devDependencies. Correct deployment build command is `npm ci --include=dev && npm run build`.
2. Deploy `dep-dbsva6c9v7es73bordlg`, commit `fe5a82d8...`: build succeeded, then process exited with `GHM_ACTOR_GATEWAY_URL is required when production storage is enabled`. This is the intentional fail-closed application guard. No dedicated production Actor Gateway host exists, and the hosting handover blocks another paid always-on service. No placeholder, self-reference, sandbox URL, or bypass is acceptable.

Therefore the build fix alone cannot make PR #275 deployable. Keep auto-deploy OFF; wait for an affordable/approved genuine gateway host, qualify its identity/credential/ACL/signed assertion contract, then prepare the runtime cutover. Do not deploy, edit environment variables, change roles/ACLs, or incur cost.

No Render configuration, secrets, deployment, database, CI, payment state or hosting resource was changed.
