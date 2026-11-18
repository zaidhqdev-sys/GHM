# Production Runtime Deployment Blockers — 18 November 2026

**Status:** VERIFIED BLOCKERS — NO DEPLOYMENT AUTHORIZED  
**Service:** Render `GHM-Internal-Runtime` (`srv-damupsek1f9s73eq8kkg`)  
**Current live commit:** `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`  
**Auto-deploy:** OFF  
**Repository branch reviewed:** `feat/actor-gateway-production-migration-batches`  
**Relevant merged PR:** #275 (runtime DB identity guard; merge commit `ad4fea43f2eb7bf959042b9db77a9f86e6bb531`)

## 1. Review sequence

Before inspecting deployment events/logs, this pass re-read:
- `docs/security/PRODUCTION_LEGACY_RUNTIME_AUTHORITY_FINDINGS_2026-11-18.md`;
- `docs/security/PRODUCTION_ROLE_SERVICE_DEPENDENCY_MAP_2026-11-18.md`;
- `docs/security/PRODUCTION_MIGRATOR_AUTHORITY_REMEDIATION_PLAN_2026-11-18.md`;
- `docs/HANDOVER_2026-11-15_PRODUCTION_MIGRATION_RECONCILIATION.md`;
- `docs/HANDOVER_2026-11-17_ACTOR_GATEWAY_MIGRATION_BATCHES.md`;
- `docs/HANDOVER_2026-11-12_DATABASE_GRANT_AUTHORITY_REVIEW.md`;
- `docs/HANDOVER_2026-11-16_ACTOR_GATEWAY_HOSTING_AND_CREDENTIALS.md`;
- PR #275, #298, #296 and #299.

PR #275 is merged. PR #298, #296 and #299 remain draft/open. No PR state changed.

## 2. November 15 deployment attempt A — TypeScript build failed

Render deployment:
- Deploy ID: `dep-dbsv8cuk1f9s73ada3ig`
- Build ID: `bld-dbsv8cuk1f9s73ada3j0`
- Commit: `8f3ee5748679c736aaefc7bcf9f6716b5453314a`
- Started: 2026-11-15 18:04:35 UTC
- Build ended: 18:04:45 UTC, `build_failed`, exit status 2.
- Render used build command: `npm ci && npm run build`.
- Render selected Node.js 26.13.1.

The build log explicitly reports TypeScript TS7016 missing declaration files for:
- `pg` (runtime dependency);
- `express` (runtime dependency);
- `jsonwebtoken` (runtime dependency).

It also reports TS7006 implicit-any callback parameters as a consequence of the missing Express typings.

The exact repository `package.json` at the reviewed branch confirms these declaration packages are present under `devDependencies`:
- `@types/pg ^8.11.5`
- `@types/express ^4.17.21`
- `@types/jsonwebtoken ^9.0.0`

The service build command `npm ci && npm run build` omitted development dependencies in the Render build environment, so TypeScript could not resolve the declared type packages. This is a build-command/dependency-installation mismatch, not a missing application runtime package.

**Required build command when this service is next deliberately prepared for deployment:**  
`npm ci --include=dev && npm run build`

Do not use `npm ci --omit=dev`, do not move type-only packages into runtime dependencies merely to mask the build configuration, and do not change TypeScript strictness or suppress TS7016/TS7006.

## 3. November 15 deployment attempt B — runtime failed closed on Actor Gateway URL

Render deployment:
- Deploy ID: `dep-dbsva6c9v7es73bordlg`
- Build ID: `bld-dbsva6c9v7es73bordm0`
- Commit: `fe5a82d856f8733d0094e7d4599733da93537719`
- Started: 2026-11-15 18:08:25 UTC
- Build ended: 18:08:44 UTC, succeeded.
- Deploy ended: 18:08:58 UTC, `update_failed`, process exit status 1.

The application reached `npm start` and then exited with the exact error:

`Error: GHM_ACTOR_GATEWAY_URL is required when production storage is enabled`

The stack points to `dist/http/app.js` in `createApp()`, called by `dist/server.js`.

This is an intentional fail-closed production configuration requirement. The log proves the required URL was not supplied to that process. It does not justify supplying a placeholder, a loopback URL, the Resource API's own URL, or a sandbox service URL.

The current production Render inventory has no dedicated Actor Gateway service. The 16 November hosting/credential handover explicitly rejects using the Resource API, unrelated workforce service, or sandbox/qualification services as substitutes. A new always-on service would incur recurring cost and is outside the user's approved budget.

**Disposition:** keep the production Actor Gateway URL requirement intact. No environment variable was changed. No URL was invented or populated.

## 4. Consequence for PR #275 runtime identity cutover

PR #275's dedicated `GHM_RUNTIME_DATABASE_URL` and startup principal checks are merged but not deployed. The currently live source at `c7cf1eb` still uses generic `DATABASE_URL` and has no principal assertion.

Even after the build command is corrected, the currently merged application will still refuse to start without a real, reachable, dedicated production Actor Gateway endpoint. Therefore the build command correction alone is not sufficient to deploy PR #275.

Do not:
- deploy the current tree with a placeholder or fake gateway URL;
- disable the Actor Gateway requirement or bypass gateway-backed production operations;
- point `GHM_ACTOR_GATEWAY_URL` at `GHM-Internal-Runtime` itself;
- repurpose the sandbox callback, qualification, or identity services;
- create another paid service, database, schedule or worker;
- alter DB roles, memberships, grants, secrets, or payment state to make the deployment start.

## 5. Safe next steps

1. Keep auto-deploy OFF and production on the last known live commit.
2. Preserve the exact build fix `npm ci --include=dev && npm run build` in the deployment runbook for the next approved service configuration change.
3. Do not deploy until a genuine production Actor Gateway endpoint is available under an approved hosting/cost decision, and its database credential, signed-assertion verification, ACLs, and service isolation are qualified.
4. At that point, check the runtime secret boundary without printing values, confirm `GHM_RUNTIME_DATABASE_URL` resolves to `ghm_runtime`, and only then prepare a controlled deployment plan for PR #275.
5. Verify startup identity and runtime privilege checks from the deployed service before considering any legacy membership or object ownership remediation.

## 6. Change record

Only existing handover/PR/source reads, Render service/deployment/event/log metadata reads, and package manifest reads were used. No environment variable values or secrets were read. No Render service configuration, build command, environment variable, deployment, database role, membership, ACL, migration, data, backup, payment state, CI, schedule, or hosting resource was changed. No additional cost was incurred.

## 19 November 2026 — hosting decision superseded for early access

The owner has now explicitly selected Render **Free** for the initial ghm-actor-gateway early-access stage supporting the free directory service. The prior statement that an always-on paid service is a prerequisite is superseded for this stage. The owner intends to reassess paid hosting/provider requirements before paid live launch.

This changes the hosting/cost decision only. It does **not** clear the technical production blockers in this document:
- the gateway role lacks ghm schema USAGE and the gateway API functions are not installed;
- the dedicated identity, exact privilege allowlist and signed-assertion path still require qualification;
- production migration ledger reconciliation and recovery/authority gates remain unresolved;
- Resource API production configuration must not point to an unavailable or unqualified gateway.

Free compute may sleep and cold-start beyond the Resource API five-second timeout. Treat this as a known early-access availability limitation. Before relying on it for directory traffic, inspect the actual Resource API timeout/retry contract and establish safe client recovery. Do not weaken authentication or claim always-on availability.

The owner has the previously reviewed Render form filled but not submitted. Preserve it; the owner controls submission. This assistant has not submitted the form, created a service, deployed, or changed Render.

No database, migration, secret, role, ACL, payment, service, deployment or paid-resource action occurred.
