# QuoteFlow Supabase Source Export Boundary

**Status:** ARCHITECTURE GATE — SOURCE ACCESS CONTRACT ONLY

## Purpose

Define the evidence boundary required before any existing QuoteFlow user migration can execute.

This document does not access, export, mutate, or migrate production Supabase data.

## Source authority

The migration source is the authoritative legacy QuoteFlow/Supabase dataset used to establish historical account and organization provenance.

A source record is migration-eligible only when it comes from an explicitly approved export/access mechanism and can be tied to a reproducible extraction event.

No migration executor may infer source records from:

- current QuoteFlow local AsyncStorage;
- application screenshots;
- email addresses alone;
- Supabase access/refresh tokens;
- GHM records without source provenance;
- guessed UUIDs;
- manually reconstructed records.

## Minimum account source fields

The authoritative account dataset must provide, at minimum:

- Supabase Auth user UUID;
- source account status;
- source email, when present;
- source creation/update timestamps, when available;
- evidence reference identifying the export/extraction.

The UUID is opaque provenance. It must not be converted into a GHM identifier.

## Minimum organization source fields

The authoritative organization dataset must provide, at minimum:

- legacy organization identifier;
- organization metadata needed for review;
- authoritative ownership/admin evidence;
- evidence reference identifying the export/extraction.

Organization membership data must be available separately or through an explicitly documented source relation.

## Credential source boundary

Password material is **not required** for the initial migration manifest.

The migration design must not require extraction of plaintext passwords or Supabase sessions.

A legacy password hash may only enter a future credential migration path after its exact format and verification semantics have been independently qualified against the GHM Argon2id credential contract.

Until that qualification exists, accounts are `RESET_REQUIRED` where credential re-enrollment is necessary.

## Evidence manifest

Every source export must have a migration evidence record containing:

- source system;
- extraction mechanism;
- extraction timestamp;
- dataset/version identifier;
- file/object identifiers;
- content hashes where available;
- schema/version information;
- operator/actor;
- environment classification;
- record counts;
- validation result.

The evidence record must be sufficient to reproduce which source snapshot produced a migration manifest.

## Snapshot consistency

Account, organization, and membership datasets must be treated as one migration snapshot.

If datasets were extracted at different points in time and consistency cannot be demonstrated, the migration run is `BLOCKED`.

No live incremental reads may silently supplement an incomplete snapshot.

## Data handling

Source exports are migration inputs, not runtime application data.

They must not be committed to the GHM repository.

They must not be embedded into migration SQL.

They must not be copied into permanent GHM identity tables solely for migration convenience.

Sensitive source data must remain in the approved migration workspace with access limited to the migration operation.

## Validation before execution

The source boundary is considered satisfied only after:

1. authoritative export/access mechanism is identified;
2. snapshot identity is recorded;
3. required fields are present;
4. UUID uniqueness is validated;
5. organization identifier uniqueness is validated;
6. membership references resolve within the snapshot;
7. duplicate/conflicting source identities are reported;
8. record counts and hashes are captured;
9. environment is confirmed non-production for dry-run qualification.

Any failed validation produces `BLOCKED`.

## Relationship to the qualified snapshot validator

The source-export boundary is the **input authority gate** for the already-qualified QuoteFlow migration snapshot validator and deterministic dry-run manifest capability.

The validator may consume only a controlled snapshot that satisfies this contract. Validator qualification does not itself approve a source export or authorize production access.

The next executable migration gate is therefore:

**approved non-production source snapshot → snapshot validation → deterministic manifest → reconciliation report**

No persistent migration database tables are required solely to satisfy this source boundary.

## Production separation

A production export, production credential access, or production migration is separately gated.

This architecture contract does not authorize:

- production Supabase export;
- credential extraction;
- Supabase data mutation;
- GHM account creation from production data;
- QuoteFlow runtime cutover;
- environment changes;
- routing/DNS changes.

## Qualification gates

- [x] source authority and minimum account evidence defined
- [x] organization and membership evidence boundary defined
- [x] credential extraction explicitly excluded
- [x] reproducible extraction evidence defined
- [x] snapshot consistency requirement defined
- [x] source-data handling boundary defined
- [x] deterministic pre-execution validation requirements defined
- [x] relationship to the qualified snapshot validator defined
- [ ] approved non-production source snapshot available
- [ ] production export separately approved
- [ ] production migration separately approved

## Founder gate

Architecture and qualification only. No production export, credential extraction, Supabase mutation, GHM account creation from production data, QuoteFlow runtime cutover, environment/routing change, payment change, or Supabase dependency removal is authorized.
