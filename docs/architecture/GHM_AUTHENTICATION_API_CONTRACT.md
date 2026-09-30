# GHM Authentication API Contract

**Canonical owner:** GHM platform governance
**Status:** AUTHENTICATION GATE 2E — AUTHENTICATION API CONTRACT — **DOCUMENTATION ONLY**; **implementation NOT AUTHORIZED**
**Authority:** Local repository `C:\GHM`
**Baseline:** branch `construction/saved-business-resource`, HEAD `239ef5d` (docs may advance ahead of HEAD)
**Depends on:**
- [GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md](./GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md)
- [GHM_AUTHENTICATION_CONTRACT_GATE.md](./GHM_AUTHENTICATION_CONTRACT_GATE.md)
- [GHM_AUTHENTICATION_PERSISTENCE_CONTRACT.md](./GHM_AUTHENTICATION_PERSISTENCE_CONTRACT.md)
- [GHM_AUTHENTICATION_CREDENTIAL_CONTRACT.md](./GHM_AUTHENTICATION_CREDENTIAL_CONTRACT.md)
- [GHM_AUTHENTICATION_SESSION_CONTRACT.md](./GHM_AUTHENTICATION_SESSION_CONTRACT.md)
- [GHM_AUTHENTICATION_CRYPTOGRAPHIC_CONTRACT.md](./GHM_AUTHENTICATION_CRYPTOGRAPHIC_CONTRACT.md)
- [GHM_PRODUCT_FACING_HTTP_TRANSPORT_CONTRACT.md](./GHM_PRODUCT_FACING_HTTP_TRANSPORT_CONTRACT.md)

```text
IMPLEMENTATION AUTHORIZATION: NOT GRANTED
DOCUMENTATION-ONLY GATE
NO ENDPOINTS
NO MIDDLEWARE CHANGES
NO KEYS / SECRETS / EMAIL / PACKAGES
```

This document defines the **externally observable logical Authentication API** that an eventual implementation must satisfy. It does **not** freeze framework handler names, exact URL prefixes, exact JSON property names, or deployment hostnames unless already established by repository evidence.

---

## 1. Ownership boundary

```text
Product (Connect / QuoteFlow / …)
   ↓
GHM Auth API
   ↓
GHM auth boundary (identity / credential / session / refresh / recovery / mapping)
   ↓
GHM-issued credentials (ES256 access JWT + refresh credential)
   ↓
GHM protected Resource API (`requireAuth` / AuthContext)
```

- Products authenticate **directly through GHM Auth**.
- Products must **never** connect directly to GHM Postgres.
- GHM must **never** accept Supabase JWTs directly as GHM credentials.
- Preserve `ghm_schema_owner` / `ghm_migrator` / `ghm_runtime`. Auth API handlers must not imply arbitrary durable DML for `ghm_runtime`.

---

## 2. Repository HTTP evidence (current)

| Topic | Evidence |
|---|---|
| Resource prefix | `/api/v1/<resource>` (`src/http/app.ts`, routers) |
| Auth routes | `POST /api/v1/auth/login`, `/refresh`, `/logout` (`src/http/auth-router.ts`) |
| Resource middleware | `requireAuth` → `requireResourceAuth` (`src/auth/resource-auth.ts`): **ES256 GHM access JWT** (primary) verifies `sub`/`iss`/`aud`/`kid`/`exp`, loads `ghm.account_identity` state, builds `AuthContext` from **database role + `is_system_admin`** — JWT is not authorization truth |
| Legacy HS boundary | `classifyBearerCredential` → `legacy-hs` only: isolated `authenticateRequest` (`request-context.ts`) for temporary local/legacy compatibility; **new GHM frontend must not use this path** |
| Legacy Render frontend | Must not use legacy `auth/signin` / generic `tables/*` / `admin/*` against new governed resource APIs |
| Auth failure | HTTP `401` `{ error: 'unauthorized' }` |
| Authz failure | HTTP `403` `{ error: 'forbidden' }` |
| Other errors | `{ error: 'invalid_request' \| 'not_found' \| 'conflict' \| 'internal_error' }` |
| Body limit | `express.json({ limit: '1mb' })` |
| CORS | `CORS_ORIGINS` allow-list |
| Public/health | `GET /` service banner; `GET /healthz` → `{ status: 'ok' }` |
| Rate limiting | **No** application rate-limiter found in `src/` |
| Auth path freeze | Contract Gate: `/api/v1` resource convention does **not** freeze auth paths |

```text
Resource API authentication: ES256 GHM Auth is the target mechanism for governed routes.
Legacy HS verification remains isolated (not removed) for the temporary compatibility boundary only.
```

---

## 3. Path convention (logical)

Logical operations use placeholders:

```text
POST <auth>/login
POST <auth>/refresh
POST <auth>/logout
POST <auth>/password/change
POST <auth>/password/recovery/request
POST <auth>/password/recovery/complete
```

| Decision | Status |
|---|---|
| Exact auth URL prefix / paths | **UNSELECTED** |
| Alignment with `/api/v1/...` | Resource API evidence exists; auth prefix **not** frozen |

> **Technical recommendation — not a Founder decision.**
> Prefer a versioned prefix under the existing product HTTP surface, e.g. `/api/v1/auth/...`, for operational consistency. This is **not** a Founder selection.

---

## 4. Authentication vs authorization

| | Authentication | Authorization |
|---|---|---|
| Question | Who are you? | What may you do? |
| Established by | Login / refresh / trusted mapping bootstrap | Membership, ownership, registry, explicit admin grants |
| API effect | Issues/validates credentials; builds identity binding | Resource endpoints enforce via existing GHM authz |

**Login must not** automatically establish business membership, ownership, administrator privileges, arbitrary roles, or resource permissions.

Protected business operations continue through the existing GHM authorization / `business_membership` model after a valid AuthContext exists.

- **401** = authentication failure
- **403** = authorization failure (authenticated but not permitted)

---

## 5. Access JWT contract (success credential)

| Element | Rule |
|---|---|
| Algorithm | **ES256** |
| `iss` | `ghm-auth` |
| `aud` | `ghm-api` |
| `sub` | Canonical `ghm.account_identity.id` |
| `iat` / `exp` | Issued-at; lifetime **15 minutes** |
| `kid` | **Required** |
| Roles/membership in JWT | **Not** authorization source of truth |

Do not add optional claims merely because they might be useful later.

Private signing key: secret-managed inside the GHM issuer boundary. One active signing key; previous public key trusted for ≥ access-token expiry + clock skew during rotation.

---

## 6. Refresh credential contract

| Access JWT | Refresh credential |
|---|---|
| Short-lived (15m) | Session-bound; sliding 30d inactivity / 90d absolute |
| Signed ES256 bearer | Server-controlled; revocable |
| Stateless verify with public keys | Single-use; rotate every successful refresh |
| Not durable session truth | Stored as hash/reference (Persistence Contract) |

Replay of a used refresh credential **revokes the affected session family**.

> **Technical recommendation — not a Founder decision.**
> Prefer an **opaque** high-entropy refresh secret (not a JWT refresh token), consistent with the Session / Persistence contracts.

Exact wire representation / field names remain **UNSELECTED**.

---

## 7. Login

```text
POST <auth>/login
```

### Request (conceptual)

```text
email
password
```

### Success (conceptual)

```text
access token (ES256 JWT per §5)
refresh credential (per §6)
token/session metadata as necessary (e.g. expiry hints) — exact schema UNSELECTED
```

### Semantics

1. Validate input shape (email/password present; password policy on registration/change — login verifies existing hash).
2. Resolve identity by login email (normalized per Credential Contract when implemented).
3. Verify password with **Argon2id** against durable credential (Persistence Contract).
4. Reject disabled/locked accounts with **generic** auth failure (anti-enumeration).
5. Create authentication **session** (30d inactivity / 90d absolute clocks start).
6. Issue access JWT (`sub` = `account_identity.id`, `iss`/`aud`/`iat`/`exp`/`kid`).
7. Issue initial refresh credential bound to that session.
8. Apply **rate limiting** (thresholds UNSELECTED).
9. **No** membership/admin/role elevation.

### Failure

- Generic authentication failure → **401** (e.g. `INVALID_CREDENTIALS` / `AUTHENTICATION_REQUIRED` family).
- Do **not** disclose whether email exists or which factor failed.
- Never log plaintext passwords.

---

## 8. Refresh

```text
POST <auth>/refresh
```

### Request (conceptual)

```text
refresh credential
```

### Success (conceptual)

```text
new access JWT (15 minutes)
new refresh credential
(old refresh credential no longer usable)
```

### Semantics

1. Accept refresh credential; never log raw value.
2. Resolve durable refresh row via hash/reference (Persistence Contract).
3. Validate session: not revoked; within **30-day** inactivity; within **90-day** absolute maximum.
4. Enforce **single-use**: current credential must be the live tip of the lineage.
5. **Atomically** invalidate presented credential, mint successor refresh credential, update session last-activity, issue new access JWT.
6. After successful rotation, the old refresh credential must **not** remain usable.

### Replay

If the presented credential is **already used** (superseded) or **revoked**:

- treat as replay → **revoke the affected session family**
- fail with authentication error (representative: `REFRESH_CREDENTIAL_REUSED` / `SESSION_REVOKED`)
- do **not** mint a new live lineage for that family

### Concurrency

Two concurrent refreshes presenting the **same** single-use credential must **not** both succeed in minting independent successor credentials. Rotation must be atomic enough that at most one successor becomes live (other attempt fails as reuse/conflict per policy).

Clients should single-flight refresh where possible.

### Failure examples

| Condition | HTTP | Representative code |
|---|---|---|
| Missing/malformed | 401 | `AUTHENTICATION_REQUIRED` / `INVALID_REFRESH_CREDENTIAL` |
| Unknown / bad secret | 401 | `INVALID_REFRESH_CREDENTIAL` |
| Idle / absolute expiry | 401 | `SESSION_EXPIRED` |
| Revoked family | 401 | `SESSION_REVOKED` |
| Reuse/replay | 401 | `REFRESH_CREDENTIAL_REUSED` |

---

## 9. Logout

```text
POST <auth>/logout
```

### Request (conceptual)

Authenticated session context — typically via refresh credential and/or access token binding as later wire contract defines (**exact binding UNSELECTED**). Prefer revoking via **refresh/session** authority.

### Semantics

1. Identify the authentication session / refresh lineage.
2. Revoke that session family (refresh credentials unusable).
3. Do **not** require an access-token blacklist; outstanding access JWTs expire naturally within **≤ 15 minutes**.
4. **Idempotent**: logout when already revoked/invalid still returns success-equivalent auth completion (exact status UNSELECTED; must not leak extra account data).

### Failure

- If caller cannot authenticate the logout intent at all → **401**.
- Already-logged-out retries should not produce noisy privilege errors.

---

## 10. Password change

```text
POST <auth>/password/change
```

### Request (conceptual)

```text
current password
new password
```

Requires authenticated identity (valid access JWT or equivalent Auth API session binding — wire detail UNSELECTED).

### Semantics

1. Authenticate caller → canonical `account_identity`.
2. Verify **current password** (Argon2id).
3. Validate **new password** against Founder policy (min 8; upper; lower; number; special optional).
4. Replace password hash (Argon2id; cost params UNSELECTED).
5. **Preserve** current authentication session; issue **fresh** refresh credential for it.
6. **Revoke all other** refresh sessions for the account.
7. Rate-limit; never log passwords.

### Failure

- Bad current password / unauthenticated → **401**
- Policy violation → **400** with `PASSWORD_POLICY_VIOLATION` (or equivalent) — must not echo password material
- Authz not applicable for self-change of own password (403 reserved for true authorization denials)

---

## 11. Password recovery — request

```text
POST <auth>/password/recovery/request
```

### Request (conceptual)

```text
email
```

### Semantics

1. Accept email; apply rate limiting / abuse protection (thresholds UNSELECTED).
2. **Enumeration-resistant response**: same success-shaped outcome whether or not the account exists.
3. If account exists: create short-lived, single-use, server-controlled recovery credential; store hash/reference; enqueue email via abstract transport (**provider UNSELECTED**).
4. If account does not exist: do not create recovery material; still return the same opaque success shape.
5. Does **not** reset the password by itself.

### Failure

- Malformed email → **400** `invalid_request`-class without revealing account existence.
- Rate limit → **429** or **401/403** policy TBD — representative `RATE_LIMITED` (**status mapping UNSELECTED**).

Never disclose whether the email is registered.

---

## 12. Password recovery — complete

```text
POST <auth>/password/recovery/complete
```

### Request (conceptual)

```text
recovery credential
new password
```

### Semantics

1. Validate recovery credential (hash/reference lookup).
2. Enforce single-use, not expired, not invalidated.
3. Resolve account; validate new password policy; Argon2id replace password.
4. Invalidate recovery credential.
5. **Revoke ALL** refresh sessions for the account.
6. **Do not** issue an authenticated session or access JWT here.
7. User must **sign in again** via login.

```text
password recovery complete
        ↓
revoke all sessions
        ↓
sign in again (login)
```

### Replay / second use

Second presentation → fail (`RECOVERY_CREDENTIAL_REUSED` / `RECOVERY_CREDENTIAL_INVALID`); no password change; no session mint.

### Failure

| Condition | Representative |
|---|---|
| Bad/unknown recovery | 401 `RECOVERY_CREDENTIAL_INVALID` (anti-enumeration where applicable) |
| Expired | 401 `RECOVERY_CREDENTIAL_EXPIRED` |
| Reused | 401 `RECOVERY_CREDENTIAL_REUSED` |
| Policy | 400 `PASSWORD_POLICY_VIOLATION` |

---

## 13. External identity / bootstrap / link (controlled boundary)

### Provider vocabulary (SELECTED)

```text
provider = "supabase"
subject  = Supabase Auth user UUID as text
```

Durable key: `(provider, subject) → account_identity.id`. Email is **not** the mapping key.

### Concept

```text
bootstrap:
  external identity missing
      ↓
  create minimum GHM identity
      ↓
  create external mapping

link:
  external identity missing
      ↓
  existing GHM identity supplied explicitly
      ↓
  create external mapping
```

The caller/operator must consciously choose bootstrap versus link.

### Invocation

**Not** a public self-service federation API. **No** product HTTP bootstrap/link endpoint in the current gate.

Trusted **migration / auth boundary** only (Founder: temporary Supabase coexistence; never accept Supabase JWTs on Resource API). Persistence functions: `auth_lookup_external_identity`, `auth_bootstrap_external_identity`, `auth_link_external_identity`.

### Bootstrap semantics

1. Accept `(provider, subject)` only from a **trusted** GHM-controlled caller.
2. Lookup mapping → existing `account_identity.id` if present (idempotent).
3. If absent: controlled JIT create **minimum** `account_identity` + mapping row.
4. **Must not** create `business_membership`, admin privileges, or arbitrary authorization claims.
5. **Must not** open product DB access.
6. **Must not** attach an existing account by email.
7. May return or enable obtaining GHM credentials only through the normal Auth API issuance path as a later wire detail — bootstrap itself is identity linking, not a substitute for Resource API authz.

Idempotent retries with the same `(provider, subject)` must not create duplicate identities.

### Link semantics

1. Accept `(provider, subject, account_id)` only from a trusted caller.
2. If mapping absent and account exists → create mapping (`created`); do **not** create an account.
3. If mapping already points to the same account → `already_linked` (idempotent).
4. If mapping points to a different account → `conflict` (do not move/merge/overwrite).
5. If target account missing → `account_not_found` (do not create account).
6. Linking a **disabled** account is allowed; do **not** re-enable (`account_status` unchanged).
7. Multiple `supabase` subjects may map to one GHM account only through **explicit** repeated links — never automatic cross-product merge.

---

## 14. Public-key / verification contract (Resource API consumers)

Trusted GHM API verifiers (GHM Resource API; later product adapters that verify GHM JWTs) must:

| Check | Rule |
|---|---|
| Signature | Valid ES256 under trusted public key for `kid` |
| Algorithm | Allow-list **ES256** only; reject `none` / unexpected algs |
| `kid` | Required; unknown/retired `kid` → reject |
| `iss` | Must equal `ghm-auth` |
| `aud` | Must equal `ghm-api` |
| `exp` | Present and not expired |
| `iat` | Present; reject absurd skew per implementation policy (exact skew UNSELECTED) |
| `nbf` | Not required by Founder contract; if present, honor if implementation chooses (**UNSELECTED**) |
| `sub` | Present; maps to valid GHM identity for AuthContext |

During signing-key rotation: trust **active** public key and **previous** public key for ≥ 15 minutes + clock skew, then retire previous.

**Not frozen here:** JWKS URL, hostname, key encoding, file format, secret-store vendor, distribution mechanism.

Supabase JWTs: **always reject** as GHM credentials.

Current HS verifier remains live until a separate implementation/cutover gate.

---

## 15. Error contract

### HTTP mapping

| HTTP | Meaning |
|---|---|
| **401** | Authentication failure |
| **403** | Authorization failure |
| **400** | Invalid request / password policy (non-authz) |
| **429** | Rate limited (if used; mapping UNSELECTED) |
| **500** | Internal error (no secret leakage) |

### Representative machine-readable codes

Current Resource API often returns a single string field `{ error: 'unauthorized' }`. Target Auth API should prefer **stable codes** (shape UNSELECTED — may extend `{ error, code, message }` or equivalent).

Representative catalogue (**not fully frozen** unless later selected):

```text
AUTHENTICATION_REQUIRED
INVALID_CREDENTIALS
INVALID_REFRESH_CREDENTIAL
REFRESH_CREDENTIAL_REUSED
SESSION_EXPIRED
SESSION_REVOKED
RECOVERY_CREDENTIAL_INVALID
RECOVERY_CREDENTIAL_EXPIRED
RECOVERY_CREDENTIAL_REUSED
PASSWORD_POLICY_VIOLATION
RATE_LIMITED
INSUFFICIENT_AUTHORIZATION
INVALID_REQUEST
```

### Rules

- Stable machine-readable code + safe human message.
- No passwords, refresh secrets, recovery secrets, or access tokens in responses or ordinary logs.
- No account enumeration via distinct timings/messages where avoidable.
- Consistent 401 vs 403 semantics.

Exact final catalogue / JSON envelope = **UNSELECTED**.

---

## 16. Security properties (API-level)

Required:

- TLS/secure transport assumed in deployed environments
- No plaintext passwords in logs
- No raw refresh/recovery credentials in logs
- No token values in ordinary audit logs
- Anti-enumeration on login and recovery request
- Rate limiting on login, refresh, recovery, password change (values UNSELECTED)
- Replay protection on refresh and recovery
- Session revocation per Founder policies
- Input validation; bounded bodies (current Resource API uses 1mb JSON — auth may use tighter limits; **UNSELECTED**)
- Safe error messages
- Deterministic auth semantics
- No privilege escalation through Auth API endpoints

Do not design an oversized security platform in this gate.

---

## 17. Idempotency / concurrency summary

| Operation | Expectation |
|---|---|
| Login retries | Safe; may create new sessions per success — abuse limited by rate limits |
| Refresh races | At most one successor from a given live credential; loser fails |
| Logout retries | Idempotent success-equivalent when already revoked |
| Recovery request retries | Enumeration-safe; may no-op or rotate recovery per policy (**detail UNSELECTED**) |
| Recovery complete retries | Second use fails; password not re-applied |
| Bootstrap retries | Idempotent on `(provider, subject)` |

---

## 18. Current vs target gap

| Aspect | Current GHM | Target Auth API |
|---|---|---|
| Login | Absent | Email + password → session + JWT + refresh |
| Refresh / logout / recovery | Absent | Present per §§8–12 |
| Verify | HS `JWT_SECRET`; `userId`+`role` | ES256; `sub`/`iss`/`aud`/`iat`/`exp`/`kid` |
| Identity | Numeric claim only | `ghm.account_identity.id` via `sub` |
| Persistence | No auth session/credential tables | Persistence Contract concepts |
| Products | Connect/QuoteFlow use Supabase Auth | Consume GHM Auth API; never send Supabase JWT to GHM |

```text
email + password
       ↓
GHM authentication
       ↓
canonical account_identity
       ↓
authentication session
       ↓
ES256 access JWT + refresh credential
```

---

## 19. Product migration boundary

```text
Connect  → GHM Auth API → GHM credential → GHM protected API
QuoteFlow → GHM Auth API → GHM credential → GHM protected API
```

Temporary Supabase coexistence may remain during migration.

```text
Supabase JWT
      X
      └── NEVER accepted directly by GHM
```

This document does **not** modify Connect or QuoteFlow.

---

## 20. Remaining unselected decisions

| Item | Status |
|---|---|
| Exact auth URL prefix / paths | **UNSELECTED** |
| Exact request/response JSON schemas | **UNSELECTED** |
| Exact error-code catalogue / envelope | **UNSELECTED** (representatives in §15) |
| Argon2id cost parameters | **UNSELECTED** |
| Recovery TTL | **UNSELECTED** |
| Email provider | **UNSELECTED** |
| Rate-limit values / HTTP status for limits | **UNSELECTED** |
| Refresh token wire representation | **UNSELECTED** (opaque recommended) |
| Logout credential binding (refresh vs access) | **UNSELECTED** |
| Public-key distribution mechanism | **UNSELECTED** |
| Key encoding / `kid` string format | **UNSELECTED** |
| `sub` encoding of bigint | **UNSELECTED** |
| CORS specifics for Auth API | **UNSELECTED** (Resource API uses `CORS_ORIGINS`) |
| Deployment TLS configuration | **UNSELECTED** |
| Exact GRANT matrix for auth persistence | **UNSELECTED** (Persistence Contract §3) |
| Trusted bootstrap invocation path | **UNSELECTED** (must not be public federation) |

---

## 21. Founder decision checkpoint

```text
AUTHENTICATION GATE 2E:
AUTHENTICATION API CONTRACT — DOCUMENTATION COMPLETE

FOUNDER ARCHITECTURE (canonical — not reopened):
- Operations & security semantics in §§4–17
- JWT / session / recovery / mapping rules as listed in this document header

IMPLEMENTATION:
NOT AUTHORIZED.

CURRENT HS VERIFIER:
UNCHANGED.
```

---

## 22. Final gate

```text
GHM AUTHENTICATION API CONTRACT DOCUMENTED.
NO src/ / MIGRATIONS / TESTS / CONFIG / SECRETS / PACKAGES CHANGED.
NO COMMIT / PUSH.
STOP — DO NOT IMPLEMENT.
```
