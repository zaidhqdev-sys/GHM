# QuoteFlow ↔ GHM Identity Link Persistence Contract

## Status

**SUPERSEDED — DO NOT IMPLEMENT AS A PERMANENT RUNTIME IDENTITY BRIDGE**

The earlier persistence design assumed that QuoteFlow's Supabase user/organization identifiers should remain durable cross-system identifiers. Repository audit and founder architecture direction establish that this is not the target architecture.

This document is retained as historical design evidence only. It must not be used to authorize permanent identity-link tables.

## Canonical ownership

GHM owns the persisted cross-system link record because the record is required to authorize future GHM-side resolution and must participate in GHM's transaction and least-privilege boundaries.

The link is a bridge, not a replacement owner for either product domain:

- GHM is the target canonical identity authority for QuoteFlow-backed runtime operations.
- GHM remains authoritative for GHM account identity, Business identity, membership, and GHM authorization.
- The persisted bridge records the explicit association and its provenance.

No QuoteFlow identifier becomes a GHM canonical identity.

## Reconciliation

A permanent runtime bridge is unnecessary if QuoteFlow is migrated to GHM-owned authentication and Business identity.

The required migration concern is a **temporary legacy crosswalk**, separately qualified, whose only purpose is to reconcile existing QuoteFlow/Supabase records to GHM records during migration.

That crosswalk must never become a runtime authorization primitive.

## Historical proposed link resources

Account and Business mappings are separate logical resources:

### Account link

`legacy QuoteFlow/Supabase user identifier → GHM account_identity.id` (migration provenance only)

### Business link

`legacy QuoteFlow organization identifier → GHM business.id` (migration provenance only)

One does not imply the other.

Do not encode both relationships as one polymorphic row whose meaning depends on nullable columns. Separate resource records keep cardinality, authorization, and lifecycle constraints explicit.

## Canonical lifecycle

Each persisted link has one canonical state:

- `active`
- `revoked`

The pre-persistence `proposed` and `confirmed` ceremony states are not trust-bearing persisted links in this first slice.

A future implementation may persist ceremony records separately if replay, expiry, or recovery requirements prove that necessary. Such records must never be interpreted as active mappings.

Only `active` links may be resolved by an adapter.

A revoked link remains historical evidence and is never reused as active authorization.

## Required account-link fields

The future canonical account-link record must contain, at minimum:

- stable link identifier;
- QuoteFlow user UUID;
- GHM account identity ID;
- lifecycle state;
- created timestamp;
- activated timestamp;
- revoked timestamp, nullable;
- QuoteFlow-side confirmation provenance;
- GHM-side confirmation provenance;
- ceremony/verification version;
- audit actor provenance.

The record must not store copied email, phone, password, access token, refresh token, or other authentication secrets.

## Required Business-link fields

The future canonical Business-link record must contain, at minimum:

- stable link identifier;
- QuoteFlow organization UUID;
- GHM Business ID;
- lifecycle state;
- created timestamp;
- activated timestamp;
- revoked timestamp, nullable;
- QuoteFlow-side confirmation provenance;
- GHM-side confirmation provenance;
- ceremony/verification version;
- audit actor provenance.

No subscription, entitlement, legal-acceptance, or role projection is part of the link record.

## Cardinality

The database must enforce the architecture-level cardinality:

### Account

At most one active link for each:

- QuoteFlow user UUID;
- GHM account identity ID.

### Business

At most one active link for each:

- QuoteFlow organization UUID;
- GHM Business ID.

Historical revoked records may coexist with later active records for the same identifiers only where relinking is explicitly permitted by the lifecycle contract.

## Activation transaction

Activation must be one atomic database transaction.

The transaction must:

1. verify the requested pair was authorized by the decision boundary;
2. verify both confirmation provenance records are valid for the ceremony/version;
3. enforce active-link uniqueness;
4. insert or reactivate the exact pair according to the approved relinking rule;
5. record immutable activation provenance;
6. commit all link state changes atomically.

No partial active link may become visible.

The persistence layer must not independently infer identity from email, phone, names, roles, subscription state, legal acceptance, or profile similarity.

## Concurrency

Concurrent activation attempts for conflicting pairs must be resolved by database-enforced uniqueness plus transaction semantics.

Application-level pre-checks are advisory only and cannot replace unique constraints.

Required outcomes:

- identical concurrent attempts resolve idempotently;
- conflicting mappings cannot both become active;
- a failed transaction leaves no partially active link;
- retry after a committed identical activation returns the existing active association.

## Idempotency

An identical already-active pair is idempotently successful.

A different pair involving either already-linked side is rejected.

Idempotency must not be based solely on a client-provided request ID. The canonical pair and active-state uniqueness remain authoritative.

A future request/ceremony idempotency key may be stored as audit metadata but cannot weaken pair uniqueness.

## Revocation

Revocation is an explicit state transition:

`active → revoked`

It must:

- require appropriate authority from the relevant side(s);
- record actor and timestamp;
- preserve historical provenance;
- immediately make the link ineligible for adapter resolution;
- never silently delete the historical record.

Re-establishment requires a new dual-confirmation ceremony.

## Relinking

Relinking is not an update of the existing pair to a new identity.

It is:

1. revoke the incompatible active link;
2. obtain new dual confirmation;
3. create the new active link in a governed transaction.

A transaction may perform these operations atomically when the future lifecycle contract explicitly permits controlled relinking.

Until that transaction is separately qualified, the safer construction rule is no active-to-active identity reassignment.

## Audit provenance

Activation and revocation must preserve:

- event type;
- actor system;
- actor identifier;
- timestamp;
- affected link identifier;
- exact source identifiers;
- ceremony/verification version;
- reason where required.

Audit provenance must be append-only from the application perspective.

Authentication secrets and bearer tokens must never be persisted.

## Resolution

Future adapters may resolve only:

- active account links;
- active Business links.

Resolution must be read-only.

A missing, revoked, or conflicting mapping must fail closed.

Resolution must not create, repair, relink, or infer a mapping as a side effect.

## Failure and recovery

If either source system is unavailable during a new ceremony:

- no active link may be created from incomplete proof.

If persistence commits but the caller loses the response:

- retrying the exact pair must return the existing active mapping idempotently.

If one side later revokes or loses authority:

- the link must become unusable through an explicit governed revocation/reconciliation process;
- no adapter may silently assume continued authority.

Automatic destructive cleanup is not authorized by this contract.

## Least privilege

The future runtime role must receive only the narrowly required link-resource operations.

Direct table mutation by the general runtime role should not be assumed acceptable.

Following existing GHM resource patterns, mutation should be exposed through a governed service/transaction boundary and the database privilege surface must be qualified independently.

Schema ownership remains with `ghm_schema_owner`; migration execution remains separate from runtime execution.

## No polymorphic trust bypass

Do not introduce a generic `external_identity` table that permits arbitrary provider/type/value combinations.

Any future migration crosswalk must be explicitly scoped to legacy-source provenance and must not be treated as a generic external identity registry or runtime trust relationship.

This prevents the identity bridge from becoming an uncontrolled universal identity registry.

## Explicit non-goals

This historical contract does not authorize:

- permanent identity-link migration SQL;
- identity-link tables;
- confirmation persistence tables;
- HTTP endpoints;
- QuoteFlow changes;
- Supabase changes;
- adapter implementation;
- role translation;
- subscription mapping;
- legal-acceptance mapping;
- payment/provider integration;
- shadow qualification;
- production routing;
- cutover.

## Implementation gate

Before migration or code is authored, the following must be independently qualified:

1. schema ownership and migration location;
2. account-link and Business-link table shape;
3. unique active-state constraints;
4. lifecycle transition authority;
5. transaction boundary;
6. concurrent activation behavior;
7. idempotent retry behavior;
8. revocation behavior;
9. audit provenance;
10. runtime least privilege;
11. read-only resolution;
12. cleanup/recovery semantics.

**No database object is authorized by this historical document.**

The next implementation gate is GHM-owned authentication and migration-boundary qualification.
