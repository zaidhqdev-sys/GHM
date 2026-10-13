# GHM Current State — Authoritative Documentation Reconciliation

**Status:** CURRENT / AUTHORITATIVE DOCUMENTATION INDEX — reconciled 2026-10-13
**Repository authority:** consolidated `main`
**Repository-wide documentation audit base:** `01bd40dabe0b0f02bb30d2f78267a0414d3d8356` (PR #125 merge commit). The earlier `1f2b10d0850095311614c5b5f9531eb8b7cce860` checksum-normalization commit remains a historical reconciliation anchor, not the current documentation audit base. Neither SHA independently establishes the currently deployed Render commit or live database state.

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

GHM contains historical/provenance and migration-boundary work for QuoteFlow. Existing legacy identity/data migration remains evidence-gated. GHM construction must not infer remote storage or data ownership solely from the presence of Supabase client code.

## Legacy PostgreSQL authority

Legacy roles/objects remain preserve-and-audit until dependency, data provenance, ownership, disposition, and least-privilege end-state evidence is complete. No legacy role retirement is implied by this index.

## Explicit non-authority / historical records

Historical handovers, source audits, founder decision records, and superseded gate contracts remain valuable provenance. They must not be read as current implementation status when a current qualified contract/evidence record supersedes them.

Known stale roadmap examples were reconciled rather than treated as current authority, including older capability-gap language that predates the storage foundation and older tenant-adoption documents that predate the 2026-10-05 qualification sequence.

## Remaining production-replacement gates

The existence of qualified construction slices does **not** mean GHM has replaced Connect or QuoteFlow in production. Remaining work includes product workflow/adapters where not yet qualified, production configuration/secrets, provider enablement, migration/cutover rehearsal, recovery/rollback, observability/operational readiness, and founder authorization for production replacement.

## Rule

**Code, migrations, qualification evidence, and current living contracts outrank historical roadmap language. When a document conflicts with current mainline evidence, the document is stale and must be reconciled before it is used to authorize new construction.**


## Historical documentation reconciliation record — second pass, 2026-10-05

This paragraph records the outcome of the 2026-10-05 pass and is retained as provenance; the current reconciliation status and audit anchor are stated at the top of this document. The first reconciliation merge was followed by a document-by-document living-status cleanup. Current qualified resources are no longer described as open construction gaps in their living contracts. Historical source audits and gate snapshots remain historical and are explicitly treated as provenance. The remaining production gap register is `docs/GHM_REMAINING_WORK_REGISTER_2026-10-05.md`. It is the current planning authority for open work; it explicitly separates GHM-core construction, product integration, provider/configuration, migration/provenance, and production cutover.

## Repository-wide documentation reconciliation follow-up — 2026-10-13

**Audit base:** `main` at `01bd40dabe0b0f02bb30d2f78267a0414d3d8356` (the PR #125 merge commit).

- The repository tree contained 664 tracked files, including 209 documentation-like files under the repository-wide documentation inventory.
- PR #125 changed 102 of those documentation-like files; the remaining 107 were reviewed against current mainline code, qualification evidence, and the authoritative state/remaining-work records.
- Local Markdown link targets were checked across the 209-file documentation inventory; no broken local file targets were found.
- This follow-up corrects stale current-status or branch-provenance statements in the Project resource, public Business/Directory, Customer/Quote adapters, Campaign/Project/Saved Business frozen contracts, database/storage README guidance, schema decision, and qualification/evidence records.
- The follow-up is documentation-only. It does not change application code, migrations, credentials, deployed services, or production product routing. Production cutover remains separately gated.
