# Documentation Reconciliation — Second Pass — 2026-10-05

## Status

**SECOND-PASS LIVING-DOCUMENT RECONCILIATION — COMPLETE FOR THE IDENTIFIED STALE STATUS CONFLICTS**

**Baseline:** `main @ ba91df52f4313a6af82bcb4f326a60b424e2d1d9`

## Rule

A document may remain historical when its purpose is to preserve an earlier audit, gate, source snapshot, founder decision, or construction record. What is not acceptable is a living/current contract continuing to present a closed capability as an open gap, pending qualification, pending merge, or unqualified construction boundary.

Current implementation authority remains:

1. consolidated `main` code and migrations;
2. current qualification evidence;
3. living contracts reconciled to that evidence;
4. historical documents only as provenance.

## Repository documentation inventory

The consolidated `main` documentation tree contains **193 Markdown documents** under `docs/`:

- 6 top-level historical/governance records;
- 174 architecture documents;
- 13 evidence documents.

Historical handovers and historical gate/source records are not rewritten into false current-state narratives. They are preserved as provenance where their historical purpose is explicit.

## Second-pass corrections landed

The following living/current documents contained stale construction-state language and were reconciled:

- `BUSINESS_CAPABILITY_OPERATION_CONTRACT.md` — qualified/closed.
- `BUSINESS_CAPABILITY_LIFECYCLE_TRANSITION_MUTATION_CONTRACT.md` — qualified/closed.
- `BUSINESS_PROFILE_SCHEMA_CONTRACT.md` — qualified/closed.
- `BUSINESS_PROFILE_SOURCE_AUDIT.md` — historical provenance; construction completed/qualified.
- `CAPABILITY_CATALOGUE_CONTRACT.md` — qualified/closed.
- `COMMERCIAL_REFERENCE_DATA_SOURCE_AUDIT.md` — historical provenance; reference-data gap closed.
- `COMMERCIAL_TRIAL_OPERATION_CONTRACT.md` — qualified/closed.
- `GHM_CONNECT_IDENTITY_ADAPTER_CONTRACT.md` — construction-qualified integration foundation; product cutover still gated.
- `OPPORTUNITY_PARTICIPATION_OPERATION_CONTRACT.md` — qualified/closed.
- `OPPORTUNITY_PARTICIPATION_SCHEMA_CONTRACT.md` — qualified/closed.
- `OPPORTUNITY_PARTICIPATION_SOURCE_AUDIT.md` — historical provenance; construction completed/qualified.
- `PRODUCTION_CONFIGURATION_SECRET_BOUNDARY_CONTRACT.md` — PR #21 merged; no longer pending merge.
- `SAVED_BUSINESS_OPERATION_CONTRACT.md` — qualified/closed.

The authoritative current-state index baseline was also advanced from the pre-PR #107 checkpoint to `ba91df5...`.

## Documents intentionally not rewritten

The following classes remain intentionally historical or gated:

- dated handovers;
- founder decision records;
- source audits whose purpose is to preserve the evidence snapshot;
- legacy authentication gate records already marked historical/superseded;
- QuoteFlow migration boundaries that remain evidence-gated;
- provider/realtime/storage source audits that describe external product evidence rather than GHM implementation;
- product production-readiness gap registers where the remaining gaps are genuinely still open.

A document in these classes is not a stale implementation claim merely because it describes an earlier state. The document must instead clearly identify that state as historical/provenance and point readers toward the current authority.

## Storage clarification

Storage is not a missing GHM capability. The current documentation authority is:

- `GHM_STORAGE_METADATA_PERSISTENCE_BOUNDARY.md`
- `GHM_STORAGE_PERSISTENCE_BOUNDARY.md`
- `GHM_STORAGE_PERSISTENCE_FUNCTION_AUTHORITY.md`
- `GHM_STORAGE_PERSISTENCE_QUALIFICATION.md`

The remaining storage work is provider enablement, service/tenant authorization qualification, product/HTTP exposure, recovery/backup, orphan/reconciliation handling, and production configuration — not metadata/persistence construction.

## No construction implied

This pass is documentation-only. It does not authorize:

- new resources;
- new generic audit/event ledgers;
- production provider credentials;
- Supabase replacement;
- product cutover;
- database privilege mutation;
- migration execution.

The next construction mission must be selected only from the reconciled current-state map.
