# GHM Authorization Boundary Contract

Status: construction / qualification gate

## Purpose

GHM authorization is resource-oriented. Authentication establishes identity; authorization establishes what that identity may do to a specific resource.

## Non-negotiable rules

1. A request must have an authenticated `AuthContext` before protected resource access.
2. Authorization must be evaluated against an explicit resource and operation.
3. Ownership must be checked against the authenticated principal, never a caller-supplied identity field alone.
4. Role checks are additional constraints, not substitutes for ownership.
5. Resource identifiers must be parameterized query values; table or column names must never come from request input.
6. Protected database operations that require authorization context must execute within one checked-out PostgreSQL client/transaction. Context cannot be established on one pool connection and assumed on another.
7. Admin authority must come from governed account state; there is no fixed-ID or startup promotion mechanism.
8. Authorization failures must not disclose whether unrelated resources exist.
9. Product adapters must map their application contracts into these GHM primitives rather than bypassing them.
10. No production product may depend on this contract until automated qualification tests cover allow, deny, ownership, role, and transaction-context cases.

## Boundary model

```text
HTTP request
   |
   v
Authentication
   |
   v
AuthContext { userId, role }
   |
   v
Resource + operation policy
   |
   +---- ownership check
   |
   +---- role check
   |
   v
single checked-out DB client / transaction
   |
   v
explicit resource repository
```

## Current construction primitives

`src/auth/authorization.ts` provides typed identity, resource vocabulary, ownership enforcement, and role enforcement. It is intentionally not yet connected to product endpoints.

## Qualification gate

The authorization gate remains blocked until the request authentication middleware, single-client transaction context, explicit resource repositories, and automated deny-path tests are implemented and verified together.
