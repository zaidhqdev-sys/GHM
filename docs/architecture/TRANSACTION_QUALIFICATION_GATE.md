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
9. Business creation must keep the account-row lock, membership-invariant check, Business insert, and owner-membership insert inside the same transaction so concurrent creation attempts for one account are serialized.

## Repository evidence now present

The first-slice Business Identity repository is implemented against the reconciled schema. Its protected operations use `withAuthorizedTransaction`, and Business creation locks the authenticated `account_identity` row with `FOR UPDATE` before checking for an existing active membership. The repository SQL is explicit and parameterized; the qualification of its runtime behavior remains open.

## Qualification boundary

The transaction gate no longer treats concrete repository SQL as blocked by missing schema reconciliation: the first Business Identity schema is applied and the repository SQL has been reconciled to it. The remaining work is evidence, not speculative schema design.

Qualification must verify:

- transaction success and failure behavior;
- one client per protected operation;
- authorization context remains bound to that client;
- rollback before release on failure;
- no second connection is acquired silently;
- Business creation serialization and atomic owner-membership creation;
- live runtime privileges are sufficient for the exact SQL and no broader authority is required.

## Production gate

This gate passes only when transaction behavior is verified together with authentication, authorization, explicit resource repositories, runtime boundary verification, and the reconciled database schema.
