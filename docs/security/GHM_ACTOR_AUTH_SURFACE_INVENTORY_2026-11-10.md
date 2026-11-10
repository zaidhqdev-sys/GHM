# GHM actor-authentication and privileged database surface inventory

**Date:** 2026-11-10  
**Status:** Source/DDL inventory for architecture review; not an implementation or production authorization  
**Base:** `main` at `8bb3a764275703d26be93385854290d5672995e3`

## Purpose and scope

This inventory consolidates actor-sensitive database operations across the currently blocked Business, Connect Marketplace, Capability and Analytics PRs. It is intended to make the shared actor-authentication remediation complete and testable. It does not authorize production queries, migrations, grants, credentials, service creation, deployment, or feature cutover.

The current common boundary is insufficient: application authentication resolves an account ID in Node, but ordinary repositories connect through the shared `ghm_runtime` database credential. A normal PostgreSQL caller using that credential is not independently bound to the end-user account represented by an application `AuthContext`.

## Confirmed current-main authentication path

Source reviewed on current `main`:

- `src/auth/foundation/access-jwt.ts`: `createAccessJwtService().sign(accountId)` signs ES256 tokens with `sub` chosen from its `accountId` argument, `iss=ghm-auth`, `aud=ghm-api`, `iat`, `exp`, and header `kid`. Access-token TTL is 15 minutes. Verification occurs in Node.
- `src/auth/ghm-auth-service.ts`: the default service constructs the signer using `loadEs256Keys()`; `issuePair(accountId, sessionId, ...)` calls `jwtService.sign(accountId)`. The normal auth service also calls the shared persistence methods for password lookup/set, session creation, refresh rotation and logout.
- `src/auth/ghm-bearer.ts`: verifies the token in Node, resolves `sub` against `ghm.account_identity`, checks active status, and returns an application context containing the account ID.
- `src/db/authorized-transaction.ts`: `withAuthorizedTransaction` checks application context then opens a normal pooled transaction; it does not establish a DB-verifiable actor identity.
- `src/db/pool.ts`: the normal pool uses the shared `config.databaseUrl`.

**Consequences:** (1) PostgreSQL sees the shared runtime principal, not the end user. (2) The ordinary application process has the code path and private-key loading capability to sign an arbitrary subject if compromised. (3) A gateway that merely verifies tokens signed by the current ordinary API process would not independently prove the original user identity. (4) The auth SQL grant surface must be isolated with token signing; moving only the ES256 key is not sufficient.

## Actor-sensitive feature RPC inventory

| PR | Database operation | Current actor input / privilege | Required remediation |
|---|---|---|---|
| [#236](https://github.com/zaidhqdev-sys/GHM/pull/236) | `ghm.read_business_registration_identity(bigint,bigint)` | Caller supplies `p_account_id`; SECURITY DEFINER; EXECUTE granted to `ghm_runtime`; checks membership for supplied ID | Remove caller-controlled actor identity; derive actor from trusted transaction context; preserve private registration data isolation |
| [#236](https://github.com/zaidhqdev-sys/GHM/pull/236) | `ghm.update_business_registration_identity(bigint,bigint,text,text,text)` | Caller supplies `p_account_id`; SECURITY DEFINER; EXECUTE granted to `ghm_runtime` | Same; adversarial direct read/write tests |
| [#237](https://github.com/zaidhqdev-sys/GHM/pull/237) | `ghm.update_business_profile(bigint,bigint,jsonb)` | Caller supplies `p_account_id`; SECURITY DEFINER; EXECUTE granted to `ghm_runtime` | Same; qualify compatibility and all mutable fields |
| [#243](https://github.com/zaidhqdev-sys/GHM/pull/243) | `ghm.update_business_supplier_classification(bigint,bigint,boolean)` | Caller supplies `p_account_id`; SECURITY DEFINER; EXECUTE granted to `ghm_runtime` | Same; test forged different active owner/admin |
| [#250](https://github.com/zaidhqdev-sys/GHM/pull/250) | `ghm.create_capability_draft(...)` | Caller supplies `p_actor_account_id`; SECURITY DEFINER; EXECUTE granted to `ghm_runtime` | Derive administrator identity from trusted context; database-enforce catalogue invariants |
| [#250](https://github.com/zaidhqdev-sys/GHM/pull/250) | `ghm.update_capability_draft(...)` | Caller supplies `p_actor_account_id`; SECURITY DEFINER; EXECUTE granted to `ghm_runtime` | Same |
| [#250](https://github.com/zaidhqdev-sys/GHM/pull/250) | `ghm.transition_capability_lifecycle(...)` | Caller supplies `p_actor_account_id`; SECURITY DEFINER; EXECUTE granted to `ghm_runtime` | Same |
| [#244](https://github.com/zaidhqdev-sys/GHM/pull/244) | `ghm.business_engagement_event` direct INSERT | `ghm_runtime` receives INSERT on `business_id, account_id, event_type, event_context, source` | Treat `account_id` and business ownership as trusted actor attributes; move write behind a typed, actor-authenticated boundary or independently derive them in DB |

### Auth/session mutation functions shared with ordinary runtime

Checked-in migration `database/migrations/20260921130000_create_auth_runtime_functions.sql` grants `EXECUTE` to `ghm_runtime` on privileged `SECURITY DEFINER` functions including:

- `ghm.auth_set_password(...)`
- `ghm.auth_lookup_password_by_normalized_email(text)`
- `ghm.auth_create_session_with_refresh(bigint, bytea)`
- `ghm.auth_validate_session(bigint)`
- `ghm.auth_rotate_refresh(bytea, bytea)`
- `ghm.auth_revoke_session(bigint, text)`
- `ghm.auth_revoke_all_sessions_for_account(bigint, text)`
- `ghm.auth_change_password(...)`
- `ghm.auth_disable_account(bigint)`
- `ghm.auth_issue_recovery(bigint, bytea, timestamptz)`
- `ghm.auth_redeem_recovery(bytea)`
- `ghm.auth_lookup_external_identity(text, text)`
- `ghm.auth_bootstrap_external_identity(...)`

The same migration grants `SELECT` on `ghm.authentication_session` to `ghm_runtime`. Password, refresh-token and recovery-secret tables are not directly readable by runtime, but the SECURITY DEFINER execution surface remains material. In particular, `auth_create_session_with_refresh(p_account_id, ...)` accepts a target account ID and creates a session/refresh credential for that active account; application credential checks currently happen before this function call, not inside the function. The ordinary process also loads refresh-token pepper and ES256 signing material.

This is a source/DDL capability finding only. It does not establish which production secrets are mounted or effective live role membership. No secret values were inspected.

## Recommended trust-boundary direction for review

The preferred direction is a separately credentialed, GHM-owned authentication issuer plus a separately credentialed typed database gateway:

1. **Issuer isolation:** all password, registration, external identity, refresh, recovery and session lifecycle operations that issue credentials are performed by an isolated GHM-owned issuer. Its DB login and signing key are unavailable to ordinary resource API processes. It derives the canonical account subject from its own verified credential/session operation; it must not expose a generic `sign(payload)` or arbitrary-subject signing API.
2. **Gateway isolation:** the gateway independently validates the issuer token and canonical account, then executes allow-listed typed operations with a distinct database login unavailable to `ghm_runtime`. It must not accept SQL text, arbitrary function names, or an account ID asserted by the ordinary API as actor proof.
3. **DB context:** the gateway establishes a protected, transaction-bound actor context using a function/table inaccessible to ordinary runtime. A caller-writable GUC or temp table alone is not proof. Protected functions derive the actor from that context and still check current account status and tenant membership/role at execution time.
4. **Privilege separation:** move auth mutation grants away from ordinary runtime only after every current caller is moved and issuer qualification passes. Remove direct `ghm_runtime` EXECUTE on actor-sensitive RPCs only as part of a coordinated migration. Keep migration/schema ownership separate from issuer and gateway logins.
5. **Compatibility:** preserve current GHM token contract unless separately changed: ES256, `iss=ghm-auth`, `aud=ghm-api`, required `kid`, 15-minute access JWTs, opaque rotating refresh credentials, and natural expiry of already-issued access JWTs after logout/revocation. Do not silently add signed `sid` or online session validation.
6. **Typed operation coverage:** include the #244 engagement-event write path; it is not a SECURITY DEFINER RPC but direct runtime INSERT currently accepts caller-supplied account/business identifiers.

This recommendation is not yet an approved topology. It introduces new trusted services, credentials, network boundaries, and operational responsibilities. The exact hosting topology, gateway protocol, DB context implementation, revocation freshness, replay handling, credential rotation and incident response require explicit architecture approval before implementation or provisioning.

## Required adversarial qualification

Use disposable PostgreSQL with the actual role grants. Create two active owners/admins, two distinct businesses, a normal member, and a disabled account.

- Connect as ordinary `ghm_runtime`; attempt each protected RPC with another active owner/admin ID and prove denial.
- Attempt direct INSERT of engagement events with forged account/business attribution and prove denial.
- Attempt direct execution of auth session creation, refresh rotation/revocation, password changes, recovery, and external identity bootstrap for another active account; prove ordinary runtime cannot exercise issuer-only operations after the new boundary is implemented.
- Prove legitimate issuer and gateway paths succeed with correct identity.
- Test absent, expired, wrong-audience, wrong-purpose, replayed, malformed proof; account disablement; transaction rollback, exception, cancellation and pool reuse.
- Prove cross-business reads/writes and private registration-data access remain denied.
- Inspect effective grants including PUBLIC, inherited roles, default privileges, SECURITY DEFINER owners and role membership.

## Work sequencing and release gates

1. Complete the remaining source/DDL inventory across current main and feature branches.
2. Obtain explicit approval for the isolated issuer/gateway topology and security policy.
3. Implement the issuer and gateway on isolated branches with no production credentials/grants.
4. Add shared adversarial PostgreSQL qualification to CI.
5. Migrate one representative low-risk operation, then the remaining RPCs and #244 event insertion.
6. Re-run compatibility and migration qualification for #236/#237/#243/#244/#250.
7. Only then consider merge. Active-database migration, production grants/credentials, deployment, payment activation and commercial cutover remain separately authorized actions.

## Explicit exclusions

PayFast remains paused until its sandbox is restored and working access is available. Legal-document/QuoteFlow legal-acceptance work remains deferred until core systems operate smoothly and the owner resumes it. Neither is part of this workstream.
