# GHM Authentication Implementation Parameter Gate

**Canonical owner:** GHM platform governance
**Status:** AUTHENTICATION GATE 3B — IMPLEMENTATION PARAMETER GATE — **DOCUMENTATION ONLY**; parameters proposed for **Founder approval**; **DDL / implementation NOT AUTHORIZED**
**Authority:** Local repository `C:\GHM`
**Depends on:** Founder-selected architecture (Issuance ADR 1–12, C1–C10, R1–R7) and:
- [GHM_AUTHENTICATION_SCHEMA_MIGRATION_CONTRACT.md](./GHM_AUTHENTICATION_SCHEMA_MIGRATION_CONTRACT.md)
- [GHM_AUTHENTICATION_CRYPTOGRAPHIC_CONTRACT.md](./GHM_AUTHENTICATION_CRYPTOGRAPHIC_CONTRACT.md)
- [GHM_AUTHENTICATION_SESSION_CONTRACT.md](./GHM_AUTHENTICATION_SESSION_CONTRACT.md)
- [GHM_AUTHENTICATION_CREDENTIAL_CONTRACT.md](./GHM_AUTHENTICATION_CREDENTIAL_CONTRACT.md)
- [GHM_AUTHENTICATION_API_CONTRACT.md](./GHM_AUTHENTICATION_API_CONTRACT.md)
- [GHM_AUTHENTICATION_IDENTITY_AUTHORIZATION_CONTRACT.md](./GHM_AUTHENTICATION_IDENTITY_AUTHORIZATION_CONTRACT.md)

```text
IMPLEMENTATION AUTHORIZATION: NOT GRANTED
NO DDL / src / PACKAGES / SECRETS
PARAMETERS BELOW = PROPOSED UNTIL FOUNDER APPROVES
```

---

## 0. Distinction of decision classes

| Class | Meaning |
|---|---|
| **A. Founder-selected architecture** | Frozen — not reopened (§1) |
| **B. Parameters proposed by this gate** | Implementation choices — **Founder approval required** before DDL/impl |
| **C. Intentionally deferred** | Not invented here (§19) |

---

## 1. Founder-selected architecture (frozen — Class A)

Confirmed against repository decision records (not reopened):

| Item | Selection |
|---|---|
| Issuer | GHM |
| Credential/session owner | GHM |
| Product transport | GHM Auth → GHM bearer credentials |
| JWT | ES256; `sub`/`iss`/`aud`/`iat`/`exp`/`kid`; `iss=ghm-auth`; `aud=ghm-api`; TTL **15m** |
| Signing key | Secret-managed inside issuer; one active; prior public trusted ≥ TTL + skew |
| Refresh | 30d inactivity; 90d absolute; rotate every success; single-use; replay → **session family** revoke |
| Account-wide revoke | Recovery / confirmed compromise |
| Login | Email + password; Argon2id; policy min 8 + upper/lower/number; special optional; no forced rotation |
| Recovery | Email; short-lived; single-use; enumeration-resistant; revoke **all** sessions; re-login |
| Password change | Revoke other sessions; keep current; fresh refresh |
| Person map | `(provider, subject) → account_identity.id` |
| Business map | `(provider, external_business_id) → business.id` |
| Bootstrap | Min identity + mapping only; no membership/admin |
| Account status | `active` \| `disabled` |
| System admin | Governed account state (`is_system_admin`), not JWT |
| AuthContext | Identity-centric; authz from GHM state |
| Runtime | SECURITY DEFINER + EXECUTE; no broad DML |
| Coarse `role` | Temporary compat; not long-term authz truth |
| Supabase | Coexistence OK; **never** accept Supabase JWTs directly |

### Repository evidence (read-only)

| Evidence | Finding |
|---|---|
| Runtime | Node `>=18`; TypeScript |
| JWT | `jsonwebtoken@^9.0.3` (HS today) |
| Password libs | `bcrypt` present but **unused** under `src/` for auth; Founder = **Argon2id** → future `argon2` (or equivalent) dependency — **do not install in this gate** |
| Rate limit | `express-rate-limit@^7.4.0` already in `package.json` (not wired for Auth API yet) |
| Config | `dotenv`; `JWT_SECRET` HS only today |
| Errors | `{ error: 'unauthorized' \| 'forbidden' \| … }` |
| IDs | `bigint` identity; AuthContext `userId: number` |
| Schema contract | Tables/columns proposed; parameters left open — this gate freezes them |

**No contradiction** with Class A Founder decisions discovered. Note: `bcrypt` must not be used for GHM password hashing under selected Argon2id.

---

## 2. Password parameters (Class B — proposed)

### 2.1 Argon2id

| Parameter | Proposed value |
|---|---|
| Algorithm | Argon2id |
| Memory | **65536 KiB** (64 MiB) |
| Time cost | **3** iterations |
| Parallelism | **1** |
| Hash length | **32** bytes |
| Salt length | **16** bytes |
| Encoded representation | PHC string from the Argon2 library (includes alg, params, salt, hash) |
| Future dependency | `argon2` (Node native) — **not installed in this gate**; do not use `bcrypt` for passwords |

Rationale: OWASP-aligned interactive login costs; practical on private ZAID Node hosts without KMS/HSM.

### 2.2 Password verification

| Rule | Proposed |
|---|---|
| Verify | Constant-time library verify against stored PHC string |
| Malformed / unknown hash | Treat as authentication failure (**401**); generic message; log internal fault without password |
| Transparent rehash | **Yes** — on successful login, if stored params are weaker than current configured params, rehash and store new hash in same transaction as login success side-effects |

```text
FOUNDER APPROVAL REQUIRED: Argon2id parameters + verification/rehash policy (§2)
```

---

## 3. Email login parameters (Class B — proposed)

First-implementation policy is **deliberately narrow and deterministic**. It does **not** commit GHM to full internationalized-email (RFC 6530 / IDNA) semantics. Broader Unicode mailbox support may be designed later if required.

| Rule | Proposed |
|---|---|
| Trim | Strip surrounding whitespace from the accepted input |
| Deterministic normalized login key | Compute `login_email_normalized` for uniqueness and comparison only |
| Case normalization | Apply ASCII-oriented lowercasing to the accepted address string used for the normalized login key (e.g. Unicode casefold / `toLocaleLowerCase('en-US')` on the string as accepted after trim) |
| Unicode | Apply **NFKC** only as a deterministic string-normalization step on that login key — **not** a promise of IDN domain conversion, SMTPUTF8 routing, or “every possible Unicode mailbox form” support |
| Max length | **320** characters on pre-normalize input; reject longer |
| Storage | `login_email` = trimmed accepted form (as submitted); `login_email_normalized` = trim + NFKC + case normalization; **UNIQUE** on normalized key |
| Display / outbound | Prefer `login_email` when showing or emailing the user; auth lookups use the normalized key |
| Out of scope (first gate) | No second email-identity system; no provider-specific email semantics; no claim of complete internationalized-email compatibility |

### Enumeration resistance

| Endpoint | Behavior |
|---|---|
| Login | Same **401** / timing band for unknown email vs bad password |
| Recovery request | Same success-shaped response whether or not email exists |
| Bootstrap | Trusted boundary only; do not expose mapping existence on public surfaces |

```text
FOUNDER APPROVAL REQUIRED: email normalization policy (§3)
  (narrow first-gate deterministic login key — not full i18n email)
```

---

## 4. Recovery parameters (Class B — proposed)

| Parameter | Proposed value |
|---|---|
| TTL | **30 minutes** |
| Entropy | **32 bytes** CSPRNG |
| Wire representation | URL-safe base64 (no padding) of the 32 raw bytes |
| DB storage | `token_hash` = **HMAC-SHA256**(pepper, raw_token) as `bytea`; **never** store raw token |
| Pepper | **Required** — env `GHM_AUTH_TOKEN_PEPPER` (min 32 bytes entropy; distinct from signing keys) |
| Single-use | `used_at` set atomically on redeem |
| After expiry | Reject; no password change |
| After success | Credential consumed; password replaced; **all** refresh sessions revoked; **no** auto-login |
| Replay / second redeem | Fail; no second password write |

Email **provider** = deferred (Class C).

```text
FOUNDER APPROVAL REQUIRED: recovery TTL/format/hash/pepper (§4)
```

---

## 5. Refresh token parameters (Class B — proposed)

| Parameter | Proposed value |
|---|---|
| Type | **Opaque** (not JWT) |
| Entropy | **32 bytes** CSPRNG |
| Wire | URL-safe base64 (no padding) |
| DB | `token_hash` = **HMAC-SHA256**(pepper, raw_token) as `bytea`; plaintext **never** persisted |
| Pepper | Same `GHM_AUTH_TOKEN_PEPPER` as recovery (separate purpose codes in HMAC message optional: prefix `refresh:` / `recovery:`) |
| Lineage | `predecessor_id`; at most one live tip per session (partial unique index) |
| Authority | Database state is lifecycle authority |

No JWT refresh tokens.

```text
FOUNDER APPROVAL REQUIRED: refresh format/entropy/hash/pepper (§5)
```

---

## 6. Access JWT parameters (Class B — proposed)

| Claim / header | Representation |
|---|---|
| `sub` | **Decimal string** of `account_identity.id` (no leading zeros; e.g. `"42"`) |
| `iss` | `ghm-auth` |
| `aud` | `ghm-api` |
| `iat` / `exp` | Numeric Date; `exp = iat + 900` seconds (15m) |
| `kid` | Required string (format §7) |
| alg | **ES256 only** |

| Verify rule | Proposed |
|---|---|
| Issuer / audience / exp | Required |
| `nbf` | Not emitted; if present, reject if `nbf > now + skew` |
| Clock skew | **±60 seconds** |
| Unknown / retired `kid` | Reject |
| Malformed | Reject **401** |
| Roles/membership in JWT | **Not** authorization authority; if ever present for debug, ignore for authz |

```text
FOUNDER APPROVAL REQUIRED: sub representation + clock skew (§6)
```

---

## 7. ES256 key parameters (Class B — proposed)

| Item | Proposed |
|---|---|
| Active private key env | `GHM_JWT_ES256_PRIVATE_KEY_PEM` (PKCS#8 PEM, EC P-256) |
| Active public key env | `GHM_JWT_ES256_PUBLIC_KEY_PEM` |
| Active `kid` env | `GHM_JWT_ES256_KID` |
| Previous public key env | `GHM_JWT_ES256_PREVIOUS_PUBLIC_KEY_PEM` (optional empty) |
| Previous `kid` env | `GHM_JWT_ES256_PREVIOUS_KID` (optional empty) |
| `kid` format | Non-empty printable ASCII ≤ 64 chars; recommend `ghm-es256-` + UTC date `YYYYMMDD` + short counter (e.g. `ghm-es256-20260921-1`) |
| Verify selection | Match JWT `kid` to active or previous public material |
| Rotation | Install B as active; keep A as previous |
| Retirement | Drop previous when **now > rotation_time + 15m + 60s skew** |
| Overlap minimum | **15 minutes + 60 seconds** |
| KMS/HSM | Not required |

Do not write real key material in repo.

```text
FOUNDER APPROVAL REQUIRED: key env names, kid format, overlap (§7)
```

---

## 8. Session parameters (Class B — proposed)

**Session family (lean first implementation):**

```text
authentication_session.id
        │
        └── session family identity
              │
              ├── refresh credential A
              ├── refresh credential B
              └── refresh credential C
```

| Invariant | Rule |
|---|---|
| One session = one family | One `authentication_session` row is one refresh-token **session family** |
| Stable family identity | `authentication_session.id` **is** the stable session-family identity |
| Refresh rotation | Refresh credentials rotate **within** that family (predecessor/successor on `refresh_credential`) |
| Replay | Consumed refresh credential → revoke the associated **session/family** (that `authentication_session` + its refresh rows) |
| No separate family artifact | `session_id` and `session_family_id` are **intentionally not separate persisted concepts** in the first implementation — do **not** add a family table or extra family id column |

| Field | Proposed |
|---|---|
| Session / family id | `authentication_session.id` |
| `created_at` | Session (family) start |
| `last_seen_at` | Updated **only on successful refresh** (not on every Resource API access) — avoids per-request DB writes |
| `absolute_expires_at` | `created_at + 90 days` |
| Inactivity | `last_seen_at + 30 days` enforced at refresh |
| `revoked_at` / `revoke_reason` | Set on logout, replay, password change (other sessions), recovery (all), account disable |

| Event | Sessions / families |
|---|---|
| Logout | Revoke that session/family |
| Password change | Revoke other families; keep current; new refresh |
| Recovery | Revoke **all** families |
| Account disable | Revoke **all** families |

```text
FOUNDER APPROVAL REQUIRED: last_seen_at update rule + session-id-as-family invariant (§8)
```

---

## 9. Refresh concurrency (Class B — proposed)

### Normal refresh

```text
present refresh → hash → find row
→ lock session FOR UPDATE
→ validate account active + session active + inactivity + absolute
→ UPDATE refresh SET used_at WHERE id AND used_at IS NULL AND revoked_at IS NULL
→ if 0 rows → replay/invalid path
→ INSERT successor; set predecessor_id
→ UPDATE session last_seen_at
→ issue access JWT + new refresh
→ COMMIT
```

### Concurrent refresh

At most one successor; loser fails. Partial unique live-tip index enforces invariant.

### Replay

Consumed/revoked credential → revoke **that session family only** → **401**; not account-wide unless recovery/compromise.

**DB invariant:** partial `UNIQUE (session_id) WHERE used_at IS NULL AND revoked_at IS NULL`.

```text
FOUNDER APPROVAL REQUIRED: refresh concurrency/replay semantics (§9) — aligns with Founder architecture; confirm as implementation freeze
```

---

## 10. Recovery concurrency (Class B — proposed)

```text
UPDATE recovery SET used_at = now()
 WHERE id = :id AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
```

First wins; second fails. Same transaction: password replace + revoke all sessions. No new session issued.

```text
FOUNDER APPROVAL REQUIRED: recovery concurrency (§10)
```

---

## 11. Account disable semantics (Class B — proposed)

When `account_status = 'disabled'`:

| Concern | Behavior |
|---|---|
| Login | Fail **401** |
| Refresh | Fail **401**; sessions revoked in disable transaction |
| Access JWTs | Not retroactively blacklisted; expire by `exp` (≤15m) |
| Membership rows | Unchanged |
| Re-enable | Does **not** restore revoked sessions; user must sign in again |

No account-deletion feature in this gate.

```text
FOUNDER APPROVAL REQUIRED: disable semantics (§11) — confirms R1 operational detail
```

---

## 12. System-admin semantics (Class B — proposed)

- Durable column `is_system_admin` (Schema Contract).
- Not JWT authority; not business `administrator`; not inferred from membership/product claims.
- AuthContext (R3): may expose `isSystemAdmin: boolean` **loaded from DB after verify**, never from JWT alone.

```text
FOUNDER APPROVAL REQUIRED: AuthContext exposure of isSystemAdmin from DB (§12)
```

---

## 13. Rate limiting (Class B — proposed)

Use existing dependency class `express-rate-limit` (already in `package.json`) — in-process, per-instance; no distributed rate-limit service.

| Endpoint class | Proposed default (per client IP) |
|---|---|
| Login | 10 / 15 minutes |
| Refresh | 60 / 15 minutes |
| Recovery request | 5 / 15 minutes |
| Recovery redeem | 5 / 15 minutes |
| Password change | 10 / 15 minutes |
| Bootstrap (trusted) | 30 / 15 minutes (plus caller authn) |

Behind `TRUST_PROXY` when applicable. Exact numbers = Founder approval.

```text
FOUNDER APPROVAL REQUIRED: rate-limit defaults (§13)
```

---

## 14. Error / security response (Class B — proposed)

| HTTP | Use |
|---|---|
| **401** | Authn failures (missing/malformed/invalid/expired token, bad login, bad refresh, bad recovery) |
| **403** | Authz failures (membership, ownership, non-admin) |
| **400** | Password policy / invalid request shape (no secret leak) |
| **429** | Rate limited |

Machine-readable codes: extend toward Auth API Contract catalogue (`INVALID_CREDENTIALS`, `REFRESH_CREDENTIAL_REUSED`, …). Exact JSON envelope UNSELECTED beyond stable `code` + safe `message`.

Must not leak: email/account existence, mapping existence, which factor failed, DB internals, stack traces, secrets.

```text
FOUNDER APPROVAL REQUIRED: 401/403/429 mapping + anti-enumeration (§14)
```

---

## 15. Retention / cleanup (Class B — proposed)

| Data | Proposed |
|---|---|
| Expired/revoked sessions & refresh rows | Retain **30 days** after terminal state, then delete |
| Consumed/expired recovery rows | Retain **7 days**, then delete |
| External / business mappings | **Retain** until explicit unlink (no auto-delete) |
| Cleanup mechanism | **Deferred periodic job** (manual/SQL acceptable initially); not synchronous on every request |

```text
FOUNDER APPROVAL REQUIRED: retention windows + deferred cleanup (§15)
```

---

## 16. Migration safety (Class B — proposed)

| Rule | Proposed |
|---|---|
| Ordering | Per Schema Migration Contract §16 |
| Transactions | Each migration file one transactional unit where PostgreSQL allows |
| Reversibility | **Forward-only** for auth secrets tables in production practice; down-migrations optional for construction only |
| Existing accounts | `account_status='active'`; `is_system_admin=(role='admin')` |
| No password yet | Allowed until registration/login provisioning |
| Supabase UUID | Mapping only — **not** equivalent to GHM identity |
| Product business IDs | Mapping only — **not** equivalent to `ghm.business.id` |
| Auto-equivalence | **Forbidden** |

```text
FOUNDER APPROVAL REQUIRED: migration safety rules (§16)
```

---

## 17. Security concerns noted (documentation only)

| Concern | Note |
|---|---|
| `bcrypt` in package.json | Must not be used for GHM passwords; Argon2id selected |
| HS `JWT_SECRET` still live | Remains until separate cutover gate |
| In-process rate limits | Multi-instance deploy needs later shared limiter — acceptable for first private gate |
| Shared pepper env | Protect `GHM_AUTH_TOKEN_PEPPER` like signing material |

No code fixes in this gate.

---

## 18. Implementability checklist

| Question | Answer |
|---|---|
| Session-family unambiguous? | **Yes** — `authentication_session.id` is the family; refresh credentials belong to that session; no separate family table |
| Refresh replay atomic? | **Yes** — conditional `UPDATE` + partial unique live tip + session lock |
| Recovery redemption atomic? | **Yes** — conditional `UPDATE used_at` + revoke-all in one txn |
| Supabase non-equivalent? | **Yes** — explicit; mapping only |

---

## 19. Founder approval table

| Parameter | Proposed value | Status |
|---|---|---|
| Argon2id parameters | 64MiB / time 3 / p=1 / hash 32 / salt 16 / PHC | **Founder approval required** |
| Password rehash on login | Yes when params weaker | **Founder approval required** |
| Email normalization | Trim + NFKC + case norm for login key only; max 320; not full i18n email | **Founder approval required** |
| Recovery TTL | 30 minutes | **Founder approval required** |
| Recovery token format | 32-byte CSPRNG; base64url wire | **Founder approval required** |
| Recovery/refresh hash | HMAC-SHA256 with pepper → `bytea` | **Founder approval required** |
| Refresh token format/entropy | Opaque 32-byte; base64url | **Founder approval required** |
| Token pepper | `GHM_AUTH_TOKEN_PEPPER` required | **Founder approval required** |
| JWT `sub` representation | Decimal string of bigint id | **Founder approval required** |
| Clock skew | ±60 seconds | **Founder approval required** |
| ES256 key env names | `GHM_JWT_ES256_*` set in §7 | **Founder approval required** |
| `kid` format | `ghm-es256-YYYYMMDD-N` style | **Founder approval required** |
| Key overlap/retirement | 15m + 60s then drop previous | **Founder approval required** |
| `last_seen_at` updates | Successful refresh only | **Founder approval required** |
| Rate limits | Defaults in §13 | **Founder approval required** |
| Retention/cleanup | §15 windows; deferred job | **Founder approval required** |
| Exact API paths | — | **Deferred** to API implementation gate |
| Exact SQL function names | Schema contract proposals | **Deferred** to implementation |
| Email provider | — | **Deferred** |
| Product migration/cutover | — | **Deferred** |
| Distributed rate limiting | — | **Deferred** |
| KMS/HSM | — | **Deferred** (not required) |

---

## 20. Final gate

```text
IMPLEMENTATION PARAMETER GATE DOCUMENTED.
ALL CLASS-B PARAMETERS AWAIT FOUNDER APPROVAL.
NO DDL / src / PACKAGES / SECRETS / COMMIT / PUSH.
STOP.
```
