# QuoteFlow ↔ GHM Identity Link Persistence & Qualification Contract

## Status

**PERSISTENCE CONTRACT DRAFT — DUAL-SIDED CONFIRMATION SELECTED; RUNTIME IMPLEMENTATION NOT AUTHORIZED**

This contract defines the storage and qualification boundary for the already-selected identity-link lifecycle. It authorizes design of the persistence model only; it does not authorize the migration, runtime mutation, adapter, HTTP route, shadow qualification, or production cutover.

## 1. Canonical relationships

Two independently governed relationship types exist:

- **ACCOUNT:** QuoteFlow Supabase user UUID ↔ GHM `account_identity.id`
- **BUSINESS:** QuoteFlow organization UUID ↔ GHM `business.id`

An ACCOUNT link never implicitly creates, activates, or authorizes a BUSINESS link.

## 2. Lifecycle

Canonical states:

`PENDING → ACTIVE → REVOKED`

A new ceremony creates PENDING state. ACTIVE requires both independently recorded confirmations for the same ceremony and exact target pair.

Allowed transitions:

- NONE → PENDING
- PENDING → ACTIVE
- PENDING → REVOKED
- ACTIVE → REVOKED

REVOKED cannot be directly reactivated. A new ceremony is required.

## 3. Persistence model

The future canonical persistence record must represent **one relationship ceremony/version**, not merely an external mapping row.

Required logical fields:

| Field | Requirement |
|---|---|
| relationship type | ACCOUNT or BUSINESS |
| QuoteFlow subject | exact user UUID for ACCOUNT or organization UUID for BUSINESS |
| GHM target | exact account ID for ACCOUNT or Business ID for BUSINESS |
| state | PENDING / ACTIVE / REVOKED |
| ceremony ID | unique opaque identifier for the linking ceremony |
| version | monotonic concurrency/version value |
| initiated actor | side, actor identity, timestamp |
| QuoteFlow confirmation | side, actor identity, timestamp |
| GHM confirmation | side, actor identity, timestamp |
| activation | timestamp + provenance |
| revocation | timestamp + actor + reason |
| created/updated timestamps | required |

The schema may normalize provenance into child records, but the logical information must remain durable and auditable.

## 4. Identifier representation

QuoteFlow identifiers are external system identifiers and must be stored without reinterpretation as GHM numeric IDs.

- QuoteFlow user UUID remains an opaque external identifier.
- QuoteFlow organization UUID remains an opaque external identifier.
- GHM account and Business IDs remain native GHM identifiers.

No email, phone, name, slug, timestamp, subscription state, legal acceptance, or other profile attribute may act as an identity-link key.

## 5. Uniqueness

The persistence design must atomically prevent:

- more than one ACTIVE GHM account link for the same QuoteFlow principal;
- more than one ACTIVE QuoteFlow principal link for the same GHM account;
- more than one ACTIVE GHM Business link for the same QuoteFlow organization;
- more than one ACTIVE QuoteFlow organization link for the same GHM Business.

PENDING ceremonies may coexist only where explicitly necessary for recovery/concurrency semantics; competing ceremonies must not be able to activate conflicting relationships.

The exact database constraint/index strategy is an implementation detail, but the four ACTIVE uniqueness invariants are mandatory.

## 6. Ceremony binding

Every confirmation must bind to the same:

- relationship type;
- exact QuoteFlow identifier;
- exact GHM identifier;
- ceremony ID;
- ceremony version.

A confirmation from an older or different ceremony must fail and cannot be reused against a new target.

## 7. Confirmation provenance

The persistence boundary must record enough information to answer:

1. who initiated the ceremony;
2. which side initiated it;
3. which authenticated QuoteFlow actor confirmed;
4. which authenticated GHM actor confirmed;
5. what exact target pair was confirmed;
6. when each confirmation occurred;
7. which ceremony/version was confirmed;
8. when ACTIVE was reached;
9. who/what caused revocation and why.

Provider credentials, access tokens, secrets, passwords, or raw authentication material must never be persisted in this relationship record.

## 8. Authorization

The persistence operation must derive GHM actor identity from authenticated GHM context.

### ACCOUNT

GHM confirmation requires the authenticated GHM principal to equal the exact target `account_identity.id`.

### BUSINESS

GHM confirmation requires:

- exact target Business;
- active `business_membership`;
- membership role `owner` or `administrator`.

Existing generic GHM `admin` role does not bypass this Business-side rule.

The QuoteFlow side must independently prove control of the exact user or active management authority over the exact organization.

## 9. Mutation boundary

Runtime must not receive direct table DML.

The preferred construction shape is a narrow, transactionally atomic operation boundary that:

1. authenticates the actor;
2. validates the ceremony;
3. validates the actor's side-specific authority;
4. locks the canonical relationship/ceremony rows;
5. validates current state/version;
6. records the confirmation;
7. activates only when both confirmations are valid;
8. enforces uniqueness atomically;
9. records provenance;
10. commits as one transaction.

Broad UPDATE/DELETE access is prohibited.

Existing provider-neutral external mapping functions must not be used as a substitute for this lifecycle operation.

## 10. Account and Business independence

ACCOUNT and BUSINESS relationships are separate records and separate authorization decisions.

An ACTIVE ACCOUNT link may be a prerequisite for future product workflows, but it is not proof of control over a GHM Business.

A BUSINESS link must independently establish:

- QuoteFlow organization control;
- GHM Business management authority;
- exact target compatibility;
- independent dual confirmation.

## 11. Revocation

Revocation must be an explicit governed operation.

It must:

- lock the current relationship;
- reject stale versions;
- record actor, timestamp, and reason;
- prevent future use of the relationship as active cross-system authority;
- preserve historical provenance;
- leave the opposite relationship type unchanged.

Re-linking after revocation creates a new ceremony.

## 12. Idempotency

Repeated confirmation for the same actor, relationship, ceremony, target pair, and effective state must be idempotent.

A repeated already-effective confirmation must not create duplicate provenance rows that falsely represent multiple independent confirmations.

A materially different target, ceremony, actor, or state must not be treated as the same idempotent request.

## 13. Concurrency

Qualification must demonstrate:

- competing ceremonies serialize correctly;
- stale versions fail;
- two confirmations cannot both activate conflicting relationships;
- uniqueness is enforced by the database, not application timing alone;
- rollback leaves no half-activated relationship;
- revocation racing with confirmation cannot produce an invalid ACTIVE result.

No last-write-wins behavior is permitted.

## 14. Recovery

If QuoteFlow confirmation succeeds while GHM confirmation is unavailable, state remains PENDING.

If GHM confirmation succeeds while QuoteFlow confirmation is unavailable, state remains PENDING.

A failed activation must be retryable through the same ceremony where valid, without creating a second conflicting ACTIVE relationship.

Exceptional governance recovery/revocation remains separately governed.

## 15. Qualification plan

Before runtime implementation is considered qualified, the live PostgreSQL harness must prove:

### Schema
- exact relationship separation;
- identifier preservation;
- required provenance;
- ACTIVE uniqueness constraints;
- no secret persistence.

### Authorization
- exact-account self-confirmation succeeds;
- non-target account fails;
- active Business owner succeeds;
- active Business administrator succeeds;
- active Business member fails;
- inactive/revoked membership fails;
- generic GHM admin without Business authority does not bypass Business membership;
- QuoteFlow-side confirmation is independently required.

### Lifecycle
- NONE → PENDING;
- one-sided confirmation remains PENDING;
- both valid confirmations → ACTIVE;
- invalid transition denied;
- stale ceremony/version denied;
- ACTIVE → REVOKED;
- REVOKED cannot reactivate;
- new ceremony required.

### Integrity
- exact-target binding;
- no profile matching;
- duplicate/idempotent confirmation;
- four ACTIVE uniqueness invariants;
- concurrent competing ceremonies;
- rollback/atomicity;
- provenance reconciliation.

### Privilege
- runtime direct INSERT denied;
- runtime direct UPDATE denied;
- runtime direct DELETE denied;
- only the narrow lifecycle operation is executable.

### Regression
- existing external mapping functions remain unchanged in semantics;
- existing Business membership authorization remains unchanged;
- existing GHM resource authorization remains intact;
- existing tests and qualification suites remain green.

## 16. Explicit non-goals

This contract does not authorize:

- creating the identity-link table;
- creating or altering external mapping tables;
- runtime implementation;
- HTTP exposure;
- QuoteFlow source changes;
- adapters;
- migration/import of existing QuoteFlow organizations/users;
- automatic matching;
- provider-specific credentials;
- shadow traffic;
- production routing;
- production cutover.

## 17. Construction gate

**PERSISTENCE DESIGN DEFINED — IMPLEMENTATION STILL BLOCKED.**

The architecture is now sufficiently bounded to move to a read-only implementation feasibility audit.

The next engineering action is to inspect the existing migration privilege model, external mapping functions, transaction helpers, operation registry, and test/qualification conventions so the eventual implementation can use existing canonical mechanisms rather than introducing duplicate infrastructure.

No production mutation is authorized by this document.
