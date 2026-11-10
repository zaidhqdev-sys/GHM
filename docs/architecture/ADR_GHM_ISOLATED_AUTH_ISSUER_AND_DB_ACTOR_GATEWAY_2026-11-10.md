# ADR: Isolated GHM authentication issuer and database actor gateway

- **Date:** 2026-11-10
- **Status:** Accepted by owner for isolated implementation and qualification
- **Decision owner:** GHM owner
- **Base:** `main` at `22de21b5e024a48477dc00f187b9cc925a27eb23`
- **Scope:** Architecture and isolated implementation only. This ADR does not authorize production provisioning, secrets, grants, migrations, or deployment.

## Context

The ordinary GHM resource API currently verifies ES256 bearer tokens in Node and resolves the token subject to an active account. It then uses a shared `ghm_runtime` PostgreSQL login. PostgreSQL sees that shared service principal, not the end-user actor.

The ordinary application process also loads ES256 signing material and can call a signer with a caller-selected account ID. Consequently, a database gateway that merely verifies access tokens issued by that same ordinary process would not establish an independent identity boundary.

Actor-sensitive `SECURITY DEFINER` functions currently accept caller-supplied account/actor IDs, and `ghm_runtime` has auth/session mutation function grants. PR #244 additionally allows direct engagement-event INSERT with caller-supplied account and business attribution.

## Decision

Adopt two independently credentialed, GHM-owned trust components:

1. **Authentication issuer** — owns primary credential verification, identity resolution, session/refresh/recovery lifecycle, and ES256 signing.
2. **Typed database actor gateway** — independently verifies GHM access tokens and exposes only allow-listed typed resource operations. It uses a dedicated PostgreSQL login unavailable to the ordinary API.

The ordinary resource API remains an untrusted caller of both components. It cannot access issuer signing keys, issuer-only database credentials, gateway database credentials, or any generic arbitrary-subject signing or arbitrary-SQL/function execution interface.

The issuer and gateway are separate security principals and independently deployable services. They may initially be deployed as separate Render services after a separate infrastructure review. This ADR does not provision them.

## Authentication issuer contract

- Preserve ES256 access JWTs, `iss=ghm-auth`, `aud=ghm-api`, required `kid`, and the existing 15-minute access-token lifetime.
- Preserve opaque rotating refresh credentials and existing recovery/session semantics.
- Preserve natural expiry of already-issued access JWTs after logout/revocation. Do not add `sid`, online per-request session validation, or a new revocation policy without a separate decision.
- Signing is an internal issuer operation only. No public generic `sign(payload)` or `sign(accountId)` API is exposed.
- The issuer derives `sub` from its own verified credential/session workflow and persisted canonical account identity. A caller-supplied account ID is never sufficient to issue a token.
- Issuer-only secrets (ES256 private key and refresh-token pepper) and database credentials are mounted only in the issuer service.
- Move all password, external identity, session, refresh, recovery and account-security mutation operations to issuer-owned repositories/functions. Inventory every existing caller before revoking ordinary-runtime grants.
- The ordinary API may continue to verify access JWTs for early request rejection and routing, but this verification is not the database authorization proof.

## Typed database actor gateway contract

- The gateway independently verifies the issuer's ES256 token, including algorithm pinning, signature, `kid`, issuer, audience, time claims, and canonical account status.
- The gateway accepts a bearer token plus a typed operation DTO. It never accepts raw SQL, arbitrary schema/function names, a client-selected database role, or an actor ID as proof.
- The gateway derives the actor ID from the verified token subject and resolves current account and tenant membership/role state before dispatch.
- The gateway uses a dedicated login, `ghm_actor_gateway`, which is not a member of `ghm_runtime` and is unavailable to the ordinary API. The migration owner remains separate.
- Only the gateway login may invoke the protected actor-context establishment function. The function must verify `session_user = 'ghm_actor_gateway'`; checking `current_user` inside SECURITY DEFINER alone is insufficient.
- The protected context is transaction-bound and stored in a private schema/table keyed to the backend and transaction. Ordinary runtime has no table access, no setter EXECUTE grant, and no role membership allowing it to assume the gateway login.
- A caller-writable custom GUC or temporary table alone is not proof. The protected setter derives context from a verified gateway operation and binds it to the active transaction. Actor-sensitive SECURITY DEFINER functions read only this protected context and still re-check current account status and tenant membership/role at operation time.
- The gateway uses fixed, parameterized SQL and allow-listed repository methods. It does not become a general-purpose SQL proxy.

## Database privilege model

Target roles are distinct:

- `ghm_migrator` / `ghm_schema_owner`: schema ownership and migrations only; not used by application services.
- `ghm_auth_issuer`: only issuer-required auth/session operations and minimal identity reads; credentials only in issuer.
- `ghm_actor_gateway`: protected actor-context establishment and approved actor-scoped resource operations; credentials only in gateway.
- `ghm_runtime`: ordinary API runtime; no issuer signing material, no issuer-only auth mutation grants, no actor-context setter, and no direct access to protected actor-scoped tables/RPCs.

Do not revoke or alter live grants until all production callers have been inventoried, replacement paths are deployed and verified, and a separately approved migration/rollback plan exists. Effective grants must include PUBLIC, inherited memberships, default privileges, SECURITY DEFINER ownership and object-level grants in the review.

## Operation coverage

The common boundary must cover at least:

- #236: business registration identity read/update.
- #237: business profile update.
- #243: supplier classification update.
- #250: capability draft create/update/lifecycle transition.
- #244: engagement-event creation, including business and account attribution. Direct INSERT by ordinary runtime must be removed after the typed gateway path is ready.
- Auth/session operations: password lookup/set/change, session creation/validation/revocation, refresh rotation, recovery issue/redeem, external identity lookup/bootstrap, and account disablement.

## Failure and compatibility policy

- Fail closed on missing, malformed, expired, wrong-issuer, wrong-audience, wrong-algorithm, unknown-key, inactive-account, absent-membership, or unauthorized-role conditions.
- No fallback from gateway failure to direct `ghm_runtime` SQL for protected operations.
- No actor ID supplied by an ordinary API caller can override the verified subject.
- Re-check tenant membership and role at the database operation boundary to avoid relying solely on a stale API authorization snapshot.
- Keep existing API response shapes and business behavior unless a separately reviewed compatibility change is required.

## Required qualification before any production action

Build a disposable PostgreSQL harness with the actual role model and migrations. Use two active owners/admins in separate businesses, a normal member, and a disabled account.

Prove:
1. `ghm_runtime` cannot call issuer-only auth/session functions or establish actor context.
2. `ghm_runtime` cannot read/write protected RPCs or forge context with GUCs, temp tables, function parameters, inherited roles, or direct SQL.
3. The gateway cannot be reached using the runtime database credential, and the runtime cannot assume the gateway role.
4. A valid gateway operation acts only as the token subject; supplying a different actor ID in any DTO is rejected or ignored by construction.
5. Cross-business read/write and private registration-data access are denied.
6. Missing, expired, malformed, wrong-audience, wrong-issuer, wrong-kid, revoked/disabled-account, and replayed/wrong-purpose proof are rejected.
7. Legitimate issuer and gateway flows succeed.
8. Rollback, exceptions, cancellation, connection pooling/reuse and transaction-bound context cleanup cannot leak actor identity.
9. Effective grants and role memberships match the intended least-privilege matrix.
10. Existing access-token expiry and refresh rotation compatibility tests pass.

Qualification must run in CI against disposable PostgreSQL. Route-only unit tests are not sufficient.

## Implementation sequence

1. **Issuer extraction:** isolate signing and issuer-only auth/session operations behind a narrow internal contract; keep ordinary API unable to sign arbitrary subjects.
2. **Gateway skeleton:** create a typed operation registry and independent JWT verification; no arbitrary SQL or raw function dispatch.
3. **DB actor context:** implement the protected transaction-bound context and dedicated login in disposable migrations/harness only.
4. **Adversarial harness:** add actual-role PostgreSQL spoofing, cross-tenant, replay, transaction-lifecycle and privilege tests.
5. **Representative operation:** migrate one low-risk actor-scoped operation end-to-end in isolated CI and prove compatibility.
6. **Feature coverage:** migrate #236/#237/#243/#250 and #244 consistently; move auth/session functions to issuer.
7. **Operational review:** threat model, observability without token/secret logging, key rotation, credential rotation, availability, incident response, backups and rollback.
8. **Separate production approval:** only after all qualification and rollout plans are reviewed, request distinct authorization for infrastructure provisioning, production secrets, DB grants/migrations, deployment and cutover.

## Explicit non-goals

- No production database query or mutation, migration application, role/grant change, secret read/write, or credential rotation.
- No Render service creation, environment change, or deployment.
- No PayFast work until its sandbox is restored and available for testing.
- No legal-document or QuoteFlow legal-acceptance work until the owner resumes it after core systems are running smoothly.
- No payment, callback, or commercial activation.

## Source inventory

See [GHM actor-auth surface inventory](../security/GHM_ACTOR_AUTH_SURFACE_INVENTORY_2026-11-10.md) for the current-main source/DDL findings and affected operation list.
