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


## Local PayFast qualification resume pointer — 2026-11-08

The native Windows PostgreSQL 18 qualification instance is confirmed at `127.0.0.1:5433`, database `ghm_payfast_qualification`. Password authentication was restored and the original `pg_hba.conf` verified restored by SHA256. The existing database is 13 MB and contains 56 `ghm` tables; statistics estimate 92 migration-ledger rows and small reference-data rows, but exact counts/checksums and role grants remain to be audited. PostgreSQL 17 on port 5432 must remain untouched. No migration or qualification script has yet been run in this checkpoint.

Resume from [the detailed 2026-11-08 handover, Section 21](HANDOVER_2026-11-08_INTERNAL_RUNTIME_RECONCILIATION.md) and [the native Windows PayFast qualification procedure](payfast-local-qualification.md). Do not drop/recreate the local database or run migrations until its ledger, role graph and all connection targets have been checked. Render, production and deployment remain outside this local task.

## Local PayFast qualification — exact pre-audit state (2026-11-08)

The native Windows PostgreSQL 18 database ghm_payfast_qualification on 127.0.0.1:5433 has an exact 92-row migration ledger (latest 20261104130000 isolate_payfast_settlement_identity) and exact reference-data counts of 1 country, 1 currency, and 11 opportunity types. ghm_migrator has explicit SET-only membership in NOLOGIN ghm_schema_owner; runtime and payment-provider have no reported path to schema-owner authority. These facts come from a successful read-only inspection and do not establish checksum reconciliation or complete ownership/grants.

Resume at the detailed local PostgreSQL handover, Section 22, and the local PayFast qualification procedure. Next gate is the read-only forensic migration audit explicitly pointed at this local database. No migration, seed, reset, hosted change, or deployment is authorized by this checkpoint.

## Migration-audit execution blocked by missing local npm dependencies — 2026-11-08 15:56 UTC

The operator correctly configured and independently verified the audit connection target (host 127.0.0.1, port 5433, database ghm_payfast_qualification, user ghm_migrator). `npm run audit:migrations` did not connect to PostgreSQL: Node.js v24.18.0 exited during module resolution with `ERR_MODULE_NOT_FOUND` for package `dotenv`, imported by `scripts/forensic-migration-reconciliation.mjs`. Repository `package.json` declares `dotenv` as a production dependency (`^16.4.5`) and `package-lock.json` (lockfileVersion 3) is committed. This is a local dependency-installation issue, not an audit verdict or database failure. Next action: run `npm ci` in the repository root, verify `node -e "console.log(require.resolve('dotenv'))"`, then rerun the audit with the already-verified environment variables. `npm ci` may replace local `node_modules`; it does not run migrations or alter PostgreSQL. No DB changes occurred during the failed invocation. Preserve all prior safety boundaries: no migrate/seed/reset, PostgreSQL 17 port 5432 untouched, no hosted or production changes.


## Local npm dependency installation recovered — 2026-11-08 15:58 UTC

The operator ran `npm ci` successfully in the repository root: 166 packages added, 167 audited, zero vulnerabilities reported. npm warned that the `argon2@0.41.1` install script (`node-gyp-build`) is not approved under the current allowScripts policy and therefore was not run. This is not currently a blocker for the forensic migration audit, which needs `dotenv` and `pg`; do not approve additional install scripts unless a later operation demonstrably requires them. Next: verify `require.resolve('dotenv')`, then rerun the read-only audit using the existing verified local PostgreSQL 18 connection environment. `npm ci` changed local dependency installation only; no database operation was run. All production/hosted and PostgreSQL 17 safety boundaries remain unchanged.


## Forensic audit reached PostgreSQL; local migrator authentication rejected — 2026-11-08 15:59 UTC

After successful `npm ci`, `require.resolve('dotenv')` succeeded and `npm run audit:migrations` advanced to opening its PostgreSQL connection. PostgreSQL rejected authentication for `ghm_migrator` with SQLSTATE 28P01 (password authentication failed). The audit did not reach ledger/checksum reconciliation and produced no PASS/INVESTIGATE verdict. This is an authentication prerequisite, not evidence of schema/checksum failure. Next controlled recovery: as local PostgreSQL 18 administrator on 127.0.0.1:5433 only, reset the local `ghm_migrator` password using psql's `\password ghm_migrator` (avoid exposing the password), then re-enter it securely into the local connection URL and verify authentication before rerunning the read-only audit. Do not alter pg_hba.conf for this; do not touch PostgreSQL 17/5432, hosted services, or production. No migration, seed, or reset was run.


## PostgreSQL 18 local forensic migration audit — 2026-11-08 16:02 UTC

The local `npm run audit:migrations` completed against `ghm_payfast_qualification` on PostgreSQL 18 / port 5433. Authority check PASSED: session/current user began as `ghm_migrator`, the expected database matched, `ghm_migrator` could `SET ROLE ghm_schema_owner`, and the post-switch identity was `current_user=ghm_schema_owner`, `session_user=ghm_migrator`. Audit ran in `BEGIN READ ONLY`. Final verdict: `INVESTIGATE` (not PASS).

Counts: repository migrations 90; live ledger rows 92; canonical matches 80; supported legacy CRLF matches 0; missing repository migrations 8; unexplained checksum mismatches 2; name mismatches 0; extra ledger rows 10; approved retained historical rows 8; unrecognized extras 2; orphaned exceptions 0; redundant provenance exceptions 7; invalid retained-history entries 2.

Eight repository migrations absent from the live ledger: `20261105190000_extend_business_directory_location_contact`; `20261105213000_create_business_capability_evidence`; `20261105220000_replace_business_capability_assertions`; `20261105230000_create_founder_directory_review`; `20261106090000_business_logo_storage_binding`; `20261106200000_link_project_to_opportunity`; `20261107211500_reconcile_business_profile_and_founder_authority`; `20261108140000_reconcile_business_profile_contract`.

Two unexplained checksum mismatches: `20261104120000_bind_commercial_payment_attempt_provider` (repository canonical `3f284b7afb1bc83c42331b0346e2853f448948ad9a2f9e92c162c303fb92d3d8`; live ledger `da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff`) and `20261104130000_isolate_payfast_settlement_identity` (repository canonical `230657b714cc8bfa23e69be9a0c8ff0a4d110b3a7435047e33683a77f3863a22`; live ledger `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f`). Neither has a registered historical checksum. Ten extras include eight verified retained historical rows and two unrecognized rows: `20261020130000_create_quoteflow_migration_business_provisioning` (live checksum differs from registered retained checksum `a453171e...`) and `20261031100000_restrict_identity_authority_reader` (no registered retained-history record). Retained-history audit also flags `20261019210000` as `REPOSITORY_MIGRATION_PRESENT`, so its retention record needs reconciliation. Seven old provenance exception records are redundant because their hashes now match repository bytes; defer cleanup until blockers are understood.

Next action is strictly read-only provenance analysis: establish the local checkout branch/HEAD/worktree state and compute canonical/legacy checksums for all eight missing files plus the two mismatched files; compare local files with known GitHub source branches/history. Do not edit manifests, rewrite ledger checksums, apply pending migrations, run seeds, or reset/recreate the database until the evidence explains every mismatch and extra. No production/hosted database or PostgreSQL 17/5432 was touched; no DDL/data mutation occurred.


## Migration file hash and Git-history reconciliation checkpoint — 2026-11-08 16:13 UTC

The operator confirmed all ten audited migration files exist in the local checkout and supplied full raw SHA-256 hashes. The first two files' raw hashes exactly equal the audit script's computed legacy-CRLF repository hashes:
- `20261104120000_bind_commercial_payment_attempt_provider.sql`: `a7e40f38d3a0cdd59175a7342dc726c5d6f625a51949e9793fa33fd67ab69912`.
- `20261104130000_isolate_payfast_settlement_identity.sql`: `fe2efc4e74667a982d75849fc9e41276bdbd3d9f8b83368166d8afd9914c8260`.

Important distinction: this explains the raw-file-vs-canonical line-ending difference, but it does NOT reconcile either file to its live ledger checksum. The two ledger values remain different (`da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff` and `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f` respectively); they remain genuine ledger provenance discrepancies until the exact applied SQL bytes are identified.

The other eight full raw hashes (for the eight migrations absent from the ledger) were recorded by the operator: `20261105190000` = `f26d93e7955dc212ca370a09894bc15420d7708ef0f28a3edd6de3014721a5f0`; `20261105213000` = `afc5dc4d889cf317aab84c747538b29e9f059a4e2ceece2bc3c125131e7f9813`; `20261105220000` = `d38364b188dad024620089dd83165832ba63aa84fb5237061642ea71e7e3d6c0`; `20261105230000` = `f57fbdd169a666a32d3f8b6a4cddfffca814742d60505019c37a2c78fc6f461b`; `20261106090000` = `f912e53ae8bee108f4b1c9ba138c77e90f576b27e2899c9f4d9d33c8a8abcb43`; `20261106200000` = `bf060b4c28c3c1521ead05dfa51ec4de8b9221f8533a03ff05cb5e0007952fba`; `20261107211500` = `36598ad87e381ee9b2651a0fbe6740ac99f6912a91bcb32780328e3a202b3501`; `20261108140000` = `72cde5b257d86e4698b2d07e5a238288efc540ba85660da8af1a4547cece79aa`.

Read-only `git log --all --follow` confirms all ten files are in local Git history. Notable introducing/modifying commits include: both PayFast migrations together at `e7a51d7` (2026-11-06); directory location/contact migration history `1557c24`, `38e1539`, `0b3362d`, `5f24acc`; capability evidence `452f3df`; capability assertion replacement `724dba9`; founder review lifecycle `39ced6f` plus subsequent fixes; logo binding `49dd7da`; Project-Opportunity link `28e5ca5`; business/founder authority reconciliation `1fe1db1`; business profile contract reconciliation history `cc18518`, `4a071de`, `3c51c66`, `2e452f3`. The local checkout remains branch `fix/business-profile-compat-contract-20261108`, HEAD `d9151d936fa3edcde1bb5a5c050811a37db27166`, clean; do not switch branches during this investigation.

Next read-only step: inspect the exact SQL blobs at relevant introducing and follow-up commits, including the full history for the two PayFast migrations and the missing eight; then compare those versions with ledger checksums and the live catalog. File existence and current raw hashes do not prove application. The audit verdict remains INVESTIGATE. Do not run migrations, edit ledger rows or exception manifests, seed/reset/recreate the DB, or touch PostgreSQL 17/5432, hosted DBs, Render, or production.


## Local PayFast qualification — exact ledger checksum verification (2026-11-08 20:01 UTC)

The local PostgreSQL 18 qualification database `ghm_payfast_qualification` on port `5433` was queried read-only with explicit `SET LOCAL ROLE ghm_schema_owner`. Identity verified as `current_user=ghm_schema_owner` / `session_user=ghm_migrator`; transaction rolled back.

Exact rows:
- `20261104120000 bind_commercial_payment_attempt_provider` — checksum `da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff`; applied `2026-11-04 15:20:57.625187+02`.
- `20261104130000 isolate_payfast_settlement_identity` — checksum `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f`; applied `2026-11-04 15:20:57.629981+02`.

These match the forensic audit's live values and remain unexplained by current repository canonical or legacy-CRLF hashes. The local audit verdict remains INVESTIGATE. Resume with read-only historical Git blob/checksum tracing. No migration, ledger update, manifest edit, seed/reset, production/hosted change, Render action, or PostgreSQL 17/5432 operation is authorized or was performed.


## PayFast local qualification — unresolved historical migration checksums (2026-11-08 22:05 UTC)

The read-only local PostgreSQL 18 forensic audit remains **INVESTIGATE**. Git history tracing correctly followed the rename of `20261104120000_bind_commercial_payment_attempt_provider.sql` back to `20261007120000_create_commercial_payment_result_boundary.sql` and hashed five historical blobs. The second PayFast migration was added as a new file in the same commit and its sole traced blob was hashed. None of these six blobs matches either live ledger checksum, raw or LF-normalized.

Live values remain:
- `20261104120000`: `da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff`.
- `20261104130000`: `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f`.

The discrepancy is not a simple CRLF issue. Search all reachable Git objects/history for the exact live hashes and seek an archived/deployed migration artifact or deployment log before classifying provenance. Keep all migrations and the ledger unchanged; do not run migrations or alter exception manifests. The qualification audit is not PASS and no migration application is authorized. PostgreSQL 17/5432, hosted databases, Render and production remain untouched. Detailed hashes and path history: [internal runtime reconciliation handover](HANDOVER_2026-11-08_INTERNAL_RUNTIME_RECONCILIATION.md) and [local PayFast qualification procedure](payfast-local-qualification.md).

## PayFast local qualification — reachable Git SQL scan still finds no checksum provenance (2026-11-08 22:07 UTC)

A read-only scan checked all 132 unique reachable SQL blobs in the local Git object graph, computing raw and LF-normalized SHA-256. Neither live ledger checksum matched any scanned blob:
- `20261104120000`: `da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff`.
- `20261104130000`: `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f`.

This is broader than the historical filename trace, but applies only to reachable SQL objects present in the local checkout. External/generated migration artifacts, unreachable objects, other workspaces/remotes, and archived CI/deployment artifacts remain possible provenance sources.

Keep the forensic verdict **INVESTIGATE**. Obtain independent migration-runner/deployment/CI/archive evidence for the exact SQL applied at the recorded ledger timestamps, then hash and compare the original bytes. No migration execution, ledger repair, schema mutation, manifest edit, seed/reset, hosted DB or Render change is authorized. PostgreSQL 17/5432 remains untouched.


## PayFast forensic audit — CI blob provenance checkpoint (2026-11-08 22:15 UTC)

A read-only hash comparison against GitHub Actions checkout commit `a1a046d17d04854bfc8259efaa02100b1ae09304` (run [41836364443](https://github.com/zaidhqdev-sys/GHM/actions/runs/41836364443)) found an exact source-blob match for live ledger migration `20261104130000`: CI file SHA-256 `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f`, identical to the live checksum. The CI checkout's first migration blob (`20261104120000`) hashes to `778817028e5377744140b6cec31fccc6fbb84bcf9c47e20c4997b8056ba608b9`, not its live ledger checksum `da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff`.

The CI log confirms migrations ran against a disposable GitHub Actions PostgreSQL service but does not print checksums or prove a connection to the local qualification database. The timestamp proximity is not proof of causation. One checksum's source blob is identified; the other remains unexplained. Overall audit verdict stays **INVESTIGATE**. Do not run migrations, repair ledger rows, alter exception manifests, or touch hosted/production resources or PostgreSQL 17/5432. See the detailed [internal runtime reconciliation handover](HANDOVER_2026-11-08_INTERNAL_RUNTIME_RECONCILIATION.md) and [PayFast local qualification record](payfast-local-qualification.md).


## PayFast forensic audit — both checksum sources identified (2026-11-08 22:20 UTC)

**Correction:** both PayFast live ledger checksums now match exact versioned SQL files at implementation commit `a1a046d17d04854bfc8259efaa02100b1ae09304` (PR #206; CI [41836364443](https://github.com/zaidhqdev-sys/GHM/actions/runs/41836364443)). `20261104120000_bind_commercial_payment_attempt_provider.sql` hashes to `da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff`; `20261104130000_isolate_payfast_settlement_identity.sql` hashes to `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f`. Both exactly equal their live ledger values. The earlier first-file comparison mistakenly hashed the distinct old-path `20261007120000_create_commercial_payment_result_boundary.sql`, which is not the file corresponding to ledger version `20261104120000`.

The migration runner at that commit derives ledger version from the filename prefix and computes SHA-256 over source SQL with line-ending normalization. PR #206 records a separate local `npm run migrate` on `127.0.0.1:5433/ghm_payfast_qualification` (92 rows); the CI run used disposable PostgreSQL and is not the source of the local database. The PR record is maintainer-reported, while the exact file hashes are independently reproducible from GitHub source.

The earlier 132-object scan used `git rev-list --objects --all` and did not necessarily include the separately fetched commit held only in `FETCH_HEAD`; its scope was narrower than all fetched Git objects. The two PayFast checksum-source discrepancies are now explained at the historical-file level. Overall forensic audit remains **INVESTIGATE** due eight missing repository migrations, two unrecognized extra ledger rows and retained-history validation findings. Do not alter the ledger or exception manifest, execute migrations, or change hosted/production resources or PostgreSQL 17/5432. See the detailed internal runtime reconciliation handover and PayFast local qualification record for exact blob identifiers and evidence.

## Local PayFast forensic audit — provenance follow-up (2026-11-08 22:31 UTC)

The local PostgreSQL 18 audit remains **INVESTIGATE**. New read-only GitHub/local history checks found no reachable local Git path history or GitHub commit history for `20261031100000_restrict_identity_authority_reader`; its live checksum `a6692f473f05647aa8b829a1b9263f69376f2e647b124a013543d8ec7d9186bf` remains without identified source SQL. The current `20261019210000_create_business_registration_identity.sql` was introduced by commit `e6b396399f41cd6bc6d87044ab99fd32e99cd46e`, but its bytes differ from the retained applied historical source/checksum (`7681736389b13c82a81f7a6419826204ef584676` / `4115cd79560e7ac7f11cae52734970a5ab9f0ba5100c34ceb2df5fe467327324`). QuoteFlow restoration commit `5229b37700f2e21ac4caf2d4c5547bb929ab2de8` changes two verification-status literals, but exact full-file match to live checksum `3c09cc7ecb8f566f0d359832ad91cc7b644570220236713c02a0763a0521345b` is not yet verified; registry checksum `a453171e...` differs. Keep all three provenance findings open. No DB/ledger/migration/manifest/hosted/deployment changes were made. Details: [internal runtime reconciliation handover](HANDOVER_2026-11-08_INTERNAL_RUNTIME_RECONCILIATION.md) and [local PayFast qualification](payfast-local-qualification.md).

## Local PayFast forensic audit — QuoteFlow source checksum resolved (2026-11-08 22:35 UTC)

The live checksum for `20261020130000_create_quoteflow_migration_business_provisioning` is now exactly matched to historical SQL at parent commit `7fb1bbe07fc64ede652ae589ab72bdc96f23d906` (blob `21731433c2a998fff8d86d628d3589f8768dd618`, SHA-256 `3c09cc7ecb8f566f0d359832ad91cc7b644570220236713c02a0763a0521345b`). Commit `5229b37700f2e21ac4caf2d4c5547bb929ab2de8` changed `unverified` to `pending`; its hash `a453171e85f6717476258c6d2d59a39b663be89826316036e6b9891cadfb13e9` is what the retained-history registry currently records, but it does not match the live ledger. The additive `20261020140000` migration confirms the original applied migration was already present and the accepted status vocabulary was `unverified`. Thus applied-byte provenance is identified, while the registry record is invalid and needs a separately reviewed correction. Do not edit migration, ledger, or registry during this forensic pass. Audit remains **INVESTIGATE** due other open blockers, including the unexplained `20261031100000` extra and `20261019210000` retained-history mismatch. No DB or hosted changes were made.

## Local PayFast forensic audit — identity-authority source matched (2026-11-08 22:37 UTC)

Live migration `20261031100000_restrict_identity_authority_reader` is now matched to exact SQL on branch `reconciliation/ghm-identity-mainline-restored-20261031`: blob `e34dd0700885b182c79b1f09f2af5d94281849c2`, SHA-256 `a6692f473f05647aa8b829a1b9263f69376f2e647b124a013543d8ec7d9186bf`, exactly equal to the live ledger. Introducing commit `d166df2df9fe4a3e00da50935f118ef5322d05ae` (2026-10-31 22:56:50 UTC) adds the six-line restriction revoking `ghm_runtime` execution on the identity-authority reader. Earlier searches covered main/default history and local reachable refs, not all remote branches; the restored reconciliation branch contains the exact source. Source provenance is resolved, but registry has no record, so audit classification remains unrecognized until separately reviewed.

The `20261019210000` same-version file is a later Nov 5 addition (`e6b396399f41cd6bc6d87044ab99fd32e99cd46e`, blob `c1c3e4d9b4148376109177cf3106aa3519e15df6`) and differs from retained applied historical source/checksum (`7681736389b13c82a81f7a6419826204ef584676` / `4115cd79560e7ac7f11cae52734970a5ab9f0ba5100c34ceb2df5fe467327324`). QuoteFlow `20261020130000` live bytes match parent `7fb1bbe...` SHA-256 `3c09cc7...`, not registry's later `pending` checksum `a453171e...`. These metadata discrepancies and remaining missing migrations keep audit **INVESTIGATE**. No database, migration, registry, exception manifest, hosted resource, or deployment was changed.

## 2026-11-08 22:42 UTC — Business-registration migration version collision

`20261019210000_create_business_registration_identity.sql` was reintroduced on main by `e6b396399f41cd6bc6d87044ab99fd32e99cd46e` (2026-11-05), with current blob `c1c3e4d9b4148376109177cf3106aa3519e15df6`. The current SQL includes two later `b.is_active = true` guards added in `01eae6c7a0fe939873ffbfe714d8268fb730488d` (2026-10-19); the live ledger/retained-history checksum remains `4115cd79560e7ac7f11cae52734970a5ab9f0ba5100c34ceb2df5fe467327324` (historical blob recorded as `7681736389b13c82a81f7a6419826204ef584676`). This is a same-version/different-bytes collision, not a cleanly retained historical migration.

`config/historical-migration-provenance-exceptions.json` has no entry for `20261019210000`. `src/db/migrate.ts` will refuse the local already-applied version because the live checksum differs from the current repository checksum and no exact exception is registered. Thus `npm run migrate` against the observed local DB is expected to stop with `Migration checksum mismatch`; do not run it. Preferred remediation is to assign the later SQL revision a new unused migration version and keep the historical applied version represented as provenance, subject to reviewed history and migration ordering. No files or database were changed. Audit remains **INVESTIGATE**.

## 15. Clarification of migration audit `missing_count` — 2026-11-08 22:44 UTC

Correction to prior handover shorthand: the forensic script's `missing` array means **repository migration files whose versions do not exist in the live database ledger** (pending/unapplied repository migrations). It does not mean migration files are missing from the repository. The eight versions listed in the local audit are repository-present and ledger-absent. Seven of those files are present on main: `20261105190000_extend_business_directory_location_contact`, `20261105213000_create_business_capability_evidence`, `20261105220000_replace_business_capability_assertions`, `20261105230000_create_founder_directory_review`, `20261106090000_business_logo_storage_binding`, `20261106200000_link_project_to_opportunity`, and `20261107211500_reconcile_business_profile_and_founder_authority`. The eighth, `20261108140000_reconcile_business_profile_contract`, exists on `fix/business-profile-compat-contract-20261108` but is not present on main. Several of the SQL files explicitly state construction-only/no production migration or cutover authorization; their presence and ledger-absent status do not authorize execution. Treat this metric as eight pending repository migrations, not eight missing source files. This correction does not change the audit verdict or permit migration execution. The independent `20261019210000` same-version checksum collision still blocks the current migration runner on the observed local database; its runner transaction would roll back on error. No database or migration source was changed.

## 16. Migration provenance remediation implementation staged — 2026-11-09

A draft code PR is now open for review: [PR #239 — Reconcile historical migration provenance and business identity version collision](https://github.com/zaidhqdev-sys/GHM/pull/239), branch `fix/migration-provenance-reconciliation-20261109`.

Changes on the draft branch:
- Retires the later Business registration SQL body from the already-applied historical version `20261019210000`, leaving its exact applied checksum in retained-history metadata.
- Reintroduces the table contract and active-Business authorization functions in new forward migration `20261108150000_reconcile_business_registration_identity_authorization.sql`. It uses `CREATE TABLE IF NOT EXISTS`, validates the expected seven columns/types and four declaration constraints for an existing table, verifies RLS, restores owner/revokes, and replaces the read/update functions.
- Updates the static migration contract test to point at the new version.
- Corrects QuoteFlow `20261020130000` retained checksum to live-applied `3c09cc7...` and source blob `21731433...`; adds identity-authority `20261031100000` checksum `a6692f47...` with exact commit/blob provenance.
- Does not alter `config/historical-migration-provenance-exceptions.json`.

PR #239 is draft and must not be merged or applied yet. At this checkpoint Cloudflare Pages check passed and GitHub Actions `quality` was still running on head `e1e53bbc02603d075bdf9406e29dc6e83c9c104e` (after the documentation status update). Required evidence still outstanding: exact-head CI success, disposable PostgreSQL 18 empty-install qualification, seeded historical-table qualification including data/owner/RLS/ACL preservation, and a fresh read-only audit of the local qualification database. The complete pending migration set also requires release-readiness review.

No database or ledger was changed; no migration command was run; no production/Render resource or deployment was touched. This implementation is repository-only and remains a draft for review.

## 17. Migration provenance PR #239 exact-head qualification — 2026-11-09

The implementation PR has now passed its full exact-head GitHub Actions quality run before a subsequent documentation-only appendix commit:
- Qualifying implementation head: `77dca310ad4945b28ef919805a3a47797043e2de`.
- GitHub Actions quality run #2222 (`42532985591`): **success**.
- Cloudflare Pages check on that head: **success** (preview build only).
- Build and full disposable PostgreSQL 18 migration application passed.
- Added CI qualification resets both registration identity functions to the exact historical pre-active-Business definitions from commit parent `5944e594813a1c13c90ca2df0be5b4d808565c32`, then executes the new forward migration with the table already present. It asserts both functions contain `b.is_active = true`, RLS enabled, owner `ghm_schema_owner`, runtime direct table SELECT denied, and runtime function execution granted. The transaction is rolled back after the assertions.
- CI log: `PASS: historical functions were upgraded on the pre-existing table; authorization, RLS, owner, and ACL checks passed; transaction rolled back.`
- Full test suite, commercial payment qualification, migration audit policy tests, and runtime boundary verification all passed.

PR #239 remains draft and unmerged. The later appendix-only update on the PR branch triggers another CI run; confirm that exact final head's checks before any readiness change. The owner-local read-only audit still has to be rerun after branch checkout, and the complete pending migration set needs review. No database/ledger or hosted resource was changed; no migration was run against the owner's local or production database.

## 18. PR #239 final-head CI recheck — 2026-11-09

The documentation-only appendix commit on the migration remediation PR has also passed exact-head CI:
- PR #239 final head: `8ba633bbf690cddbc6d3a2b281a36fcf32c6d7ab`.
- GitHub Actions quality run #2223 (`42533143356`): success.
- Cloudflare Pages check: success (preview build only).
- The qualifying implementation code head remains `77dca310ad4945b28ef919805a3a47797043e2de`; its full CI run #2222 also passed, including disposable PostgreSQL 18 fresh migration, historical function fixture upgrade on an existing table, full test suite, commercial-payment DB qualification, migration audit policy tests, and runtime boundary verification.
- CI log from the historical-table upgrade step: `PASS: historical functions were upgraded on the pre-existing table; authorization, RLS, owner, and ACL checks passed; transaction rolled back.`

PR #239 remains draft and unmerged. The only outstanding validation not covered by CI is a fresh read-only audit against the owner's qualified local database after checking out the branch, plus owner review of all pending migrations. No local/production database, ledger, Render service, or deployment was touched.

## 19. Pending migration source review blockers — 2026-11-09

Review of the eight post-2026-11-04 pending migrations found concrete release blockers; source review only, not runtime exploitation proof:
- `20261105190000_extend_business_directory_location_contact.sql` validates `avatar_letter`, `avatar_color`, and `years_in_business` patch keys but omits all three from the final `UPDATE ghm.business SET`, so those accepted fields are not persisted. Because this migration may have been applied elsewhere, do not silently rewrite it; determine environment application status and use a forward correction if needed.
- `20261105213000_create_business_capability_evidence.sql` grants table-wide direct `SELECT` to `ghm_runtime` while defining a `visibility` field, but this migration does not enable RLS or define tenant/visibility-filtered read access. Define intended visibility and Business membership policy, then replace broad read access with tested bounded access.
- `20261105230000_create_founder_directory_review.sql` intentionally leaves the founder reviewer allowlist empty; a separately approved reviewer mapping is still required before the workflow can operate.
- Logo storage binding is touched by both `20261106090000` and `20261107211500`; qualify fresh and partially reconciled states in timestamp order.
- `20261106200000` adds nullable Project→Opportunity linkage; verify app transaction behavior and legacy paths.

The remediation proposal on PR #239 now records these findings. PR remains draft. Do not merge or run migrations until these blockers are addressed, full tests pass, the local read-only audit is rerun, and the pending migration set is reviewed. No owner-local/production database or ledger was changed.

## 20. Profile patch forward fix and evidence-read review refinement — 2026-11-09

The release review identified that migration `20261105190000` accepted/validated `avatar_letter`, `avatar_color`, and `years_in_business` but omitted their assignments from the `UPDATE`. A forward-only correction is now staged in PR #239 as `20261109100000_persist_business_profile_presentation_fields.sql`; the earlier migration remains unchanged. The profile migration contract test now asserts all three assignments in the forward migration.

The capability evidence finding is refined: normal application reads are tenant-scoped because `listForBusiness` calls `withTenantTransaction` (active Business membership checked by `resolveTenantContext`) and filters on the requested Business ID. Therefore the source review does **not** establish cross-tenant exposure through the normal route. Defense-in-depth/product-contract gaps remain: `ghm_runtime` has table-wide SQL SELECT, table RLS is not enabled, and the `visibility` field is not used by the current list query or a public/authenticated discovery path. Define intended visibility behavior and decide on DB-level isolation before broadening reads.

Project creation source review confirmed Opportunity, participant, and Project inserts occur in one authorized transaction. Founder reviewer allowlist remains intentionally empty pending separately approved mapping. PR #239 remains draft; the new forward profile migration and test require exact-head CI/PG18 validation, and local read-only audit remains outstanding. No persistent database was touched.

## 21. PR #239 updated exact-head qualification — 2026-11-09

Current PR head `00a4e4239db6c9a0f6181ef7efa7300f1091d980` passed GitHub Actions quality run #2224 (`42533697225`) and Cloudflare Pages preview check. Quality steps passed: build; complete migration application on disposable PostgreSQL 18; historical Business registration function upgrade on an existing table with active-Business, RLS, owner, and ACL assertions; full test suite including the new avatar/tenure forward-migration contract; commercial payment settlement qualification; migration audit policy tests; runtime boundary verification. Cloudflare check is preview-only, not production deployment.

The profile-field persistence gap is addressed in new forward migration `20261109100000_persist_business_profile_presentation_fields.sql`; earlier migration bytes are unchanged. Capability evidence note was refined: normal application listing verifies active Business membership and filters by Business ID, so there is no demonstrated cross-tenant exposure through the normal route; broad runtime SQL SELECT/no RLS and unused visibility semantics remain defense-in-depth/product-contract gaps. Project create path was confirmed to insert Opportunity, participant, and Project in one authorized transaction.

PR #239 remains draft. Outstanding: owner's local read-only migration audit against this branch and human review of the full pending migration set. No persistent database/ledger or hosted resource was changed.

## 22. Owner-local read-only audit and PayFast checksum registration — 2026-11-09

Owner checked out PR #239 head `00a4e4239db6c9a0f6181ef7efa7300f1091d980` and ran `npm run audit:migrations` against `ghm_payfast_qualification`. Authority passed: expected database, read-only transaction, `session_user=ghm_migrator`, and post-`SET ROLE` `current_user=ghm_schema_owner`. Results before the PayFast registry follow-up: repository 90, ledger 92, canonical matches 79, missing repository migrations 9, unexplained mismatches 2 (the two PayFast versions), extra ledger rows 11, verified retained-history rows 11, unrecognized extras 0, invalid retained history 0, name mismatches 0, verdict INVESTIGATE. The nine missing rows are pending repository migrations, including the newly staged forward profile correction; they are not evidence of ledger loss.

The two remaining checksum mismatches were independently matched to exact SQL source bytes at commit `a1a046d17d04854bfc8259efaa02100b1ae09304`: `20261104120000` SHA-256 `da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff`, and `20261104130000` SHA-256 `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f`. PR #239 now registers those exact values in `config/historical-migration-provenance-exceptions.json` and adds a regression test pinning both entries. This is explicit per-version provenance, not a wildcard/relaxed checksum bypass. Exact-head CI and a second local read-only audit are required to confirm the resulting classification; until then overall verdict remains INVESTIGATE.

No database mutation or migration execution occurred.

## 23. Final owner-local read-only audit on PR #239 head — 2026-11-09

Owner checked out PR head `53b4664d33e8919d20006b90bae02a302b473edc` and reran `npm run audit:migrations` against `ghm_payfast_qualification`. Authority passed and the transaction was read-only; `session_user=ghm_migrator`, with `current_user=ghm_schema_owner` after explicit role switch. Results: repository_count 90; live_ledger_count 92; canonical_match_count 79; approved_historical_match_count 2; missing_count 9; unexplained_mismatch_count 0; name_mismatch_count 0; extra_count 11; approved_retained_historical_count 11; unrecognized_extra_count 0; invalid_retained_history_count 0; orphaned_exception_count 0; redundant_exception_count 7; verdict `INVESTIGATE`.

Both PayFast rows now classify as exact approved historical matches: `20261104120000` and `20261104130000`. All 11 extra ledger rows are verified retained history; no unexplained checksum mismatch, unrecognized extra, invalid retained-history entry, or name mismatch remains. The nine `missing` items are repository migrations not yet applied to this November 4 qualification database, including the forward-only Business registration authorization and profile presentation corrections; this is an unapplied-migration backlog, not a ledger-integrity failure. Do not apply them merely to force a clean audit. Review and qualify them in dependency order before any migration execution.

Exact PR head `53b4664d33e8919d20006b90bae02a302b473edc` passed GitHub Actions quality run #2226 (`42534193065`) and Cloudflare Pages preview. PR #239 remains draft. No local persistent database mutation or migration execution occurred.

## 24. Pending-migration code review findings and forward corrections — 2026-11-09

A migration-by-migration review of the nine repository migrations pending in the owner's November 4 qualification database identified two top-level transaction-boundary hazards: `20261106090000_business_logo_storage_binding.sql` and `20261107211500_reconcile_business_profile_and_founder_authority.sql` contained `BEGIN/COMMIT` even though `src/db/migrate.ts` already wraps every migration in a transaction. Their top-level transaction statements have been removed; function-body `BEGIN` blocks remain. A regression test now checks all pending migration files and confirms the runner owns BEGIN/COMMIT/ROLLBACK.

The evidence transition function also previously marked the parent Business Capability `rejected` after rejecting one evidence item even when other evidence items for that assertion remained pending. New forward migration `20261109110000_reconcile_capability_evidence_pending_state.sql` recalculates both unexpired verified and pending evidence, restores parent `pending` with verifier metadata cleared while any evidence remains pending, and locks the parent assertion before aggregation to serialize concurrent evidence decisions. Static contract tests cover this behavior and preserve admin/self-verification checks.

Outstanding design/data decisions from the review: evidence `expires_on` has no scheduled expiry worker/transition, so an assertion may remain marked verified after supporting evidence expires; decide whether to add expiry processing or enforce expiry at public projection. Evidence table grants `ghm_runtime` table-wide SELECT without RLS; normal application reads are tenant-scoped, but `visibility` is not enforced by the current list path. Founder reviewer allowlist remains empty; reviewer listing exposes private registration number/legal name to allowlisted reviewers, so the reviewer role must be explicitly authorized for that data. Project-to-Opportunity relation is nullable and no backfill is included; owner must confirm whether historical Project rows exist and require linking.

PR #239 remains draft. New forward migration and transaction fixes require exact-head CI and another owner-local read-only audit. No persistent database was changed.
