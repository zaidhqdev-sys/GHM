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
