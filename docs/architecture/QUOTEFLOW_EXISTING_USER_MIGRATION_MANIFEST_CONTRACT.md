# QuoteFlow Existing-User Migration Manifest Contract

**Status:** ARCHITECTURE QUALIFIED — MANIFEST DESIGN ONLY; EXECUTION SEPARATELY GATED

This contract defines the deterministic input/output boundary for migrating existing QuoteFlow users from legacy Supabase Auth into canonical GHM accounts. It does not perform migration or authorize production cutover.

## Canonical source and target

Legacy source:

- Supabase Auth user UUID;
- legacy QuoteFlow organization identifier;
- source account/profile metadata.

Canonical target:

- GHM `account_identity.id`;
- GHM `business.id`;
- GHM `business_membership`;
- GHM-owned authentication credentials and sessions.

Supabase UUIDs remain opaque migration provenance. They are never converted into GHM identifiers or GHM bearer subjects.

## Account manifest

Each source account produces exactly one deterministic migration record:

| Field | Rule |
|---|---|
| source_provider | fixed `supabase` |
| source_subject | exact Supabase Auth UUID; opaque |
| source_email | metadata only |
| normalized_email | review/deduplication only |
| target_account_id | GHM numeric ID when resolved |
| external_mapping_outcome | `created`, `already_linked`, `conflict`, `account_not_found` |
| credential_disposition | `migrate_verified_hash`, `reset_required`, `blocked` |
| migration_outcome | `MIGRATED`, `RESET_REQUIRED`, `CONFLICT`, `BLOCKED` |
| reason_code | deterministic machine-readable reason |
| source_evidence | authoritative snapshot reference |
| reviewed_at | review timestamp |
| reviewed_by | migration actor |

The source UUID and email are not authorization inputs.

## Verified GHM mapping primitive

The only verified current external-identity mutation primitive is:

`ghm.auth_link_external_identity(provider, subject, account_id)`

It requires an existing GHM account and returns `created`, `already_linked`, `conflict`, or `account_not_found`.

It does not create accounts, match email, merge, move mappings, or change account status.

Therefore migration provisioning must resolve/provision the canonical GHM account **before** linking legacy provenance.

## Deterministic outcomes

### MIGRATED

Only when authoritative source identity is valid, exactly one GHM target is resolved, no mapping conflict exists, credential conditions are satisfied, and required evidence is present.

### RESET_REQUIRED

Used when the GHM account is established but legacy credential migration is unsupported. Verified GHM password re-enrollment is then required.

### CONFLICT

Used for existing mapping conflicts, multiple incompatible targets, conflicting ownership evidence, or violated migration cardinality. No automatic merge/relink occurs.

### BLOCKED

Used when authoritative evidence is missing/invalid, the target cannot be safely resolved, or required migration inputs/capabilities are unavailable.

## Account resolution

Resolution order:

1. exact existing `(provider=supabase, subject=source UUID)` mapping;
2. explicit operator-reviewed GHM target account;
3. approved new GHM account provisioning;
4. never email-only automatic resolution.

An exact existing mapping is authoritative for migration provenance.

## Credential boundary

The manifest never stores plaintext passwords.

A legacy password hash may be migrated only after its exact format and verification semantics are explicitly qualified against the GHM Argon2id contract. Otherwise:

`source credential → RESET_REQUIRED → verified GHM re-enrollment`

No weaker hashing, reversible storage, password bypass, or silent credential takeover is permitted.

## Organization manifest

Organization reconciliation is separate. Each legacy organization resolves to:

- `MAPPED`;
- `CREATE_REQUIRED`;
- `CONFLICT`;
- `BLOCKED`.

The record includes source organization identifier, authoritative ownership/admin evidence, target `business.id` when resolved, membership reconciliation status, provenance, reason code, and review actor/timestamp.

Organization name, slug, email, subscription state, or matching account email cannot independently establish a Business mapping.

## Membership boundary

A legacy organization-to-Business mapping does not automatically create membership. Each migrated account's GHM membership must be separately established through explicitly authorized GHM Business rules. Legacy roles are source metadata and are not silently translated into GHM roles.

## Idempotency

The exact source identity is keyed by `provider + source_subject`. Re-running identical migration input must not create duplicate accounts or mappings. Conflicting input stops with `CONFLICT`; it never overwrites an existing mapping.

## Source snapshot dependency

The manifest may only be generated from an approved authoritative source snapshot satisfying the separate **QuoteFlow Supabase Source Export Boundary** contract.

That boundary requires reproducible extraction evidence, snapshot consistency across account/organization/membership data, validation of identifiers and references, and no plaintext-password/session requirement.

No production source export is implied by this manifest contract.

## Execution boundary

The manifest is an input/output contract, not a migration engine. A future executor must validate the manifest, resolve/provision the GHM account, establish external provenance, establish/qualify credentials, reconcile Business/membership separately, and emit deterministic outcomes.

Execution must separately qualify transactionality, retries, concurrency, audit provenance, and recovery.

## Non-goals

No production migration, Supabase mutation, permanent UUID columns/identity-link tables, unsupported password-hash import, QuoteFlow runtime change, Business migration execution, role translation, payment change, DNS/routing/env change, or Supabase dependency removal is authorized.

## Qualification gates

- [x] canonical GHM account owner selected
- [x] Supabase identity classified as legacy provenance
- [x] exact external-link primitive verified
- [x] no email-only linking
- [x] deterministic account outcomes selected
- [x] password reset fallback selected
- [x] authoritative source/export boundary defined
- [x] manifest serialization fields defined
- [ ] controlled non-production source snapshot available
- [ ] Business reconciliation manifest
- [ ] migration executor transaction/retry model
- [ ] credential ceremony implementation
- [ ] end-to-end dry run

## Founder gate

Design and qualification only. Production migration and legacy-system mutation remain separately gated.
