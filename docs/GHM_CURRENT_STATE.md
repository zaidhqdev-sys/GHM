# GHM Current State — Authoritative Documentation Reconciliation

**Status:** CURRENT / AUTHORITATIVE DOCUMENTATION INDEX — 2026-10-05
**Repository authority:** consolidated `main`
**Current main at this slice's start:** `e9ad72d417585d0046f9bf95402931959255eb88`

## Purpose

This document is the current navigation point for GHM construction state. It reconciles the living architecture/evidence record against the consolidated mainline and explicitly separates qualified construction capability from remaining production-replacement work.

## Core platform foundation

- Authentication foundation: constructed and qualified; production cutover remains separately gated.
- Durable tenant isolation: **qualified 2026-10-05**. Tenant authority derives from authenticated account identity plus active membership in an active Business; caller-supplied Business identifiers cannot establish authority.
- Authorization/transaction boundary: qualified construction primitives.
- Database authority: canonical GHM schema/runtime/migrator separation remains the governing model; legacy role/object retirement remains evidence-gated.
- Resource API / HTTP transport: bounded construction surfaces exist; route exposure remains per-resource and separately qualified.

## Qualified Business-domain capabilities

Current mainline contains qualified construction boundaries for Business Identity/Profile, Business Category, Business Capability, Business Hours, Business Offering, Opportunity Core, Opportunity Capability Requirements, Opportunity Participant, Project, Project Quote, Enquiry, Customer, Quote, Review/aggregate, Trust, Saved Business, Notification, Support Request, and related bounded capability seams.

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

Payment-provider integration, production credentials, production cutover, and provider-specific side effects remain separately gated. The PayFast HTTP checkout/ITN boundary and PayFast ITN server-to-server confirmation are merged on `main`. Post-merge local verification passed at 557/557 tests. A local sandbox-only qualification runner (`npm run qualify:payfast-runtime`) has passed in the founder's local checkout: build passed and 22 focused tests passed with 0 failures or skips. The full GHM suite also passed at 557/557, with `git diff --check` clean. Provider HTTP is stubbed; the runner does not call PayFast, access a database, or require live credentials. Real PayFast sandbox end-to-end qualification remains a separate gate; production credentials and live enablement remain separately gated.

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

Bounded construction-qualified seams include Connect service trust/request context, governed operation resolution, authorization binding, resource dispatch, service HTTP read boundary, replay protection, Business provisioning/linking, identity integration foundation, and selected resource adapters. These are not production migrations.

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


## Documentation reconciliation second pass — 2026-10-05

The first reconciliation merge is now followed by a document-by-document living-status cleanup. Current qualified resources are no longer described as open construction gaps in their living contracts. Historical source audits and gate snapshots remain historical and are explicitly treated as provenance. The remaining production gap register is `docs/GHM_REMAINING_WORK_REGISTER_2026-10-05.md`. It is the current planning authority for open work; it explicitly separates GHM-core construction, product integration, provider/configuration, migration/provenance, and production cutover.
