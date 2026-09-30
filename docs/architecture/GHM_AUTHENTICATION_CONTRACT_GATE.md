# GHM Authentication Contract Gate

**Canonical owner:** GHM platform governance
**Status:** AUTHENTICATION CONTRACT GATE 1 — **DOCUMENTATION-ONLY**
**Authority:** Local repository `C:\GHM`
**Baseline:** branch `construction/saved-business-resource`, HEAD `239ef5d5065826ddbaae03a2b05c175bee9bce1d`
**Depends on:**
- [GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md](./GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md) (Founder decisions 1–12 recorded `2026-09-21`)
- [GHM_AUTHENTICATION_PERSISTENCE_CONTRACT.md](./GHM_AUTHENTICATION_PERSISTENCE_CONTRACT.md) (conceptual durable persistence — Gate 2D)
- [GHM_AUTHENTICATION_API_CONTRACT.md](./GHM_AUTHENTICATION_API_CONTRACT.md) (logical Auth API — Gate 2E)
- [GHM_AUTHENTICATION_IDENTITY_AUTHORIZATION_CONTRACT.md](./GHM_AUTHENTICATION_IDENTITY_AUTHORIZATION_CONTRACT.md) (identity ↔ authz provisioning — Gate 2F)
- [PRODUCT_INTEGRATION_BOUNDARY_CONTRACT.md](./PRODUCT_INTEGRATION_BOUNDARY_CONTRACT.md)
- [GHM_APPLICATION_BACKEND_PLATFORM_CHARTER.md](./GHM_APPLICATION_BACKEND_PLATFORM_CHARTER.md)

```text
IMPLEMENTATION AUTHORIZATION: NOT GRANTED
AUTHENTICATION CONTRACT GATE 1: DOCUMENTATION-ONLY
```

This document defines **implementation contracts** for the Founder-selected authentication architecture. It does **not** authorize code, migrations, keys, endpoints, credential stores, or JWT verification changes.

---

## 1. Purpose

Define the governed implementation contract for GHM-owned authentication issuance and verification, consistent with Founder decisions 1–12 in `GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md`.

This gate exists so implementation cannot begin from ambiguous architecture. It:

- freezes **current-state evidence** separately from **target contracts**;
- defines identity, token, session, API, bootstrap, mapping, and authorization boundaries;
- lists **open decisions** that remain unresolved;
- states explicitly that **implementation is not authorized**.

Live-product priority (Zaid Connect, QuoteFlow) depends on this contract before any trusted product → GHM authenticated HTTP path can be built. Campaign / Brief / KBM remain parked and are out of scope.

---

## 2. Current-State Evidence

Evidence inspected (read-only) at HEAD `239ef5d`:

| Area | Path |
|---|---|
| JWT verification | `src/auth/request-context.ts` |
| HTTP auth middleware | `src/auth/http.ts` |
| Authorization helpers / `AuthContext` | `src/auth/authorization.ts` |
| Config | `src/config.ts` (`JWT_SECRET`, `INVITE_CODE`) |
| Account / membership schema | `database/migrations/20260909150000_create_business_identity.sql` (later moved to `ghm` schema) |
| Resource HTTP | `src/http/app.ts`, `enquiry-router.ts`, `campaign-router.ts` |
| JWT signing | tests only (`jwt.sign` with `config.jwtSecret`) |
| Founder ADR | `docs/architecture/GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md` |

### 2.1 Current HS / `JWT_SECRET` verifier

- `authenticateRequest` requires `Authorization: Bearer <token>`.
- Verifies with `jwt.verify(token, config.jwtSecret)` — **HS shared-secret only**.
- Does **not** validate `iss`, `aud`, or an explicit algorithm allow-list beyond library defaults for the secret path.
- On failure, `requireAuth` returns HTTP `401` with `{ error: 'unauthorized' }`.

### 2.2 Current `userId` + `role` claims

- Payload must include:
  - `userId`: positive safe-integer `number`
  - `role`: `'admin' | 'customer' | 'business'`
- Claim name is **`userId`**, not `sub`.
- **`sub` is ignored** (not read).
- Returns frozen `AuthContext { userId, role }`.

### 2.3 Current lack of GHM-owned issuance

- No product login / signup / refresh / logout routes under `src/http/`.
- No `jwt.sign` in application modules; signing appears only in tests.
- No credential verification path in `src/` (`bcrypt` listed in dependencies but not imported under `src/`).
- `INVITE_CODE` is required in config but unused for product auth issuance in `src/`.

### 2.4 Current lack of external identity mapping

- `ghm.account_identity` has **no** external provider/subject columns.
- No provider-neutral `(provider, subject) → account_identity.id` relation exists in migrations or `src/`.
- Supabase UUID identities (Connect / QuoteFlow) have **no** GHM mapping.

### 2.5 Current lack of refresh / revocation

- No refresh credential store, rotation, or revocation service in `src/auth/`.
- No logout/session invalidation beyond client discarding a Bearer token (and tests minting new HS tokens).

### 2.6 Current authentication endpoints

| Kind | Present? |
|---|---|
| Authentication / login API | **Absent** |
| Token refresh API | **Absent** |
| Logout / revocation API | **Absent** |
| Protected Resource API (`requireAuth`) | **Present** (e.g. `/api/v1/profile`, businesses, projects, enquiries, campaigns) |
| Public Resource API (no Bearer) | **Present** for selected `readPublic` routes (e.g. public projects) |

No repository convention establishes `/api/v1/auth/*` (or equivalent) paths today. Resource API uses `/api/v1/<resource>` naming. **Authentication endpoint paths are therefore a follow-on implementation decision** (§12).

### 2.7 Current `account_identity` structure

```text
ghm.account_identity
  id            bigint GENERATED BY DEFAULT AS IDENTITY PK
  full_name     text
  phone         text
  avatar_ref    text
  role          text NOT NULL  -- CHECK IN ('admin','customer','business')
  created_at    timestamptz
  updated_at    timestamptz
```

- Canonical internal identity key: **`id` (bigint)**.
- No email column on `account_identity` in this founding migration.
- Coarse `role` column exists on the account row; this is **not** business membership.

### 2.8 Current membership model

```text
ghm.business_membership
  business_id, account_id (bigint FKs)
  membership_role IN ('owner','administrator','member')
  membership_status IN ('active','inactive','revoked')
  UNIQUE (business_id, account_id)
```

- Fine-grained business access is membership-governed in services/SQL.
- Coarse `GhmRole` ACL (`canAccessResource`) gates resource registration; admin/customer/business resource lists are currently identical.
- Platform `admin` does not by itself invent business management without membership (resource contracts).

### 2.9 Explicit non-claims

Do **not** read this section as implying that asymmetric signing, GHM issuance, mapping, refresh, or auth endpoints already exist. They do **not**.

---

## 3. Target Authentication Contract

Target behavior under Founder-selected architecture. **Not implemented.**

### 3.1 Canonical GHM identity

- Canonical internal identity: `ghm.account_identity.id` (bigint).
- Once established, `AuthContext.userId` remains authoritative for that id (invariant).
- Token `sub` represents the **stable GHM identity reference** corresponding to that canonical account (exact string encoding of bigint is an open implementation detail; see §12).

### 3.2 Credential separation

- GHM owns authentication and credential lifecycle.
- Credentials (password hashes, refresh credentials, signing keys, etc.) **must remain separate** from `ghm.account_identity` row content.
- Credential store design is a follow-on contract; not invented here.

### 3.3 Login / authentication boundary

- Products authenticate through the **GHM authentication API**.
- Successful authentication yields **GHM-issued bearer access credentials** (and refresh credentials per §8).
- Authentication establishes/resolves identity only.
- Authentication **does not** grant business membership or admin privileges.

### 3.4 GHM-issued bearer access credential

- Short-lived access token (JWT).
- Presented to GHM Resource API as `Authorization: Bearer …`.
- Verified by GHM using **trusted public key material** (asymmetric model).
- Private signing key remains inside the GHM issuer boundary.
- Key rotation must be supported.

### 3.5 Required access-token claims

| Claim | Requirement |
|---|---|
| `sub` | Stable GHM identity reference (canonical account) |
| `iss` | GHM issuer identifier; must be explicitly validated |
| `aud` | Intended audience; must be explicitly validated |
| `iat` | Issued-at |
| `exp` | Expiration; mandatory; must be explicitly validated |

### 3.6 Algorithm validation and key rotation

- Verification must explicitly validate **algorithm** (allow-list).
- **Specific signing algorithm is NOT Founder-selected** (RS256 / ES256 / EdDSA / other remain open — §12).
- Key rotation supported without breaking verification trust distribution.

### 3.7 Authentication vs authorization separation

| Concern | Question | Owner |
|---|---|---|
| Authentication | Who is this? | GHM issuer + verification |
| Authorization | What may this identity do? | GHM authorization (membership, ownership, resource ACL, explicit admin grants) |

- Membership / privileged roles are **resolved by GHM**, not trusted as JWT source of truth.
- Current JWT `role` claim must not remain the long-term authorization source of truth under the target contract.

### 3.8 Refresh, revocation, logout

- GHM owns refresh, revocation, and logout (§8).
- Access tokens expire naturally by `exp`.
- Logout revokes the refresh session; existing access tokens expire by lifetime.

---

## 4. Identity Mapping Contract

```text
(provider, subject)
        ↓
GHM external identity mapping
        ↓
ghm.account_identity.id   (canonical)
```

### 4.1 Required invariants

- Mapping is **provider-neutral** (not Supabase-specific schema semantics).
- `ghm.account_identity.id` is the **canonical** internal identity.
- Each `(provider, subject)` maps to **at most one** `account_identity.id`.
- Uniqueness: no ambiguous multi-account resolution for the same `(provider, subject)`.
- Mapping **does not grant authorization** (no membership, no admin).
- Migration must **preserve identity continuity** for existing product users.
- During coexistence, **Supabase UUIDs are external subjects**, not canonical GHM identities.
- Token `sub` refers to the **GHM** canonical identity (not the external UUID), once GHM credentials are issued.

### 4.2 Relation naming

No external-identity mapping table exists in the repository today.

**Do not invent a frozen table name in this gate.**
Required relation invariants (when later authorized):

- columns sufficient to store `provider`, `subject`, and `account_identity_id`;
- uniqueness on `(provider, subject)`;
- FK to `ghm.account_identity(id)` with governed delete behavior (exact ON DELETE policy is an open design decision — §12);
- least-privilege runtime access consistent with GHM security-definer patterns;
- no product-writable path that invents mappings without GHM authority.

Exact schema/name is a follow-on implementation decision (§12).

---

## 5. Account Bootstrap Contract

Controlled **just-in-time (JIT)** bootstrap for authenticated identities:

| Rule | Requirement |
|---|---|
| Minimum creation | May create only the minimum `account_identity` row + external mapping needed for authentication |
| Mapping reuse | If `(provider, subject)` already maps, reuse that canonical identity — do not create duplicates |
| No automatic membership | Must **not** create `business_membership` rows |
| No automatic admin | Must **not** grant platform admin or elevated privileges |
| No privilege escalation | Authentication alone must not escalate privileges |
| Lifecycle ownership | GHM controls account lifecycle (disable/revoke semantics via follow-on contracts) |
| Profile fields | Optional profile fields (`full_name`, `phone`, etc.) are not required for auth bootstrap unless a later contract says otherwise |

Connect’s `handle_new_auth_user` / QuoteFlow `auth.uid()` provisioning models are **product evidence**, not GHM bootstrap implementation.

---

## 6. Authentication API Contract

Conceptual operations. **Exact HTTP paths are NOT established** in the repository and are marked **OPEN** (§12). Resource API convention is `/api/v1/<resource>`; that does **not** by itself freeze auth paths.

Logical Auth API semantics (login, refresh, logout, password change/recovery, bootstrap boundary, verification, errors): [GHM_AUTHENTICATION_API_CONTRACT.md](./GHM_AUTHENTICATION_API_CONTRACT.md).

### 6.1 Authentication / login

| Aspect | Contract |
|---|---|
| Caller | Unauthenticated product client (or trusted migration boundary client) |
| Auth state in | Unauthenticated (or migration-boundary-authenticated — never a raw Supabase JWT accepted by GHM Resource API) |
| Required inputs | Email + password (Founder-selected primary identifier and first credential; see Credential Contract); product/audience context as required by claims contract |
| Result | Resolved/created canonical `account_identity` + mapping as needed; GHM access token + refresh credential issued |
| Security | Credential verification inside GHM issuer boundary; no AuthContext manufacture by product; anti-enumeration (§11) |
| Errors | Authentication failure → **401** with stable machine-readable code; non-sensitive message |

### 6.2 Access-token issuance

| Aspect | Contract |
|---|---|
| Caller | GHM issuer (as part of login/refresh success) |
| Result | Short-lived asymmetric JWT with `sub`, `iss`, `aud`, `iat`, `exp` |
| Security | Signed with issuer private key; private key never leaves issuer boundary |
| Errors | Issuance failure must not leak credential validity beyond generic auth failure semantics |

### 6.3 Refresh

| Aspect | Contract |
|---|---|
| Caller | Product holding a valid refresh credential |
| Auth state in | Refresh credential presented (not an expired access token alone) |
| Required inputs | Refresh credential; audience/client binding as contracted |
| Result | New access token; refresh rotation per §8 |
| Security | Server-controlled refresh store; rotation; reuse/replay handling (§8, §12) |
| Errors | Invalid/revoked/expired refresh → **401** |

### 6.4 Logout / revocation

| Aspect | Contract |
|---|---|
| Caller | Authenticated product session (or GHM admin revocation path under separate privilege contract) |
| Required inputs | Refresh session identifier / refresh credential as contracted |
| Result | Refresh session revoked; future refresh fails; access tokens expire by `exp` |
| Security | Account/session revocation authoritative in GHM |
| Errors | Already-revoked may be idempotent success or 401 — exact semantics OPEN (§12); must not enable enumeration |

### 6.5 Authentication failure vs authorization failure

| Failure | HTTP | Meaning |
|---|---|---|
| Authentication | **401** | Identity not established / token invalid / credentials rejected |
| Authorization | **403** | Identity established but not permitted for the operation |

Resource API today often returns `{ error: 'unauthorized' }` for missing/invalid Bearer. Target auth endpoints and Resource API error-code taxonomy must converge under follow-on error contracts without silently weakening authz.

### 6.6 Path decision

```text
AUTHENTICATION ENDPOINT PATHS: OPEN — FOLLOW-ON IMPLEMENTATION DECISION
(not frozen by this document; /api/v1/auth/* is not established in-repo)
```

---

## 7. Token Contract

### 7.1 Required claims

- `sub` — canonical GHM identity reference
- `iss` — GHM issuer
- `aud` — audience
- `iat` — issued-at
- `exp` — expiration (mandatory)

### 7.2 Rules

- `sub` is the canonical GHM identity reference (maps to `account_identity.id`).
- Roles / membership are **not** trusted as JWT authorization source of truth.
- Token expiry is mandatory; verification must reject missing/expired `exp`.
- Issuer validation is mandatory.
- Audience validation is mandatory.
- Algorithm validation is mandatory (allow-list).
- Key rotation is mandatory.
- **Do not select** RS256, ES256, EdDSA, or another algorithm in this document.

### 7.3 Relationship to current tokens

Current HS tokens using `userId` + `role` and `JWT_SECRET` remain the **implemented** verifier until a later implementation gate. Target token contract supersedes that shape architecturally; it is not live.

---

## 8. Refresh / Session Contract

| Concern | Requirement |
|---|---|
| Ownership | GHM owns refresh credentials, rotation, revocation, logout |
| Access tokens | Short-lived JWTs; expire via `exp` |
| Refresh credentials | Server-controlled; revocable; rotated on use (rotation policy detail OPEN — §12) |
| Logout | Revokes refresh session |
| Existing access tokens | Expire naturally by lifetime after logout |
| Replay / reuse | Must detect or prevent refresh replay/reuse per selected policy (§12) |
| Account / session revocation | Authoritative in GHM; revoked refresh cannot mint new access tokens |
| Storage | Separate from `account_identity` profile fields; least-privilege access |

**Not implemented.** Exact lifetimes and replay policy are open (§12).

---

## 9. Authorization Contract

### Authentication

**Who is this?**
Resolve a verified GHM identity (`account_identity.id`) from a GHM-issued credential (or establish it via trusted login/bootstrap).

### Authorization

**What is this identity allowed to do?**
Resolve via GHM:

- resource registry / coarse ACL as applicable;
- `business_membership` (and related resource ownership predicates);
- explicit admin / privileged grants where separately authorized.

### Rules

- Authentication creates/resolves identity; it does **not** assign business membership.
- Authorization resolves GHM membership/privilege after identity is known.
- Products must **not** manufacture privileged `AuthContext`.
- Business access remains **membership-governed**.
- Admin access remains **explicitly authorized** (not implied by login).
- JWT must not become a bypass of membership SQL / service authorization.
- Current `AuthContext.role` / `account_identity.role` may continue to exist during transition, but under target architecture they are **not** the source of truth for business authorization.

Governed mutation / security-definer patterns already used by qualified resources remain the authorization enforcement model for resource operations; authentication issuance must not weaken them.

---

## 10. Supabase Migration / Coexistence Contract

| Rule | Requirement |
|---|---|
| Temporary coexistence | **Permitted** (Founder decision 9) |
| Direct Supabase JWT trust | **FORBIDDEN** — GHM must **never** accept Supabase JWTs as Resource API / AuthContext credentials |
| External subject | Supabase UUID becomes `(provider, subject)` external mapping subject |
| Authoritative GHM API credential | GHM-issued bearer credential only |
| Identity continuity | Migration must preserve continuity via mapping |
| Trusted boundary | A trusted migration/auth boundary establishes GHM identity and obtains a GHM credential |
| Sunset | Explicit scope, migration criteria, and decommission gate required |

This section does **not** design the full Connect or QuoteFlow product migration, adapters, or data cutover.

---

## 11. Security Invariants

1. GHM never trusts arbitrary product-supplied identity claims as AuthContext.
2. Products cannot manufacture GHM `AuthContext`.
3. `account_identity.id` is canonical internally.
4. External identity mappings are unique on `(provider, subject)`.
5. Authentication does not grant membership or admin privilege.
6. Membership / privilege is not silently a JWT role source of truth.
7. Access tokens expire (`exp` mandatory).
8. Refresh credentials are revocable and server-controlled.
9. Signing private keys never leave the issuer boundary.
10. Direct product database access remains prohibited.
11. Authentication failures return **401**.
12. Authorization failures return **403**.
13. Error responses do not enable account/credential enumeration.
14. Supabase JWTs are never accepted directly by GHM.
15. Key rotation is supported; verification uses trusted public key material.
16. Algorithm validation is mandatory (allow-list); specific algorithm remains unselected here.

---

## 12. Open Decisions

Many items below were open at Gate 1 authoring and are now recorded in follow-on contracts. Do **not** invent remaining items in implementation without Founder or explicit follow-on selection.

| # | Open decision | Current status |
|---|---|---|
| 1 | Signing algorithm | **SELECTED: ES256** |
| 2 | Key storage class / `kid` | Storage **secret-managed inside issuer** SELECTED; `kid` **required**; exact encoding/names/paths/`kid` values **UNSELECTED** |
| 3 | Access-token lifetime | **SELECTED: 15 minutes** |
| 4 | Refresh/session durations | **SELECTED:** 30d inactivity / 90d absolute |
| 5 | Refresh rotation / replay | **SELECTED:** every success; single-use; session-family revoke |
| 6 | Exact `iss` / `aud` | **SELECTED:** `ghm-auth` / `ghm-api` |
| 7 | Authentication endpoint HTTP paths | **UNSELECTED** |
| 8 | Argon2id cost parameters | KDF SELECTED; parameters **UNSELECTED** |
| 9 | Rate-limit thresholds | Required; numbers **UNSELECTED** |
| 10 | Credential / session / refresh / recovery / mapping **relation names** | Concepts in Persistence Contract; names **UNSELECTED** |
| 11 | Mapping FK delete behavior / lifecycle | **UNSELECTED** |
| 12 | Supabase identity migration mechanics | Architecture SELECTED; batch vs JIT details **UNSELECTED** |
| 13 | Exact `sub` encoding of bigint | **UNSELECTED** |
| 14 | HS → asymmetric verifier cutover plan | **UNSELECTED** |
| 15 | Evolution of `account_identity.role` / `AuthContext.role` | **SELECTED:** incremental; JWT not authoritative — Issuance ADR §16.2 **R7** |
| 16 | Logout idempotency semantics | **UNSELECTED** |
| 17 | Coexistence sunset criteria | **UNSELECTED** |
| 18 | `INVITE_CODE` under GHM issuer | **UNSELECTED** |
| 19 | Email transport provider | Channel email SELECTED; provider **UNSELECTED** |
| 20 | Recovery credential numeric TTL | **UNSELECTED** (must remain short-lived) |
| 21 | Breached-password screening | **UNSELECTED** |
| 22 | Public-key distribution mechanism | **UNSELECTED** |
| 23 | Signing-key rotation calendar | Overlap rule SELECTED; calendar **UNSELECTED** |
| 24 | Account lifecycle/status representation | **SELECTED:** `active`/`disabled` — Issuance ADR §16.2 **R1** (column name UNSELECTED) |
| 25 | System-admin representation | **SELECTED:** governed account-level state, not JWT — Issuance ADR §16.2 **R2** |
| 26 | Target AuthContext shape | **SELECTED:** identity-centric — Issuance ADR §16.2 **R3** (exact fields UNSELECTED) |
| 27 | Bootstrap invocation path | **SELECTED:** dedicated controlled Auth boundary op — Issuance ADR §16.2 **R4** |
| 28 | Business/org mapping mechanism | **SELECTED:** `(provider, external_business_id) → business.id` — Issuance ADR §16.2 **R5** |
| 29 | Auth persistence runtime GRANT model | **SELECTED:** SECURITY DEFINER / controlled EXECUTE — Issuance ADR §16.2 **R6** |

Founder decisions R1–R7 recorded: [GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md](./GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md) §16.2.

### Founder-selected credential items (see Credential Contract; `2026-09-21`)

No longer open: primary login identifier (**email**); first credential (**password**); KDF (**Argon2id**); password policy (min 8; upper/lower/number; special optional; no forced rotation; rate-limited); email recovery with short-lived single-use server-controlled credential; enumeration resistance; invalidate recovery after use; password-change session policy; password-recovery session policy.

Deferred / future (not designed now): mobile OTP; passkeys/WebAuthn; device-local biometrics. Raw biometric storage remains **PROHIBITED**.

Deferred by Founder issuance decision 12 (out of first gate): social OAuth, enterprise SSO/SAML, MFA, external federation, adaptive/risk auth, public self-service tenant provisioning, public identity federation, complex multi-device/session administration, admin impersonation.

---

## 13. Implementation Gate

```text
AUTHENTICATION CONTRACT GATE 1
DOCUMENTATION-ONLY

IMPLEMENTATION AUTHORIZATION: NOT GRANTED
```

### Required before production implementation

1. Founder confirmation / selection of remaining open decisions (§12) as needed for a first implementation slice
2. Contract review of this document against the Founder ADR
3. Implementation plan (issuer, verification cutover, credential store)
4. Migration plan (Supabase coexistence boundary + mapping)
5. Test / qualification plan (positive/negative; no silent bypass)
6. Security review

### Explicitly not authorized by this gate

- `src/` changes
- migrations / new tables
- tests / package / runtime config changes
- JWT verification behavior changes
- authentication endpoints
- credential stores / keys
- commits or pushes performed under this task

### Final status

```text
AUTHENTICATION CONTRACT GATE 1 COMPLETE (DOCUMENTATION).
FOUNDER TARGET ARCHITECTURE REMAINS BINDING.
CURRENT HS / JWT_SECRET VERIFIER REMAINS THE IMPLEMENTED STATE.
FOLLOW-ON CONTRACTS + OPEN DECISIONS REQUIRED BEFORE IMPLEMENTATION.
GHM AUTHORIZATION REMAINS AUTHORITATIVE.
DIRECT PRODUCT DATABASE ACCESS REMAINS NOT APPROVED.
SUPABASE JWTS MUST NEVER BE ACCEPTED DIRECTLY BY GHM.
CAMPAIGN / BRIEF / KBM UNCHANGED.
```
