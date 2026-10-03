# QuoteFlow Identity Link — GHM Operation Contract

**Status:** CONTRACT DRAFT — AUTHORITY NOT YET QUALIFIED  
**Scope:** GHM-side operation authority for dual-sided QuoteFlow ↔ GHM identity linking  
**Construction branch:** `construction/quoteflow-identity-link-dual-confirmation`

## 1. Purpose

This contract defines the GHM-side operation boundary required before QuoteFlow identity links may be persisted or activated.

The selected product authority is **dual-sided confirmation**. This document does not authorize a unilateral GHM link, schema mutation, adapter, HTTP route, shadow qualification, or production cutover.

## 2. Repository evidence reconciled

Current GHM source establishes:

- `AuthContext` contains `userId` and one of `admin | customer | business`.
- Existing resource authorization is resource-level and does not expose a dedicated cross-system identity-link capability.
- `ghm.account_external_identity` is a provider-neutral mapping from `(provider, subject)` to canonical `ghm.account_identity.id`.
- `ghm.business_external_mapping` is a provider-neutral mapping from `(provider, external_business_id)` to canonical `ghm.business.id`.
- Runtime has SELECT access to those mapping tables but direct INSERT/UPDATE/DELETE is revoked.
- Existing SECURITY DEFINER functions `auth_link_external_identity` and `auth_link_business_external_mapping` provide controlled database writes, but their current signatures accept the target GHM account/business ID and do **not** establish QuoteFlow-side confirmation or a dedicated GHM cross-system authorization decision.
- The existing business mapping function explicitly does not create businesses, alter membership/ownership, or infer identity from names/email.

Therefore these existing mapping functions are **not themselves qualified as the dual-confirmation operation**.

## 3. Canonical authority

### Account link

Relationship:

`QuoteFlow Supabase user UUID ↔ GHM account_identity.id`

Activation requires:

1. authenticated QuoteFlow-side confirmation for the exact QuoteFlow principal;
2. authenticated GHM-side confirmation for the exact target GHM account;
3. proof that each actor controls or is authorized by its own system;
4. explicit compatibility checks;
5. uniqueness/cardinality checks;
6. durable provenance for both confirmations.

An account link does not authorize a Business link.

### Business link

Relationship:

`QuoteFlow organization UUID ↔ GHM business.id`

Activation requires:

1. authenticated QuoteFlow-side confirmation for the exact organization;
2. authenticated GHM-side confirmation for the exact target Business;
3. GHM-side evidence of active membership and the separately qualified management authority required to confirm the link;
4. compatibility and uniqueness checks;
5. durable provenance for both confirmations.

Existing GHM `admin`, `business`, or Business ownership/admin semantics must not be silently promoted into cross-system link authority.

## 4. Required GHM capability

GHM must expose a **dedicated cross-system identity-link capability**.

The capability must be narrower than ordinary Business administration and must not grant:

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

The current provider-neutral functions are retained as historical construction evidence, not reinterpreted as the final operation authority.

`auth_link_external_identity(provider, subject, account_id)` currently establishes a mapping if the supplied target account exists.

`auth_link_business_external_mapping(provider, external_business_id, business_id)` currently establishes a mapping if the supplied target Business exists.

Neither function currently proves:

- QuoteFlow-side confirmation;
- GHM-side management authority;
- dual-confirmation ceremony identity;
- cross-system compatibility;
- lifecycle state such as PENDING/ACTIVE/REVOKED;
- revocation provenance.

Consequently, the identity-link construction must not simply route the new product flow through these functions without an explicit authority wrapper/contract.

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

Exact schema is intentionally deferred until the operation authority is qualified.

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

Before implementation is promoted from draft to qualified, live/repository evidence must demonstrate:

1. exact GHM-side authority resolution;
2. non-authorized GHM principal denial;
3. authorized GHM principal acceptance;
4. QuoteFlow-side confirmation requirement;
5. one-sided confirmation remains PENDING;
6. exact-target binding;
7. no email/phone/name/slug matching;
8. duplicate/idempotent behavior;
9. active-link uniqueness;
10. stale ceremony denial;
11. concurrent ceremony protection;
12. revocation and re-ceremony behavior;
13. direct table DML remains denied to runtime;
14. only the narrow operation is executable by runtime;
15. provenance is persisted correctly;
16. rollback/atomicity;
17. documentation reconciliation.

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

**BLOCKED FOR IMPLEMENTATION AUTHORITY.**

The remaining Founder/Product engineering gate is to bind the GHM-side confirmation authority to an evidenced existing authority model or explicitly qualify a dedicated cross-system capability.

Only after that gate passes should persistence and runtime construction begin.
