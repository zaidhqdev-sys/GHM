# GHM Remaining Work Register — 2026-10-13

**Status:** CURRENT GOVERNED REMAINING-WORK REGISTER — reconciled against `main` through PR #131 on 2026-10-13  
**Repository authority:** the register's original audit anchor was `1f2b10d0850095311614c5b5f9531eb8b7cce860` (`Normalize migration checksums across line endings`). That SHA is historical provenance, not a live pointer to `main`. The register was subsequently reconciled against the consolidated mainline through documentation-only PR #126 (`aef8ecdeee241d31827f6fc42730f9a61f1ddea4`), PR #127 (`6afb428d452012d9860ca50c2b0066f0768b184c`), PR #128 (`671c41be0b2446dd5c56c709c4aa3cb2e15e7d81`), PR #129 (`9af7901b0baecbdc4b307f3a0a93e1643f006ca6`), and PR #130 (`14c805cfd749ed50493523972fdd0a7c359bbfce`), all merged on 2026-10-13. These are repository reconciliation milestones only; neither proves live deployment or database state.

**Latest documentation reconciliation:** the whole-repository pass and targeted follow-ups are recorded in `GHM_CURRENT_STATE.md`. Opportunity Participation and Business Profile source-audit authorization language was clarified as historical; the qualified slices are not reopened by those records.

**PR #130 follow-up (historical):** targeted review of the 30-file documentation diff corrected stale historical headings/instructions in dated handovers, the shared-platform boundary audit, the Issue #1 baseline heading, and the Connect production-readiness historical-count table. PR #130 merged into `main` as `14c805cfd749ed50493523972fdd0a7c359bbfce`. The subsequent PR #131 reconciliation re-enumerated all 209 Markdown/text documentation files, checked stale pending-merge/current-HEAD phrasing, superseded capability claims and reconciliation-history pointers, and found no additional actionable live-status contradiction outside the two living status documents corrected by PR #131. This records the completed repository-wide status audit; it does not claim that a fresh full-repository Markdown-link scan was run after PR #130's latest edits. The earlier full-repository link scan found no broken targets, and the two PR #131 files contain no Markdown links.

**Latest verification:** PR #131 re-enumerated all 209 tracked Markdown/text documentation files and completed repository-wide stale-status and stale-SHA checks. The prior full-repository Markdown-link scan found no broken targets; PR #131's two changed files contain no Markdown links. Do not treat the prior checkpoint's targeted 30-file/14-link counts as the current complete audit result.

- Storage audit: qualified metadata/persistence and Cloudflare R2 provider path are distinct from open product authorization, recovery, production enablement, and cutover.
- Identity: migration-only external identity mapping is qualified; QuoteFlow session migration and organization-to-Business provisioning remain gated. Historical dual confirmation is limited to exceptional legacy conflicts.
- Connect/payment: readiness, object, and atomic-workflow source matrices are historical snapshots. PayFast checkout/ITN/server confirmation is merged and locally qualified; real sandbox/runtime qualification, production enablement, broader workflow parity, and additional providers remain open.
- Contract status: error-semantics/versioning route observations are tied to their historical baseline; platform-wide taxonomy/versioning remains unauthorized. Campaign and Enquiry bounded construction is qualified/closed, while broader product work and Enquiry source/workflow parity remain open.

Authentication gate reconciliation: bounded construction authorization does not imply approval of each implementation parameter. Explicit Founder approval for refresh-only `last_seen_at` behavior and the other rows marked open/approval-required remains outstanding; see `docs/architecture/GHM_AUTHENTICATION_IMPLEMENTATION_PARAMETER_GATE.md` §19–20.

These documentation changes do not close or authorize any remaining work; this register's gates remain governed by current code and capability-specific qualification evidence. The qualification-sequence contract records gate order and summarized construction evidence, not live CI/deployment state; use current workflow runs and deployment evidence for those claims. Dated September handovers now explicitly scope their branch-specific merge prohibitions to the historical workflow rather than current merge policy. The QuoteFlow migration boundary now distinguishes defined migration contracts from still-open integrated ceremony qualification, live Business/membership provisioning, local-data transition, product session integration, and cutover; the superseded identity-link proposal's fail-closed list is historical only. The Issue #1 roll-up now removes stale blanket gaps for schema/migration authority and bounded runtime/tenant-authorization slices while keeping remaining authentication decisions, production configuration, and operational acceptance open.

**Purpose:** establish the exact work that remains before GHM can become the backend for Zaid Connect and QuoteFlow. This register is the construction/cutover planning authority after the 2026-10-05 documentation reconciliation.

## 1. Authority rule

The following order controls this register:

1. current code, migrations and qualification evidence on `main`;
2. current living contracts/evidence reconciled to that mainline;
3. this register for remaining-work classification;
4. historical handovers/source audits/gate snapshots only as provenance.

A historical document cannot reopen a qualified capability. A provider capability is not inferred from a provider-neutral contract. A product migration is not inferred from a qualified GHM resource.

## 2. Closed / qualified — do not reopen

The following are excluded from construction backlog unless a new product requirement creates a separately scoped adapter/composition need:

- Bounded authentication construction foundation (qualified); unresolved Gate 3B parameter approvals and production secret provisioning remain explicit production gates
- Authorization and transaction boundaries
- Durable tenant isolation and qualified tenant adoption sequence
- Business Identity/Profile
- Business Category
- Business Capability
- Business Hours
- Business Offering
- Opportunity Core
- Opportunity Capability Requirements
- Opportunity Participant
- Project
- Project Quote
- Enquiry
- Customer
- Quote
- Review and approved aggregate
- Trust
- Saved Business
- Notification persistence
- Support Request
- Campaign root and Founder-locked Campaign HTTP
- Commercial trial operation
- Country/currency reference-data dependency
- Connect integration lifecycle, trusted request context, governed operation resolution, GHM authorization binding, resource capability dispatch, first bounded service HTTP read, service assertion/replay protection
- Connect identity bridge/identity-adapter construction foundation
- Storage metadata schema, lifecycle persistence boundary, provider abstraction/factory/config/key boundary, and storage persistence qualification
- QuoteFlow snapshot validation, existing-account reconciliation executor, credentialless account provisioning, and related migration-boundary construction slices where explicitly marked qualified.

**Rule:** a future adapter or composed product response consumes these capabilities; it does not reopen their canonical contracts.

## 3. Genuine GHM platform-foundation remaining construction

### GHM-01 — Storage live-provider/service qualification
**Classification:** GHM platform foundation — partially qualified / open.

Already qualified:
- metadata/persistence boundary;
- lifecycle state machine;
- runtime direct-DML denial;
- provider-neutral service/repository;
- S3-compatible provider implementation boundary;
- configuration/key boundary.

Still required before production storage enablement:
1. wire the provider factory through the application composition root;
2. qualify grant expiry/enforcement;
3. qualify broader provider error mapping;
4. qualify full tenant/resource authorization at service level;
5. qualify failed-upload/deletion recovery and orphan reconciliation;
6. define and exercise backup/recovery expectations;
7. expose storage through HTTP/product paths only where explicitly selected;
8. move credentials into deployment-managed production secret/configuration;
9. perform founder-authorized production enablement/cutover.

The 2026-10-05 live qualification used Cloudflare R2 bucket zaid-ghm-production with a narrowly scoped R2 bucket-item Read/Write credential. The credential is not stored in the repository. This live test is evidence of provider capability, not production cutover authorization.

### GHM-02 — Database bootstrap authority cleanup
**Classification:** infrastructure/database gate — open and externally constrained.

Remaining:
- resolve bootstrap `ghm_db_user` memberships through the independent bootstrap/provider authority;
- complete legacy role/object dependency, ownership and disposition evidence;
- only after replacement paths and recovery access are qualified, sever the old `ghm_app_user -> ghm_db_user` path and retire unnecessary legacy authority.

Do not delete roles, revoke bootstrap-granted memberships, or alter production authority from the application runtime/migrator path.

### GHM-03 — Product-facing HTTP expansion
**Classification:** GHM transport/platform — open per capability.

Campaign HTTP and the first bounded service-to-service read are qualified. Broader HTTP is not blanket-authorized.

Remaining work is only where a product capability is explicitly selected:
- define exact semantic operation;
- define request/response/error contract;
- bind AuthContext and tenant authority;
- implement route;
- qualify runtime/negative authority/persistence;
- record evidence.

Do not build a generic table API.

### GHM-04 — Public Business/directory composition/search
**Classification:** partially qualified — the narrow public Business read and Directory v1 construction slices are closed; broader composition and Connect-parity search remain gated.

Already qualified and merged to `main` via PR #10:
- `business.readPublic`: one known, active, approved/verified Business returned through the narrow public projection;
- `directory.read` v1: public eligibility, optional text query over canonical public fields, canonical category filtering, deterministic ordering/pagination, and the narrow public Business list projection.

These capabilities must not be reopened as unbuilt work. Their qualification does **not** authorize production product cutover, provider migration, shadow routing, backfill, or expansion beyond the qualified contracts.

Remaining only if a separately selected product requirement needs broader behavior:
- define the exact composed public Business response and canonical ownership of every additional field;
- define and qualify any additional filters, sorting, geo/location behavior, or Connect parity not included in Directory v1;
- prove composition of categories, reviews, Trust, hours, and capabilities consumes their existing ownership boundaries without duplicating data or weakening public-visibility/authorization rules;
- authorize and qualify each smallest additional slice before implementation.

The current contracts are `docs/architecture/GHM_CONNECT_PUBLIC_BUSINESS_DIRECTORY_CONTRACT.md` and `docs/architecture/GHM_CONNECT_PUBLIC_DIRECTORY_SEARCH_CONTRACT.md`. Their qualified narrow scope is construction evidence, not production cutover authorization.

### GHM-05 — Commercial provider operations
**Classification:** GHM commercial integration — partially qualified / open.

The internal commercial lifecycle and provider-event ledgers already exist and must remain distinct.

Qualified foundations:
- governed commercial payment preparation boundary (PR #116 merged as `7d934e3` and runtime-qualified);
- governed commercial payment-result boundary (PR #115 merged and runtime-qualified);
- canonical Connect identity → GHM account resolution;
- active-account and business-management authorization;
- payment-preparation idempotency;
- provider-event idempotent application at the GHM boundary.

Implemented and merged — not remaining construction:
- PayFast checkout/redirect HTTP boundary — implemented and merged to `main`; focused deterministic local qualification tests passed;
- PayFast ITN callback HTTP boundary — implemented and merged to `main`; focused deterministic local qualification tests passed;
- PayFast provider-specific signature/source-IP/merchant/amount/status verification — implemented and merged to `main`; focused deterministic local qualification tests passed;
- PayFast provider configuration boundary — code/config contract added with sandbox as the non-production default; production credentials and live enablement remain gated;
- PayFast ITN server-to-server confirmation against the provider validation endpoint — implemented and merged to `main` (PR #119); post-merge tests pass; real provider sandbox/runtime end-to-end qualification remains open;
- Local deterministic PayFast qualification runner — merged through this slice as `npm run qualify:payfast-runtime`; founder-local build passed and 22 focused tests passed (0 failed, 0 skipped); the full suite passed 557/557 and `git diff --check` was clean. Provider HTTP is stubbed; no provider network call, database access, or live credentials are involved;

Still remaining qualification / enablement gates:
- PayFast sandbox end-to-end qualification, including checkout, ITN server confirmation and governed payment-result application — remains a separate qualification gate;
- real runtime qualification against a non-production provider environment — not yet complete; must use explicit sandbox configuration and approved test merchant credentials only, never production/live credentials;
- only then production provider enablement/cutover.

**Approved provider direction:** PayFast is approved for the commercial payment path. The provider-specific checkout and ITN implementation is merged, with deterministic local qualification passing. This does **not** mean real PayFast sandbox end-to-end qualification, production credential configuration, or live enablement is complete.

Do not create another generic event ledger.

## 4. Product integration remaining work — not GHM resource reconstruction

### CONNECT-01 — Connect product adapter
**Classification:** product integration — open.

Required:
- operation-by-operation mapping from Connect to GHM;
- session/auth coexistence and migration plan;
- external UUID → GHM account/business mapping execution;
- public Business/directory adapter where selected;
- storage adapter where selected;
- commercial/payment adapter where selected;
- realtime ownership decision;
- edge/runtime/provider boundaries;
- atomic workflow adapter coverage;
- end-to-end qualification.

The existing Connect identity adapter/bridge qualification is a foundation, not a production session migration.

### CONNECT-02 — Connect referenced-object reconciliation
**Classification:** source/product evidence gate.

The E/F client-referenced objects must be proven in authoritative production source or retired from the product path. They must not become invented GHM tables.

### CONNECT-03 — Connect realtime ownership
**Classification:** product/provider decision.

Notification persistence is qualified. Live delivery is not. Decide whether Connect keeps provider realtime, uses polling, or receives a separately authorized GHM delivery capability. No GHM realtime platform is implied.

### CONNECT-04 — Connect server/provider runtime equivalents
**Classification:** product/provider integration.

PayFast checkout/ITN and server-to-server confirmation are implemented and merged, with deterministic local qualification passing; the remaining PayFast gate is real sandbox end-to-end/runtime qualification, followed by separately authorized production credentials and live enablement. Any additional provider behaviour (including AI proxy or non-PayFast server-runtime integrations) still requires explicit ownership and provider-boundary contracts before implementation. Every commercial path must terminate in the governed GHM commercial boundaries rather than create a parallel commercial ledger.

### CONNECT-05 — Connect atomic workflow parity
**Classification:** product workflow construction.

Only source-proven atomic workflows are candidates, including Project/Opportunity composition, payment prepare/apply, capability replacement/evidence and directory review where still required. Each requires its own contract and qualification.

## 5. QuoteFlow remaining work

### QF-01 — Authoritative production migration evidence
**Classification:** migration/provenance — open.

The two legacy `public.users` rows remain preserved pending authoritative QuoteFlow/source provenance. No email-only inference is allowed.

Required:
- approved authoritative source snapshot;
- deterministic provenance result for each retained legacy identity;
- explicit reviewed mapping and checksums;
- only then a separately authorized mutation/migration slice.

### QF-02 — QuoteFlow password reset/re-enrollment ceremony
**Classification:** GHM/Auth + product integration — open.

Credentialless account-provisioning database capability is construction-qualified. The migration-specific reset/re-enrollment request/completion path has been constructed, but the full non-production DB + HTTP ceremony qualification remains open for anti-enumeration, single-use recovery, rollback, session revocation, and post-reset-session proof. The reviewed QuoteFlow identity set contains one legitimate owner account and two bot accounts. Keep all identities distinct; exclude both bot accounts from migration and verify their server-side denial separately.

Required:
- deterministic reset state;
- safe one-time ceremony;
- no unsupported legacy password-hash migration;
- GHM session issuance after re-enrollment;
- synthetic non-production qualification first.

### QF-03 — QuoteFlow GHM session client
**Classification:** product integration — open.

QuoteFlow currently remains Supabase-authenticated. A GHM session client and runtime coexistence/cutover path must be separately qualified before product authentication moves.

### QF-04 — QuoteFlow organization → Business provisioning
**Classification:** migration capability — open.

The organization-to-Business reconciliation contract and its synthetic manifest outcomes are defined/qualified; live legacy organization → GHM Business resolution/creation plus owner-membership provisioning is explicitly **not yet qualified**. This is separate from the already-qualified credentialless GHM account-provisioning capability.

Qualification and merge gates for the migration-only provisioning implementation:
- authoritative organization/owner evidence for each approved target;
- deterministic create-vs-map outcome;
- non-production idempotency/concurrency and rollback proof;
- owner membership establishment under GHM authority;
- no silent legacy-role translation;
- confirm the migration-only function is executable only by `ghm_schema_owner`, with runtime execution and direct runtime DML denied.

### QF-05 — QuoteFlow production cutover
**Classification:** production migration — not started.

Requires all QF-01 through QF-04 gates, product workflow qualification, rollback evidence and founder authorization.

## 6. Production configuration / operations

### OPS-01 — Deployment qualification
**Open.**  
Prove deployable service configuration, health/readiness, secrets, database connectivity, migration authority and rollback without production product changes.

### OPS-02 — Provider/bootstrap configuration
**Open.**  
Resolve provider-managed bootstrap authority and production configuration/secrets through the appropriate infrastructure path.

### OPS-03 — Recovery/rollback
**Open.**  
Define and exercise recovery for database migration, storage provider failure, provider callback failure, and product cutover rollback. Do not treat backup/rollback as implied by successful tests.

### OPS-04 — Observability
**Open for production replacement.**  
Construction health/readiness is qualified. Production replacement still requires safe logs, correlation/diagnostic strategy, failure visibility and operational evidence. A vendor APM platform is not automatically required.

### OPS-05 — Shadow qualification
**Open / not started.**  
Exercise representative Connect and QuoteFlow workflows against non-production GHM while production remains on Supabase. Establish reconciliation, failure handling, monitoring and rollback evidence.

### OPS-06 — Controlled cutover
**Open / not authorized.**  
Product-by-product, reversible, observable cutover only after all capability and operational gates pass.

## 7. Explicitly NOT current GHM backlog

These are not construction tasks merely because they appear in older architecture/audit documents:

- generic platform audit/event ledger;
- generic job/queue platform;
- generic realtime platform;
- KBM media storage/generation infrastructure;
- arbitrary client-referenced Connect tables without authoritative source evidence;
- Supabase internals copied into GHM;
- unrestricted generic CRUD/table HTTP;
- provider-specific capability inferred from provider-neutral contracts;
- removal of qualified resource boundaries;
- replacement of Supabase production before migration evidence exists.

Commercial provider events and commercial lifecycle events remain their existing distinct ledgers.

## 8. Founder gates

The following require explicit Founder authorization before construction or production mutation:

1. each new Connect product adapter/capability;
2. directory/public projection construction beyond existing qualified resources;
3. commercial provider integration and production credentials;
4. concrete storage provider enablement;
5. QuoteFlow production migration/mutation;
6. legacy PostgreSQL role/object mutation;
7. shadow qualification against representative product workflows;
8. any production routing, DNS, environment, credential or traffic cutover;
9. closure of the authentication decisions still marked open in `docs/architecture/GHM_AUTHENTICATION_IMPLEMENTATION_PARAMETER_GATE.md` §19 (token-pepper approval, explicit Founder approval for refresh-only `last_seen_at`, previous-key retirement timing, and independent `iat` presence/future-time validation qualification), plus production secret provisioning, before production auth enablement.

## 9. Stop condition for construction

Before starting a new GHM-core construction slice, this register must show:

- authoritative source evidence;
- one canonical owner;
- explicit contract;
- explicit authorization;
- implementation;
- runtime/persistence/ACL qualification;
- documentation reconciliation.

If the need is already covered by a qualified capability, stop and build the adapter/composition at the product boundary instead.

## 10. Bottom line

If construction stopped at this register today, the exact blockers preventing GHM from becoming the backend for Connect + QuoteFlow are:

**GHM platform foundation:** product-facing storage workflows and authorization/recovery/orphan handling where not individually qualified; recovery/backup and legacy-authority reconciliation; production provider enablement; real PayFast sandbox end-to-end/runtime qualification; selected public/directory HTTP composition; and bootstrap authority resolution after independent authority/recovery evidence. Foundational Business Identity tenant-isolation/runtime authorization is qualified for its evidenced slices; additional resource/product authorization remains per-capability gated.

**Connect:** product adapter and operation-by-operation mapping, remaining authoritative source reconciliation, selected directory/storage/commercial/runtime/realtime workflows, atomic workflow parity, and end-to-end qualification. Bounded identity/service/resource slices already qualified are foundations, not production migration.

**QuoteFlow:** authoritative legacy provenance for the one legitimate owner account; keep both bot accounts excluded and separately verify server-side denial. Complete reset/re-enrollment DB+HTTP ceremony qualification, GHM session client, separate legacy-organization-to-GHM-Business provisioning qualification, then product workflow/cutover qualification.

**Production:** deployment/secrets (including closure of the specific authentication decisions still open in §19 of `docs/architecture/GHM_AUTHENTICATION_IMPLEMENTATION_PARAMETER_GATE.md` and secret provisioning), recovery/rollback, observability, shadow qualification, and founder-authorized reversible cutover.

This is a summary of the major remaining gates, not a blanket claim that every unlisted capability is qualified. Use each capability contract and qualification record for exact scope; preserve separately documented product, provider, security, and production gates.

## Connect no-Supabase migration reconciliation — 2026-10-13

This register's existing `CONNECT-01` through `CONNECT-05` rows remain valid high-level work categories, but they are not a complete operation-level inventory. Use `docs/architecture/CONNECT_GHM_MIGRATION_HANDOVER_2026-10-13.md` plus the dated matrix overlay in `CONNECT_BACKEND_OPERATION_INVENTORY.md` and `GHM_CONNECT_PRODUCTION_READINESS_GAP_REGISTER.md` for the active Connect caller-by-caller gaps.

Newly confirmed blocking scope includes: Supabase-native Connect startup/session/signup still active; GHM Connect authorization binding still requires external provider `supabase`; current signed Connect service API is server-to-server only; directory filters/profile output and engagement events require broader parity; business-hours write and storage have service logic but lack registered HTTP exposure; capability evidence and founder directory-review operations are missing matching routes; opportunity discovery/type list is missing; onboarding, analytics, relationships/outcomes require APIs; project/quote and support/review flows require exact contract and ownership qualification. These are product integration tasks, not permission to reconstruct every Connect-referenced legacy table.

Preserve no-Supabase target, explicit ID/identity mapping, GHM-native user-token API or secure BFF decision, and existing authorization/transaction/tenant boundaries. Keep `launchAuthorized=false`, `milestone38Approved=false`, `milestone52Approved=true`, and `onlineSubscriptionActivation=false`. PayFast and Paystack status remain separate. No construction, provider activation, production migration, or cutover is authorized by this reconciliation.

## Draft Connect migration reconciliation overlay — 2026-10-13

The Connect-specific caller-to-contract findings are currently on draft PR #133 and are **not yet on main**; do not describe them as merged or qualified. Until that documentation PR is reviewed and merged, the durable resume point on the draft branch is `docs/architecture/CONNECT_GHM_MIGRATION_HANDOVER_2026-10-13.md`, read with `GHM_CONNECT_PRODUCTION_READINESS_GAP_REGISTER.md` and `CONNECT_BACKEND_OPERATION_INVENTORY.md`.

The current draft findings resolve an earlier handover contradiction: Relationships/Outcomes is a registered authenticated Connect route requiring `BUSINESS_READ` and active-business context, so its missing GHM domain is an active **Build** gap, not conditional on reachability. Existing identity-adapter, storage/R2, Business Hours, Project Quote and commercial-trial qualifications remain bounded evidence; none proves complete Connect parity or no-Supabase cutover readiness. This is documentation-only and does not authorize construction, production mutation, provider activation or cutover.


## QuoteFlow migration Business provisioning — 2026-10-20

A migration-only Business provisioning SQL primitive and database-backed qualification script are present on the combined review candidate. Fresh CI validation and database-backed qualification against an approved isolated non-production database remain pending. The operation creates an inactive/unverified Business, one active owner membership, and an exact external mapping atomically. Existing source mapping, owner eligibility, and slug conflicts fail closed. This does not close user/session migration, reset/re-enrollment ceremony, legacy membership reconciliation, production recovery, or cutover gates.

## Storage/provider checkpoint update — 2026-10-26

The historical checklist item `concrete storage provider enablement` must be read with the newer bounded provider evidence: the live Cloudflare R2 S3-compatible data path is now **QUALIFIED / PASS** for signed upload, provider metadata observation, signed download, payload integrity, deletion, and absence confirmation. See `docs/evidence/STORAGE_LIVE_PROVIDER_QUALIFICATION_2026-10-26.md`. This closes only provider data-path connectivity for the tested bucket; it does not mean application production enablement or cutover is approved.

The only bucket created so far is named `zaid-ghm-production`; do not assume it is a dedicated non-production target or run further mutating qualification there by default. Still open: guarded database persistence qualification with the intended restricted role, authenticated application/API integration, composition-root and deployment configuration, complete tenant/resource authorization, failure recovery/orphan reconciliation, backup/recovery, and production enablement/cutover.

The qualification-database migration run completed with exit code 0 on 2026-10-26. The historical checksum issue was resolved by restoring applied migration bytes in commit [`5229b37700f2e21ac4caf2d4c5547bb929ab2de8`](https://github.com/zaidhqdev-sys/GHM/commit/5229b37700f2e21ac4caf2d4c5547bb929ab2de8); production migration status is unchanged and must not be inferred from that sandbox run.


## Render identity-qualification sandbox deployment — 2026-10-28 22:02 UTC

- Operator confirmed that Render's test environment is a sandbox and instructed proceeding there.
- Service: `ghm-identity-qualification` (`srv-dbahvenbtjjs73f83rlg`), URL `https://ghm-identity-qualification.onrender.com`; production `GHM-Internal-Runtime` was not touched.
- Manually triggered Render deploy `dep-dbh70r6i0phs73b1esr0` of integration branch commit `5fc845dd1e756ad2924af3284176aa3330f44cb4`. Render reports **live/succeeded** at 2026-10-28 22:01:13 UTC. Build completed successfully; application logs report `GHM Core Engine listening on port 10000` and Render reports the service live.
- Queried logs after startup: no error/critical/warning entries returned in the checked interval. This is not equivalent to a complete runtime or security test.
- Build logs report `npm audit` found 3 dependency vulnerabilities (1 moderate, 1 high, 1 critical). Identify the affected packages and assess compatible fixes before production use; do not run a blanket `npm audit fix` against this branch without reviewing lockfile and breaking-change risk.
- The branch includes the bounded `TRUST_PROXY` parser/config tests and storage runtime routes. The latest browser-auth PR's additional logout-specific rate limiter is **not** present on this integration branch; browser-auth hardening remains a follow-up.
- Browser-auth origin gate is fail-closed: GHM web auth returns `503 web_auth_not_configured` if `GHM_WEB_AUTH_ALLOWED_ORIGINS` is empty, and rejects unlisted Origin values. The previous operator-provided environment-variable inventory did not list this variable. Current live values cannot be read back through the available Render inspection tool, so this configuration is **unverified**. Do not set it to the production Connect origin to make tests pass; first identify the dedicated Connect sandbox/preview origin and allow only that exact origin.
- The Render request-log and metrics queries returned no data in the short post-deploy interval. The external health URL could not be independently fetched from the inspection environment because its DNS resolution was unavailable there. Thus the process is live per Render, but an external HTTP health response and browser login/session/refresh/logout/identity journey are not yet confirmed.
- No environment variables were changed, no database migration was run by this deploy, and no production service/configuration was changed.

### Next sandbox qualification gates

1. Resolve the exact dedicated Connect sandbox/preview origin and confirm the same-origin proxy's sandbox configuration; then set the exact allowed origin on this qualification service only if absent.
2. Add the browser-logout rate limiter to the integrated branch through a reviewed change and re-deploy sandbox.
3. Test `/healthz`, register/login, session restore, refresh rotation, logout/revocation failure, identity and membership resolution, and tenant-isolation/storage routes using sandbox test accounts and disposable test objects.
4. Triage the 3 npm audit findings; require evidence-based remediation before any production release.
5. Keep production runtime, production database, payment activation, and cutover unchanged until sandbox gates pass.


### Follow-up sandbox deployment result — 2026-10-28 22:04 UTC

- Render deploy `dep-dbh723m7bikc73fellpg` completed successfully and is live on `ghm-identity-qualification`, running integration branch commit `d110bca50f229256a86308712ef4b581fa8ba8c5`.
- Startup log confirms `GHM Core Engine listening on port 10000`; Render emitted its service-live message. The follow-up commit adds `browserLogoutRateLimit` (60 requests per 15 minutes per limiter key) to `POST /api/v1/auth/web/logout` and a regression test intended to verify the 61st request receives HTTP 429.
- GitHub reported no workflow runs or commit status checks for this exact head at the time of this check. Deployment/build success is not evidence that the new regression test passed.
- The external health endpoint could not be reached using available web inspection, and no sandbox browser client was configured/available to drive a real session journey. Therefore no claims are made that health, login, refresh rotation, logout/revocation, identity/membership, or tenant isolation has passed end-to-end.
- The Render service remains public (`0.0.0.0/0`) and has no configured Render health-check path. Keep this service limited to disposable qualification data and never use production credentials/data. The exact allowed browser origin remains unverified; web-auth endpoints are designed to fail closed if `GHM_WEB_AUTH_ALLOWED_ORIGINS` is absent.
- Vercel preview deployment/environment inspection for the Connect project was denied/not found via the available integration. No attempt was made to weaken access controls or guess an origin.
- Build output continues to report 3 npm audit vulnerabilities (moderate/high/critical); package-level triage is still required.

Next actions: obtain a known dedicated Connect preview deployment/origin via authorized Vercel access or an existing deployment URL; confirm/set only that exact origin on the qualification service; run regression tests in CI; execute non-production HTTP tests for auth/session, identity, rate limits and tenant isolation; triage dependency advisories. No production service, environment variables, database, or payment configuration was changed.


### Sandbox verification attempt — 2026-10-29 00:08 UTC

- Reconfirmed Render deploy `dep-dbh723m7bikc73fellpg` is `live`, commit `d110bca50f229256a86308712ef4b581fa8ba8c5`; build succeeded and startup logged `GHM Core Engine listening on port 10000`.
- Source confirms the service exposes `GET /healthz`. However, the web inspection tool and execution container both fail DNS resolution for `ghm-identity-qualification.onrender.com`; no HTTP status/body was observed. This is an inspection-network limitation, not evidence that the service itself is down.
- Reviewed `src/http/auth-router.test.ts`: it includes browser login/refresh/logout cookie assertions, rejection of missing/unapproved Origin, and the new 61st-logout-request rate-limit assertion. Those test cases are present in the branch, but no successful CI run for the current head was returned; Render's build command is `npm ci --include=dev && npm run build`, not `npm test`. Thus tests are not yet proven to have executed.
- Vercel access context currently lists only `zaid-technologies-website` under the ZAID Technologies team; lookup of `zaid-connect` project/deployment/environment returns not found. The Connect sandbox preview origin therefore cannot be safely discovered or allowlisted using this connection. Do not substitute the known production origin or guess a preview hostname.
- No changes to Render env, Connect project configuration, production runtime, database, or payments were made.

Immediate blocker: obtain a working authorized Vercel connection/project context for `zaid-connect` (or a verified dedicated sandbox preview URL) and a network path that can reach the Render sandbox. Then run `npm test`/the auth-router tests in CI and execute HTTP/browser integration checks. Until those evidence gates pass, mark sandbox deployment as build/live only, not auth-qualified.


### Connect preview origin identified; Vercel access still blocks verification — 2026-10-29 00:12 UTC

- Operator supplied the Vercel deployment overview. Independent read-only project/deployment listing now works when the team scope is omitted: project `zaid-connect`, project ID `prj_tnaxl6AL2x3av4H9NEJj3T0A64Px`, production deployment `zaid-connect-2thdsocys-zaid-technologies.vercel.app` on `main` commit `e87ec1595f8ba412d37bccaa32120aa38d3d78d0`.
- A READY preview exists for branch `construction/ghm-identity-adapter-only-20261016`, commit `49226f5ab03f95a04afe3acd394f28baa4394cc3`, at `https://zaid-connect-420zcpxr7-zaid-technologies.vercel.app`. This is a deployment-specific URL; do not treat it as a stable branch alias.
- Vercel environment listing shows production-scoped variables named `VITE_SUPABASE_ANON_KEY` and `VITE_SUPABASE_URL`; values were not decrypted. A branch-filtered environment listing for `construction/ghm-identity-adapter-only-20261016` returned no variables. This is consistent with the migration preview not yet being configured to call the GHM qualification service.
- Attempts to read the production or preview deployment through Vercel's protected-deployment fetch failed with HTTP 403 at the deployment access/bypass stage. Domain enumeration via the connected tool also returns HTTP 400. The web inspection path cannot access the preview or Render health URL either. Thus source/deployment metadata is visible, but HTTP responses and runtime behavior are not.
- Do not add `CONNECT_WEB_ORIGIN` using the per-deployment URL as a permanent branch value: each new preview deployment has a different host. Obtain a stable, verified branch alias (or use a deliberate preview origin strategy) and working Vercel deployment access first. Then configure `GHM_INTERNAL_RUNTIME_URL` and the exact matching `CONNECT_WEB_ORIGIN` only for the migration preview, and set GHM's `GHM_WEB_AUTH_ALLOWED_ORIGINS` to that same verified origin on the Render qualification service. Do not change production-scoped values.
- No environment variables or deployments were modified in this check.
