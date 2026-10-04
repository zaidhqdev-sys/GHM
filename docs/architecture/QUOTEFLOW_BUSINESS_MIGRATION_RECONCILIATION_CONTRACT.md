# QuoteFlow Legacy Organization → GHM Business Reconciliation Contract

**Status:** CONSTRUCTION QUALIFICATION — NON-PRODUCTION RECONCILIATION ONLY

This contract defines the deterministic migration boundary for reconciling a legacy QuoteFlow organization to canonical GHM Business identity. It does not create Businesses, mutate production data, create memberships, or change QuoteFlow runtime behavior.

## Canonical ownership

The target runtime is:

`QuoteFlow GHM session → ghm.account_identity.id → ghm.business_membership → ghm.business.id`

The legacy organization identifier remains opaque migration provenance.

The verified GHM business external-link primitive is:

`ghm.auth_link_business_external_mapping(provider, external_business_id, business_id)`

It is link-only. It does not create Businesses, infer identity from name/email, merge or move mappings, establish membership, or alter Business ownership/verification/status.

## Source evidence

Every organization record must originate from the same authoritative migration snapshot as the account and membership records.

Required source evidence:

- provider fixed to `supabase`;
- exact legacy organization identifier;
- authoritative organization ownership/admin evidence;
- source snapshot/evidence reference;
- source environment and extraction metadata;
- resolved member references;
- deterministic review actor and timestamp.

Email, organization name, slug, subscription state, or a user's email address is metadata only and cannot independently prove Business identity or ownership.

## Reconciliation outcomes

Each legacy organization resolves to exactly one outcome:

### MAPPED

Use only when authoritative evidence identifies exactly one existing GHM Business and no external-mapping conflict exists.

### CREATE_REQUIRED

Use when authoritative evidence establishes that the organization is a valid migration source but no existing GHM Business has been approved as its target.

This outcome does **not** create the Business. Business creation requires a separate migration capability and gate.

### CONFLICT

Use when:

- the exact legacy organization mapping already points to another Business;
- authoritative evidence identifies incompatible target Businesses;
- ownership/admin evidence conflicts;
- migration cardinality is violated.

No automatic merge, relink, or takeover is permitted.

### BLOCKED

Use when required authoritative evidence is absent/invalid, the source snapshot is inconsistent, or the target cannot safely be resolved.

## Resolution order

1. Exact existing `(provider=supabase, external_business_id=legacy organization id)` mapping.
2. Explicit operator-reviewed GHM Business target backed by authoritative evidence.
3. `CREATE_REQUIRED` when no target exists and the source is otherwise migration-eligible.
4. Never resolve by name, email, slug, subscription, or fuzzy matching alone.

An exact existing external mapping is authoritative.

## Business creation boundary

Migration reconciliation does not call the public Business creation API.

A future migration-only provisioning capability must separately define:

- canonical Business fields;
- creator/owner semantics;
- transaction boundary;
- duplicate prevention;
- idempotency;
- ownership evidence;
- failure/recovery behavior.

Until that capability is qualified, `CREATE_REQUIRED` remains a terminal dry-run outcome.

## Membership boundary

Business mapping does not create membership.

For each source membership, a separate reconciliation step must establish a GHM `business_membership` using explicit GHM authorization rules. Legacy roles remain source evidence and must not be silently translated.

The organization owner/admin evidence may inform membership review, but does not itself authorize arbitrary membership mutation.

## Determinism and idempotency

The reconciliation key is:

`source_provider + source_organization_id`

Repeated identical input must produce the same outcome. Existing exact mappings must not be overwritten.

Any incompatible mapping is `CONFLICT`, never a repair-by-overwrite.

## Manifest shape

Each organization manifest record contains:

- `sourceProvider`;
- `sourceOrganizationId`;
- `outcome`;
- `targetBusinessId` when resolved;
- `reasonCode`;
- `sourceEvidence`;
- `reviewedAt`;
- `reviewedBy`.

Membership status is recorded separately and cannot be implied by `MAPPED`.

## Qualification boundary

The construction qualification must prove, using synthetic non-production data only:

1. exact mapping → `MAPPED`;
2. no target → `CREATE_REQUIRED`;
3. incompatible mapping/evidence → `CONFLICT`;
4. missing evidence → `BLOCKED`;
5. name/email-only candidate does not resolve automatically;
6. repeated identical input is deterministic;
7. no Business or membership mutation occurs.

## Non-goals

No production source export, production Business creation, membership mutation, QuoteFlow runtime change, Supabase removal, credential migration, payment change, DNS/routing change, or cutover is authorized.

## Founder gate

Architecture and non-production qualification only. Execution against authoritative production-derived migration data requires a separate founder gate.
