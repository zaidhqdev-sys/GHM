# GHM Business Capability Operation Contract

**Status:** CONSTRUCTION AUTHORIZED — contract frozen 2026-09-16

## 1. Purpose

Define the narrow GHM resource boundary for a Business Capability assertion reconciled from the current Zaid Connect capability model.

This resource represents a Business's assertion that it has a canonical Capability. It is not a matching, ranking, recommendation, endorsement, certification, or guarantee system.

## 2. Resource identity

Canonical resource:

```text
business_capability
```

Canonical PostgreSQL relation:

```text
ghm.business_capability
```

Canonical parent resources are `ghm.business` and `ghm.capability`.

## 3. Operations

Initial operation vocabulary:

| Operation | Purpose |
|---|---|
| `read` | Read capability assertions visible to the authorized context. |
| `create` | Establish a Business Capability assertion through a governed service operation. |
| `update` | Reserved for a separately qualified transition authority; not runtime-authorized in this slice. |

There is no `delete` operation.

There is no public capability-management HTTP route authorized by this contract.

## 4. Typed identifiers

```text
BusinessCapabilityId = bigint
BusinessId = bigint
CapabilityId = uuid
AccountId = bigint
```

No provider-specific identifiers are accepted at the GHM boundary.

## 5. Assertion fields

The persisted assertion may contain:

```text
business_id
capability_id
proficiency_level
description
assertion_status
assertion_basis
verification_status
effective_from
effective_until
source_reference
submitted_at
verified_by
verified_at
verification_reason
created_by
created_at
updated_at
```

The canonical vocabularies are:

### Proficiency

```text
foundational
proficient
advanced
expert
```

### Assertion status

```text
active
withdrawn
```

### Assertion basis

```text
self_declared
documented
observed
third_party_attested
```

### Verification status

```text
unverified
pending
verified
rejected
revoked
expired
```

## 6. Read contract

Read access must be explicitly authorized against the Business and the authenticated Account's relationship to that Business. A Business membership is an authorization relationship and must not be copied into the assertion itself.

Capability taxonomy access is separately governed by the read-only `ghm.capability` boundary.

Read methods must use typed filters and parameterized values. Request input must never control SQL identifiers or arbitrary projections.

Public discovery, matching, ranking, recommendation, or semantic search are not authorized by this contract.

## 7. Create contract

Creation requires an authenticated `AuthContext` and governed Business management authority.

The service must derive `created_by` from the authenticated context. Caller-supplied provenance must not be trusted.

The service must validate:

- Business exists and is accessible to the caller;
- caller has the required Business management authority;
- Capability exists;
- Capability is active and selectable;
- proficiency is one of the canonical values when supplied;
- description is trimmed and within the bounded length;
- effective period is valid;
- source reference is bounded when supplied;
- duplicate `(business_id, capability_id)` is rejected by the database constraint.

The database is authoritative for duplicate prevention; application pre-checks are not a substitute for the unique constraint.

## 8. Create defaults

If omitted, creation uses:

```text
assertion_status = active
assertion_basis = self_declared
verification_status = unverified
```

Creation does not imply verification.

`verified_by`, `verified_at`, and `verification_reason` must remain absent for `unverified` or `pending` assertions.

## 9. Update boundary

No runtime UPDATE privilege is authorized in this construction slice.

Although the persisted model contains lifecycle and verification fields, mutation of those fields requires a concrete transition/verification authority and separate qualification.

The initial resource therefore must not expose generic update behavior merely because the table contains mutable columns.

## 10. Withdrawal and history

A withdrawn assertion is retained rather than deleted when a later lifecycle workflow establishes withdrawal authority.

This construction slice does not authorize a public `withdraw` operation. The `withdrawn` status exists because it is part of the governed source vocabulary.

## 11. Verification separation

Verification is distinct from Business assertion.

This resource may persist verification state required by the reconciled production model, but it does not authorize verifier administration, evidence verification workflows, accreditation decisions, endorsements, or guarantees.

Capability evidence is a separate boundary and is not included in the initial resource mutation surface.

## 12. Business authorization

The authenticated Account's Business membership must be evaluated using the canonical GHM Business membership model.

The initial service must not infer management authority from a capability assertion, Business identity alone, or arbitrary membership metadata.

No membership role is persisted on the Business Capability row.

## 13. Error boundary

The service must expose stable domain errors rather than PostgreSQL implementation details.

At minimum, distinguish:

- authentication required;
- Business access denied;
- Business not found / not accessible;
- Capability not found;
- Capability not selectable;
- invalid proficiency;
- invalid assertion status;
- invalid assertion basis;
- invalid verification status;
- invalid effective period;
- invalid source reference;
- duplicate Business Capability;
- unsupported mutation;
- transaction failure.

Errors must not disclose unrelated-resource existence.

Exact HTTP mapping is deferred until an HTTP resource route is separately authorized.

## 14. Concurrency

The unique `(business_id, capability_id)` constraint is authoritative.

Concurrent attempts to establish the same Business Capability must resolve through database uniqueness and qualification must verify at most one persisted row remains.

## 15. Repository contract

The intended typed repository surface is equivalent to:

```text
createBusinessCapability(context, input)
getBusinessCapability(context, businessCapabilityId)
listBusinessCapabilities(context, businessId)
```

An update method may exist only if the service contract is separately extended and qualified.

Repository implementations must use explicit `ghm.*` identifiers, parameterized values, and the authorized transaction context.

## 16. Service contract

The service owns validation and authorization orchestration.

It must not:

- accept caller-controlled `created_by`;
- bypass registry/authorization checks;
- treat self-declaration as verification;
- invent capability values;
- mutate verification state without explicit authority;
- expose generic SQL operations;
- perform matching, ranking, recommendations, or AI inference.

## 17. Registry contract

A dedicated resource registration is required before any HTTP exposure.

Initial intended resource:

```text
business_capability
```

Initial intended operations:

```text
read
create
```

Authorization remains resource- and operation-specific.

## 18. No HTTP exposure yet

This contract deliberately does not authorize a new standalone Business Capability API route.

GHM construction begins with the domain/resource boundary and qualification rather than speculative public API exposure.

## 19. Qualification requirements

Before this contract is qualified, evidence must demonstrate:

1. authenticated context is required;
2. Business management authorization is enforced;
3. authorized Business read works;
4. unauthorized Business read is denied without unrelated-resource disclosure;
5. Capability reference must exist and be active/selectable;
6. invalid capability is rejected;
7. invalid proficiency is rejected;
8. invalid assertion values are rejected;
9. invalid effective period is rejected;
10. caller-controlled `created_by` is ignored/rejected;
11. duplicate creation is rejected;
12. concurrent duplicate creation is safe;
13. runtime UPDATE is denied;
14. runtime DELETE is denied;
15. verification-state invariants are enforced;
16. least-privilege runtime grants match the operation surface;
17. build, tests, and diff checks pass;
18. no previously qualified GHM capability regresses.

## 20. Construction boundary

Authorized sequence:

```text
migration
  -> typed contracts
  -> repository
  -> service
  -> registry
  -> unit/integration qualification
  -> runtime privilege qualification
```

Production migration, Zaid Connect schema changes, product cutover, and public HTTP exposure are outside this contract.
