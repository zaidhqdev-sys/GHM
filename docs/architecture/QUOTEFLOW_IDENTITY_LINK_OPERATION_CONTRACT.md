# QuoteFlow Identity Link — GHM Operation Contract

**Status:** GHM-SIDE AUTHORITY QUALIFIED — PERSISTENCE/IMPLEMENTATION NOT YET AUTHORIZED  
**Scope:** GHM-side operation authority for dual-sided QuoteFlow ↔ GHM identity linking  
**Construction branch:** `construction/quoteflow-identity-link-dual-confirmation`

## 1. Purpose

This contract defines the GHM-side operation boundary required before QuoteFlow identity links may be persisted or activated.

The selected product authority is **dual-sided confirmation**. GHM-side authority is now evidenced against the existing Business Identity/membership model. This document still does not authorize identity-link persistence, adapter implementation, HTTP exposure, shadow qualification, or production cutover.

## 2. Repository evidence reconciled

Current GHM source establishes:

- `AuthContext` contains `userId` and one of `admin | customer | business`.
- `ghm.business_membership` is canonical for Business participation.
- Membership roles are `owner | administrator | member`; statuses are `active | inactive | revoked`.
- There can be only one active owner per Business.
- Business management authority is already explicitly implemented as an **active membership with role `owner` or `administrator`**.
- `getManagedBusiness` and `assertManagedMembership` both use that same active owner/administrator rule.
- `ghm.account_external_identity` maps `(provider, subject)` to canonical `ghm.account_identity.id`.
- `ghm.business_external_mapping` maps `(provider, external_business_id)` to canonical `ghm.business.id`.
- Runtime direct INSERT/UPDATE/DELETE on the external mapping tables is revoked.
- Existing SECURITY DEFINER functions `auth_link_external_identity` and `auth_link_business_external_mapping` provide controlled mapping writes, but do not establish the selected dual-confirmation ceremony.

## 3. Qualified GHM-side confirmation authority

### Account link

For:

`QuoteFlow Supabase user UUID ↔ GHM account_identity.id`

the GHM-side confirmation authority is the **authenticated GHM account itself**: the authenticated `AuthContext.userId` must equal the exact target `account_identity.id`.

GHM `admin` is not required merely because the target is an account, and a caller cannot claim another account by supplying its ID.

### Business link

For:

`QuoteFlow organization UUID ↔ GHM business.id`

the GHM-side confirmation authority is an authenticated GHM principal with:

- the exact target Business in active membership;
- membership role `owner` or `administrator`.

This reuses the existing, evidenced GHM Business management rule rather than inventing a new interpretation of the generic `admin` platform role.

A GHM platform `admin` without the required Business membership is **not** automatically treated as the normal Business-side confirmation authority.

## 4. Required cross-system capability

Dual-sided linking still requires a **dedicated cross-system identity-link capability**.

The existing Business management permission is an input to that capability, not the capability itself.

The capability must not grant:

- arbitrary Business creation;
- Business ownership transfer;
- membership creation/removal;
- account creation;
- identity merging;
- external mapping reassignment;
- verification-state changes;
- production cutover authority.

The operation must derive the GHM actor from authenticated context. A caller-supplied GHM ID is an object identifier, never proof of authority.

## 5. Confirmation model

Normal activation is permitted only after both independent confirmations exist for the same relationship and ceremony.

One-sided confirmation remains non-active.

If either side is unavailable, activation fails closed.

A confirmation must be bound to:

- relationship type;
- exact QuoteFlow identifier;
- exact GHM identifier;
- authenticated actor/provenance;
- confirmation timestamp;
- ceremony/version identifier sufficient to prevent stale confirmation reuse.

## 6. Existing mapping functions

The provider-neutral mapping functions remain useful persistence primitives but are **not** the final dual-confirmation authority:

- `auth_link_external_identity(provider, subject, account_id)`
- `auth_link_business_external_mapping(provider, external_business_id, business_id)`

Neither currently proves:

- QuoteFlow-side confirmation;
- GHM-side actor authorization;
- dual-confirmation ceremony identity;
- lifecycle state `PENDING | ACTIVE | REVOKED`;
- revocation provenance;
- cross-system compatibility.

They must therefore not be exposed as a substitute for the dedicated identity-link operation.

## 7. Persistence boundary

The lifecycle contract remains:

`NONE → PENDING → ACTIVE → REVOKED`

Required durable state must distinguish at minimum:

- relationship type;
- QuoteFlow principal/organization identifier;
- GHM account/Business identifier;
- lifecycle state;
- QuoteFlow confirmation provenance;
- GHM confirmation provenance;
- initiation timestamp;
- activation timestamp;
- revocation timestamp and reason where applicable;
- concurrency/version protection;
- uniqueness constraints.

Exact schema remains deferred until persistence design is separately qualified.

## 8. Concurrency and failure

The operation must:

- serialize competing ceremonies for the same active relationship;
- prevent active uniqueness collisions atomically;
- reject stale confirmations;
- be idempotent for a repeated identical confirmation;
- fail closed on ambiguity or unavailable authority;
- never use last-write-wins semantics;
- make partial failure recoverable without creating conflicting ACTIVE relationships.

## 9. Revocation

Revocation is an explicit governed operation.

A revoked relationship cannot be used as active cross-system authority.

Revocation of an account relationship must not silently mutate a Business relationship.

Reactivation is not implicit; a new dual-confirmation ceremony is required.

Exceptional governance/recovery revocation may exist, but it must be separately authorized and audited. It does not create ordinary unilateral link-creation authority.

## 10. Qualification requirements

Before runtime implementation is promoted to qualified, live/repository evidence must demonstrate:

1. exact account self-confirmation authority;
2. non-target account denial;
3. exact Business owner/administrator authority;
4. active-member requirement;
5. member-role denial;
6. QuoteFlow-side confirmation requirement;
7. one-sided confirmation remains PENDING;
8. exact-target binding;
9. no email/phone/name/slug matching;
10. duplicate/idempotent behavior;
11. active-link uniqueness;
12. stale ceremony denial;
13. concurrent ceremony protection;
14. revocation and re-ceremony behavior;
15. direct table DML remains denied to runtime;
16. only the narrow operation is executable by runtime;
17. provenance is persisted correctly;
18. rollback/atomicity;
19. documentation reconciliation.

## 11. Explicit non-goals

This contract does not authorize:

- QuoteFlow source changes;
- Supabase mutations;
- identity-link schema creation;
- new HTTP endpoints;
- adapter implementation;
- automatic identity matching;
- migration/import of existing QuoteFlow users or organizations;
- provider-specific integration;
- shadow qualification;
- production routing;
- production cutover.

## 12. Current gate

**GHM-SIDE AUTHORITY QUALIFIED. PERSISTENCE/IMPLEMENTATION STILL BLOCKED PENDING THE DEDICATED IDENTITY-LINK PERSISTENCE CONTRACT AND QUALIFICATION PLAN.**

The next construction step is to define the exact persistence/lifecycle schema contract around the already-selected dual-confirmation authority. No runtime mutation should be introduced until that contract is reviewed and qualified.
