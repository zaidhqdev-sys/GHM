# Production PostgreSQL Role ↔ Service Dependency Map — 18 November 2026

**Status:** READ-ONLY INVENTORY — no role or service changes authorized  
**Repository branch:** `feat/actor-gateway-production-migration-batches`  
**PR:** #298, draft/open; reviewed head at time of inspection: `45384ef5e0c9b684e3cb1fc205bb61e92d8db43f`  
**Database:** Render `ghm-db` / `ghm_db`, PostgreSQL 18, Frankfurt  
**Render workspace:** existing ZAID Technologies workspace; no new resources requested or created

## Evidence reviewed first

Before inspecting production roles or services, this review re-read:
- `docs/security/PRODUCTION_MIGRATOR_AUTHORITY_REMEDIATION_PLAN_2026-11-18.md`;
- role-separation, production migration reconciliation and migration-batch handovers;
- `docs/HANDOVER_2026-11-16_ACTOR_GATEWAY_HOSTING_AND_CREDENTIALS.md`;
- the legacy role dependency qualification and remediation audit;
- database authority and runtime reconciliation documents;
- Auth Issuer isolation handover and PayFast production/callback handovers;
- PR #298, #296 and #299 status and heads, plus relevant historical PR #272, #274, #275 and PayFast PR #233;
- current source contracts for Resource API, Actor Gateway, Auth Issuer and PayFast callback.

PR #298, #296 and #299 remain draft/open. PR #272 is closed; PR #274 and #275 are closed. PayFast PR #233 remains draft/open. This inspection did not change PR state or merge code.

## 1. Live production role and membership snapshot

The Render SQL connector still authenticates as `session_user=ghm_app_user`, effective `current_user=ghm_db_user`. All SQL in this review was read-only.

| Role | Exists | LOGIN | INHERIT | Elevated flags | DB CONNECT | `ghm` USAGE | `ghm` CREATE |
|---|---:|---:|---:|---|---:|---:|---:|
| `ghm_runtime` | Yes | Yes | No | None | Yes | Yes | No |
| `ghm_migrator` | Yes | Yes | No | None | Yes | No | No |
| `ghm_schema_owner` | Yes | No | No | None | Yes | Yes | Yes |
| `ghm_actor_gateway` | Yes | Yes | No | None | Yes | No | No |
| `ghm_auditor` | Yes | No | Yes | None | Yes | Yes | No |
| `ghm_payment_provider` | Yes | Yes | No | None | Yes | Yes | No |
| `ghm_auth_issuer` | **No** | — | — | — | — | — | — |
| `ghm_db_user` | Yes | Yes | Yes | CREATEDB + CREATEROLE | Yes | Yes | Yes |
| `ghm_app_user` | Yes | Yes | Yes | None | Yes | Yes | No |

For the target roles, SUPERUSER, REPLICATION and BYPASSRLS are false. LOGIN roles other than the legacy `ghm_db_user` have CREATEDB=false and CREATEROLE=false.

### Complete observed bootstrap membership edges

The following six edges are granted by bootstrap `postgres` to `ghm_db_user`; each has ADMIN OPTION=true, INHERIT=false and SET=false:

- `ghm_db_user -> ghm_actor_gateway`
- `ghm_db_user -> ghm_auditor`
- `ghm_db_user -> ghm_migrator`
- `ghm_db_user -> ghm_payment_provider`
- `ghm_db_user -> ghm_runtime`
- `ghm_db_user -> ghm_schema_owner`

Two other edges are distinct and must not be conflated with those six:
- `ghm_app_user -> ghm_db_user`, granted by `postgres`, ADMIN=false / INHERIT=true / SET=true.
- `ghm_db_user -> ghm_runtime`, granted by `ghm_db_user`, ADMIN=false / INHERIT=true / SET=true.

The intended `ghm_migrator -> ghm_schema_owner` edge also exists, granted by `ghm_db_user`, ADMIN=false / INHERIT=false / SET=true.

The six bootstrap edges are not a blanket revoke list. Each must be mapped to a live credential, active service, operational fallback, ownership and recovery dependency before any provider-authorized change.

## 2. Role-by-role service and credential dependency

### `ghm_runtime` — Resource API

- **Intended consumer:** existing Render `GHM-Internal-Runtime` service (`srv-damupsek1f9s73eq8kkg`), Frankfurt, Free plan, branch `main`, build `npm ci --include=dev && npm run build`, start `npm start`, health `/healthz`, auto-deploy OFF.
- **Source contract:** production `src/config.ts` requires `GHM_RUNTIME_DATABASE_URL`; `src/server.ts` verifies `session_user=current_user=ghm_runtime` at startup. The older generic `DATABASE_URL` fallback is development-only.
- **Secret boundary:** actual Render environment values were not read. Do not disclose, rotate or copy the URL. The role-to-service binding is the intended contract; the live secret value cannot be independently proven from this read-only inventory.
- **Live DB evidence:** role exists, LOGIN/NOINHERIT, CONNECT and schema USAGE true, CREATE false. No `ghm_runtime` connection was present in the point-in-time `pg_stat_activity` snapshot. This is not proof the service never connects.
- **Do not remove:** the non-admin `ghm_db_user -> ghm_runtime` SET/INHERIT edge until a reviewed credential/service cutover proves the production Resource API no longer depends on the legacy path. Keep the bootstrap ADMIN OPTION edge separately classified for provider-authority remediation.
- **Open verification:** confirm runtime's configured secret resolves to `ghm_runtime` using the approved local secret source without printing it; verify runtime function allowlist enforcement state without exposing environment values.

### `ghm_migrator` — standalone migration operator

- **Intended consumer:** the standalone repository migration runner, not a continuously running Render web service.
- **Source contract:** `GHM_MIGRATOR_DATABASE_URL`; the runner requires `session_user=current_user=ghm_migrator`, then explicitly `SET ROLE ghm_schema_owner`.
- **Live DB evidence:** role exists, LOGIN/NOINHERIT, CONNECT true, schema USAGE/CREATE false. Its intended single SET membership to `ghm_schema_owner` is correct.
- **Contract failure:** the live runner preflight still fails because `ghm_db_user` has the bootstrap ADMIN OPTION membership and the migrator retains explicit direct ACLs on 16 relations and 24 sequences. Direct ledger SELECT is false; ledger access is expected only after SET ROLE to the owner.
- **No service:** no Render migration-runner service exists in the current service inventory. The credential is an operator-controlled secret and must not be put into the Resource API or Actor Gateway.
- **Open verification:** exact production ledger access/audit through the dedicated credential remains blocked; no connection as `ghm_migrator` was visible in the point-in-time activity snapshot.

### `ghm_schema_owner` — non-login ownership identity

- **Intended consumer:** no application or hosted service. It owns schema `ghm` and governed objects; the migration process enters it explicitly through the migrator's SET-capable membership.
- **Live DB evidence:** role exists, NOLOGIN/NOINHERIT, no elevated flags, database CREATE true, schema USAGE/CREATE true.
- **Credential:** none by design. Do not set a password, enable LOGIN, or create a service for this role.
- **Preserve:** schema/object/ledger ownership and the single intended `ghm_migrator -> ghm_schema_owner` SET edge.

### `ghm_actor_gateway` — dedicated authorization boundary

- **Intended consumer:** a dedicated Render Web Service named `ghm-actor-gateway`, Frankfurt, using `npm run start:actor-gateway` and `GHM_ACTOR_GATEWAY_DATABASE_URL`. It must be isolated from the Resource API.
- **Hosting decision:** no such production service exists. The 16 November hosting handover explicitly rejects using `GHM-Internal-Runtime`, `zaid-ai-workforce`, or sandbox/qualification services as substitutes. A dedicated always-on service would add recurring cost and is not approved under the user's current no-additional-paid-service limit.
- **Live DB evidence:** role exists, LOGIN/NOINHERIT, CONNECT true, schema USAGE/CREATE false. No gateway/assertion functions were found in schema `ghm`; no gateway EXECUTE grants are available. The role is not provisioned for production use.
- **Credential:** `GHM_ACTOR_GATEWAY_DATABASE_URL` belongs only on the future dedicated service; never add it to Resource API configuration. `GHM_ACTOR_GATEWAY_URL` is the Resource API's HTTPS client origin, not a database credential.
- **Disposition:** do not set a gateway password, provision grants, deploy a free/sleeping substitute, or change the hosting decision. Wait for the separately approved cost and production migration gates.

### `ghm_auditor` — non-login audit privilege role

- **Intended consumer:** read-only audit authority, not a service login.
- **Live DB evidence:** role exists, NOLOGIN, INHERIT=true, non-elevated, schema USAGE true; it has SELECT on `ghm.ghm_schema_migrations`.
- **Membership reality:** the only observed member is `ghm_db_user`, via bootstrap `postgres`, ADMIN=true / INHERIT=false / SET=false. There is no direct LOGIN identity with a usable SET path into `ghm_auditor`.
- **Disposition:** the role currently represents a privilege grant target, not a usable audit connection. Do not turn it into LOGIN or add membership to `ghm_app_user` as a workaround. The migration audit remains the dedicated `ghm_migrator` + SET OWNER workflow, not an invented auditor connection.

### `ghm_payment_provider` — PayFast callback identity

- **Intended consumer:** the dedicated PayFast callback process `src/payfast-callback-server.ts`, using `PAYFAST_CALLBACK_DATABASE_URL`; its readiness check requires `session_user=current_user=ghm_payment_provider`.
- **Render inventory:** `ghm-payfast-callback-sandbox` (`srv-dbma100u01pc738qpavg`) exists on the separate sandbox environment, branch `release/payfast-settlement-isolation-main-20261104`, free plan, start `npm run start:payfast-callback`. It is not a production service. The sandbox API and identity-qualification services are likewise separate sandbox/qualification resources. Do not repurpose them for production.
- **Current production correction:** the live production role `ghm_payment_provider` now exists as LOGIN/NOINHERIT, with CONNECT and schema USAGE true and CREATE false. The two production functions `commercial_get_payfast_attempt(bigint)` and `commercial_apply_payfast_payment_result(...)` exist, and this role can execute them. `ghm_runtime` cannot execute either function. The generic `commercial_apply_payment_result(...)` is not executable by this provider role.
- **Historical documentation correction:** older 4–5 November PayFast notes stating that the production role or these functions were absent are stale relative to this 18 November live catalogue snapshot. This catalogue evidence does not prove which migration/operation installed them: exact production ledger rows/checksums remain inaccessible through the current connector.
- **Operational status:** PayFast remains paused. No production callback service was found in Render; no `ghm_payment_provider` connection was present in the point-in-time activity snapshot. The actual secret value/configuration was not read.
- **Disposition:** preserve the provider function boundary; do not activate payment, create/repurpose a callback service, rotate credentials, or infer production callback readiness from role/function existence.

### `ghm_auth_issuer` — planned isolated authentication issuer

- **Source contract:** issuer process exists in source (`src/auth-issuer/server.ts`, `start:auth-issuer`) and requires `GHM_AUTH_ISSUER_DATABASE_URL`; it is designed to authenticate as `ghm_auth_issuer`.
- **Live production evidence:** role `ghm_auth_issuer` does not exist. No dedicated production issuer service is present in the Render service inventory.
- **Disposition:** production issuer isolation is not deployed. Do not set issuer credentials, create the role, or claim the Auth Issuer is isolated. The Resource API currently remains the existing production process; the isolation/cutover handover remains a separate blocker.

## 3. Point-in-time activity evidence and limits

The read-only `pg_stat_activity` query at this inspection found only the current Render connector session as `ghm_app_user`; no sessions were visible for runtime, migrator, Actor Gateway, payment provider, auditor or Auth Issuer. This is one snapshot only. Idle/disconnected services, external clients, or activity at other times are not disproven.

No Render environment variable values, connection strings, passwords, private keys, signing material, callback secrets or credential metadata were read. Render service metadata was used only to identify service names, branches, plans, commands, regions and environment associations.

## 4. Remediation consequences

1. Do not bulk revoke the six bootstrap ADMIN OPTION memberships. Role consumers and recovery paths differ; Actor Gateway and Auth Issuer do not yet have production service cutovers, while runtime, migration and payment roles have distinct existing responsibilities.
2. Keep `ghm_db_user -> ghm_runtime` non-admin SET path until the Resource API's direct `ghm_runtime` credential is independently confirmed and the old connection path is proven unused.
3. Keep `ghm_migrator -> ghm_schema_owner` exactly as specified. Resolve the explicit migrator object ACLs only through the reviewed provider/bootstrap authority and narrowly scoped ACL plan.
4. Keep `ghm_payment_provider` function execution separate from `ghm_runtime`; PayFast remains paused and no production callback host is available.
5. Do not add Render services, databases, schedules, or recurring spend. The Actor Gateway always-on service is explicitly cost-blocked.
6. Obtain the exact production ledger and recoverable backup evidence through the approved provider/admin route before any production mutation or migration.
7. Treat the absence of a production Auth Issuer role/service as a distinct architecture blocker, not as a reason to add issuer credentials to the Resource API.

## 5. Change record

Read-only GitHub branch/PR/source/handover review, Render service inventory/detail reads, and PostgreSQL catalog/activity SELECTs only. No role, membership, ACL, object, data, secret, environment variable, service, deployment, migration, backup, network, payment or CI state was changed. No new or recurring cost was incurred.


## 18 November 2026 — production legacy runtime authority finding

Added `docs/security/PRODUCTION_LEGACY_RUNTIME_AUTHORITY_FINDINGS_2026-11-18.md` (commit `3f85fa345bcaa4acc6fb4da8146326efb62060be`). This follows the existing role/service map, migrator remediation plan, legacy role dependency and audit contracts, 12 November database authority handover, migration reconciliation/batch handovers, and PR #275/#298/#296/#299 review.

Critical correction: merged PR #275's dedicated runtime identity guard is **not deployed**. Render service `GHM-Internal-Runtime` is still on `main` at live commit `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`, with auto-deploy OFF. The 15 November attempts at `8f3ee574...` and `fe5a82d8...` failed. Source at live commit requires generic `DATABASE_URL`; startup only does `SELECT 1`; no runtime principal assertion. The exact current DB login remains unproven because Render env values were not read. Do not treat listening logs as identity proof.

Fresh read-only production checks: `ghm_app_user -> ghm_db_user` is ADMIN=false / INHERIT=true / SET=true. `ghm_db_user` remains LOGIN/INHERIT with CREATEDB and CREATEROLE; it has bootstrap ADMIN OPTION memberships. Effective privilege checks show `ghm_app_user` has public-schema CREATE and SELECT/INSERT/UPDATE/DELETE on five legacy public tables. `ghm_runtime` has no CRUD on those legacy tables; `ghm_migrator` has no direct CRUD there. `ghm_db_user` owns `public`, five legacy tables, five sequences and ten indexes (plus PostgreSQL TOAST internals). No owned routines/default ACLs/large objects/public triggers were returned. Two legacy `public.users` rows remain subject to the separate QuoteFlow provenance hold; no row contents were queried.

Next sequence is explicit: safely establish the dedicated runtime credential identity; resolve failed deployment blockers; perform a controlled, approved cutover and identity qualification; prove recovery/background/support dependencies absent; then separately qualify migrator and legacy object/data disposition. No revokes or role mutations are authorized.

No secret values, user records or env-var values read. No production changes, CI, deployment, migration, backup, payment action or additional cost.


## 18 November 2026 — exact Render deployment blockers established

Added `docs/security/PRODUCTION_RUNTIME_DEPLOYMENT_BLOCKERS_2026-11-18.md` (commit `ddfebdf6fbe90b4d893690254ce6335b0ad09419`). This review first re-read the runtime findings, role/service map, migrator plan, migration reconciliation, database authority, Actor Gateway hosting handover and PR #275/#298/#296/#299.

Render event/log evidence now establishes both November 15 failures:
1. Deploy `dep-dbsv8cuk1f9s73ada3ig`, commit `8f3ee574...`: build command was `npm ci && npm run build`; TypeScript failed TS7016 for `pg`, `express`, `jsonwebtoken`, plus TS7006 implicit-any errors caused by missing Express types. The exact repository manifest has `@types/pg`, `@types/express`, and `@types/jsonwebtoken` in devDependencies. Correct deployment build command is `npm ci --include=dev && npm run build`.
2. Deploy `dep-dbsva6c9v7es73bordlg`, commit `fe5a82d8...`: build succeeded, then process exited with `GHM_ACTOR_GATEWAY_URL is required when production storage is enabled`. This is the intentional fail-closed application guard. No dedicated production Actor Gateway host exists, and the hosting handover blocks another paid always-on service. No placeholder, self-reference, sandbox URL, or bypass is acceptable.

Therefore the build fix alone cannot make PR #275 deployable. Keep auto-deploy OFF; wait for an affordable/approved genuine gateway host, qualify its identity/credential/ACL/signed assertion contract, then prepare the runtime cutover. Do not deploy, edit environment variables, change roles/ACLs, or incur cost.

No Render configuration, secrets, deployment, database, CI, payment state or hosting resource was changed.

## 18 November 2026 — owner-shared Render creation-form review (not submitted)

The owner shared the Render New Web Service form for ghm-actor-gateway. This is a configuration review only; the form was not submitted and no Render service was created.

### Form values checked against current main source and architecture

- Repository: zaidhqdev-sys/GHM; branch: main — correct.
- Runtime: Node — correct.
- Region: Frankfurt — correct; same region as ghm-db.
- Root directory: blank — correct for repository-root package.json.
- Build command: npm ci --include=dev && npm run build — correct and fixes the previously observed missing development type declarations.
- Start command: npm run start:actor-gateway — exists in current main package.json and launches dist/actor-gateway/server.js.
- Required variable names shown: NODE_ENV, DATABASE_SSL_MODE, GHM_ACTOR_GATEWAY_DATABASE_URL, GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET, GHM_JWT_ES256_PUBLIC_KEY_PEM, GHM_JWT_ES256_KID. These names match the Node gateway source's configuration contract. NODE_ENV must be production; DATABASE_SSL_MODE must be internal for the same-region Render internal DB URL. The screenshot masks values, so their correctness, provenance and validity are not verified. Never copy secret values into Git, chat or handovers.
- Server binds Render's PORT and exposes /healthz; set the service health-check path to /healthz in Advanced settings before a future deployment.
- Keep auto-deploy OFF for initial controlled deployment.

### Plan decision

The form's selected $7/month paid Web Service is the previously documented always-on HTTP gateway architecture. The displayed Free plan is not acceptable: Render Free Web Services spin down after 15 minutes idle, may restart, and can wake too slowly for the Resource API's five-second gateway timeout. Do not select Free as a production workaround.

The $7/month recurring cost remains outside the user's standing approved budget unless the owner explicitly changes that decision. Merely opening or filling the form does not authorize the recurring charge. Do not submit it on the basis of this review.

### Independent production readiness blockers — service must not be submitted/deployed yet

Even if the owner later approves the $7/month charge, this form is not deployment-ready:
1. Production ghm_actor_gateway has not been provisioned with schema ghm USAGE or its exact gateway function EXECUTE allowlist; the last verified catalogue review found no gateway functions installed.
2. The latest supplied production migration reconciliation recorded 42 pending migrations and an allowlist mismatch; the ordered gateway migration chain and safe staged runner boundary are not qualified.
3. A fresh verified production backup/recovery point remains outstanding.
4. The production role-administration/Render support remediation remains open.
5. The masked GHM_ACTOR_GATEWAY_DATABASE_URL and capability assertion secret cannot be assumed valid or provisioned merely because fields are populated in the UI. They must be established through the approved administrator/secret workflow, with no values disclosed.
6. After those gates pass, qualify session_user=current_user=ghm_actor_gateway, the exact database privilege allowlist, /healthz, authenticated positive/negative routes, restart behavior and API timeout behavior before configuring GHM_ACTOR_GATEWAY_URL on the Resource API.

**Disposition:** configuration values are mostly aligned with source, but do not submit, deploy, select Free, or incur cost now. Keep the form unsubmitted, keep existing production untouched, and preserve the current architecture/cost decision.

No Render service, plan, environment variable, secret, deployment, database role/grant/migration, backup, payment state, CI or schedule was changed. No cost incurred.

## 19 November 2026 — Actor Gateway early-access hosting decision

The owner explicitly selected the Render **Free Web Service** for the initial Actor Gateway stage supporting the free directory / early-access audience. The prior hosting notes that described a dedicated paid service as cost-blocked or Free as categorically unacceptable are superseded for this early-access stage. Paid always-on hosting and provider requirements will be reviewed before paid live launch.

This is a hosting-stage decision, not evidence that the gateway is provisioned or production-ready. The current role state remains unchanged: ghm_actor_gateway has no ghm schema USAGE and no installed gateway API functions; the service identity and function allowlist have not passed startup qualification. The owner-filled Render form remains unsubmitted. The owner controls submission; no service was created or deployed here.

Render Free can sleep and cold-start beyond the Resource API five-second timeout. Early-access availability must account for this limitation; inspect timeout/retry behaviour before routing directory traffic. Do not weaken authorization or present Free as always-on.

No role, ACL, credential, Render resource, database, migration, deployment, payment state or paid infrastructure was changed.

## 19 November 2026 — owner clarification: one continuous Render service

The owner clarified the intended lifecycle for the already-filled, not-yet-submitted `ghm-actor-gateway` Render form:

- Create **one** dedicated Node Render Web Service named `ghm-actor-gateway` on the **Free** plan for now.
- That same service is used for early access and the initial free-directory users. “Early access” is not a separate service, environment, deployment, or architecture from the later paid/upgrade instance.
- When revenue and operational needs justify paid compute, upgrade the **existing Free service in place** to the appropriate paid plan. Keep the same Render service, repository/branch, service identity, configuration, secrets, database identity, and endpoint. This is a compute-plan change, not a second service, parallel deployment, or infrastructure migration.
- Do not create a second paid gateway or duplicate the service for a later launch.
- Free sleep/cold-start and the existing five-second Resource API client timeout remain real reliability constraints. Address them with a bounded, secure recovery/retry or early-access availability contract; do not weaken authentication, authorization, or fail-closed checks. These constraints do not change the one-service lifecycle decision.
- The owner-provided form remains **unsubmitted**. This clarification does not authorize the assistant to create, submit, configure, or deploy anything in Render.
- All production database, migration/ledger, backup/recovery, role/ACL authority, credential, and endpoint cutover gates remain independently outstanding. The plan upgrade does not clear those gates.

This section supersedes any wording elsewhere in this document that could imply a separate paid-stage service, a second deployment, or a migration from a Free service to a different paid instance.
