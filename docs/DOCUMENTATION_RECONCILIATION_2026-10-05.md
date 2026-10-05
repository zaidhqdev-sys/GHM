# GHM Documentation Reconciliation — 2026-10-05

## Status

**MISSION 0 — DOCUMENTATION RECONCILIATION IN PROGRESS / CURRENT INDEX ESTABLISHED**

**Baseline:** GHM consolidated `main @ 53f5d3c29781dd4b1012bfeeb78ccaeda07b15b4`

## Decision

Documentation is reconciled against the current repository implementation and qualification evidence before new GHM construction is authorized. Local execution is reserved for sync and prescribed qualification; repository inspection is performed directly against Git history/source/docs.

## Reconciliation rules

1. Current `main` code, migrations, tests, and qualification evidence are the implementation authority.
2. A historical handover remains historical; it is not rewritten into current-state fiction.
3. Living architecture/operation/evidence records must state their actual current status.
4. A closed/qualified resource is not reopened merely because an old document says it is missing.
5. Provider capability is not inferred from a provider-neutral contract.
6. A new platform ledger/resource is not constructed where an existing domain-owned ledger already satisfies the concept.
7. No document may authorize production cutover merely because a construction slice is qualified.

## Reconciled corrections in this pass

- Business Identity operation contract no longer reports the corrected multi-business qualification as open.
- Business Offering tenant-adoption record is now marked qualified/closed with the 2026-10-05 runtime result.
- Business Capability tenant-adoption record is now marked qualified/closed with the 2026-10-05 runtime result.
- Storage metadata/persistence documents now record the qualified foundation instead of a pending schema/persistence gate.
- Storage persistence authority is reconciled to the current controlled `SECURITY DEFINER` function boundary; the older `SECURITY INVOKER` statement was stale.
- Country/currency reference-data contract now records the already-qualified dependency instead of a pending founder gate.

## Current documentation hierarchy

**Current state index:** `docs/GHM_CURRENT_STATE.md`

**Living architecture:** `docs/architecture/`

**Qualification evidence:** `docs/evidence/`

**Historical provenance:** dated handovers, source audits, founder decision records, and superseded gate records.

## Construction pause rule

No new resource construction should begin from a stale gap register, old handover, or historical source audit. First reconcile the document against current mainline evidence; only then determine whether a genuine capability gap remains.

## Outcome target

Complete document-by-document reconciliation of all living architecture/evidence records, then establish the next construction mission from the reconciled current-state map rather than from historical backlog language.
