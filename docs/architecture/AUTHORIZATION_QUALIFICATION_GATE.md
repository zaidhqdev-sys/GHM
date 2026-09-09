# GHM Authorization Qualification Gate

**Status:** construction
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

### Authorization

- only registered resources and operations are reachable;
- ownership is checked against authenticated identity;
- role checks are explicit where required;
- denied operations do not fall through to database execution;
- no request-controlled table or column identifiers are accepted.

### Transaction boundary

Protected resource work must execute using one checked-out PostgreSQL client. Authorization context must remain bound to that operation. A failed operation must roll back and release the client.

### Repository boundary

Repositories must be explicit per governed resource. SQL must use reconciled schema identifiers only. No repository may create or alter product schema at request time or startup.

## Qualification evidence

The construction branch must provide automated tests for authentication, ownership, role assertions, registry membership, transaction behavior, and repository deny paths before this gate can close.

The final gate additionally requires reconciliation against the live GHM PostgreSQL catalog and an end-to-end authorization test against the canonical schema.

## Production safety

This gate is construction-only. Zaid Connect and QuoteFlow remain on their existing production backend. No production cutover is implied by passing these tests.
