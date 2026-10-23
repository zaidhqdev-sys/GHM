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


## Auth/reset persistence consistency and HTTP ceremony — 2026-10-22/23

**Code-level gap addressed on draft PR #183; governed environment qualification remains open.** The auth router now receives the app's shared `AuthPersistence` and uses it when lazily constructing the default GHM auth service. This ensures the reset-completion persistence and subsequent login/session issuance share the same persistence instance when the caller supplies one. The business-identity qualification server also explicitly binds persistence and bearer account-state reads to the guarded runtime pool.

A new regression test checks the persistence handoff. A disposable-PostgreSQL HTTP ceremony is wired into `npm run qualify:business-identity-runtime` and checks anti-enumeration, recovery delivery, reset completion, fresh bearer authentication, prior-session revocation, and recovery-token replay rejection. Existing DB qualification covers expiry/rollback. CI run [#39868903311](https://github.com/zaidhqdev-sys/GHM/actions/runs/39868903311) passed for PR head `dd5d79dad5b51845c99bdd6c25078cb358eb293c` before the current documentation-only changes; rerun status must be checked for the latest commit.

Remaining gates are unchanged: (1) independent migration/SECURITY DEFINER review; (2) approved isolated non-production Render database qualification; (3) GHM-native identity/session and selected-business HTTP flows in non-production; (4) QuoteFlow reset/re-enrollment ceremony on the governed target, including expiry/replay/rollback/revocation/fresh session; (5) cross-client parser/runtime and data/storage-scope migration; (6) Zaid Connect browser E2E and workflows. Do not change the Render DB allowlist, use the shared PayFast sandbox as substitute evidence, or perform production changes without explicit authorization.


## SECURITY DEFINER bounded review note — 2026-10-23

For migration `20261016100000_add_connect_identity_authority_contract.sql`, the function `ghm.auth_read_connect_identity_authority(bigint)` is SECURITY DEFINER, owner `ghm_schema_owner`, PUBLIC execute revoked, runtime execute granted. It returns Connect role, operator intent, system-admin and founder-reviewer flags for the supplied account ID. It was not referenced in the two inspected Connect adapter files; all callers still need exhaustive tracing. Independent review must decide whether arbitrary account-ID calls can expose authority flags across accounts and whether any caller binds that ID to verified identity context. Do not call this a confirmed vulnerability; do not change/remove the function until its intended callers and trust contract are established. CI run #39869676505 passed on the previous docs head; re-check latest PR head after these docs commits.


## Auth/SQL boundary follow-up — 2026-10-23

CI run #39869935033 passed on code head `be0ced510352095079f511350399e6440d33ad3f`; docs-only changes followed and current-head CI must be checked. Bounded inspection of reset completion, storage-persistence, and core auth SQL found explicit search paths, owner/grant hardening, and transaction-based reset/session revocation in the inspected functions. Independent review remains mandatory, particularly for every SECURITY DEFINER caller and its binding of account/session/object IDs to verified auth context. No confirmed vulnerability or complete audit is claimed.


## Auth SECURITY DEFINER caller tracing — 2026-10-23

CI run #39870134670 passed on PR #183 head `ec132b000c9296874b605cda1512d4f5c887343e`. Continue exhaustive callsite tracing for persistence methods `changePassword` and `disableAccount` and SQL functions `auth_change_password` / `auth_disable_account`, which accept account/session IDs and are executable by `ghm_runtime`. The router review did not find corresponding routes in the inspected excerpt, but do not infer absence across the entire application without full search. Ensure any callers bind IDs to authenticated context. Independent security review remains required.


## Auth change/disable function trust boundary — 2026-10-23

CI run #1483 passed on PR head `37bcd4924be473aab388745bcf0a3806bf7e8ebe`. The SECURITY DEFINER functions `auth_change_password` and `auth_disable_account` accept account/session IDs and are executable by `ghm_runtime`; application callers must bind those identifiers to trusted auth context. Router inspection found no matching public endpoints, but code-search endpoint results were empty and do not prove there are no callsites. Exhaustive local/repo-wide search and independent review remain open. Do not change grants until callers and intended use are established.


## Latest CI and caller-search status — 2026-10-23

CI #1486 passed on PR #183 head `11e2859b8428d51d1f67a769cdf91a409f72db38`. Caller tracing for `changePassword`, `disableAccount`, `auth_change_password`, `auth_disable_account`, and `auth_read_connect_identity_authority` remains open because available GitHub search did not return indexed matches and the file-by-file scan could not complete. Do not interpret missing search results as absence of callers. Obtain a complete repository-wide search before concluding trust-boundary review or changing grants.


## Latest CI and caller tracing — 2026-10-23

CI #1489 passed on PR #183 head `97f947045859a928577fefbc5206271201f66ae1`. Shared auth-persistence wiring and database-backed reset HTTP qualification are included in PR #183 per its current summary. Dedicated governed Render DB qualification and independent security review remain open.

Repository-wide caller tracing is still incomplete: the available scan covered only a subset of 174 non-test TypeScript files. Do not infer that functions have no callers and do not alter grants until a complete source search and identity-binding review are available.

## CI #1494 and auth caller review — 2026-10-23

CI #1494 passed on PR head `daf9f184093726b19cbdf288bdf7cee70f845f2a`. Targeted review found persistence wrappers invoking `auth_change_password` and `auth_disable_account` with numeric account/session identifiers, while the inspected auth router exposes no matching public routes. This is not an exhaustive caller trace. GitHub code search was incomplete for `auth_read_connect_identity_authority`; do not treat zero indexed results as evidence of no caller. Complete full source search and independent review before changing grants. Dedicated governed Render database qualification remains open.

## Auth SECURITY DEFINER caller trace — 2026-10-23

CI #1497 passed on PR head `57028b92c435f643ea63c0c8e6ea3ba4676ec606`. The persistence interface exposes password-change and account-disable methods which call SECURITY DEFINER SQL functions; the inspected auth router has no corresponding route. The identity-authority function is granted to runtime but lacks a wrapper in the inspected persistence file. Whether other modules invoke these methods/functions is not yet exhaustively established. Caller trace and independent review remain open; no permissions changed.

## CI #1500 and security caller trace — 2026-10-23

CI #1500 passed on prior PR head `bc0ba1b1d0f53ecbdbd4d0127b791d4237b31533`. Targeted source review found persistence wrappers invoking password-change and account-disable SECURITY DEFINER functions, no matching route in the inspected auth router, and a runtime-granted identity-authority function with no wrapper in the inspected persistence class. GitHub search returned no indexed matches, which does not establish caller absence. Full source-wide trace and independent review remain release gates. No SQL grants or infrastructure changed. Dedicated governed Render DB qualification remains blocked.

## CI #1503 and remaining security gates — 2026-10-23

CI #1503 passed on PR head `903d35446dbffbb2e2975cc60b46fb1c211816f2`, covering build, disposable migrations, QuoteFlow reset HTTP qualification, DB-backed tests, migration-audit policy, and runtime-boundary verification. The PR's shared auth-persistence wiring is now exercised by tests.

Still open: complete source-wide caller trace for `auth_change_password`, `auth_disable_account`, and `auth_read_connect_identity_authority`; independent security review of SECURITY DEFINER grants/identity binding; governed isolated Render database qualification. No grant, production, or Render configuration changes were made. Recheck CI after these handover edits produce a new commit.


## Current-head CI #1506 — 2026-10-23

CI #1506 passed on PR head `712d989a46693ea296df23a077bc6862317215b0`. Dedicated governed Render DB qualification and independent security review remain open. The full caller trace across 174 non-test TypeScript files is not complete; do not infer absence of callers from targeted results. No database grants or infrastructure changed.

## SECURITY DEFINER trust boundary — 2026-10-23

CI #1509 passed on PR head `7d97d2a511993707678e342007ab59f405ada0ef`. Review of the migration SQL confirms three runtime-executable SECURITY DEFINER functions accept account identifiers from callers; their SQL bodies do not bind those IDs to a verified actor session. The auth router inspected has no public password-change/disable route; the identity-authority function has no wrapper in the inspected persistence file. This is a concrete independent-review item, not a confirmed exploit. Complete the source-wide callsite trace and decide whether runtime grants are required before any privilege change. Governed isolated Render DB qualification remains open.

## CI #1512 — expanded targeted source review

CI #1512 passed on PR head `db6f1d9d224b0427957d8081f04be3cd9163fbed`. Expanded targeted reads of auth context/service, Connect authorization binding, relevant routers, and QuoteFlow reset completion found no direct TypeScript call to password-change/account-disable persistence wrappers or wrapper for the identity-authority SQL function in the files inspected. This is not exhaustive across the 174 non-test TypeScript files and migrations. Full caller trace, independent SECURITY DEFINER review, and dedicated governed Render DB qualification remain open. No grants or infrastructure changed.

## Checkpoint #1515 — 2026-10-23

CI #1515 passed on PR head `5eff3eaff0d72695a644e0ac4814b7824e2df1c3`: build, disposable PostgreSQL migrations, business identity + QuoteFlow reset HTTP qualification, DB-backed tests, migration audit policy, and runtime boundary verification all succeeded.

Current auth router passes `dependencies.authPersistence` into lazy `createGhmAuthService`, confirming shared persistence wiring. Password-change/account-disable wrappers invoke SECURITY DEFINER functions granted to runtime; no matching public route was found in the inspected auth router. The identity-authority SQL function is runtime-granted with no wrapper found in the inspected persistence class. This is not an exhaustive callsite proof. Remaining gates: full caller trace, independent SECURITY DEFINER trust-boundary review, dedicated governed Render DB qualification. No grant or infrastructure changes.

## CI #1518 checkpoint — 2026-10-23

CI #1518 passed on PR head `bfe740630d514bedb331dff7672cbe1a3b4e57ef`. All quality checks including disposable PostgreSQL, reset HTTP qualification, DB-backed tests, migration audit policy, and runtime boundary verification succeeded.

Remaining release gates: complete caller trace for the three runtime-executable SECURITY DEFINER functions, independent review of grants/identity binding, and governed isolated Render DB qualification. No grants or infrastructure changed. Recheck CI after this handover update creates a new head.

## CI #1521 verified — 2026-10-24

CI #1521 passed on head `288c5971db99534c0f41e48ba3fa2deebe0de919`, including disposable PostgreSQL migrations, business identity/QuoteFlow reset qualification, DB-backed tests, migration audit policy, and runtime-boundary verification.

Full source-wide caller trace remains open: local clone was unavailable because github.com DNS resolution failed, and GitHub code search did not return indexed results. Targeted source findings are not exhaustive. Independent SECURITY DEFINER/grant review and dedicated governed Render DB qualification remain release gates. No grants or infrastructure changed; verify CI after this handover update creates a new head.

## 2026-10-23 — caller-trace continuation

On PR #183 head `a74873ef11be01b35a3bca7ccbac02c73e2af823`, the repository tree was enumerated and exact-name code searches were retried for `auth_change_password`, `auth_disable_account`, and `auth_read_connect_identity_authority`; search returned no results, while a broad blob scan exceeded tool-call limits. This does **not** complete the repository-wide trace. Targeted reads reconfirm the two password-change/disable persistence wrappers, no corresponding public route in the inspected auth router, and the runtime grant on the identity-authority SECURITY DEFINER function, which takes a caller-supplied account ID. Treat this as a concrete authorization review item, not a confirmed vulnerability.

Next: complete source + SQL caller mapping using a reliable full-repository checkout or bulk-content access; document caller identity binding and necessity of each runtime grant; obtain independent security review; then resume governed non-production DB qualification when access is authorized. No grants, production, Render settings, secrets, provider activation, or cutover changed. PR #183 remains draft. CI #1524 passed on the previous head; verify a new run after these docs commits.


## SQL body trust-boundary follow-up — 2026-10-23

Targeted SQL-body review adds detail but does not close the caller trace: `auth_change_password` changes credentials for its supplied account ID and preserves its supplied session ID without itself binding those IDs to the authenticated actor; `auth_disable_account` disables the supplied account and revokes sessions without an in-function actor/admin check; and `auth_read_connect_identity_authority` reads authority fields for the supplied account ID. These may be intended trusted-runtime primitives, but caller-side identity/privilege enforcement must be demonstrated. `src/auth/ghm-auth-service.ts` has no visible use of password-change/disable wrappers in the inspected source; `src/auth/foundation/persistence.test.ts` does exercise disableAccount as an integration-test caller. No privilege changes are justified by this bounded evidence. Full source/migration trace and independent review remain open.


## 2026-10-23 — source/migration caller trace completed for tracked code-like files

At base `843718e34b4ac9ade906c1158327286c859c9a56`, scanned 305 `.ts/.tsx` files (tests included), 77 `.js/.mjs/.cjs/.mts/.cts` files, and all 88 SQL migrations. `auth_change_password` and `auth_disable_account` are defined/granted in the auth runtime migration and called by wrappers in `src/auth/foundation/persistence.ts`, but no production application invocation was found in the scanned code. `disableAccount` has an integration-test call; other method hits are mocks.

Corrected identity-authority caller map: `ghm.auth_read_connect_identity_authority(id)` is called twice in `src/resources/business-identity/repository.ts` (account SELECT projection and profile UPDATE RETURNING). Both paths derive the ID from verified `context.userId` and execute under `withAuthorizedTransaction`; the profile HTTP routes require GHM bearer authentication and registered profile access. The function itself still trusts its ID parameter, so the trusted runtime grant remains part of the boundary. This supersedes the earlier auth-persistence-only note saying no identity-authority caller/wrapper was found.

Independent security review remains required to decide whether the two apparently unused mutation grants should be removed and to assess direct-runtime invocation risk for the authority read. No grants or infrastructure changed. Documentation commits need fresh CI. Dedicated governed non-production Render DB qualification remains blocked by existing access restrictions.


## 2026-10-23 — CI recheck and independent review request

CI #1531 (run ID `39877622657`) passed on commit `518c4541b8af589ad101777a12d6b189ce764293`; all quality steps, including disposable-PostgreSQL migration qualification and database-backed tests, succeeded. [CI run](https://github.com/zaidhqdev-sys/GHM/actions/runs/39877622657). Because this note is a later docs commit, verify CI again on the resulting PR head.

No independent security review is recorded. Request an authorized maintainer to assign an independent reviewer for the three SECURITY DEFINER functions and runtime grants. Do not change grants pending that review. Existing governed non-production Render DB qualification remains blocked by access restrictions.


## 2026-10-23 — CI #1534 passed; review remains open

CI #1534 (run ID `39877952670`) passed on commit `9f5a10b3b34374046953147e6209c7c3ee47ad8f`. All quality steps succeeded, including disposable PostgreSQL, migration qualification, DB-backed tests, audit-policy tests, and runtime-boundary verification. [CI #1534](https://github.com/zaidhqdev-sys/GHM/actions/runs/39877952670). This documentation append requires a fresh CI check on the new head.

Rechecked PR #183: no submitted review or independent reviewer response is recorded yet. Security review request remains open; no grant changes pending review. Governed non-production Render DB qualification remains blocked by access restrictions.


## 2026-10-23 — CI #1537 passed

CI #1537 (run ID `39878195086`) passed on documentation head `3686ba65d70dceaaeaa6a08216e0934f721223d2`. [CI run](https://github.com/zaidhqdev-sys/GHM/actions/runs/39878195086). This register update needs fresh CI verification on the resulting head.

Independent security review is still not submitted. Do not change grants before review; governed non-production Render DB qualification remains blocked by access restrictions. PR #183 remains draft.


## 2026-10-23 — CI #1540 passed

CI #1540 (run ID `39878374504`) passed on commit `4f3219fb56b2b502d93ed4e59a036f45bec28015`; all quality steps succeeded, including disposable-PostgreSQL migrations/qualification, DB-backed tests, audit-policy tests, and runtime-boundary verification. [CI #1540](https://github.com/zaidhqdev-sys/GHM/actions/runs/39878374504). This append requires fresh CI verification on the new docs head.

Independent security review is still outstanding. Do not change grants pending review. Governed non-production Render DB qualification remains blocked by access restrictions. PR #183 remains draft; no production or infrastructure changes made.


## 2026-10-23 — latest docs-head checks green

Checks on `bb67b0d1356073a9586295926a4b896b48c45ee6` passed: quality workflow run `39878645668` and Cloudflare Pages preview. [Quality job](https://github.com/zaidhqdev-sys/GHM/actions/runs/39878645668/job/120170380742) · [Cloudflare check](https://github.com/zaidhqdev-sys/GHM/runs/120170619258). Preview deployment is not production cutover and does not satisfy governed DB qualification. This register update requires fresh CI on the resulting head.

Independent security review remains outstanding; PR #183 remains draft. Do not change grants pending review. Governed non-production Render DB qualification remains blocked by access restrictions.


## 2026-10-23 — CI #1545 passed; review and governed DB gates remain

Quality workflow [run #39878954979](https://github.com/zaidhqdev-sys/GHM/actions/runs/39878954979), job [120171393883](https://github.com/zaidhqdev-sys/GHM/actions/runs/39878954979/job/120171393883), passed on `9860289e833bc610db1ee9a74ad91780f81cc23c`. Disposable PostgreSQL migrations, Business Identity/QuoteFlow qualification, DB-backed tests, migration-audit policy, and runtime-boundary verification passed. Cloudflare Pages check [passed](https://github.com/zaidhqdev-sys/GHM/runs/120171643798), which is preview evidence only.

Still blocked: independent review of `auth_change_password`, `auth_disable_account`, and `auth_read_connect_identity_authority` plus runtime grants; governed isolated Render non-production DB qualification due to existing access restrictions. PR #183 remains draft and no grants were changed. This register update requires fresh CI on the resulting head.

## 2026-10-23 — CI #1548 passed; outstanding release gates unchanged

Quality workflow [run #39879408009](https://github.com/zaidhqdev-sys/GHM/actions/runs/39879408009), job [120172885901](https://github.com/zaidhqdev-sys/GHM/actions/runs/39879408009/job/120172885901), passed on `568e3c6729d772204e58008a2344ee3e01baf951`. Disposable PostgreSQL migrations, Business Identity/QuoteFlow qualification, database-backed tests, migration-audit policy, and runtime-boundary verification all passed.

Still blocked: independent security review of `auth_change_password`, `auth_disable_account`, and `auth_read_connect_identity_authority` plus runtime grants; governed isolated Render non-production DB qualification due to existing access restrictions. PR #183 remains draft and no grants were changed. This register update requires fresh CI on the resulting head.

## 2026-10-23 — CI #1551 passed; review and governed DB gates remain

Quality workflow [run #39879776643](https://github.com/zaidhqdev-sys/GHM/actions/runs/39879776643), job [120174083356](https://github.com/zaidhqdev-sys/GHM/actions/runs/39879776643/job/120174083356), passed on `f2564571d5982a46d3107acd3367aa7e1b16ea09`. Disposable PostgreSQL migrations, Business Identity/QuoteFlow qualification, DB-backed tests, migration-audit policy, and runtime-boundary verification passed. Cloudflare Pages preview check [passed](https://github.com/zaidhqdev-sys/GHM/runs/120174330790).

Outstanding: independent review of `auth_change_password`, `auth_disable_account`, `auth_read_connect_identity_authority`, and runtime grants; governed isolated Render non-production DB qualification due to existing access restrictions. PR #183 remains draft; no grants changed. This register update requires fresh CI on the resulting head.

## 2026-10-23 — CI #1554 passed; release gates unchanged

Quality workflow [run #39879986416](https://github.com/zaidhqdev-sys/GHM/actions/runs/39879986416), job [120174765405](https://github.com/zaidhqdev-sys/GHM/actions/runs/39879986416/job/120174765405), passed on `dbe90e491595e706f1c4fd362dce2455e4464e52`. Disposable PostgreSQL migrations, Business Identity/QuoteFlow qualification, database-backed tests, migration-audit policy, and runtime-boundary verification passed. Cloudflare Pages preview check [passed](https://github.com/zaidhqdev-sys/GHM/runs/120174970239).

Outstanding: independent review of `auth_change_password`, `auth_disable_account`, `auth_read_connect_identity_authority`, and runtime grants; governed isolated Render non-production DB qualification due to existing access restrictions. PR #183 remains draft; no grants changed. This register update requires fresh CI on the resulting head.

## 2026-10-23 — CI #1557 passed; release gates unchanged

Quality workflow [run #39880270795](https://github.com/zaidhqdev-sys/GHM/actions/runs/39880270795), job [120175712480](https://github.com/zaidhqdev-sys/GHM/actions/runs/39880270795/job/120175712480), passed on `7c25c5ef3d8c01b4cfc8167eae7aff0816c33b89`. Disposable PostgreSQL migrations, Business Identity/QuoteFlow qualification, DB-backed tests, migration-audit policy, and runtime-boundary verification passed. Cloudflare Pages preview check [passed](https://github.com/zaidhqdev-sys/GHM/runs/120175932255).

Outstanding: independent review of `auth_change_password`, `auth_disable_account`, `auth_read_connect_identity_authority`, and runtime grants; governed isolated Render non-production DB qualification due to existing access restrictions. PR #183 remains draft; no grants changed. This register update requires fresh CI on the resulting head.

## 2026-10-23 — CI #1560 passed; review gates remain

Quality CI [run #1560](https://github.com/zaidhqdev-sys/GHM/actions/runs/39880723364) ([job details](https://github.com/zaidhqdev-sys/GHM/actions/runs/39880723364/job/120177186734)) passed all required build, disposable-PostgreSQL migration/qualification, database-backed test, migration-audit policy, and runtime-boundary steps on `ce5441ffcc8445c818e7485e4c518074dc8045f1`; the [Cloudflare Pages preview check](https://github.com/zaidhqdev-sys/GHM/runs/120177424421) passed too. Remaining blockers are the independent security review and governed non-production database qualification. Do not change grants or access controls without authorization; no production cutover is implied.
