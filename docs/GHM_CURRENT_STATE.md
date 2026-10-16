# GHM Current State — Authoritative Documentation Reconciliation

**Status:** CURRENT CONSTRUCTION-STATE INDEX — PR #135 status corrections and follow-up audit recorded through 2026-10-16; repository-wide semantic reconciliation is not yet certified
**Repository authority:** consolidated `main`
**Reconciliation history:** the PR #125 baseline (`01bd40dabe0b0f02bb30d2f78267a0414d3d8356`) was followed by PR #126 (`aef8ecdeee241d31827f6fc42730f9a61f1ddea4`), PR #127 (`6afb428d452012d9860ca50c2b0066f0768b184c`), PR #128 (`671c41be0b2446dd5c56c709c4aa3cb2e15e7d81`), PR #129 (`9af7901b0baecbdc4b307f3a0a93e1643f006ca6`), PR #130 (`14c805cfd749ed50493523972fdd0a7c359bbfce`), and PR #131 (`eb94a2aa7b3500d48b3e05d677d6fc385928ef4d`), merged on 2026-10-13. GHM PR #133 subsequently merged the Connect migration handover into `main` as `20b120c7d6ecf7a86f9dc4f7a8dc61f9dee4d8dc`. PR #135 is the open documentation correction for stale status/resume claims identified after PR #133; it is not yet merged. These SHAs identify historical documentation milestones, not live pointers to deployed Render code or database state. The earlier `1f2b10d0850095311614c5b5f9531eb8b7cce860` checksum-normalization commit is historical provenance. Pre-merge checkpoint language retained below is historical only.

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

GHM contains historical/provenance and migration-boundary work for QuoteFlow. Existing legacy identity/data migration remains evidence-gated. The earlier attestation verifier and persistence-free identity-link flow are historical/superseded. The dual-confirmation authority note is migration-ceremony provenance only, not permanent runtime identity authority. For **QuoteFlow legacy migration only**, the current migration authority is the GHM account-onboarding/migration boundary and its exact `(provider=supabase, sourceSubject)` provenance mapping, not a separate permanent identity-link table. This QuoteFlow-specific source mapping is migration provenance; it does **not** define ZAID Connect's target runtime identity provider. Connect's approved target uses GHM-native identity/session semantics, removes active Supabase runtime dependencies, and must not accept the legacy provider/subject pair as runtime authentication authority. GHM construction must not infer remote storage or data ownership solely from the presence of Supabase client code.

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

This is a historical pre-merge checkpoint for PR #130. It is not evidence that the branch had merged at the time or that deployed/runtime state changed. PR #130 subsequently merged as recorded above. The review covered the current-state index, governed remaining-work register, qualification sequence, Issue #1 roll-up, authentication parameter gate, Connect readiness records, QuoteFlow migration/identity contracts, shared-platform boundary audit, and dated September handovers.

- Dated handover instructions and old “current state” headings are explicitly scoped to their historical checkpoints; they do not override the living status index or current founder-agreed merge gates.
- Authentication roll-ups now list the actual unresolved parameter decisions and distinguish bounded implementation authorization from explicit Founder approval.
- QuoteFlow account identity/account provisioning is distinguished from the still-unqualified organization-to-Business and membership provisioning, reset/re-enrollment ceremony, product-session migration, and cutover.
- Connect readiness totals are labeled historical audit counts. PayFast local checkout/ITN/server-confirmation qualification is distinct from real sandbox/runtime qualification and production enablement; PayFast is not conflated with PayStack.
- Issue #1 remains open until all acceptance criteria are reconciled and independently closed. Product workflow parity, recovery/rollback, operational acceptance, shadow qualification, and production cutover remain gated.

This paragraph records the historical documentation PR that merged into `main` as `14c805cfd749ed50493523972fdd0a7c359bbfce`; it is not a status statement about current migration PR #133. That earlier PR changed Markdown under `docs/` only and did not authorize code, migration, credential, deployment, database, routing, or cutover changes. The Connect migration handover documentation was merged into `main` in GHM PR #133 as `20b120c7d6ecf7a86f9dc4f7a8dc61f9dee4d8dc`. This documentation merge records the migration audit and does not authorize implementation, production changes, or cutover.



## Current documentation reconciliation gate — 2026-10-14

GHM PR #135 is the open documentation-only correction for stale status and resume instructions found after PR #133. Its current changed-file set and head must be rechecked from GitHub; historical SHA/checkpoint statements elsewhere in this file are not live pointers. The Connect migration gap register now carries an explicit review checkpoint, but that does not certify the entire documentation corpus.

Current product-readiness blockers remain unchanged: Connect's identity adapter is still Supabase-provider-bound; a browser-safe GHM user-token API or secure BFF is not qualified; active journey/API parity is incomplete; and real PayFast sandbox/runtime end-to-end qualification, production credentials/enablement, rollback/recovery, and founder-authorized cutover remain open. PayFast approval and PayStack status are separate.

Treat `GHM_CONNECT_PRODUCTION_READINESS_GAP_REGISTER.md` as the governed product gap record, `CONNECT_BACKEND_OPERATION_INVENTORY.md` and `GHM_CONNECT_BACKEND_READINESS_AUDIT.md` as historical source-evidence snapshots, this file as the GHM construction-state index, and the dated migration handover as the durable resume record. No implementation, merge, provider activation, production migration, shadow qualification, or cutover is authorized by this note.

## Current Connect backend migration authority — 2026-10-13

The Connect migration handover is the durable product-specific resume point: `docs/architecture/CONNECT_GHM_MIGRATION_HANDOVER_2026-10-13.md`. Read it together with `docs/architecture/GHM_CONNECT_PRODUCTION_READINESS_GAP_REGISTER.md`, `docs/architecture/CONNECT_BACKEND_OPERATION_INVENTORY.md`, and the per-capability contracts. The operation-level migration overlay records Connect caller evidence, provisional reuse/extend/build/legacy classification, and acceptance gates.

Do not infer Connect readiness from the existence of a GHM resource or from the previously qualified narrow identity, directory, storage or payment slices. Current blockers include the Supabase-only Connect identity provider binding, browser-safe authenticated transport, broader active Connect contract parity, missing HTTP exposure for storage/business-hours mutation, and active product journeys not yet represented by GHM APIs. Keep all payment and AI activation gates unchanged. This audit is documentation-only; no implementation, merge or cutover is authorized by it.

## Identity-provider provenance versus runtime authority — explicit reconciliation, 2026-10-13

The existing `(provider, subject) → ghm.account_identity.id` mapping foundation and QuoteFlow migration-provenance records are bounded identity/migration capabilities, **not a declaration that Supabase remains a valid provider in the target Connect runtime**. In particular, `(provider=supabase, sourceSubject)` may be retained as historical source provenance needed to reconcile already-migrated legacy records; it must not be used as the target Connect session issuer, ongoing authentication dependency, or requirement for normal Connect API calls.

For the Connect no-Supabase migration, the target caller identity must be established by GHM-native authentication/session credentials, then resolve the active canonical GHM account and current membership/resource permissions. The currently qualified Connect identity adapter and authorization-binding slice still require `provider=supabase` and therefore are **not target-runtime qualified**. This is a known gap, not a contradiction to hide: preserve their narrow historical qualification evidence, but do not reuse their Supabase-provider assumption as the final product identity contract. No existing identity or migration record authorizes bootstrap, automatic account linking, or production cutover.


## 2026-10-15 PR-scope and backlog authority correction

The governed remaining-work register and production-readiness gap register now contain the actionable missing-capability backlog cross-check. It is a planning index, not authorization: every still-open item must be traced to a current source caller, authoritative contract, dependencies, acceptance tests and qualification evidence. Existing qualified resource slices remain closed unless distinct new evidence changes their scope.

At the 2026-10-15 checkpoint, PR #135's diff contained 13 documentation files, including supporting trust-boundary, service HTTP, authorization-binding, identity-bridge, provisioning/linking, trusted-request-context and product-consumer qualification records. A stale six-file scope statement in the remaining-work register was corrected on 2026-10-15. Follow-up documentation additions brought the current GitHub PR metadata to 14 changed files as of 2026-10-16; that current count is a scope fact only and does not claim that the changed files or full corpus are reconciled.

Repository-wide reconciliation remains open. On the current audit pass, the GHM review tree was enumerated at 210 tracked Markdown files and Connect at 47; relative Markdown file-target checks found zero missing targets in both trees. Batch-local heading/explicit-anchor checks found no missing anchors within any batch (GHM 14 batches; Connect 3 batches), but cross-batch anchors and all reference-style, HTML/autolink forms and external URL liveness are not yet certified. Remaining closeout work is semantic/status/authority/owner/history review, cross-repository source-caller-to-GHM-contract reconciliation, and the outstanding link forms. Do not merge PR #135 or PR #36 until all GHM documentation is reconciled and the founder explicitly authorizes merge.

## Current implementation and release gates — 2026-10-16 20:40Z

This is a dated overlay on consolidated mainline, not a claim that open construction PRs are deployed. Read live PR metadata and exact-head CI before acting.

- **GHM #136 — business-hours HTTP replacement:** latest head `8f11cb32271c88f54f0bc2011e7dcd74685eedcc` passed run [38971913370](https://github.com/zaidhqdev-sys/GHM/actions/runs/38971913370): build and disposable PostgreSQL 18 migrations passed; **564 passed / 0 failed / 0 skipped / 0 TODO**; runtime-boundary verification passed. This branch now shares #138's checksum-preserving BOM handling and production TLS guard. Non-production caller/mapping E2E remains open.
- **GHM #137 — authenticated canonical identity and mapped-business membership guard:** latest head `6ed28a2cd9ffc0a49eefb281793bb4382a427a76` passed run [38971853527](https://github.com/zaidhqdev-sys/GHM/actions/runs/38971853527): build and disposable PostgreSQL 18 migrations passed; **592 passed / 0 failed / 0 skipped / 0 TODO**; runtime-boundary verification passed. It contains the guard and regression tests consolidated from closed PR #134 and now shares #138's migration runner with production fail-closed TLS. Endpoint and migrations are not confirmed deployed; browser-session E2E and real canonical mapping evidence remain open.
- **GHM #138 — bounded trusted-proxy hops and canonical CI qualification:** consolidated head `3d08b0667775c2f589b90f02bbae8ea7ced9f8e9` passed run [38970659762](https://github.com/zaidhqdev-sys/GHM/actions/runs/38970659762): build and all migrations passed on disposable PostgreSQL 18; **563 passed / 0 failed / 0 skipped / 0 TODO**; runtime-boundary verification passed. This branch also contains the migration-loader BOM handling previously carried by #139; #139 is closed as superseded, not merged. Render still deploys main at `20b120c7d6ecf7a86f9dc4f7a8dc61f9dee4d8dc`; proxy-hop topology and deployed client-IP/rate-limit behavior remain unverified.
- **Connect #39 — GHM auth/identity adapter:** head d7da4cbf5960c049f6bbb6a0efe2d9d2a1b9c40b passed configured contract CI run 38958913312, 50/50, zero failures/skips/TODO, and web build passed. This is not deployed browser E2E and does not establish removal of remaining Supabase auth/PostgREST/RPC/Storage dependencies.
- **Documentation reconciliation:** GHM #135 and Connect #36 remain open/unmerged. The previous 210 GHM / 47 Connect Markdown enumeration and relative file-target pass are useful partial evidence only; reference-style links, cross-batch anchors, external link liveness and complete semantic/status/authority/history/owner/cross-repository reconciliation are still open.

No listed PR is thereby approved to merge or deploy. Production database mutation, production deployment, payment activation and product cutover remain frozen pending exact runtime/mapping evidence, full documentation reconciliation and explicit founder authorization.

## Exact-head CI result for documentation branch — 2026-10-16 20:55Z

CI run [38963881139](https://github.com/zaidhqdev-sys/GHM/actions/runs/38963881139) completed successfully on the then-current head `3bd284e2591c2cff3bf40b97e0bb392fc4be00d0`: build/migrations and runtime-boundary verification passed, **543 passed / 0 failed / 2 skipped / 0 TODO**. The skips are not waived: auth foundation persistence skipped because auth schema/functions or separate migrator/runtime URLs were unavailable; Connect service assertion replay skipped because distinct runtime/migrator database URLs were not supplied. CI success therefore does not satisfy the no-skips release standard. This entry itself creates a new head and requires exact-head revalidation. Full semantic/link reconciliation remains open.

## Updated database-backed CI qualification — 2026-10-16 21:29Z

The earlier 2-skip result is superseded by the consolidated GHM PR #138 head `3d08b0667775c2f589b90f02bbae8ea7ced9f8e9`, run [38970659762](https://github.com/zaidhqdev-sys/GHM/actions/runs/38970659762): **563 passed / 0 failed / 0 skipped / 0 TODO**. Build, PostgreSQL 18 migrations via the migrator role, auth foundation persistence, live PostgreSQL Connect service-assertion replay and runtime-boundary verification all passed. PR #138 also includes leading-BOM handling while retaining production fail-closed TLS enforcement; PR #139 is closed as superseded, not merged. This is CI-only qualification; it does not prove production DB state, deployed browser E2E, real account/business mapping, full Connect/QuoteFlow parity, or payment readiness. No production data/settings changed. The broad GHM/Connect documentation reconciliation remains open; no merge or deployment is authorized by this result.


## Consolidated PR and migration checkpoint — 2026-10-16 21:58Z

Current open GHM work is #135 documentation, #136 business-hours replacement, #137 authenticated identity/membership guard, and #138 trusted-proxy/qualified PostgreSQL CI. Exact tested implementation heads are recorded in the remaining-work register and Connect/GHM durable handover. #134 and #139 are closed unmerged as superseded by #137 and #138. Do not use their older standalone test summaries as the current implementation source.

Cross-repository, Connect #39 is the integrated identity/session branch, Connect #36 is the documentation reconciliation branch, and Connect #33 is a disabled PayFast sandbox bridge; Paystack source integration and the Anthropic proxy are separate Supabase Edge Function paths and are not GHM-qualified. Connect #15 and #28 are closed unmerged as non-target implementation branches; #35/#37 are closed unmerged as duplicates of #39. These closures do not mean product parity, provider readiness, or cutover has passed.

The last recorded test run on the GHM docs branch reported 543 passed / 2 skipped / 0 failed / 0 TODO. Skips remain unwaived. The zero-skip CI foundation exists on #138, but the docs branch itself is not yet independently zero-skip certified. Full semantic reconciliation and Markdown target/anchor checks remain open. No merge, production deployment, provider activation or cutover is authorized.


## Latest documentation-branch CI checkpoint — 2026-10-16 22:00Z

On exact head `10cb2af53cd9a69ff8f4c4f71825449e84c22faa`, workflow [38973019692](https://github.com/zaidhqdev-sys/GHM/actions/runs/38973019692) completed successfully: **543 passed / 0 failed / 2 skipped / 0 TODO**; runtime-boundary verification passed. The two skips remain the auth persistence and live Connect assertion-replay tests that require the disposable PostgreSQL 18 fixture now present on PR #138. They are not waived. This run does not satisfy the no-skip gate; keep #135 open until the documentation branch can be validated against that fixture without introducing duplicate or conflicting implementation scope. Relative local link targets in the 14 changed Markdown files passed; anchors, external URLs and full semantic reconciliation remain open.
