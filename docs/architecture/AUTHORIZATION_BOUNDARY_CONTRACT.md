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

## 12 November 2026 — Storage metadata authority status

The original persistence qualification remains valid for its narrow claim: direct runtime table DML is denied and the legacy SECURITY DEFINER functions preserve the storage lifecycle. It did not establish database-authenticated end-user identity. The 12 November audit correctly identified five legacy functions that remained directly executable by the shared `ghm_runtime` credential: `storage_create_pending`, `storage_get_object`, `storage_mark_available`, `storage_mark_deletion_pending`, and `storage_mark_deleted`.

**Source remediation is now implemented:**
- `gateway_storage_create_pending`, `gateway_storage_get_object`, and `gateway_storage_mark_deletion_pending` require the one-use signed Actor Gateway v2 assertion, validate the signed operation/context against database arguments, and enforce the actor's active Business membership and owner/administrator authority where mutation is required.
- `gateway_storage_mark_available` and `gateway_storage_mark_deleted` require both the user actor assertion and a separate domain-separated Resource API provider attestation. PostgreSQL verifies the 32-byte HMAC, operation, 60-second freshness, exact provider context and one-use nonce.
- The Actor Gateway has the corresponding authenticated routes and a dedicated database reader. The Resource API uses the HTTPS Storage Metadata Gateway client for metadata create/read/deletion-pending/availability/deletion operations and forwards the caller's bearer token. Production storage fails closed if the Actor Gateway URL or provider-attestation secret is missing; it cannot silently fall back to direct runtime metadata access.
- `storage_get_public_business_logo` remains the narrowly scoped public approved-logo lookup; this work does not broaden public storage access.

**Disposable qualification passed:** the migrations applied to PostgreSQL 18. The expanded provider dual-proof qualification now exercised signed pending-object creation and metadata read; private object access for an authorized Business member and cross-business private-read denial; non-member creation denial; ordinary-member deletion denial; legitimate pending → available → deletion-pending → deleted lifecycle; invalid provider signature; expired attestation; provider-context substitution; wrong provider operation; provider metadata mismatch without state transition; cross-business actor; nonce replay across different pending objects; and invalid lifecycle state. Verifier/secret ACL checks confirmed neither runtime nor Actor Gateway can read the secret or directly execute the verifier, while only Actor Gateway can execute the transition wrappers. A separate five-function cutover rehearsal revoked PUBLIC, runtime, migrator and Actor Gateway execution, confirmed direct calls were denied for runtime/migrator/Actor Gateway logins, verified the replacement Actor Gateway wrappers remained executable, and restored the original execution state. The expanded storage qualification and complete repository workflow passed in run `43237334881` (960/960 main test suite; both CI jobs passed).

**Current status: SOURCE REMEDIATION COMPLETE; DISPOSABLE QUALIFICATION PASSED; PRODUCTION CUTOVER OPEN.** The five legacy direct runtime grants have not been revoked in production. No production migration, provider secret provisioning, role change or deployment occurred. Production cutover still requires the documented fresh verified backup, production role-administration access, final operational approval and a separately reviewed manual execution/rollback window.

Disposable PostgreSQL 18 adversarial evidence now demonstrates: all five legacy direct functions are denied to runtime, migrator and Actor Gateway logins during the revocation rehearsal; the five signed replacement wrappers retain Actor Gateway execution; the original execution state is restored; cross-business private reads and mutations, non-member creation, ordinary-member deletion requests and disabled actors are denied; provider proof signature/expiry/context/operation/metadata mismatch and nonce replay are rejected; and the legitimate pending → available → deletion-pending → deleted metadata lifecycle succeeds. This database qualification does not by itself prove a fresh external provider upload/HEAD/read/delete end-to-end run or production recovery. No production cutover is authorized. The production Render role-administration blocker, fresh independently verified backup, operational/deployment/rollback approval and no-paid-infrastructure hosting constraint remain independent release blockers.
