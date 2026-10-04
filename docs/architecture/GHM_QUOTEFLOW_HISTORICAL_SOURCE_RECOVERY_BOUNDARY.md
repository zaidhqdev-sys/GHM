# GHM QuoteFlow Historical Source Recovery Boundary

## Status

**DECISION: HISTORICAL_SOURCE_EVIDENCE_UNAVAILABLE**

This boundary records the remaining historical-data dependency required only for legacy QuoteFlow identity provenance. It is not a prerequisite for GHM to become the independent backend for new/current QuoteFlow or Connect runtime traffic.

## Purpose

GHM must not guess the relationship between the two preserved legacy `public.users` rows and historical QuoteFlow identities.

The authoritative historical QuoteFlow source was identified as the inactive Supabase project:

- project: `QuoteFlow`
- project ref: `wetsblzwhxxgqpttwqht`
- region: `eu-central-1`
- status observed: `INACTIVE`

No repository artifact found during GitHub archaeology provides the required authoritative account snapshot/export.

The following historical/recovery projects were also identified as inactive:

- `AIWF-Recovery-Evidence-2026-08-19`
- `ZaidHQ-Recovery-Evidence-2026-08-19`
- `ZaidHQ-DR-Restore-2026-08-18`

Inspection timeouts against recovery projects are **inconclusive** and must not be interpreted as evidence that their data is absent.

## Recovery attempt

On 2026-10-04, a read-only recovery decision was tested by requesting restoration of the inactive QuoteFlow project.

The platform rejected restoration because the owning organization has unpaid invoices and requires outstanding payments to be settled before restoration.

No restore, schema mutation, data mutation, migration, role change, or credential operation was performed.

## Required evidence

To qualify legacy identity provenance, GHM still requires:

1. A versioned QuoteFlow source snapshot from an authoritative source.
2. One immutable source principal/subject identifier for each relevant historical account.
3. Canonical email for correlation.
4. Organization/member relationship evidence where applicable.
5. Evidence reference and checksum.
6. An explicit reviewer-approved mapping from each legacy `public.users.id` to exactly one source principal.

Email equality alone is not sufficient identity proof.

Password hashes are not identity proof and must not be copied merely to retire the legacy table.

## Allowed recovery sources

Recovery may proceed only through an authoritative source artifact or an explicitly approved historical-source recovery path.

Acceptable evidence includes:

- an existing versioned source snapshot/export;
- a previously captured recovery/evidence artifact with provenance;
- a restored historical source made available through an approved operational decision.

No automatic email-only reconciliation is permitted.

## Explicit non-goals

This boundary does **not**:

- restore or mutate the inactive Supabase project;
- pay or settle historical invoices;
- migrate legacy credentials;
- copy password hashes;
- recreate Supabase as a runtime dependency;
- make GHM dependent on Supabase;
- delete the two preserved legacy users;
- retire legacy PostgreSQL ownership;
- change GHM runtime or migrator privileges.

## Relationship to GHM backend replacement

The historical-user issue is now treated as a **migration/provenance exception**, not an architectural blocker to GHM replacing Supabase.

GHM remains the target independent backend for ZAID Connect and QuoteFlow.

The broader backend replacement programme must cover the capabilities currently supplied by Supabase where the products require them, including:

- PostgreSQL data persistence and migrations;
- authentication and credential lifecycle;
- authorization and tenant isolation;
- object/file storage;
- realtime/event delivery;
- server-side functions/background processing;
- operational observability and health;
- backups/recovery and migration tooling;
- secure secrets/configuration boundaries.

Each capability must have one canonical GHM owner and a qualified runtime contract before product cutover.

## Decision gate

Current state:

`HISTORICAL_SOURCE_EVIDENCE_UNAVAILABLE`

Therefore:

- legacy identity reconciliation remains blocked;
- legacy role/ownership retirement remains blocked;
- new/current GHM backend construction may continue independently;
- no historical-source restoration is authorized by this document.

Once authoritative evidence exists, run:

`npm run qualify:quoteflow-legacy-identity-provenance`

The expected successful result is:

`RECONCILED_READ_ONLY`

Only then may legacy ownership/role remediation proceed.

## Audit principle

Historical data preservation is subordinate to correctness.

GHM must preserve what is known, explicitly mark what is unknown, and never manufacture provenance merely to make a migration appear complete.
