# GHM Authentication Identity & Authorization Provisioning Contract

**Canonical owner:** GHM platform governance
**Status:** AUTHENTICATION GATE 2F — IDENTITY & AUTHORIZATION PROVISIONING CONTRACT — **DOCUMENTATION ONLY**; **implementation NOT AUTHORIZED**
**Authority:** Local repository `C:\GHM`
**Baseline:** branch `construction/saved-business-resource`, HEAD `239ef5d` (docs may advance ahead of HEAD)
**Depends on:**
- [GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md](./GHM_AUTHENTICATION_ISSUANCE_DECISION_RECORD.md)
- [GHM_AUTHENTICATION_CONTRACT_GATE.md](./GHM_AUTHENTICATION_CONTRACT_GATE.md)
- [GHM_AUTHENTICATION_PERSISTENCE_CONTRACT.md](./GHM_AUTHENTICATION_PERSISTENCE_CONTRACT.md)
- [GHM_AUTHENTICATION_API_CONTRACT.md](./GHM_AUTHENTICATION_API_CONTRACT.md)
- [AUTHORIZATION_BOUNDARY_CONTRACT.md](./AUTHORIZATION_BOUNDARY_CONTRACT.md)
- [PRODUCT_INTEGRATION_BOUNDARY_CONTRACT.md](./PRODUCT_INTEGRATION_BOUNDARY_CONTRACT.md)

```text
IMPLEMENTATION AUTHORIZATION: NOT GRANTED
DOCUMENTATION-ONLY GATE
NO SCHEMA / AUTHCONTEXT / MIDDLEWARE CHANGES
```

This document defines how an **authenticated GHM identity** relates to `ghm.account_identity`, authentication state, business membership, authorization, account lifecycle, and controlled identity bootstrap. It establishes the boundary between **authentication** and **authorization** before any schema implementation begins.

Founder-selected authentication decisions in prior gates are **canonical and not reopened**.

---

## 1. Ownership boundary

```text
Product
   ↓
GHM Auth API  (authentication)
   ↓
canonical ghm.account_identity
   ↓
GHM authorization (membership / ownership / ACL / admin)
   ↓
controlled service / SECURITY DEFINER / Resource API
```

Products must not: query GHM Postgres; construct privileged `AuthContext`; bypass membership; manufacture admin claims; manufacture GHM JWTs.

Preserve: `ghm_schema_owner` / `ghm_migrator` / `ghm_runtime`.

---

## 2. Repository evidence (read-only)

| Topic | Evidence |
|---|---|
| Canonical identity | `ghm.account_identity` — `bigint` PK `id`; `full_name`, `phone`, `avatar_ref`; coarse `role` CHECK (`admin`/`customer`/`business`); `created_at`/`updated_at` — **no account status/disabled column** |
| Membership | `ghm.business_membership` — `(business_id, account_id)` unique; `membership_role` ∈ `owner`/`administrator`/`member`; `membership_status` ∈ `active`/`inactive`/`revoked` |
| Current AuthContext | `{ userId: number, role: GhmRole }` — `src/auth/authorization.ts` |
| Current verify | HS Bearer → `userId` + `role` from JWT — `src/auth/request-context.ts` |
| Coarse resource ACL | `canAccessResource(context, resource)` — currently **all three roles** list the same resources |
| Ownership helper | `assertOwnership` — non-admin must match `userId`; **admin bypasses** ownership |
| Role helper | `assertRole(context, ...allowed)` — used e.g. review admin paths |
| Fine authz | Service/repository SQL checks `business_membership` (active + role), account ownership, admin exceptions |
| SECURITY DEFINER | Controlled mutations (e.g. Campaign) — runtime often `SELECT` + `EXECUTE`, not arbitrary DML |
| External mapping | **Absent** |
| Auth session store | **Absent** |

```text
CURRENT AuthContext { userId, role } ≠ TARGET authentication → authorization model.
JWT role must not remain long-term membership truth.
```

---

## 3. Canonical identity

```text
ghm.account_identity.id
        =
canonical GHM person/account identity
```

| Identity is | Identity is not |
|---|---|
| Durable person/account record | Password credential |
| Subject referenced by JWT `sub` | Authentication session |
| Anchor for mapping / membership | Access JWT |
| | Business membership |
| | Authorization grant |

**Principle:** one canonical GHM account per person.

Authentication lifecycle (login, logout, refresh, password reset) must **not** casually delete the canonical identity. Account deletion/disable is a separate lifecycle decision (see §4).

Do not invent additional person-identity tables unless later evidence requires them. External mapping and credentials remain separate concepts (Persistence Contract).

---

## 4. Account lifecycle

### 4.1 Current schema gap

`ghm.account_identity` has **no** dedicated lifecycle/status column today (only coarse `role` plus profile fields).

```text
FOUNDER DECISION (Issuance ADR §16.2 R1):
Account status model = SELECTED — active | disabled
Exact column name = UNSELECTED (not present in schema yet)
```

### 4.2 Conceptual states (lean)

Do **not** invent a complex state machine. Minimum useful concepts:

| Concept | Intent |
|---|---|
| **Active** | May authenticate (if credentials valid) and may be authorized per membership |
| **Disabled / suspended** | Must not authenticate successfully; existing sessions should be revoked |
| (Optional later) deactivated | Only if product evidence requires a distinct terminal state — **not invented here** |

“Pending/bootstrap” is **not** required as a persisted account state for Founder-selected JIT bootstrap: bootstrap creates a normal minimum identity that can authenticate; membership remains separate.

### 4.3 Effects (target)

| Event | Authentication | Sessions / refresh | Membership rows | Access JWTs |
|---|---|---|---|---|
| Account disabled | Login/refresh fail (**401**) | Revoke **all** refresh sessions | Rows may remain for audit/history; **authorization must deny** as if inactive for ops | Outstanding JWTs expire ≤15m; no blacklist required |
| Membership revoked | Unaffected (still authenticated) | Unaffected (unless separate session policy) | That business relationship unauthorized | JWT may still verify; **authz re-checked** from DB |
| Session revoked | Other sessions may remain | That lineage dead | Unaffected | Access JWT expires naturally |
| Password recovery | Must sign in again | **All** sessions revoked | Unaffected | Expire naturally |

**Account lifecycle ≠ membership lifecycle.**

Disabling an account **should** revoke authentication sessions (technical requirement of this contract). Exact status column / enum = **UNSELECTED**.

---

## 5. Authentication → AuthContext

```text
Bearer credential
      ↓
cryptographic verification (ES256; iss/aud/kid/exp/…)
      ↓
canonical GHM identity (sub → account_identity.id)
      ↓
account lifecycle validation (must be allowed to authenticate)
      ↓
AuthContext (authenticated principal)
```

### Target AuthContext meaning

AuthContext represents: **“this request is bound to this canonical GHM identity that is allowed to authenticate.”**

It must **not** permanently encode:

- business membership sets
- business roles as sole authz truth
- stale JWT `role` as membership

| Current | Target direction |
|---|---|
| `userId` + JWT `role` | Identity id from `sub` / authoritative identity |
| Trust JWT role for coarse ACL / admin bypass | Resolve authorization from **GHM authoritative state** after authentication |
| HS shared secret | ES256 public-key verify (API / Crypto contracts) |

Exact future `AuthContext` TypeScript shape = **implementation detail** under Founder-selected Option A (Issuance ADR §16.2 **R3**). Do not implement it in this gate.

Authorization continues:

```text
AuthContext
  ↓
authorization policy (registry / membership / ownership / admin)
  ↓
service / controlled DB operation
  ↓
resource
```

---

## 6. Authorization model

```text
Authenticated identity
        ↓
Business membership (optional)
        ↓
Business role (owner | administrator | member)
        ↓
Resource ownership / ACL / operation rules
        ↓
Permitted operation
```

An account may be:

```text
Authenticated          ✓
Canonical identity     ✓
Business membership    ✗
Business resource auth ✗
```

That is **not** an authentication failure. Protected business operations should return **403** / not-found-equivalent per existing resource contracts — not **401**.

---

## 7. Business membership

```text
account_identity
      │
      └── business_membership
             ├── business_id → ghm.business
             ├── membership_role
             └── membership_status
```

| Fact | Rule |
|---|---|
| Belonging | Membership is the account↔business relationship |
| Not authentication | Login success does not create membership |
| Statuses (repo) | `active` / `inactive` / `revoked` |
| Roles (repo) | `owner` / `administrator` / `member` |
| Identity stability | Membership changes must **not** change `account_identity.id` |
| Revoke ≠ session | Membership revocation ≠ account disable ≠ session revoke ≠ password reset |

Examples:

```text
membership revoked  ≠  account disabled
account disabled    ≠  session revoked (though disable should revoke sessions)
password recovery   ≠  membership wipe
```

---

## 8. Owner / administrator / member (existing evidence)

Do **not** invent new membership roles. Repository vocabulary:

| Role | Observed use (evidence-level) |
|---|---|
| **owner** | Business creation inserts `owner`+`active`; some flows require owner (e.g. certain enquiry paths); unique one-active-owner index |
| **administrator** | Often grouped with owner for manage operations (`IN ('owner','administrator')`) |
| **member** | Included where broader business participation is allowed (e.g. some campaign membership checks) |

### Coarse vs fine authorization (current structure)

```text
GhmRole (admin | customer | business) on AuthContext/JWT
  ↓
coarse canAccessResource / assertRole boundary

business_membership + ownership SQL/service checks
  ↓
fine-grained resource authorization
```

Today `canAccessResource` grants the **same** resource list to all three `GhmRole` values — fine control is largely in repositories/services. Target architecture keeps **membership/ownership** as authoritative for business operations; JWT must not become permanent membership truth.

Exact permission matrices per resource remain in existing resource contracts; this document does not redefine them.

---

## 9. Admin semantics

### 9.1 Current meaning (evidence)

| Aspect | Evidence |
|---|---|
| Storage | `account_identity.role` CHECK includes `'admin'`; mirrored in JWT/`AuthContext.role` |
| Trust today | Current verifier **requires** JWT `role`; admin is trusted from token |
| Enforcement | `assertOwnership` bypass for `role === 'admin'`; `assertRole(..., 'admin')` for admin-only ops (e.g. some review paths); several repositories skip account filters when `context.role === 'admin'` |
| Membership role | **Admin is not** a `business_membership.membership_role` |

**Ambiguity:** `admin` is a **coarse account/JWT role**, used as system-wide privilege bypass in code — not a business membership role. Whether every `account_identity.role = admin` person should retain JWT-trusted admin forever is **under-specified** for the target issuer world.

### 9.2 Target clarification (smallest needed)

> **Technical recommendation — not a Founder decision.**

1. Treat **system administration** as an **authoritative GHM privilege** resolved from GHM state (or an explicit admin grant store), **not** solely from a JWT claim.
2. Keep `business_membership` roles (`owner`/`administrator`/`member`) for **business** authorization only — do not conflate `administrator` membership with system `admin`.
3. Align with `AUTHORIZATION_BOUNDARY_CONTRACT.md` rule 7: admin authority must come from **governed account state**, not fixed-ID promotion or sole JWT trust.
4. Until Founder selects the exact admin representation, document the gap: current JWT/`account_identity.role` admin is **legacy/current construction**, not the long-term authz source of truth.

```text
FOUNDER DECISION (Issuance ADR §16.2 R2):
System administrator representation = SELECTED — Option A
  governed account-level system-admin state
  NOT a JWT role claim
Exact storage representation = UNSELECTED
```

---

## 10. Identity bootstrap

```text
trusted authentication/migration boundary
          ↓
external identity mapping
          ↓
existing GHM account?
     /              \
   yes               no
    │                 │
resolve            create minimum
identity           canonical identity
```

| Bootstrap may | Bootstrap must not |
|---|---|
| Create/link minimum `account_identity` | Grant `business_membership` |
| Create `(provider, subject)` mapping | Grant system admin |
| Be idempotent | Manufacture arbitrary authz claims |
| | Create business ownership automatically |
| | Bypass business provisioning rules |

One canonical GHM identity per person. Exact invocation path = **UNSELECTED** (API Contract: not public federation).

---

## 11. External identities

```text
provider = "supabase"   -- SELECTED for Supabase Auth
subject  = Supabase Auth user UUID as text
(provider, subject) → ghm.account_identity.id
```

- Uniqueness on `(provider, subject)`
- Provider vocabulary for Supabase Auth is **SELECTED** (`supabase`); do not use product-scoped provider strings
- Email is **not** the durable mapping key
- Migrate existing Supabase UUID subjects **into** mapping; they do not become JWT `sub`
- Controlled migration boundary; **never** accept Supabase JWTs as GHM credentials
- Mapping = **identity resolution**, not authorization
- **Bootstrap** mints minimum identity when mapping missing; **link** (`auth_link_external_identity`) attaches an existing account only
- Multiple subjects → one GHM account only via **explicit** governed link (no automatic cross-product merge)

Business/org ID mapping remains a **separate** governed migration (Issuance Decision 8). Supabase business/org UUIDs must **not** be assumed equal to `ghm.business.id`.

---

## 12. Revocation semantics (summary)

### Account disable

- Block authentication (login/refresh)
- Revoke **all** refresh sessions
- Access JWTs expire naturally (≤15m)
- Membership rows: retain or mark per later policy; **authorization must fail** for disabled accounts even if membership rows linger
- Exact disable field = UNSELECTED

### Membership revocation

- Authentication continues
- Other businesses’ memberships unaffected
- Affected business resources unauthorized
- Access JWT may still verify; **re-check membership** on each protected operation

### Session revocation

- Kill that refresh lineage
- Other sessions may remain
- Access JWT expires naturally
- No access-token blacklist required for normal short-lived JWT model

### Password recovery (Founder-selected)

```text
recovery complete → revoke ALL refresh sessions → sign in again
```

Membership unchanged by recovery alone.

---

## 13. Authorization source of truth

```text
JWT
  = proof of authenticated GHM identity (and crypto claims)

GHM authoritative state
  = source of truth for current authorization
    (account lifecycle, membership, ownership, ACL, admin grant)
```

Why this matters:

| Change | If authz lived only in JWT | Target |
|---|---|---|
| Membership revoked | Stale role until expiry | Immediate deny on next authorized op |
| Account disabled | Token still “valid” cryptographically | Reject authn / deny authz + sessions revoked |
| Role / ownership change | Stale until re-issue | DB/state wins |
| Business ownership change | Stale claims | Membership/ownership queries win |

Do not add unnecessary JWT claims.

---

## 14. Resource authorization boundary

Preserve:

```text
Authentication
    ↓
AuthContext
    ↓
authorization policy
    ↓
service / controlled DB operation
    ↓
resource
```

A bearer token alone must **not** bypass: business membership; ownership; resource-specific ACL; `SECURITY DEFINER` / runtime least-privilege boundaries.

Existing `AUTHORIZATION_BOUNDARY_CONTRACT.md` remains the Resource API authz foundation; this document aligns the **target authentication identity** with that foundation without implementing AuthContext changes.

---

## 15. Product migration implications

### Zaid Connect

```text
Connect user
    ↓
GHM authentication
    ↓
GHM account_identity
    ↓
(separate) GHM business mapping
    ↓
GHM membership
```

### QuoteFlow

```text
QuoteFlow user
    ↓
GHM authentication
    ↓
GHM account_identity
    ↓
(separate) GHM organization/business mapping
    ↓
GHM membership
```

Do **not** assume current Supabase UUID business/org IDs equal GHM `business.id`. Do not modify products in this gate.

---

## 16. Current vs target gap

| Layer | Current | Target |
|---|---|---|
| Login | Absent / products use Supabase | GHM Auth API email+password |
| Identity claim | JWT `userId` | `sub` = `account_identity.id` |
| AuthContext | `{ userId, role }` from JWT | Authenticated identity; authz from GHM state |
| Verify | HS `JWT_SECRET` | ES256 + iss/aud/kid/exp |
| Membership | SQL checks when implemented | Still SQL/state; never JWT-only |
| Admin | JWT/`account_identity.role` trusted | Authoritative admin representation **UNSELECTED** |
| Account disable | No status column | Lifecycle representation **UNSELECTED** |

Do not modify the current implementation in this gate.

---

## 17. Open decisions

| Item | Status |
|---|---|
| Exact account lifecycle/status column/enum | **SELECTED architecture:** `active` / `disabled` (Issuance ADR §16.2 **R1**); exact column name **UNSELECTED** |
| Exact system-admin representation | **SELECTED architecture:** governed account-level admin state, not JWT (Issuance ADR §16.2 **R2**); exact storage **UNSELECTED** |
| Exact future AuthContext shape | **SELECTED architecture:** identity-centric; authz from GHM state (Issuance ADR §16.2 **R3**); exact fields **UNSELECTED** |
| Exact authorization-policy API shape | **UNSELECTED** (existing helpers remain current) |
| Identity bootstrap invocation path | **SELECTED:** dedicated controlled Auth boundary op; identity/mapping only (Issuance ADR §16.2 **R4**); exact path **UNSELECTED** |
| Business/org migration mapping mechanism | **SELECTED:** `(provider, external_business_id) → business.id` via LINK-ONLY `ghm.auth_link_business_external_mapping` (Issuance ADR §16.2 **R5**); never creates business/membership |
| Exact GRANT matrix for auth tables | **SELECTED model:** SECURITY DEFINER / controlled EXECUTE; no broad runtime DML (Issuance ADR §16.2 **R6**); exact matrix **UNSELECTED** |
| Exact schema names for credential/session/mapping | **UNSELECTED** (Persistence Contract) |
| Evolution of `account_identity.role` (`customer`/`business`/`admin`) under target model | **SELECTED:** incremental; JWT role not authoritative (Issuance ADR §16.2 **R7**) |

> Recommendations in this document are **not** Founder decisions unless marked SELECTED elsewhere.

---

## 18. Founder decision checkpoint

```text
AUTHENTICATION GATE 2F:
IDENTITY & AUTHORIZATION PROVISIONING CONTRACT

FOUNDER ARCHITECTURE (not reopened):
- Authentication vs authorization separation
- sub = canonical account_identity.id
- Membership not granted by login/bootstrap
- JWT not membership source of truth
- Recovery / session / crypto rules per prior gates
- R1–R7 SELECTED (Issuance ADR §16.2)

IMPLEMENTATION DETAILS STILL OPEN:
- exact column/table/function names
- exact AuthContext TypeScript fields
- exact GRANT matrix rows
- exact bootstrap HTTP/internal path

IMPLEMENTATION AUTHORIZATION:
NOT GRANTED.
```

---

## 19. Final gate

```text
IDENTITY & AUTHORIZATION PROVISIONING CONTRACT DOCUMENTED.
NO src/ / MIGRATIONS / TESTS / CONFIG / SECRETS / PACKAGES CHANGED.
NO COMMIT / PUSH.
STOP — DO NOT IMPLEMENT SCHEMA OR AUTHCONTEXT.
```
