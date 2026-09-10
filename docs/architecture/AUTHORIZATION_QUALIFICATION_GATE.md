# GHM Authorization Qualification Gate

**Status:** CLOSED / PASS — construction qualification
**Purpose:** define the minimum evidence required before GHM authorization is considered qualified for product traffic.

## Current construction boundary

GHM now has explicit primitives for:

- JWT request authentication into an immutable `AuthContext`;
- resource-oriented authorization vocabulary;
- ownership and role assertions;
- a fixed resource/operation registry;
- an authorized transaction boundary carrying the same `AuthContext` into one PostgreSQL client;
- contract-only repositories that refuse to invent SQL before database reconciliation.

These primitives are not yet a production authorization system.

## Qualification requirements

### Authentication

- missing credentials are denied;
- malformed or unverifiable tokens are denied;
- invalid user identity claims are denied;
- invalid roles are denied;
- verified identity is the only source of request principal and role.

**Evidence:** automated construction tests passed for missing bearer credentials, invalid tokens, invalid roles, invalid user IDs, and immutable verified AuthContext binding. Live HTTP qualification additionally passed missing-auth, invalid-token, and invalid-role denial through the real Express boundary.

### Authorization

- only registered resources and operations are reachable;
- ownership is checked against authenticated identity;
- role checks are explicit where required;
- denied operations do not fall through to database execution;
- no request-controlled table or column identifiers are accepted.

**Evidence:** registry, ownership, role, and deny-path tests passed. Live Business Identity qualification passed role authorization rejection and inactive-membership rejection. Live HTTP qualification passed denial before resource execution for missing authentication, invalid tokens, and invalid roles.

### Transaction boundary

Protected resource work must execute using one checked-out PostgreSQL client. Authorization context must remain bound to that operation. A failed operation must roll back and release the client.

**Evidence:** transaction qualification passed commit, rollback, release, single-client, same-context, and invalid-context-before-checkout tests. Live Business Identity qualification passed atomic duplicate-slug rollback and concurrent business-creation serialization.

### Repository boundary

Repositories must be explicit per governed resource. SQL must use reconciled schema identifiers only. No repository may create or alter product schema at request time or startup.

**Evidence:** Business Identity repository qualification passed against the canonical `ghm` schema, including profile read, business creation, managed read/update, approval boundary, membership checks, and cleanup. SQL identifiers are fixed to reconciled `ghm.account_identity`, `ghm.business`, and `ghm.business_membership` objects.

## Qualification evidence

The construction branch provided automated tests for authentication, ownership, role assertions, registry membership, transaction behavior, and repository deny paths.

The final construction qualification additionally required reconciliation against the live GHM PostgreSQL catalog and an end-to-end authorization test against the canonical schema.

### Live qualification result — 2026-09-10

The following construction qualification commands were executed locally against the live GHM PostgreSQL environment:

```text
npm test
npm run qualify:business-identity-runtime
npm run qualify:authorization-http
npm run verify:runtime
```

Results:

```text
31 tests
31 pass
0 fail

GHM BUSINESS IDENTITY RUNTIME QUALIFICATION: PASS

HTTP MISSING AUTH DENIAL PASS
HTTP INVALID TOKEN DENIAL PASS
HTTP AUTHENTICATED CANONICAL PROFILE PASS
HTTP VERIFIED IDENTITY BINDING PASS
HTTP INVALID ROLE DENIAL PASS
GHM HTTP AUTHORIZATION QUALIFICATION: PASS

Runtime boundary verification PASSED.
```

The HTTP qualification exercised the real Express application and canonical database path rather than the mock service used by the unit-level HTTP tests. Runtime identity was verified as `ghm_db/ghm_runtime`; cleanup authority was verified separately as `ghm_db/ghm_migrator` by the Business Identity live qualification.

## Gate decision

**CLOSED / PASS for construction qualification of the first canonical Business Identity slice.**

This closes the previously missing end-to-end HTTP authorization evidence for the first governed slice.

This does **not** close the broader GHM replacement program. In particular, it does not authorize:

- production database URL changes;
- production cutover from the existing backend;
- Zaid Connect or QuoteFlow migration;
- removal of legacy database authority such as `ghm_db_user`;
- provider/bootstrap authority mutations;
- completion of the Resource API, Operational Boundary, Product Adapter, Shadow Qualification, or Controlled Cutover gates.

The provider/bootstrap authority and legacy-role cleanup remain separately constrained by the currently available managed PostgreSQL authority.

## Production safety

This gate is construction-only. Zaid Connect and QuoteFlow remain on their existing production backend. No production cutover is implied by passing this gate.
