# GHM Resource API Boundary Contract

**Status: construction / architecture qualification**

## Purpose

Define the next governed boundary after the qualified first-slice authorization foundation: explicit resource APIs that expose domain capabilities without generic table access.

This document is an architecture contract. It does not authorize product adapters, production traffic, or completion of the Resource API gate.

## Non-negotiable rules

1. Every protected endpoint maps to one explicit governed resource and operation.
2. HTTP routes must not accept a table name, schema name, column name, SQL fragment, or arbitrary query shape from the caller.
3. A route may expose only fields defined by its resource contract; database rows are not automatically public API representations.
4. Authentication produces the immutable `AuthContext`; authorization is evaluated before protected resource execution.
5. Resource authorization must remain bound to the same operation context used by the repository transaction.
6. Each resource owns an explicit service contract and explicit repository contract. Cross-resource SQL shortcuts are not permitted.
7. Repository SQL uses fixed, reconciled schema identifiers and parameterized values.
8. Resource handlers must translate domain outcomes into stable HTTP outcomes without exposing SQL, PostgreSQL role details, secrets, or unrelated resource existence.
9. Resource creation/update operations must preserve the transaction requirements established by the resource contract.
10. New resource endpoints require schema reconciliation, authorization qualification, positive/negative tests, and live qualification before the Resource API gate can close.
11. Product adapters must consume resource contracts rather than bypassing the Resource API boundary.

## Boundary model

```text
HTTP route
   |
   v
Authentication
   |
   v
Registered resource + operation
   |
   v
Resource input validation
   |
   v
Domain service
   |
   +---- authorization / ownership
   |
   +---- transaction context where required
   |
   v
Explicit resource repository
   |
   v
Reconciled GHM schema
```

## Current qualified foundation

The authorization foundation is already qualified for the first canonical Business Identity slice. The registry contains explicit resource/operation vocabulary, and the protected profile route demonstrates the HTTP-to-AuthContext-to-service boundary against the canonical GHM PostgreSQL path.

The Business Identity capability already has explicit contracts for account identity, Business identity, Business participation, public Business reads, Business creation, and managed Business identity updates. Its physical first-slice schema is `ghm.account_identity`, `ghm.business`, and `ghm.business_membership`.

The current protected HTTP surface is intentionally narrower than the full Business Identity service surface. `GET /api/v1/profile` is the existing qualified example; service/repository operations must not become HTTP endpoints merely because they exist internally.

## First Resource API slice

The first Resource API implementation target is **Business Identity**, using only operations whose schema, authorization, and transaction contracts are already evidenced.

The initial HTTP surface should remain small and explicit:

- `GET /api/v1/profile` — authenticated principal's own account profile.
- `GET /api/v1/businesses/:businessId` — public-safe Business identity, subject to the existing eligibility rule.
- `GET /api/v1/businesses/slug/:slug` — public-safe Business identity by canonical slug, subject to the same eligibility rule.
- `POST /api/v1/businesses` — authenticated business-operator Business creation with atomic owner participation.
- `GET /api/v1/businesses/:businessId/managed` — authenticated managed-Business read, requiring active owner/administrator membership.
- `PATCH /api/v1/businesses/:businessId` — authenticated managed-Business identity update, limited to `name` and `slug`.

These routes are a proposed first-slice surface, not yet qualified. Implementation must verify the exact service error vocabulary, request/response shapes, route ordering, and public/private disclosure rules before code is added.

## Explicit exclusions from the first slice

Do not add:

- generic `/tables/:table` or equivalent query endpoints;
- arbitrary column selection or mutation;
- membership-management endpoints;
- verification or activation mutation endpoints;
- directory analytics or search;
- projects, quotes, notifications, support requests, reviews, trust, commercial state, storage, or realtime routes;
- Connect or QuoteFlow adapters;
- provider/bootstrap authority mutations.

Membership-management HTTP routes remain outside the first slice because their later policy and operation contract require separate qualification. Verification and activation state are not caller-managed Business identity fields.

## Contract requirements per endpoint

Before an endpoint is considered qualified, its evidence record must identify:

- HTTP method and canonical path;
- resource and operation registry entry;
- authentication requirement;
- authorization rule;
- request schema and allowed fields;
- response schema and disclosure classification;
- domain service operation;
- repository operation;
- fixed GHM schema identifiers used by the repository;
- transaction requirement;
- expected success and denial/error outcomes;
- automated positive and negative tests;
- live qualification evidence against the canonical GHM schema.

## Gate closure condition

The Resource API gate can close only when the first governed resource slice has demonstrated, end-to-end:

```text
explicit route
  → authenticated AuthContext
  → registered resource/operation
  → resource-specific authorization
  → explicit service contract
  → explicit repository
  → canonical GHM schema
```

with positive, negative, ownership/role, transaction, and disclosure-boundary evidence and no generic table access.

Passing the first slice does not imply that every resource in the registry is implemented or production-ready.

## Production safety

This is construction-only. Zaid Connect and QuoteFlow remain on their existing production backend. No production database URL change, data migration, credential rotation, DNS/routing change, provider/bootstrap mutation, product adapter, shadow traffic, or cutover is authorized by this contract.
