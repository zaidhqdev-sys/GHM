# Transaction Qualification Gate

## Status

Construction gate — **CLOSED / PASS** for the first Business Identity slice against the relocated `ghm` schema.

This is not production-qualified and does not authorize product cutover.

## Purpose

GHM protected resource operations must bind authorization context to one checked-out PostgreSQL client and one transaction boundary. The transaction primitive delegates to `withTransaction`, which begins, commits, rolls back on failure, and releases the client. The authorized wrapper passes the same `AuthContext` into the transaction work.

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

## Repository evidence

The first-slice Business Identity repository is implemented against the reconciled `ghm` schema. Its protected operations use `withAuthorizedTransaction`, and Business creation locks the authenticated `ghm.account_identity` row with `FOR UPDATE` before checking for an existing active membership. The repository SQL is explicit and parameterized.

The transaction primitive is covered by unit tests for successful commit, rollback and release on failure, same-context binding, and rejection of invalid authentication context before checkout. The repository tests and authorization/resource tests pass as part of the 28-test suite.

## Qualification boundary

The schema reconciliation gate is closed: the first Business Identity schema is applied in `ghm`, its runtime privileges are measured, and the relocated runtime qualification passes. Transaction qualification therefore evaluates evidence against the actual relocated schema rather than treating schema design as an open dependency.

## Live qualification evidence — PASS

On 2026-09-10, the canonical live qualification was run from the construction branch using the dedicated runtime and cleanup-authority paths:

```text
RUNTIME IDENTITY PASS: ghm_db/ghm_runtime
CLEANUP AUTHORITY PASS: ghm_db/ghm_migrator
PROFILE READ PASS
EMPTY MEMBERSHIP READ PASS
BUSINESS CREATE + OWNER MEMBERSHIP PASS
MANAGED READ PASS
PUBLIC APPROVAL BOUNDARY PASS
MANAGED UPDATE PASS
ROLE AUTHORIZATION REJECTION PASS
ACTIVE MEMBERSHIP REJECTION PASS
DUPLICATE SLUG ATOMIC FAILURE PASS
DUPLICATE SLUG ATOMIC ROLLBACK PASS
CONCURRENT BUSINESS CREATION SERIALIZATION PASS
GHM BUSINESS IDENTITY RUNTIME QUALIFICATION: PASS
```

The repository validation run immediately preceding qualification also passed:

```text
npm run build       PASS
npm test            28/28 PASS
git diff --check    PASS
npm run qualify:business-identity-runtime  PASS
npm run verify:runtime                     PASS
```

The runtime-boundary verification reported:

```text
Runtime boundary verification PASSED.
```

The live qualification therefore verifies the transaction-sensitive Business Identity behavior on the relocated `ghm` schema, including atomic duplicate-slug rollback and concurrent Business creation serialization.

## Gate result

```text
TRANSACTION QUALIFICATION — CLOSED / PASS
```

This closes the first-slice transaction qualification gate for construction.

It does **not** authorize:

- production `DATABASE_URL` changes;
- production runtime cutover;
- removal of `ghm_db_user` or its bootstrap memberships;
- product schema migration;
- Zaid Connect or QuoteFlow production changes;
- merge of the construction branch into `main`.

## Next governed gates

1. Reconcile this transaction PASS into the construction handover/qualification sequence.
2. Make the separate TEMP privilege decision if runtime use requires it.
3. Establish independent provider/bootstrap authority and qualify cleanup of legacy `ghm_db_user` memberships.
4. Qualify legacy-authority removal and recovery paths.
5. Reconcile product-resource schema requirements without copying Zaid Connect's Supabase schema blindly.
6. Only after recovery and shadow qualification gates, consider product migration/cutover.

## Production gate

This gate passes only for the qualified first-slice construction boundary. Broader GHM production qualification requires transaction behavior, authentication, authorization, explicit resource repositories, runtime boundary verification, reconciled database schema, authority/recovery qualification, and eventual product-specific migration evidence together.
