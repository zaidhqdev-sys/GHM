# Transaction Qualification Gate

## Status

Construction gate — not production-qualified.

## Purpose

GHM protected resource operations must bind authorization context to one checked-out PostgreSQL client and one transaction boundary. The transaction primitive currently delegates to `withTransaction`, which begins, commits, rolls back on failure, and releases the client. The authorized wrapper passes the same `AuthContext` into the transaction work. 

## Required properties

1. A protected operation receives an authenticated `AuthContext`.
2. The operation receives one checked-out `PoolClient`.
3. Authorization context and database client remain bound to the same operation.
4. Successful work commits exactly once.
5. Failed work rolls back before the client is released.
6. The client is released on both success and failure.
7. Repository code must not silently acquire a second pool connection for the same protected operation.
8. Transaction tests must verify both success and failure paths before the authorization boundary is qualified.

## Schema constraint

These tests are contract-level and must not require invented business tables. Concrete repository SQL remains blocked until the live GHM PostgreSQL catalog is captured and reconciled.

## Production gate

This gate passes only when transaction behavior is verified together with authentication, authorization, explicit resource repositories, runtime boundary verification, and the reconciled database schema.
