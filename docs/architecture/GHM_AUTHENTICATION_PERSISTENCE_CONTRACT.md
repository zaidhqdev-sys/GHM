# GHM Authentication Persistence Contract

> **Historical-status clarification — 2026-10-13:** This Gate 2D record describes the persistence design before Gate 3B construction. Its embedded “pending” or “not authorized” statements are historical for the foundation subsequently constructed and qualified; retain any open details only where a current living contract still identifies them. Product migration and production cutover remain separately gated.


**Canonical owner:** GHM platform governance
**Status:** AUTHENTICATION GATE 2D CONTRACT — HISTORICAL CONCEPT RECORD; the persistence foundation described here was subsequently constructed and qualified under Gate 3B. Historical Gate 3B evidence pointer: `main @ ffc4a2a` at the time this contract was reconciled; this is not a current HEAD pointer.
**Authority:** Local repository `C:\GHM`
**Baseline:** branch `construction/saved-business-resource`, HEAD `239ef5d` (docs may advance ahead of HEAD)
**Depends on:**
- [GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md](./GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md)
- [GHM_AUTHENTICATION_CONTRACT_GATE.md](./GHM_AUTHENTICATION_CONTRACT_GATE.md)
- [GHM_AUTHENTICATION_CREDENTIAL_CONTRACT.md](./GHM_AUTHENTICATION_CREDENTIAL_CONTRACT.md)
- [GHM_AUTHENTICATION_SESSION_CONTRACT.md](./GHM_AUTHENTICATION_SESSION_CONTRACT.md)
- [GHM_AUTHENTICATION_CRYPTOGRAPHIC_CONTRACT.md](./GHM_AUTHENTICATION_CRYPTOGRAPHIC_CONTRACT.md)
- [GHM_AUTHENTICATION_API_CONTRACT.md](./GHM_AUTHENTICATION_API_CONTRACT.md)
- [GHM_AUTHENTICATION_IDENTITY_AUTHORIZATION_CONTRACT.md](./GHM_AUTHENTICATION_IDENTITY_AUTHORIZATION_CONTRACT.md)
- [GHM_AUTHENTICATION_SCHEMA_MIGRATION_CONTRACT.md](./GHM_AUTHENTICATION_SCHEMA_MIGRATION_CONTRACT.md)

```text
HISTORICAL GATE 2D SNAPSHOT
AT THAT GATE: IMPLEMENTATION AUTHORIZATION NOT GRANTED
AT THAT GATE: NO MIGRATIONS / TABLES / RUNTIME GRANTS
```

### Current reconciliation

Gate 2D is a historical conceptual persistence record. The original “absent” statements in its repository-evidence sections describe the Gate 2D snapshot and must not be interpreted as the current schema state. Gate 3A constructed the authentication persistence schema and Gate 3B subsequently authorized the runtime foundation; the resulting credential, session, recovery, external-identity, and business-mapping persistence is now construction-qualified on the consolidated `main` line. Product migration and production cutover remain separately gated.

This document preserves the conceptual durable persistence model that informed the Founder-selected GHM authentication architecture. It does not independently authorize scope beyond the foundation already qualified under Gate 3B. Physical relation/column names are implemented in migrations and recorded in `GHM_AUTHENTICATION_SCHEMA_MIGRATION_CONTRACT.md`; use those migrations as current schema authority.

---

## 1. Transport / ownership boundary (unchanged)

```text
Product
  ↓
GHM Auth API
  ↓
GHM identity / session / credential boundary
  ↓
GHM-issued JWT (ES256; iss=ghm-auth; aud=ghm-api; kid; 15m)
  ↓
GHM protected Resource API
```

- Products authenticate through the **GHM Auth API** and receive GHM-issued bearer credentials.
- Products must **not** connect directly to GHM Postgres.
- Private ES256 signing material remains **secret-managed inside the GHM issuer boundary**.
- Supabase Auth may coexist temporarily during migration; GHM must **never** accept Supabase JWTs directly.

---

## 2. Repository evidence (read-only)

| Topic | Evidence |
|---|---|
| Canonical identity | `ghm.account_identity` — `bigint` identity PK; profile fields (`full_name`, `phone`, `avatar_ref`); coarse `role` check (`admin`/`customer`/`business`); `created_at` / `updated_at` timestamptz — `database/migrations/20260909150000_create_business_identity.sql` |
| Email / password | Absent on `ghm.account_identity`; credential/login email and password hash are stored in separate qualified auth tables |
| Membership | `ghm.business_membership` — `(business_id, account_id)` unique; status `active`/`inactive`/`revoked`; **authorization**, not auth session |
| External IdP mapping | **Historical Gate 2D snapshot: absent** — current qualified mapping is defined by Gate 3A/3B and the identity-bridge qualification record |
| Auth session / refresh / recovery stores | **Historical Gate 2D snapshot: absent** — current qualified persistence exists on the consolidated mainline |
| Current JWT | GHM ES256 bearer verification with secret-managed asymmetric key material loaded by `src/auth/foundation/es256-keys.ts`; no JWT signing key is stored in the database |
| Schema ownership | Tables `OWNER TO ghm_schema_owner` (later resource slices) |
| Runtime role | `ghm_runtime` — typically `SELECT` + `EXECUTE` on `SECURITY DEFINER` functions; direct `INSERT`/`UPDATE`/`DELETE` often **REVOKED** (e.g. Campaign) |
| Migrator | `ghm_migrator` / `GHM_MIGRATOR_DATABASE_URL` — migration authority, not product runtime |
| Conventions | `bigint GENERATED BY DEFAULT AS IDENTITY`; timestamptz `created_at`/`updated_at` default `now()`; CHECK enums; UNIQUE / partial unique indexes; FKs to `account_identity` |

```text
HISTORICAL GATE 2D SNAPSHOT ≠ CURRENT MAINLINE STATE.
The persistence foundation described by this contract was subsequently constructed and qualified under Gate 3A/3B.
```

---

## 3. Role boundary implemented for authentication persistence

Preserve:

```text
ghm_schema_owner  — owns relations / SECURITY DEFINER functions
ghm_migrator      — applies migrations / DDL
ghm_runtime       — least-privilege application path
```

**Current qualified role boundary (originally specified as a future implementation rule):**

1. Introducing auth persistence must **not** grant `ghm_runtime` arbitrary durable `INSERT`/`UPDATE`/`DELETE` on credential/session tables merely because tables exist.
2. Durable mutations should follow the established **controlled function / schema-owner** model (`SECURITY DEFINER`, narrow `EXECUTE` grants) where applicable — same pattern as Campaign and similar slices.
3. Runtime may receive only the minimal `SELECT` / function `EXECUTE` / sequence usage required by authorized Auth API operations.
4. Password hashes, refresh material, and recovery secrets must never appear in product-facing responses or ordinary logs.

At the historical Gate 2D checkpoint, exact per-object grant matrices remained an implementation/migration gate. The bounded authentication grants were subsequently implemented in the qualified migrations; use `GHM_AUTHENTICATION_SCHEMA_MIGRATION_CONTRACT.md` and current role-qualification evidence for the actual grants rather than treating this historical UNSELECTED note as current.

---

## 4. Concept separation (mandatory)

These are **separate concepts**, even if a later implementation colocates some fields where safe:

```text
Identity                  = ghm.account_identity (canonical person/account)
Credential                = proof of control (password / Argon2id material)
Authentication Session    = durable login/session family
Refresh Credential        = rotated single-use opaque-family secret for that session
Access JWT                = short-lived ES256 bearer (15m); not durable session truth
Authorization / Membership = business_membership / admin grants / resource ACL
External Identity Mapping = (provider, subject) → account_identity.id
Recovery Credential       = short-lived email recovery secret
```

| Concept | Authoritative for | Not authoritative for |
|---|---|---|
| Identity | Who the principal is (`sub`) | Password proof; membership |
| Credential | Login proof | Business privileges |
| Auth session | Continuity / revoke of a login lineage | Business membership |
| Refresh credential | Minting new access JWTs while session valid | Authorization claims |
| Access JWT | Short-lived API authentication | Durable session; authz source of truth |
| Membership | What the identity may do in a business | Whether login succeeded |
| External mapping | Linking IdP subjects to GHM identity | Auto business mapping |
| Recovery credential | Password reset flow | Ongoing session continuity |

**Authentication-session revocation ≠ business-membership revocation.**

---

## 5. Password credential (conceptual record)

### Purpose

Associate **one** GHM identity with its password credential **without** storing password material on `ghm.account_identity`.

### Must include (conceptually)

| Concern | Requirement |
|---|---|
| Relationship | Bound to canonical `ghm.account_identity.id` |
| Login identifier | Email address ownership for authentication (Founder-selected primary identifier) |
| Secret material | Argon2id **password hash** + parameters needed to verify (exact cost params UNSELECTED) |
| Status / lifecycle | Active / disabled / locked-or-equivalent as needed for rate-limit and admin disable (exact enum UNSELECTED) |
| Change metadata | Password-changed timestamp (and related audit fields as needed) |
| Data minimization | No plaintext password; no password in logs; no password on identity profile row |

### Must not

- Put plaintext or reversibly encrypted passwords in the database.
- Treat coarse `account_identity.role` as password or membership truth for authz.
- At the original Gate 2D stage, do not invent physical names before implementation approval. The physical names are now implemented and listed in `GHM_AUTHENTICATION_SCHEMA_MIGRATION_CONTRACT.md`; use that migration record for current schema authority.

### Login email ownership

Email is the primary login identifier. Persistence of the normalized login email may live:

- with the credential record; or
- in a dedicated login-identifier record bound 1:1 (or controlled 1:N later) to `account_identity`

The implemented login email is held by the separate credential relation, not on `ghm.account_identity`. The earlier placement question is resolved by the qualified schema migration; see `GHM_AUTHENTICATION_SCHEMA_MIGRATION_CONTRACT.md`.

```text
FOUNDER DECISION (architecture): password credential separate from account_identity = SELECTED
Physical credential relation: implemented as `ghm.account_password_credential` (see schema migration contract)
Argon2id cost parameters: use current credential implementation/configuration evidence; any operational tuning remains separately governed.
```

---

## 6. Authentication session (conceptual record)

### Purpose

Durable representation of a **login / session family** for one identity.

### Must include (conceptually)

| Concern | Requirement |
|---|---|
| Owner | `ghm.account_identity.id` |
| Creation | Session created at successful authentication (or equivalent auth API success) |
| Status | Active / revoked / expired (exact vocabulary UNSELECTED) |
| Timestamps | Created; last authenticated activity / last refresh use; absolute expiry anchor |
| Inactivity | **30-day** sliding inactivity timeout (Founder-selected) |
| Absolute maximum | **90-day** maximum from session start (Founder-selected) |
| Refresh relationship | Session owns (or is bound to) a refresh **lineage** |
| Revocation | Logout / reuse-detection / password policies can revoke the session family |

### Validity rule (conceptual)

```text
session usable iff
  status allows use
  AND now < last_activity + 30 days
  AND now < session_start + 90 days
```

### Explicit non-goals

- No session-management UI
- No device-administration product surface in this gate
- Session revoke does **not** mutate `ghm.business_membership`

```text
FOUNDER DECISION (architecture): sliding + absolute session model = SELECTED (30d / 90d)
Physical session relation: implemented as `ghm.authentication_session` (see schema migration contract)
```

---

## 7. Refresh credential / lineage (conceptual record)

### Purpose

Support Founder-selected refresh behavior:

- rotate on **every successful refresh**
- **single-use** credentials
- replay of a used credential **revokes the affected session family**
- account-wide revoke reserved for recovery / confirmed compromise

### Must include (conceptually)

| Concern | Requirement |
|---|---|
| Binding | Belongs to one authentication session / session family |
| Storage | Store a **hash or irreversible reference** of the refresh secret — **not** the raw token |
| Single-use | After successful refresh, prior credential becomes superseded / unusable |
| Lineage | Parent→child (or equivalent succession) so the family can be revoked as a unit |
| Revocation | Mark credential and/or entire family revoked |
| Replay detection | Presenting a **superseded** or **revoked** credential is detectable via lookup of its hash/reference |
| Concurrency | The qualified refresh-rotation implementation serializes the live-tip transition and enforces single-use/replay-family revocation; clients should still single-flight refresh to avoid unnecessary races |

### How replay is recognized without storing the raw credential

```text
Client presents refresh secret R
  ↓
Server hashes/derives lookup key H(R)  (or looks up by opaque id + verifies hash)
  ↓
Locate durable refresh row by H(R) / id
  ↓
If row is current+active → rotate (invalidate row; insert child; return new secret)
If row is superseded or revoked → REPLAY → revoke entire session family
If unknown → reject (401) without account enumeration side-channels where applicable
```

The durable store retains **H(R)** (and lineage metadata), never `R` in plaintext.

### Technical recommendation — not a Founder decision

> **Technical recommendation — not a Founder decision.**

The original Gate 2D recommendation favored an opaque refresh secret with an at-rest hash/reference. The qualified implementation uses opaque refresh credentials and stores hashed credential material; this is implementation evidence, not a claim that the original recommendation itself was a Founder decision.

```text
FOUNDER DECISION: rotate / single-use / session-family replay = SELECTED
Physical refresh relation: implemented as `ghm.refresh_credential`
Refresh credential type: opaque in the qualified implementation; historical recommendation status does not override implementation evidence.
```

---

## 8. Recovery credential (conceptual record)

### Purpose

Email-based password recovery (Founder-selected): short-lived, single-use, server-controlled, enumeration-resistant, invalidated after use; success **revokes all refresh sessions** for the account.

### Must include (conceptually)

| Concern | Requirement |
|---|---|
| Binding | Associated with target `account_identity` (resolved server-side; responses remain enumeration-resistant) |
| Storage | Hash/reference of recovery secret — not plaintext |
| Lifetime | Bounded password-recovery service uses a 30-minute credential; production email delivery remains separately gated |
| Single-use | Invalidate on successful use; reject replay |
| Outcome | Password reset updates password credential; **account-wide** refresh-session revocation |
| Transport | Email delivery — **provider UNSELECTED** (not invented) |

### Must not

- Reveal whether an email exists via distinct error shapes (enumeration resistance).
- Leave prior refresh sessions valid after successful recovery.
- Select an email vendor in this document.

```text
FOUNDER DECISION: email recovery architecture = SELECTED
Recovery TTL: bounded implementation uses 30 minutes; relation names are implemented in the schema migration contract; production email provider/delivery remains separately gated
```

---

## 9. External identity mapping (conceptual record)

### Purpose

Provider-neutral durable map:

```text
(provider, subject) → ghm.account_identity.id
```

### Must include (conceptually)

| Concern | Requirement |
|---|---|
| Uniqueness | At most one mapping row per `(provider, subject)` |
| Canonical identity | Maps to existing or bootstrap-created `account_identity.id` |
| Provider-neutral | `provider` is an explicit discriminator. **SELECTED** for Supabase Auth: `provider = 'supabase'`; `subject` = Auth user UUID as text. Product-scoped provider strings are not used. |
| Migration | Existing Supabase Auth UUIDs migrate **into** this mapping; they do **not** become GHM `sub` |
| Scope | Person/account mapping only — **no** automatic business/org mapping |
| Email | **Not** the durable mapping key; never silently authorizes link/bootstrap |
| Lifecycle | **Bootstrap** creates min identity when mapping missing. **Link** (`auth_link_external_identity`) attaches an existing `account_id` when mapping missing. Cross-product multi-subject → one account only via explicit link. |

### Must not

- Accept Supabase JWTs as GHM credentials.
- Assume every external business/org id maps because a person mapped.
- Collapse multiple people into one GHM account without an explicit merge/link gate.
- Auto-match or merge by email.

```text
FOUNDER DECISION: mapping architecture = SELECTED
Provider vocabulary for Supabase Auth = SELECTED ("supabase")
Exact relation = ghm.account_external_identity (IMPLEMENTED)
Bootstrap = ghm.auth_bootstrap_external_identity (IMPLEMENTED)
Link existing = ghm.auth_link_external_identity (IMPLEMENTED)
```
---

## 10. Account bootstrap (conceptual)

### Allowed outcome

Authentication of a known external identity (or first-time GHM password registration under a later implementation gate) may perform **controlled just-in-time** creation/linking of the **minimum** GHM identity record required for authentication.

### Explicit limits

| Bootstrap may | Bootstrap must not |
|---|---|
| Create minimum `account_identity` | Grant `ghm.business_membership` |
| Create/link external mapping row | Grant admin privileges |
| Attach password credential when part of GHM registration | Manufacture authorization claims in JWTs |
| | Treat success as business operator entitlement |

**Goal:** one canonical GHM account per person.

Membership and privileged roles require **separate GHM provisioning**.

```text
FOUNDER DECISION: controlled JIT bootstrap = SELECTED
Bootstrap ≠ membership / admin = SELECTED
```

---

## 11. Access JWT (non-durable relative to sessions)

Access JWTs are **not** the durable session store.

| Claim / header | Value / rule |
|---|---|
| `sub` | Canonical `ghm.account_identity.id` |
| `iss` | `ghm-auth` |
| `aud` | `ghm-api` |
| `iat` / `exp` | Issued-at; **15-minute** lifetime |
| `kid` | **Required** (Founder-selected) |
| alg | **ES256** |

Roles/membership are **not** JWT authz source of truth. Signing private key: **secret-managed inside issuer boundary**; one active signing key; prior public key trusted through access expiry + skew during rotation.

---

## 12. Error semantics (persistence-adjacent)

| HTTP | Meaning |
|---|---|
| **401** | Authentication failure (bad/missing/expired/revoked credential or session) |
| **403** | Authorization failure (authenticated but not permitted) |

Stable machine-readable codes; non-sensitive human messages; no password/credential material in logs or responses.

---

## 13. Lean scope — deferred forever for this gate

Do **not** design persistence for:

- MFA / WebAuthn / passkeys
- Social OAuth / SAML / enterprise SSO
- Device- or session-management UI
- Risk / fraud engines
- Public tenant provisioning
- Arbitrary identity federation

---

## 14. Technical recommendations vs Founder decisions

| Item | Status |
|---|---|
| Conceptual records in §§5–10 | **Required by architecture** (this contract) |
| Exact table/column names | Implemented in migrations; see `GHM_AUTHENTICATION_SCHEMA_MIGRATION_CONTRACT.md` |
| Argon2id cost parameters | Governed by current credential implementation/configuration; not reselected by this historical concept contract |
| Recovery TTL | The bounded password-recovery service issues a 30-minute credential; production email delivery remains separately gated |
| Email provider | Provider/delivery enablement remains separately gated |
| Opaque refresh credential type | Opaque refresh credential is used by the qualified implementation; this originated as a technical recommendation in this historical contract |
| Runtime grants for auth tables | Controlled SECURITY DEFINER / EXECUTE model implemented; use `GHM_AUTHENTICATION_SCHEMA_MIGRATION_CONTRACT.md` and live role qualification for exact per-object grants |
| Rate-limit thresholds | **UNSELECTED** |
| ES256 key storage class | **SELECTED:** secret-managed inside issuer boundary |
| `kid` required | **SELECTED** |
| Key encoding / `kid` / rotation | PKCS#8 PEM and environment-variable names implemented; deployment-specific active/previous `kid` values and rotation calendar remain operationally governed |

> Where recommendations appear, they are **not** Founder decisions unless marked SELECTED.

---

## 15. Historical Gate 2D decision checkpoint — reconciled after Gate 3B

```text
AUTHENTICATION GATE 2D:
DURABLE PERSISTENCE CONCEPT CONTRACT

FOUNDER ARCHITECTURE (already selected — not reopened):
- Identity / credential / session / refresh / recovery / mapping / bootstrap rules per §§4–11
- JWT ES256; iss=ghm-auth; aud=ghm-api; 15m; kid required
- Secret-managed signing key inside issuer boundary
- Refresh rotate / single-use / session-family replay
- Session 30d inactivity / 90d absolute

GATE 2D DECISION-TIME OPEN ITEMS — CURRENT STATUS:
1. Credential/session/refresh/recovery/mapping relation names: implemented in the qualified migrations.
2. Argon2id memory/time/parallelism: use current credential implementation/configuration evidence; operational tuning remains governed.
3. Recovery credential TTL: bounded password-recovery service uses 30 minutes.
4. Email transport provider: production delivery remains separately gated.
5. Auth runtime GRANT/REVOKE matrix: controlled SECURITY DEFINER / EXECUTE model implemented; exact per-object grants are governed by migrations and role qualification.
6. Key representation: PKCS#8 PEM and `GHM_JWT_ES256_*` environment names implemented; deployment-specific key values and rotation calendar remain operationally governed.
7. Opaque refresh token: used by the qualified implementation; the original recommendation is not represented as a separate Founder decision.

IMPLEMENTATION AUTHORIZATION WAS NOT GRANTED AT GATE 2D; GATE 3B LATER AUTHORIZED AND QUALIFIED THE BOUNDED FOUNDATION.
```

---

## 16. Historical Gate 2D final gate — superseded for the bounded foundation

```text
GATE 2D DOCUMENTATION-ONLY CHECKPOINT:
NO MIGRATIONS / TABLES / GRANTS / CODE / SECRETS CHANGED BY THAT HISTORICAL TASK.
``` 

The original “STOP — DO NOT IMPLEMENT” instruction applied to Gate 2D. The later Gate 3A/3B migrations and qualification established the bounded authentication persistence foundation. Products still must not connect directly to GHM Postgres, and `ghm_runtime` must not receive arbitrary DML on credential/session tables.
