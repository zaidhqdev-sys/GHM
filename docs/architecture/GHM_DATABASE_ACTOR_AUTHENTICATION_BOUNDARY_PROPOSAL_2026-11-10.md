# GHM database actor-authentication boundary — decision proposal

Date: 2026-11-10
Status: Architecture proposal for review; not an implementation or authorization to change production.

## 1. Problem statement

The current GHM bearer path verifies ES256 access JWTs in the Node application, resolves the subject against ghm.account_identity, and returns an application AuthContext. The transaction helper opens a normal pooled PostgreSQL transaction using the shared runtime database URL. It does not establish an actor identity that PostgreSQL can distinguish from a caller-supplied function argument.

Several privileged SECURITY DEFINER functions accept p_account_id or p_actor_account_id, check membership or role for that supplied ID, and grant EXECUTE to ghm_runtime. The database therefore trusts an ordinary SQL argument as proof of the end-user actor. Application route authentication does not protect direct SQL invocation by a holder of the shared runtime credential.

Affected work already reviewed includes business registration identity (#236), business profile compatibility (#237), supplier classification (#243), engagement analytics (#244), and capability catalogue governance (#250).

## 2. Security invariants

1. A process holding only the ordinary ghm_runtime credential cannot impersonate any account, including another active owner, administrator, or system administrator.
2. A caller-supplied account ID, custom GUC, temporary table, application AuthContext, or route middleware result is not independently trusted by PostgreSQL.
3. PostgreSQL checks current account status and current business membership/role at operation time. Actor proof identifies the principal; it does not freeze mutable authorization state.
4. Actor context is scoped to one transaction and cannot leak through pooled connection reuse, rollback, exception, or cancellation.
5. Direct table privileges remain least-privilege. Private registration data and tenant-scoped event data cannot be read by bypassing guarded authorization.
6. Qualification runs as the actual runtime login role and tests two or more real active actors across distinct businesses, including forged-actor attempts for reads and writes.
7. Credential rotation, actor revocation, expiry, replay, audit attribution, and incident response are specified before rollout.

## 3. Preferred architecture to evaluate: authenticated database gateway

Introduce a narrowly scoped database gateway as the only component allowed to use a privileged actor-aware database credential.

### Request flow

1. The user presents the existing ES256 bearer token to the API. The API may perform its normal authentication for application routes, but its AuthContext and account ID are not an authority that the database gateway accepts as actor proof.
2. The gateway independently validates the original bearer token against the authoritative issuer keys and claim policy, then resolves the token subject to the canonical GHM account identity. It must verify current account status itself or obtain that status from a trusted authoritative source with a documented freshness bound. The gateway must not accept an account ID asserted by the ordinary API runtime.
3. If direct token validation by the gateway is not selected, use a separate identity-attestation service that independently validates the original bearer token and canonical account mapping, then signs a short-lived, audience- and purpose-scoped actor assertion. The signing key must be unavailable to the ordinary API runtime and ghm_runtime. The gateway validates the assertion's issuer, signature, audience, purpose, request binding, issued-at/expiry, key ID, and replay policy. A service-authenticated API connection alone does not make an API-supplied account ID trustworthy.
4. The gateway opens a transaction using a distinct database login role whose credentials are unavailable to the ordinary API runtime and users.
5. Through a narrowly granted function, the gateway establishes actor context in a protected database-owned transaction context. The context is bound to the current backend and transaction, not represented by a caller-writable GUC or temp table. Only the gateway login can establish it.
6. Protected RPCs derive the actor from that database-owned context; they do not accept an actor ID parameter. They still query current account status and current tenant membership/role at operation time.
7. The gateway commits or rolls back and clears context atomically. Connection pooling must never permit context reuse across transactions.

**Critical trust-chain rule:** Do not let the ordinary API runtime mint actor assertions or hold their signing key. If it can choose an account ID and produce an assertion the gateway trusts, compromise of that runtime recreates the impersonation vulnerability one layer earlier. Prefer gateway-side verification of the original bearer token; otherwise isolate attestation in a separately credentialed, narrowly scoped identity service that derives identity from the original token rather than trusting API-supplied identity fields.

### Existing bearer-token issuer is part of the trust boundary (confirmed in current main)

Review of current-main source on 2026-11-10 found an additional prerequisite that changes the gateway recommendation:

- `src/auth/foundation/access-jwt.ts` loads ES256 signing material through `loadEs256Keys()` and exposes `AccessJwtService.sign(accountId)`. The token claims are `sub` (decimal account ID), `iss=ghm-auth`, `aud=ghm-api`, `iat`, `exp`, and `kid`; TTL is 15 minutes and verifier clock tolerance is 60 seconds. The verifier uses the active and optional previous public keys selected by `kid`.
- `src/auth/ghm-auth-service.ts` constructs its default signer using `createAccessJwtService(loadEs256Keys())`; its `issuePair(accountId, ...)` calls `jwtService.sign(accountId)` after register/login/refresh flows. The private key is loaded from `GHM_JWT_ES256_PRIVATE_KEY_PEM` in the process environment.
- Therefore any ordinary API process that instantiates the current default GHM Auth service has the capability to sign an arbitrary account ID if that process or its signing interface is compromised. A gateway that verifies tokens with the corresponding public key would accept such forged-but-valid tokens. **Gateway-side signature verification alone does not isolate the end-user actor from a compromised API process under the current key-custody model.**
- This is a source-code/configuration requirement, not confirmation of which secrets are currently mounted on a particular production service. Do not inspect, print, copy, or change production secret values as part of this review.

**Required correction to the preferred architecture:**

1. Isolate access-token signing from the ordinary API runtime before treating bearer verification as an independent actor proof. Prefer a separately deployed identity/token-issuer component that owns the ES256 private key and independently performs the credential/session/account checks needed to issue tokens. Alternatively use a KMS/HSM-backed signing boundary whose policy and API cannot be invoked by the ordinary runtime to sign an arbitrary caller-selected `sub`.
2. A generic remote `sign(payload)` endpoint or a KMS key that the API can invoke with arbitrary claims is not isolation. The issuer must accept a narrow authenticated issuance operation, derive the canonical account subject from its own verified login/refresh transaction, and enforce active account/session state. It must not trust an API-supplied account ID as the issuance authority.
3. The database gateway validates access tokens against issuer public keys only after issuer-key custody and issuance authorization are separated from the ordinary API process. The gateway independently resolves the subject to the canonical account and checks current account status/membership. Public verification keys may be distributed; private signing material must not be present in the ordinary API or gateway unless a separately justified signing role is explicitly designed.
4. Define key rotation and emergency compromise response across issuer and gateway: `kid` allow-list, active/previous public-key overlap, bounded overlap duration, immediate key retirement procedure, and audit of issuer signing operations. The current code supports one active and one optional previous public key; this alone is not a complete rotation/compromise policy.
5. Current access-token claims do not include a session identifier or `jti`. Refresh-session revocation therefore is not independently represented in the access token. The design must either add a verifiable session/revocation reference with a bounded lookup/replay policy, or explicitly document the access-token revocation window (currently up to the 15-minute token lifetime plus verifier clock tolerance) and ensure account disablement is checked at every protected DB operation. Do not claim immediate logout revocation for already-issued access tokens without evidence.

**Revised trust chain:** credential/refresh validation and canonical identity derivation occur at the isolated issuer; it issues a short-lived token. The ordinary API may relay that token but cannot mint or alter its subject. The database gateway independently validates the token, checks live actor and tenant authorization, and uses its distinct DB principal to establish transaction-bound actor context. Compromise of the ordinary API alone must not grant issuer signing capability or gateway DB credentials.


### Trust boundaries and compromise assumptions

- The gateway is a privileged security component. Its process, deployment identity, network policy, database credential, token-verification keys/configuration, and release path require separate access controls, audit, alerting, and incident-response ownership. Compromise of the gateway or its database credential is in the trusted-computing-base threat model and can defeat actor isolation; document that residual risk rather than implying the design survives gateway compromise.
- The ordinary API may relay the user's bearer token unchanged, but must not be able to replace it with an account ID or mint an actor assertion. The gateway validates the token itself (signature, fixed issuer, intended audience, allowed algorithm, expiry/not-before, and required subject format), then resolves the subject to the canonical account. Never log bearer tokens or assertions. Use authenticated transport and avoid placing credentials in URLs, tracing attributes, or error messages.
- Because a bearer token can be replayed by any holder until expiry/revocation, the gateway must enforce short token/assertion lifetimes and current account disablement/revocation checks. Bind each gateway operation to a fresh request identifier and an explicit operation purpose; use a replay/idempotency record where retries or non-idempotent writes require it. Do not mistake a request ID supplied by the API for actor proof.
- The gateway database role is not a general-purpose SQL interface. The gateway implementation must expose only typed, allow-listed operations with parameterized queries; it must not accept SQL text, arbitrary function names, arbitrary schema/table names, or client-selected role changes. Restrict network reachability to the gateway and approved operators.
- Separate the gateway's database login from schema/table ownership and migration credentials. A gateway credential must not confer CREATEROLE, BYPASSRLS, ownership, superuser, or membership in privileged roles. Review effective privileges (including inherited and PUBLIC grants), not just direct grants.
- Define the failure mode explicitly: if token verification, account-status lookup, replay storage, or actor-context establishment is unavailable, protected operations fail closed. Availability degradation must not fall back to the ordinary ghm_runtime path or caller-supplied actor IDs.

### Privilege model

- Ordinary ghm_runtime must not possess the gateway login credential, be a member of the gateway role, or have EXECUTE on actor-context establishment functions.
- Revoke EXECUTE on actor-sensitive RPCs from PUBLIC and ghm_runtime; grant only to the gateway execution role or a dedicated narrowly scoped role.
- The gateway role must not own application tables or migrations. Schema ownership remains separate.
- Keep direct runtime table privileges restricted; do not use broad table grants as a substitute for protected RPCs.
- The gateway exposes a small typed operation surface, not arbitrary SQL execution.

### Database context implementation requirements

A protected context store/function design requires careful review. One candidate is a database-owned context table keyed by backend PID plus transaction ID, with rows written only by a SECURITY DEFINER setter executable by the gateway login. Protected RPCs read that row and reject absent, expired, or mismatched context. Runtime cannot read/write the table or execute the setter. Context insertion, operation, and cleanup occur in the same transaction. Confirm backend PID and transaction-ID semantics and cleanup behavior on the supported PostgreSQL version before choosing this implementation.

Do not implement this using a custom GUC alone: PostgreSQL callers can set custom GUC values themselves. This design trusts the distinct gateway database principal to have validated the authenticated actor envelope. That trust boundary must be explicit, independently credentialed, auditable, and unavailable to the ordinary runtime role.

## 4. Alternative: database-verifiable signed actor assertion

A signed actor assertion verified inside PostgreSQL could avoid a stateful gateway context, but only if the chosen PostgreSQL extension/runtime supports the required signature algorithm and is available, maintained, and approved on the active GHM database. The verification key must be public-only in the database; signing material remains outside PostgreSQL and inaccessible to ghm_runtime.

Do not assume the existing ES256 JWT implementation is automatically verifiable in PostgreSQL. Do not silently substitute HMAC with a secret readable by runtime, a caller-set GUC, or an ordinary account-ID argument. Before selecting this option, prove the exact extension and supported algorithm/version; signature, issuer, audience, expiry, key ID and canonicalization validation; transaction/request binding and replay prevention; key rotation and emergency revocation; and that runtime cannot obtain signing material or mint assertions. Negative SQL tests must reject forged, expired, wrong-audience, replayed, and revoked assertions.

No extension installation or active-database change is authorized by this proposal.

## 5. Required qualification suite

Build a reusable PostgreSQL qualification harness with disposable, production-shaped schema and actual role grants. It must connect using the ordinary runtime credential for adversarial tests and the gateway credential only for positive gateway tests.

Fixtures: two active accounts A and B; two active businesses A and B; owner/admin memberships as applicable; a normal member; a disabled account; and feature records.

Tests:
- Runtime cannot execute actor-context setter or protected RPCs directly.
- Runtime cannot forge actor context through GUCs, temporary objects, function parameters, SET ROLE, or connection reuse.
- A authenticated as A can read/write only A's authorized business data.
- A cannot supply B's account ID to read/write B's data.
- A cannot use B's business ID while retaining A's actor identity.
- A disabled/revoked actor is denied even if an assertion was minted before revocation, subject to a documented revocation freshness bound.
- Missing, expired, wrong-audience, wrong-purpose, replayed, and malformed assertions fail closed.
- Rollback, exceptions, cancellation, and pooled connection reuse do not retain actor context.
- Cross-business direct SELECT/INSERT/UPDATE/DELETE is denied for protected/private tables.
- Audit rows attribute the database-verified actor, not caller-provided metadata.
- Legitimate gateway-mediated owner/admin operations succeed; ordinary member operations remain denied.

Apply the suite to registration identity, business profile, supplier classification, engagement analytics, and capability catalogue governance.

## 6. Migration and rollout sequence

1. Inventory every actor-sensitive SECURITY DEFINER function and direct table grant on current main and affected PR heads.
2. Decide the gateway protocol, database roles, context storage, credential custody, transaction lifecycle, revocation bound, and operational ownership.
3. Implement gateway and database boundary in an isolated branch; do not alter production credentials or grants.
4. Add shared adversarial PostgreSQL qualification and require it in CI.
5. Migrate one representative low-risk RPC, review the diff and threat model, then migrate remaining RPCs consistently.
6. Remove legacy actor-ID parameters and revoke direct runtime EXECUTE only as part of an approved coordinated migration.
7. Verify active database compatibility and rollback plan using a schema-only production-shaped clone. Never use the retired sandbox database as evidence of active database state.
8. Obtain explicit authorization before any active database role/grant change, migration, or deployment.

## 7. Open design decisions

- Which service owns the gateway and its separate database credential?
- What authenticated service-to-service protocol carries the actor envelope?
- How is protected transaction context implemented and proven non-forgeable by ghm_runtime?
- What is the maximum actor revocation propagation delay?
- How are replay detection and request idempotency coordinated across retries?
- How are credentials rotated, revoked, audited, and recovered after compromise?
- How are gateway availability, timeouts, pool exhaustion, and fail-closed behavior operated?

## 8. Explicit non-goals

This proposal does not authorize production migration, production database mutation, role/grant changes, secret creation or rotation, deployment, payment activation, commercial cutover, or merging any currently blocked PR. It does not approve an architecture until its threat model and qualification suite pass.
