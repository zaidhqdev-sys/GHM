# GHM Legacy Ownership End-State & Preservation Plan

## Status
CONSTRUCTION — DESIGN / PRESERVATION BOUNDARY

## Purpose
Define the canonical end state for the remaining legacy PostgreSQL objects and datasets before any ownership, role, or object mutation.

## Current evidence
The read-only legacy object qualification established:
- public.users contains exactly 2 rows and is the only non-empty legacy dataset.
- public.profiles, public.todos, public.files, and public.password_reset_tokens are empty.
- All five legacy tables and their associated indexes/sequences remain owned by ghm_db_user.
- No application/external dependency edges were discovered.
- Reported PostgreSQL structural dependencies are TOAST relationships and owned sequences.
- The two legacy identity rows remain subject to authoritative QuoteFlow/source provenance reconciliation.

## Canonical preservation decisions
### public.users
**PRESERVE — DO NOT DELETE OR BLINDLY MIGRATE.**
The two rows remain intact until each legacy identity is reconciled against an authoritative source snapshot/migration provenance record. Password hashes must not be copied or transformed merely to retire the table. The existing QuoteFlow reset-enrollment/reset-ceremony boundary remains the canonical recovery path.

### public.profiles
**EMPTY — RETIRE AFTER PRESERVATION CHECK.**
No rows require migration. Preserve the audit evidence and retire the object only after confirming no successor semantics remain.

### public.todos
**EMPTY — RETIRE AFTER PRESERVATION CHECK.**
No rows require migration and no current GHM product owner has been established for this legacy concept.

### public.files
**EMPTY — RETAIN OR RETIRE ONLY AFTER STORAGE SEMANTICS CHECK.**
No rows exist, but the legacy storage metadata shape must not be mistaken for current GHM object storage. No file data migration is currently required.

### public.password_reset_tokens
**EMPTY — RETIRE AFTER PRESERVATION CHECK.**
No tokens exist. The table has no used_at column and is not the canonical recovery mechanism. It must not be reused.

## Ownership end state
- ghm_runtime: product runtime database identity; no legacy object ownership.
- ghm_migrator: migration process identity; no legacy object ownership; may explicitly SET ROLE ghm_schema_owner through the canonical migration path.
- ghm_schema_owner: canonical owner of retained GHM schema/application objects.
- ghm_app_user: no application/runtime authority.
- ghm_db_user: no application/runtime authority and ultimately no ownership of retained GHM objects.

No ownership transfer is authorized by this design document.

## Required mutation order
1. Reconcile the two legacy identities against an authoritative source snapshot and migration provenance.
2. Record final disposition for each legacy dataset.
3. Verify runtime, migration, recovery, and operational paths again.
4. Sever ghm_app_user -> ghm_db_user legacy authority.
5. Remove ghm_db_user administrative authority.
6. Transfer ownership of any retained legacy objects to the explicitly approved canonical owner, or retire empty legacy objects.
7. Re-run the complete role/object authority audit.
8. Only after clean post-mutation evidence, consider legacy-role retirement.

Each step is a separate mutation boundary with independent evidence. Failure at any step stops the sequence.

## Rollback boundary
Before mutation, preserve the exact live catalog/data evidence and the authoritative provenance artifacts. No destructive object/data operation may occur in the same transaction or slice as uncertain identity reconciliation. Role retirement is not a rollback mechanism.

## Explicit non-goals
- No deletion of the two legacy users in this slice.
- No password-hash migration without authoritative provenance and an explicitly qualified credential path.
- No reuse of legacy password-reset tokens.
- No blanket runtime grants.
- No Supabase dependency in the canonical GHM runtime architecture.
- No DROP ROLE, DROP OWNED, or blind REASSIGN OWNED.
- No mutation is authorized by this document.

## Qualification gate
This plan is complete only when:
- the two legacy identities have authoritative provenance outcomes;
- each legacy dataset has a recorded final disposition;
- the retained-object ownership target is explicit;
- the exact role-remediation sequence is separately qualified;
- pre/post mutation authority audits are defined and reproducible;
- documentation remains reconciled with the canonical database authority model.

## Documentation reconciliation
This plan is subordinate to the canonical database authority model, migration ownership model, role-separation runbook, and QuoteFlow migration provenance boundary. It records the current legacy boundary without reopening qualified product resources or changing canonical runtime/migrator ownership.