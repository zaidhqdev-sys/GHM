# GHM Authorization Boundary Contract

**Status: CLOSED / PASS — construction qualification for the first canonical Business Identity slice**

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
Registered resource + operation
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

## Current construction implementation

`src/auth/http.ts` authenticates the request into the immutable verified `AuthContext`. `src/resources/registry.ts` defines the fixed resource/operation vocabulary. `src/auth/authorization.ts` provides ownership and role assertions. `src/db/authorized-transaction.ts` carries the same context into the single checked-out PostgreSQL client used by protected resource work. The Business Identity repository uses fixed, reconciled `ghm.*` identifiers.

The real Express application currently exposes the protected first-slice profile route at `GET /api/v1/profile`. It is guarded by authentication and registered resource access before invoking the Business Identity service.

## Qualification result

The first canonical Business Identity slice passed the construction authorization qualification on 2026-09-10.

Evidence includes:

- automated authentication, registry, ownership, role, transaction, and repository deny-path tests;
- live Business Identity qualification against the canonical `ghm` schema;
- real HTTP qualification through the Express application against the canonical PostgreSQL path;
- missing-auth, invalid-token, invalid-role, authenticated-profile, and verified-identity-binding checks.

See `AUTHORIZATION_QUALIFICATION_GATE.md` for the gate record and exact qualification output.

## Scope limitation

This contract does not imply that every resource in the registry has an implemented HTTP endpoint. Registry membership is a governed vocabulary; route exposure requires a concrete resource contract, authorization rule, repository boundary, and qualification evidence.

The Resource API gate remains open until explicit resource routes/contracts are qualified without generic table access.

## Production safety

This contract is construction-only. Zaid Connect and QuoteFlow remain on their existing production backend. No production cutover, product migration, credential rotation, or provider/bootstrap mutation is implied by the authorization qualification.
