# GHM Authentication Session Contract

**Canonical owner:** GHM platform governance
**Status:** AUTHENTICATION GATE 2B — SESSION / REFRESH CONTRACT — **PARTIAL FOUNDER DECISIONS RECORDED** (durations + refresh rotation/replay SELECTED; opaque refresh / persistence UNSELECTED); **implementation NOT AUTHORIZED**
**Authority:** Local repository `C:\GHM`
**Baseline:** branch `construction/saved-business-resource`, HEAD `239ef5d5065826ddbaae03a2b05c175bee9bce1d`
**Depends on:**
- [GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md](./GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md)
- [GHM_AUTHENTICATION_CONTRACT_GATE.md](./GHM_AUTHENTICATION_CONTRACT_GATE.md)
- [GHM_AUTHENTICATION_CRYPTOGRAPHIC_CONTRACT.md](./GHM_AUTHENTICATION_CRYPTOGRAPHIC_CONTRACT.md)

```text
IMPLEMENTATION AUTHORIZATION: NOT GRANTED
DOCUMENTATION-ONLY GATE
NO REFRESH / REVOCATION / LOGOUT IMPLEMENTATION
NO SESSION TABLES CREATED
```

This document defines the **target session / refresh architecture** for GHM-owned authentication. It is a **contract**, not an implementation.

---

## 1. Purpose

Govern target behavior for:

- access-token lifetime
- refresh credentials
- refresh rotation
- refresh reuse / replay handling
- logout
- revocation (session and account)
- session lifecycle
- credential / session separation from `ghm.account_identity` profile data

Live products (Connect, QuoteFlow) will eventually consume this model via the GHM authentication API. Exact lifetimes and replay policy remain Founder-unselected.

---

## 2. Existing-state audit

Inspected (read-only) at HEAD `239ef5d`:

| Area | Evidence |
|---|---|
| JWT verification | `src/auth/request-context.ts` — HS Bearer via `JWT_SECRET`; claims `userId` + `role` |
| Auth middleware | `src/auth/http.ts` — `requireAuth` → `401` `{ error: 'unauthorized' }` |
| Authorization | `src/auth/authorization.ts` — `AuthContext`; membership/role helpers |
| Config | `src/config.ts` / `.env.example` — `JWT_SECRET`; no refresh/session secrets |
| Account identity | `ghm.account_identity` (bigint id; coarse `role`; no credential columns for refresh) |
| Membership | `ghm.business_membership` (`active` / `inactive` / `revoked`) — **business** membership, not auth sessions |
| JWT tests | Sign HS tokens in tests only; no refresh/logout suite |
| Auth session tables | **None** found (`refresh_token` / `auth_session` / logout APIs absent under `src/` and migrations search) |
| DB “session” mentions | Migrator `session_user` identity checks only — not product auth sessions |

### Accurate current findings

| Concern | Current state |
|---|---|
| Access-token behavior | Short-lived **by product convention in tests** (`expiresIn` in some tests); production verifier checks signature + claims but does **not** implement GHM-owned issuance or target asymmetric/`exp`-policy contract |
| Refresh tokens | **Absent** |
| Server-side auth sessions | **Absent** |
| Revocation (auth session) | **Absent** (membership `revoked` is unrelated business membership status) |
| Logout | **Absent** as a GHM API (products may discard client tokens only) |
| Credential storage | No GHM password/refresh credential store in `src/`; `bcrypt` dependency unused under `src/` |
| Account lifecycle (auth) | Account rows must pre-exist for FK-bound ops; no JIT auth bootstrap implemented |

Do not infer refresh, logout, or session persistence that does not exist.

```text
CURRENT IMPLEMENTATION ≠ TARGET SESSION CONTRACT.
```

---

## 3. Founder-selected session baseline

Already selected (Issuance ADR / Contract Gate):

| Item | Status |
|---|---|
| GHM owns refresh | SELECTED |
| GHM owns revocation | SELECTED |
| GHM owns logout | SELECTED |
| Access tokens short-lived | SELECTED |
| Refresh credentials server-controlled | SELECTED |
| Refresh credentials revocable | SELECTED |
| Refresh credentials rotated | SELECTED |
| Logout revokes the refresh session | SELECTED |
| Existing access tokens expire naturally | SELECTED |
| Account/session revocation authoritative in GHM | SELECTED |
| Access-token lifetime = **15 minutes** | **SELECTED** (Founder; see Cryptographic Contract §7) |
| Refresh/session duration model = **sliding inactivity window + absolute maximum lifetime** | **SELECTED** (Founder) |
| Inactivity timeout = **30 days** | **SELECTED** (Founder) |
| Absolute session maximum = **90 days** | **SELECTED** (Founder) |

**Credential-linked session policies Founder-selected `2026-09-21`** (see Credential Contract):

| Event | Session policy |
|---|---|
| **Password change** | Revoke **all other** refresh sessions; **preserve** the current authenticated session; **issue a fresh refresh credential** |
| **Password recovery** | Revoke **all** existing refresh sessions; user must **authenticate again** |

**Still not Founder-selected:**

- session persistence schema
- revocation representation
- whether refresh credentials are opaque (recommended below; not Founder-recorded)
- JWT signing-key storage class / `kid` required (Cryptographic Contract — **SELECTED**; exact encoding/values UNSELECTED)
- Conceptual durable persistence for credential/session/refresh/recovery/mapping: [GHM_AUTHENTICATION_PERSISTENCE_CONTRACT.md](./GHM_AUTHENTICATION_PERSISTENCE_CONTRACT.md)

High-level Issuance ADR language that refresh credentials are **rotated** is refined by Founder-selected policy below. Do **not** invent multi-device session-management UI.

**Founder-selected refresh rotation / replay policy:**

| Item | Status |
|---|---|
| Rotate refresh credentials on **every successful refresh** | **SELECTED** |
| Refresh credentials are **single-use** | **SELECTED** |
| Replay of a used refresh credential **revokes the affected session family** | **SELECTED** |

Account-wide session revocation remains distinct (password recovery / compromise) and is **not** the default replay response.

---

## 4. Access token lifetime

Access tokens are **short-lived JWTs**. Founder-selected access-token lifetime:

```text
FOUNDER DECISION:
Access-token lifetime = 15 minutes (SELECTED)
```

Candidate evaluation history remains in [GHM_AUTHENTICATION_CRYPTOGRAPHIC_CONTRACT.md](./GHM_AUTHENTICATION_CRYPTOGRAPHIC_CONTRACT.md) §7.

**Keep separate from this Session Gate:**

| Concept | Owner gate | Status |
|---|---|---|
| Access-token lifetime | Cryptographic / this § | **SELECTED: 15 minutes** |
| Refresh credential (opaque/rotated) | §5 / §7 | Server-controlled + revocable + every-success rotate + single-use + session-family replay **SELECTED**; opacity RECOMMENDED / UNSELECTED |
| Inactivity timeout | §6 | **SELECTED: 30 days** |
| Absolute session maximum | §6 | **SELECTED: 90 days** |

---

## 5. Refresh credential model

### Target properties

Refresh credentials should be:

- server-controlled
- high entropy
- **opaque** unless a later Founder decision establishes otherwise
- stored securely (prefer hash/reference at rest when feasible)
- revocable
- rotated on successful use
- associated with a GHM `account_identity`
- associated with an authentication **session**
- independent from the access JWT
- never treated as authorization roles
- never exposed in logs

### Why opaque server-controlled refresh is preferred (recommendation, not decision)

Repository evidence shows GHM already centralizes authorization in services/SQL and forbids product-manufactured `AuthContext`. An opaque refresh credential:

- keeps durable session authority **inside GHM**;
- avoids embedding durable privileges in a client-readable JWT;
- enables immediate server-side revoke/rotate without waiting for access JWT expiry;
- fits hybrid Supabase coexistence (GHM session is authoritative for GHM APIs).

No repository evidence requires a JWT refresh token. Preference for opaque refresh is therefore **architectural recommendation**, not a Founder selection.

```text
Opaque refresh credential = RECOMMENDED / FOUNDER UNSELECTED
```

---

## 6. Refresh / session duration — decision slice

### 6.1 Selected model (Founder)

```text
FOUNDER DECISION:
Refresh/session duration model =
  sliding inactivity window + absolute maximum lifetime
  (SELECTED)
```

Meaning (concepts kept separate):

| Concept | Meaning |
|---|---|
| **Access-token lifetime** | Stateless JWT `exp` — **15 minutes** (SELECTED); not a session TTL |
| **Refresh credential** | Server-controlled, rotated credential that mints new access tokens while the **session** is valid |
| **Inactivity timeout** | Session becomes unusable if no successful refresh/authenticated activity within this window (sliding) |
| **Absolute session maximum** | Hard ceiling from session start; even continuous activity cannot extend past this |

A session remains usable only while **both** hold:

```text
now < last_activity + inactivity_window
AND
now < session_start + absolute_maximum
```

Logout, password recovery (all sessions), password change (other sessions), and account revoke remain authoritative and cut refresh lineages immediately. Access JWTs still expire naturally at 15 minutes.

Do **not** invent a third fixed “refresh TTL” that replaces this model. Do **not** invent device/session-management UI beyond this contract.

### 6.2 Product context

| Product | Session UX expectation |
|---|---|
| **Zaid Connect** (web) | Operators expect multi-day continuity without weekly password prompts; still private ZAID backend |
| **QuoteFlow** (mobile-capable) | Stronger “stay signed in” expectation across days/weeks; backgrounding must not force constant reauth if refresh works |
| **Both** | No GHM refresh sessions in production product code yet; this is **target** architecture only |

### 6.3 Inactivity window candidates

| Inactivity | Security exposure | Web/mobile UX | Forced reauth frequency | vs refresh rotation | Connect fit | QuoteFlow fit | Ops simplicity |
|---|---|---|---|---|---|---|---|
| **7 days** | Idle stolen refresh dies fastest | Frequent reauth after a quiet week | Highest for intermittent users | Rotation still every access refresh (~15m cadence when active); idle kill is aggressive | OK for high-security desks; noisy for operators | Weak — mobile users leave apps idle longer | Simple numerically; more support reauth load |
| **14 days** | Strong idle bound | Occasional reauth after two quiet weeks | High-moderate | Same | Good for web | Better than 7d; still tight for travel/idle | Simple |
| **30 days** | Modest idle window; still bounded | Comfortable “stay signed in” for private products | Moderate | Same | Strong | Strong | Simple |
| **60 days** | Larger idle stolen-refresh window | Fewest idle reauths | Lowest idle-driven reauth | Same | Usable | Strong continuity | Simple; weaker idle containment |

### 6.4 Absolute maximum candidates

Absolute must be interpreted **relative to** the inactivity window: for continuously active users, absolute is the reauth ceiling. Prefer **absolute ≥ inactivity** so the sliding window remains meaningful for intermittent use (otherwise absolute alone always wins for active users from day 0, and long inactivity values are moot).

| Absolute max | Security exposure | UX / forced reauth | vs rotation | Connect | QuoteFlow | Ops |
|---|---|---|---|---|---|---|
| **30 days** | Tight lineage ceiling | Monthly reauth even if daily use | Rotation continues until cap | Acceptable; more login friction | Noticeable mobile friction | Simple; may pair poorly with inactivity ≥30d |
| **60 days** | Moderate ceiling | ~bi-monthly reauth for power users | Same | Good | Better than 30d | Simple |
| **90 days** | Common private-app ceiling | Quarterly reauth for continuous use | Same | Strong | Strong | Simple |
| **180 days** | Longest lineage among candidates | Rare forced reauth | Same | Easy UX | Easy UX | Simple; weaker long-lived compromise bound |

### 6.5 Founder duration decisions

Candidate evaluation history remains in §§6.3–6.4.

```text
FOUNDER DECISION:
Inactivity window duration = 30 days (SELECTED)
Absolute maximum session lifetime = 90 days (SELECTED)
```

Prior non-binding technical recommendation matched these values. Rotation/replay **policy** remains a separate slice (§7–§8).

---

## 7. Refresh rotation / replay — decision slice

### 7.1 Questions evaluated (now Founder-selected — see §7.6)

| # | Question | Notes |
|---|---|---|
| 1 | Rotate refresh credentials on **every successful refresh**? | **SELECTED: yes** |
| 2 | Are refresh credentials **single-use** after rotation? | **SELECTED: yes** |
| 3 | What happens when an **already-used or revoked** refresh credential is presented again? | **SELECTED: revoke session family** |
| 4 | Scope of containment on reuse | Reject-only vs **session family** (selected) vs **account-wide** (reserved) |

**Separations (mandatory):**

| Concept | Not the same as |
|---|---|
| **Session-family revocation** | Killing one refresh rotation lineage / session |
| **Account-wide session revocation** | All refresh sessions for that `account_identity` (e.g. password recovery) |
| **Business membership revocation** | Authorization / membership SQL — not auth session TTL |
| **Authorization failure (403)** | Authenticated but not permitted — not refresh replay |

Do **not** invent multi-device session-management UI. Do **not** treat membership revoke as refresh replay policy.

### 7.2 Rotate on every successful refresh?

| Approach | Security | Mobile/web reliability | Concurrent refresh | Ops |
|---|---|---|---|---|
| **Rotate every successful refresh** | Limits lifetime of any single refresh secret; enables reuse detection | Normal for SPA/mobile with one refresh coordinator | Requires idempotent/client serialization or graceful race handling | Clear invariant; standard pattern |
| Rotate on a schedule / less often | Longer-lived refresh secret if stolen mid-window | Slightly fewer writes | Fewer race windows | Weaker theft signal; more complex policy |
| Never rotate (revoke-only) | Stolen refresh valid until idle/absolute/revoke | Simplest client | No rotation races | Weakest for theft detection |

### 7.3 Single-use after rotation?

| Approach | Security | Reliability | Concurrent refresh | Ops |
|---|---|---|---|---|
| **Single-use** (old credential invalid after success) | Required for meaningful reuse detection | Good if client stores only latest credential | Double-submit of same old credential looks like reuse — needs careful race policy | Simple state machine |
| Multi-use until expiry | No reuse signal | More tolerant of duplicate requests | Safer against double-refresh bugs | Weaker security; blurs revoke semantics |

### 7.4 Replay response comparison

When a presented refresh credential is **already used** (post-rotation) or **already revoked**:

#### A. Reject only the presented credential

| Aspect | Assessment |
|---|---|
| Security | Weak if an attacker already completed rotation: victim may still hold a dead credential while attacker holds the live child |
| Reliability | Least disruptive; duplicate retry may just 401 |
| Concurrent refresh | Two parallel refreshes: one wins; loser “rejects” without killing the winner — can leave attacker lineage alive after theft+race |
| Session recovery | User may continue if they already have the new credential |
| Ops simplicity | Highest simplicity; lowest theft containment |

#### B. Revoke the affected **session family** (rotation lineage)

| Aspect | Assessment |
|---|---|
| Security | Treats reuse as likely theft; kills attacker **and** that device/session lineage |
| Reliability | User on that session must re-authenticate; other account sessions unaffected |
| Concurrent refresh | Parallel double-refresh can false-positive revoke the family — mitigate with short grace, request idempotency, or single-flight refresh on clients |
| Session recovery | Re-login for that product session only — **not** account-wide |
| Ops simplicity | Moderate; clear security default for private GHM |

#### C. Revoke **every** session for the account

| Aspect | Assessment |
|---|---|
| Security | Maximum containment |
| Reliability | All Connect/QuoteFlow sessions for that identity die — high UX cost |
| Concurrent refresh | Same false-positive risk, much larger blast radius |
| Session recovery | Full reauth everywhere |
| Ops simplicity | Simple rule, harsh; already used for **password recovery** / account compromise — not ideal for every replay glitch |

### 7.5 Implications summary

| Concern | Prefer |
|---|---|
| Security (stolen refresh) | Every-success rotation + single-use + session-family revoke on reuse |
| Mobile/web reliability | Client single-flight refresh; avoid treating benign retries as account-wide revoke |
| Concurrent refresh | Session-family revoke needs race hygiene; reject-only is safer for races but weaker on theft |
| Session recovery | Family revoke localizes pain; account-wide reserved for recovery/compromise |
| Operational simplicity | One invariant (rotate+single-use+family revoke) without device-admin UI |

### 7.6 Technical recommendation — not a Founder decision

> **Technical recommendation — not a Founder decision.**

1. **Rotate on every successful refresh.**
2. Each refresh credential is **single-use** after successful rotation.
3. Reuse/replay of an already-used or revoked refresh credential **revokes the affected session family** (Option B).
4. **Account-wide** revocation remains reserved for Founder-selected events (password recovery, account compromise/disablement) — not the default replay response.
5. Do not invent multi-device administration UI for this gate.

```text
old refresh (presented)
        ↓
   validate + rotate
        ↓
old invalidated (single-use)
        ↓
new refresh + 15m access JWT

If old/revoked credential presented again:
        ↓
   revoke session family (recommended)
        ↓
   that session must re-authenticate
```

```text
FOUNDER DECISION:
Rotate on every successful refresh = SELECTED
Refresh credential single-use = SELECTED
Reuse/replay response = SELECTED — revoke affected session family
  (not account-wide by default; account-wide remains recovery/compromise)
```

(Prior technical recommendation matched this selection.)

---

## 8. Reuse / replay detection (detail)

Options A/B/C are compared in §7.4. This section records detection expectations without selecting Founder policy.

### Detection inputs (implementation later)

- Credential presented matches a **superseded** (already rotated) credential in a lineage; or
- Credential is marked **revoked** / session inactive.

### Recommendation cross-ref

See §7.6. Founder-selected replay response is **session-family revocation** (Option B).

```text
FOUNDER DECISION:
Refresh reuse/replay response = SELECTED — revoke affected session family
```

---

## 9. Session model

Conceptual model:

```text
GHM account identity
        ↓
authentication session
        ↓
refresh credential (rotated lineage)
        ↓
short-lived access tokens
```

### Conceptual session state

A session should be able to represent:

- active
- revoked
- expired
- rotated credential lineage
- created timestamp
- last-used timestamp
- expiration timestamp
- revocation timestamp / reason

No production auth-session table name exists in the repository. **Do not invent a frozen table name here.** Persistence invariants are in §14.

---

## 10. Logout contract

Target behavior:

1. Identify the authenticated session (via refresh credential / session binding presented to GHM auth API).
2. Revoke that session’s active refresh credential / rotation lineage.
3. Prevent future refresh for that session.
4. Do **not** require server-side invalidation of every already-issued short-lived access JWT.
5. Access JWTs expire naturally via `exp`.

### Safety

- Repeated logout: **idempotent** success (already revoked remains safe).
- Logout after prior revocation: **idempotent** success (no error that enables session probing beyond generic auth failure policy).

Exact HTTP paths remain an Authentication API follow-on decision (Contract Gate).

---

## 11. Account-level revocation and credential-driven session policy

| Kind | Effect |
|---|---|
| **Session revocation** | One authentication session stops refreshing |
| **Account revocation** | All authentication sessions for an account stop refreshing |

Account-level revocation is required for events such as:

- credential compromise
- account disablement
- security incident response
- explicit lifecycle termination

### Founder-selected credential-driven policies (`2026-09-21`)

| Event | Required session behavior |
|---|---|
| Password **change** (authenticated) | Revoke all **other** refresh sessions; keep **current** session; issue **fresh** refresh for current session |
| Password **recovery** | Revoke **all** existing refresh sessions; require fresh authentication |

These policies are authoritative relative to earlier recommendations that suggested always revoking every session on credential change.

Detailed admin workflows are **out of scope** for this gate (and Founder-deferred impersonation / complex session admin / mobile OTP / passkeys / biometrics remain deferred).

---

## 12. Token / session boundary

| Artifact | Role |
|---|---|
| **Access JWT** | Short-lived; (target) stateless verify; identity claims (`sub`/…); **not** a durable session record |
| **Refresh credential** | Durable server-controlled session credential; revocable; rotated; **not** an authorization role |
| **Session** | Server-side lifecycle state connecting `account_identity` to refresh lineage |

This distinction must remain clear in all follow-on contracts and implementation.

---

## 13. Security invariants

1. Refresh credentials are never logged.
2. Refresh credentials are never stored in plaintext if a secure hash/reference approach is feasible.
3. Access tokens expire.
4. Refresh credentials can be revoked.
5. Successful refresh rotates the credential.
6. A used refresh credential cannot silently become valid again.
7. Logout prevents future refresh for that session.
8. Account revocation prevents future refresh across affected sessions.
9. Products cannot revoke or mint GHM sessions outside authorized GHM APIs.
10. Refresh credentials never become authorization roles.
11. Expired/revoked credentials cannot create a valid new access token.
12. Session state does not grant business membership.
13. Direct product database access remains prohibited.
14. Authentication failures → 401; authorization failures → 403 (per auth error contract).
15. Supabase JWTs are never accepted as GHM session credentials.

---

## 14. Storage contract

**No migrations in this gate.**

A future session/refresh persistence model must be able to represent:

- session identity
- account identity (`account_identity.id`)
- refresh credential reference / hash
- credential rotation lineage
- `created_at`
- `last_used_at`
- `expires_at`
- `revoked_at`
- revocation reason
- active / replaced state where required
- sufficient information for replay detection

Exact schema / table names for credential/session/refresh/recovery/mapping are proposed in [GHM_AUTHENTICATION_SCHEMA_MIGRATION_CONTRACT.md](./GHM_AUTHENTICATION_SCHEMA_MIGRATION_CONTRACT.md). That contract does **not** authorize DDL.

Storage must remain separate from `ghm.account_identity` profile fields. Least-privilege / security-definer patterns used elsewhere in GHM should apply when a persistence model is later authorized.

---

## 15. Open decisions

| Decision | Status |
|---|---|
| short-lived access JWT | **SELECTED** |
| access-token lifetime | **SELECTED: 15 minutes** |
| server-controlled refresh | **SELECTED** |
| opaque refresh credential | **RECOMMENDED / FOUNDER UNSELECTED** |
| refresh credentials rotated (architecture intent) | **SELECTED** (Issuance ADR — high level) |
| rotate on every successful refresh | **SELECTED** |
| refresh credential single-use | **SELECTED** |
| refresh/session duration model | **SELECTED: sliding inactivity + absolute maximum** |
| inactivity window duration | **SELECTED: 30 days** |
| absolute session maximum duration | **SELECTED: 90 days** |
| fixed refresh-only TTL (replacing sliding+absolute) | **NOT USED** (model SELECTED above) |
| reuse/replay response | **SELECTED: revoke affected session family** (account-wide reserved for recovery/compromise) |
| session persistence schema | **UNSELECTED** |
| revocation representation | **UNSELECTED** |
| password-change session policy | **SELECTED** (`2026-09-21`): revoke other refresh sessions; keep current; issue fresh refresh |
| password-recovery session policy | **SELECTED** (`2026-09-21`): revoke all refresh sessions; re-authenticate |

Do not resolve remaining UNSELECTED items silently.

---

## 16. Recommendation (technical co-founder)

Recommendations favoring a private ZAID/GHM backend (opaque refresh / persistence — still not Founder-selected unless marked SELECTED elsewhere):

1. Access-token lifetime is **Founder-selected at 15 minutes**.
2. Inactivity **30 days** and absolute **90 days** are **Founder-selected**.
3. Prefer **opaque**, server-controlled refresh credentials (recommendation only until Founder selects).
4. Rotate on every successful refresh; single-use; session-family replay revoke are **Founder-selected** (§7.6).
5. Rely on access JWT natural expiry after logout; revoke refresh immediately.

Password-change / recovery policies, sliding+absolute model, 30d/90d durations, 15-minute access TTL, and refresh rotation/replay policy are **Founder-selected**.

```text
TTL / opaque-refresh / replay recommendations remain recommendations only until Founder selects them.
```

---

## 17. Founder decision checkpoint

```text
AUTHENTICATION GATE 2B:
SESSION / REFRESH CONTRACT — PARTIAL FOUNDER DECISIONS RECORDED

FOUNDER-SELECTED:

- Access-token lifetime = 15 minutes
- Refresh/session duration model = sliding inactivity window + absolute maximum lifetime
- Inactivity timeout = 30 days
- Absolute session maximum = 90 days
- Rotate refresh on every successful refresh
- Refresh credentials single-use
- Replay of used refresh credential revokes affected session family
- Password change: revoke all other refresh sessions; preserve current session; issue fresh refresh
- Password recovery: revoke all existing refresh sessions; user must authenticate again

STILL REQUIRED (UNSELECTED):

1. Opaque refresh credential:
   UNSELECTED

2. Exact session persistence model:
   UNSELECTED

3. Exact revocation representation:
   UNSELECTED

IMPLEMENTATION AUTHORIZATION:
NOT GRANTED.
```

---

## 18. Final gate

```text
AUTHENTICATION GATE 2B RECONCILED WITH CREDENTIAL SESSION POLICIES.
CURRENT IMPLEMENTATION UNCHANGED (NO REFRESH / LOGOUT / SESSION STORE).
DURATIONS + REFRESH ROTATION/REPLAY SELECTED; OPAQUE/PERSISTENCE REMAIN PENDING FOUNDER DECISION.
NO KEYS / CREDENTIALS / TABLES / ENDPOINTS CREATED.
IMPLEMENTATION NOT AUTHORIZED.
```
