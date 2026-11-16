# GHM Actor Gateway Hosting and Credential Handover — 2026-11-16

**Review date:** 2026-11-16  
**Repository:** `zaidhqdev-sys/GHM`  
**Reviewed main head:** `61cd1121a1fb30e3b28c250b7b6812707f1c9109`  
**Production database:** Render `ghm-db` / `ghm_db`, PostgreSQL 18, Frankfurt  
**Status:** BLOCKED — production gateway principal exists but its database API is not installed; hosting path requires an additional always-on service cost that is not currently approved.  
**Scope:** Source/handover review and read-only production catalogue checks. No production mutation.

## 1. Architecture decision — superseding the Cloudflare Hyperdrive direction

The latest architecture decision is in `docs/architecture/ACTOR_GATEWAY_RENDER_CONNECTOR_SERVICE_DECISION_2026-11-15.md`.

The production target is the existing Node Actor Gateway HTTP server deployed as a **dedicated Render Web Service**:

- Repository: `zaidhqdev-sys/GHM`, branch `main`.
- Service name proposed: `ghm-actor-gateway`.
- Region: Frankfurt, same Render environment as `ghm-db`.
- Build: `npm ci --include=dev && npm run build`.
- Start: `npm run start:actor-gateway`.
- Health path: `/healthz`.
- Auto-deploy: OFF initially; controlled manual deployment.
- Database path: Render internal PostgreSQL hostname and SQL-created restricted gateway login.

This is the correct hosting fit because the repository already has `src/actor-gateway/server.ts`, the `start:actor-gateway` script, the typed HTTP routes, database startup identity/ACL checks, and the existing `GHM_ACTOR_GATEWAY_URL` client contract.

**Cloudflare Worker + Hyperdrive is not the selected production host.** It is a separate implementation and should not be provisioned in parallel. The earlier Hyperdrive/public PostgreSQL approach is superseded by the dedicated Render Node service decision. Do not create Cloudflare VPC, Tunnel, Hyperdrive, routes, or secrets for this rollout.

The dedicated Render Web Service must be always-on. A Free service is not a production substitute: its sleep/wake behavior is incompatible with the existing five-second gateway client/database timeouts and reliable security-boundary availability.

The smallest always-on Render Web Service incurs additional recurring compute cost. Under the user's standing no-additional-paid-infrastructure constraint, **do not create it or incur the cost now**. No existing service is approved as a substitute:
- GHM-Internal-Runtime is the production API itself and is not an independently isolated gateway host.
- `zaid-ai-workforce` is a separate application and is not approved as a DB bridge or gateway host.
- Sandbox/qualification services are not production resources and must not be repurposed.

This is a real hosting/cost decision gate, not a missing configuration value.

## 2. Amanda's Render advice — applied to the gateway correctly

The November 12 Render support guidance remains authoritative:

1. Retain the Render Dashboard-managed default database user as the administrator.
2. Create application login credentials through PostgreSQL SQL, not by trying to repurpose the Dashboard-created `ghm_app_user`.
3. Dashboard-created `ghm_app_user` has a Render-managed role relationship that cannot simply be removed as an ordinary application setting.
4. SQL-created application credentials are not managed through the Render Dashboard credential list; place them only in the consuming service's secret/environment configuration.
5. Preserve the distinct runtime and migrator principals; do not copy Amanda's illustrative `IN ROLE ghm_runtime` example onto the Actor Gateway.

For Actor Gateway this means the existing `ghm_actor_gateway` login is the intended SQL-managed application identity. Do not recreate it, make it a member of `ghm_runtime`, or grant it broad table privileges. Credential administration and gateway ACL provisioning are separate operations.

## 3. Production read-only evidence captured 2026-11-16

The connected Render PostgreSQL query tool's managed session was previously observed as:
- `session_user=ghm_app_user`
- `current_user=ghm_db_user`

A read-only attempt to query `ghm.ghm_schema_migrations` was denied with PostgreSQL `permission denied for table ghm_schema_migrations`. A schema-discovery query confirmed the ledger table name is `ghm.ghm_schema_migrations`, but did not disclose ledger contents.

Do not attempt to bypass this restriction by granting the application login extra rights, changing role memberships, or guessing at SET ROLE behavior. The production migration ledger remains unrefreshed by this connector session; use the supported administrator route Amanda described for an authoritative ledger read.

The read-only Actor Gateway ACL checks recorded:
- `ghm_actor_gateway` exists as LOGIN / NOINHERIT.
- Database CONNECT = true; database CREATE = false.
- Schema `ghm` USAGE = false.
- Schema CREATE = false.
- No direct table/relation privileges were found.
- No gateway-specific executable functions were found.
- A follow-up catalogue query for `ghm.gateway_*` and `ghm.assert_actor_gateway*` returned zero rows.

Therefore the role is **not yet provisioned for application use**. Do not configure a service with this credential or declare the gateway ready.

The bounded membership rule in migration `20261110210000_add_actor_gateway_principal_guard.sql` is intentional: `ghm_db_user` may be a member of `ghm_actor_gateway` only with ADMIN OPTION=true, INHERIT=false and SET=false; the gateway login itself must have no outgoing memberships. Preserve this exact rule. Do not misstate it as "no membership in either direction."

## 4. Migration dependency and production safety

The production migration handover dated November 15 records 42 pending migrations and an allowlist mismatch from the latest user-supplied full audit. The queue includes the Actor Gateway installation chain and multiple independent production cutovers/revocations. The migration runner does not currently provide a qualified safe batch/through-version boundary.

The November 16 catalogue check found no gateway functions, which is consistent with the gateway migrations not yet being installed. However, the migration ledger contents could not be read through the managed Render query connection. Do not assert exact applied/pending status from that denied query.

Do not:
- Replace the seven-item allowlist with all 42 pending entries.
- Run the production migration command.
- Apply individual gateway grants/functions manually to work around the migration chain.
- Rotate or reset the gateway password before the administrator/credential handoff and service secret destination are ready.
- Provision the assertion secret before its reviewed migration/table workflow is installed.
- Revoke the existing bounded administrator membership or improvise Render role changes.

The production backup/recovery point also remains unverified; the latest known archive in prior handover was November 4, before later role changes.

## 5. Correct next sequence

1. **Amanda / Render administrator route:** obtain an administrator-authorized read of the production migration ledger and the role/ownership catalogue. Record the exact connection identity used, without placing credentials in chat or Git.
2. **Credential model:** confirm the existing SQL-managed `ghm_actor_gateway` login is the service identity; determine whether a usable password is already set without disclosing it. If a controlled reset is required, do it only through the administrator session and place the value directly into the eventual Render service secret field.
3. **Production backup gate:** establish and verify a fresh recoverable backup before any production DDL, grants, role changes, or secret-table provisioning.
4. **Migration gate:** reconcile the exact live ledger against current main; qualify a staged, ordered migration plan. Apply no production migration until the runner and all cutover dependencies are explicitly qualified.
5. **Hosting/cost gate:** when the additional always-on service cost is affordable/approved, create the dedicated Frankfurt Render Web Service with auto-deploy OFF and the settings in section 1.
6. **Provisioning/qualification:** after migrations and backup gates pass, provision only the exact schema USAGE and approved gateway function EXECUTE grants through the reviewed migration chain; qualify startup identity and ACL checks using `session_user=current_user=ghm_actor_gateway`.
7. **Secrets and runtime:** set the database URL and approved public JWT verification material / assertion secret in the dedicated service's secret configuration; never place values in Git, logs, PowerShell history, or handover.
8. **Deployment and cutover:** deploy the service manually, verify `/healthz`, authenticated typed operations, negative authorization cases and restart behavior; then set the exact observed HTTPS origin as `GHM_ACTOR_GATEWAY_URL` on GHM-Internal-Runtime. Deploy GHM manually and run end-to-end checks.

## 6. Change record

This handover is documentation-only. The Render queries were read-only. No production database role, membership, grant, migration, password, secret, environment variable, Render service, Cloudflare resource, deployment, or application data was changed. No new recurring cost was incurred.

**Current blocker:** the gateway's dedicated always-on Render service requires additional recurring spend, and the production DB migration/backup/administrator gates remain unresolved. The selected architecture is now explicit; do not reopen the Cloudflare Hyperdrive route as a parallel implementation.


## 7. 2026-11-16 follow-up — administrator route and Render inventory rechecked

### Read-only database confirmation

A fresh query through the connected Render PostgreSQL tool returned:

- Database: `ghm_db`.
- `session_user=ghm_app_user`.
- `current_user=ghm_db_user`.
- `ghm.ghm_schema_migrations` exists.
- `has_table_privilege(current_user, 'ghm.ghm_schema_migrations', 'SELECT') = false`.
- No `ghm.gateway_*` or `ghm.assert_actor_gateway*` functions were found.

This confirms the connector cannot supply the administrator-only ledger read. The connector accepts only a read-only SQL query and exposes no parameter for choosing a different database credential. Do not retry with elevated SQL, attempt to reveal Render environment secrets, or weaken ACLs to make this connector query work.

The administrator route must therefore be the Render Dashboard's supported database administrator connection (or an administrator-assisted read from Amanda/Render support). The user should enter credentials only into their local secure connection or Render interface; never paste a password or full connection URL into ChatGPT or Git.

### Render service inventory refreshed

The ZAID Technologies workspace was queried read-only on 2026-11-16. The production environment still has:
- `GHM-Internal-Runtime`: Free Web Service, Frankfurt, auto-deploy OFF.
- `ghm-db`: PostgreSQL 18, Frankfurt, plan `0.1c-256mb`, available.
- `zaid-ai-workforce`: separate Free Web Service, not an approved gateway host.

The account-wide service listing also returned sandbox/qualification services, including PayFast callback/runtime and identity qualification. They are not production gateway candidates and remain excluded.

No `ghm-actor-gateway` service exists. No service was created. The database inventory still reports inbound IP allowlist `0.0.0.0/0`; do not mistake this broad setting for a gateway network qualification or change it as part of this read-only step.

### Tooling boundary and next actionable step

The connected Render tool has no operation to open a support ticket or switch the read-only SQL connector to the Dashboard-managed administrator credential. No connected support/email action is available in this workspace session. The next useful action is therefore not another query through the same connector.

Use the Render Dashboard's database connection details to open an administrator-authorized SQL session locally. Run a read-only audit of:
1. `session_user`, `current_user`, database name and server version;
2. exact rows in `ghm.ghm_schema_migrations` (version/name/checksum/status columns as defined by the live table);
3. `ghm_actor_gateway` role attributes and all incoming/outgoing membership options;
4. ownership of the gateway schema, migration ledger and gateway-related functions;
5. effective schema/function privileges for `ghm_actor_gateway`.

Do not include passwords or connection strings in the output. Capture only query results and the administrator session identity. If the Dashboard administrator credential is not available or cannot perform the required read, ask Amanda/Render support to provide the read-only ledger/role/ownership report or restore the supported admin access. Do not grant the app user more rights as a workaround.

### Change record for this follow-up

Only read-only Render inventory and catalogue queries were performed. No role, membership, grant, migration, secret, service, environment variable, deployment, database setting or allowlist was changed. No recurring cost was incurred.


## 8. 2026-11-16 follow-up — local external psql session confirms default credential is not schema administrator

The user connected locally from PowerShell/psql using the Render external database URL associated with the Dashboard credential marked **Default** (ghm_app_user). The URL itself was not retained in chat or this document.

The read-only identity check returned:
- session_user=ghm_app_user
- current_user=ghm_db_user
- current_database=ghm_db
- has_table_privilege(current_user, 'ghm.ghm_schema_migrations', 'SELECT') = false

The user then inspected role attributes and memberships read-only:

| Role | SUPERUSER | CREATEROLE | CREATEDB | INHERIT | LOGIN | BYPASSRLS |
|---|---:|---:|---:|---:|---:|---:|
| ghm_actor_gateway | false | false | false | false | true | false |
| ghm_app_user | false | false | false | true | true | false |
| ghm_db_user | false | true | true | true | true | false |
| ghm_migrator | false | false | false | false | true | false |
| ghm_schema_owner | false | false | false | false | false | false |

Relevant membership rows observed:

- ghm_app_user → ghm_db_user: ADMIN=false, INHERIT=true, SET=true.
- ghm_db_user → ghm_actor_gateway: ADMIN=true, INHERIT=false, SET=false.
- ghm_db_user → ghm_migrator: ADMIN=true, INHERIT=false, SET=false.
- ghm_db_user → ghm_schema_owner: ADMIN=true, INHERIT=false, SET=false.
- ghm_db_user → ghm_payment_provider: ADMIN=true, INHERIT=false, SET=false.
- ghm_db_user → ghm_runtime: two membership entries were returned, one INHERIT=true/SET=true/ADMIN=false and another INHERIT=false/SET=false/ADMIN=true.
- ghm_app_user and ghm_db_user also have memberships in pg_read_all_stats and pg_signal_backend with INHERIT=true/SET=true/ADMIN=false.

The migration ledger ownership query returned:
- schema: ghm
- table: ghm_schema_migrations
- owner: ghm_schema_owner

### Interpretation and guardrails

The Dashboard label **Default** identifies the credential selected by Render for the managed connection URL; it does not mean the resulting PostgreSQL role is a superuser or has unrestricted access. The observed connection is explicitly not a superuser session, and the effective ghm_db_user role cannot SELECT the migration ledger.

The ghm_db_user membership in ghm_schema_owner has ADMIN OPTION but SET=false. This does not authorize assuming the schema-owner role for a ledger read. The same bounded ADMIN=true / INHERIT=false / SET=false pattern is present for the migrator and Actor Gateway memberships. Preserve these observed settings; do not enable SET, grant ledger SELECT to the app user, alter ownership, or change role memberships as an audit workaround.

The database role ghm_db_user has CREATEROLE and CREATEDB, but is not SUPERUSER. Do not conflate those attributes with unrestricted administrator authority.

### Next step

The Render Dashboard's current Default external credential is not sufficient for the authoritative ledger/ownership audit required here. Ask Amanda/Render support to identify the supported administrator connection or provide an administrator-authorized read-only report of the migration ledger and role/ownership catalogue. Do not rotate the Default credential, create a new default, alter memberships, or change production ACLs just to gain access.

### Change record for this follow-up

The local psql session ran only SELECT/catalogue inspection statements. No role, membership, grant, ownership, migration, password, secret, environment variable, service, deployment, or database setting was changed. The Default credential was not rotated. No recurring cost was incurred.


## 9. 2026-11-16 follow-up — PR #284 merged after exact-head qualification

PR [#284](https://github.com/zaidhqdev-sys/GHM/pull/284), **test: qualify Actor Gateway assertion replay and timestamp boundaries**, was approved by the user for merge and merged to `main` using squash merge.

- Reviewed PR head: `b6b5443607938943086a17db4ea52070c70f7551`.
- Exact-head CI run #5120 completed successfully before merge; `quality` and `web-quality` passed.
- Local checks before push/review passed: TypeScript build, the Actor Gateway request-context migration contract tests (2/2), and Node syntax check for the qualification script.
- The change is limited to two qualification/test files: the disposable PostgreSQL principal qualification now proves exact signed-assertion replay is denied and expired/future-dated assertions are rejected; the migration contract pins the 60-second timestamp boundary.
- Squash merge commit: `11f4e492d86a4c632c72c8ad6cb49401f56601de`.
- GitHub confirmed PR #284 is closed and merged.

The successful Cloudflare Pages preview reported on the PR was a Pages preview only; it is not the production Actor Gateway host and does not change the Render hosting decision.

**Production impact:** none intended or performed. This merge did not deploy the Actor Gateway Worker or Render service, provision secrets, apply production migrations, alter database roles/memberships/grants, or change production environment variables. The production Actor Gateway hosting, backup, administrator-ledger access, and migration gates in this handover remain unchanged.

**Next step:** continue with the previously recorded production administrator/backup/hosting prerequisites. Do not treat this test-only merge as authorization to perform production DDL, ACL cutover, or service provisioning.


## 10. 2026-11-16 follow-up — PayFast sandbox readiness audit

The owner reports that PayFast sandbox access has returned and authorized an audit before setting up a sandbox account. This is an owner-reported provider-access change; it does not establish that the historical Render sandbox database or callback/runtime services have been restored.

### Existing implementation and PR dispositions

- GHM current-state records the PayFast checkout/redirect, ITN verification, and server-to-server ITN confirmation implementation as merged to `main`. Deterministic local qualification is recorded as passing (22 focused tests, no skips); this is not a real provider round-trip.
- GHM PR #233 (`fix/payfast-payment-date-timezone-20261108`, head `ea028a20967b686e90ea0fbe451a8e4b9dee57ef`) remains draft/open. Its change treats timezone-less payment_date as UTC and preserves explicit offsets. Do not merge until provider timestamp semantics are confirmed using sandbox evidence.
- GHM current-state and the 2026-11-11 security handover record the payment-provider principal as having two narrow PayFast settlement operations qualified against disposable PostgreSQL. This is not production ACL qualification; callback startup ACL verification remains a pre-reactivation hardening gate.
- Connect PR #33 (`construction/connect-ghm-payfast-sandbox-bridge`, head `163171c35c99d1a459e657` as recorded in PR metadata) remains draft/open and is explicitly historical/superseded. It authenticates through Supabase and uses a legacy external Business UUID mapping; it is incompatible with the approved GHM-native identity boundary. Do not merge, enable, or configure it.
- GHM PR #245 (authenticated commercial access/subscription reads) and #283 (admin commercial launch-state read) are merged. They are read-only; neither implements trial activation, checkout preparation, payment webhook lifecycle, or provider activation.
- Connect PR #68 is open and contains broad GHM workflow migration and commercial/payment freeze contracts. Its current branch must be reconciled against Connect `main` before any new payment implementation. Its preview/deployment comments are not proof of production cutover.

### Current decision

No new checkout bridge, credentials, sandbox account, callback activation, database migration, production ACL change, or payment attempt was performed during this audit. Preserve `launchAuthorized=false` and `onlineSubscriptionActivation=false`; no production payment activation is authorized.

### Required next sequence

1. Verify Render workspace/service inventory for the historical `ghm-payfast-sandbox-runtime`, `ghm-payfast-callback-sandbox`, `ghm-payfast-sandbox-db`, and `ghm-identity-qualification`. The Render service-list call could not be completed because no workspace was selected; do not guess a workspace. The historical sandbox database was previously recorded as billing-suspended/expired on 2026-11-08.
2. Inspect the current GHM mainline commercial/payment prepare, checkout and callback contracts, plus current Connect mainline callers and PR #68, before designing a GHM-native checkout flow. Do not reuse PR #33's Supabase bridge.
3. Confirm the PayFast sandbox merchant account state and whether an account already exists before registration. Do not duplicate an account or expose credentials in chat/handover.
4. Only after the service/database and GHM-native identity/business/subscription prerequisites are verified, perform sandbox-only account setup and non-payment checks. Checkout/callback/settlement round-trip requires a separate explicit go-ahead after the readiness gates.
5. Keep PR #233 parked until a sandbox ITN provides evidence for payment_date timezone semantics. Add exact startup ACL verification before any callback reactivation.

