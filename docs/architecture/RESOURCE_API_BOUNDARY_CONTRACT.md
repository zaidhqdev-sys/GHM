# GHM Resource API Boundary Contract

**Status: construction qualification — current governed slices QUALIFIED / PASS**

## Purpose

Define the governed Resource API boundary that exposes domain capabilities without generic table access. The Business Identity foundation, private Project Resource API slice, and dedicated Project public disclosure read boundary are qualified construction slices; additional resources remain subject to separate qualification.

This document is an architecture contract. It does not authorize product adapters, production traffic, or production cutover.

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
10. New resource endpoints require schema reconciliation, authorization qualification, positive/negative tests, and live qualification before that Resource API slice can close.
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

The authorization foundation is qualified for the canonical Business Identity slice and the private Project Resource API slice. The registry contains explicit resource/operation vocabulary, and the protected HTTP routes demonstrate the HTTP-to-AuthContext-to-service boundary against the canonical GHM PostgreSQL path.

The Business Identity capability has explicit contracts for account identity, Business identity, Business participation, public Business reads, Business creation, and managed Business identity updates. Its physical first-slice schema is `ghm.account_identity`, `ghm.business`, and `ghm.business_membership`.

The current protected HTTP surface is intentionally narrower than the full service surface. `GET /api/v1/profile` remains the qualified profile example, while the qualified private Project surface is limited to explicit create, owner-read, and owner-update operations. Service/repository operations must not become HTTP endpoints merely because they exist internally.

## Qualified Resource API slices

The Resource API currently has three qualified construction slices:

1. **Business Identity** — the governed profile/Business surface and its qualified authorization boundary.
2. **Project private** — the owner-bound Project surface using the qualified Project schema, repository, service, authorization, and transaction contracts.
3. **Project public disclosure** — the separately governed public projection/read boundary using explicit disclosure fields and the qualified public-read contract.

The qualified HTTP surface remains small and explicit:

- `GET /api/v1/profile` — authenticated principal's own account profile.
- `GET /api/v1/businesses/:businessId` — public-safe Business identity, subject to the existing eligibility rule.
- `GET /api/v1/businesses/slug/:slug` — public-safe Business identity by canonical slug, subject to the same eligibility rule.
- `POST /api/v1/businesses` — authenticated business-operator Business creation with atomic owner participation.
- `GET /api/v1/businesses/:businessId/managed` — authenticated managed-Business read, requiring active owner/administrator membership.
- `PATCH /api/v1/businesses/:businessId` — authenticated managed-Business identity update, limited to `name` and `slug`.
- `POST /api/v1/projects` - authenticated Project creation, with account ownership bound from the authenticated principal.
- `GET /api/v1/projects/:projectId` - authenticated owner-bound Project read; non-owners receive the same not-found boundary.
- `PATCH /api/v1/projects/:projectId` - authenticated owner-bound Project update; closed Projects reject mutation.

The Business Identity routes are the established qualified foundation. The Project private routes are separately qualified against the canonical GHM PostgreSQL path. The Project public disclosure boundary is separately qualified and must not inherit private Project authorization automatically. Each qualified endpoint has been verified for request shape, authorization, owner binding where applicable, route ordering, stable error mapping, transaction requirements, and disclosure boundaries.

## Explicit exclusions from the current qualified slices

Do not add:

- generic `/tables/:table` or equivalent query endpoints;
- arbitrary column selection or mutation;
- membership-management endpoints;
- verification or activation mutation endpoints;
- directory analytics or search;
- marketplace/search, quotes, notifications, support requests, reviews, trust, commercial state, storage, or realtime routes unless separately qualified;
- Connect or QuoteFlow adapters;
- provider/bootstrap authority mutations.

Membership-management HTTP routes remain outside the currently qualified slices because their later policy and operation contract require separate qualification. Verification and activation state are not caller-managed Business identity fields.

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

The Resource API gate for each current governed slice is closed only after that slice has demonstrated, end-to-end:

```text
explicit route
  → authenticated AuthContext where required
  → registered resource/operation
  → resource-specific authorization or explicit public disclosure policy
  → explicit service contract
  → explicit repository
  → canonical GHM schema
```

with positive, negative, ownership/role, transaction, and disclosure-boundary evidence and no generic table access.

**Current construction result: QUALIFIED / PASS for Business Identity, Project private, and Project public disclosure.**

Passing the current slices does not imply that every resource in the registry is implemented or production-ready. Future resources require their own governed qualification and must not inherit qualification by analogy.

## Production safety

This is construction-only. Zaid Connect and QuoteFlow remain on their existing production backend. No production database URL change, data migration, credential rotation, DNS/routing change, provider/bootstrap mutation, product adapter, shadow traffic, or cutover is authorized by this contract.
