# ADR-001: Isolated GHM authentication issuer and database actor gateway

- **Date:** 2026-11-10
- **Status:** APPROVED FOR ISOLATED DESIGN AND QUALIFICATION
- **Decision owner:** GHM owner (approval recorded in project conversation on 2026-11-10)
- **Implementation status:** Not implemented; no production provisioning or credential changes authorized
- **2026-11-12 implementation note:** Actor Gateway and Authentication Issuer implementations now exist on unmerged construction branches. Exact Actor Gateway ACL startup enforcement is under qualification; this does not change the no-production-provisioning/credential/grant authorization. The current gateway allow-list is 25 signed/typed functions; nine older overloads were already dropped by later migrations, and migration `20261112070000_revoke_legacy_unsigned_actor_gateway_overloads.sql` revokes the one surviving unused unsigned identity helper, and migration `20261112080000_signed_connect_business_provisioning_gateway.sql` adds the 25th signed Connect Business provisioning operation.
- **Supersedes:** The undecided topology section in PR #251's proposal

## Context

The ordinary GHM resource API currently verifies ES256 access JWTs in Node, resolves `sub` to an active account, and places the account ID in application auth context. Its normal database pool authenticates as shared `ghm_runtime`. PostgreSQL therefore sees a shared service identity, not the authenticated end user.

The ordinary API process also loads ES256 private signing material and calls a signer with a caller-selected account ID. Consequently, a gateway that merely verifies tokens minted by the ordinary API would not provide independent actor assurance. The ordinary runtime is also granted EXECUTE on SECURITY DEFINER auth/session functions that can create sessions or change credential state for supplied account IDs. Several feature RPCs trust caller-supplied actor IDs; #244 additionally permits direct engagement-event INSERT with caller-selected account/business attribution.

## Decision

Adopt two distinct GHM-owned trust components:

1. **Authentication issuer** — the sole owner of password/identity credential verification, session lifecycle and ES256 private signing. It has a dedicated DB principal and dedicated signing-key custody. The ordinary resource API has neither access to issuer credentials nor an arbitrary-claims signing endpoint. The issuer derives the canonical subject from its own verified credential/session operation; clients and resource APIs cannot choose the subject of an issued token.
2. **Typed database actor gateway** — independently validates the issuer's ES256 token and its required issuer, audience, key ID, purpose and expiry; establishes actor context for an allow-listed typed operation using a dedicated database principal unavailable to `ghm_runtime`. It accepts no SQL text, arbitrary function names, or actor identity asserted by the ordinary API. The ordinary API may request a typed operation but cannot choose or override the authenticated actor.

Both are separate trust boundaries and separately credentialed. They may initially be deployed as distinct internal services or isolated processes only if process, credential, network and deployment isolation are demonstrably equivalent. The default implementation plan is distinct internal services; no Render services are to be created until a separate provisioning plan is reviewed and authorized.

## Non-negotiable security properties

- Ordinary `ghm_runtime` cannot mint an access token for an arbitrary account, access issuer signing material, invoke an issuer-only credential mutation, create/rotate a session for another account, or establish/forge database actor context.
- Gateway database credentials are unavailable to ordinary resource API processes.
- Gateway accepts only typed, allow-listed operations and schema-validated input; it does not become a generic SQL/RPC proxy.
- Database actor context is transaction-bound, authenticated by a mechanism that the ordinary runtime cannot forge, and unavailable through caller-writable GUCs, temporary tables, or plain account-ID arguments.
- Protected database functions derive actor identity from that context and re-check account status plus current tenant membership/role at operation time.
- Auth/session mutation functions and signing-key custody move behind the issuer only after callers are inventoried and compatibility is qualified.
- The gateway and issuer have separate least-privilege DB identities; neither is a schema owner or migration principal. Migration remains a separately controlled identity.
- Logs never contain bearer tokens, passwords, refresh tokens, recovery secrets, signing keys, or database credentials. Security logs use non-secret correlation IDs and typed action outcomes.

## Token and session compatibility

Preserve the current public GHM token/session contract:
- ES256 access JWT;
- `iss=ghm-auth`, `aud=ghm-api`, required `kid`;
- 15-minute access-token lifetime;
- opaque rotating refresh credentials;
- existing natural-expiry behavior for already-issued access JWTs after logout/revocation.

Do not silently introduce a signed `sid`, per-request online session validation, shorter TTL, new claim semantics, or changed refresh behavior. Such changes require a separate ADR and compatibility plan. The issuer must support key rotation and verification of currently valid tokens during an overlap window.

## Database actor-context design constraint

A caller-controlled GUC or temp table is explicitly rejected. The gateway must use a DB-verifiable, transaction-bound proof or protected transaction context that the runtime principal cannot produce. The implementation spike must compare candidate mechanisms against all of these threats:

- runtime role can execute arbitrary SQL using its own login;
- role inheritance and SET ROLE paths;
- SECURITY DEFINER ownership and PUBLIC/default EXECUTE grants;
- transaction pooling, rollback, cancellation and connection reuse;
- concurrent transactions and replay of a proof from another transaction;
- gateway credential theft and compromised gateway request handlers.

The gateway must bind proof to the authenticated actor, operation purpose, transaction/connection scope, freshness and replay state. A proof copied from another request or transaction must not authorize an operation. If the proposed DB context depends on a gateway-only database secret, that secret must never be mounted in the ordinary API and the gateway must not expose a generic signing oracle.

## Service responsibilities and allowed interfaces

### Issuer

- Own credential verification, external identity binding, password reset/recovery, refresh rotation, session creation/revocation and access-token signing.
- Accept login/recovery/session operations through narrowly defined schemas and rate limits.
- Derive account subject only from verified credential/session state.
- Return standard access/refresh pair according to current contract.
- Never offer a generic arbitrary-subject or arbitrary-claims signing endpoint.
- Use dedicated issuer database identity; issuer DB procedures validate their own credential/session preconditions and do not rely on caller-supplied account IDs alone.
- Keep signing key, refresh pepper and issuer DB credentials outside resource API environment.

### Typed database gateway

- Validate JWT signature, issuer, audience, key ID, expiry and expected token purpose.
- Expose versioned typed operation names with strict schemas and bounded result sizes.
- Derive actor solely from validated token subject.
- Use gateway-only DB identity and protected transaction context.
- Re-check account active status and tenant membership/role inside the protected database operation.
- Do not proxy arbitrary SQL, caller-selected function names, arbitrary account IDs, or direct database connections.
- Return minimal typed data and non-secret correlation IDs.

### Ordinary resource API

- Verify access tokens for request authentication/compatibility if useful, but never use its own verification as proof to PostgreSQL.
- Remove private signing key and issuer-only DB credentials from its configuration.
- Route actor-sensitive database work through typed gateway operations.
- It must not have gateway DB credentials or an endpoint capable of signing caller-selected subjects/claims.
- Non-sensitive, non-actor-bound repository operations may retain the ordinary runtime pool subject to least-privilege review.

## Migration strategy

1. Inventory every caller of auth/session functions and every direct database operation affected by the new boundary.
2. Build issuer and gateway in isolated branches and disposable environments. No production secrets or grants.
3. Implement the DB context proof mechanism and prove `ghm_runtime` cannot forge it before changing any protected RPC.
4. Move one representative, low-risk actor-sensitive operation through the gateway; retain a rollback-compatible adapter in non-production.
5. Migrate registration identity, Business profile, supplier classification, capability governance, and engagement-event writes consistently.
6. Move auth/session mutation functions and signing-key custody to issuer-only credentials; revoke ordinary-runtime privileges only after all callers have moved and adversarial tests pass.
7. Produce a production rollout plan with staged deployment, compatibility window, key rotation, observability, rollback and explicit migration/grant/secret approval.
8. Merge/deploy only after security review, all exact-head CI, disposable PostgreSQL qualification and separate operational approval.

No production data, migration, grant, credential, Render service or environment is changed by this ADR.

## Required qualification suite

Use disposable PostgreSQL and real least-privilege logins (not mocks or owner/superuser) with two active owners/admins, separate businesses, a normal member, and a disabled account.

1. As `ghm_runtime`, attempt every actor-sensitive RPC using another active owner's ID; prove denial for reads and writes.
2. As `ghm_runtime`, attempt direct engagement-event INSERT with forged `account_id` and `business_id`; prove denial.
3. As `ghm_runtime`, attempt issuer-only session creation, refresh rotation, recovery, password mutation, account disablement and external-identity bootstrap for another account; prove denial.
4. Prove valid issuer login, refresh, recovery and revocation flows retain current contract.
5. Prove gateway allows legitimate actor operations and rejects forged account IDs, wrong tenant, wrong role, disabled actor and cross-business access.
6. Reject absent, malformed, expired, wrong-issuer, wrong-audience, wrong-purpose, wrong-kid, revoked/unknown-key, replayed and cross-transaction proof.
7. Prove proof cannot be copied from a previous transaction, pooled connection, concurrent request or different actor.
8. Test rollback, exception, cancellation, connection release/reuse and transaction-pool behavior.
9. Inspect effective grants including PUBLIC, inherited roles, default privileges, SECURITY DEFINER owners, SET ROLE and schema usage.
10. Assert secrets never appear in logs, errors, traces or returned payloads.

Tests must demonstrate both the negative spoof cases and legitimate positive paths. A passing route-level HTTP test alone is not sufficient.

## Open design tasks before implementation

- Choose and threat-model the exact DB transaction-context proof mechanism; document replay and transaction binding.
- Specify service-to-service authentication, network restrictions, timeouts, retry/idempotency and request-size/result-size limits.
- Define issuer key storage/rotation and gateway public-key distribution/overlap.
- Define issuer session/refresh database procedure ownership and ensure account ID cannot be forged at the SQL boundary.
- Map every current auth/session function caller and every affected repository operation.
- Define service observability, incident response, credential rotation and disaster recovery.
- Compare distinct internal services vs isolated process boundaries; do not provision until a separate operational plan is approved.

## Explicit scope exclusions

PayFast remains paused until its sandbox is restored and working access is available for end-to-end testing. Legal-document/QuoteFlow legal-acceptance work remains deferred until core systems are running smoothly and the owner resumes it. Neither is part of this ADR or its implementation queue.

## Approval record

Owner approved the isolated issuer + separately credentialed typed database gateway direction on 2026-11-10. This authorizes architecture/design and isolated implementation/qualification only. It does not authorize production service provisioning, production secrets, DB grants, migrations, data changes, deployments, payment activation or commercial cutover.
