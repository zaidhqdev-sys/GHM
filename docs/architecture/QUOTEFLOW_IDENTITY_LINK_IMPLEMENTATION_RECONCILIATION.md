# QuoteFlow ↔ GHM Identity Link — Implementation Feasibility Reconciliation

**Status:** IMPLEMENTATION FEASIBILITY QUALIFIED — CONSTRUCTION MAY PROCEED WITH PERSISTENCE, SUBJECT TO THE EXISTING PRODUCTION GATES

## Evidence

The existing GHM construction infrastructure is sufficient for the identity-link persistence boundary:

- `src/db/authorized-transaction.ts` provides `withAuthorizedTransaction(context, work, transactionPool?)`.
- It requires a validated `AuthContext` before entering the transaction.
- `src/db/transaction.ts` provides the canonical BEGIN/COMMIT/ROLLBACK boundary.
- Existing external mapping tables already use narrow controlled database mutation rather than runtime direct DML.
- Existing GHM Business membership/management authority is already defined as active `owner` or `administrator`.
- Connect authorization resolves the mapped GHM account before applying resource authorization and explicitly does not perform identity bootstrap.

## Construction shape

The identity-link implementation should use the existing transaction boundary rather than introducing a second transaction abstraction.

The persistence operation should be a narrow, authenticated service/repository operation backed by a dedicated database mutation boundary. It must keep the dual-confirmation ceremony distinct from provider-neutral external mapping rows.

The implementation must not:

- broaden `business` resource authorization;
- promote generic `admin` into Business-link authority;
- write external mapping tables directly from runtime;
- infer identity from profile attributes;
- add a second transaction framework;
- place cross-system linking inside Connect identity resolution/bootstrap.

## Required implementation layers

1. Migration defining the canonical identity-link ceremony/relationship persistence.
2. Database constraints/functions enforcing lifecycle, authority, uniqueness and atomic activation.
3. Repository with explicit ceremony/confirmation/revocation operations.
4. Service enforcing domain-level validation and authenticated provenance.
5. Unit tests for lifecycle/authorization/idempotency/concurrency semantics.
6. Live qualification harness against PostgreSQL.
7. Operation registry entry only after the operation contract is implemented.
8. Documentation reconciliation after qualification.

## Gate

**Construction may proceed to implementation.**

This does not authorize production cutover, QuoteFlow integration, HTTP exposure, adapter routing, shadow traffic, or migration of existing QuoteFlow data.

Production authority remains unchanged.
