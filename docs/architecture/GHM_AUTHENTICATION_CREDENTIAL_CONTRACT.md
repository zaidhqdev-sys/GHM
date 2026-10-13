# GHM Authentication Credential Contract

> **Historical-status clarification — 2026-10-13:** Embedded “IMPLEMENTATION NOT AUTHORIZED” statements record the historical Gate 2C decision point. The bounded authentication foundation was subsequently approved and qualified under Gate 3B. Retain unresolved implementation details as open only where current contracts still identify them; do not treat this historical stop as a current blanket prohibition. Product migration and production cutover remain separately gated.


**Canonical owner:** GHM platform governance
**Status:** AUTHENTICATION GATE 2C — HISTORICAL CREDENTIAL / LOGIN CONTRACT; Founder decisions remain binding and the credential/login foundation was subsequently constructed and qualified under Gate 3B.
**Authority:** Local repository `C:\GHM`
**Baseline:** branch `construction/saved-business-resource`, HEAD `239ef5d5065826ddbaae03a2b05c175bee9bce1d`
**Depends on:**
- [GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md](./GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md)
- [GHM_AUTHENTICATION_CONTRACT_GATE.md](./GHM_AUTHENTICATION_CONTRACT_GATE.md)
- [GHM_AUTHENTICATION_CRYPTOGRAPHIC_CONTRACT.md](./GHM_AUTHENTICATION_CRYPTOGRAPHIC_CONTRACT.md)
- [GHM_AUTHENTICATION_SESSION_CONTRACT.md](./GHM_AUTHENTICATION_SESSION_CONTRACT.md)

```text
HISTORICAL GATE 2C SNAPSHOT
AT THAT GATE: IMPLEMENTATION AUTHORIZATION WAS NOT GRANTED
CURRENT: CREDENTIAL / LOGIN / RECOVERY FOUNDATION IS CONSTRUCTION-QUALIFIED ON MAIN
PRODUCT MIGRATION / PRODUCTION CUTOVER REMAIN SEPARATELY GATED
FOUNDER CREDENTIAL DECISIONS RECORDED: 2026-09-21
```

This document defines the **target credential and login architecture** for GHM. It is a **contract**, not an implementation.

---

## 1. Purpose

Distinguish (do not collapse into `account_identity`):

| Concept | Meaning |
|---|---|
| **IDENTITY** | Who the person is inside GHM (`ghm.account_identity`) |
| **CREDENTIAL** | How control of an authentication secret/authenticator is proven |
| **SESSION** | Authenticated session after successful authentication |
| **ACCESS TOKEN** | Short-lived bearer credential for GHM APIs |
| **AUTHORIZATION** | What the authenticated identity may do (membership / privileges) |

```text
identity ≠ credential ≠ session ≠ access token ≠ authorization
```

Credentials (including password material) must remain **separate** from `account_identity` profile rows. Do **not** store passwords or credential secrets in `ghm.account_identity`.

---

## 2. Current-state audit

Historical Gate 2C snapshot was inspected at HEAD `239ef5d`. Current implementation status is governed by the Gate 3B foundation and current auth qualification records.

| Area | Current bounded evidence |
|---|---|
| Account schema | `ghm.account_identity` plus the qualified credential/session/external-identity migrations; email/password credential data remains separate from profile identity |
| JWT verify | `src/auth/ghm-bearer.ts` — ES256 Bearer; canonical `sub` + issuer/audience/expiry contract |
| Auth middleware | `src/auth/http.ts` |
| Config | `src/config.ts` — runtime/database/CORS settings plus `INVITE_CODE`; ES256 signing material is loaded by `src/auth/foundation/es256-keys.ts` from `GHM_JWT_ES256_*` environment variables |
| Credential KDF | The bounded login/credential foundation uses the selected Argon2id path; the historical Gate 2C dependency inventory below is not current package evidence |
| Login / registration endpoints | Bounded GHM routes exist under `/api/v1/auth/`; product integration and public rollout remain gated |
| Password / credential tables | Present in the qualified authentication persistence foundation |
| Recovery / credential-change APIs | Bounded recovery/reset foundation exists; production email delivery and product migration remain separately gated |
| Biometric / WebAuthn / passkey code | Deferred future capability; not part of the qualified foundation |
| Membership | `ghm.business_membership` — authorization, not login credentials |
| Email on `account_identity` | Email is stored in the separate credential/login relation, not on `account_identity` |

### Explicit historical findings

| Capability | Gate 2C baseline | Current bounded status |
|---|---|---|
| GHM stores passwords | No | Argon2id credential foundation qualified |
| GHM credential records | No | Separate credential persistence qualified |
| GHM login endpoints | No | Bounded GHM login foundation qualified |
| GHM account recovery | No | Bounded recovery foundation constructed/qualified within the documented scope; delivery/product gates remain open |
| GHM credential-change operations | No | Current password/recovery/reset scope is governed by the Gate 3B and migration-specific qualification records |
| GHM biometric / passkey / WebAuthn support | No | Still deferred future capability |

```text
The target credential architecture is now implemented for the GHM authentication foundation and construction-qualified. This contract remains the governing design; Connect/QuoteFlow product authentication migration and production cutover remain separately gated.
```

---

## 3. Founder-selected baseline

Already selected (Issuance ADR / prior gates):

- GHM owns authentication and credential lifecycle
- Credentials separate from `account_identity`
- Products authenticate via GHM authentication APIs
- GHM issues bearer access credentials
- GHM owns refresh / session / revocation / logout
- Authentication does not grant business membership
- Authorization remains GHM-controlled

### Credential / login Founder decisions recorded `2026-09-21`

| # | Decision | Selection |
|---|---|---|
| C1 | Primary login identifier | **Email address** |
| C2 | First credential | **Password authentication** |
| C3 | Password KDF | **Argon2id** |
| C4 | Password policy | See §6 (SELECTED) |
| C5 | Account recovery | **Email-based** password recovery using a **short-lived, single-use, server-controlled** recovery credential |
| C6 | Recovery enumeration | Recovery must be **enumeration-resistant** and must **not** reveal whether an account exists |
| C7 | Recovery invalidation | Recovery credential must be **invalidated after successful use** |
| C8 | Password change sessions | **Revoke all other refresh sessions**; **preserve the current authenticated session**; **issue a fresh refresh credential** |
| C9 | Password recovery sessions | **Revoke all existing refresh sessions**; user must **authenticate again** |
| C10 | Future authenticators | **Mobile OTP**, **passkeys/WebAuthn**, and **device-local biometrics** remain **deferred / future options** — not designed or implemented now |

The bounded password-recovery implementation uses a 30-minute credential TTL. Production email transport/provider and delivery enablement remain separately gated; Argon2id cost parameters and any additional operational tuning must follow current implementation/configuration evidence.

---

## 4. Primary login identifier

### Current `account_identity` fields (implemented)

```text
id (bigint)
full_name
phone
avatar_ref
role
created_at
updated_at
```

**No email** on `account_identity` today. Selecting email as the login identifier does **not** authorize stuffing passwords into `account_identity`, and does **not** by itself invent the login-email persistence relation/table name.

### Historical options (evaluation context)

Email / phone / username / external-only / combination were evaluated before Founder selection. Connect and QuoteFlow already use email/password via Supabase Auth (product evidence).

```text
FOUNDER DECISION (2026-09-21):
Primary login identifier = email address — SELECTED
```

---

## 5. Password credential model

```text
FOUNDER DECISION (2026-09-21):
First credential = password authentication — SELECTED
Password KDF = Argon2id — SELECTED
```

Password credentials must:

- be separate from `account_identity`
- never be stored plaintext
- use **Argon2id** (exact cost parameters are an implementation decision)
- use a unique salt (or equivalent KDF salt)
- never appear in logs
- never be returned through APIs
- support controlled credential replacement
- support compromise / revocation

### KDF notes

| Algorithm | Status |
|---|---|
| **Argon2id** | **SELECTED** (Founder). The bounded GHM credential foundation implements this choice; use current package/runtime evidence rather than the historical Gate 2C note. |
| scrypt | Not selected |
| bcrypt | Present unused in `package.json`; **not** selected |

---

## 6. Password policy

```text
FOUNDER DECISION (2026-09-21): Password policy — SELECTED
```

| Rule | Selection |
|---|---|
| Minimum length | **8 characters** |
| Uppercase | **Required** |
| Lowercase | **Required** |
| Number | **Required** |
| Special characters | **Optional** (not required) |
| Forced periodic password changes | **No** |
| Authentication attempt rate limiting | **Yes** (required) |

Still open (not inventing values): maximum length; Unicode normalization details; exact rate-limit thresholds; breached-password screening.

---

## 7. Login contract

Conceptual flow:

```text
Client
  → GHM authentication API
  → email + password credential verification (Argon2id)
  → canonical account identity resolution
  → authentication session creation
  → short-lived GHM access token
     + refresh credential
```

### Authentication failure

- HTTP **401**
- stable machine-readable error code
- avoid account enumeration
- avoid revealing whether an email/account exists
- avoid leaking credential details

### Successful authentication

- Must **not** automatically grant business membership, ownership, or admin privilege
- Authorization remains separate (membership / explicit grants)

### Paths

Authentication endpoint paths are **not** established in-repo. Paths remain a follow-on implementation decision.

---

## 8. Account bootstrap

Consistent with selected JIT bootstrap:

Authentication **may** establish:

- canonical GHM `account_identity` (minimum)
- external identity mapping where applicable
- authentication credential / session
- association of the email login identifier per selected credential architecture (schema not invented here)

Authentication must **not** automatically establish:

- business membership
- business ownership
- administrator privilege
- arbitrary role elevation

Account lifecycle remains GHM-owned.

---

## 9. Credential lifecycle

| Operation | Credential state | Session state | Account state |
|---|---|---|---|
| **Create** | Credential record created/enabled | Unaffected until login | Identity must exist or be JIT-created per policy |
| **Verify** | Password verified via Argon2id | On success → session created | Unchanged privileges |
| **Change** | Old invalid; new active | §11 SELECTED policy | Unchanged identity id |
| **Disable / revoke** | Credential cannot authenticate | Existing sessions follow revoke policy | Account may remain |
| **Recovery** | Short-lived recovery credential → new password | §10 SELECTED policy | Identity continuity preserved |
| **Compromise response** | Credential revoke + account-level session revoke as needed | All/selected sessions revoked | May disable account under lifecycle rules |

Do not implement these operations in this gate.

---

## 10. Account recovery

```text
FOUNDER DECISION (2026-09-21):
Recovery = email-based password recovery
Recovery credential = short-lived, single-use, server-controlled
Enumeration resistance = REQUIRED (must not reveal whether an account exists)
After successful use = recovery credential INVALIDATED
Post-recovery sessions = revoke ALL existing refresh sessions; user must authenticate again
```

Recovery must support:

- initiation (enumeration-resistant responses)
- verification of recovery proof
- short-lived, single-use, server-controlled recovery credential
- invalidation after successful use
- replay protection
- revocation of all existing refresh sessions on successful recovery
- re-authentication required after recovery
- notification / audit requirements (follow-on)

**Do not invent** an email provider, SMS/OTP provider, or recovery table name in this document.

Still open: production email transport/provider and delivery enablement; recovery message templates and product-specific delivery qualification.

---

## 11. Credential change

```text
FOUNDER DECISION (2026-09-21):
Password change session policy — SELECTED
```

When a password is changed while authenticated:

- new password credential safely replaces old (Argon2id)
- old password can no longer authenticate
- **revoke all other refresh sessions**
- **preserve the current authenticated session**
- **issue a fresh refresh credential** for the current session
- auditability is required

This differs from recovery (which revokes **all** refresh sessions).

---

## 12. Biometric / passkey / OTP future capability

```text
FOUNDER DECISION (2026-09-21):
Mobile OTP = DEFERRED / FUTURE OPTION (not designed or implemented now)
Passkeys / WebAuthn = DEFERRED / FUTURE OPTION
Device-local biometrics = DEFERRED / FUTURE OPTION
Raw biometric storage in GHM = PROHIBITED
```

### Clarifications

- GHM must **NOT** receive or store raw fingerprints, facial templates, or other raw biometric material.
- A future biometric capability should use a standards-based authenticator/protocol (e.g. WebAuthn/passkeys) where the **device** performs biometric verification locally and GHM verifies a **cryptographic assertion**.
- Device biometric UX ≠ permission to implement WebAuthn or OTP now.
- Reopening WebAuthn/passkeys/mobile OTP requires an **explicit Founder architecture decision**.

| Item | Status |
|---|---|
| Biometric authentication | **FUTURE OPTION** (deferred) |
| WebAuthn / passkeys | **DEFERRED** |
| Mobile OTP | **DEFERRED** |
| Raw biometric storage in GHM | **PROHIBITED** |
| Implementation | **NOT AUTHORIZED** |

---

## 13. External identity mapping

```text
(provider, subject)
        ↓
external identity mapping
        ↓
ghm.account_identity.id
```

- External provider identity is **not** a GHM authorization role.
- Existing Supabase UUIDs are **migration subjects** only.
- **SELECTED:** `provider = 'supabase'`; `subject` = Auth user UUID as text; relation `ghm.account_external_identity`.
- Email is **not** the external mapping key.
- Bootstrap creates a minimum account when mapping is missing; **link** attaches an existing account without minting identity.
- Do not invent automatic email merges.

---

## 14. Security invariants

1. Credentials are separate from `account_identity`.
2. Plaintext passwords are prohibited.
3. Password hashes use Argon2id (when implemented).
4. Raw biometric data is prohibited.
5. Authentication failure does not reveal account existence.
6. Recovery responses do not reveal whether an account exists.
7. Successful login creates/resolves canonical GHM identity.
8. Authentication does not grant membership.
9. Authentication does not grant admin privilege.
10. Credential changes are auditable.
11. Recovery credentials are short-lived, single-use, and invalidated after success.
12. Compromised credentials can be revoked.
13. GHM controls authentication lifecycle.
14. Products cannot manufacture credentials.
15. Products cannot manufacture `AuthContext`.
16. Credential secrets never appear in logs.
17. Direct product database access remains prohibited.
18. Supabase JWTs are never accepted as GHM login credentials.

---

## 15. Decision status table

| Decision | Status |
|---|---|
| GHM owns credentials | **SELECTED** |
| credential / `account_identity` separation | **SELECTED** |
| primary login identifier | **SELECTED: email** (`2026-09-21`) |
| password authentication | **SELECTED** (`2026-09-21`) |
| password hashing algorithm | **SELECTED: Argon2id** (`2026-09-21`) |
| password policy (min 8; upper; lower; number; special optional; no forced rotation; rate-limited) | **SELECTED** (`2026-09-21`) |
| breached-password handling | **UNSELECTED** |
| exact rate-limit thresholds | **UNSELECTED** |
| recovery channel | **SELECTED: email** (`2026-09-21`) |
| recovery credential properties | **SELECTED: short-lived, single-use, server-controlled; invalidate after use; enumeration-resistant** |
| exact numeric recovery lifetime | The bounded password-recovery implementation issues a 30-minute recovery credential (`src/auth/password-recovery.ts`); production email delivery remains gated |
| email transport / provider | **UNSELECTED** (not invented) |
| post-recovery session handling | **SELECTED: revoke all refresh sessions; re-authenticate** (`2026-09-21`) |
| credential-change session handling | **SELECTED: revoke other refresh sessions; keep current; issue fresh refresh** (`2026-09-21`) |
| biometric capability | **FUTURE OPTION / DEFERRED** |
| mobile OTP | **DEFERRED** |
| WebAuthn / passkeys | **DEFERRED** |
| raw biometric storage | **PROHIBITED** |
| external identity mapping | **SELECTED:** `provider='supabase'`; `(provider,subject)→account_id`; bootstrap + link DEFINER ops |
| credential table / schema names | Implemented in the qualified migrations; canonical credential table is `ghm.account_password_credential`, with separate session/refresh/recovery/mapping relations |

---

## 16. Recommendation note

Prior technical recommendations that are now Founder-selected are recorded in §3 and §15. Remaining recommendations (exact Argon2id parameters, rate-limit numbers, email provider choice, login-email persistence schema) stay **implementation / follow-on** and are **not** Founder decisions.

```text
Do not convert remaining open items into Founder decisions without an explicit selection.
```

---

## 17. Founder decision checkpoint

```text
AUTHENTICATION GATE 2C:
CREDENTIAL / LOGIN CONTRACT — FOUNDER DECISIONS RECORDED (2026-09-21)

1. Primary login identifier:
   SELECTED — email address

2. Password authentication:
   SELECTED

3. Password hashing algorithm:
   SELECTED — Argon2id

4. Password policy:
   SELECTED — min 8; upper; lower; number; special optional; no forced rotation; rate-limited

5. Recovery channel:
   SELECTED — email-based password recovery
   (short-lived, single-use, server-controlled recovery credential;
    enumeration-resistant; invalidate after successful use)

6. Exact numeric recovery lifetime:
   UNSELECTED (must remain short-lived)

7. Post-recovery session policy:
   SELECTED — revoke all existing refresh sessions; re-authenticate

8. Credential-change session policy:
   SELECTED — revoke all other refresh sessions; preserve current session; issue fresh refresh

9. Biometric / mobile OTP / passkeys-WebAuthn:
   DEFERRED / FUTURE OPTIONS — not designed or implemented now

10. Raw biometric storage:
    PROHIBITED

IMPLEMENTATION AUTHORIZATION:
NOT GRANTED.
```

---

## 18. Final gate — historical Gate 2C stop

The block below preserves the original Gate 2C decision snapshot. Its implementation-stop language is historical for the bounded authentication foundation subsequently constructed and qualified under Gate 3B; product migration and production cutover remain separately gated.

```text
AUTHENTICATION GATE 2C FOUNDER CREDENTIAL DECISIONS RECONCILED (2026-09-21).
CURRENT IMPLEMENTATION UNCHANGED (NO LOGIN / PASSWORD / RECOVERY / BIOMETRICS).
SELECTED CREDENTIAL ARCHITECTURE DOCUMENTED.
NO CREDENTIAL TABLES / KEYS / ENDPOINTS / EMAIL PROVIDERS CREATED.
IMPLEMENTATION NOT AUTHORIZED.
```
