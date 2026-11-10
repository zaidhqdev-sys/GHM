# GHM Current State — Authoritative Documentation Reconciliation

**Status:** CURRENT / AUTHORITATIVE DOCUMENTATION INDEX — mainline reconciled 2026-10-13; dependency-refresh candidate recorded 2026-11-06
**Repository authority:** consolidated `main`
**Reconciliation history:** the PR #125 baseline (`01bd40dabe0b0f02bb30d2f78267a0414d3d8356`) was followed by PR #126 (`aef8ecdeee241d31827f6fc42730f9a61f1ddea4`), PR #127 (`6afb428d452012d9860ca50c2b0066f0768b184c`), PR #128 (`671c41be0b2446dd5c56c709c4aa3cb2e15e7d81`), PR #129 (`9af7901b0baecbdc4b307f3a0a93e1643f006ca6`), and PR #130 (`14c805cfd749ed50493523972fdd0a7c359bbfce`), all merged on 2026-10-13. These SHAs identify historical reconciliation milestones, not live pointers to deployed Render code or database state. The earlier `1f2b10d0850095311614c5b5f9531eb8b7cce860` checksum-normalization commit is historical provenance. PR #130 subsequently merged into `main` as `14c805cfd749ed50493523972fdd0a7c359bbfce`; pre-merge checkpoint language retained below is historical only.

## Purpose

This document is the current navigation point for GHM construction state. It reconciles the living architecture/evidence record against the consolidated mainline and explicitly separates qualified construction capability from remaining production-replacement work.

## Reconciled implementation status — 2026-10-13

- **Migration checksums:** the current runner canonicalizes SQL line endings and supports a legacy CRLF checksum only when it matches the same SQL content. This is a compatibility correction; it does not rewrite the live ledger or erase the historical provenance exceptions.
- **PayFast:** checkout/redirect, ITN callback, provider-specific verification, and server-to-server ITN confirmation are implemented and merged. Deterministic local qualification is passing. Real PayFast sandbox end-to-end/runtime qualification remains open; production credentials and live enablement remain separately gated.
- **Connect payment preparation:** canonical Business mapping resolution has been merged and sandbox payment-preparation qualification is recorded. This is not a Connect production cutover.
- **Runtime mapping access:** direct access by ghm_runtime to ghm.business_external_mapping has been revoked by the merged migration. This does not authorize legacy/bootstrap role cleanup.
- **Storage:** metadata/lifecycle and the Cloudflare R2 provider data path have qualification evidence. Broader service-level tenant/resource authorization, recovery/orphan handling, production configuration, and product exposure remain open.
- **Product replacement:** Connect and QuoteFlow remain on their existing production paths until product-specific migration, shadow qualification, recovery/rollback, and founder-authorized cutover gates are completed.

## Core platform foundation

- Authentication foundation: bounded GHM ES256 issuance/session/identity construction is qualified. Founder approval for canonical `sub` representation and ±60-second clock skew, as well as the ES256 key environment names, `kid` format, and key-overlap minimum, is recorded in the Gate 3B implementation-parameter gate. Remaining items include token-pepper approval, explicit Founder approval status for `last_seen_at` session-activity updates, previous-key retirement timing, independent `iat` presence/future-time validation qualification, and production secret provisioning. Product session migration and production cutover remain separately gated.
- Durable tenant isolation: **qualified 2026-10-05**. Tenant authority derives from authenticated account identity plus active membership in an active Business; caller-supplied Business identifiers cannot establish authority.
- Authorization/transaction boundary: qualified construction primitives.
- Database authority: canonical GHM schema/runtime/migrator separation remains the governing model; legacy role/object retirement remains evidence-gated.
- Resource API / HTTP transport: bounded construction surfaces exist; route exposure remains per-resource and separately qualified.

## Qualified Business-domain capabilities

Current mainline contains qualified construction boundaries for Business Identity/Profile, Business Category, Business Capability, Business Hours, Business Offering, Opportunity Core, Opportunity Capability Requirements, Opportunity Participant, Project (private owner-bound resource and separately qualified public disclosure projection), Project Quote, Enquiry, Customer, Quote, Review/aggregate, Trust, Saved Business, Notification persistence, Support Request, public Business read, Directory v1, and related bounded capability seams. The Campaign root and Founder-locked bounded HTTP resource are implemented on mainline; this does not authorize a KBM adapter, child resources, broader HTTP expansion, or production cutover. Public Business read and Directory v1 construction/runtime qualification was merged in PR #10; this does not authorize production product cutover. Notification persistence qualification does not imply full notification delivery/event transport or public HTTP workflow qualification.

The recent tenant-adoption sequence is complete for:

1. Business Offering
2. Business Profile
3. Business Category
4. Business Capability
5. Business Hours
6. Opportunity Participant
7. Opportunity Capability Requirements

Each was qualified without broad resource refactoring or caller-controlled tenant rebinding.

## Commercial

The Commercial domain has a constructed/qualified trial boundary and qualified country/currency reference-data dependency. Internal commercial events and external commercial-provider events are distinct existing ledgers; no second generic event ledger is authorized merely for audit convenience.

The PayFast provider-specific implementation (HTTP checkout/ITN boundary, verification, and server-to-server confirmation) is merged on `main`; deterministic local qualification has passed. Post-merge local verification passed at 557/557 tests. The local sandbox-only qualification runner (`npm run qualify:payfast-runtime`) passed its build and 22 focused tests (0 failures, 0 skips); the runner stubs provider HTTP and does not call PayFast, access a database, or require live credentials. Real PayFast sandbox end-to-end/runtime qualification, production credentials, live enablement, and production cutover remain separately gated.

## Storage

GHM storage is **not missing**. The current foundation includes:

- `ghm.storage_object` metadata schema;
- narrow lifecycle persistence functions;
- runtime direct-DML denial;
- provider-neutral storage service/repository contracts;
- provider factory/configuration/key boundaries;
- persistence qualification;
- live S3-compatible provider data-path qualification against Cloudflare R2 (signed PUT/HEAD/GET/DELETE and payload integrity).

Qualified storage boundary: metadata persistence/lifecycle authority plus live concrete-provider data-path evidence.

Still open: application composition-root wiring, grant expiry/enforcement, broader provider error mapping, full service-level tenant/resource authorization qualification, HTTP/product exposure, recovery/backup, orphan/reconciliation processing, deployment-managed production configuration, and production provider enablement.

## Connect integration

Bounded construction-qualified seams include Connect service trust/request context, governed operation resolution, authorization binding, resource dispatch, service HTTP read boundary, assertion replay protection, **Connect-side** Business provisioning/linking, identity integration foundation, and selected resource adapters. These are not production migrations. Do not confuse Connect-side Business provisioning/linking with **QuoteFlow legacy organization → GHM Business creation**, whose reconciliation contract is qualified but whose separate Business-provisioning implementation is still not qualified (`QUOTEFLOW_MIGRATION_BUSINESS_PROVISIONING_CONTRACT.md`).

## QuoteFlow

GHM contains historical/provenance and migration-boundary work for QuoteFlow. Existing legacy identity/data migration remains evidence-gated. The earlier attestation verifier and persistence-free identity-link flow are historical/superseded. The dual-confirmation authority note is migration-ceremony provenance only, not permanent runtime identity authority. The current migration authority is the GHM account-onboarding/migration boundary and its exact `(provider=supabase, sourceSubject)` provenance mapping, not a separate permanent identity-link table. GHM construction must not infer remote storage or data ownership solely from the presence of Supabase client code.

## Legacy PostgreSQL authority

Legacy roles/objects remain preserve-and-audit until dependency, data provenance, ownership, disposition, and least-privilege end-state evidence is complete. No legacy role retirement is implied by this index.

## Explicit non-authority / historical records

Historical handovers, source audits, founder decision records, and superseded gate contracts remain valuable provenance. They must not be read as current implementation status when a current qualified contract/evidence record supersedes them.

Known stale roadmap examples were reconciled rather than treated as current authority, including older capability-gap language that predates the storage foundation and older tenant-adoption documents that predate the 2026-10-05 qualification sequence.

## Remaining production-replacement gates

The existence of qualified construction slices does **not** mean GHM has replaced Connect or QuoteFlow in production. Remaining work includes product workflow/adapters where not yet qualified, production configuration/secrets, provider enablement, migration/cutover rehearsal, recovery/rollback, observability/operational readiness, and founder authorization for production replacement.

The Issue #1 production-foundation roll-up was reconciled on 2026-10-13 to remove stale blanket gaps for schema/migration authority and bounded runtime/tenant-authorization slices. Issue #1 remains open pending reconciliation of the complete acceptance criteria, including remaining authentication-parameter decisions, production configuration, and independently evidenced operational acceptance.

## Rule

**Code, migrations, qualification evidence, and current living contracts outrank historical roadmap language. When a document conflicts with current mainline evidence, the document is stale and must be reconciled before it is used to authorize new construction.**



## Supplemental whole-repository status reconciliation — 2026-10-13

Following the PR #126 documentation follow-up, the tracked Markdown inventory was re-enumerated on consolidated `main` (209 `.md` files) and status/authorization claims were rechecked against the current-state index, governed remaining-work register, current capability contracts, and qualification evidence. This pass found additional conflicts that were not corrected by the prior follow-up; they are reconciled in PR #127:

- GHM-04 incorrectly described public Business read and Directory v1 as unbuilt/unauthorized, despite their qualification and merge in PR #10. The remaining-work register and Connect readiness register now distinguish those closed narrow slices from broader Connect-parity work that remains gated.
- The Customer operation contract still said qualification was pending, contrary to the qualified Customer schema/resource status. Its gate is now recorded as satisfied for the bounded construction slice.
- The Issue #1 roll-up described the checksum-normalization SHA as a current-main audit anchor; it is clarified as historical provenance, not current `main` HEAD.
- The historical Connect readiness audit and operation inventory had baseline wording that could be mistaken for a current repository pointer; both now label those comparisons as historical snapshots.
- The QuoteFlow dual-confirmation record still presented its old identity-link proposal as the next construction gate. That sequence is explicitly superseded by the GHM-owned account-onboarding/migration boundary; no permanent runtime identity-link table or attestation-based bridge is authorized by that historical record.

PR #127 was documentation-only and merged as `6afb428d452012d9860ca50c2b0066f0768b184c` after its supplemental status reconciliation, final diff review, and required CI passed. It did not change code, migrations, local checkout state, deployed services, credentials, production routing, or cutover authorization. Historical source audits and decision records remain preserved as provenance.

## Supplemental whole-repository status reconciliation — follow-up, 2026-10-13

A further status/authorization sweep re-enumerated the 209 tracked Markdown files after PR #127 and compared living contracts, qualification evidence, the remaining-work register, and dated provenance records. It found additional stale statements in the current index and a small set of living architecture/database/QuoteFlow contracts; the following corrections are recorded together so later work does not restart completed steps:

- Corrected this index's stale post-merge statement that PR #127 was still unmerged, and clarified that reconciliation SHAs are historical provenance rather than current branch/deployment pointers.
- Updated the governed construction sequence and its cross-references to reflect that multiple resource/adaptor slices are already qualified; shadow qualification and production cutover remain open.
- Marked the Opportunity Participation build sequence as completed historical provenance, not a current next-step list.
- Reconciled QuoteFlow identity authority/mapping wording to the qualified GHM account-onboarding/migration boundary. No permanent runtime identity-link table or attestation-based identity bridge is authorized; remaining QuoteFlow account, ceremony, Business-provisioning, product-integration, and cutover gates stay explicit.
- Replaced stale “next construction slice” language in the QuoteFlow snapshot-validator and enrollment-lookup records with the current qualified/unqualified boundary.
- Updated the database README's first-migration prerequisite to reflect that initial schema reconciliation has occurred and that each later migration still requires current catalog/ledger/contract reconciliation.
- Reconciled the 2026-09-10 migrator record's old “remaining work” list against later dedicated-schema/default-privilege and TEMP-privilege decisions, while preserving bootstrap cleanup and legacy authority retirement as open.
- Clarified that the error-semantics contract does not authorize a platform-wide taxonomy/versioning runtime refactor, without implying that the separately qualified authentication foundation is unimplemented.

This follow-up was documentation-only. It did not modify application code, migrations, credentials, deployed services, production routing, live database state, or product cutover authorization. Dated source audits and gate decisions remain preserved as historical evidence; unresolved production and product-migration gates remain governed by this index, the remaining-work register, and the current capability-specific qualification records.

## Further whole-repository documentation reconciliation — 2026-10-13

After the PR #128 follow-up, the 209 tracked Markdown files were re-enumerated and reviewed against the current state index, governed remaining-work register, capability contracts, implementation/qualification records, and historical provenance. This pass found and corrected additional status ambiguity in the Review HTTP boundary, Campaign HTTP/authentication wording and encoding, Enquiry construction-versus-product-parity wording, QuoteFlow reset/re-enrollment status, QuoteFlow legal-acceptance sequencing, migration-provenance exception counts, and reconciliation-milestone references. It also corrected a stale terminal status in the Business Capability tenant-adoption contract. All 209 Markdown files were also checked for broken relative/local Markdown link targets; no broken local targets were found.

These corrections do not close any production, provider, legacy-role, QuoteFlow account/Business provisioning, full migration-ceremony, product-adapter, shadow-qualification, or cutover gate. In particular, the two known QuoteFlow accounts remain founder-owned and must be handled individually; the full user-facing reset/re-enrollment ceremony and migration-only organization-to-Business provisioning remain unqualified. This is documentation-only and changes no code, migrations, credentials, local checkout, deployed service, live database, product routing, or traffic.

## Historical documentation reconciliation record — second pass, 2026-10-05

This paragraph records the outcome of the 2026-10-05 pass and is retained as provenance; the current reconciliation status and audit anchor are stated at the top of this document. The first reconciliation merge was followed by a document-by-document living-status cleanup. Current qualified resources are no longer described as open construction gaps in their living contracts. Historical source audits and gate snapshots remain historical and are explicitly treated as provenance. The remaining production gap register is `docs/GHM_REMAINING_WORK_REGISTER_2026-10-05.md`. It is the current planning authority for open work; it explicitly separates GHM-core construction, product integration, provider/configuration, migration/provenance, and production cutover.

## Repository-wide documentation reconciliation follow-up — 2026-10-13

**Audit base:** `main` at `01bd40dabe0b0f02bb30d2f78267a0414d3d8356` (the PR #125 merge commit).

- The repository tree contained 664 tracked files, including 209 documentation-like files under the repository-wide documentation inventory.
- PR #125 changed 102 of those documentation-like files; the remaining 107 were reviewed against current mainline code, qualification evidence, and the authoritative state/remaining-work records.
- Local Markdown link targets were checked across the 209-file documentation inventory; no broken local file targets were found.
- This follow-up corrects stale current-status or branch-provenance statements in the Project resource, public Business/Directory, Customer/Quote adapters, Campaign/Project/Saved Business frozen contracts, database/storage README guidance, schema decision, and qualification/evidence records.
- The follow-up is documentation-only. It does not change application code, migrations, credentials, deployed services, or production product routing. Production cutover remains separately gated.


## Supplemental contradiction audit — 2026-10-13

The continuing documentation-only review found and reconciled further stale or ambiguous status statements across living contracts and historical source evidence:

- Opportunity Participation and Business Profile source audits now explicitly identify their construction-authorization wording as historical: both bounded slices are already qualified, and neither audit is an active construction gate.

- **Shared platform and storage:** the original global storage prohibition is historical. GHM storage metadata/persistence and the controlled Cloudflare R2 provider path are qualified; product-facing authorization, recovery/orphan handling, production enablement, and cutover remain gated. Realtime, generic jobs, Campaign generation jobs, and Campaign-specific storage children remain outside the qualified scope.
- **Connect source evidence:** the readiness matrix, referenced-object classifications, atomic-workflow payment gaps, and source-audit implementation observations are now clearly historical snapshots. They must not be mistaken for current GHM capability inventories or instructions to create resources. Product workflow parity, realtime, provider enablement, and cutover remain separately gated.
- **Connect readiness counts:** the production-readiness gap register now labels its 48-dependency/54-row classification totals as historical audit counts, not current capability-coverage measurements. Its current blocker states must be read with the living current-state and per-capability qualification records.
- **Latest changed-file scan:** all 30 Markdown files in PR #130 were re-read at the current head. The stale-status phrase sweep found no remaining instances of the targeted contradictions (old unqualified/current-state claims, stale payment-operations status, or unscoped historical authorization statements). All 14 inline local Markdown links in the changed files resolve to 9 existing target documents. This is a targeted changed-file check, not a fresh scan of all 209 tracked Markdown files.
- **Commercial/payment:** the product-backend inventory distinguishes the merged/local-qualified PayFast checkout, ITN, and server-confirmation implementation from open real PayFast sandbox/runtime qualification, production credentials/enablement, broader product workflow parity, and any additional provider adapters. PayFast approval is not conflated with Paystack status.
- **Identity and migration:** routine QuoteFlow migration-only external identity resolution uses the qualified `(provider=supabase, sourceSubject) → ghm.account_identity.id` mapping. Historical dual confirmation is limited to exceptional legacy-conflict ceremonies. QuoteFlow session/product migration, role/membership reconciliation, the legacy organization-to-GHM-Business crosswalk/provisioning, the complete reset/re-enrollment ceremony, and cutover remain gated.
- **Historical implementation evidence:** the error-semantics/versioning contract now dates route/error observations to its historical `0a9a9f7` baseline rather than presenting them as a current exhaustive route inventory. Platform-wide semantic error taxonomy and compatibility/versioning implementation remain unauthorized by that contract. Campaign and Enquiry contracts now distinguish completed bounded construction from still-gated broader product work and Enquiry source/workflow parity.
- **Source-of-truth records:** the current-state index and remaining-work register were updated alongside these corrections. The targeted cross-check also revisited storage qualification/evidence, authentication and transport decisions, PostgreSQL authority/legacy-role gates, and selected resource and QuoteFlow migration contracts.

At this checkpoint, the prior full inventory comprised 209 tracked Markdown files and passed a repository-wide local-link scan. A fresh link check of the then-current changed-file set also found no broken local targets. The statement that no further contradiction was identified applied only to that reviewed subset and checkpoint; subsequent passes found and corrected additional issues in the qualification sequence, dated handovers, and QuoteFlow migration contracts. This reconciliation remains documentation-only: no application code, migrations, credentials, deployments, database state, local checkout, product routing, or production cutover was changed or authorized. At that checkpoint, PR #130 had not yet merged; it subsequently merged into `main` as `14c805cfd749ed50493523972fdd0a7c359bbfce`. This is a historical audit checkpoint, not current merge status.


The authentication parameter gate now distinguishes the bounded construction authorization recorded on 2026-09-30 from per-parameter Founder decisions: implementation of a bounded value does not close rows marked approval required/open. The `last_seen_at` refresh-only behavior is implemented/evidenced, but its explicit Founder approval remains open; the final gate wording now reflects that distinction.

The qualification-sequence contract has also been clarified: it records gate order and summarized construction evidence, not a live deployment/CI dashboard. Use current mainline workflow evidence for present CI status and capability-specific contracts for current qualification; historical branch pointers do not identify the deployed Render SHA. Shadow qualification, recovery, production readiness, and cutover remain separate gates.

Historical handover review found branch-specific merge prohibitions that could be misread as current instructions despite the dated-snapshot banners. The 2026-09-09 through 2026-09-16 handovers now explicitly scope those instructions to their historical workflow and direct readers to the current founder-agreed documentation-reconciliation and PR gates. Preserve the handovers as provenance; do not use them as current merge policy.

The QuoteFlow migration pass also reconciled stale checklist framing: the existing-user migration boundary now marks the reset/re-enrollment ceremony and organization-to-Business reconciliation contracts as defined, while preserving the genuinely open gates for integrated ceremony qualification, live Business provisioning/membership reconciliation, local-data scope transition, product session client, and end-to-end cutover. The superseded dual-confirmation identity-link contract now explicitly labels its fail-closed list as historical proposal rules, not a live gate that can reopen the qualified migration-only external-identity mapping.

## Historical pre-merge documentation checkpoint — PR #130, 2026-10-13 (superseded by merge)

This section records the current documentation-only reconciliation branch; it is not evidence that the branch has merged or that deployed/runtime state changed. The review revisited the current-state index, governed remaining-work register, qualification sequence, Issue #1 roll-up, authentication parameter gate, Connect readiness records, QuoteFlow migration/identity contracts, shared-platform boundary audit, and dated September handovers.

- Dated handover instructions and old “current state” headings are explicitly scoped to their historical checkpoints; they do not override the living status index or current founder-agreed merge gates.
- Authentication roll-ups now list the actual unresolved parameter decisions and distinguish bounded implementation authorization from explicit Founder approval.
- QuoteFlow account identity/account provisioning is distinguished from the still-unqualified organization-to-Business and membership provisioning, reset/re-enrollment ceremony, product-session migration, and cutover.
- Connect readiness totals are labeled historical audit counts. PayFast local checkout/ITN/server-confirmation qualification is distinct from real sandbox/runtime qualification and production enablement; PayFast is not conflated with PayStack.
- Issue #1 remains open until all acceptance criteria are reconciled and independently closed. Product workflow parity, recovery/rollback, operational acceptance, shadow qualification, and production cutover remain gated.

This paragraph records the historical documentation PR that merged into `main` as `14c805cfd749ed50493523972fdd0a7c359bbfce`; it is not a status statement about current migration PR #133. That earlier PR changed Markdown under `docs/` only and did not authorize code, migration, credential, deployment, database, routing, or cutover changes. The current Connect migration documentation is tracked separately in draft PR #133 and must not be treated as merged.



## Current Connect backend migration authority — 2026-10-13

The Connect migration handover is the durable product-specific resume point: `docs/architecture/CONNECT_GHM_MIGRATION_HANDOVER_2026-10-13.md`. Read it together with `docs/architecture/GHM_CONNECT_PRODUCTION_READINESS_GAP_REGISTER.md`, `docs/architecture/CONNECT_BACKEND_OPERATION_INVENTORY.md`, and the per-capability contracts. The operation-level migration overlay records Connect caller evidence, provisional reuse/extend/build/legacy classification, and acceptance gates.

Do not infer Connect readiness from the existence of a GHM resource or from the previously qualified narrow identity, directory, storage or payment slices. Current blockers include the Supabase-only Connect identity provider binding, browser-safe authenticated transport, broader active Connect contract parity, missing HTTP exposure for storage/business-hours mutation, and active product journeys not yet represented by GHM APIs. Keep all payment and AI activation gates unchanged. This audit is documentation-only; no implementation, merge or cutover is authorized by it.

## Identity-provider provenance versus runtime authority — explicit reconciliation, 2026-10-13

The existing `(provider, subject) → ghm.account_identity.id` mapping foundation and QuoteFlow migration-provenance records are bounded identity/migration capabilities, **not a declaration that Supabase remains a valid provider in the target Connect runtime**. In particular, `(provider=supabase, sourceSubject)` may be retained as historical source provenance needed to reconcile already-migrated legacy records; it must not be used as the target Connect session issuer, ongoing authentication dependency, or requirement for normal Connect API calls.

For the Connect no-Supabase migration, the target caller identity must be established by GHM-native authentication/session credentials, then resolve the active canonical GHM account and current membership/resource permissions. The currently qualified Connect identity adapter and authorization-binding slice still require `provider=supabase` and therefore are **not target-runtime qualified**. This is a known gap, not a contradiction to hide: preserve their narrow historical qualification evidence, but do not reuse their Supabase-provider assumption as the final product identity contract. No existing identity or migration record authorizes bootstrap, automatic account linking, or production cutover.

## Storage and qualification database checkpoint — 2026-10-26

- The qualification-database migration run completed locally with exit code 0 against `ghm_payfast_sandbox_db`. The historical QuoteFlow migration checksum mismatch was resolved by restoring the exact previously applied SQL bytes in commit [`5229b37700f2e21ac4caf2d4c5547bb929ab2de8`](https://github.com/zaidhqdev-sys/GHM/commit/5229b37700f2e21ac4caf2d4c5547bb929ab2de8); no ledger rewrite was used. This is not evidence that production was migrated.
- Read-only database catalog checks confirmed the account-scoped `ghm.storage_get_object(bigint,bigint)` function, absence of the legacy one-argument overload, owner-controlled `SECURITY DEFINER` lifecycle functions, runtime execute grants, and no direct runtime table DML grant.
- The authenticated storage API, scoped metadata lookup, migration safeguards, and disposable PostgreSQL lifecycle/tenant authorization qualification are merged to `main` in PR #184, commit `43450e42e902594493bdab4ba2c689b0c4099912`.
- `npm run qualify:storage-live-provider` returned `QUALIFIED` on 2026-10-26. Build, signed upload, provider HEAD/metadata match, signed download, payload integrity, deletion, and deleted-object absence all passed. Evidence: `docs/evidence/STORAGE_LIVE_PROVIDER_QUALIFICATION_2026-10-26.md`.
- The only bucket created so far is named `zaid-ghm-production`; a successful provider-path test does not establish a dedicated non-production bucket. The test object was confirmed deleted. Avoid further mutating qualification runs against that bucket by default.
- Remaining storage gates: verify main-head CI, deployed authenticated application/API end-to-end testing, runtime/composition-root wiring, production migration-ledger/DDL reconciliation, recovery/orphan reconciliation, backup/recovery, and explicit production enablement/cutover. Keep production database and `GHM-Internal-Runtime` untouched.


## Mainline delivery checkpoint — 2026-10-26

Qualified, independently applicable slices have been merged and exact-head main CI passed:
- Storage API, scoped metadata lookup, migration safeguards, and disposable PostgreSQL lifecycle/tenant authorization qualification: PR #184, commit `43450e42e902594493bdab4ba2c689b0c4099912`, CI [#40407751688](https://github.com/zaidhqdev-sys/GHM/actions/runs/40407751688).
- Consolidated handover and dated provider qualification evidence: PR #152, commit `e2e2183b37d020b119e26b71a72ddfdfd4f7d29e`, CI [#40409249775](https://github.com/zaidhqdev-sys/GHM/actions/runs/40409249775).
- Connect target-runtime contract corrections: PR #135, commit `8285ff4e5aaa49c5d0d3210246c78db7c385e45a`, CI [#40409671620](https://github.com/zaidhqdev-sys/GHM/actions/runs/40409671620).
- Shared auth persistence for reset and lazy session issuance: PR #187, commit `2e5484531e98a5a29df1d61eb2fe4dcb75e664a5`, CI [#40409715942](https://github.com/zaidhqdev-sys/GHM/actions/runs/40409715942).

Only two PRs remain open: #142 is a broad, divergent identity integration candidate and is not safe to merge wholesale; #183 is stacked on that candidate for its candidate-dependent reset HTTP harness. Keep production DB, Render settings/credentials, and cutover unchanged until their distinct gates pass.


## Production storage permission correction — 2026-10-28

- PR #189 is merged at `60814931bd3905c4be95a2366ea4b16957b48cb1`; Render service `GHM-Internal-Runtime` is deployed from the mainline and its service metadata shows the update at 2026-10-28 00:27:22 UTC.
- The user applied `GRANT ghm_runtime TO ghm_db_user;` on the primary `ghm_db` database. The user's follow-up SQL returned `schema_usage=t` and `scoped_getter_execute=t`.
- Independent read-only catalog verification confirmed `ghm_db_user` is a member of `ghm_runtime`, has USAGE on schema `ghm`, can EXECUTE `ghm.storage_get_object(bigint,bigint)`, and the scoped function exists.
- The Render query interface cannot SELECT from `ghm.ghm_schema_migrations` using its current read-only role, so production migration-ledger state remains unverified. Do not infer migration success from the function existing alone and do not rerun migrations just to address the now-fixed role membership.
- A live application-level request invoking the getter is still required to close end-to-end verification. The generic web fetch did not access the service URL or `/healthz`; this tool limitation is not evidence of app failure. No relevant app logs were returned for the short interval inspected.
- Detailed current-session resume steps and evidence are recorded in [the 2026-10-28 storage permission handover](HANDOVER_2026-10-28_STORAGE_PERMISSION_FIX.md).


- Follow-up direct function invocation through the Render read-only query connection attempted a lookup using a deliberately nonexistent bigint object ID. The scoped getter returned its expected generic `storage object does not exist` exception (`P0001`), not a permission-denied error. This verifies function invocation under that connection's effective role but is not an application HTTP end-to-end test.


- Further runtime verification at 2026-10-28 00:52 UTC: source defines `GET /healthz` and startup readiness `GET /readyz`; Render's configured health path is `/healthz`. The available web/network environment could not resolve/reach the service hostname. Render request logs were empty for 00:40–01:00 UTC and HTTP-count metrics returned no points; neither result proves service failure or success. The authenticated app-level storage call remains pending. See [detailed handover](HANDOVER_2026-10-28_STORAGE_PERMISSION_FIX.md).


- Render application logs were queried through 00:55 UTC and confirm the deployed `60814931bd3905c4be95a2366ea4b16957b48cb1` process started with `npm start`, logged `GHM Core Engine listening on port 10000` at 00:27:16.997 UTC, and Render marked the service live at 00:27:22.664 UTC. This proves startup/live status at deployment time, not an end-to-end storage request after the permission grant. See [the detailed handover](HANDOVER_2026-10-28_STORAGE_PERMISSION_FIX.md).


- Final DB diagnostic (2026-10-28 00:56 UTC): Render read-only query session reports `session_user=ghm_app_user`, `current_user=ghm_db_user`, and effective membership in `ghm_runtime=true`. The schema ledger `ghm.ghm_schema_migrations` exists, but the query role lacks SELECT; the public ledger does not exist. Do not grant app-role SELECT solely for diagnosis.
- The current checking environment cannot resolve/reach the Render hostname, so live HTTP smoke test instructions are recorded in [the storage handover](HANDOVER_2026-10-28_STORAGE_PERMISSION_FIX.md). Authenticated storage lookup and exact migration-ledger row remain unverified.


- User's PowerShell health checks at 00:57 UTC failed: `/healthz` connection closed unexpectedly; `/readyz` timed out. Render diagnostics show a docs-only commit triggered deploy `dep-dbgkginb9u1s73cu2qo0` from 00:56:42 to 00:57:25 UTC, with the new process listening on port 10000 and Render marking it live at 00:57:26. The requests were close to the restart window; transient routing is plausible, not proven. Source confirms `/healthz` is static and `/readyz` waits on successful startup DB `SELECT 1`. No HTTP count metrics or request logs were available. Follow the TLS 1.2 plus `curl.exe -v` diagnostic in [the detailed handover](HANDOVER_2026-10-28_STORAGE_PERMISSION_FIX.md); no migration/code changes are indicated yet.


## Browser-auth mainline consolidation checkpoint — 2026-11-06

- GHM PR #217 merged to main at `96575838319cc319e328443289bee379c9947ac2`. It adds the GHM-owned browser-auth cookie endpoints; exact-head CI passed. Mainline quality CI run [42136446662](https://github.com/zaidhqdev-sys/GHM/actions/runs/42136446662) and Cloudflare Pages check passed for this commit.
- Connect PR #57 merged to main at `929bb12ef15ceb17099d8a650bbe403a0fdb3b9a`. It adds the same-origin BFF and memory-only access-token browser client; exact-head CI passed. Connect main quality CI [42137358073](https://github.com/zaidhqdev-sys/zaid-connect/actions/runs/42137358073) passed on main commit `3d9afeb1d9795e5984c699e62a031f3c35590885`.
- These are merged source-code changes, **not an activated or qualified browser-auth runtime**. Connect's `VITE_GHM_WEB_AUTH_ENABLED` remains disabled by default. GHM's three browser-auth settings are not configured on a runtime. Do not claim HttpOnly browser-session protection is active.
- Next gate is a separately approved isolated non-production setup: canonical Connect Preview origin, server-only BFF upstream to the approved GHM qualification runtime, GHM exact Origin and cookie configuration, and the Connect flag enabled only for that Preview build. Execute the documented browser E2E matrix (register/login, access-only response, cookie attributes, refresh rotation/replay, logout/revocation, Origin denial, preview alias, bearer forwarding without cookie leakage). Record evidence and revert the flag if any gate fails.
- No environment variables were changed, no runtime deployed, no database migration/data mutation occurred, and no production configuration or cutover was authorized in this checkpoint. GHM internal-runtime auto-deploy remains disabled.

## Dependency security refresh candidate — 2026-11-06 (not yet merged)

A narrowly scoped dependency security refresh has been validated on a dedicated branch based on the fetched mainline commit `1f23d88b`. The implementation commit is `e36a930b` on `integration/ghm-dependency-security-refresh`; it changes only `package.json` and `package-lock.json`.

- The manifest Node engine minimum is `>=20.0.0`, matching the declared engine requirement of the installed AWS SDK packages.
- The lockfile refresh updates `body-parser` 1.20.6 → 1.20.9, `express` 4.22.2 → 4.22.3, `proxy-addr` 2.0.7 → 2.0.8, and `qs` 6.15.3 → 6.16.2.
- Validation on the integration branch: 651 tests passed, 0 failed, 2 skipped; `npm audit` reported 0 vulnerabilities.
- The branch was pushed to `origin`. At the time of this note, PR creation/review is the next step; the change is **not merged to main and not deployed**.
- The original construction branch and its separate remote-only documentation history were left untouched. Only the dependency commit was cherry-picked onto the new mainline-based integration branch.
- No production secrets, runtime configuration, migrations, database state, or application data were changed.

See [the 2026-11-06 dependency security handover](HANDOVER_2026-11-06_DEPENDENCY_SECURITY_REFRESH.md) for the full command/history/validation record. This is a dependency-maintenance candidate only; it does not close or alter any product, operational, production-readiness, or cutover gate.

## Dependency refresh PR publication follow-up — 2026-11-06

PR [#222](https://github.com/zaidhqdev-sys/GHM/pull/222) is open from `integration/ghm-dependency-security-refresh` to `main`, with head `8ddbb4376b3ade89c7e852dd43e1c9865ca8304f` and base `1f23d88b23a2f54c9d77742b4f47c980b3823e65`. GitHub reports it as mergeable and not merged. Cloudflare Pages automatically completed a branch-preview build at [the integration preview URL](https://integration-ghm-dependency-s.ghm-cu1.pages.dev); this is not a production deployment. GitHub Actions `quality` was still running at the time recorded. Local validation remains 651 passed, 0 failed, 2 skipped, and `npm audit` 0 vulnerabilities. See the detailed handover for the exact publication and validation record.



## 2026-11-08 post-merge runtime and migration checkpoint

- GHM main is `69bb0c832273c49552fe6f6f97d2e56e21c60222`; exact-main quality and Cloudflare checks passed.
- PR #232 is merged. Its schema reconciliation migration is in source main, but has NOT been applied to production.
- `GHM-Internal-Runtime` remains live on `0e2c7c2`, Render auto-deploy disabled. No new deploy or migration was triggered.
- Production migration remains blocked: protected migration ledger has not been reconciled; the production role graph has a material privilege-boundary issue. Read-only catalog shows `ghm_app_user` can SET ROLE `ghm_db_user`; `ghm_db_user` has CREATEDB/CREATEROLE and ADMIN OPTION on `ghm_migrator`, `ghm_schema_owner`, `ghm_payment_provider` and `ghm_runtime`. Although `ghm_migrator` can SET ROLE `ghm_schema_owner` structurally, no approved credential path or successful ledger audit has been verified. No role change was made.
- Do not apply migration, alter grants, activate PayFast callbacks or deploy until the role graph is reviewed/remediated, the complete forensic migration audit passes under the approved migration identity, and owner authorization is recorded.
- Integrated detailed record: [HANDOVER_2026-11-08_INTERNAL_RUNTIME_RECONCILIATION.md](HANDOVER_2026-11-08_INTERNAL_RUNTIME_RECONCILIATION.md), Sections 18–20.
- The previous documentation PR #234 is stale relative to the new mainline. A fresh documentation-only branch `docs/handover-2026-11-08-mainline-reconciled` has been cut from the current main commit; do not merge PR #234 as-is.


## Owner audit and Business profile draft — 2026-11-08

Owner-run isolated clone audit logged in dated handover: temp clone `C:\Users\zaidh\AppData\Local\Temp\GHM-migration-audit-61e0a61b314e411d89ddb39d8b6e33d2`, audited SHA `458f3d7019c5732b22316c906307a69fd5a34a66`; npm ci completed with 0 vulnerabilities and an unapproved argon2 install-script warning. Dedicated migrator audit passed identity/read-only authority but returned INVESTIGATE (9 missing, 9 retained extras, 0 unexplained mismatches), exit 2. Secret URL not retained.

A separate source-only branch `fix/business-profile-compat-contract-20261108` is drafting `20261108140000_reconcile_business_profile_contract.sql` plus contract tests. It adds only missing coordinates and preserves both legacy camelCase and current repository snake_case keys, category/isSupplier, owner/admin auth, SECURITY DEFINER, and observed database limits. It has **not** been run or qualified against PostgreSQL and is not approved for production. Detailed status and limitations are in the dated handover. No production changes or deployment occurred.


Draft PR [#237](https://github.com/zaidhqdev-sys/GHM/pull/237) now contains the unqualified Business profile reconciliation proposal. It remains draft/unmerged and is not authorized for production application. Its current CI status must be checked before any promotion.


**Draft PR #237 CI:** run #2179 / `42487901236` passed on source head `9591ba604069b446613f0a6a4af6eacecf6bc259`. Build, all migrations on disposable PostgreSQL, configured tests, and runtime-boundary checks passed. This is not a restored production clone or Render `ghm_db` qualification. Targeted execution tests of both profile-key alias forms and conflicting-alias rejection remain outstanding; PR remains Draft/unmerged. See dated handover.


**Business profile function-level qualification:** CI run #2186 (`42488340666`) passed with a new disposable-PostgreSQL test invoking the function as `ghm_runtime`. It covers current snake_case and historical camelCase aliases, conflicting alias rejection, coordinate pairing, and owner authorization. The first run #2184 exposed that CI's canonical migration schema lacks production-only legacy `category`/`is_supplier` columns; migration was corrected to handle these columns conditionally and reject explicit requests when absent. The conditional production-only legacy branch remains to be tested on a restored production-like clone. PR #237 remains Draft/unmerged; no Render mutation or deployment occurred. See dated handover.


**Next qualification gate:** CI #2188 (`42488518261`) passed on current PR head. Remaining: restore a schema-only dump of Render `ghm_db`'s `ghm` schema into throwaway local PostgreSQL 18, preserving production-only legacy columns but excluding all production rows, apply the PR migration locally, and run the function-level qualification script. Use approved migrator URL with `pg_dump --schema-only --schema=ghm --no-owner --no-acl --role=ghm_schema_owner`; never run restore/migration/test commands against Render. If schema dump permission fails, stop; do not mutate Render grants. Detailed runbook/checkpoint in dated handover.


**Schema clone workstation checkpoint (14:19 UTC):** PR branch cloned at `C:\Users\zaidh\AppData\Local\Temp\GHM-profile-clone-43533b1379824738b87a8bf7d8754b26`, SHA `d9151d936fa3edcde1bb5a5c050811a37db27166`. Setup stopped because `psql` is not on PowerShell PATH. No local DB/roles, Render connection, schema dump, restore, or production changes occurred. Locate/install PostgreSQL 18 client and local server before continuing; detailed record in dated handover.


**Local PostgreSQL tools discovery (14:24 UTC):** Windows services `postgresql-x64-17` and `postgresql-x64-18` are Running; installations exist at `C:\Program Files\PostgreSQL\17` and `18`. PostgreSQL commands are not on PATH and Docker is unavailable. Use PostgreSQL 18 binaries by absolute path; leave v17 untouched. No database setup or Render access has occurred. See dated handover.


**Local PostgreSQL auth checkpoint (14:28 UTC):** PostgreSQL 18.6 client tools are available. Local postgres role login reached localhost ::1:5432 but failed password authentication. This is separate from Render credentials; no password can be retrieved from the installation. Next inspect the PostgreSQL 18 service data directory and active local pg_hba.conf rules before deciding on a controlled local-only recovery. No auth config or passwords changed, and no Render connection/dump attempted. See dated handover.


**PostgreSQL 18 auth discovery (14:30 UTC):** data directory C:\Program Files\PostgreSQL\18\data; Windows service runs as NetworkService. All local and loopback host rules currently require SCRAM-SHA-256. No local config/password changes, DB setup, Render access, or dump attempted. If local admin recovery is required, narrowly scope a temporary IPv4 loopback trust rule for role postgres only, set a new local password, remove the rule and restore exact original config. Detailed record in dated handover.


**Local PostgreSQL 18 recovery attempt (14:37 UTC):** temporary narrowly scoped HBA rule was added and PostgreSQL 18 service restarted, but psql to 127.0.0.1:5432 still failed with password authentication. Do not broaden trust or retry credentials. Restore the exact saved pg_hba.conf backup and restart PostgreSQL 18 first; verify hash equality. Then identify listener PID/port and confirm service data directory and active HBA path. A PostgreSQL 17/18 port collision or alternate listener is only a possibility pending diagnostics. No local password reset or DB setup, Render dump, migration, or production changes. Detailed handover updated.


**Local PostgreSQL listener checkpoint (14:41 UTC):** exact original PostgreSQL 18 pg_hba.conf backup restored and SHA-256 verified equal (0C8DC6E6E57399790417A6E13A8E1B5E27AA19708A2122148FBFE3BDCECD42). Both PG17 and PG18 Windows services report Running, but Windows found no TCP listener on port 5432 at the time of inspection. Diagnose actual postgres.exe processes, listening ports, configured port/listen_addresses, and recent server logs before another authentication attempt. No HBA changes remain, no password reset/DB setup, Render access, dump, migration, or production changes. See detailed handover.

## Separate scheduled web dependency security audit — 2026-11-08

A scheduled monthly audit identified that current main still resolves web Vite 6.4.3 and Vitest 2.1.9. A separate remediation branch `security/web-dependency-remediation-20261108` and Draft PR [#238](https://github.com/zaidhqdev-sys/GHM/pull/238) were created from main. Scope is limited to web Vite/Vitest security upgrades, Node engine alignment, and dedicated web CI (lockfile regeneration, install, build, tests, npm audit). Lockfile artifact and CI/audit results remain pending; PR must remain Draft/unmerged until reviewed. No backend dependency changes, Argon2 upgrade, production changes, migrations, secrets, database operations, or deployments. This workstream is explicitly separate from the PostgreSQL/runtime reconciliation and does not unblock or alter its gates. The PG18 listener-diagnostics output requested from the owner is still pending.

**Scheduled web dependency audit follow-up:** PR [#238](https://github.com/zaidhqdev-sys/GHM/pull/238) remains separate from runtime reconciliation. Current branch lockfile resolves Vite 6.4.5, Vitest/@vitest/mocker 4.1.12, esbuild 0.25.12, source-map-js 1.2.2. CI #2208 passed web build, all 23 tests, npm audit (0 vulnerabilities), plus existing backend quality checks. The lockfile was committed by the workflow; the workflow has since been simplified back to read-only permissions and adds explicit dependency-tree verification. Final CI #2210 was queued at the last check. Keep PR Draft/unmerged until #2210 completes and is reviewed. No backend dependency, production, DB, migration, secret, or deployment changes. PostgreSQL 18 listener diagnosis remains paused; owner diagnostics output still awaited.

**Final scheduled dependency-audit validation:** CI run #2210 (`42492162087`) passed both web and existing backend quality jobs. Web build passed, 23/23 tests passed, `npm audit --audit-level=moderate` reported 0 vulnerabilities, and resolved dependency-tree verification passed (Vite 6.4.5, Vitest/@vitest/mocker 4.1.12, esbuild 0.25.12, source-map-js 1.2.2). PR [#238](https://github.com/zaidhqdev-sys/GHM/pull/238) is technically validated and ready for review, but remains Draft/unmerged; no deploy or production change. The workstream is separate from the still-paused PostgreSQL listener diagnosis. Owner's previously requested PowerShell output is the next input for runtime reconciliation.

### Local PostgreSQL instance diagnosis — 2026-11-08

The earlier local password-reset attempt targeted the wrong server because `psql` defaulted to port 5432. Diagnostics establish PostgreSQL 17 listens on 5432 (PID 6696) and PostgreSQL 18, the intended qualification server, listens on 5433 (PID 32144). Both are running. The original PostgreSQL 18 HBA file is restored and SHA256-verified against its backup. Do not edit either HBA file until the next port-explicit test to `127.0.0.1:5433`. Runtime reconciliation remains isolated from scheduled audit PR #238. No production changes.



## Business profile actor-boundary remediation — draft PR #271 (2026-11-10)

A follow-up security review found that `ghm.update_business_profile(p_account_id, p_business_id, p_patch)` is a SECURITY DEFINER function executable by `ghm_runtime` and authorizes using a caller-supplied account ID. The current qualification's nonexistent-account denial case did not test impersonation of another active owner/admin.

Draft PR #271 addresses this by:
- Adding `ghm.gateway_update_business_profile`, guarded by `ghm.assert_actor_gateway`, and granting it only to `ghm_actor_gateway`.
- Revoking PUBLIC and `ghm_runtime` execution on the original profile RPC.
- Verifying the GHM ES256 access token in the Actor Gateway and deriving the actor ID only from the signed token subject.
- Routing all Business profile PATCH writes through the gateway client. The old repository SQL path now fails closed; absent gateway configuration returns 503 rather than falling back.
- Preserving the existing SQL validation and alias/legacy-column compatibility contract.
- Extending disposable PostgreSQL qualification to verify runtime direct-RPC denial, gateway owner success and member denial.

PR #271 is stacked on draft PR #237. Exact-head CI is pending. No production role provisioning, migration, grant change, service deployment, environment change or data mutation occurred. PayFast remains paused pending sandbox access; legal-document work remains parked.
