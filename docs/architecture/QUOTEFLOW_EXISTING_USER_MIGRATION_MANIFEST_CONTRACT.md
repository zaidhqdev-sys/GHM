# QuoteFlow Existing-User Migration Manifest Contract

**Status:** ARCHITECTURE QUALIFIED — MANIFEST DESIGN ONLY; EXECUTION SEPARATELY GATED

## Purpose

This contract defines the deterministic input/output boundary for migrating existing QuoteFlow users from the legacy Supabase Auth source into canonical GHM accounts.

It does not perform migration, create database tables, alter QuoteFlow, or authorize production cutover.

## Canonical source and target

Legacy source:

- Supabase Auth user UUID
- legacy QuoteFlow organization identifier
- source account/profile metadata

Canonical target:

- GHM `account_identity.id`
- GHM `business.id`
- GHM `business_membership`
- GHM-owned authentication credentials and sessions

A Supabase UUID remains opaque migration provenance. It is never converted into a GHM identifier and never becomes a GHM bearer subject.

## Account manifest

Each source account produces exactly one deterministic migration record with:

| Field | Rule |
|---|---|
| source_provider | fixed `supabase` |
| source_subject | exact Supabase Auth UUID; opaque |
| source_email | source metadata only |
| normalized_email | deterministic normalization for review/deduplication only |
| target_account_id | GHM numeric ID when resolved |
| external_mapping_outcome | `created`, `already_linked`, `conflict`, or `account_not_found` |
| credential_disposition | `migrate_verified_hash`, `reset_required`, or `blocked` |
| migration_outcome | `MIGRATED`, `RESET_REQUIRED`, `CONFLICT`, or `BLOCKED` |
| reason_code | deterministic machine-readable reason |
| source_evidence | reference to authoritative migration evidence |
| reviewed_at | migration review timestamp |
| reviewed_by | migration operator/actor |

The source UUID and email are not authorization inputs.

## Existing GHM mapping primitive

The only verified current external-identity mutation primitive is:

`ghm.auth_link_external_identity(provider, subject, account_id)`

Its semantics are:

- existing GHM account required;
- no account creation;
- no email matching;
- no merge;
- no move;
- exact `(provider, subject)` uniqueness;
- `created` for a new exact mapping;
- `already_linked` for the same account;
- `conflict` when the source identity already belongs to another GHM account;
- `account_not_found` when the target account does not exist.

Therefore migration provisioning must resolve/create the canonical GHM account **before** linking legacy provenance.

## Deterministic account outcomes

### MIGRATED

Allowed only when:

- authoritative source identity is valid;
- exactly one GHM target account is resolved;
- no mapping conflict exists;
- credential disposition is supported, or the account has completed the required credential ceremony;
- all required migration evidence is present.

### RESET_REQUIRED

Allowed when:

- the source identity is valid;
- exactly one GHM account is established;
- no mapping conflict exists;
- the legacy password material cannot be safely imported into the GHM Argon2id contract.

The account may not receive a migrated legacy credential. It must complete verified GHM password reset/re-enrollment before normal password authentication is considered complete.

### CONFLICT

Produced when:

- the same source identity is already linked to another GHM account;
- multiple incompatible target accounts are proposed;
- source ownership evidence conflicts;
- an existing active target relationship violates the migration cardinality rules.

No automatic merge or relink occurs.

### BLOCKED

Produced when:

- authoritative source evidence is missing or invalid;
- the target account cannot be safely resolved;
- credential migration requires unsupported behavior;
- required migration inputs are unavailable.

## Account resolution rules

Resolution order is deliberately conservative:

1. exact existing `(provider=supabase, subject=source UUID)` mapping;
2. explicit operator-reviewed GHM target account;
3. approved new GHM account provisioning;
4. no email-only automatic resolution.

Email may identify records for review but cannot independently authorize identity association.

If an exact mapping exists, it is authoritative for migration provenance.

If no exact mapping exists, a target account must be explicitly resolved or provisioned before `auth_link_external_identity` is invoked.

## Credential boundary

The manifest records credential disposition but never stores plaintext passwords.

A verified compatible legacy hash may be migrated only if its format and verification semantics are explicitly qualified against the GHM password contract.

Otherwise:

`source credential → RESET_REQUIRED → verified GHM re-enrollment`

No weaker hashing, reversible storage, password bypass, or silent credential takeover is permitted.

## Organization manifest

Organization reconciliation is a separate manifest.

Each legacy organization must resolve to exactly one of:

- `MAPPED`
- `CREATE_REQUIRED`
- `CONFLICT`
- `BLOCKED`

The record must include:

- source organization identifier;
- authoritative ownership/admin evidence;
- target `business.id`, when resolved;
- membership reconciliation status;
- source-to-target provenance;
- deterministic reason code;
- review actor/timestamp.

Organization name, slug, email, subscription state, or matching account email cannot independently establish a Business mapping.

## Membership boundary

A legacy organization-to-Business mapping does not automatically create membership.

Each migrated account's GHM membership must be separately established according to GHM Business authorization rules.

Legacy roles are source metadata. They are not silently translated into GHM roles.

## Idempotency

Re-running the same manifest must not create duplicate accounts or duplicate external mappings.

The exact source identity is keyed by:

`provider + source_subject`

The exact target is keyed by the canonical GHM identifier.

Identical completed migration input must produce the same outcome.

Conflicting input must stop with `CONFLICT`, not overwrite an existing mapping.

## Execution boundary

The manifest is an **input/output contract**, not a migration engine.

A future migration executor must:

1. validate the manifest;
2. resolve/provision the GHM account;
3. establish external provenance with `auth_link_external_identity`;
4. establish/qualify credentials;
5. reconcile Business and membership separately;
6. emit deterministic outcomes;
7. never use Supabase JWTs as GHM credentials;
8. never mutate legacy source records as part of ordinary GHM provisioning.

Execution must be separately qualified for transactionality, retry behavior, concurrency, audit provenance, and rollback/recovery.

## Non-goals

This contract does not authorize:

- production user migration;
- Supabase API/database mutation;
- permanent UUID columns;
- permanent identity-link tables;
- password hash extraction;
- QuoteFlow runtime changes;
- Business migration execution;
- role translation;
- payment changes;
- DNS/routing/env changes;
- Supabase dependency removal.

## Qualification gates

Before execution:

- [x] canonical GHM account owner selected;
- [x] Supabase identity classified as legacy provenance;
- [x] exact external-link primitive verified;
- [x] no email-only linking;
- [x] deterministic account outcomes selected;
- [x] password reset fallback selected;
- [ ] authoritative source export/access boundary;
- [ ] manifest serialization/schema format;
- [ ] Business reconciliation manifest;
- [ ] migration executor transaction/retry model;
- [ ] credential ceremony implementation;
- [ ] end-to-end dry run against non-production data.

## Founder gate

This contract authorizes design and qualification only. It does not authorize production migration or legacy-system mutation.
