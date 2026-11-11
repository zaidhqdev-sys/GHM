# GHM Current State — Authoritative Documentation Reconciliation

**Status:** CURRENT / AUTHORITATIVE DOCUMENTATION INDEX — mainline reconciliation baseline 2026-10-13; Actor Gateway consolidation is under review in unmerged PR #272 (2026-11-11).
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


## Core release-readiness handover — 2026-11-10

The active engineering handover is [HANDOVER_2026-11-10_CORE_RELEASE_READINESS.md](HANDOVER_2026-11-10_CORE_RELEASE_READINESS.md). It records the verified main/runtime baseline, founder scope decisions, the shared token-issuer/database actor-authentication prerequisite, affected PR gates, merge/deployment policy, and the next non-deferred work sequence.

Owner scope decisions recorded 2026-11-10: pause all PayFast work until working sandbox access is restored; defer approved legal-document/QuoteFlow legal-acceptance work until core systems are running smoothly and the owner resumes it. Existing implementation and historical evidence are preserved. Neither item is a current workstream or release prerequisite.


## Release queue checkpoint — 2026-11-10 19:52 UTC

- PR #253 merged as `8bb3a764275703d26be93385854290d5672995e3`; exact-head quality, web-quality and Cloudflare Pages checks passed.
- PR #254 merged as `c5238f3d45d05009e2b28d5fa38ebd8ee61a0a33`; exact-head quality, web-quality and Cloudflare Pages checks passed. It adds the source/DDL actor-auth surface inventory at [GHM_ACTOR_AUTH_SURFACE_INVENTORY_2026-11-10.md](security/GHM_ACTOR_AUTH_SURFACE_INVENTORY_2026-11-10.md).
- PR #236 was closed as superseded, not merged. A fresh comparison against main showed only two remaining changed files, both stale handover documents; its substantive code/migration changes are already present on main. Its remaining documentation incorrectly said Render auto-deploy was enabled, while the verified live service setting is disabled.
- The shared actor-authentication blocker now explicitly includes #244's direct engagement-event INSERT attribution surface as well as the SECURITY DEFINER RPCs and auth/session mutation functions. See the inventory and draft architecture proposal PR #251.
- No production migration/query/write, role/grant/secret change, new service provisioning, or runtime deployment was performed in this checkpoint.


## ADR-001 approval and first implementation slice — 2026-11-10 20:03 UTC

- Owner approved the isolated GHM authentication issuer + separately credentialed typed database actor gateway architecture on 2026-11-10.
- ADR-001 and implementation/qualification plan merged through PR #256 at `d40fd88d34e4d6f8242b5b6e1485c2498a1fd7b9`. The approval covers isolated implementation and disposable qualification only. It does not authorize production credentials, grants, migrations, service provisioning or deployment.
- First implementation slice is PR #257: public-key-only ES256 access-token verification and public-only key loading. It preserves ES256, `iss=ghm-auth`, `aud=ghm-api`, `kid`, 900-second lifetime, opaque refresh contract, and does not expose private signing material to the verifier. CI is pending at checkpoint.
- Exact DB actor-context proof mechanism remains a design spike; plain caller-writable GUC/temp-table/account-ID argument is prohibited. Must test the actual `ghm_runtime` login, gateway login, issuer login, replay, transaction pooling, rollback, cancellation and connection reuse on disposable PostgreSQL.
- PR #251 remains draft/reference material and links to ADR-001; it is no longer the undecided architecture source.
- No production DB access/mutation, grant, credential, service provisioning, Render configuration or runtime deployment was performed.


## Actor gateway principal guard and public-only JWT verifier — 2026-11-10 20:16 UTC

- PR #257 merged as `e49beff5d87e708906c2077219c839dc7ee9914a`: public-key-only ES256 verifier and public-only key loader. The signer now emits the intended `iat` claim (the previous `noTimestamp: true` option removed it); legacy no-`iat` access tokens remain accepted only within the 900-second lifetime plus 60-second skew window. Full quality, web-quality and Cloudflare Pages passed.
- PR #259 merged as `a2da35a6c8f2ffc8e0c8b48728b36c8bc3c7b940`: additive `ghm.assert_actor_gateway(bigint)` primitive and disposable PostgreSQL principal qualification. Full quality, web-quality and Cloudflare Pages passed, including the full migration chain, the new gateway principal test, full unit/integration test suite, migration audit and runtime boundary verification.
- Chosen DB trust mechanism for the first implementation: dedicated `ghm_actor_gateway` LOGIN NOINHERIT principal with no role memberships or elevated attributes; protected SECURITY DEFINER operations verify `session_user='ghm_actor_gateway'` via the helper. The gateway independently verifies ES256 bearer JWTs and derives the actor ID from `sub`; it passes that ID only through a closed typed operation map. No caller-writable GUC, temp table or DB-side JWT crypto is used. A compromise of the gateway process/credential is within the trusted gateway threat boundary and must be mitigated by service isolation, network restrictions, credential custody/rotation, and audit.
- The new migration is additive and not yet wired into feature RPCs; it does not revoke any current `ghm_runtime` privileges. The new role must be provisioned out-of-band before applying the migration; migration fails closed if absent/unsafe. No production role, credential, grant or migration action has occurred.
- Next: build isolated gateway service and typed operation registry; migrate one representative read RPC; add DB-side `assert_actor_gateway` checks to actor-sensitive functions and direct engagement-event write path; then adversarially qualify spoof/positive cases before any runtime privilege transition.


## Actor gateway first vertical slice merged — 2026-11-10 20:23 UTC

- PR #261 merged as `1250ec141b540d59eecd80eb2e6a57e02b2bc633`.
- Added separate `src/actor-gateway/server.ts` entrypoint, public-only ES256 verifier, isolated `GHM_ACTOR_GATEWAY_DATABASE_URL`, typed `GET /v1/actor/me` operation, and Postgres reader calling only `ghm.gateway_get_actor_identity(bigint)` inside a transaction.
- SQL function invokes `ghm.assert_actor_gateway`, returns only the verified actor's own active identity, and grants EXECUTE only to `ghm_actor_gateway`; no generic SQL/RPC endpoint or caller-selected account ID exists.
- CI passed exact head across quality, web-quality and Cloudflare Pages. Quality included complete disposable migration chain, gateway role/function qualification, HTTP app tests, full suite, migration audit and runtime boundary checks.
- This is a self-read proof slice only. Existing resource API still retains current auth signing and existing runtime DB privileges; issuer isolation and migration of feature RPCs remain unfinished. No Render service, production environment variable, credential, role, grant or deployment was changed.
- Next: route one existing actor-sensitive low-risk feature operation through the gateway and make its DB function require `assert_actor_gateway`; then expand to all inventoried RPCs and engagement-event writes. Only after full caller migration should production privilege changes be planned separately.


## Resource API → Actor Gateway registration read integration (PR #265) — 2026-11-10

- PR #265 adds an HTTPS-only typed HTTP client from the existing resource API to the isolated Actor Gateway registration identity read.
- When optional `GHM_ACTOR_GATEWAY_URL` is configured, the existing GET route forwards the original bearer access token to the gateway. The resource API continues its existing authentication and operation authorization; the gateway independently verifies the token and rechecks actor/business membership.
- Gateway errors fail closed (404 for access denial/not-found, 503 for unavailable/invalid gateway responses); no legacy database fallback occurs in gateway mode. When the variable is absent, current legacy behavior remains for controlled rollout.
- Added tests for original token forwarding, no legacy call in gateway mode, gateway outage without fallback, HTTPS-only origin, typed response validation and config validation; included gateway-client tests in the full suite.
- PR #265 is open and CI is pending at this handover update. No production gateway URL, service, credential, environment variable, role, grant, migration execution or deployment has been changed.
- Do not configure production until the separate gateway service is deployed with gateway-only DB credentials and public ES256 verification keys, and end-to-end HTTP/database qualification passes. Do not revoke legacy runtime read grant until the API is demonstrably using the gateway in the approved deployment sequence.
- Next: exact-head CI, then extend disposable PostgreSQL qualification through the HTTP boundary and plan the separately approved Render gateway service setup. Registration writes and other feature RPCs remain un-migrated.


## Business registration identity write gateway slice (PR #266) — 2026-11-10

- PR #266 adds `ghm.gateway_update_business_registration_identity(bigint,bigint,text,text,text)`, guarded by `ghm.assert_actor_gateway` and EXECUTE granted only to `ghm_actor_gateway`.
- Adds typed gateway PUT route and Postgres writer. Actor ID is derived only from the verified JWT subject; only the three declared registration fields are accepted.
- Resource API gateway client now supports PUT and forwards the original bearer token. With `GHM_ACTOR_GATEWAY_URL` configured, existing registration GET and PUT both route through gateway. With URL unset, legacy path remains for controlled rollout. Gateway-mode errors fail closed without fallback.
- Disposable PostgreSQL qualification is extended for successful update, disabled actor denial, cross-business write denial and ordinary runtime cannot execute gateway write. HTTP tests cover actor binding, malformed payload and membership denial; API tests cover token pass-through and no legacy fallback.
- PR #266 open; exact-head CI pending. No production URL, credentials, Render service, database role/grant change, migration execution or deployment has occurred. Legacy `ghm_runtime` write EXECUTE remains until separately reviewed post-rollout cutover.
- Next: exact-head CI; then complete end-to-end gateway/API deployment plan. Issuer isolation and remaining feature RPCs remain separate milestones.


PR #266 qualification note: the first disposable PostgreSQL run exposed an ambiguous output-column reference in the new write wrapper. The wrapper now explicitly qualifies each returned column through the delegated function alias; the exact-head CI run must be repeated before merge. This was caught before any production migration or deployment.


PR #266 qualification correction: follow-up logs pinpointed the ambiguity inside the pre-existing `ghm.update_business_registration_identity` implementation (`ON CONFLICT (business_id)` conflicts with its RETURNS TABLE output variable), not the gateway wrapper. The additive migration now replaces that function using the named `business_registration_identity_pkey` constraint, preserves its existing `ghm_runtime` EXECUTE grant, and keeps the gateway-only wrapper grant isolated. This fix and the positive/negative write qualification must pass on the final exact head before merge.


## Registration identity gateway GET + PUT merged — 2026-11-10

- PR #266 merged as `a2c734348c3132396121c74d232eafb2794541d1`.
- Gateway-only registration identity read and write operations are now both exposed as typed HTTP endpoints. The resource API's existing GET and PUT route can use the gateway when `GHM_ACTOR_GATEWAY_URL` is configured, forwarding the original bearer token and failing closed without legacy fallback.
- The new write wrapper checks `ghm.assert_actor_gateway`, delegates to the membership-checked update function, and grants EXECUTE only to `ghm_actor_gateway`. The additive migration also fixes the pre-existing upsert ambiguity by using the named `business_registration_identity_pkey` conflict constraint; the original `ghm_runtime` EXECUTE grant is preserved pending cutover.
- Exact-head CI passed quality, web-quality and Cloudflare Pages. Quality included build, full test suite, full disposable migration chain, gateway principal qualification, positive/negative gateway write/read tests, migration audit and runtime boundary verification.
- No production URL, Render gateway service, credentials, role/grant cutover or deployment changed. The legacy runtime write grant remains until gateway deployment and end-to-end verification are separately completed.
- Next: provision isolated gateway service only after dedicated gateway DB credentials and public ES256 verification keys are securely available; deploy gateway before setting resource API URL; verify end-to-end GET/PUT and only then plan legacy grant revocation separately. Continue actor-bound migration for other RPCs.

## Unified Actor Gateway security integration — 2026-11-11

Draft integration PR #272 consolidates the capability governance stack (#250/#268/#269), supplier-classification stack (#243/#270), and Business profile stack (#237/#271). It now preserves the latest main-branch Actor Gateway foundation, including registration identity read/write and HTTP routing through the gateway client, while wiring capability governance, supplier classification and Business profile readers into the same gateway process.

The migration chain includes the dedicated gateway principal and identity/registration wrappers, capability governance wrappers, supplier-classification cutover, Business profile compatibility reconciliation at 20261110265000, and Business profile gateway cutover at 20261110270000. The compatibility reconciliation is deliberately ordered after 20261109100000 because that earlier presentation migration replaced the legacy profile function and dropped category/supplier/alias compatibility.

The main-base reconciled branch passed exact-head CI run #42919101125 on commit 48cde68566196903b44655c71dc5e2a800e5fc17: build, all migrations, full tests, actor-gateway-principal qualification, capability/supplier/profile PostgreSQL authorization qualifications, registration identity qualification, migration audit, runtime boundary verification, web-quality and Cloudflare Pages.

Capability governance remains staged: its original three SECURITY DEFINER RPCs still grant EXECUTE to ghm_runtime. Do not revoke those grants until the Actor Gateway is deployed/configured and capability routes are verified. A separate capability cutover migration with direct runtime-denial tests remains required.

No production migrations, grant/role changes, Render service/environment changes, deployments, data mutations or catalogue activation occurred. PayFast remains paused; legal-document work remains parked. See [HANDOVER_2026-11-10_ACTOR_GATEWAY_INTEGRATION.md](HANDOVER_2026-11-10_ACTOR_GATEWAY_INTEGRATION.md).

## Capability legacy-RPC cutover qualification added
A separate disposable-only qualification now applies `database/cutovers/20261111010000_revoke_legacy_capability_governance_runtime.sql` using the schema-owner role, then verifies direct legacy RPC calls are denied to both `ghm_runtime` and `ghm_actor_gateway`, runtime cannot execute gateway wrappers, and the isolated gateway can still list and create capabilities through gateway wrappers. It is wired as `npm run qualify:capability-governance-cutover` in CI after the pre-cutover capability qualification. The script refuses to run unless the qualification database is `ghm_disposable_test` on `localhost`. This is test-only application; the cutover file remains outside the migration directory and is not production-applied.

Latest exact-head checkpoint: unified Actor Gateway branch commit `fbee5509ea197d277e9d2fbc9d997bb61a6c66d9` passed GitHub Actions run #42923701476 (`quality` and `web-quality`). The disposable-only capability cutover qualification passed direct runtime/gateway legacy create/update/transition denials and positive gateway list/create/update/transition checks. No production cutover was applied. Full details: `HANDOVER_2026-11-10_ACTOR_GATEWAY_INTEGRATION.md`.

2026-11-11: Capability administration is now fail-closed when `GHM_ACTOR_GATEWAY_URL` is missing. Admin list/create/update/transition routes return 503 and never invoke the legacy CapabilityService; regression tests cover all four operations. Latest exact-head CI is pending. See `HANDOVER_2026-11-10_ACTOR_GATEWAY_INTEGRATION.md`.

## 2026-11-11 database-verifiable capability actor assertions
A review of `20261110210000_add_actor_gateway_principal_guard.sql` and the existing disposable qualification exposed a genuine trust gap: `ghm.assert_actor_gateway(bigint)` proved only that the SQL session used the isolated gateway login and that the supplied account was active. It did not prove that the account ID came from the ES256-verified JWT. A direct holder of the gateway DB credential could therefore claim another active account (subject to feature authorization).

A forward-only migration, `20261111020000_bind_capability_gateway_actor_to_signed_assertion.sql`, now introduces a capability-specific HMAC assertion boundary:
- The gateway signs a short-lived assertion over actor ID, exact capability operation, issue time and one-use nonce using a dedicated 32-byte secret.
- PostgreSQL verifies HMAC-SHA256, a 60-second time window, active account status, and one-use nonce replay protection.
- The HMAC secret table is owned by `ghm_schema_owner` and revoked from PUBLIC, runtime, gateway and migrator roles; the isolated gateway login cannot read the signing key.
- Capability list/create/update/transition wrappers each bind the signed assertion to their own operation. Old unsigned gateway wrapper signatures are dropped.
- The Actor Gateway process now requires `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET`; the reader creates unique signed assertions for each operation.
- Disposable PostgreSQL qualification provisions only its test key and tests valid admin access, non-admin denial, forged-signature denial, replay denial and cross-operation assertion denial.

The signing key must be independently generated and provisioned to the gateway secret store and the protected database secret table through a controlled owner-only process. Never commit or reuse the CI test key. This change currently hardens **capability governance wrappers only**; the other gateway feature wrappers still need an equivalent independent database assertion review before their own production cutovers.

The new migration and qualification passed exact-head CI run #42934869090 on commit `637d29219dfbfc910f5c2dcf8db0713c3d28c929`; both quality and web-quality passed. No production migration, secret provisioning, role/grant change, Render service/environment change or deployment has occurred. The CI key is disposable-test-only.

## Signed capability actor assertion exact-head CI result
The first signed-assertion implementation passed exact-head GitHub Actions run #42934869090 on commit `637d29219dfbfc910f5c2dcf8db0713c3d28c929`. Both `quality` and `web-quality` passed. The disposable PostgreSQL qualification explicitly passed forged-HMAC denial, replay denial, cross-operation assertion denial, valid admin list/create/update/transition, non-admin denial, and the existing manual legacy RPC cutover denial/gateway-positive checks. Full migration chain, build, complete test suite, supplier classification, Business profile, commercial settlement, migration audit and runtime boundary also passed. The CI signing key is test-only and publicly defined for disposable qualification; it is not a production secret.

The CI result covers capability governance assertions only. The current gateway database assertion model for supplier classification, Business profile and registration identity has not yet been upgraded to the same database-verifiable actor proof. Their own production legacy access cutovers remain blocked pending equivalent analysis and qualification. No production key was generated or provisioned, no production migration/role/grant change was applied, and no Render service/environment or deployment was changed.

## Supplier classification actor assertion hardening — 2026-11-11
The supplier classification wrapper had the same database trust gap as capability governance: it checked the gateway login and accepted a caller-supplied active actor ID. A new forward-only migration `20261111030000_bind_supplier_gateway_actor_to_signed_assertion.sql` reuses the protected 32-byte HMAC key and one-use nonce store, binds the assertion to `supplier.classification.update`, replaces the unsigned wrapper signature, and denies runtime/migrator/public execution. The gateway reader signs the verified JWT subject for every supplier update. Disposable PostgreSQL qualification provisions the test key, verifies the runtime cannot execute the new wrapper, rejects forged signatures, and preserves owner/member authorization tests. Exact-head CI for this supplier extension is pending. The secret remains test-only in CI; no production secret, database migration, Render environment or deployment has been changed.


## Signed supplier actor assertion exact-head CI result
The supplier signed-assertion extension passed exact-head GitHub Actions run #42935773452 on commit `37b8d5527d9338bd239177e453d740e8ab968619`. Both `quality` and `web-quality` passed. The full disposable PostgreSQL migration chain, TypeScript build, complete test suite, capability signed-assertion qualification, capability legacy cutover qualification, supplier classification qualification (including the new signed wrapper and forged-signature denial), Business profile qualification, commercial settlement qualification, migration audit and runtime boundary verification all passed. No production secret was generated/provisioned; no production migration, grant/role change, Render environment/service change or deployment occurred.

The remaining gateway wrappers for Business profile, registration identity and actor self-identity still use the earlier gateway-login-plus-caller-ID assertion and need the same independent database proof review before those paths can be considered closed for production. Do not apply their legacy access cutovers until that work and deployment verification are complete.

## Business profile actor assertion hardening — 2026-11-11
Business profile updates had the same caller-supplied actor gap. New forward-only migration `20261111040000_bind_business_profile_gateway_actor_to_signed_assertion.sql` binds the database wrapper to `business.profile.update` using the protected HMAC secret, 60-second validity and one-use nonce verifier. The gateway reader signs the verified JWT subject; the unsigned wrapper signature is removed. Disposable qualification provisions only the CI test key, checks runtime execute denial, forged assertion denial, and preserves legacy field/alias compatibility and membership authorization coverage. Exact-head CI is pending. Registration identity and actor self-identity still use the older assertion and remain open security gates. No production secret or infrastructure change has been made.

## Registration identity and actor self-read assertion hardening — 2026-11-11
The Business registration identity GET/PUT wrappers and actor self-identity wrapper also relied on the gateway login plus caller-supplied actor ID. A new forward-only migration `20261111050000_bind_registration_and_self_identity_to_signed_gateway_actor.sql` replaces all three unsigned wrapper signatures. Each now requires a one-use HMAC assertion bound to its exact operation (`business.registration.read`, `business.registration.update`, `actor.identity.read`). The readers sign only the account ID derived from the verified ES256 JWT. The disposable actor-gateway principal qualification now provisions the CI-only key, checks valid self/read/write and cross-business/disabled-actor denials, forged self-read assertion denial and runtime EXECUTE denial. Exact-head CI is pending. This is not a production key or production migration.

## Unified signed actor assertion exact-head validation — 2026-11-11
The final unified database-verifiable actor assertion implementation passed exact-head GitHub Actions run #42937910774 on commit `d53f3dbda81a30d0c865586763b09da77d68f354`. Both `quality` and `web-quality` passed. The disposable migration chain and full test suite passed. PostgreSQL qualifications passed for:
- Capability list/create/update/transition: valid admin assertions; forged signature, replay, cross-operation and non-admin denials; legacy cutover runtime/gateway denials and gateway wrapper positives.
- Supplier classification: valid owner update, member denial, invalid value denial, runtime direct/wrapper denial and forged signature denial.
- Business profile: runtime direct/wrapper denial, forged assertion denial, current snake_case and historical camelCase compatibility, alias/coordinate validation and member authorization.
- Actor self-identity and Business registration identity GET/PUT: valid operations, forged assertion denial, disabled actor and cross-business denials, runtime wrapper execution denial.
- Migration audit and runtime boundary checks.

All gateway feature wrappers now use a one-use HMAC-SHA256 assertion bound to the exact operation, account ID, issue time and nonce. PostgreSQL verifies the signature using a protected 32-byte secret unavailable to `ghm_actor_gateway`, enforces a 60-second window, active actor, and replay prevention. The gateway signs only the actor ID obtained from its verified ES256 token. A qualification bug caused by PostgreSQL evaluating a composite-returning function multiple times through `(function()).*` was corrected by selecting from the function in `FROM`, so each signed mutation consumes exactly one assertion.

This is still **disposable qualification only**. No production signing key was generated/provisioned, no production migration or grant/role change occurred, no Render service/environment was changed, and no deployment or production cutover was performed. Production readiness still requires secret custody/rotation design, dedicated gateway service and private networking, deployment, end-to-end checks, and separately authorized legacy grant cutovers. PR #272 remains open and unmerged.

## Current Actor Gateway integration and production-readiness status — 2026-11-11

This section supersedes earlier dated Actor Gateway progress notes below wherever they describe pending CI, incomplete signed assertions, optional production gateway fallback, or an older PR/draft state. Those entries remain historical checkpoints, not current instructions.

- **Current integration:** [PR #272 — Unified Actor Gateway](https://github.com/zaidhqdev-sys/GHM/pull/272), branch `integration/capability-gateway-qualification-20261110`, is open, ready for review (not draft), unmerged, and based on `main`. It consolidates the capability-governance stack (#250/#268/#269), supplier-classification stack (#243/#270), Business-profile stack (#237/#271), and the already-merged registration identity foundation. The stacked predecessor PRs remain open/unmerged; do not merge them independently while #272 is the consolidated candidate.
- **Latest exact-head validation:** branch head `3f0602a59b3ef1e0af485156c22994159d970c26` passed both `quality` and `web-quality` in [GitHub Actions run #43057033042](https://github.com/zaidhqdev-sys/GHM/actions/runs/43057033042). The run includes build, complete tests, disposable PostgreSQL migration and authorization qualifications, gateway principal qualification, and web quality. This is CI/disposable qualification, not production qualification.
- **Signed actor assertions:** all current gateway feature wrappers (capability governance, supplier classification, Business profile, registration identity, and actor self-identity) require one-use HMAC-SHA256 assertions bound to account ID, exact operation, issue time, and nonce. The gateway signs only the actor ID obtained from its ES256-verified GHM access token. The protected database secret remains unprovisioned in production; CI keys are disposable only.
- **Fail-closed routing:** capability administration, supplier classification, Business profile writes, and Business registration identity GET/PUT use the Actor Gateway boundary. In production, missing gateway configuration must fail closed; registration identity has an explicit non-overridable production requirement. Do not restore a legacy direct-database fallback.
- **Critical live database blocker:** read-only inspection found broad CREATEROLE/ADMIN OPTION authority associated with the effective production application role and a PostgreSQL 18 automatic postgres-granted ADMIN membership on `ghm_actor_gateway`. Keep migration guards strict. Render human support has been contacted and the response is pending; no production role/grant change is authorized or performed.
- **Backup protection:** no 10 November pre-role-change recovery point has been verified. The only identified Render backup and readable local archive are dated 4 November; neither is an adequate recovery point for subsequent work. Do not perform production role, privilege, migration, or deployment changes until a fresh current backup is obtained and its integrity/recoverability is verified.
- **Cost constraint:** no paid Render services, upgrades, or recurring infrastructure spend until product revenue can fund them. If free-tier hosting cannot meet security and availability requirements, keep production rollout blocked rather than weakening controls.
- **Production status:** no Actor Gateway service deployment, production HMAC secret provisioning, production migration, manual legacy grant cutover, or PR merge has occurred. Existing legacy access grants remain untouched pending a proven gateway path and separate authorization.

The detailed operational evidence, support escalation, backup warning, and next-step sequence are maintained in [HANDOVER_2026-11-11_ACTOR_GATEWAY_PRODUCTION_READINESS.md](./HANDOVER_2026-11-11_ACTOR_GATEWAY_PRODUCTION_READINESS.md). This PR branch is not yet mainline authority; the above records the current candidate and must not be read as proof that production is migrated.


## 2026-11-11 — v2 request-context-bound Actor Gateway assertions

This section supersedes the earlier dated notes above that describe the database assertion as binding only the actor ID, operation, issue time and nonce. That was the previous design; it is no longer the current PR candidate.

The source review identified that an otherwise valid, unused one-use assertion could be presented with a different business ID, capability ID or payload because the HMAC did not include those arguments. The wrapper's own authorization checks still applied, but the signed proof was not tied to the exact request. This was corrected in forward-only migration `20261111060000_bind_gateway_assertions_to_request_context.sql` and the matching gateway readers:

- Assertions now use version `ghm-actor-gateway:v2` and sign actor ID, exact operation, issue time, nonce, and the UTF-8 bytes of a serialized request-context object.
- Each database wrapper recomputes the expected JSONB context from its actual SQL arguments and rejects a mismatch before performing the operation. This binds capability IDs and draft/transition fields, supplier business ID and boolean, Business profile business ID and full patch, registration business ID and all registration fields, and the empty context for self-identity/list operations.
- The database verifier enforces an explicit nine-operation allowlist, rejects a null operation, caps context size at 32 KiB, retains the 60-second validity window, checks the full 32-byte HMAC before branching, and retains one-use nonce replay protection.
- The gateway readers create the assertion context and pass it with the signature in the same database transaction. The serialized context is signed exactly as sent; PostgreSQL's JSONB comparison verifies semantic equality with the actual arguments.
- The Business profile database wrapper now rejects both `isSupplier` and `is_supplier`. Supplier classification can only use its dedicated signed operation, not the profile wrapper.
- Disposable qualifications now explicitly attempt capability argument substitution, registration target substitution, registration payload substitution, profile patch substitution, and supplier boolean substitution. Those mismatches must fail with SQLSTATE 42501 before the mutation.
- The actor-principal, capability catalogue, legacy capability cutover, supplier-classification and Business profile qualification scripts have all been updated to call the v2 signatures. The CI qualification does not retain old wrapper signatures as a compatibility escape hatch.

**Validation:** exact code head `5a846df7f8d107eb1c2c99654b11c344bd7ed06a` passed both `quality` and `web-quality` in [GitHub Actions run #43065388570](https://github.com/zaidhqdev-sys/GHM/actions/runs/43065388570). This run applied the complete migration chain to disposable PostgreSQL 18, built the project, passed the full test suite, gateway-principal qualification, capability catalogue qualification, disposable legacy cutover qualification, supplier classification qualification, Business profile qualification, commercial settlement qualification, migration audit and runtime boundary verification.

**Scope and remaining blockers:** this is repository code and disposable CI only. No production migration, HMAC secret provisioning, role/grant change, Render service/environment change, deployment, or manual legacy grant cutover has occurred. The live production role model remains blocked on Render's response. No verified 10 November backup exists; the 4 November recovery point is stale and must not be used as a rollback point for later work. No paid infrastructure is permitted until revenue can fund it. PR #272 remains open and unmerged.


## 2026-11-11 — nonce retention boundary and HMAC rotation review

A further review found that the nonce row expiry had been calculated as `issued_at + 60 seconds`, while the verifier accepts assertions within a 60-second clock-skew window. Near the end of that acceptance window, cleanup could therefore consider a nonce expired before the assertion itself was fully outside the accepted window. The nonce expiry is now calculated as `GREATEST(clock_timestamp(), to_timestamp(issued_at)) + interval '60 seconds'`, so the nonce remains stored for at least 60 seconds after first acceptance, including for assertions whose issue time is near the edge of the accepted past/future window.

- Applied the corrected retention expression in all four ordered migrations that define the v1 assertion verifier and in the final v2 request-context migration. This keeps intermediate migration states safe if a later migration fails.
- Added an index on `ghm.actor_gateway_capability_assertion_nonce(expires_at)` so expiry cleanup does not require a full table scan as request volume grows.
- Added migration-contract checks across all four earlier definitions and the final v2 definition.
- Extended the disposable actor-gateway qualification: it signs an assertion with an issue time 30 seconds in the past, executes it, and verifies the nonce remains stored for more than 58 seconds from the time of the check. This distinguishes the corrected retention from the old issue-time-based expiry.

**Validation:** current code head `7213dcc280da652d8913944136e3b312fb7e0638` passed both `quality` and `web-quality` in [GitHub Actions run #43067027027](https://github.com/zaidhqdev-sys/GHM/actions/runs/43067027027). The run applied the complete PostgreSQL 18 migration chain, passed the full test suite and all actor-gateway, capability, supplier, Business profile, registration, cutover and runtime-boundary qualifications.

### HMAC assertion-key rotation limitation

The current HMAC verifier uses one protected singleton secret row and one gateway environment secret; unlike the ES256 verifier, it has no key ID or previous-key overlap. A rotation is therefore currently a coordinated maintenance-window operation: stop the gateway, update the protected database secret and gateway environment secret as a matched pair, restart, then verify the signed path before restoring traffic. Do not rotate one side while the gateway is serving requests. Before production provisioning, the rotation and rollback procedure must be documented and the previous secret held in approved secure custody; alternatively, add key IDs and dual-key verification before production if no-downtime rotation is required. No production HMAC secret has been generated or provisioned, so this is a design gate, not a live outage.

No production migration, role/grant change, secret provisioning, Render service/environment change, deployment, or manual legacy cutover occurred. PR #272 remains open and unmerged. The production database privilege issue and missing fresh backup remain blockers; no paid infrastructure is permitted until revenue can fund it.


## Actor Gateway request-context substitution qualification — 2026-11-11

The v2 signed request-context implementation is present in migration `20261111060000_bind_gateway_assertions_to_request_context.sql`. Its database wrappers compare signed context against actual SQL arguments. The disposable qualification scripts have been extended with independent negative cases for capability update target and payload substitution, capability lifecycle target and transition-payload substitution, supplier Business-ID substitution, and Business-profile Business-ID substitution. Existing capability-create, supplier-boolean, and profile-patch substitution checks remain.

These newly added negative cases are pending exact-head CI and must not be described as passed until the full disposable PostgreSQL qualification and both CI jobs succeed on the latest PR head. Production remains blocked on Render's supported role-model resolution and a fresh verified backup; the 4 November backup is not a valid pre-change recovery point for the 10 November role work. PR #272 remains open and unmerged. No production state or paid infrastructure was changed.


## Actor Gateway request-context substitution qualification — exact-head pass (2026-11-11)

Exact PR head `b7f3f2f2d8a9d18a023af86bf7a88f7e40016c6d` passed GitHub Actions run #2862 (`43071811499`): both `quality` and `web-quality` succeeded. The disposable PostgreSQL qualification included the new capability update target/payload, capability lifecycle target/status, supplier Business-ID, and Business profile Business-ID substitution negative tests, alongside the existing creation-payload, supplier-boolean, and profile-patch substitution cases. Full build, migrations, test suite, capability governance/lifecycle, supplier, Business profile, payment settlement, migration policy, and runtime-boundary checks passed.

This is bounded evidence for the exercised code and disposable database fixtures, not a declaration of overall production readiness. PR #272 remains open and unmerged. Render role-model resolution and a fresh verified backup remain production blockers; the 4 November backup is not a valid pre-change recovery point for the 10 November role work. No production state or paid infrastructure was changed.


## Actor Gateway qualification extension — registration update target substitution (2026-11-11, CI pending)

The disposable actor-gateway principal qualification now also signs a Business registration update for one fixture Business and attempts to invoke it against a second fixture Business ID. The expected result is SQLSTATE `42501`. Existing registration read target-transplant and registration update payload-substitution cases remain. This new negative case is pending exact-head CI and is not yet reported as passing. No production state or paid infrastructure was changed.


## Actor Gateway registration update target substitution — exact-head pass (2026-11-11)

The new registration update target-substitution negative case passed on exact PR head `cd591533b5130b560c58ffefc268fe416bbfa59c`, GitHub Actions run #2870 (`43074793542`). Both `quality` and `web-quality` succeeded. The disposable actor-gateway principal qualification rejected an update assertion signed for one Business when invoked with a second Business ID (SQLSTATE `42501`). Existing registration read target-transplant and update payload-substitution cases also passed.

This is evidence for the tested path, not a blanket production-readiness claim. PR #272 remains open and unmerged. Production role-model resolution from Render and a fresh verified backup remain blockers. No production state or paid infrastructure was changed.


## 2026-11-11 — Cloudflare Pages pull-request preview status

The Cloudflare Pages integration has reported a successful **pull-request preview deployment** for commit `29d95abb600fbaa341fd0e08c17dd7bbd2e91fd7`, preview URL: https://16db3a85.ghm-cu1.pages.dev. This is a PR preview, not evidence of a production-domain deployment or production traffic cutover. The preview is an externally hosted build generated by the repository's Cloudflare Pages integration; distinguish it from Render Actor Gateway service deployment and from a production release.

At this check, PR #272 remained open and unmerged. Exact-head GitHub Actions run #2873 (`43075067314`) was still in progress: `web-quality` had passed and `quality` was progressing through disposable PostgreSQL qualifications. No production migration, role/grant change, secret provisioning, Render service change, or paid infrastructure was introduced.


## Actor Gateway registration legacy RPC cutover — added, CI pending (2026-11-11)

Read-only source review found that `ghm.read_business_registration_identity` and `ghm.update_business_registration_identity` remained executable by `ghm_runtime` despite the new signed gateway wrappers. The production HTTP route fails closed, but direct database EXECUTE would remain a bypass for a compromised runtime process.

Added manual cutover `database/cutovers/20261111020000_revoke_legacy_registration_identity_runtime.sql` to revoke direct legacy function execution from PUBLIC, runtime, migrator and gateway roles while preserving gateway wrapper execution as `ghm_actor_gateway`. Disposable qualification now applies the cutover and checks that runtime direct calls are denied while signed gateway calls remain functional. The migration-contract test guards the cutover contents.

New cutover qualification is pending exact-head CI. The SQL is manual-only and has not been applied to production. Production remains blocked on Render role-model resolution and a fresh verified backup. No production state or paid infrastructure changed.


## Registration legacy RPC cutover — exact-head qualification passed (2026-11-11)

Exact code/test head `9f69d17ef362cc01e45fe151609101893104747a` passed GitHub Actions run #2891 (`43076550978`), with both `quality` and `web-quality` successful. The disposable Actor Gateway principal qualification applied `database/cutovers/20261111020000_revoke_legacy_registration_identity_runtime.sql`, denied direct legacy registration read/write execution to `ghm_runtime`, and confirmed signed gateway registration read/write still worked. Full build, migrations, test suite, all other PostgreSQL qualifications, migration policy and runtime-boundary checks passed.

Cloudflare Pages reported a successful PR preview for this commit at https://7d9a60be.ghm-cu1.pages.dev. Preview only; no production release. PR #272 remains open and unmerged. The manual cutover has not been applied to production. Render role-model resolution and a fresh verified backup remain release blockers. No production state or paid infrastructure changed.


## 2026-11-11 — follow-on legacy RPC actor-binding gaps remain open

At the time of this source audit, three remaining SECURITY DEFINER functions were executable by `ghm_runtime` and trusted a caller-supplied actor/verifier ID:
- `ghm.replace_business_capability_assertions(bigint,bigint,jsonb)`
- `ghm.transition_business_capability_verification(bigint,text,text,bigint,text)`
- `ghm.transition_business_capability_evidence(bigint,text,bigint,text)`

Their membership/admin/self-verification rules are meaningful, but do not cryptographically prove that the supplied ID is the authenticated caller if the runtime database credential is compromised. Existing HTTP routes do check the verified JWT context and service role; direct database EXECUTE bypasses those checks. Evidence submission's direct runtime INSERT with `submitted_by=context.userId` was a separate path identified in that same audit; it is now included in the signed gateway implementation and manual cutover qualified below. Founder directory review remains deliberately disabled and its runtime review EXECUTE grants are revoked.

Remediation required signed gateway operations, bearer-token forwarding from existing routes, fail-closed clients, exact-context assertions, disposable PostgreSQL negative tests and a manual-only privilege cutover. That implementation and its exact-head disposable qualification are now complete; the earlier statement that no implementation existed is superseded by the status below. The manual-only cutover remains unapplied in production. See `docs/HANDOVER_2026-11-11_ACTOR_GATEWAY_PRODUCTION_READINESS.md` for full details. Production remains untouched; Render role-model resolution and a fresh verified backup remain release blockers.


## 2026-11-11 — Business Capability mutation Actor Gateway qualification passed

Latest qualification head `ccb194905d320602c476e54808ce1985b901f39d` passed GitHub Actions run #3013 (`43087190865`) with both `quality` and `web-quality` successful.

The branch now implements signed gateway wrappers and authenticated Actor Gateway routes for Business Capability assertion replacement, administrator verification, evidence review and evidence submission. The gateway derives actor/verifier/submitted_by identity from the verified JWT actor and binds the full operation payload to the v2 HMAC assertion context. Evidence DTOs are returned by the SECURITY DEFINER gateway wrappers; the Actor Gateway database principal does not need direct evidence-table SELECT.

The exact-head checks passed:
- TypeScript build, full migration application and complete test suite.
- Resource API tests for bearer-token forwarding to all four signed gateway operations, role checks and fail-closed behavior when the gateway is required but unavailable.
- Disposable PostgreSQL manual cutover qualification: runtime cannot execute the legacy mutation RPCs or any of the four new signed gateway wrapper functions, insert evidence rows directly, or access the evidence sequence.
- Signed gateway replacement, administrator verification, evidence submission and administrator evidence review remain successful after the cutover.
- Payload/target substitution, replay, non-management membership, non-admin verification and non-admin evidence review denials.
- Actor provenance, evidence DTO compatibility and post-cutover role privilege matrix.
- Migration audit policy and runtime boundary verification.

The disposable qualification applies `database/cutovers/20261111030000_revoke_legacy_business_capability_runtime_mutations.sql` only to the CI disposable database. It has not been applied to production.

Production remains untouched. PR #272 remains open and unmerged. Render role-model support and a fresh verified production backup remain release blockers. No paid infrastructure was introduced.


## 2026-11-11 — broader migration security inventory in progress

A full recursive repository-tree inventory was started on PR #272. At audited source head `ee753ba8c6cb4a48c3ff1d46c1fe9fde6eaadbf2`, the tree contained 115 SQL migration files. A first-pass scan across the full migration directory identified additional actor-ID SECURITY DEFINER candidates outside the already qualified Actor Gateway batch: Business Hours replacement, Saved Business create/delete, Campaign create/update and Trust Score calculation. Their current application repositories pass the authenticated `AuthContext.userId`, but the legacy SQL functions accept that ID as a caller-supplied argument and still require effective ACL/cutover reconciliation.

The scan also identified direct runtime SELECT/INSERT/UPDATE grants on `ghm.account_onboarding_progress`; its current repository derives account_id from AuthContext, but the database ACL does not enforce per-account ownership. Storage deletion's SECURITY DEFINER persistence function is currently called only after actor-scoped metadata retrieval and application authorization; all callers and the direct-runtime threat model still need reconciliation. Auth lifecycle functions are also under review; preserve login, registration, refresh and recovery flows while tracing server-only call paths.

Detailed evidence and next steps are recorded in `docs/HANDOVER_2026-11-11_FULL_MIGRATION_SECURITY_AUDIT.md`. This is a first-pass inventory, not a completed audit or proof of effective final ACLs. No production changes or manual cutovers were performed. PR #272 remains open and unmerged; the handover update is on its branch. Earlier CI results are not assumed to qualify the new documentation head. Production still requires Render role-model resolution and a fresh independently verified backup. PayFast and approved legal-document work remain parked.
