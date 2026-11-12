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
10. No production product may depend on this contract until automated qualification tests cover allow, deny, ownership, role, and transaction-context cases. Those construction checks are satisfied for the first canonical Business Identity slice only; passing them does not authorize product traffic, which remains gated by product-adapter, shadow, production-readiness, and cutover evidence.

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

The first Business Identity Resource API slice is now qualified. This closes the Resource API gate for that slice only; future registry resources remain separately governed and require their own contract and qualification evidence.

## Production safety

This contract is construction-only. Zaid Connect and QuoteFlow remain on their existing production backend. No production cutover, product migration, credential rotation, or provider/bootstrap mutation is implied by the authorization qualification.


## 2026-11-12 security-boundary reconciliation — persistence is not actor authorization

The original persistence qualification remains valid for its narrow claim: direct runtime table DML is denied and the SECURITY DEFINER functions preserve the storage lifecycle. It did **not** qualify database-authenticated end-user identity or protect against a holder of the shared `ghm_runtime` credential supplying another account/business/object ID directly to those functions. The earlier design deliberately left tenant authorization in the application service; that assumption is superseded for sensitive database operations by the approved isolated issuer / signed Actor Gateway trust-boundary direction in ADR-001 and the 10 November release-readiness handover.

The 12 November whole-database SECURITY DEFINER audit identified five non-public storage functions still directly executable by `ghm_runtime`: `storage_create_pending`, `storage_get_object`, `storage_mark_available`, `storage_mark_deletion_pending`, and `storage_mark_deleted`. Application authorization/provider checks remain defense in depth, but do not establish a database actor boundary for direct SQL invocation. This is an OPEN finding, not an approved exception.

Target remediation: add signed Actor Gateway wrappers for storage metadata create/read/availability/deletion operations. Each wrapper must verify the v2 one-use HMAC assertion and compare its signed context to the actual actor, tenant, object ID and operation arguments; enforce active actor and current owner/administrator membership where mutation is required; and preserve provider-side verification before marking an object available/deleted. Then add a manual-only cutover that revokes runtime EXECUTE on the five legacy functions. Keep `storage_get_public_business_logo` as the narrowly scoped public approved-logo lookup unless separate evidence requires changing it. Do not revoke the current grants until the replacement gateway path and disposable PostgreSQL qualification pass.

Required adversarial evidence: runtime direct invocation denied after cutover; cross-tenant object read denied; non-member pending-object creation denied; member-but-not-manager lifecycle mutations denied; forged/expired/replayed/wrong-operation/context-substituted assertions denied; provider metadata mismatch never reaches available state; authorized upload/completion/read/deletion workflows still pass; public approved-logo lookup remains functional. No production cutover is authorized. The production Render role-administration blocker, fresh-backup gate and no-paid-infrastructure hosting constraint remain independent release blockers.
