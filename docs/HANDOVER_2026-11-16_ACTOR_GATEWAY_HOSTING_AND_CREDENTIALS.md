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
- Connect PR #33 (`construction/connect-ghm-payfast-sandbox-bridge`, head `163171c35c99d1a459ecf65766051e15c7fe6338` as recorded in PR metadata) remains draft/open and is explicitly historical/superseded. It authenticates through Supabase and uses a legacy external Business UUID mapping; it is incompatible with the approved GHM-native identity boundary. Do not merge, enable, or configure it.
- GHM PR #245 (authenticated commercial access/subscription reads) and #283 (admin commercial launch-state read) are merged. They are read-only; neither implements trial activation, checkout preparation, payment webhook lifecycle, or provider activation.
- Connect PR #68 is open and contains broad GHM workflow migration and commercial/payment freeze contracts. Its current branch must be reconciled against Connect `main` before any new payment implementation. Its preview/deployment comments are not proof of production cutover.

### Current decision

No new checkout bridge, credentials, sandbox account, callback activation, database migration, production ACL change, or payment attempt was performed during this audit. Preserve `launchAuthorized=false` and `onlineSubscriptionActivation=false`; no production payment activation is authorized.

### Required next sequence

1. Verify Render workspace/service inventory for the historical `ghm-payfast-sandbox-runtime`, `ghm-payfast-callback-sandbox`, `ghm-payfast-sandbox-db`, and `ghm-identity-qualification`. Render workspace discovery returned one accessible workspace, **ZAID Technologies** (workspace ID intentionally not copied into this handover). The service-list call has not yet been run because the tool requires explicit workspace confirmation; do not select it without the owner's confirmation. The historical sandbox database was previously recorded as billing-suspended/expired on 2026-11-08.
2. Inspect the current GHM mainline commercial/payment prepare, checkout and callback contracts, plus current Connect mainline callers and PR #68, before designing a GHM-native checkout flow. Do not reuse PR #33's Supabase bridge.
3. Confirm the PayFast sandbox merchant account state and whether an account already exists before registration. Do not duplicate an account or expose credentials in chat/handover.
4. Only after the service/database and GHM-native identity/business/subscription prerequisites are verified, perform sandbox-only account setup and non-payment checks. Checkout/callback/settlement round-trip requires a separate explicit go-ahead after the readiness gates.
5. Keep PR #233 parked until a sandbox ITN provides evidence for payment_date timezone semantics. Add exact startup ACL verification before any callback reactivation.



### 2026-11-16 — owner clarification and Render legacy inventory

The owner explicitly confirmed permission to inspect the ZAID Technologies Render workspace and clarified that the historical PayFast sandbox infrastructure is **legacy and must not be revived** because there is no budget to spend. This supersedes any earlier suggestion to recover/reactivate the old Render sandbox. Do not resume, unsuspend, redeploy, reconfigure, upgrade, recreate, or attach paid resources to any legacy sandbox resource.

Read-only Render inventory was completed in the owner-confirmed ZAID Technologies workspace.

| Legacy resource | Observed state | Notes |
|---|---|---|
| `ghm-payfast-sandbox-runtime` | Free web service, not suspended; auto-deploy off | Existing legacy service; do not use or redeploy |
| `ghm-payfast-callback-sandbox` | Free web service, not suspended; auto-deploy off | Existing legacy service; do not use or redeploy |
| `ghm-identity-qualification` | Free web service, not suspended; auto-deploy on / checks pass | Legacy qualification service; do not trigger deploys or use as current target |
| `ghm-payfast-sandbox-db` / `ghm_payfast_sandbox_db` | Free Postgres, suspended by billing; expired 2026-11-08 01:17 UTC | Do not restore, unsuspend, renew, or repurpose |

The current production database `ghm-db` / `ghm_db` is a separate available Postgres 18 instance in the production environment. It is not the legacy sandbox and must not be used as a substitute for sandbox qualification or for test payment data.

The three legacy web services were observed as not suspended, but this audit did not inspect logs, invoke health endpoints, deploy, change environment variables, alter service state, or test callback delivery. Their current status does not make them approved or suitable for payment testing.

### Updated PayFast strategy — no legacy Render dependency

- Keep the old Render sandbox DB and three web services out of the target architecture. No spend, paid resource, service recovery, database recreation, or production database reuse is authorized.
- Continue source/contract/test qualification against disposable CI PostgreSQL and local test doubles where possible.
- For provider-facing PayFast sandbox checks, use PayFast's own sandbox account and provider endpoints, but only through a GHM-native, isolated test path that does not depend on the legacy Render sandbox services/database and does not point tests at production `ghm_db`.
- Before creating a PayFast sandbox merchant account, verify with the owner whether one already exists and keep credentials out of chat and handovers. No account has been created in this audit.
- Do not initiate checkout or send a payment until the GHM-native identity/business/subscription preparation path and callback verification path are qualified; a separate explicit authorization is required for a payment attempt.
- Continue to keep PayFast production credentials, live activation, and online subscription activation frozen.

**Audit scope:** read-only Render service and database inventory only. No service state, deployment, database, role, grant, environment variable, secret, payment setting, or billing configuration was changed. No paid resource was created.



## 11. 2026-11-16 follow-up — PayFast sandbox credentials saved; provider decision conflict identified

The owner confirmed the PayFast sandbox merchant account is active. The owner reports that the sandbox Merchant ID, Merchant Key, and Salt Passphrase are present in the PayFast dashboard; the Salt Passphrase is 15 characters and PayFast accepted/saved it (PayFast minimum reported by owner: 12 characters). All credential values were redacted and must remain out of chat, GitHub, logs, screenshots, and handover documents. No PayFast credential has been configured in GHM, Connect, or any hosting environment.

### Mainline provider decision must be reconciled before any transaction

A read of the current Connect `main` Milestone 52 payment-provider integration document shows that the approved initial South African provider adapter is **Paystack**, not PayFast. Its TEST verification and technical approval are recorded, while commercial launch remains unauthorized and the production LIVE track remains outstanding. The same document explicitly states that the historical `payfast-webhook` is not reused/canonical.

The current Connect integration specification also preserves the frozen commercial state: `launchAuthorized=false` and `onlineSubscriptionActivation=false`. It states that PayFast approval must not be conflated with Paystack status and does not authorize payment-provider activation.

The Connect PR #68 payment-freeze and Milestone 52 contract checks are therefore important gates, not permission to switch the provider. PR #33 remains an incompatible historical bridge (Supabase identity plus legacy Render sandbox runtime) and must remain disabled/unmerged. GHM PR #233 remains parked pending provider evidence for `payment_date` timezone semantics.

### Current conclusion and next gate

- PayFast sandbox account setup is complete; credential setup in application hosting is not.
- GHM's PayFast checkout/ITN implementation and local tests do not establish that Connect's current commercial journey is authorized or wired to PayFast.
- Do not configure credentials, invoke checkout, send an ITN, create a payment attempt, or initiate a sandbox transaction yet.
- First reconcile the explicit provider choice across Connect's approved Milestone 52 architecture, Connect PR #68, and GHM's existing PayFast routes. If the owner intends to change the approved provider from Paystack to PayFast, record that as a deliberate architecture/governance decision before implementation.
- Preserve all commercial launch and online subscription activation freezes. The PayFast sandbox account does not change production authorization.

**Audit scope:** read-only source and documentation inspection plus owner-reported account setup. No application secrets, environment variables, source code, payment settings, database state, deployment, or provider transactions were changed.


## 12. Owner clarification — provider-neutral payment architecture and PayFast as current provider

The owner clarified the intended architecture and current provider decision on 2026-11-16:

**ZAID Technologies must remain payment-provider-neutral and must not be architecturally bound to Paystack, PayFast, Stripe, or any single provider.** GHM owns the canonical commercial/payment lifecycle and provider adapters are replaceable integration boundaries. Provider choice may change as commercial availability, support, geography, pricing, and operational suitability change.

Current operational decision:
- Paystack did not respond to the owner's contact; it is therefore not the current selected provider.
- The owner has moved to PayFast and has successfully set up the PayFast sandbox merchant account.
- Stripe was not pursued because the owner understood that account eligibility required being based in the EU or America.
- PayFast is the current provider candidate for the next isolated provider-adapter qualification. This is not authorization for a real transaction, production credential configuration, or commercial launch.

Architecture requirements:
1. Keep canonical payment attempts, subscription state, entitlements, settlement decisions, idempotency, and audit records provider-neutral and owned by GHM.
2. Isolate provider-specific checkout initialization, signature verification, event normalization, transaction references, and provider timestamps behind an adapter contract.
3. Provider changes must not require replacing the canonical commercial lifecycle or migrating business subscription ownership to the provider.
4. Do not interpret the historical Connect Milestone 52 Paystack implementation or its TEST evidence as a permanent provider lock. Reconcile its approval/documentation to the provider-neutral architecture; preserve the technical evidence as historical Paystack adapter evidence only.
5. Keep Connect's commercial launch and online subscription activation freezes unchanged. PayFast sandbox account setup does not authorize production activation.
6. Keep Connect PR #33 disabled/unmerged because its Supabase identity and legacy Render sandbox dependencies remain incompatible, regardless of provider choice.
7. Keep GHM PR #233 parked until PayFast sandbox evidence establishes the actual `payment_date` timezone semantics; do not infer these from Paystack or assume providers share timestamp formats.

Next engineering sequence:
- Reconcile Connect's current mainline Milestone 52 and PR #68 language so provider neutrality is explicit and PayFast is the currently selected adapter, without erasing historical Paystack verification evidence.
- Inspect GHM's current PayFast adapter and settlement/ITN contract against the provider-neutral GHM lifecycle, identify gaps, and qualify them using disposable CI/local PostgreSQL and controlled test doubles.
- Only after the native GHM path, identity/business authorization, callback authenticity, idempotency, failure handling, and timestamp semantics are qualified should a separate owner-approved PayFast sandbox round-trip be considered.
- Never use the legacy Render sandbox services/database or production `ghm_db` for sandbox testing. Do not configure credentials or initiate a payment until the isolated GHM-native test path and explicit test authorization are ready.

No provider credentials, environment variables, source code, database state, hosting resources, payment settings, or commercial launch flags were changed by this clarification. This section records the owner's provider strategy and the revised engineering gate.


## 13. Source-level payment architecture audit — 2026-11-16

Read-only review of GHM `main`, Connect `main`, Connect PR #68, and the PayFast developer documentation was completed after the owner selected PayFast as the current operational provider while reaffirming provider neutrality.

### GHM findings — exact current implementation boundary

**Canonical lifecycle foundation exists.**
- GHM owns `commercial_payment_attempt`, `commercial_payment_transaction`, `commercial_provider_event`, `commercial_subscription`, founding allocation, and commercial event state.
- The generic SQL function `ghm.commercial_apply_payment_result` accepts a provider code, checks that it matches the attempt, and records provider/event identity with idempotency keyed by provider + external event ID. This is a useful provider-neutral settlement core.
- The TypeScript `PostgresCommercialProviderBoundary` delegates to that generic function, but the current contracts still narrow `providerCode` to the literal `'payfast'`.

**Provider coupling remains in the current GHM implementation.**
- Migration `20261104120000_bind_commercial_payment_attempt_provider.sql` constrains `commercial_payment_attempt.provider_code` to `payfast` only.
- `src/resources/commercial/contracts.ts` types payment attempts and settlement input as `providerCode: 'payfast'`.
- `src/resources/commercial/repository.ts` hardcodes `'payfast'` when creating a payment attempt and rejects an idempotency-key collision bound to another provider.
- `src/resources/commercial/payfast-http.ts` is a PayFast-specific checkout adapter and correctly rejects attempts assigned to another provider.
- `src/resources/commercial/payfast-callback.ts` is a PayFast-specific ITN adapter. Its database access is restricted to PayFast-specific functions; it validates merchant, amount, signature, source IP, server-side PayFast confirmation, provider event identity and payload hash before settlement.
- Migration `20261104130000_isolate_payfast_settlement_identity.sql` creates PayFast-specific lookup/settlement wrappers and grants them to `ghm_payment_provider`. This is intentional least-privilege isolation for the current adapter, not evidence that another provider can reuse the same callback identity.
- The reusable core should remain provider-neutral; provider-specific checkout, callback parsing, signature validation, source verification, transaction references, timestamps and narrow database wrappers should remain adapter-owned. Do not weaken the payment-provider DB role by granting it broad direct table access or unrestricted settlement access.

**Callback hosting is not currently part of the GHM API process.**
- The callback listener is a separate executable, `src/payfast-callback-server.ts`, started by `npm run start:payfast-callback`.
- It requires `PAYFAST_CALLBACK_DATABASE_URL` to authenticate exactly as `ghm_payment_provider`, plus TLS in production, and exposes `/api/v1/commercial/payfast/itn` and readiness checks.
- GHM's main `src/http/app.ts` registers `commercial-internal-router` but does not register the public PayFast ITN route. The callback executable is therefore a separate process/hosting unit in the current source layout.
- The old Render PayFast callback/runtime services and expired sandbox database remain legacy and must not be revived. No additional paid service is authorized. Before provider-facing ITN tests, design a hosting approach that preserves the dedicated database identity without reviving legacy services or adding unapproved recurring cost. A possible same-service process/router arrangement must be security-reviewed and qualified; do not assume it is already implemented.

**The current payment-preparation HTTP bridge is not GHM-native.**
- `src/http/commercial-internal-router.ts` accepts an external Business UUID plus `externalIdentity.provider = 'supabase'`, resolves the old Supabase external identity and Business mapping, then calls the canonical commercial repository.
- That route is server-to-server assertion protected, but its identity and Business mapping assumptions are incompatible with the approved GHM-native Connect migration target.
- The user-authenticated `src/http/commercial-router.ts` currently exposes commercial offer/access/subscription reads only. It does not expose a GHM-native payment-preparation or checkout-write path.
- Connect PR #33 remains unusable as the migration answer because it builds on this Supabase identity bridge and legacy Render sandbox runtime.
- Before any checkout, create a GHM-native authenticated user-token write contract that resolves canonical GHM account identity and enforces active Business owner/administrator membership server-side. Do not accept caller-supplied identity as authority or use Supabase external IDs as the target identity.

### Connect findings — current branch and approved provider documentation

- Connect mainline Milestone 52 still describes Paystack as the initial adapter and records Paystack TEST evidence. That evidence should be retained as historical Paystack adapter qualification, not interpreted as a permanent provider lock or current provider selection.
- The owner has now selected PayFast as the current operational provider because Paystack did not respond. Provider choice is operational and replaceable; GHM remains canonical.
- Connect PR #68 is open/draft at head `e0df7f84b10a54f94ff3a74086a87b98c9268102` (base SHA recorded by GitHub: `1e92f85cdd99dea2070ede58a875cec45d5f2047`). Its Business Pro panel migration uses GHM offer reads and deliberately removes trial-activation and checkout writes from the UI. This is the correct fail-closed read-only posture while GHM native write contracts and consent/legal acceptance are not ready.
- PR #68's payment-provider integration test still contains historical Paystack implementation assertions; its documentation/test names must be reconciled so Paystack TEST evidence is preserved as history and PayFast is named as the currently selected adapter only when its GHM-native path is qualified.
- PR #68 is not ready to merge based on this payment audit. Its broader GHM dependencies, exact-head CI, branch ancestry and cutover gates remain independently open. No PR #68 merge or Connect production cutover was performed.
- Connect PR #69 is a documentation-only GHM auth trust-boundary handover and is unrelated to payment-provider implementation.
- The Connect mainline M52 and integration-specification documents currently state the commercial freeze remains active. Preserve `launchAuthorized=false` and `onlineSubscriptionActivation=false`; neither provider selection nor sandbox account setup changes those flags.

### PayFast documentation findings

The official PayFast custom integration documentation requires the Merchant ID and Merchant Key in the hosted checkout form and uses the merchant-set passphrase only as a salt appended to the signature input; the passphrase itself is not a checkout field. Therefore:
- Merchant ID and Merchant Key are checkout form fields as specified by PayFast, not values to embed in source or expose as frontend configuration.
- The Salt Passphrase remains server-side only and is used to compute the signature.
- The implementation must preserve PayFast's documented parameter ordering/URL-encoding rules and validate against the current official documentation before provider-facing qualification.
- The official ITN guidance requires signature, source, and amount checks plus server-to-server validation; the sandbox documentation says sandbox transactions can generate ITNs and do not move real funds.
- PayFast's published ITN field reference does not establish the timezone semantics of `payment_date`. Keep GHM PR #233 parked until the provider confirms the convention or a captured sandbox ITN gives reliable evidence. Do not assume the host's local timezone is UTC.

### Revised implementation sequence

1. Keep Connect PR #68 draft and read-only for commercial actions. Reconcile its branch against current Connect main before editing or merging; preserve its broader GHM migration gates.
2. Add a provider-neutral GHM payment-provider contract/selection boundary. The selected provider must come from trusted server configuration or an approved server-owned policy, never from the browser. Add a typed adapter registry with PayFast as the only currently qualified adapter; adding another provider later must not require rewriting canonical subscription/payment lifecycle.
3. Replace the Supabase-identity payment preparation bridge with a GHM-native authenticated user-token route and canonical Business membership authorization. Keep the legacy bridge disabled and historical.
4. Keep PayFast checkout and ITN implementation in a provider-specific adapter, but qualify its callback hosting with the dedicated `ghm_payment_provider` identity without reviving old Render resources or incurring unapproved service cost.
5. Add exact tests for provider mismatch, unsupported provider, idempotency, amount/currency integrity, signature, source IP, server confirmation, duplicate/replay events, malformed payload, transient provider/database failure and timestamp semantics.
6. Reconcile Connect M52 documentation/tests to provider-neutral architecture and preserve Paystack TEST verification as historical evidence. Connect UI remains read-only until GHM legal-consent and write contracts are implemented and separately approved.
7. Only after local/disposable PostgreSQL and CI qualification may a separately authorized PayFast sandbox checkout/ITN round-trip be considered. No live payment, production credential configuration, production migration, callback deployment, or commercial activation is authorized by this audit.

**Audit scope:** repository/documentation inspection and official PayFast documentation review only. No source code, secrets, environment variables, database state, role/grants, Render services, deployment, provider settings, payment attempts or transactions were changed.


## 14. PR #287 merged — server-selected commercial provider (2026-11-16)

PR #287 was marked ready after exact-head CI completed successfully and was squash-merged to `main`.

- PR: https://github.com/zaidhqdev-sys/GHM/pull/287
- Exact tested head: `e04a2a4daf70624cb2e3813ede4a058cec18388f`
- CI run: `43876746481`; both `quality` and `web-quality` passed.
- Merge commit: `7701d2342f8196aa8e1b5e16d10ee3f56ff82f0e`.
- Adds `GHM_COMMERCIAL_PAYMENT_PROVIDER`, default `payfast`, and injects the server-selected provider into payment-attempt preparation. Browser/request input does not select the provider.
- Generalizes the TypeScript provider-code types and the commercial payment-attempt provider-code database constraint to a bounded provider identifier format.
- Adds configuration and repository qualification coverage.
- Unsupported providers currently fail startup because PayFast is the only installed adapter. This is a fail-closed adapter availability guard, not a claim that Stripe, Paystack, or any other adapter exists.
- PayFast checkout/ITN remains adapter-specific; dedicated settlement wrappers and the `ghm_payment_provider` identity remain intact.

**Important implementation caveat:** PR #287 is the first provider-selection seam, not the completed adapter registry. The current config guard explicitly accepts only `payfast`; future providers require a separately implemented and qualified adapter before the guard is expanded. The existing callback server, payment prep bridge, and provider-specific SQL wrappers remain PayFast-specific. Do not advertise multi-provider production readiness yet.

**Next stage — native GHM payment preparation (not yet implemented):**
- Current `/api/v1/internal/commercial/payment-prepare` remains protected by a Connect service assertion, but its body requires `externalIdentity.provider='supabase'` and an external Business UUID resolved through the legacy external-mapping table.
- GHM already has user ES256 bearer authentication (`requireAuth`), `AuthContext` populated from the verified token, and canonical `ghm.business_membership` authorization. The commercial repository already checks active owner/administrator membership in its transaction.
- The intended replacement is a user-authenticated GHM route that takes canonical numeric GHM Business ID and server-derived actor identity from `req.authContext`, then calls the existing commercial service/repository. It must validate registered operation permissions, active membership, business state, commercial/legal consent, idempotency, and frozen launch state.
- The generic commercial resource registry currently exposes `commercial: read` only. Do not silently add write permission or activate a payment preparation route until consent/legal and launch-state gates are designed and tested.
- Legacy Supabase internal preparation route should remain disabled/historical once a safe cutover is approved; do not delete its history or enable it as a fallback.
- No payment attempt, checkout, callback, PayFast sandbox transaction, credential configuration, production migration, deployment, or commercial activation was performed by PR #287.
- No live provider or online subscription activation is authorized. Keep `launchAuthorized=false` and `onlineSubscriptionActivation=false`.



## 15. Native payment-preparation gate — legal consent dependency confirmed (2026-11-16)

The next-stage review compared GHM commercial schema/repository/authentication with Connect mainline Milestone 52, the current commercial panel, and the legacy Supabase payment-readiness migrations.

### Confirmed GHM-native pieces
- The normal API already authenticates GHM ES256 bearer tokens via `requireAuth` / `requireResourceAuth`; the resulting `req.authContext` is derived from the verified token plus current database account state.
- The commercial repository already checks the canonical `ghm.business_membership` row for an active `owner` or `administrator` before trial activation/payment preparation.
- The public authenticated commercial router currently exposes read-only endpoints; the resource registry grants only `commercial: read`.
- Therefore a native GHM endpoint can derive actor identity from `req.authContext` and pass canonical GHM Business IDs, with no Connect service assertion, Supabase subject, or external Business UUID.

### Blocking contract that must be migrated, not omitted
- Connect's legacy `prepare_business_subscription_payment` explicitly requires `p_document_version`, checks it is present, and appends a `commercial_terms` acceptance to `commercial_consents` in the same transaction as payment preparation.
- Connect UI requires explicit user acceptance of the relevant Trial or Business Pro subscription terms before invoking those operations. Current version identifiers in the UI are `za-business-pro-trial-v1` and `za-business-pro-subscription-v1`.
- GHM's canonical commercial schema currently has no equivalent commercial consent table/append-only acceptance event and its payment preparation contract accepts no document version/consent input.
- The user previously paused legal-document work until systems are stable. The actual approved current terms documents/version hashes therefore have not been established in GHM.
- **Do not implement a GHM-native payment-preparation write route that silently drops this acceptance requirement, accepts arbitrary document versions from the browser, or treats the old Supabase consent rows as the canonical GHM record.** This would weaken the existing consent contract and make the migration incomplete.

### Correct next bounded stage
1. Define the GHM-owned commercial consent evidence model (document type, immutable approved version/hash, actor account, Business, consent action/time, source/context, and idempotency/replay semantics) and its append-only write boundary.
2. Confirm which currently approved Trial and subscription document versions are valid. If no approved legal text/version exists, keep the write path unavailable; do not invent versions or hashes.
3. Add transactional repository support so the same authorized operation validates owner/admin membership, approved server-known document version, records consent, and prepares the payment attempt atomically.
4. Add native GHM ES256 route using `req.authContext`; request carries canonical Business ID and explicit acceptance/version reference, never caller-supplied actor identity. Preserve the commercial launch/online activation freeze as an independent server-side gate.
5. Only after this boundary is qualified should the Connect UI migrate from Supabase consent/payment RPCs to the GHM route. Keep Connect PR #68's commercial writes hidden while the gate is unresolved.

**Decision:** Stage 2 identity route is not yet opened as a write-enabled PR because its required consent/audit contract is absent from GHM and the approved document versions are not established. This is a concrete migration dependency, not a hosting or provider limitation. No code, migration, credentials, database, deployment, payment attempt or consent record was changed during this review.


## 16. PR #288 — commercial consent evidence foundation (2026-11-16)

Opened PR #288:
- PR: https://github.com/zaidhqdev-sys/GHM/pull/288
- Branch: `feat/commercial-consent-evidence-foundation-20261116`
- Current head: `0fefd0b489e4c1608b014dcc84a964c8e6ccab2e`
- Migration: `database/migrations/20261116150000_create_commercial_consent_evidence.sql`
- Contract test: `src/db/commercial-consent-evidence-migration-contract.test.ts`
- Standard test command includes the new compiled contract test.

### Schema contents
- Immutable `ghm.commercial_document_version` catalogue, keyed by document type/key/version and exact SHA-256 content hash.
- Append-only `ghm.commercial_document_status_event` for draft/approved/withdrawn/superseded lifecycle evidence. Insertion alone does not approve a document.
- Append-only `ghm.commercial_consent_event` linking canonical Business, account, exact document version, explicit accepted action, timestamp, source/context, request ID and unique idempotency key.
- Shared trigger function rejects UPDATE, DELETE and TRUNCATE on all three evidence tables.
- Approval actor account uses RESTRICT deletion semantics so immutable actor evidence cannot be silently rewritten by FK cascades.
- No legal document content, document hash, approved version, or consent row is seeded.
- No `ghm_runtime`, `ghm_actor_gateway`, or PUBLIC read/write grants are given. Only `ghm_migrator` receives table/sequence privileges. The authenticated read/write boundary is intentionally deferred until it can be tied to verified actor authority and approved document state.

### Qualification status
- PR #288 marked ready for review to trigger exact-head CI.
- `web-quality` passed on initial PR head `0033099251a9a3fa1be91c4308162f8040e78c49`.
- `quality` was still running at last inspection; it had reached the TypeScript Build step with no reported failures.
- A one-line follow-up changed document status-event actor FK deletion from SET NULL to RESTRICT, producing current head `0fefd0b489e4c1608b014dcc84a964c8e6ccab2e`. Exact-head CI for this follow-up must be confirmed before merge; the in-flight run above was created against the preceding head.
- Do not merge until the exact current head has full CI, including all migrations applied to disposable PostgreSQL and test suite.

### Remaining boundaries
- This PR is schema foundation only. It does not add an authenticated consent write/read API or payment-preparation route.
- It does not establish who is authorised to approve legal terms or which Trial/subscription documents are currently approved.
- The Connect legacy identifiers `za-business-pro-trial-v1` and `za-business-pro-subscription-v1` are historical UI constants, not approved GHM document records.
- Keep commercial trial/payment writes unavailable until the document approval governance and transactional actor-authenticated consent + payment-preparation path are qualified.
- No production migration, database mutation, role/grant change, credential, deployment, checkout, provider transaction or commercial launch flag change occurred.


## 17. PR #288 merged — commercial consent evidence foundation (2026-11-16)

PR [#288](https://github.com/zaidhqdev-sys/GHM/pull/288) was reviewed after exact-head CI completed and was squash-merged to `main`.

- Exact reviewed/tested head: `0fefd0b489e4c1608b014dcc84a964c8e6ccab2e`.
- Exact-head CI run: `43894348453`; both `quality` and `web-quality` completed successfully.
- The `quality` job passed TypeScript build, all repository migrations applied to disposable PostgreSQL, the complete test suite, and the subsequent PostgreSQL qualification steps.
- The corrected head includes the document-status actor FK correction from SET NULL to RESTRICT.
- Squash merge commit: `08a51b8e75f9686392ef32ddd301766267a5f271`.
- Migration: `database/migrations/20261116150000_create_commercial_consent_evidence.sql`.
- Contract test: `src/db/commercial-consent-evidence-migration-contract.test.ts`.

### Review disposition

The reviewed migration creates:
- An immutable document-version catalogue with exact SHA-256 content hashes and a unique document type/key/version tuple.
- Append-only lifecycle events for draft, approved, withdrawn and superseded states; creating a catalogue row does not itself approve a document.
- Append-only consent events binding canonical Business, account, exact document version, accepted action, timestamp, source/context, request ID and unique idempotency key.
- UPDATE/DELETE and TRUNCATE rejection triggers for all three evidence tables.
- No application runtime, Actor Gateway or PUBLIC table/sequence privileges; only `ghm_migrator` receives the explicit grants.

The migration seeds no legal text, content hashes, approved versions or consent records. The contract tests cover the immutable catalogue, lifecycle event shape, Business/account/document binding, idempotency, immutability triggers and absence of runtime grants.

### Current boundary and next stage

- PR #288 is merged as a schema foundation only. It does not provide an authenticated consent API, approval-governance workflow, or payment-preparation route.
- No legal document version has been approved or seeded. Do not invent a legal version/hash or treat the historical Connect identifiers as approved GHM documents.
- The next bounded implementation is the governed authenticated boundary: establish who may approve exact document versions, then implement atomic owner/administrator authorization + server-approved version validation + consent evidence insertion + payment-attempt preparation, using the authenticated GHM actor context and idempotency. Preserve the independent commercial launch freeze.
- Connect commercial writes remain unavailable until that complete contract is qualified and separately integrated.
- Keep `launchAuthorized=false` and `onlineSubscriptionActivation=false`.

**Production impact:** none. Merge did not run the migration against production `ghm_db`, change roles/grants/credentials, deploy Render services, configure provider credentials, perform checkout/ITN, create consent records, or change commercial launch flags. Disposable PostgreSQL CI qualification is not production migration authorization.


## 18. Commercial document approval authority foundation — PR in progress (2026-11-16)

Following PR #288, a bounded follow-up branch has been opened:
- Branch: `docs/commercial-document-approval-governance-20261116`
- Base: `main` at `61cd8cbe57933500dd86ede80860b30ecd4ce1d2`
- Migration: `database/migrations/20261116160000_add_commercial_document_approval_authority.sql`
- Contract test: `src/db/commercial-document-approval-authority-migration-contract.test.ts`
- Architecture contract: `docs/architecture/COMMERCIAL_DOCUMENT_APPROVAL_AUTHORITY_CONTRACT.md`

### Foundation added

- An immutable authority identity fixes the authority account, document type/key and optional jurisdiction; append-only `granted` / `revoked` events reference that identity and record the acting account, reason, request ID, timestamp and metadata.
- Document status approval now requires an exact `approval_authority_event_id`; non-approval lifecycle events must not cite one.
- Authority identity and event ledger UPDATE/DELETE/TRUNCATE are rejected.
- Only `ghm_migrator` receives explicit table/sequence grants. No runtime, Actor Gateway or PUBLIC access is introduced.
- No authority, approver, legal document, hash, approved status or consent is seeded.
- A separate architecture contract defines the future cross-row checks: authenticated actor must match the scoped authority grant; the latest event must still be granted; document scope/version must match; approval and evidence must commit atomically.

### Important limitation

The foreign key/CHECK constraint requires an approval event to cite a grant event, but does not by itself prove that the grant is current, scope-matched, or belongs to the actor. Those checks must be enforced by a future governed database operation. The migration-principal-only grant is a foundation, not a finished authority-management workflow.

No GHM administrator is implicitly treated as legal approver. The owner must explicitly designate the person/account and scope before any authority grant can be recorded. Until then, approval and commercial writes remain unavailable.

### Qualification and next gate

- The migration contract test is included in the standard `npm test` list.
- Exact-head CI, full migration application against disposable PostgreSQL, complete test suite and SQL review are pending. The schema was tightened before qualification so grant/revoke events reference a separate immutable authority identity; this prevents later events from silently changing the principal or scope.
- Do not merge until exact-head CI passes and migration review confirms the FK/constraint/trigger/access model.
- Do not apply this migration to production `ghm_db`, insert authority rows, grant application access, deploy services, or enable payment writes.

Commercial launch flags remain `launchAuthorized=false` and `onlineSubscriptionActivation=false`.


### 18.1 Final SQL review correction — grant-only reference enforced (2026-11-16)

Final review found that a simple FK to the authority event ID would also accept a `revoked` event. Before merge, the branch was corrected:
- Authority events now have a unique `(id, event_type)` key.
- Document status events carry the authority event ID and event type together under a composite FK.
- The CHECK constraint requires `event_type='granted'` for `approved` status and NULL references for all other statuses.
- The migration contract test explicitly checks the composite FK and grant-only CHECK.

This enforces that an approval cannot cite a revocation event. It still does not prove that the grant is the latest event, actor-matched, or scope-matched; those remain mandatory checks for the future transactional approval operation.

The correction is on the latest branch head `1670dd9d0e72847be33b8753aa6205bd92aebbab`. A fresh exact-head CI run is required; the earlier successful run `43896672192` applies to superseded head `69e751684f2b9b783abc040c3fbb78a57fd336ca` and is not valid qualification for the corrected migration. Do not merge until the new run passes and the corrected migration applies to disposable PostgreSQL.


### 18.2 Disposable PostgreSQL failure and correction (2026-11-16)

The first disposable PostgreSQL run of the grant-only composite FK failed because the referenced authority event table did not yet have a matching unique key on `(id, event_type)`. This was a genuine migration defect, not an infrastructure failure.

Corrected migration now declares `UNIQUE (id, event_type)` on `ghm.commercial_document_approval_authority_event`, satisfying PostgreSQL's composite FK requirement. The contract test asserts this unique key, both paired columns, the composite FK and the grant-only CHECK.

- Failed run: `43897565313`, migration application step; do not treat earlier passing run on superseded code as qualification.
- Correction commit: `0c053cb01caab27da8fd58ea2db1ea48d1267f74`.
- PR #289 has been marked ready for review to ensure CI runs on the corrected branch state.
- A fresh exact-head full CI run remains mandatory. Merge remains blocked until PostgreSQL applies the corrected migration and the complete quality suite passes.


### 18.3 Corrected migration qualification passed (2026-11-16)

The corrected migration now passes full exact-head CI on commit `cac2683448c5efd627f21e18f3ce54bacf00d90c`:
- Workflow run: `43898034405`
- `quality`: success, including full migration application to disposable PostgreSQL and the complete test suite.
- `web-quality`: success.
- The composite unique key `(id, event_type)` now satisfies PostgreSQL's composite-FK requirement, and the CHECK constraint requires `granted` for approved document status events.

Final diff review covered the migration, contract test, standard test command, architecture contract and this handover. The migration remains isolated to repository/CI qualification: no production migration, role/grant change, service deployment, credential change, authority assignment, consent/payment write or launch authorization.

PR #289 remains open and unmerged pending the owner's merge direction. Launch flags remain `launchAuthorized=false` and `onlineSubscriptionActivation=false`.


### 18.4 PR #289 merged (2026-11-16)

PR #289, `feat: add scoped commercial document approval authority`, was squash-merged after corrected migration qualification passed.

- PR: https://github.com/zaidhqdev-sys/GHM/pull/289
- Tested code head: `cac2683448c5efd627f21e18f3ce54bacf00d90c`
- Exact-head CI run: `43898034405` — `quality` and `web-quality` both passed.
- A subsequent handover-only commit recorded the passing qualification; it did not change migration, test, package or application code.
- Merge commit: `599d6359404557c2e25a4c159d0a9c2820469176`.

The merged migration/test foundation enforces an immutable scoped authority identity, append-only grant/revoke events, and a grant-only composite FK reference for approved document status. It does not enforce current grant state, authenticated actor match or cross-row document scope; those remain mandatory for the future governed approval transaction.

No authority has been assigned. No runtime or Actor Gateway access was granted. No production migration, production ACL/role change, deployment, provider credential change, payment attempt or commercial activation occurred. Preserve `launchAuthorized=false` and `onlineSubscriptionActivation=false`.


### 19. Owner-only approver clarification and main CI — 2026-11-16

The user explicitly clarified that the working arrangement is the owner and assistant only; there is no additional employee/reviewer. The commercial approval architecture contract now records:

- The user/owner is the intended sole human legal approver for ZAID Technologies commercial documents unless the owner explicitly changes that decision.
- The assistant may draft, inspect, implement, test and maintain handovers, but is not a legal person, has no GHM account and cannot be an approver or grantor.
- No placeholder/ghost employee or invented GHM identity may be created.
- Authority rows must reference the owner's real authenticated GHM account. Never invent or infer its account ID.
- A GHM admin flag alone does not confer legal approval authority. A controlled owner-designation mechanism must establish the owner's authority, and all other accounts must be denied.
- Until the real owner account identity and designation path are verified, no authority row, approved document version, consent/payment write API or commercial activation may be created/enabled.

PR #289 merge commit `599d6359404557c2e25a4c159d0a9c2820469176` received its own main-branch CI run:
- Workflow run: `43898706914`
- `quality`: success.
- `web-quality`: success.

The architecture contract was updated on main to make the owner/assistant boundary explicit (commit `699d5e267869a15f925aed25cf3907c8b4c6c4ce`). No production DB query/mutation, account ID lookup, authority assignment, role/grant change, deployment, payment attempt or launch-flag change was performed in this clarification.


### 20. Canonical owner identity source found in existing GHM migrations (2026-11-16)

Repository review identified an existing one-time founder bootstrap mechanism; therefore the commercial approval design does not need a user-supplied account ID or a newly invented employee identity.

- `ghm.founder_system_admin_bootstrap_state` stores the canonical founder account ID and founder login used by the controlled bootstrap.
- The bootstrap migration only promotes the pre-existing active canonical founder account and records the singleton state.
- The next owner-only authority operation will derive/verify the caller against that singleton founder state inside the database transaction, and require the account to remain active and consistent with the canonical founder identity.
- The request must not supply a target approver account ID. The only permitted authority account is the founder account already recorded in the singleton state; no delegation is included.
- This is distinct from trusting a generic admin role or `is_system_admin` flag.

The Render session restriction means the production singleton row/account ID has not been independently read. The future function must fail closed if the row is missing, duplicated, or inconsistent. It must not guess the ID or ask the owner to paste one into chat.

Architecture contract update: commit `e5040d897e842f37df1390da155071ab551649e0`.

No production account lookup, role/grant change, authority assignment, migration, service deployment, credential change, or commercial activation was performed.


## 21. Founder-only commercial approval authority gateway — PR in progress (2026-11-16)

A bounded implementation branch now adds the database-side owner-only grant/revoke boundary:
- Branch: `feat/founder-only-commercial-approval-authority-20261116`
- Migration: `database/migrations/20261116170000_add_founder_only_commercial_document_authority_gateway.sql`
- Contract test: `src/db/founder-only-commercial-document-authority-migration-contract.test.ts`
- Standard `npm test` includes the new contract test.

### Owner identity and authorization

- The operation accepts no target approver account ID. It derives the only permitted authority account from the singleton `ghm.founder_system_admin_bootstrap_state`.
- It verifies the caller equals that recorded founder account, the singleton contains the expected canonical founder login, the account remains active and system-admin, and exactly one matching canonical password credential exists.
- The caller must be `session_user='ghm_actor_gateway'` and supply a valid, short-lived, one-use HMAC assertion bound to the exact operation context and document scope.
- Grant/revoke events are serialized per exact account/document/jurisdiction scope. Duplicate grant and revoke-without-active-grant are rejected.
- A unique NULLS NOT DISTINCT scope index prevents duplicate authority identities for the same owner and document scope.
- Only `ghm_actor_gateway` receives EXECUTE on the two SECURITY DEFINER functions. No direct table privileges or runtime/PUBLIC access are added.

### Current boundary

This PR adds the database operation and contract test only; it does not yet wire a new HTTP route/reader into Actor Gateway. The database operation is not reachable through a new application endpoint until that next integration slice is implemented. No founder row is seeded, no authority is granted, and no document is approved.

### Qualification gate

- Exact-head CI and disposable PostgreSQL migration application are pending.
- Review must verify function ownership/search path, HMAC context binding, replay handling, founder bootstrap checks, advisory-lock serialization, and exact EXECUTE grants.
- Do not merge until all exact-head checks pass and SQL review is complete.
- No production migration, role/grant/credential change, Actor Gateway hosting, deployment, legal approval, consent/payment write or launch activation is authorized.


### 21.1 First CI failure — exact Actor Gateway ACL allow-list (2026-11-16)

The initial PR #290 quality run `43901549176` failed at `Qualify isolated actor gateway database principal`, not at SQL migration application or TypeScript build.

The diagnostic identified both new SECURITY DEFINER functions as unsafe and showed them as unexpected executable functions. Root causes:
1. Their search paths were `pg_catalog, ghm`, while the Actor Gateway verifier requires the pinned temporary-safe `pg_catalog, ghm, pg_temp`.
2. The exact Actor Gateway executable-function allow-list did not yet include the two reviewed signatures.

Corrections:
- Both functions now pin `pg_catalog, ghm, pg_temp`.
- `src/actor-gateway/database-privileges.ts` now includes both exact signatures in its expected function allow-list.
- `src/actor-gateway/database-startup-acl-contract.test.ts` asserts those signatures remain present in the allow-list.

A fresh exact-head run is required. Do not weaken the ACL verifier or remove its exact-function check to make CI pass.


### 21.2 Disposable migration syntax defect and correction (2026-11-16)

The first corrected ACL run advanced past the Actor Gateway ACL check but the migration application failed with PostgreSQL syntax error at the function body opener. Inspection of the committed SQL showed the two function openers had a single-dollar delimiter while the closers used double-dollar delimiters.

Both functions now use explicit paired tags (`$assertion$` and `$manage$`). This is a migration-source syntax correction; no SQL execution against production occurred.

The disposable Actor Gateway principal qualification script was also extended to exercise the new operation with a temporary founder fixture inside a rolled-back transaction:
- canonical founder grant succeeds;
- duplicate grant is rejected;
- revocation succeeds;
- duplicate revocation is rejected;
- re-grant after revocation appends a new event;
- a non-founder administrator is denied;
- forged, scope-transplanted, replayed and expired assertions are denied;
- test founder singleton/account fixtures are cleaned up only when the script created them.

The authority event writes are enclosed in a gateway transaction and rolled back after qualification, so the disposable fixture leaves no persistent authority evidence. A fresh exact-head CI run is required after these changes.


### 21.3 Qualification avoids direct evidence-table access (2026-11-16)

The disposable qualification was tightened to respect the intended no-direct-table-access boundary for `ghm_actor_gateway`. It now validates the returned grant/revoke event types from the SECURITY DEFINER operation instead of querying `commercial_document_approval_authority_event` directly. The authority test transaction still rolls back all fixture events.

This correction is included in commit `546f5be6a97802bd1cec2bb7add9eb893b914c5f`; exact-head CI must run on the final branch head.


### 21.4 Founder-only authority database operation — exact-head qualification passed (2026-11-16)

Corrected branch code commit `174d10aece78ceacdecdfe8d701f1bcaff1256b2` passed exact-head workflow `43902840161`:
- `quality`: success.
- `web-quality`: success.
- All repository migrations applied to disposable PostgreSQL.
- The complete test suite passed.
- Isolated Actor Gateway database-principal qualification passed, including the new founder-only authority operation tests.
- The exact Actor Gateway executable-function allow-list, SECURITY DEFINER owner/search-path checks, and no-direct-table-access boundary passed.

The disposable qualification proves:
1. Canonical founder bootstrap fixture can grant its own scoped approval authority.
2. Duplicate grant is rejected.
3. Founder can revoke the active grant.
4. Revocation without a current grant is rejected.
5. Re-grant after revocation appends a new grant event.
6. Non-founder administrator, forged signature, context/scope transplant, replay and expired assertion are rejected.
7. All test authority events are rolled back; founder singleton/account/credential fixtures are cleaned up.

PR #290 remains the SQL/database boundary only; it does not yet expose an HTTP route or TypeScript reader. The next bounded slice is Actor Gateway route/reader integration. After that, implement the separate document approval transition that verifies current grant, actor and exact immutable document version. No production authority row or approved document exists.

No production migration, DB role/ACL change, secret change, Render service, deployment, legal approval, consent/payment write or commercial activation occurred. Launch flags remain `launchAuthorized=false` and `onlineSubscriptionActivation=false`.


### 21.5 PR #290 merged — founder-only authority database boundary (2026-11-16)

PR [#290](https://github.com/zaidhqdev-sys/GHM/pull/290), `feat: add founder-only commercial document approval authority`, was squash-merged after exact-head qualification.

- Tested code head: `174d10aece78ceacdecdfe8d701f1bcaff1256b2`.
- Final handover/documentation-only branch head: `b7a29706f5912041d650845c72d8aa5b9a3e9ab8`.
- Exact final-head workflow run: `43903583244` — `quality` and `web-quality` both passed.
- Merge commit: `e580303332b8bff27e2e8bc85d82d0c97a41ba4d`.

The merged SQL boundary derives the only approver from the existing founder bootstrap singleton, verifies active founder account and canonical active credential, requires a signed one-use Actor Gateway assertion, serializes scoped grant/revoke events, and rejects duplicate or invalid transitions. The exact Actor Gateway function allow-list includes the two SECURITY DEFINER functions, with pinned search paths and no direct evidence-table privileges.

### Still deliberately not implemented

- No HTTP route or TypeScript reader for this operation yet.
- No owner authority row or grant has been created in production.
- No legal document version has been approved.
- No document-approval transition endpoint, commercial consent write route, or payment-preparation route has been enabled.
- No production migration/ACL change, Actor Gateway service hosting/deployment, credential change, checkout or payment activation has occurred.

Next bounded implementation: wire the owner-only operation through the authenticated Actor Gateway HTTP/TypeScript layer, deriving actor identity exclusively from the verified bearer token and rejecting any caller-supplied actor/approver field. Then implement the separate transactional document-approval transition that verifies current grant, actor, document scope and immutable version. Keep `launchAuthorized=false` and `onlineSubscriptionActivation=false`.


## 22. Owner approval authority HTTP/TypeScript integration — PR in progress (2026-11-16)

Following merged PR #290, a bounded Actor Gateway application integration branch is open:
- Branch: `feat/actor-gateway-commercial-approval-authority-route-20261116`
- Reader: `src/actor-gateway/commercial-document-approval-authority-reader.ts`
- Reader tests: `src/actor-gateway/commercial-document-approval-authority-reader.test.ts`
- HTTP route tests: `src/actor-gateway/commercial-document-approval-authority-app.test.ts`
- Route: `POST /v1/owner/commercial-document-approval-authority`
- Server wiring: `src/actor-gateway/server.ts`
- Standard `npm test` includes both new test files.

### Route contract

- The route is authenticated by the existing ES256 bearer middleware. Actor account ID comes only from the verified JWT subject in `res.locals.actorAccountId`.
- The request body is an exact allow-list: action, document type, document key, jurisdiction country ID and reason.
- Caller-supplied `actorAccountId`, `approverAccountId`, or any extra fields are rejected.
- The TypeScript reader signs the exact action/scope/reason context with the configured 32-byte gateway assertion secret and calls the SECURITY DEFINER database operation inside a transaction.
- Database authorization remains decisive: only the canonical active founder account in the founder bootstrap singleton can grant/revoke. The route itself does not infer owner status from role or email.
- HTTP errors map authorization denial to 403, invalid input to 400, duplicate/invalid state transitions to 409, and infrastructure failures to 503 without exposing SQL details.

### Safety boundary

No route call has been made against production. No authority row, approval, consent, payment attempt, production migration, ACL/credential change, Render service or deployment has occurred. The route is source code only and remains unavailable in production until the existing migration/Actor Gateway service/secret and deployment gates are separately qualified.

### Qualification

Exact-head CI, TypeScript build, complete test suite, and review of the request/actor binding are pending. Do not merge until all checks pass.


### 22.1 Owner authority HTTP/TypeScript route qualification passed (2026-11-16)

PR #291 code head `13923a1c538ce23aacd491d65f5bca65bbbe8c85` passed exact-head workflow `43905417391`:
- `quality`: success, including TypeScript build, all migrations on disposable PostgreSQL, complete test suite and all existing Actor Gateway qualifications.
- `web-quality`: success.
- New reader tests verify the HMAC payload binds actor, action, document scope, jurisdiction and reason; the reader commits on success and rolls back on database denial.
- New HTTP tests verify actor identity comes from the ES256 bearer token; caller-supplied actor/approver fields and extra fields are rejected; malformed scope is rejected before DB access; founder denial maps to 403; duplicate/state conflict maps to 409; missing bearer is rejected.
- The existing disposable Actor Gateway database-principal qualification also passed with the new exact function allow-list.

The route is source-level only. No production request was sent and no deployment, migration, authority assignment, approval, consent or payment write occurred. The branch is ready for final diff review and merge consideration.


### 22.2 PR #291 merged — authenticated owner authority route (2026-11-16)

PR [#291](https://github.com/zaidhqdev-sys/GHM/pull/291), `feat: expose founder-only commercial approval authority route`, was squash-merged after exact-head qualification.

- Exact final tested head: `b87dfa3510e0be7fec6fcc67b1f0cba3069d985a`.
- Workflow run: `43906160152` — `quality` and `web-quality` both passed.
- TypeScript build, all migrations on disposable PostgreSQL, full test suite and existing Actor Gateway database qualifications passed.
- Merge commit: `f480a463c4e24182d47809c9638b6afb9b4f9d3e`.

The merged route is `POST /v1/owner/commercial-document-approval-authority`. Actor identity is derived from the verified ES256 bearer token; the body is strictly allow-listed and cannot provide an actor/approver account ID. The reader signs the exact request context and calls the founder-only database function in a transaction. Tests cover HMAC binding, transaction rollback, bearer authentication, body validation, founder denial and conflict mapping.

### Remaining commercial governance stages

1. Implement the separate transactional document-approval transition. It must require the latest still-granted authority event, the same authenticated founder actor, exact document type/key/jurisdiction/plan scope, and the immutable version/hash. Approval status and event must be committed atomically.
2. Add disposable PostgreSQL positive/negative tests for wrong actor, revoked grant, stale grant, mismatched document version/scope, duplicate status transitions, replay and concurrency with revocation.
3. Only after an actual legal document is supplied and reviewed by the owner may its content/hash/version be registered and approved through the owner route.
4. Then implement the separate GHM-native Business consent + payment-preparation transaction, preserving explicit customer acceptance and the independent launch freeze.

No production route call, migration, authority grant, document approval, consent, payment attempt, Render Actor Gateway service, deployment or secret change has occurred. The production gateway hosting/backup/admin/migration gates remain. Keep `launchAuthorized=false` and `onlineSubscriptionActivation=false`.


### 22.3 PR #291 main-branch qualification (2026-11-16)

Merge commit `f480a463c4e24182d47809c9638b6afb9b4f9d3e` passed main-branch workflow `43906857428`:
- `quality`: success.
- `web-quality`: success.
- Full disposable PostgreSQL migrations, full test suite and Actor Gateway database qualification passed.

The handover was updated after the merge. This does not authorize production migration, deployment or commercial writes.


## 23. Founder-only exact document-version approval transition — PR in progress (2026-11-16)

A separate bounded database transition branch is open after PR #291:
- Branch: `feat/founder-only-commercial-document-approval-transition-20261116`
- Migration: `database/migrations/20261116180000_add_founder_only_commercial_document_approval_transition.sql`
- Contract test: `src/db/founder-only-commercial-document-approval-transition-migration-contract.test.ts`
- Disposable behavioral qualification extended in `scripts/qualify-actor-gateway-principal.mjs`.
- Standard `npm test` includes the new migration contract test.

### Approval transition contract

- Uses a distinct HMAC operation name `commercial.document.status.approve`; authority-management signatures cannot be replayed as document-approval signatures.
- Revalidates the canonical founder bootstrap account, active system-admin account and active canonical credential.
- Binds the assertion to one exact immutable `document_version_id` and reason.
- Locks the immutable version and the same account/document/jurisdiction advisory-lock scope used by grant/revoke.
- Requires the exact founder authority identity and the latest authority event to remain `granted`.
- Requires the latest status event for that exact version to be `draft`.
- Appends an `approved` status event with the authenticated founder account and exact grant-event ID/type in the same transaction.
- No direct runtime/PUBLIC/table privileges are added; only the Actor Gateway principal receives EXECUTE on the two SECURITY DEFINER functions with pinned search paths.

### Disposable behavioral tests

The Actor Gateway qualification adds disposable immutable document-version and draft-status fixtures, then tests successful approval, duplicate approval denial, approval denial after revocation, approval after re-grant, wrong-document-scope denial, non-founder denial, forged signature, version-context transplant, replay and expiry. Authority and approved-status writes occur inside a transaction that is rolled back. The disposable draft version rows are retained in the ephemeral CI database because the evidence tables are deliberately append-only; they contain only synthetic fixture hashes/titles and are not production/legal documents.

### Explicit boundaries

- No legal document or hash is registered in production.
- No production approval, authority assignment, consent or payment write.
- No production migration, ACL/credential change, Render service, deployment or launch activation.
- Exact-head CI and SQL review are pending. Do not merge until migration application, Actor Gateway behavioral qualification and full suite pass.


### 23.1 Founder-only document approval transition qualification passed (2026-11-16)

PR #292 code head `0e9c4fe1ebb59054b17c15ab6af28348e2ac6bde` passed exact-head workflow `43908611434`:
- `quality`: success.
- `web-quality`: success.
- All migrations applied to disposable PostgreSQL.
- The Actor Gateway principal qualification passed with the new document approval behavior.
- The complete test suite passed, including the new migration contract.

Behavioral qualification verifies:
- Founder approves an exact draft version under a current grant.
- Duplicate approval is denied.
- Approval after revocation is denied.
- Re-grant permits approval of a subsequent exact version.
- Authority for one document key cannot approve another key.
- Non-founder admin, forged assertion, document-version context transplant, replay and expiry are denied.
- Authority and approved-status events are rolled back; synthetic immutable draft/version fixtures remain only in ephemeral CI.

No production legal document, approval, authority grant, consent or payment record was created. The branch remains database-side only; HTTP approval route/reader is a separate next slice.


### 23.2 PR #292 merged — exact founder-only document approval transition (2026-11-16)

PR [#292](https://github.com/zaidhqdev-sys/GHM/pull/292), `feat: add founder-only commercial document approval transition`, was squash-merged after exact-head qualification.

- Tested code head: `0e9c4fe1ebb59054b17c15ab6af28348e2ac6bde`.
- Final documentation head: `63618ae13cac8f7a101927f04f2912faa196eced`.
- Exact final-head workflow: `43909156864` — `quality` and `web-quality` both passed.
- Merge commit: `83f9ba486aec3ca44aed7c4a4bc0a340df69dcdc`.

The database transition approves only an exact immutable version whose latest status is draft and whose exact owner/document/jurisdiction authority has a latest grant event still active. Approval and status evidence are appended atomically and reference the exact grant event. It shares the advisory lock with grant/revoke so a revocation cannot race past approval.

The disposable Actor Gateway qualification passed successful approval, duplicate denial, denial after revocation, approval after re-grant, wrong document-key denial, non-founder denial, forged assertion, version-context transplant, replay and expiry. All authority and approved-status writes were rolled back. Synthetic immutable draft/version fixture rows remained only in the ephemeral CI database.

### Next bounded slice

Wire the approved-document transition through the Actor Gateway HTTP/TypeScript layer:
- derive actor only from verified ES256 bearer token;
- accept only exact immutable document version ID and reason;
- no caller-supplied actor, approver, status or grant event ID;
- return minimal approval evidence;
- test revoked/stale grant, wrong version, duplicate approval, non-founder, replay and failure rollback.

After that, implement document registration and GHM-native consent/payment preparation. Do not register/approve real legal documents until the owner supplies and reviews the actual documents. Production hosting/backup/admin/migration/secret gates remain. No production migration, approval, consent, payment attempt, Render service or deployment occurred. Keep `launchAuthorized=false` and `onlineSubscriptionActivation=false`.


## 24. 2026-11-16 follow-up — Amanda confirms Render privilege model; temporary ledger-read grant attempt rejected

Amanda replied through Render support chat and confirmed:

1. Render does not provide PostgreSQL superuser access. The Dashboard Default credential maps `ghm_app_user` to `ghm_db_user`, the highest-privileged Render-provided database account.
2. The observed `session_user=ghm_app_user` / `current_user=ghm_db_user` mapping is expected. The ledger SELECT denial is expected because `ghm_schema_migrations` is owned by `ghm_schema_owner`, and the existing membership has `SET` and `INHERIT` disabled.
3. Amanda says role, membership, ownership and effective privilege catalogues are readable from the existing connection. She suggests either a direct schema-owner login (not available: current `ghm_schema_owner` is NOLOGIN), a dedicated auditor role granted SELECT by the owner, or temporarily enabling SET on the existing membership.
4. Amanda recommends the dedicated auditor role as the durable auditable option, but that requires an owner-authorized grant and is not currently available from the observed NOLOGIN owner identity.

### Attempted temporary membership change — rejected, no change made

The user attempted the temporary option using the Dashboard Default connection. PostgreSQL returned:

```text
ERROR: ADMIN option cannot be granted back to your own grantor
```

The attempted statement was:

```sql
GRANT ghm_schema_owner TO ghm_db_user
WITH ADMIN OPTION, INHERIT FALSE, SET TRUE;
```

The grantor relationship prevents `ghm_db_user` from re-granting ADMIN OPTION to itself in this way. Consequently, `SET LOCAL ROLE ghm_schema_owner` was denied because the membership's `SET` option remained false, and SELECT on `ghm.ghm_schema_migrations` remained denied.

The first attempted transaction was not successfully started because the connection dropped during `BEGIN`; psql reconnected. The subsequent attempt was inside an explicit transaction, failed at GRANT, and was ended with `ROLLBACK`. A later standalone `ROLLBACK` also returned successfully. **No membership option, role attribute, table privilege, ownership, migration, credential or other production database state was changed by these attempts.**

### Correct next action

Do not retry the GRANT with altered ADMIN/INHERIT/SET clauses and do not try to work around the error by changing ownership or granting table privileges.

First use a read-only catalogue query to capture the exact grantor for the existing membership, along with its options:

```sql
SELECT
    granted.rolname AS granted_role,
    member.rolname AS member_role,
    grantor.rolname AS grantor_role,
    m.admin_option,
    m.inherit_option,
    m.set_option
FROM pg_auth_members AS m
JOIN pg_roles AS granted ON granted.oid = m.roleid
JOIN pg_roles AS member ON member.oid = m.member
JOIN pg_roles AS grantor ON grantor.oid = m.grantor
WHERE granted.rolname = 'ghm_schema_owner'
  AND member.rolname = 'ghm_db_user';
```

Then return the exact PostgreSQL error and grantor result to Amanda and ask how Render supports changing the SET option when the existing membership was granted by `ghm_db_user` itself and Render provides no superuser. Ask whether Render support can arrange the owner-authorized dedicated auditor grant or provide an administrator-authorized read-only ledger report. Do not assume Amanda's suggested temporary command is executable under this exact grantor topology.

The remaining read-only catalogue audit (roles, memberships including grantor, ownership and Actor Gateway effective privileges) can proceed using the current connection. The production migration ledger remains unread pending a supported owner-authorized route.

### Change record

Only attempted the temporary role-membership operation; it was rejected before changing membership state. Transactions were rolled back. No production migration, permission, credential, ownership, secret, service, deployment or application-data change occurred. No new recurring cost was incurred.


### 24.1 Grantor provenance confirmed — original grantor is postgres (2026-11-16)

The follow-up read-only `pg_auth_members` query returned exactly one membership row:

| granted_role | member_role | grantor_role | admin_option | inherit_option | set_option |
|---|---|---|---:|---:|---:|
| ghm_schema_owner | ghm_db_user | postgres | true | false | false |

This corrects the earlier working assumption that `ghm_db_user` was the original grantor. The catalog records `postgres` as grantor. The membership remains ADMIN OPTION=true / INHERIT=false / SET=false.

The earlier attempted statement to grant `ghm_schema_owner` to `ghm_db_user` with ADMIN OPTION and SET TRUE was rejected with:

```text
ERROR: ADMIN option cannot be granted back to your own grantor
```

The precise reason for that error under this recorded grantor topology is not yet established. Do not claim that the catalog proves ghm_db_user was its own grantor, and do not attempt further GRANT/REVOKE variations. Ask Amanda/Render support to explain the error against this exact catalog row and provide a supported owner-authorized auditor route or administrator-generated ledger report.

The query was read-only. No membership, role, privilege, ownership, migration or other production state changed.


## 24. Founder-only exact document approval HTTP route — PR in progress (2026-11-16)

Following merged PR #292, the next bounded source-only slice wires the qualified database approval transition through Actor Gateway.

- Branch: `feat/actor-gateway-commercial-document-approval-route-v2-20261116`
- Route: `POST /v1/owner/commercial-document-approval`
- Reader: `src/actor-gateway/commercial-document-approval-reader.ts`
- Route tests: `src/actor-gateway/commercial-document-approval-app.test.ts`
- Reader tests: `src/actor-gateway/commercial-document-approval-reader.test.ts`
- App dependency and HTTP route: `src/actor-gateway/app.ts`
- Runtime reader wiring: `src/actor-gateway/server.ts`
- Standard test script includes both new test files.

### Request/identity boundary

The only accepted body properties are `documentVersionId` and `reason`. The route rejects caller-supplied actor/approver identity, extra fields, invalid IDs and invalid reasons. The actor is derived exclusively from the existing verified ES256 bearer token. The reader signs the exact version ID/reason with the distinct HMAC operation `commercial.document.status.approve` and invokes `ghm.gateway_approve_commercial_document_version` inside a transaction.

Response mapping: authorization denial 403, invalid request 400, already-transitioned/conflicting state 409, missing version 404, infrastructure failure 503. SQL detail is not returned to the caller.

### Qualification status

Exact-head CI is pending. Reader and HTTP tests cover HMAC context binding, transaction commit/rollback, actor derivation, rejection of caller-supplied approver fields, strict body validation, missing bearer, founder denial, conflict and missing-version mapping. The SQL function's deeper positive/negative behavioral qualification already passed in PR #292 disposable PostgreSQL CI.

### Explicit boundaries

- No route call has been made against production.
- No owner authority row has been assigned and no legal document/version has been registered or approved in production.
- No consent/payment write, production migration, production ACL/credential change, Render service creation, deployment, secret change or launch activation.
- Do not mistake successful source/CI qualification for production readiness. Production backup, administrator privilege, migration-ledger, Actor Gateway hosting/cost and deployment gates remain.
- The only human approver is the owner. The assistant is not an employee, legal person, approver or signatory. Do not create a placeholder/ghost reviewer.
- Keep `launchAuthorized=false` and `onlineSubscriptionActivation=false`.


### 24.1 Founder-only document approval route qualification passed (2026-11-16)

PR #293 exact code head `c5d1a256f4b896f447e9ee3f2115be15305d6ee5` passed workflow `43912090319`:
- `web-quality`: success (11/11 steps).
- `quality`: success (73/73 steps).
- TypeScript build and all repository migrations on disposable PostgreSQL passed.
- Full test suite passed, including the new Actor Gateway approval reader and HTTP route tests.
- Existing Actor Gateway, Auth Issuer, migration, and database-principal qualifications passed.

The new route tests verify verified-bearer actor derivation, strict request allow-list, rejection of caller-supplied actor/approver fields, invalid version/reason rejection before database access, 401 for missing bearer, 403 founder denial, 409 state conflict, 404 missing document version, and transaction rollback/release on database denial. The reader test verifies HMAC binding to the exact version ID and reason and commits only on successful database result.

SQL positive/negative approval behavior (current grant, revocation denial, re-grant, duplicate denial, wrong scope, non-founder, forged/context-transplanted/replayed/expired assertion) was separately qualified in PR #292's disposable PostgreSQL CI. No production route call, owner authority assignment, legal document registration/approval, consent/payment write, production migration, ACL/credential change, Render service, deployment or launch activation occurred.


## 25. PR #293 merged — founder-only exact document approval route (2026-11-16)

PR [#293](https://github.com/zaidhqdev-sys/GHM/pull/293) was squash-merged after exact-head qualification and final source review.

- Exact final tested PR head: `7453a01b5f73d83650f50075221a05e5505f9f1d`.
- Exact-head workflow: `43912686190`.
- `quality`: success (73/73 steps).
- `web-quality`: success (11/11 steps).
- Merge commit: `f6e75dc91636ecb76b00485736afd69b6c92d768`.

The route is `POST /v1/owner/commercial-document-approval`. Its only body fields are `documentVersionId` and `reason`; actor identity comes exclusively from the verified ES256 bearer token. The reader signs the exact version/reason with the separate one-use HMAC operation `commercial.document.status.approve`, calls the approved database transition inside a transaction, and commits only on a single successful result. Reader/HTTP tests verify exact HMAC binding, commit/rollback, no caller-supplied approver, strict request validation, missing bearer denial, founder denial, conflict and missing-version mapping.

The database-side positive/negative authorization behavior was qualified separately by PR #292 on disposable PostgreSQL. The merged route is source-only: no production route call, authority grant, legal document registration/approval, consent/payment write, production migration, production ACL/credential change, Render service creation, deployment, secret change or launch activation occurred. The owner is the only human approver; the assistant is not an employee, approver or legal signatory.

Main-branch CI for merge commit `f6e75dc91636ecb76b00485736afd69b6c92d768` was queued when this handover entry was written; record its final result in a follow-up handover entry. Keep `launchAuthorized=false` and `onlineSubscriptionActivation=false`.


### 25.1 Main-branch qualification passed (2026-11-16)

Merge commit `f6e75dc91636ecb76b00485736afd69b6c92d768` passed main workflow `43913244198`:
- `quality`: success (73/73 steps).
- `web-quality`: success (11/11 steps).
- Disposable PostgreSQL migration application, full test suite and existing gateway/auth/database qualifications passed.

This confirms the merged source on main. It does not authorize a production migration, route call, Render deployment, authority assignment, legal-document approval, consent or payment activation.


## 26. GHM-native explicit consent + payment preparation — PR #294 merged (2026-11-16)

After PR #293, the next bounded implementation is a GHM-native database boundary for recording customer acceptance of an exact approved subscription-terms version and preparing a Business payment attempt atomically.

- Branch: `feat/commercial-consent-payment-preparation-gateway-20261116`
- Migration: `database/migrations/20261116190000_add_commercial_consent_payment_prepare_gateway.sql`
- Migration contract test: `src/db/commercial-consent-payment-prepare-gateway-migration-contract.test.ts`
- Exact gateway ACL allow-list: `src/actor-gateway/database-privileges.ts`
- Disposable behavioral qualification extended in `scripts/qualify-actor-gateway-principal.mjs`
- Standard `npm test` includes the new migration contract test.

### Database transaction

The new `ghm.gateway_prepare_commercial_payment_with_consent` operation:
- Requires a one-use, short-lived HMAC assertion with distinct operation `commercial.payment.prepare_with_consent`.
- Binds Business ID, exact document version, country, idempotency key, server-selected provider code, explicit `accepted=true`, expiry and request ID.
- Rechecks active GHM account and active Business owner/administrator membership; membership is row-locked before idempotency replay is returned.
- Locks the current Business subscription and selects an active effective price for the exact plan version/country.
- Requires exact immutable `subscription_terms` version, plan-compatible scope, jurisdiction-compatible scope and latest status `approved`.
- Inserts payment attempt, append-only customer consent evidence and `subscription_payment_prepared` commercial event in one transaction.
- Serializes by idempotency key. Retry returns only the matching original payment attempt and consent evidence; a changed document/country/provider/business/actor conflicts.
- Grants EXECUTE only to `ghm_actor_gateway`; no direct table grants or runtime/PUBLIC access.

Provider identity remains provider-neutral and server-selected. The Actor Gateway HTTP layer must verify that the configured provider adapter is installed; a browser cannot choose the provider. This database function does not call a provider, create a checkout redirect, settle a payment or activate a subscription.

### Disposable qualification plan

The existing Actor Gateway principal qualification now creates synthetic Business/plan/price/subscription/document fixtures, grants and approves a synthetic subscription document inside a disposable transaction, then tests successful consent/payment preparation, exact consent linkage, idempotent replay, idempotency-key document transplant denial, explicit-acceptance requirement, non-member denial, unapproved-document denial, forged assertion denial and assertion replay denial. All mutable grant/approval/consent/payment/event writes are rolled back. Synthetic immutable draft/version rows remain only in ephemeral CI and contain no real legal content.

### Explicit boundaries

- This PR is database-side only; no HTTP route/reader is exposed yet.
- No legal document/hash has been supplied, registered or approved in production.
- No owner authority assignment, customer consent, payment attempt, checkout, provider API call, settlement or activation in production.
- No production migration, ACL/credential change, Render service, secret or deployment.
- Existing Supabase-mapped internal payment preparation is legacy and is not the approved GHM-native path. It must be reconciled/retired in a later Connect cutover; do not treat it as customer-consent-qualified.
- Payment launch remains frozen: `launchAuthorized=false`, `onlineSubscriptionActivation=false`. PayFast activation remains frozen and no provider round-trip is authorized.

Exact-head CI and disposable PostgreSQL qualification are pending. Do not merge until SQL application, Actor Gateway ACL, full suite and behavioral tests pass.


### 26.1 Disposable PostgreSQL and exact-head qualification passed (2026-11-16)

PR #294 exact implementation head `e1cd4e56ec90123eb3614c2f4297a08af6f26cba` passed workflow `43916035085`:
- `quality`: success (73/73 steps).
- `web-quality`: success (11/11 steps).
- All migrations applied to disposable PostgreSQL.
- Full test suite passed, including the new migration contract tests.
- Actor Gateway database-principal qualification passed, including the new consent/payment behavior.
- Existing Actor Gateway, Auth Issuer, Connect provisioning, Capability and Opportunity qualifications passed.

The payment qualification demonstrated synthetic exact-document approval, atomic payment-attempt + consent-event return, original evidence on idempotent retry, denial of changed-document idempotency reuse, false acceptance, non-member, unapproved document, forged assertion and replay. It explicitly confirmed that `ghm_actor_gateway` cannot directly read `commercial_consent_event`. All payment/consent/commercial-event writes were rolled back and a schema-owner check confirmed zero residual rows. No real legal content or production write was used.


### 26.2 PR #294 merge record

PR [#294](https://github.com/zaidhqdev-sys/GHM/pull/294) was squash-merged after exact-head qualification. Merge commit: `4614c70ba506914de1ebfe1f6e77c5a6a19971f9`. Exact final PR head `048f94d500d457d207b0d23a1d6ae279b3941029` passed workflow `43916734126` (`quality` 73/73, `web-quality` 11/11). No production migration or live commercial operation was performed.


## 27. GHM-native commercial consent/payment HTTP route — PR in progress (2026-11-16)

Following merged database boundary PR #294, this branch wires the exact approved-document consent/payment preparation operation through Actor Gateway.

- Branch: `feat/actor-gateway-commercial-consent-payment-route-20261116`
- Route: `POST /v1/commercial/payment-prepare`
- Reader: `src/actor-gateway/commercial-consent-payment-preparation-reader.ts`
- Reader tests: `src/actor-gateway/commercial-consent-payment-preparation-reader.test.ts`
- HTTP tests: `src/actor-gateway/commercial-consent-payment-preparation-app.test.ts`
- App route and dependencies: `src/actor-gateway/app.ts`
- Runtime wiring and environment gates: `src/actor-gateway/server.ts`
- Standard `npm test` includes reader and route tests.

### Request and provider boundary

The route accepts exactly `businessId`, `documentVersionId`, `countryId`, `idempotencyKey`, and `accepted=true`. It rejects browser-supplied provider codes, actor IDs, approver IDs and extra fields. Actor identity comes exclusively from the verified ES256 bearer token. Optional `x-request-id` is bounded and included in the signed assertion/evidence.

The reader selects provider only from server-side `GHM_COMMERCIAL_PAYMENT_PROVIDER` (default `payfast`) and currently fails startup if it is not an installed adapter. No provider is chosen by the browser. The reader calls the merged PR #294 database operation in one transaction; it does not call a provider, create a checkout URL, settle a payment or activate a subscription.

### Independent launch gates

The route is unavailable unless both server-side settings are exactly true:
- `GHM_COMMERCIAL_PAYMENT_PREPARATION_ENABLED=true`
- `GHM_COMMERCIAL_LAUNCH_AUTHORIZED=true`

Both default false when absent. These are independent gates; the UI/request cannot override them. No environment setting has been changed in Render. The source does not authorize online subscription activation; that remains a separate frozen lifecycle.

### Explicit boundaries

- No production route call, authority grant, real legal document registration/approval, customer consent, payment attempt, checkout, provider API call, settlement or activation.
- No production migration, ACL/credential change, Render service, secret or deployment.
- Existing Supabase-mapped internal payment preparation remains legacy and is not the native consent-qualified route.
- Real legal terms and their SHA-256 hashes are not supplied; even with route gates opened, the database rejects missing/unapproved/mismatched document versions.
- Keep `GHM_COMMERCIAL_PAYMENT_PREPARATION_ENABLED=false`, `GHM_COMMERCIAL_LAUNCH_AUTHORIZED=false`, `launchAuthorized=false`, and `onlineSubscriptionActivation=false`.

Exact-head CI and final route review are pending.


### 27.1 Gated native consent/payment route exact-head CI passed (2026-11-16)

PR #295 exact implementation head `47dee30d53c48fea9a816c0ca556207dccef0143` passed workflow `43918100477`:
- `quality`: success (73/73 steps).
- `web-quality`: success (11/11 steps).
- TypeScript build, all migrations on disposable PostgreSQL and full test suite passed.
- Reader tests verify HMAC binding to Business/document/country/idempotency/provider/acceptance/request ID, transaction commit/rollback and fail-closed provider adapter selection.
- HTTP tests verify both launch gates are independently required, bearer-derived actor identity, strict body allow-list, explicit acceptance, rejection of browser provider/actor fields and safe denial/conflict/not-found mapping.

The implementation remains source-only and disabled by default. No Render environment variables were changed, no service deployed, no production route called, no legal document or consent/payment row created, and no provider request made.


## 28. PR #295 merged — gated GHM-native consent/payment preparation route (2026-11-16)

PR [#295](https://github.com/zaidhqdev-sys/GHM/pull/295) was squash-merged to main as `01add46c88eb8cae456420745c1ca20d8848fd41`.

- Exact final PR head: `aacc1dd504ac71d4b4279fb85aa62d1ffe8270bc`.
- Exact-head workflow `43918735589`: `quality` and `web-quality` both passed.
- Implementation qualification workflow `43918100477` also passed on code head `47dee30d53c48fea9a816c0ca556207dccef0143`.
- Route: `POST /v1/commercial/payment-prepare`.
- Browser allow-list: `businessId`, `documentVersionId`, `countryId`, `idempotencyKey`, and `accepted=true`; browser cannot choose provider or supply actor/approver identity.
- Actor identity is derived from verified ES256 bearer authentication. The reader signs the exact request context and invokes the atomic PR #294 database operation.
- Both `GHM_COMMERCIAL_PAYMENT_PREPARATION_ENABLED` and `GHM_COMMERCIAL_LAUNCH_AUTHORIZED` default false and must independently be true for the route to accept requests.
- The route prepares evidence/payment-attempt state only. It does not call a provider, create checkout, settle, or activate a subscription.

### Provider portability requirement — explicit follow-up

The PR #295 HTTP reader currently has a hard-coded installed-adapter set containing only `payfast`. That is a truthful reflection of the currently wired adapter, not an architectural decision to bind ZAID Technologies to PayFast. The commercial database operation accepts a provider code generically, and the browser cannot choose it.

The next provider-boundary slice must remove the hard-coded PayFast-only allow-list in favor of a provider-neutral server-side adapter registry/capability contract. Provider choice must remain configuration-driven and accepted only when a matching adapter is actually installed and qualified. Adding Stripe or another provider later must not require rewriting the consent/payment database contract or browser API. Do not claim another provider is installed until its adapter, configuration, webhook/settlement boundary and tests exist.

### Current hard stops — unchanged

- No production migration, production authority grant, legal document registration/approval, consent/payment write, provider API call, checkout, settlement, subscription activation, Render environment change, credential change or deployment occurred through PR #295.
- Actor Gateway production hosting remains the dedicated always-on Render Frankfurt Web Service decision; no additional paid service has been approved or created.
- Production migration-ledger administrator read, fresh verified backup, migration reconciliation, gateway DB ACL installation/credential and hosting/cost gates remain unresolved.
- PayFast remains excluded from activation until the owner explicitly resumes that work and the provider/production gates are met.
- Keep both commercial preparation/launch environment gates false; keep `launchAuthorized=false` and `onlineSubscriptionActivation=false`.

The next work should address the provider-neutral adapter boundary and the real Actor Gateway hosting/production prerequisite path in bounded slices. Do not create another endless disposable qualification-only branch while the hosting/production blocker remains unresolved.

## 29. Production migration-ledger auditor established and verified (2026-11-16)

This section supersedes earlier statements in sections 3, 5, 6, 7 and 8 that the production migration ledger remained unreadable through the available local psql session or that no production role/privilege changes had occurred. The earlier observations remain historically accurate for the time they were made; the state below is the later, committed state.

### Session identity and initial state

The user connected locally using the Render external database connection, without sharing the connection URL or password. The psql session reported:

- `current_database=ghm_db`
- `session_user=ghm_app_user`
- `current_user=ghm_db_user`

Before the change, `ghm_auditor` did not exist. The existing membership catalogue showed:

- `ghm_schema_owner` granted to `ghm_db_user` by `postgres`: ADMIN=true, INHERIT=false, SET=false.
- `ghm_schema_owner` granted to `ghm_migrator` by `ghm_db_user`: ADMIN=false, INHERIT=false, SET=true.

### Auditor provisioning — committed

Within a transaction, the user created `ghm_auditor NOLOGIN`. A temporary membership granted by `ghm_db_user` with SET=true / INHERIT=false was used to `SET LOCAL ROLE ghm_schema_owner` and grant:

- USAGE on schema `ghm` to `ghm_auditor`.
- SELECT on table `ghm.ghm_schema_migrations` to `ghm_auditor`.

The temporary `ghm_schema_owner` membership was explicitly revoked with `GRANTED BY CURRENT_USER`. A separate temporary `ghm_auditor` membership (SET=true / INHERIT=false, granted by `ghm_db_user`) allowed a real identity-switch test. Under `current_user=ghm_auditor`, the query `SELECT COUNT(*) FROM ghm.ghm_schema_migrations` succeeded and returned **105 rows**. The temporary auditor membership was then explicitly revoked with `GRANTED BY CURRENT_USER`.

The transaction was committed successfully. Post-commit verification confirmed:

- `ghm_auditor`: NOLOGIN; SUPERUSER=false; CREATEDB=false; CREATEROLE=false; BYPASSRLS=false.
- `has_schema_privilege('ghm_auditor', 'ghm', 'USAGE') = true`.
- `has_table_privilege('ghm_auditor', 'ghm.ghm_schema_migrations', 'SELECT') = true`.
- No temporary SET membership remains for `ghm_db_user`.
- Original `ghm_schema_owner` membership remains: grantor `postgres`, ADMIN=true, INHERIT=false, SET=false.
- Original `ghm_migrator` membership remains: grantor `ghm_db_user`, ADMIN=false, INHERIT=false, SET=true.

PostgreSQL automatically recorded the role-creator administration membership for `ghm_auditor`: `ghm_auditor` granted to `ghm_db_user`, grantor `postgres`, ADMIN=true, INHERIT=false, SET=false. This is the creator's administrative membership, not an application login or inherited auditor data access; the auditor is NOLOGIN and the membership does not permit SET ROLE or privilege inheritance. It was observed after commit and intentionally left unchanged.

### Scope and safety

This was a narrowly scoped production role/privilege change to enable read-only migration-ledger inspection. No production migration was applied; no application or gateway role was granted ledger SELECT; no table ownership changed; no gateway function, password, secret, service, deployment, environment variable, payment, consent, legal approval or application data was changed. No new recurring cost was incurred.

### Next step — authoritative reconciliation

The production ledger is now readable through the non-login auditor role. The verified count is 105 rows, but the version/name/checksum/status contents have not yet been reconciled against the current repository migration set. The next step is to export/read the exact ledger rows as `ghm_auditor`, compare them with the exact main-branch migration files and migration policy, and report applied, missing, checksum-mismatched, historical/approved-extra and unexplained entries. Do not run migrations or change the production Actor Gateway ACL as part of this read-only reconciliation.

The production backup/recovery gate, migration execution qualification, dedicated always-on Actor Gateway hosting/cost gate, gateway credential/ACL provisioning and deployment gates remain unresolved.



## 30. Full production migration ledger exported; current-main inventory refreshed (2026-11-16)

The user successfully exported all production ledger rows from Render `ghm-db` / `ghm_db` using the non-login `ghm_auditor` role. The export returned **105 rows** and the following exact schema:

| ordinal | column | type | nullable |
|---:|---|---|---|
| 1 | version | character varying | NO |
| 2 | name | character varying | NO |
| 3 | checksum | character varying | NO |
| 4 | applied_at | timestamp with time zone | NO |

The first ledger row is `00000000000000 / create_migration_ledger`; the highest/latest version is `20261109210000 / deactivate_unrecognized_public_directory_records`. The user supplied the complete ordered 105-row result in the 2026-11-16 conversation. Its complete values should be treated as the primary production evidence; no credentials or connection strings were shared.

### Auditor access cleanup reconfirmed

For the full export, the user repeated the bounded transaction:

1. `GRANT ghm_auditor TO ghm_db_user WITH SET TRUE, INHERIT FALSE GRANTED BY CURRENT_USER`.
2. `SET LOCAL ROLE ghm_auditor`.
3. Confirmed `current_user=ghm_auditor`, `session_user=ghm_app_user`.
4. Selected `version, name, checksum, applied_at` ordered by version; PostgreSQL returned **105 rows**.
5. `RESET ROLE`.
6. `REVOKE ghm_auditor FROM ghm_db_user GRANTED BY CURRENT_USER`.
7. `COMMIT`.

Both the schema-inspection transaction and full-ledger export transaction ended with explicit revoke and COMMIT. No temporary SET membership remains. Persistent grants remain limited to auditor schema USAGE and ledger SELECT; `ghm_auditor` remains NOLOGIN with no elevated attributes. No production migration was executed.

### Exact current-main inventory

A fresh GitHub recursive tree read inspected current `main` at `bf57690a1cddf4144acacde08097331e9e47fcb9` (the handover update immediately preceding this section). The tree was not truncated.

- SQL migration files in `database/migrations`: **143**.
- Production ledger rows: **105**.
- Latest applied ledger version: **20261109210000**.
- Repository migration versions later than the latest applied ledger version: **48**.
- Current `config/pending-migrations.production.json` entries: **7**.
- All seven configured entries are in the 48-version pending inventory; the allowlist omits **41** other pending versions.

The 48 version-later migrations comprise the previously documented 42-item inventory through `20261112170000`, plus six migrations added on 2026-11-16:

1. `20261116140000_generalize_commercial_payment_provider_code`
2. `20261116150000_create_commercial_consent_evidence`
3. `20261116160000_add_commercial_document_approval_authority`
4. `20261116170000_add_founder_only_commercial_document_authority_gateway`
5. `20261116180000_add_founder_only_commercial_document_approval_transition`
6. `20261116190000_add_commercial_consent_payment_prepare_gateway`

The six latest migrations are therefore repository-present and not recorded in the production ledger. The production pending configuration still contains only seven entries; it has not been changed. The version-count comparison is definitive for the current-main tree and the exported production ledger, but it is not a substitute for the full per-row SHA-256 comparison and retained-history classification.

### Reconciliation status and execution boundary

The prior 2026-11-15 audit documented 137 repository migrations, 105 ledger rows, 42 version-later migrations, zero unexplained checksum mismatches, and the seven-entry allowlist mismatch. Current main now contains six additional migration files, making the current counts **143 / 105 / 48**. The exact 105-row production ledger was freshly exported and its latest version agrees with that earlier audit.

Do not interpret all 48 as safe to apply. The set spans Actor Gateway installation and cutovers, auth and QuoteFlow privilege revocations, global function default-privilege hardening, storage/provider workflows, and the six new commercial migrations. Do not expand the seven-entry production allowlist to 48 and do not run `npm run migrate`. The current migration runner still lacks an approved staged-prefix execution boundary, and the gateway hosting, credential/ACL, verified backup/recovery, and production smoke-test gates remain open.

### Next audit action

Perform the deterministic full reconciliation against the exported 105 production rows and current-main migration SQL bytes: compare version/name/checksum using the repository's canonical LF and supported legacy CRLF checksum rules; classify the registered retained-history and provenance exceptions; produce the exact 48 pending rows; and confirm the seven-entry allowlist mismatch. Record each checksum mismatch or approved historical exception explicitly. Keep this read-only. Only after the full reconciliation should the migration batch design and production gate plan be updated.

No migration, allowlist, production ACL, credential, secret, Render service, deployment, environment variable, payment/consent record or application data was changed during this audit.


## 31. 2026-11-16 — Render support confirms SQL-managed application identities; production runtime ACL audit

### Amanda's written confirmation (received 2026-11-16 20:01 SAST)

Render support (Amanda) confirmed:

- The Render Dashboard default credential maps `ghm_app_user` to `ghm_db_user`; this is intentional and tied to Render's credential-rotation process.
- Render does not provide a separate managed database-administrator identity for this Postgres instance.
- The default user is the intended administrative identity; it retains administrative rights over roles it creates.
- Application identities with lower privileges should be created directly in PostgreSQL using SQL.
- A service can then use that SQL-created login by changing its `DATABASE_URL` to the new credentials. The default administrative user remains separate.
- This is standard PostgreSQL 16+ role behavior, not a Render defect.

**Architecture decision:** retain `ghm_db_user` for controlled database administration/migration operations. Do not use the Render default credential as the normal application connection. Use a dedicated SQL-managed login for each isolated service. The existing `ghm_runtime` login is the intended Resource API application principal in current GHM source; `ghm_actor_gateway` and `ghm_auth_issuer` remain separate service principals. Do not create a duplicate generic application role without first proving the existing role cannot serve its intended purpose.

### Current-main source contract reviewed

At current main `bfa7247f05084495ae062144a1b508528d049e37`:

- `src/db/runtime-principal.ts` requires the Resource API to connect with `session_user=current_user=ghm_runtime`; LOGIN=true, NOINHERIT, no elevated attributes, database CONNECT but not CREATE, schema USAGE but not CREATE, and no untrusted role memberships.
- `src/server.ts` runs this principal/privilege check before opening its HTTP listener.
- `src/db/runtime-database-privileges.ts` defines a 43-function SECURITY DEFINER baseline and accepts only reviewed combinations of nine explicit manual cutover groups (512 possible combinations).
- In production, function allow-list enforcement is currently skipped unless `GHM_RUNTIME_FUNCTION_ALLOWLIST_ENFORCED=true`, with the explicit warning `production_acl_baseline_not_yet_independently_qualified`. This is deliberate; do not enable the flag until production catalog state matches a reviewed stage.
- `src/actor-gateway/database-principal.ts` separately requires `ghm_actor_gateway`; its own database privilege contract is stricter and permits only its exact gateway function allow-list with no direct relation privileges.
- `src/db/pool.ts` uses `config.databaseUrl`; the source does not itself prove which credential is currently configured in Render. Never retrieve or expose the secret value to establish this.

### Read-only production catalogue evidence captured after Amanda's reply

Queries were run through Render's read-only Postgres query tool against `ghm_db`. That connector session is still `session_user=ghm_app_user`, `current_user=ghm_db_user`; it is not a connection as `ghm_runtime`. Therefore, the checks below inspect the named role's catalog/effective privileges but do not prove the live Resource API service's current `DATABASE_URL`.

Observed role attributes:

| Role | LOGIN | INHERIT | SUPERUSER | CREATEDB | CREATEROLE | BYPASSRLS |
|---|---:|---:|---:|---:|---:|---:|
| `ghm_db_user` | true | true | false | true | true | false |
| `ghm_runtime` | true | false | false | false | false | false |
| `ghm_actor_gateway` | true | false | false | false | false | false |
| `ghm_migrator` | true | false | false | false | false | false |
| `ghm_schema_owner` | false | false | false | false | false | false |
| `ghm_auditor` | false | true | false | false | false | false |

The `ghm_runtime` role has database CONNECT=true / CREATE=false and schema `ghm` USAGE=true / CREATE=false. It has privileges on 39 distinct relation objects (tables/views/sequences); these are the currently catalogued application data privileges, not proof of an unbounded administrator role. The full ACL inventory should be preserved and reconciled to route/repository use before any grant change.

The `ghm_runtime` role is granted to `ghm_db_user` in two catalog membership entries: one ADMIN=false / INHERIT=true / SET=true and one ADMIN=true / INHERIT=false / SET=false. This is the observed administrator-to-runtime membership direction. It does not mean the runtime login inherits `ghm_db_user` privileges. Preserve the exact current membership state pending a dedicated role-membership review; do not change it as part of this audit.

### Critical finding — live runtime function ACL does not match a reviewed source stage

A read-only catalog comparison normalized PostgreSQL `regprocedure` signatures and compared all SECURITY DEFINER functions executable by `ghm_runtime` against the exact 43-signature baseline in current main:

- Expected source baseline: **43**.
- Live production executable SECURITY DEFINER functions: **46**.
- Expected signatures absent from the live set: **9**.
- Live signatures not present in the source baseline: **12**.

Missing baseline signatures:
- `ghm.auth_redeem_recovery_with_count(bytea)`
- `ghm.auth_rehash_password_if_unchanged(bigint,text,text,integer,integer,integer)`
- `ghm.auth_reset_password_with_recovery(bytea,text,text,integer,integer,integer)`
- `ghm.create_capability_draft(bigint,text,text,text,uuid,integer,text,integer)`
- `ghm.get_public_business_hours(bigint)`
- `ghm.get_public_trust_score(bigint)`
- `ghm.list_public_trust_scores(text)`
- `ghm.transition_capability_lifecycle(bigint,uuid,text,uuid,integer)`
- `ghm.update_capability_draft(bigint,uuid,text,text,text,uuid,integer,text,integer)`

Additional live signatures outside the source baseline:
- `ghm.auth_bootstrap_external_identity(text,text,text,text)`
- `ghm.auth_change_password(bigint,bigint,text,text,text,integer,integer,integer)`
- `ghm.auth_disable_account(bigint)`
- `ghm.auth_link_business_external_mapping(text,text,bigint)`
- `ghm.auth_link_external_identity(text,text,bigint)`
- `ghm.auth_provision_migration_account(text,text,text,text)`
- `ghm.auth_read_account_email(bigint)`
- `ghm.auth_read_connect_identity_authority(bigint)`
- `ghm.auth_register_quoteflow_migration_reset_enrollment(bigint,text,text,text,text,text)`
- `ghm.auth_revoke_all_sessions_for_account(bigint,text)`
- `ghm.auth_revoke_session(bigint,text)`
- `ghm.update_business_profile(bigint,bigint,jsonb)`

This means the live production SECURITY DEFINER EXECUTE set is **not equal to the current source baseline or any of its 512 subset-only manual-cutover stages**, because it contains additional functions as well as missing baseline functions. The production runtime currently skips enforcement of this function allow-list unless the environment flag is explicitly enabled. Do not enable enforcement yet, and do not attempt to fix the mismatch with broad grants/revokes or by running the full pending migration queue.

### Decision and next work

1. Treat `ghm_runtime` as the intended SQL-managed Resource API login, subject to proving the deployed service actually uses it. Do not create a second generic application login.
2. Keep `ghm_db_user` as the Render default administrator/migration operator; keep `ghm_runtime`, `ghm_actor_gateway`, and `ghm_auth_issuer` isolated.
3. Do not change `DATABASE_URL`, role attributes, role memberships, table grants, function grants, migration ledger, secrets, or Render service configuration during this audit.
4. Next, trace every one of the 9 missing and 12 additional SECURITY DEFINER functions to its owning migration/cutover and determine which catalog state is historically valid, which source stage is intended, and whether any grants are unsafe or simply newer/older than main's reviewed baseline.
5. Separately inventory all 39 runtime relation objects and map each privilege to current Resource API repository/query usage. Keep direct relation privileges only where the application demonstrably requires them; prefer narrowly scoped functions for sensitive operations where the existing architecture provides them.
6. Verify the deployed Resource API's database identity without reading secret values. The strongest proof is a safe startup/diagnostic observation of `session_user` and `current_user` from the running service, or an administrator-assisted connection identity report.
7. Only after the production function/relation ACL state matches a reviewed contract should the production enforcement flag be considered. Then qualify the service against the restricted identity before any credential switch/cutover.

### Change record

All Render database operations in this section were read-only SELECT/catalogue queries. GitHub operations were read-only source inspection before this handover update. No SQL mutation, grant/revoke, role/membership change, migration, credential rotation, secret read/write, environment change, service creation, deployment, or payment/consent action was performed. No recurring cost was incurred.


## 32. 2026-11-16 — first-pass provenance mapping of runtime ACL differences

The follow-up source trace confirms that the production ACL mismatch is not a reason to invent a new role or immediately rewrite grants. Several live extra permissions are explicitly removed by later repository migrations which are version-later than the current production ledger's latest applied version. This is consistent with the known unapplied migration backlog and explains part of the observed state.

### Confirmed source provenance

- `auth_provision_migration_account(text,text,text,text)` is created/granted to `ghm_runtime` by `20261004030000_create_quoteflow_migration_account_provisioning.sql` and corrected by `20261004040000_reconcile_quoteflow_migration_account_provisioning.sql`. Migration `20261111240000_revoke_runtime_quoteflow_migration_provisioning.sql` explicitly revokes it from PUBLIC and `ghm_runtime`.
- `auth_link_external_identity(text,text,bigint)` is explicitly revoked from PUBLIC and `ghm_runtime` by `20261111250000_revoke_runtime_external_identity_link.sql`.
- `auth_bootstrap_external_identity(text,text,text,text)` is explicitly revoked from PUBLIC and `ghm_runtime` by `20261111260000_revoke_runtime_external_identity_bootstrap.sql`.
- `auth_change_password(bigint,bigint,text,text,text,integer,integer,integer)` and `auth_disable_account(bigint)`, as well as `auth_revoke_session(bigint,text)`, are explicitly revoked from PUBLIC and `ghm_runtime` by `20261111220000_revoke_unused_auth_runtime_entry_points.sql`.
- `auth_register_quoteflow_migration_reset_enrollment(bigint,text,text,text,text,text)` is explicitly revoked from PUBLIC and `ghm_runtime` by `20261112040000_revoke_runtime_quoteflow_reset_enrollment_registration.sql`.
- `create_capability_draft`, `update_capability_draft`, and `transition_capability_lifecycle` are introduced/granted in `20261110160000_add_admin_capability_catalogue_governance.sql`; the later `20261110250000_add_gateway_capability_governance.sql` creates gateway wrappers and explicitly revokes the gateway functions from PUBLIC/runtime/migrator. The legacy runtime function grants must be traced through the full migration file before classifying the exact production result.
- `update_business_profile(bigint,bigint,jsonb)` is introduced in `20260916250000_extend_business_profile_trust_inputs.sql`; `20261109100000_persist_business_profile_presentation_fields.sql` and `20261110265000_reconcile_business_profile_legacy_contract.sql` successively replace its implementation. The latter is version-later than the production ledger's latest applied version, so its body must not be assumed present merely because the signature exists.
- The current-main runtime source baseline itself includes a number of legacy functions that later migrations explicitly cut over/revoke. The runtime checker permits only the 512 combinations of nine named manual cutover groups; it does not model arbitrary later pending migrations that add/remove unrelated function grants. This means we must reconcile the intended final source contract with the exact production migration prefix before enabling it.

### Interpretation

The production catalog includes runtime-executable functions which the repository explicitly intends to revoke in later migrations. The 2026-11-16 read-only catalogue therefore confirms a real ACL cutover gap, not just a naming or signature-formatting difference. The production ledger's latest version is still `20261109210000`; migrations `20261111220000`, `20261111240000`, `20261111250000`, `20261111260000`, and `20261112040000` are version-later and have not been evidenced as applied in the supplied ledger export. Their absence is consistent with the still-live runtime grants above.

The source trace is partial, not a complete classification of all 9 missing and 12 additional signatures. Do not declare the ACL safe or unsafe solely from function names; inspect full function bodies, exact grant/revoke statements, dependency/caller use and production migration history.

### Next precise action

Continue a per-signature provenance matrix for every missing and unexpected runtime-executable SECURITY DEFINER function. For each row record: creator/replacement migration(s), exact GRANT/REVOKE migration(s), version relative to production ledger, current-main intended state, live owner/search_path/PUBLIC grants, and whether a live application caller still exists. Then compare the 39 relation objects and column-level ACLs to Resource API repository SQL. Keep all queries read-only. No production grants/revokes, migrations, credential changes, deploys or service changes are authorized by this investigation.


## 33. 2026-11-16 — production runtime relation, sequence and column ACL inventory

A further read-only catalogue pass captured the Resource API runtime's direct relation and sequence permissions. The Render query connection remains `session_user=ghm_app_user`, `current_user=ghm_db_user`; all effective privilege checks below explicitly name `ghm_runtime`. No ACL was changed.

### Relation-level permissions

- Exactly **39** `ghm` relation objects currently grant at least one direct table/view privilege to `ghm_runtime`.
- Objects are owned by `ghm_schema_owner`.
- The set is predominantly SELECT. Direct write privileges are present on selected objects, including:
  - `business`: SELECT, INSERT.
  - `business_membership`: SELECT, INSERT.
  - `opportunity`: SELECT, INSERT, UPDATE.
  - `opportunity_capability_requirement`: SELECT, DELETE.
  - `business` and `opportunity` need particular attention because the catalogue shows table-level privilege presence; column grants alone cannot safely be inferred from the aggregate effective privilege check.
- The read-oriented set includes account identity/session views and core business, category, hours, offering, campaign, capability, commercial, customer, enquiry, notification, opportunity, project, quote, review, saved-business, support and trust-score objects. The exact inventory is retained in the live query output from this audit; no direct relation privilege was granted during this work.
- The catalogue query's effective `has_table_privilege` checks include inherited permissions. The separately captured direct ACL column identifies direct `ghm_runtime` grants. The next ACL report must distinguish table-level ACLs, column ACLs, PUBLIC ACLs, role-inherited ACLs and default privileges rather than treating these as interchangeable.

### Column-level ACLs

The production catalog contains extensive explicit column-scoped INSERT/UPDATE grants. They cover profile fields, business offering details, business/category assignments, capability and evidence submission, customer/enquiry creation, notification read-state, opportunity capability requirements/participants, project/quote fields, review moderation and support-request workflows.

Examples of important restrictions visible in the live catalog:
- `account_identity` UPDATE is limited to `full_name`, `phone`, `avatar_ref`, `updated_at`, `connect_role` and `business_operator_intent`.
- `business` UPDATE is limited to `rating`, `review_count`, `updated_at`; this is the review aggregate boundary.
- `business_capability` INSERT is limited to submitted capability fields, excluding verification authority columns.
- `review` INSERT/UPDATE is column-scoped, with moderation columns explicitly separated.
- `project` and `project_quote` have field-scoped INSERT/UPDATE; Project and Quote lifecycle status fields are separately governed.
- Commercial payment attempt, subscription, trial and event writes are column-scoped. They do not grant blanket UPDATE/DELETE on those tables.
- `support_request` and `support_request_message` are column-scoped for creation and state transitions.

No column ACL changes were made. This list is an inventory, not approval of every current privilege. Each column grant still needs to be tied to a current route/repository caller and the exact applied migration prefix.

### Sequence privileges

The current catalog shows **38** sequences with effective privileges for `ghm_runtime`. Most are USAGE-only; a subset also has SELECT. None of the inventoried runtime sequences had UPDATE=true.

Important provenance:
- `20260914100000_create_opportunity_core.sql` contains a broad historical `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ghm TO ghm_runtime`. This is a likely source of legacy SELECT privileges on sequences that existed at that migration point.
- `20260910230000_create_project.sql` and `20260912030000_grant_review_runtime_access.sql` establish schema-owner default USAGE grants on future sequences.
- `20260915203000_reconcile_commercial_runtime_sequence_acl.sql` explicitly revokes USAGE from the Commercial sequence set and removes the schema-owner default USAGE grant. The live Commercial sequences currently show USAGE only where later specific grants reintroduced it, not broad Commercial SELECT.
- `20261003153000_revoke_runtime_reference_sequence_privileges.sql` removes USAGE/SELECT/UPDATE from country and currency sequences.
- `20261111210000_revoke_runtime_account_external_identity_table_access.sql` explicitly revokes all runtime access to `account_external_identity_id_seq`, but this migration is later than the latest production ledger row. Production currently still shows USAGE on this sequence.

The 38-sequence inventory therefore needs per-sequence provenance, especially legacy SELECT grants, explicit USAGE grants and the default-privilege history. Do not bulk revoke sequence privileges.

### Confirmed pending cutover explains live direct identity access

The live catalog currently shows:
- `account_external_identity`: direct runtime SELECT.
- `account_external_identity_id_seq`: direct runtime USAGE.

The current-main migration `20261111210000_revoke_runtime_account_external_identity_table_access.sql` explicitly revokes ALL from PUBLIC and `ghm_runtime` on both the table and sequence, while retaining explicit EXECUTE grants for narrow identity operations. This migration is later than production's latest ledger version `20261109210000`, so the live permissions are consistent with the pending cutover. Do not hand-apply only this revocation out of migration order; reconcile and qualify the complete intervening migration prefix first.

### Additional source provenance confirmed

- `20260910230000_create_project.sql` grants SELECT plus field-scoped INSERT/UPDATE on Project and USAGE on its sequence; status mutation was added separately by `20260914130000_reconcile_project_quote_transition_privilege.sql`.
- `20260914100000_create_opportunity_core.sql` historically grants table-level SELECT/INSERT/UPDATE on `opportunity`, SELECT on reference tables and broad existing sequence USAGE/SELECT. This is a key legacy grant requiring exact review against later migrations and current query callers.
- `20260914120000_create_project_quote.sql` grants SELECT and field-scoped INSERT/UPDATE on Project Quote, with sequence USAGE. It intentionally avoids blanket DML.
- `20260912030000_grant_review_runtime_access.sql` grants SELECT and field-scoped INSERT/UPDATE on Review plus sequence USAGE.
- `20260916210000_create_business_capability.sql` and `20260916213000_narrow_business_capability_runtime_insert.sql` establish the restricted capability submission columns and exclude verification-state writes.
- `20260916251000_narrow_business_profile_runtime_update.sql` removes table-wide UPDATE on `business` and grants only `rating`, `review_count`, `updated_at`.
- `20260916230000_create_saved_business.sql` revokes direct INSERT/UPDATE/DELETE and grants EXECUTE on owner-bound functions instead.
- `20260921130000_create_auth_runtime_functions.sql` narrows account profile UPDATE and revokes direct DML on credential/session/mapping tables.
- `20261003150000_create_country_currency_reference_data.sql` grants reference-table SELECT and explicitly removes runtime writes.
- `20261012120000_revoke_runtime_business_mapping_table_access.sql` removes all direct runtime privileges on `business_external_mapping`.
- `20261111210000_revoke_runtime_account_external_identity_table_access.sql` is the later corresponding cutover for person external identity table and sequence access.

### Deployed Resource API database identity remains unproven

A Render application-log query for the GHM Internal Runtime resource `srv-damupsek1f9s73eq8kkg` covering 2026-11-16 18:00–20:30 UTC returned no log entries. It therefore provided no connection identity evidence. Source inspection shows the service pool uses the configured `config.databaseUrl`, and startup enforces the `ghm_runtime` principal contract, but this does not establish the live secret value or prove which database role a running instance uses. Do not inspect or expose the secret value. We need a safe, non-secret runtime identity diagnostic (or a controlled application-side log of `session_user`/`current_user`) before claiming the deployed service is using `ghm_runtime`.

### Next audit tranche

1. Export exact relation ACLs including `relacl`, per-column `attacl`, PUBLIC grants, role membership inheritance, and schema-owner default privileges.
2. Build the per-relation and per-sequence provenance matrix, starting with legacy broad opportunity/sequence grants and the identity-table pending cutover.
3. Map each write grant to an active Resource API route/query and confirm that owner/tenant authorization is enforced in the caller or a SECURITY DEFINER boundary.
4. Trace the remaining function differences and identify which later migrations in the pending prefix reconcile them.
5. Establish safe deployed identity evidence without reading Render secrets.

No database mutation, migration, role/grant/revoke change, credential rotation, secret read/write, service/environment change or deployment occurred. All production queries in this section were read-only.


## 34. 2026-11-16 — runtime ACL source-to-caller mapping and RLS boundary finding

A further read-only review compared the exact live table/column ACLs against current-main repository SQL and PostgreSQL row-security catalog state.

### Corrected relation inventory counts

The production `ghm` schema currently contains 59 ordinary/partitioned tables and one view. Of those:
- 38 tables have effective `ghm_runtime` SELECT.
- One view (`project_public`) has effective `ghm_runtime` SELECT.
- Three tables have table-level INSERT: `business`, `business_membership`, `opportunity`.
- One table has table-level UPDATE: `opportunity`.
- One table has table-level DELETE: `opportunity_capability_requirement`.
- No table-level runtime privilege observed was grantable.
- The exact ACL inventory shows no direct PUBLIC table/sequence grants among the objects in the runtime-access set. Column-level ACLs are separate and numerous.

### Critical finding — no RLS on runtime-accessible tables

Exactly three tables in the entire `ghm` schema currently have row-level security enabled:
- `business_directory_review_event`
- `business_registration_identity`
- `directory_listing_founder_reviewer`

None of these three is in the set of relations with direct `ghm_runtime` privileges. All 38 tables and the `project_public` view currently accessible to `ghm_runtime` have RLS disabled (and none force RLS).

This means the PostgreSQL role does **not** independently enforce account/tenant row isolation for the shared runtime's direct table reads/writes. The current Resource API enforces caller/tenant authorization in application repositories/services (for example `withAuthorizedTransaction`, `resolveTenantContext`, ownership and membership checks). That is a meaningful security boundary, but it is not equivalent to database-enforced RLS. A party obtaining the `ghm_runtime` credential or arbitrary SQL execution through the service could query rows beyond the authenticated user's tenant scope, subject to the role's table/column/function privileges.

This is a design-level security finding to resolve deliberately. Do not enable RLS in bulk: existing repositories use direct SQL, and adding policies without a complete actor-context and transaction-pooling contract would break legitimate workflows or create a false sense of isolation.

### Direct table-level write grants mapped to current callers

1. `business` — table-level INSERT and SELECT. Current-main `src/resources/business-identity/repository.ts` uses `createBusinessInTransaction` to insert only `name`, `slug`, `verification_status='unverified'`, `is_active=true`; it first verifies the authenticated account. The table-level INSERT grant is broader than this repository's insert column list and could set other business fields if the DB credential were used outside this code path. Candidate hardening: replace table-level INSERT with a narrow column INSERT grant matching the legitimate creation contract, or move creation behind a narrowly scoped SECURITY DEFINER/gateway operation after caller compatibility is proven.
2. `business_membership` — table-level INSERT and SELECT. The same repository creates the initial owner membership with authenticated `account_id`, fixed role `owner`, status `active`, and `created_by` equal to the authenticated account. The table-level INSERT grant permits writing more columns than this caller uses. Candidate hardening: column-scoped INSERT grant limited to the exact creation fields; do not revoke until all callers and any triggers are mapped.
3. `opportunity` — table-level INSERT, UPDATE and SELECT. Current-main `src/resources/opportunity/repository.ts` validates active type and owner-business membership before insert; update checks creator ownership and restricts update fields in code; lifecycle changes are checked against an explicit transition map and use a compare-on-current-status predicate. These are application-level controls, not DB-enforced row policies. The table-level UPDATE grant also exceeds the repository's ordinary update field set and includes lifecycle/ownership fields. Candidate hardening: replace broad UPDATE with explicit column grants and/or move lifecycle transitions to governed SECURITY DEFINER operations; test all current Opportunity and Project↔Opportunity workflows first.
4. `opportunity_capability_requirement` — table-level DELETE and SELECT plus column-scoped INSERT. Current-main `src/resources/opportunity-requirements/repository.ts` asserts opportunity-manager authority before deleting all existing requirements and inserting the replacement set in one authorized transaction. The direct DELETE grant is necessary for this replacement path as currently implemented, but PostgreSQL itself does not enforce the manager check. Candidate hardening: move the replacement operation behind a scoped function that asserts actor/manager authority, or introduce a verified actor context and policy before changing this grant.

The source review confirms these are not random grants: each maps to an actual application repository operation. However, the current grant breadth exceeds the exact columns/row scopes used by the repositories in several places.

### Other column-scoped write surfaces

The live catalog also has explicit column-level INSERT/UPDATE grants on business capability/evidence, category assignments, business offerings, commercial events/payment attempts/subscriptions/trials, customer/enquiry, notification read-state, opportunity requirements/participants, project/project quote/quote/line items, review moderation, and support requests/messages.

These need the same caller-by-caller mapping. The presence of a column grant alone does not establish a vulnerability; verify repository input validation, authenticated actor derivation, tenant resolution, and whether status/authority fields are intentionally excluded. The review must also inspect table-level grants because table-level privileges override the practical narrowing effect of column grants for the same operation.

### Default privileges observed

Read-only `pg_default_acl` inspection returned:
- `ghm_schema_owner`, schema `ghm`: default USAGE on future sequences granted to `ghm_runtime`.
- `postgres`, global defaults: PUBLIC EXECUTE on future functions; PUBLIC USAGE on future types; and broad default privileges for `ghm_db_user` on objects created by `postgres`.
- The global defaults owned by `postgres` are distinct from `ghm_schema_owner` defaults. The pending migration `20261112050000_revoke_public_default_function_execution.sql` alters defaults for `ghm_schema_owner`; do not assume it changes global defaults owned by `postgres`. Verify actual object owners and execution paths before changing any defaults.

### Current conclusion

The existing runtime privilege model is intentionally a mixture of direct SELECT, carefully column-scoped writes, a small number of table-level DML grants, and SECURITY DEFINER operations. The key gap is that application-level tenant checks are not backed by RLS on the runtime-accessible relations. This makes protecting the runtime credential and preventing arbitrary SQL execution especially important. It also gives us a clear hardening direction: progressively replace broad direct writes with narrow column grants or governed actor-bound functions, then consider RLS only after actor context is designed and qualified.

### Next implementation tranche (still no production changes)

1. Complete the column-level write matrix against every current repository/route, with particular focus on verification/moderation/lifecycle fields and tenant ownership.
2. Determine whether `business` and `business_membership` INSERT can be narrowed immediately in a new migration without breaking business onboarding/provisioning paths.
3. Design the actor-bound DB operation for Opportunity lifecycle and requirement replacement; do not expose generic arbitrary actor IDs.
4. Define a database-verifiable tenant actor context before proposing RLS. It must survive pooled connections safely, be transaction-scoped, and be cryptographically/structurally bound to the authenticated identity rather than a caller-settable account ID.
5. Keep production role/ACL state unchanged until a small migration is source-tested, qualified against the exact production prefix, and can be rolled out with rollback/verification.

All production SQL in this section was read-only catalogue inspection. No migrations, grants, revokes, RLS policies, role changes, credentials, secrets, Render settings, service deployments, or payment/consent actions were changed.


## 36. 2026-11-16 — production pending-prefix source review (48 migrations)

A read-only source review was completed against the current `main` tree at `7236c82aff4fe6f100e20740c0bac8b9b94fe789`.

### Inventory basis

- Repository SQL migration files: 143.
- Production ledger export previously supplied by the user: 105 rows.
- Latest applied version in that export: `20261109210000_deactivate_unrecognized_public_directory_records`.
- Repository versions later than that version: 48.
- The seven-entry `config/pending-migrations.production.json` is still only a partial exact inventory; it is not an execution batch.
- The 48 pending items comprise the 42 migrations listed in section 2 of `docs/HANDOVER_2026-11-15_PRODUCTION_MIGRATION_RECONCILIATION.md`, plus six new commercial migrations:
  - `20261116140000_generalize_commercial_payment_provider_code`
  - `20261116150000_create_commercial_consent_evidence`
  - `20261116160000_add_commercial_document_approval_authority`
  - `20261116170000_add_founder_only_commercial_document_authority_gateway`
  - `20261116180000_add_founder_only_commercial_document_approval_transition`
  - `20261116190000_add_commercial_consent_payment_prepare_gateway`

The 105-row ledger export is the evidence basis for the count/latest version. This source review did not re-read the live ledger or recalculate all 105 checksum comparisons. The full checksum/provenance verdict therefore remains open; do not describe this tranche as a completed checksum reconciliation.

### Pending-prefix dependency/risk classification

The source review of all 48 migration SQL files confirms the queue contains several independently meaningful operational groups:

1. **Business supplier/profile and capability governance (20261110010000–20261110270000).** Adds supplier classification and admin capability operations; creates/guards catalogue invariants; introduces gateway versions and cuts over supplier classification and Business profile mutation by revoking the old `ghm_runtime` SECURITY DEFINER entry points. The registration-identity gateway-write migration explicitly preserves the old runtime grant pending a separately authorized cutover. These migrations have different cutover states and must not be treated as one generic gateway deployment.
2. **Signed Actor Gateway assertion and business mutations (20261111020000–20261111170000).** Replaces unsigned gateway function signatures with signed, request-bound assertions; drops earlier unsigned overloads; adds capability/evidence, saved-business, business-hours, trust-score and logo operations/read projections. Several operations are only valid after the dedicated gateway service and secret/nonce material are provisioned and the matching API routes are deployed.
3. **Auth and QuoteFlow privilege cutovers (20261111210000–20261112040000).** Removes direct runtime access to external identity mapping tables and revokes selected auth session/password/account administration and QuoteFlow migration/reset registration functions. These directly affect auth and QuoteFlow workflows and require their deployed replacement paths to be confirmed before applying.
4. **Global/default privilege and signed Connect provisioning (20261112050000–20261112090000).** Removes PUBLIC EXECUTE from future functions created by `ghm_schema_owner`; removes an unsigned gateway assertion overload; installs signed Connect business provisioning and revokes the old business external-mapping helper. The default-privilege migration is owner-scoped to `ghm_schema_owner`; it does not cancel global defaults owned by `postgres`.
5. **Storage metadata/provider workflow (20261112140000–20261112150000).** Adds signed gateway storage metadata functions and provider workflow attestation secret/nonce tables, with explicit revocation of legacy runtime execution. This is a distinct provider callback/attestation dependency and cannot be assumed ready from the presence of the storage gateway code alone.
6. **Commercial payment provider and consent/legal authority (20261116140000–20261116190000).** Generalizes the provider code constraint; creates immutable commercial document/consent evidence and append-only approval-authority event structures; adds founder-only grant/revoke and exact-version approval gateway transitions; adds consent/payment preparation. These are not payment activation: the preparation operation does not call a provider or settle/activate a subscription. The commercial chain must remain launch-disabled and must not be combined with unrelated Actor Gateway cutovers.

### Critical source-level ordering observation

The pending migrations include function replacement/drop sequences. For example, earlier gateway operations are created with unsigned actor arguments and later migrations drop those overloads and replace them with signed request-context versions. Applying only a later migration without its exact prerequisites is unsafe; applying the entire pending queue as one transaction is also unsafe because multiple legacy runtime functions are revoked before the corresponding separate gateway/API/service deployment and secret provisioning gates have been satisfied.

The repository migration runner currently:
- checks the production pending inventory against `config/pending-migrations.production.json`;
- detects out-of-order pending migrations;
- validates existing checksums and documented historical exceptions;
- then loops over every not-yet-applied repository migration and executes all pending SQL in a single transaction.

It has no explicit approved batch identifier, exact ordered batch manifest, or through-version execution boundary. Therefore the seven-item pending file is not a safe batching mechanism, and changing it to 48 would authorize all 48 in one invocation. Do not edit it to 48 and do not run `npm run migrate`.

### Required staged-runner contract before rollout

A production staged runner should require all of the following:
1. A separate immutable pending-inventory snapshot (version + name) and an explicit named execution-batch manifest; the inventory must never itself authorize execution.
2. The batch manifest contains the exact ordered version/name pairs and a batch identifier/reason. It must be a contiguous prefix of the currently pending queue, with no skipped earlier pending migration and no unlisted extra.
3. The runner refuses production pending work when no explicit batch is selected; no implicit “all pending” default.
4. Before execution, it revalidates database identity, migrator principal, complete ledger checksums/provenance, exact pending inventory, exact batch manifest, and that the batch begins at the first unapplied repository migration.
5. Each batch is atomic, holds the advisory migration lock, writes the ledger rows in the same transaction, and fails closed on any checksum/name/order mismatch.
6. A dry-run/plan mode prints the exact SQL filenames and order without executing SQL. Tests cover no-batch refusal, wrong batch, gaps, wrong names, duplicate entries, checksum mismatch, already-applied entry, rollback, repeat-run/idempotency, and preservation of historical retained/exception handling.
7. Batch manifests are committed and reviewed with the code; a production run must explicitly identify the batch. No dynamic arbitrary through-version environment string.

The first implementation should be qualified on disposable PostgreSQL 18 using the current production-like 105-row ledger fixture and full repository migration tree. It must prove both safe-prefix success and refusal of skipped/reordered migrations. Do not use the live production DB for runner experiments.

### PR #296 relationship

PR #296 remains a separate draft hardening candidate on `hardening/business-identity-insert-column-acl`. Its migration version `20261116200000` is later than the six commercial migrations above. It is not part of the current 143-file main inventory or the 48-item pending prefix. If merged, the repository inventory becomes 144 migrations and the version-later count becomes 49; this must be reflected in the pending inventory/audit before any rollout. Do not add it to production allowlist or execute it out of sequence.

### Change record

This was source and handover review only. No production ledger query, migration execution, DDL, role/grant/ACL, RLS, credential, secret, Render configuration, deployment, payment, consent, or legal-document state was changed.


## 37. 2026-11-18 — Actor Gateway production DB connection checkpoint (read-only)

### Objective reaffirmed

The immediate task is to establish and verify the existing Node Actor Gateway's connection to the existing production Render database `ghm-db` / `ghm_db`, using the dedicated `ghm_actor_gateway` SQL login and the user's existing workstation/external PostgreSQL connection path. This is a database-connection qualification step, not authorization to create or deploy a Render Web Service. The owner will decide separately whether/when to deploy the Actor Gateway Web Service.

No additional paid infrastructure is permitted. Do not create a Render service, Worker, database, tunnel, Hyperdrive binding, schedule, or other recurring-cost dependency. Do not merge or use the unselected Cloudflare Hyperdrive branch as a substitute for the existing Node Actor Gateway.

### Required source / PR / branch reconciliation

- The unified Actor Gateway implementation is already merged to `main` through PR #272 (merge commit `4463bbb989f9d1173596f5371663b3e9e7afc0a9`). Its current source includes `src/actor-gateway/server.ts`, typed database readers, startup principal validation and exact function-privilege validation. Do not recreate this implementation or reopen the superseded component PRs.
- PR #297 is a draft, open, unmerged migration-runner predecessor. Its batch manifest is empty and its documented production ledger reconciliation is based on the dated 105-row snapshot.
- PR #298 is also draft/open/unmerged at its recorded head `f2e280005ce7f9bfc947a19ecbb6144957d4a340`; it adds explicit contiguous production batch selection and preserves an empty execution-batch manifest. It explicitly does not authorize production migrations or Render deployment. Its current head/base and CI must be rechecked before any later merge decision.
- The branch `feat/actor-gateway-hyperdrive-direct-render-20261118` is 12 commits ahead of main and remains unmerged/unselected. Its changes include a separate Worker/Hyperdrive direction and handover/architecture edits. It is not part of the selected Node Actor Gateway → PostgreSQL connection path. Do not merge, deploy, or base production work on it.
- The November 15 architecture handover records the Node Actor Gateway Web Service as the eventual production hosting design, but says its paid always-on service was not approved or created. This hosting decision is separate from local connection qualification and remains the owner's later decision.

### Current-main connection contract

Read-only source inspection of current `main` confirms:

- `src/actor-gateway/server.ts` requires `GHM_ACTOR_GATEWAY_DATABASE_URL`, loads the PostgreSQL SSL configuration, creates a PostgreSQL pool, and performs principal and privilege checks before listening.
- Startup requires both `session_user` and `current_user` to equal `ghm_actor_gateway`; LOGIN must be true, INHERIT false, and all elevated role flags false. Only the documented non-inheriting/non-settable Render administrator membership is tolerated.
- Startup then checks database CONNECT, no database CREATE, schema USAGE, no schema CREATE, no direct relation privileges, exact gateway-function allow-list, no PUBLIC or `ghm_runtime` gateway execution, and safe function defaults/owners.
- The connection string is read from `GHM_ACTOR_GATEWAY_DATABASE_URL`; source inspection cannot establish that a usable secret/credential has been provisioned. Do not read, print, paste, or put any credential-bearing URL/password in a handover.
- The gateway also requires ES256 public verification key material and `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET`. These are secret-provisioning prerequisites for a complete runtime start; their values must never be exposed in logs or handover.

### Fresh production catalogue check — 2026-11-18

A new read-only query was run against the existing Render Postgres instance. It returned:

- Database: `ghm_db`; server: PostgreSQL 18.6.
- Query connector identity: `session_user=ghm_app_user`, `current_user=ghm_db_user`. This is the Render managed administrative query identity, not the Actor Gateway identity.
- `ghm_actor_gateway` database CONNECT: true.
- `ghm_actor_gateway` schema `ghm` USAGE: false; schema CREATE: false.
- Installed `ghm.gateway_*` / `ghm.assert_actor_gateway*` functions: **0**.
- Such functions executable by `ghm_actor_gateway`: **0**.
- Direct table/view relation privileges for `ghm_actor_gateway`: **0**.

This independently reconfirms the earlier documented production blocker: the login can connect to the database, but it cannot yet use the `ghm` schema or invoke the gateway database API. The read-only query does not prove a network connection authenticated as `ghm_actor_gateway`, and no such successful connection is claimed.

### Decision / next safe action

1. Do not attempt to start the full Actor Gateway against production yet: its startup privilege assertion must fail because schema USAGE and the exact gateway function API are absent.
2. Do not use the Render default administrator URL as the application connection, do not borrow the Resource API `ghm_runtime` credential, and do not weaken startup checks or grant broad table access to make startup pass.
3. Do not apply the 48-migration inventory, run `npm run migrate`, or invent a production batch. PR #298's empty manifest is intentionally fail-closed. The exact live ledger must be refreshed and the first contiguous migration prefix must be derived from the full dependency/cutover state before any production DDL.
4. Continue with the already documented production prerequisites: verify a fresh recoverable backup, reconcile the live migration ledger and exact migration checksums, complete the reviewed role/ACL and credential provisioning plan, and determine the smallest exact gateway prerequisite prefix. Any production DDL, grant, role/credential change or secret provisioning requires a separately reviewed exact action and explicit authorization.
5. Once the database API and dedicated login credential have been safely provisioned, run the existing Node Actor Gateway locally from the user's workstation against the existing external Render PostgreSQL endpoint. Verify `session_user=current_user=ghm_actor_gateway`, the complete startup privilege contract, health and narrowly scoped authenticated endpoint behavior. Do not create or deploy a Render Web Service as part of this step.
6. Record the verified connection and test results here. Only after that does the owner decide whether to proceed with the separate Render Web Service deployment.

### Change boundary

This checkpoint changed no production database state, role, membership, grant, migration ledger, credential, secret, Render service, Render environment, deployment, application data, payment or consent state. It created no additional paid infrastructure and incurred no new cost. The production check above was read-only.

## 38. 2026-11-18 — Amanda / Render Support authority handover incorporated

### Primary support record

The authoritative record of the 2026-11-12 Render support conversation is:

docs/security/RENDER_ACTOR_GATEWAY_ROLE_SEPARATION_HANDOVER_2026-11-12.md

Read that document before changing or recommending any production PostgreSQL role, membership, login, credential, service connection, or Actor Gateway boundary. It preserves Amanda's full explanation, exact final confirmation, observed role graph, and the later implementation refinement. It supplements this operational handover; it does not authorize changes.

Amanda's final confirmation (2026-11-12 18:46:53Z) was that normal application execution should use SQL-created login(s) outside Render's Dashboard-managed credential list. Her detailed guidance was:
- Keep the Render Dashboard-managed default user for controlled database administration.
- Create service-specific login roles directly in PostgreSQL.
- SQL-created roles are not listed or managed by Render; the service that uses one must hold its credential in its own environment.
- Keep the same database host/port/database and use the SQL-created role's own username/password.
- Do not expect Render's Dashboard connection string to become the SQL-created login; Dashboard-managed connection strings continue to use Render's managed identity.

### Subsequent implementation refinement — current decision

The repository's later, explicit implementation refinement supersedes the optional credential-rotation example in Amanda's numbered explanation:

- Retain the existing Dashboard-managed ghm_app_user / effective ghm_db_user credential as the trusted administrative connection. Do not rotate/delete it merely to complete service separation.
- The Resource API uses the existing SQL-created ghm_runtime directly through its dedicated GHM_RUNTIME_DATABASE_URL; its strict source contract expects session_user=current_user=ghm_runtime.
- The Actor Gateway uses its own SQL-created ghm_actor_gateway login through GHM_ACTOR_GATEWAY_DATABASE_URL; it must not use the Dashboard default credential, ghm_runtime, or ghm_migrator.
- ghm_migrator remains a distinct SQL-created identity for controlled migration tooling; it is not an application login and must not be placed in the Resource API or Actor Gateway connection setting.
- ghm_schema_owner remains a NOLOGIN ownership boundary. Its membership/SET path is a separately constrained migration/ownership design.
- The ghm_payment_provider role is outside this work; payment activation remains paused.
- Do not copy Amanda's illustrative CREATE ROLE ghm_app_user ... IN ROLE ghm_runtime SQL. It was an example, not an approved command, and does not satisfy the current strict session_user=current_user=ghm_runtime Resource API contract.

### Critical role-membership nuance — do not misread the trust graph

Amanda's read-only production evidence showed the Render administrator ghm_db_user as a member of service roles, including ghm_actor_gateway, with ADMIN OPTION and the constrained options INHERIT=false, SET=false. This is an administrator-to-service-role management relationship, not proof that the service login can assume the administrator role, and not proof that the gateway has been successfully connected.

The support handover records that ghm_db_user had MEMBER=true, USAGE=false, SET=false for ghm_actor_gateway at the time of inspection. Do not describe this as a demonstrated SET ROLE ghm_actor_gateway path for the administrator, and do not infer that ghm_actor_gateway can assume or administer ghm_db_user.

Current Actor Gateway startup code intentionally tolerates only the trusted administrator as a member of the gateway role, and only with ADMIN=true / INHERIT=false / SET=false. The gateway login itself must have no untrusted role memberships and must authenticate with both session_user and current_user equal to ghm_actor_gateway. Never weaken this guard or grant broad table access to make startup pass.

The administrator is trusted for controlled database administration. The service principal is not an administrator. Preserve this distinction in every ACL/membership analysis.

### Historical credential-test evidence — do not repeat blindly

The support handover and its follow-up commits record:
- The Resource API's ghm_runtime credential was successfully authenticated locally against ghm_db.
- A prior local ghm_migrator connection attempt timed out before PostgreSQL authentication or SQL execution. That timeout did not establish a bad password or invalid membership.
- A production archive ledger extract contained 105 rows through 20261109210000, but was a backup snapshot, not a live query.

Later, on 2026-11-16, a temporary narrowly scoped auditor membership was used to query the live production ledger (105 rows) and was then revoked. The current handover's dated production ledger and role evidence supersede the earlier timeout as the status of ledger access. Do not retry or repeat the old migrator timeout exercise unless a concrete current dependency requires it.

### Required continuation discipline

1. Read the Amanda role-separation handover and this section before any role/credential/ACL recommendation.
2. Inspect current main, open PRs, branches and the latest migration/production handovers before deciding whether an earlier item is already complete or superseded.
3. Keep the production Actor Gateway connection objective distinct from deployment: first qualify the existing Node Actor Gateway locally against ghm_db with the dedicated ghm_actor_gateway identity; the owner decides separately whether to deploy a Render Web Service.
4. Do not use the Render admin query identity as proof of a gateway connection. A successful gateway connection must report session_user=current_user=ghm_actor_gateway and pass the exact current source privilege contract.
5. Do not change the administrator credential, create a replacement admin, rotate roles, alter membership, provision secrets, execute production DDL, or deploy as an incidental part of a read-only audit. Require a separately reviewed exact change and explicit authorization.
6. Keep the existing ghm-db as the only paid infrastructure dependency. No additional paid service, database, Worker, tunnel, schedule, or recurring-cost component.

### Provenance

This section was reconstructed by re-reading the complete committed Amanda handover (docs/security/RENDER_ACTOR_GATEWAY_ROLE_SEPARATION_HANDOVER_2026-11-12.md, blob 93ef68ea2591b6ec643e72e6e8fb680fcbcd34e5), its recorded follow-up commits (4fc23146b49060a119a378a44fe27105eb05d6f2, aff568929f64013da996b52f0f34f11aec1194bc), and the current Actor Gateway source contract. It is a documentation-only reconciliation. No production database, role, membership, grant, credential, secret, Render service, environment, deployment, application data, payment or consent state was changed.


## 39. 2026-11-18 — latest production role/migrator and local-connection reconciliation

### Newer production evidence reviewed

Read the latest 18-Nov production evidence handovers from the draft PR #298 branch, alongside the mainline Amanda support record, production migration reconciliation, Actor Gateway source, PR #298/#299/#296 and the relevant branch comparison. The new 18-Nov role/service documents are on the unmerged PR #298 branch; they are evidence to reconcile, not mainline code or an approved mutation plan.

PR/branch state at this checkpoint:
- PR #298 remains draft/open/unmerged at head `f2e280005ce7f9bfc947a19ecbb6144957d4a340`. Its branch is 136 commits ahead and 2 commits behind main after the two 18-Nov mainline handover commits. Do not merge without reconciling/rebasing and exact-head CI.
- PR #298 has 50 candidate pending migrations in its inventory and an empty production execution manifest. It explicitly does not identify or authorize a first batch.
- PR #299 remains draft/open; its Project detail/update feature is unrelated to the Actor Gateway DB connection. Its reported CI blockers are an existing disposable migration security-metadata guard and the web dependency audit. Do not mix this feature into gateway work.
- PR #296 remains draft/open and introduces a later pending Business Identity column-privilege migration. It is not in the 50-entry PR #298 inventory; if ever merged, refresh the pending inventory and ordering before any production plan.
- The unmerged Hyperdrive branch remains a separate, unselected path. Do not merge or use it for the selected Node Actor Gateway connection.

### Corrected production migrator state — connectability versus authority preflight

The older Amanda handover records a successful local, strict-TLS connection using the existing `GHM_MIGRATOR_DATABASE_URL` to production `ghm_db`, with `session_user=current_user=ghm_migrator`, `BEGIN READ ONLY`, `SET ROLE ghm_schema_owner`, exact ledger read and rollback. Do not repeat that basic migrator connectivity/ledger-read test without a concrete reason.

The newer 18-Nov live catalogue evidence does not contradict that historical successful connection. It identifies a separate current least-privilege runner-preflight failure:
- `ghm_db_user` still has a bootstrap `ADMIN OPTION` membership in `ghm_migrator`, so the current runner's required `migrator_member_count=0` check fails.
- `ghm_db_user` also has a bootstrap `ADMIN OPTION` membership in `ghm_schema_owner`; the current runner requires exactly one schema-owner membership, the intended `ghm_migrator -> ghm_schema_owner` SET-only edge.
- `ghm_migrator` retains explicit direct privileges on 16 application relations and 24 sequences, while the current runner requires no effective direct relation/sequence privileges.
- The exact production ledger is not available through the ordinary Render query connector; the already-established dedicated migrator connection plus owner-role read-only path is the documented route.
- The six bootstrap `ghm_db_user` ADMIN OPTION edges are distinct role relationships. Do not bulk-revoke them or attempt to remove bootstrap-owned edges through the application/admin session. Amanda's support guidance and the 18-Nov provider-authority plan require a provider-confirmed authority path, fresh recoverable backup, exact pre-change evidence and narrowly scoped actions.

This distinction is important: a SQL login can authenticate and read the ledger under a historical read-only workflow while still failing the current stricter migration-runner preflight. Do not report the historical connection as proof that today's migration executor is ready.

### Production runtime is not yet on the merged principal guard

The 18-Nov production legacy-runtime finding corrects any assumption that the merged PR #275 contract is live. Render `GHM-Internal-Runtime` remains on `main` at live commit `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`, auto-deploy OFF. Its live source uses generic `DATABASE_URL` and only performs `SELECT 1`; it does not enforce `GHM_RUNTIME_DATABASE_URL` or the `ghm_runtime` principal guard. The configured secret value was not inspected, so the live process identity remains unproven. Preserve the legacy path until a separately approved runtime cutover and recovery proof; do not revoke or alter it as part of gateway connection work.

The role/service dependency map records:
- `ghm_actor_gateway` exists as LOGIN/NOINHERIT with no elevated flags, DB CONNECT true, but schema `ghm` USAGE false and no gateway API functions installed.
- `ghm_auth_issuer` is not provisioned in production; its source exists but no production role/service is present.
- `ghm_migrator` is a standalone operator identity, not a continuously running service.
- The Resource API, Actor Gateway, Auth Issuer and migrator must retain separate SQL-created credentials; do not reuse the Dashboard administrator URL.

### Critical test-script safety correction

`scripts/qualify-actor-gateway-principal.mjs` is a disposable-PostgreSQL integration qualification, not a production read-only probe. It explicitly requires the database name `ghm_disposable_test`, requires runtime/gateway/migrator URLs and an assertion secret, and creates fixture accounts, businesses and commercial document records before cleanup. **Never point this script at production `ghm_db`.** Its fixture writes make it unsuitable for proving a production connection.

The production Actor Gateway process itself also performs the complete startup ACL assertion, which is currently expected to fail because production schema USAGE and the gateway function API are absent. Do not weaken the guard or try to start the full service before those prerequisites exist.

### TLS and the safe immediate connection probe

Current `src/actor-gateway/database-ssl.ts` sets `rejectUnauthorized:false` for `DATABASE_SSL_MODE=external`. This encrypts the external connection but does not authenticate the PostgreSQL server certificate. The internal Render mode is intentionally plaintext on the same-region private network. The existing migration audit has a separate, proven strict-TLS pattern: strip URL-level SSL overrides and connect with `ssl: { rejectUnauthorized: true }`. Do not use the Actor Gateway's external mode as evidence of certificate-authenticated TLS, and never fall back to `rejectUnauthorized:false` for a local production connection test.

The safe next local step, if the dedicated gateway URL is already available in the user's existing local secret environment, is a **one-off read-only Node PostgreSQL probe** from the existing workstation:
- Read `GHM_ACTOR_GATEWAY_DATABASE_URL` without printing it.
- Strip URL-level SSL options so they cannot override the explicit TLS policy.
- Connect with `rejectUnauthorized:true` and a short connection timeout.
- Start `BEGIN READ ONLY`; query only database identity, `pg_stat_ssl`, gateway role flags/membership, DB/schema privilege booleans, installed gateway-function counts and direct relation-privilege counts; then ROLLBACK.
- Require `current_database=ghm_db` and `session_user=current_user=ghm_actor_gateway` to prove the dedicated login actually authenticated.
- Treat missing schema USAGE/functions as a reported readiness blocker, not as a reason to grant access from the test script.

If the gateway URL is absent or strict certificate verification fails, stop and report that exact non-secret result. Do not invent a password, copy another service's credential, change production secrets, weaken TLS, or expose a connection URL in chat. This probe establishes only database network/authentication identity and current ACL readiness; it does not start the HTTP service or authorize any production mutation.

### Updated next-action order

1. Keep the objective on local Node Actor Gateway → existing production `ghm_db`, using only the dedicated `ghm_actor_gateway` identity; owner retains the separate Render Web Service decision.
2. Run the strict-TLS, read-only gateway-login probe only if the dedicated gateway connection secret already exists locally. Do not rerun the migrator test or disposable integration script.
3. In parallel, finish the exact source-to-ledger dependency review for the first contiguous gateway prerequisite prefix. The 50-entry inventory and empty manifest on PR #298 are not authority; the 105-row ledger snapshot is dated. The older 7-entry allowlist is also not an execution plan.
4. Do not execute migrations until the current live ledger is refreshed through the approved dedicated path, the exact checksum/order reconciliation is complete, the migrator role/ACL preflight is resolved through provider-confirmed authority, and a fresh recoverable backup exists.
5. After approved schema/API prerequisites and credential readiness, run the gateway locally and verify the full startup ACL contract. Only then does the owner decide separately whether to create/deploy the paid Render Web Service.

No production database state, migration, role, membership, ACL, credential, secret, Render service/environment, deployment, application data, payment or consent state was changed by this reconciliation. It introduced no additional paid infrastructure.


## 40. 2026-11-18 — owner correction: Actor Gateway DB URL already staged in Render Web Service form

### Corrected configuration status

The owner clarified at 2026-11-18 17:05Z that they already created/entered the `GHM_ACTOR_GATEWAY_DATABASE_URL` value in the Actor Gateway Render Web Service creation/configuration form. They used the existing `ghm-db` **internal connection URL**, changed the username to `ghm_actor_gateway`, and deliberately have not deployed the Web Service because the database connection must be qualified first.

This supersedes the earlier statement that the URL had not been provisioned at all. The accurate state is:

- **Staged in the not-yet-deployed Actor Gateway Web Service form:** owner confirms yes.
- **Live environment variable on a deployed Actor Gateway service:** no; the service has not been deployed, intentionally.
- **Present in the user's local workstation environment:** not established and must not be assumed.
- **Successfully authenticated to PostgreSQL as `ghm_actor_gateway`:** not yet proven.
- **Credential value:** not inspected by the assistant; never retrieve, print, copy into chat or record in a handover.

The internal connection hostname is the correct network target for a Render-hosted service in the same Render private network/region. It is not a workstation-routable endpoint. Therefore the staged internal URL cannot itself be used for a local workstation connection probe.

### Important credential distinction

Changing the username component of a Render internal connection URL does not by itself create or set the PostgreSQL password for `ghm_actor_gateway`. PostgreSQL authenticates the username against that role's own stored password verifier. The staged URL will authenticate only if its password component is the valid password for `ghm_actor_gateway` (or the database uses a separately verified authentication mechanism). Do not assume the Dashboard-managed `ghm_db_user` password is automatically valid for the SQL-created `ghm_actor_gateway` login.

Amanda's guidance remains controlling: the SQL-created service login must use its own credential, independently held by the service. Do not alter the Dashboard administrator password, borrow another service's credential, or weaken the role boundary.

### Correct qualification route without deploying

1. Preserve the existing staged Render form exactly as the owner configured it; do not submit, create or deploy the service during qualification.
2. To qualify from the existing workstation, use the existing Render **external** PostgreSQL hostname with the dedicated `ghm_actor_gateway` username and its own valid password, if that credential is already securely available to the owner locally. The internal hostname in the staged form is not reachable from the workstation.
3. Run only a one-off read-only strict-TLS connection probe, never the full Actor Gateway server or the disposable fixture qualification script. Confirm `current_database=ghm_db`, `session_user=current_user=ghm_actor_gateway`, SSL verification, role flags, schema usage, gateway function allowlist and absence of direct relation grants; rollback the read-only transaction.
4. If the dedicated password is not known/available, or strict certificate/hostname verification fails, stop. Do not infer the password from the Dashboard URL, rotate it, reset it, set it equal to the admin password, or change production role credentials as an incidental test. Prepare a separately reviewed, owner-authorized credential-provisioning step that preserves the existing staged service configuration until the replacement value is safely entered.
5. A successful login probe is only network/authentication qualification. Current production evidence still shows `ghm_actor_gateway` has no `ghm` schema USAGE and no gateway functions installed, so the full Actor Gateway startup contract cannot pass until the exact migration/ACL prerequisites are safely resolved.
6. After all database and service prerequisites are qualified, the owner decides when to submit/deploy the staged Render Web Service. No deployment is part of this qualification step.

### Change boundary

This is a documentation correction based on the owner's clarification. No Render form was read or changed by the assistant; no environment variable was created, read or modified; no password or secret was accessed; no production SQL, role, membership, grant, migration, deployment or service creation occurred; and no additional paid infrastructure or cost was introduced.


## 23 November 2026 — PR #305 staged Actor Gateway startup contract implementation

Before this task, rechecked open PRs, all relevant remote branches, PR #305 changed-file set, the current migration inventory, the signed Business Capability handover and the Actor Gateway hosting/credentials handover. PR #305 remains the sole active production migration batch-gate implementation on `feat/production-migration-batches-mainline-20261123`; its base is current main `93ff3c774ce225760b0e3e2cf99a770b38e8a097`. PRs #297/#298 remain older competing draft designs and were not changed. PR #303 remains the separate manual Business Capability direct-INSERT privilege cutover. PR #300's signed Business Capability application path remains a distinct feature PR and its migration pair remains pending in the PR #305 inventory. No new branch or worktree was created.

### Cycle resolution implemented in source (qualification pending)

The source-ordering cycle was resolved on the existing PR #305 branch with an explicit two-stage Actor Gateway startup contract:

- `GHM_ACTOR_GATEWAY_STARTUP_STAGE` accepts only `pre_business_capability_create` or `full`; missing/blank defaults to the conservative `pre_business_capability_create`; any other value throws before startup.
- In pre-create mode, the DB privilege assertion expects the complete reviewed Gateway allow-list except exactly `ghm.gateway_create_business_capability(bigint,bigint,uuid,text,text,jsonb)`. It continues to reject every other missing or extra function, unsafe ACL/default ACL, direct relation privilege, wrong SECURITY DEFINER owner/path, PUBLIC EXECUTE, runtime EXECUTE or grant option.
- The authenticated `POST /v1/business-capabilities` route is not registered unless the stage is explicitly `full`. In pre-create mode the route is absent (404 after the existing authentication middleware); the reader may be constructed but cannot be invoked by this endpoint.
- Render Node server and Cloudflare Worker both resolve the same strict stage value, apply the corresponding DB assertion before listening/dispatching, and pass the stage to the application route-registration option. No platform configuration, secrets or deployment was changed.
- The full stage requires the create wrapper to be present and executable; it is not enabled by default. The intended final promotion is only after both `20261120010000_add_signed_business_capability_create` and `20261120011000_allow_signed_business_capability_create_assertion` are installed together and the final DB contract is verified.

Source commits on PR #305 branch:
- `3ed81032f513e3688d7462d2a837e65ba5934d52` staged privilege assertion and strict stage resolver.
- `c290832b32fc571deec307dde211bd8e68b5b45d` conditionally registers Business Capability create route.
- `88f380814bad059bc46e3004b1a85d2d7a1c2c26` wires stage into Render Node server startup.
- `c4082143aecfa6b79f03b8fda293c5986275b627` wires stage into Worker startup and route registration.
- `3da488413ee2179dc14a61ed78aa0ed817ec9460` adds authenticated pre-create route-absence test and explicitly enables create in existing full-route tests.
- `e05f1e1762ababe9d8573bbc8853d9423cd5da03` adds stage allow-list tests; `d979b4141778f6506a1fb95e5be94c7d2f8a11d2` corrects the empty/default-stage assertion.

### Required qualification before calling the cycle resolved for release

1. Run exact-head PR #305 CI and inspect all quality/web-quality/Worker typecheck/Worker tests.
2. Add/verify a source contract test that Render and Worker both consume the same startup-stage resolver and that no alternate app construction path registers the create route in pre-create mode.
3. Confirm route absence and no mutation-reader invocation in pre-create mode; confirm the route is enabled only in full mode.
4. Confirm pre-create DB function-set test permits only the single create-wrapper omission while rejecting any other missing/extra signature, and full mode fails closed if the wrapper or its signed operation allow-list is absent.
5. Review the staged operational sequence: first all pre-revocation Gateway migrations and shared hardening; deploy only after the separate no-cost hosting, endpoint, Auth Issuer, credential, provider and backup gates are met; qualify authenticated non-create routes; only then separately authorize/apply the 17 November revocations; then apply the 20 November signed-create pair together; finally set stage to `full` and requalify. This document does not authorize a production migration, Render configuration change or deployment.

The production migration manifest remains exactly `[]`. No production SQL/migration, ledger, role, membership, ACL, credential, secret, Render service/environment, deployment/restart, payment or paid resource was changed. PR #305 remains draft/unmerged and no CI result is claimed until exact-head checks complete.


### 23 November 2026 — exact-head CI feedback and correction

The first exact-head CI attempt for the staged implementation exposed a TypeScript interface-placement error: `businessCapabilityCreateEnabled` had initially been passed as an application dependency while the tests and route switch correctly treated it as an application option. The failing Build step reported TS2353 in the two full-stage app tests; all earlier workflow setup/qualification-script syntax steps had passed, while later DB/Worker qualification steps were skipped because Build failed. Corrected by moving the flag into `ActorGatewayAppOptions`, checking `options.businessCapabilityCreateEnabled` at route registration, and passing it as the second argument to `createActorGatewayApp` from both Render Node and Worker. No runtime behavior was deployed or changed in a live environment.

Also added `src/actor-gateway/database-startup-acl-contract.test.ts` assertions proving both host adapters resolve the same strict stage, use it in the DB ACL assertion, and enable the create route only for `full`. Exact-head CI must be rerun on the corrected branch head; no pass is claimed. PR #305 remains draft, production manifest remains `[]`, and all production/Render/secret/deployment boundaries remain unchanged.


### 23 November 2026 — staged startup test failures diagnosed and corrected

The first corrected-build full-suite run completed 1,112/1,114 tests and exposed two new staged-contract test defects (not production/DB failures):

1. The pre-create signature comparison normalized PostgreSQL's comma spacing in the actual/expected arrays but compared the normalized signature to the unnormalized constant. This meant the create signature was not filtered, so the pre-create unit test correctly caught an allow-list mismatch. The comparison now normalizes the constant before equality.
2. The cross-host source-contract test still expected the old `dependencies.businessCapabilityCreateEnabled` property after the flag was moved to `ActorGatewayAppOptions`. The test now checks `options.businessCapabilityCreateEnabled`.

Corrections committed on the existing PR #305 branch as `476dc46b901cf8ed560bce5a8a215fdf34242f8d` and `87517539ee18efb1b099830dcf039f5f71ed0ba0`. The previous run's TypeScript Build, Worker bundle, disposable Gateway principal qualification, local Worker smoke and disposable migration application all passed; full test suite failed only on the two staged-contract tests above. Rerun exact-head CI on the corrected source; no green full-suite result is claimed. The production migration manifest remains `[]`; no production state, Render configuration, credentials, secret, deployment or paid resource changed.


### 23 November 2026 — full-stage disposable principal qualification corrected

The next exact-head CI run confirmed Build and Worker bundle steps passed, then exposed one existing qualification caller that was still relying on the old implicit full allow-list: `scripts/qualify-actor-gateway-principal.mjs` runs after all migrations are applied to disposable PostgreSQL and therefore must assert the `full` contract, not the default pre-create contract. Its assertion now explicitly passes `'full'`. Added a source-contract assertion so this disposable full-state principal qualification cannot silently regress to the pre-create default. The failing check was confined to disposable CI; it is not a production ACL observation and no production state changed.

Commits: `85238097ee4605c787f6399353bac5fb9439ff8b` updates the qualification stage; `50a701c696464966011476f4d319a3c49adbadb4` protects it with a source-contract test. Exact-head CI must complete on the resulting branch head. The production manifest remains `[]`; no migration, Render configuration, credential, secret, deployment or paid resource was changed.


### 23 November 2026 — Worker smoke fixture explicitly selects full ACL stage

Reviewing the next CI run after the disposable principal qualification passed identified the local Worker smoke fixture as another full-migration environment. It writes `workers/actor-gateway/.dev.vars` and starts Wrangler against the fully migrated disposable PostgreSQL database, so the fixture must set `GHM_ACTOR_GATEWAY_STARTUP_STAGE=full` rather than inherit the production-safe default pre-create stage. Added that explicit value to the ephemeral CI-only `.dev.vars` content in `.github/workflows/ci.yml`; cleanup continues removing the file on exit. No production or persistent Worker configuration was changed. Commit: `96d6dddde68a01ef734c0e3c7a655b759e89854c`. Exact-head CI must be rerun after this correction.


### 23 November 2026 — final default-stage unit test made explicit

The next exact-head run passed the pre-create startup tests, full-stage tests, cross-host source contract, disposable principal qualification, and Worker smoke test. The full suite then exposed one legacy unit test that asserted the signed create wrapper was mandatory but still relied on the old implicit full-stage default. Since the safe default is now intentionally pre-create, that assertion must explicitly select `full`; updated both its missing-wrapper rejection and present-wrapper acceptance cases to pass `'full'`. The run had 1,113/1,114 tests pass; this was the single remaining test failure and did not involve production or disposable DB startup. Commit: `0507eab4c342c161f41cfc2f5808b44942f89e06`. Exact-head CI rerun required; no full-suite pass is claimed. Production manifest remains `[]`, with no production/Render/secret/deployment change.


### 23 November 2026 — Worker host contract test updated for explicit stage argument

The next full-suite run passed the staged ACL tests, including the signed-create allow-list test, and then found one Worker source-contract test still searching for the pre-stage call form `assertActorGatewayDatabasePrivileges(privileges)`. The Worker correctly passes `startupStage`; updated `workers/actor-gateway/worker-contract.test.mjs` to assert the explicit staged call and preserve the required order (database identity, staged ACL, then HTTP listener). This was a stale source-contract expectation, not a runtime or DB failure. Commit: `1bc8c5b748fd1f2a9e1516c6fd8bef0fa29df99a`. Exact-head CI rerun required; no green full-suite result is claimed. No production state changed.
