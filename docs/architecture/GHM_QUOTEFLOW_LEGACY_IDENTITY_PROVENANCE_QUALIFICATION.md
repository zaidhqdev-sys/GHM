# QuoteFlow Legacy Identity Provenance Qualification

## Status
CONSTRUCTION — READ-ONLY PROVENANCE INTAKE / NO MIGRATION

## Purpose
Provide a deterministic boundary for reconciling the two legacy `public.users` rows against authoritative QuoteFlow/source evidence before any identity migration, credential migration, account linking, object retirement, or role remediation.

## Current evidence
The live legacy-object qualification established exactly two rows in `public.users` and zero rows in the other four legacy datasets. Repository evidence also establishes that QuoteFlow and GHM account identities remain distinct and that cross-system identity linking uses dual confirmation. Repository/application code is not authoritative historical account data.

## Required authoritative inputs
Qualification requires both artifacts:

1. `GHM_QUOTEFLOW_SOURCE_SNAPSHOT_FILE`
   - versioned source snapshot exported from the authoritative QuoteFlow migration source;
   - `schemaVersion` must be `1`;
   - `sourceSystem` must identify the authoritative source;
   - `environment` must identify the source environment;
   - each source account must carry an immutable source principal/subject identifier;
   - evidence reference and snapshot checksum are required;
   - raw password hashes are not required for identity reconciliation and must not be emitted into qualification output.

2. `GHM_LEGACY_USER_RECONCILIATION_FILE`
   - explicit mapping from each legacy `public.users.id` to one source principal;
   - source identifier and evidence reference;
   - reviewer identity and review timestamp;
   - no automatic email-only mapping;
   - no implicit mapping based on names, phone numbers, timestamps, roles, or password hashes.

## Required outcomes
Every legacy user row must resolve to exactly one of:

- `RECONCILED_READ_ONLY` — authoritative source principal and explicit reviewed mapping agree;
- `CONFLICT_REQUIRES_REVIEW` — competing or inconsistent evidence exists;
- `BLOCKED_MISSING_EVIDENCE` — required authoritative source evidence is absent or malformed.

No other status authorizes mutation.

## Identity invariants
- Legacy numeric IDs are not assumed to equal QuoteFlow IDs or GHM IDs.
- Email equality is a correlation signal only and never proof of identity authority.
- A legacy password hash is not proof that the legacy row is the same person as a source principal.
- QuoteFlow identity and GHM identity remain distinct until the already-qualified dual-confirmation identity-link boundary is satisfied.
- A provenance mapping does not itself create an active identity link.

## Output safety
Qualification output may include legacy row IDs, source principal IDs, evidence references, status, and SHA-256 checksums of input artifacts. It must not print password hashes, reset tokens, authentication secrets, or complete credential material.

## Mutation boundary
This qualification performs no INSERT, UPDATE, DELETE, GRANT, REVOKE, ALTER ROLE, ownership change, DROP, identity-link persistence, credential migration, or external-system mutation.

Successful provenance qualification therefore means only that the historical identity relationship is sufficiently evidenced to proceed to a separately designed migration/preservation slice.

## Blocking rule
If either required authoritative artifact is unavailable, the result is `BLOCKED_MISSING_EVIDENCE`. The two live legacy users remain preserved and no legacy role/object mutation may proceed on the basis of inference.

## Documentation reconciliation
This boundary is subordinate to the QuoteFlow migration reset-enrollment/reset-ceremony contract, the QuoteFlow ↔ GHM dual-confirmation identity-link authority contract, and the legacy ownership end-state preservation plan. It does not reopen qualified product resources or introduce Supabase as a GHM runtime dependency.