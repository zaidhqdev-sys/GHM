# GHM Authentication Issuance Decision Record

**Canonical owner:** GHM platform governance
**Status:** **FOUNDER ARCHITECTURE DECISION COMPLETE** — documentation only; **implementation NOT AUTHORIZED**
**Authority:** Local repository `C:\GHM`
**Baseline:** branch `construction/saved-business-resource`, HEAD `239ef5d5065826ddbaae03a2b05c175bee9bce1d`
**Evidence sprint:** authentication/identity read-only audit across GHM @ `239ef5d`, Connect @ `abcffa73` (`C:\zaid-connect-audit`), QuoteFlow live tree (`C:\QuoteFlow`)
**Founder decisions 1–12 recorded:** `2026-09-21`
**Depends on:**
- [GHM_APPLICATION_BACKEND_PLATFORM_CHARTER.md](./GHM_APPLICATION_BACKEND_PLATFORM_CHARTER.md)
- [PRODUCT_INTEGRATION_BOUNDARY_CONTRACT.md](./PRODUCT_INTEGRATION_BOUNDARY_CONTRACT.md)
- [CONNECT_IDENTITY_BACKEND_SOURCE_AUDIT.md](./CONNECT_IDENTITY_BACKEND_SOURCE_AUDIT.md)

## Nature

This document is the **Founder authentication issuance decision record**. It freezes verified current-state evidence and records Founder architecture selections for GHM-owned authentication issuance.

It does **not**:

- authorize login/signup/refresh implementation
- authorize hosting/deployment for an issuer
- authorize identity-mapping migrations or schema changes
- modify AuthContext, JWT verification, HTTP routes, Campaign, Brief, KBM, or any runtime code
- collapse issuance, verification, and authorization into one generic “auth” concept
- claim that the selected architecture is already implemented

```text
TOKEN ISSUER (TARGET ARCHITECTURE) = GHM — SELECTED 2026-09-21
IDENTITY PROVIDER / CREDENTIAL-STORE OWNER (TARGET) = GHM — SELECTED 2026-09-21
AUTHENTICATION TRANSPORT (TARGET) = GHM authentication API → GHM-issued bearer credentials — SELECTED 2026-09-21
AUTHENTICATION ISSUANCE IMPLEMENTATION = NOT AUTHORIZED
IDENTITY MAPPING IMPLEMENTATION = NOT AUTHORIZED
JWT VERIFICATION CHANGE = NOT AUTHORIZED
FOLLOW-ON AUTHENTICATION CONTRACTS = REQUIRED BEFORE IMPLEMENTATION
```

---

## Selected architecture vs current implementation

### SELECTED ARCHITECTURE

GHM will own authentication issuance and credential lifecycle for ZAID products that consume GHM as backend.

Founder decisions 1–12 (§16) define the **target** architecture: GHM authentication API, GHM-issued bearer JWTs, asymmetric signing with trusted public-key verification, provider-neutral external-subject mapping into `ghm.account_identity.id`, controlled JIT account bootstrap, temporary Supabase Auth coexistence via a trusted migration/auth boundary (never direct Supabase JWT acceptance), and GHM-owned refresh/revocation/logout.

### CURRENT IMPLEMENTATION

GHM does **not** yet implement that issuance architecture.

As of HEAD `239ef5d`, GHM only **verifies** existing HS Bearer JWTs with `JWT_SECRET` and builds `AuthContext` from numeric `userId` + `role`. There is no product login/issuance path, no asymmetric signing, no identity-mapping table, and no refresh/revocation/logout product capability. Connect and QuoteFlow still use Supabase Auth UUID sessions in production product code.

---

## Architectural invariants (must preserve)

These remain binding under the selected target architecture and during implementation gates:

1. Once established, `AuthContext.userId` is authoritative for `ghm.account_identity.id` (bigint).
2. Products must **not** manufacture privileged `AuthContext` values.
3. Products must **not** connect directly to GHM Postgres.
4. GHM **authorization** remains authoritative over governed resource operations (membership/privileged roles are not JWT source of truth).
5. Founder architecture decisions 1–12 are **SELECTED** (§16); **implementation remains NOT AUTHORIZED** until follow-on contracts and an explicit implementation gate.
6. Existing GHM HTTP authentication middleware and JWT verification behavior remain unchanged by this documentation gate (current HS/`JWT_SECRET` implementation persists until a later implementation gate).

---

## 1. Purpose

Authentication issuance must be separated from authentication verification and authorization because they have different owners, different security risks, and different implementation gates.

| Concern | Meaning |
|---|---|
| **Authentication issuance** | login/sign-in; signup/registration where applicable; credential verification; session/token issuance; refresh/revocation if applicable; account lifecycle implications |
| **Authentication verification** | bearer token verification; JWT validation; AuthContext construction; trusted identity propagation into GHM |
| **Authorization** | business membership; ownership; role; resource operation ACL; GHM authorization authority over governed operations |

**Shared product blocker (current implementation evidence):** neither Zaid Connect nor QuoteFlow can today present a Bearer token that the **current** GHM verifier accepts as a trustworthy path into `AuthContext` for a living `ghm.account_identity.id`. The selected target architecture (§16) is the Founder-approved direction to close that blocker; it is not yet implemented.

---

## 2. Current verified state (repository evidence)

Evidence sources for this gate. This section describes **what exists today**, not the selected target architecture.

| Source | Path / revision |
|---|---|
| GHM | `C:\GHM` @ `239ef5d` |
| Connect | `C:\zaid-connect-audit` @ `abcffa73` |
| QuoteFlow | `C:\QuoteFlow` (live tree) |

### 2.1 What GHM currently does

| Behavior | Evidence |
|---|---|
| Reads `Authorization: Bearer …` | `src/auth/request-context.ts` |
| Verifies JWT with shared secret `config.jwtSecret` (`JWT_SECRET`) via `jwt.verify(token, config.jwtSecret)` | `src/auth/request-context.ts`, `src/config.ts` |
| Requires payload claims `userId` (positive safe integer `number`) and `role` (`admin` \| `customer` \| `business`) | `src/auth/request-context.ts`, `src/auth/authorization.ts` |
| Returns immutable `AuthContext { userId, role }` | `src/auth/request-context.ts` |
| HTTP middleware `requireAuth` attaches `req.authContext` or returns `{ error: 'unauthorized' }` | `src/auth/http.ts` |
| Protected Resource API routes use `requireAuth` then registry/ACL then services | `src/http/app.ts`, routers |
| Services/repositories require `AuthContext` and bind actor ids from context (not caller-chosen creators) | resource modules; `src/db/authorized-transaction.ts` |
| Coarse role→resource ACL via `canAccessResource` | `src/auth/authorization.ts`, `src/resources/registry.ts` |
| Account PK is `ghm.account_identity.id` bigint identity | `database/migrations/20260909150000_create_business_identity.sql` |
| Business membership is bigint-scoped (`ghm.business_membership`) | same migration |

### 2.2 What GHM currently does **not** do

| Capability | Evidence of absence |
|---|---|
| Product-facing login / signup / sign-out / refresh HTTP endpoints | No matching issuance routes under `src/http/` |
| Application JWT **issuance** in `src/` | No `jwt.sign` in application modules; `jwt.sign` appears only in tests |
| Refresh-token issuance or rotation | No refresh routes or refresh logic in `src/` |
| Token revocation list / logout invalidation service | Not present in `src/auth/` |
| Password / credential verification for users | No credential verify path in `src/`; `bcrypt` listed in `package.json` but **not imported** under `src/` |
| Session-cookie authentication for product identity | `express-session` listed; **not imported** under `src/` |
| Documented product issuer contract (`iss` / `aud` / algorithm policy) in runtime verification | Verification does not pass issuer/audience options to `jwt.verify` |
| Asymmetric JWT signing / public-key verification | Absent in runtime |
| Identity-provider SDK integration in GHM runtime | No OIDC/OAuth/Clerk/Auth0/Supabase Auth SDK usage under `src/` |
| External UUID / `sub` → `account_identity` mapping column or table | Absent from `ghm.account_identity` and migrations/src search |
| Account bootstrap/provisioning on first product login | Account row must already exist; no `auth.users`-style trigger path in GHM |

### 2.3 JWT signing locations (tests / qualification only)

`jwt.sign(...)` appears only in test modules (including `src/auth/request-context.test.ts`, `src/http/app.test.ts`, `src/http/enquiry-router.test.ts`, and related HTTP tests). These construct tokens using `config.jwtSecret`. They are **not** a product-facing issuance capability.

### 2.4 JWT verification parameters currently enforced

From `src/auth/request-context.ts` (verified **current implementation**):

- Bearer header required
- `jwt.verify(token, config.jwtSecret)` — HS shared-secret verification only
- Payload must include valid numeric `userId` and `role`
- Claim name is **`userId`**, not `sub`
- **`sub` is ignored** (not read)
- **`iss` / `aud` are not checked**

**Not currently enforced in verification code:**

- explicit `issuer` claim check
- explicit `audience` claim check
- explicit algorithm allow-list beyond library defaults for the secret path
- mapping from external UUID identities to GHM bigint account ids
- asymmetric public-key verification

These gaps are factual current-state observations. Target architecture requirements are recorded in §16 and remain unimplemented.

### 2.5 Runtime / package evidence

| Item | Evidence |
|---|---|
| Config requires `JWT_SECRET` (min length 32 in production) | `src/config.ts` |
| Config requires `INVITE_CODE` | `src/config.ts` — required at startup; **no product auth issuance usage found under `src/`** |
| `jsonwebtoken` imported by runtime verification | `src/auth/request-context.ts` |
| Packaging note | `@types/jsonwebtoken` in devDependencies; runtime packaging consistency remains an open ops question |

### 2.6 Live-product identity evidence (Connect + QuoteFlow)

| Product | Auth reality (current) | Evidence |
|---|---|---|
| **Zaid Connect** | Supabase Auth email/password; session UUID `session.user.id`; profile PK = `auth.users.id`; RLS/RPCs/`auth.uid()`; client `authService` + `resolveApplicationIdentity` | `C:\zaid-connect-audit` `lib_supabase.js`; `CONNECT_IDENTITY_BACKEND_SOURCE_AUDIT.md` |
| **QuoteFlow** | Supabase Auth; UUID `user.id`; session persisted via AsyncStorage-backed Supabase client; org/legal/subscription RPCs use `auth.uid()` | `C:\QuoteFlow` `AuthContext.tsx`, `supabase.ts`, org/legal migrations |
| **Both** | No GHM `{ userId, role }` JWT shape; no GHM identity mapping table/adapter | Cross-product read-only audit |
| **Both** | Product Supabase JWTs are **not** accepted by the current GHM verifier (different signing material and claims) | GHM `request-context.ts` vs Supabase session model |

Connect Edge checkout validates Bearer tokens with **Supabase** `auth.getUser()`, not GHM `JWT_SECRET` (`supabase/functions/commercial-payment-checkout`).

**Target coexistence note (architecture only):** Founder decision §16.9 selects temporary Supabase Auth coexistence during migration. That does **not** authorize accepting Supabase JWTs in GHM today, and does not change current product or GHM runtime behavior.

### 2.7 Summary of current implemented issuance state

```text
GHM authentication verification: PRESENT (GHM-shaped HS Bearer JWT only)
GHM AuthContext construction: PRESENT
GHM authorization: PRESENT (construction-qualified slices)
GHM authentication issuance (login/signup/refresh): ABSENT
Asymmetric signing / public-key verify: ABSENT
JWT signing in application code: ABSENT (tests only)
Auth HTTP issuance endpoints: ABSENT
External UUID mapping: ABSENT
Refresh / revocation / logout product capability: ABSENT
Connect / QuoteFlow current issuer: Supabase Auth (product evidence)
```

---

## 3. Authentication boundary (conceptual)

Target flow under the **selected architecture** (not yet implemented):

```text
Product → GHM authentication API
        ↓
GHM issuer (credential verify / session / token issuance)
        ↓
GHM-issued bearer JWT (asymmetric; iss/aud/iat/exp; sub = stable GHM identity)
        ↓
GHM verification (public key; validate iss/aud/alg/exp)
        ↓
AuthContext { userId → account_identity.id }
        ↓
GHM authorization (membership / resource ACL — not JWT role as source of truth)
        ↓
Authorized resource operation
```

During temporary coexistence, a trusted migration/auth boundary may establish GHM identity and obtain a GHM credential. Supabase JWTs must **never** be accepted directly by GHM.

---

## 4. GHM responsibility

GHM must remain authoritative for:

- verification of trusted authentication context (once the selected issuer contracts are implemented)
- AuthContext semantics consumed by services
- business identity
- memberships
- authorization
- resource ownership rules
- operation authorization
- transaction / security boundary
- least-privilege database access
- authentication issuance and credential lifecycle (**selected target**; not yet implemented)

GHM must **not** trust product-supplied role/ownership claims as a substitute for verification + authorization.

---

## 5. Issuer responsibility (selected target: GHM)

Under the selected architecture, the GHM issuer is responsible for:

- credential authentication
- account registration where required
- secure credential handling (credentials stored separately from `ghm.account_identity`)
- token/session issuance
- issuer identity semantics (`iss`)
- audience semantics (`aud`)
- expiration (`exp`) / issued-at (`iat`)
- refresh / revocation / logout
- account lifecycle
- appropriate security controls

Implementation of these responsibilities is **not authorized** by this document alone.

---

## 6. Historical option space (superseded for selection)

Prior to Founder selection, the ADR recorded neutral options A–D (GHM issuer, ZAID issuer service, external IdP, hybrid). Those remain historical context only.

**Founder selection (2026-09-21):** GHM is the authentication issuer (decision 1), with temporary Supabase Auth coexistence during migration (decision 9) via a trusted migration/auth boundary — not direct Supabase JWT acceptance.

---

## 7. Founder decisions 1–12 — recorded

Architecture decisions are **SELECTED** in §16 (date `2026-09-21`). Implementation remains **NOT AUTHORIZED**.

Additional open evidence questions (not architecture blockers): intended use of unused `INVITE_CODE`; packaging consistency for `jsonwebtoken`; whether unused `bcrypt` / `express-session` deps are historical placeholders.

---

## 8. Required future contracts (before implementation)

Before authentication issuance **implementation** is authorized, follow-on contracts must exist for at least:

1. issuer → GHM token/credential contract
2. claims contract (`sub` / `iss` / `aud` / `iat` / `exp`; AuthContext derivation)
3. issuer / audience / algorithm / key-material / rotation contract (algorithm choice remains an implementation-level decision unless separately selected; RS256 is **not** Founder-selected here)
4. token lifetime contract
5. AuthContext mapping contract (`sub` → `account_identity.id`)
6. provider-neutral `(provider, subject) → account_identity.id` mapping + Supabase UUID migration contract
7. account JIT bootstrap / lifecycle contract
8. error semantics for issuance vs verification failures (401/403 + stable codes)
9. refresh / revocation / logout contract
10. product login / session integration contract (GHM authentication API)
11. temporary Supabase coexistence scope, migration criteria, and sunset/decommission gate
12. separate business/organization identity mapping migration contract
13. version / compatibility policy
14. security / secret-management requirements
15. qualification tests (positive/negative; no silent bypass)

---

## 9. Local-first implication

- Products may remain local-first where their architecture already is.
- Local-first does **not** mean direct database access.
- Local-first does **not** require Vercel.
- Selected architecture: products authenticate through the **GHM authentication API** and receive GHM-issued bearer credentials.
- Temporary Supabase Auth coexistence (decision 9) does **not** make Supabase GHM’s issuer of record.
- Do **not** introduce cloud hosting solely to solve this architecture gate.

---

## 10. Provider independence

- GHM must not leak provider-specific authentication assumptions into resource contracts.
- External subjects are mapped via provider-neutral `(provider, subject)` mapping; `ghm.account_identity.id` remains canonical.
- AuthContext should represent trusted GHM identity semantics, not vendor-specific application behavior.
- Temporary Supabase coexistence is a migration path only and must sunset under an explicit decommission gate.
- A future provider replacement should be architecturally possible without rewriting GHM resource authorization semantics.

---

## 11. Security non-negotiables

- GHM must not trust product-supplied role/ownership claims as authorization source of truth.
- GHM authorization remains authoritative.
- Account identity must map deterministically to GHM `account_identity.id`.
- Once the selected verification contract is implemented, token validation must explicitly validate issuer, audience, algorithm, and expiration; private signing keys remain inside the GHM issuer boundary.
- Supabase JWTs must **never** be accepted directly by GHM.
- Secrets / private keys must not enter source control.
- Browser/client credentials must never become database credentials.
- Direct product → PostgreSQL remains forbidden.
- No silent authentication bypasses for local development or production.
- Products must not manufacture privileged AuthContext values.
- Authentication alone does not grant business/admin privileges.

This document does **not** invent a specific asymmetric algorithm (e.g. RS256) as Founder-selected.

---

## 12. Implementation gate

```text
NO AUTHENTICATION ISSUANCE IMPLEMENTATION IS AUTHORIZED BY THIS DOCUMENT.
NO IDENTITY MAPPING MIGRATION IS AUTHORIZED BY THIS DOCUMENT.
NO JWT VERIFICATION CHANGE IS AUTHORIZED BY THIS DOCUMENT.
NO PRODUCT CODE CHANGE IS AUTHORIZED BY THIS DOCUMENT.
FOLLOW-ON AUTHENTICATION CONTRACTS REQUIRED BEFORE IMPLEMENTATION.
```

Founder architecture decisions 1–12 are recorded in §16. Implementation requires a separate Founder implementation authorization after follow-on contracts.

Related gates remain separate:

- product callable Resource API transport is **HTTP/API (SELECTED)** generally
- selected **authentication** transport target is GHM authentication API → GHM-issued bearer credentials (**SELECTED**; not implemented)
- product adapters / shadow / cutover remain **FUTURE / GATED**
- Campaign / Brief / KBM remain **PARKED** relative to live-product priority and are unchanged by this gate
- business/organization identity mapping is a **separate** governed migration contract (decision 8)

---

## 13. Relationship to existing documents

| Document | Relationship |
|---|---|
| `GHM_APPLICATION_BACKEND_PLATFORM_CHARTER.md` | Platform ownership; this ADR now records Founder issuance architecture selections |
| `PRODUCT_INTEGRATION_BOUNDARY_CONTRACT.md` | Supported consumer requires trustworthy AuthContext; products must not manufacture AuthContext |
| `GHM_AUTHENTICATION_CRYPTOGRAPHIC_CONTRACT.md` | Token crypto / `iss`/`aud`/alg/TTL/`kid`/key custody |
| `GHM_AUTHENTICATION_SESSION_CONTRACT.md` | Refresh/session durations and rotation/replay |
| `GHM_AUTHENTICATION_CREDENTIAL_CONTRACT.md` | Password / Argon2id / recovery |
| `GHM_AUTHENTICATION_PERSISTENCE_CONTRACT.md` | Conceptual durable persistence for credential/session/refresh/recovery/mapping |
| `GHM_AUTHENTICATION_API_CONTRACT.md` | Logical Auth API operations, errors, verification semantics |
| `GHM_AUTHENTICATION_IDENTITY_AUTHORIZATION_CONTRACT.md` | Identity lifecycle, AuthContext vs membership/authz, admin/bootstrap/revocation |
| `GHM_AUTHENTICATION_SCHEMA_MIGRATION_CONTRACT.md` | Proposed concrete auth schema, constraints, migration order (DDL not authorized) |
| `GHM_AUTHENTICATION_IMPLEMENTATION_PARAMETER_GATE.md` | Proposed security/impl parameters awaiting Founder approval (DDL not authorized) |
| `RESOURCE_API_BOUNDARY_CONTRACT.md` | Current HTTP Resource API assumes verified AuthContext; does not define issuance implementation |
| `CONNECT_IDENTITY_BACKEND_SOURCE_AUDIT.md` | Connect UUID Supabase Auth ≠ GHM bigint AuthContext (current evidence) |
| Live-product readiness audits / gap register | Connect backend readiness; issuance was shared blocker |
| Campaign / Brief docs | Out of scope for this gate; AuthContext consumers only |

This ADR records the authentication **issuance architecture** decision. It does **not** override existing qualified resource behavior and does **not** implement issuance.

---

## 14. Disaggregated blocker map (do not conflate)

| Layer | Architecture status | Current implementation status | Blocks trustworthy product → GHM HTTP auth today? |
|---|---|---|---|
| Issuer decision | **SELECTED: GHM** | Issuance absent | Yes (implementation gap) |
| Token verification | Target: asymmetric + iss/aud/alg/exp | HS/`JWT_SECRET` + `userId`/`role` only | Yes for product Supabase JWTs |
| Identity mapping | **SELECTED** `(provider, subject)` map | Absent | Yes |
| Auth transport | **SELECTED:** GHM auth API → GHM bearer | Product login still Supabase | Yes |
| HTTP Resource API transport | Present (thin) | Present | Not the first shared auth blocker once GHM credentials exist |
| Authorization | Present given AuthContext | Present | Not the first shared auth blocker |
| Product adapter | Absent | Absent | Blocks broad domain consumption; distinct from auth handshake |

---

## 15. Status table

| Item | Status |
|---|---|
| GHM JWT verification (current) | PRESENT (GHM-shaped HS Bearer / `JWT_SECRET` only) |
| AuthContext (current) | PRESENT |
| GHM authorization | PRESENT (construction) |
| Authentication issuance product capability (current) | ABSENT |
| Asymmetric signing / public-key verify (current) | ABSENT |
| External UUID → bigint mapping (current) | ABSENT |
| Refresh / revocation / logout (current) | ABSENT |
| Token issuer (target architecture) | **SELECTED: GHM** |
| Identity provider / credential-store owner (target) | **SELECTED: GHM** (credentials separate from `account_identity`) |
| Authentication transport (target) | **SELECTED: GHM authentication API → GHM-issued bearer credentials** |
| Founder decisions 1–12 | **RECORDED 2026-09-21** |
| Founder credential / login decisions C1–C10 | **RECORDED 2026-09-21** (see Credential Contract) |
| Issuance implementation | **NOT AUTHORIZED** |
| Follow-on authentication contracts | **REQUIRED BEFORE IMPLEMENTATION** |
| Callable Resource API transport | HTTP/API (SELECTED) |
| Direct product DB access | **NOT APPROVED** |

---

## 16. Founder Decision section

**Status: RECORDED — architecture selections complete; implementation NOT GRANTED.**

Founder selections dated `2026-09-21`. These define **SELECTED TARGET ARCHITECTURE** only. They do not authorize code, migrations, verification changes, or product changes.

| # | Decision | Founder selection | Date | Notes |
|---|---|---|---|---|
| 1 | Issuer | **GHM is the authentication issuer.** | 2026-09-21 | Target architecture. Issuance not implemented. |
| 2 | Identity provider / credential-store owner | **GHM owns authentication and credential lifecycle. Credentials are stored separately from `ghm.account_identity`.** | 2026-09-21 | Credential store design is follow-on contract; not implemented. |
| 3 | Product → GHM authentication transport | **Products authenticate through the GHM authentication API and receive GHM-issued bearer credentials.** | 2026-09-21 | Auth API not implemented. |
| 4 | Token claims contract | **Use stable GHM identity as `sub`; include `iss`, `aud`, `iat`, and `exp`. Authorization/membership roles are resolved by GHM and are not treated as JWT source of truth.** | 2026-09-21 | `sub` = canonical `ghm.account_identity.id`. Differs from current HS token shape (`userId`+`role`). Claims/AuthContext derivation contracts required before implementation. |
| 5 | Issuer / audience / algorithm / key-material contract | **GHM uses asymmetric JWT signing. Private signing key remains inside the GHM issuer boundary. Products/APIs verify using trusted public keys. Verification must explicitly validate issuer, audience, algorithm, and expiration. Key rotation is supported.** | 2026-09-21 | **SELECTED:** ES256; `iss`=`ghm-auth`; `aud`=`ghm-api`; access TTL **15m**; **`kid` required**; secret-managed private key inside issuer boundary; prior public key trusted ≥ 15m + skew. Exact encoding/`kid` values/schedule UNSELECTED. Persistence concepts: Persistence Contract. Not implemented. |
| 6 | External UUID/`sub` → `ghm.account_identity.id` mapping | **Create a provider-neutral mapping `(provider, subject) → ghm.account_identity.id`. Existing Supabase UUID identities are migrated into this mapping. `ghm.account_identity.id` becomes the canonical internal identity.** | 2026-09-21 | **IMPLEMENTED:** `ghm.account_external_identity`; provider vocabulary for Supabase Auth **SELECTED** as `supabase`; bootstrap + **link** DEFINER ops. No production backfill yet. |
| 7 | Account bootstrap / lifecycle | **Use controlled just-in-time account bootstrap for authenticated identities. A missing mapping may create the minimum `account_identity` + mapping required for authentication, but authentication alone does not grant business/admin privileges. Membership and privileged roles require separate GHM provisioning. GHM controls account lifecycle.** | 2026-09-21 | Bootstrap not implemented. |
| 8 | Business / organization identity mapping scope | **Treat business/organization identity mapping as a separate governed migration contract. GHM `business.id` is canonical where an explicit mapping is established. Existing product-specific business/org IDs remain external references during migration. Authentication does not automatically map a person to a business.** | 2026-09-21 | Separate from this auth issuance implementation gate. |
| 9 | Supabase Auth may remain temporarily during migration? | **YES.** Supabase Auth may remain temporarily during migration for controlled transition. **Supabase JWTs must NEVER be accepted directly by GHM.** A trusted migration/auth boundary establishes the GHM identity and obtains a GHM credential. Coexistence must have explicit scope, migration criteria, and a sunset/decommission gate. | 2026-09-21 | Coexistence contracts required; no direct Supabase JWT acceptance ever. |
| 10 | Refresh / revocation / logout semantics | **GHM owns refresh, revocation, and logout.** Access tokens are short-lived GHM-issued JWTs. Refresh credentials are server-controlled, revocable, and rotated. Logout revokes the refresh session. Existing access tokens expire according to their short lifetime. Account/session revocation is authoritative in GHM. | 2026-09-21 | **SELECTED:** rotate every successful refresh; single-use; replay → session-family revoke; access **15m**; inactivity **30d**; absolute **90d**. Opaque refresh / persistence UNSELECTED. Not implemented. |
| 11 | Authentication error semantics | **Standardize authentication failures as HTTP 401 and authorization failures as HTTP 403.** Use stable machine-readable error codes and non-sensitive human-readable messages. Authentication endpoints must avoid account/credential enumeration. | 2026-09-21 | Follow-on error contract required. |
| 12 | First-gate out-of-scope authentication features | **Explicitly defer:** social OAuth; enterprise SSO / SAML; passkeys / WebAuthn; MFA; external identity federation; advanced risk/adaptive authentication; public self-service tenant provisioning; public identity federation; complex multi-device/session administration; admin impersonation. This keeps the first authentication gate appropriate for GHM’s current role as a **private ZAID Technologies backend** and avoids premature enterprise/public IAM complexity. | 2026-09-21 | Deferred features remain out of first implementation gate. |

```text
FOUNDER AUTHORIZATION FOR IMPLEMENTATION: NOT GRANTED
(requires follow-on authentication contracts + separate implementation authorization)
```

### 16.1 Credential / login Founder decisions (follow-on, `2026-09-21`)

Recorded in [GHM_AUTHENTICATION_CREDENTIAL_CONTRACT.md](./GHM_AUTHENTICATION_CREDENTIAL_CONTRACT.md) and reconciled in the Session Contract for session-side effects. These are **SELECTED TARGET** decisions; **not implemented**.

| # | Decision | Selection |
|---|---|---|
| C1 | Primary login identifier | **Email address** |
| C2 | First credential | **Password authentication** |
| C3 | Password KDF | **Argon2id** |
| C4 | Password policy | Min **8**; upper + lower + number **required**; special **optional**; **no** forced periodic changes; auth attempts **rate-limited** |
| C5–C7 | Recovery | **Email-based**; short-lived, single-use, server-controlled recovery credential; **enumeration-resistant**; **invalidate after successful use** |
| C8 | Password change sessions | Revoke **all other** refresh sessions; **preserve current**; **issue fresh refresh** |
| C9 | Password recovery sessions | Revoke **all** refresh sessions; **re-authenticate** |
| C10 | Mobile OTP / passkeys-WebAuthn / device-local biometrics | **Deferred / future** — not designed or implemented now |

Does **not** select: email provider, credential table names, or Argon2id cost parameters (algorithm/`iss`/`aud`/TTL later Founder-selected in crypto/session gates).

---

## 16.2 Final remaining architecture decisions (Gate 2G — Founder decision record)

**Status:** Gate 2G — **FOUNDER DECISIONS R1–R7 SELECTED** (`2026-09-21`); **implementation NOT AUTHORIZED**.
**Purpose:** Record Founder selections for the seven remaining authentication architecture decisions.
**Does not:** authorize implementation, migrations, grants, AuthContext code, or product changes.

Cross-references:
- [GHM_AUTHENTICATION_IDENTITY_AUTHORIZATION_CONTRACT.md](./GHM_AUTHENTICATION_IDENTITY_AUTHORIZATION_CONTRACT.md)
- [GHM_AUTHENTICATION_PERSISTENCE_CONTRACT.md](./GHM_AUTHENTICATION_PERSISTENCE_CONTRACT.md)
- [GHM_AUTHENTICATION_API_CONTRACT.md](./GHM_AUTHENTICATION_API_CONTRACT.md)
- [AUTHORIZATION_BOUNDARY_CONTRACT.md](./AUTHORIZATION_BOUNDARY_CONTRACT.md)

Prior gates (crypto, session, credential, persistence, Auth API, identity/authz) are **complete** and are **not reopened**.

---

### Decision R1 — Account lifecycle / status representation

**Current evidence**

- `ghm.account_identity` has `id`, profile fields, coarse `role`, timestamps — **no** dedicated account-status / disabled column (`20260909150000_create_business_identity.sql`).
- Membership lifecycle already uses `business_membership.membership_status` (`active`/`inactive`/`revoked`) — must remain distinct.
- Identity & Authorization Contract: disable should block authentication and revoke all refresh sessions; access JWTs expire naturally (≤15m).

**Options considered**

| Option | Description |
|---|---|
| **A** | Explicit account status, minimal: e.g. `active` / `disabled` |
| **B** | Reuse coarse `role` or other existing fields — no dedicated status |
| **C** | Elaborate lifecycle state machine (pending, suspended, archived, …) |

**Technical recommendation — not a Founder decision**

Prefer **Option A** (`active` / `disabled` only).

- Smallest model that cleanly supports disable → auth block + session revoke.
- Keeps membership status separate.
- Avoids overloading `role` (Option B conflates authz vocabulary with lifecycle).
- Avoids Option C complexity with no product evidence requiring it.

**When disabled (SELECTED semantics):**

| Concern | Effect |
|---|---|
| Authentication | Login/refresh fail (**401**) |
| Sessions / refresh | Revoke **all** refresh sessions |
| Access JWTs | Expire naturally (≤15m); no blacklist required |
| Business memberships | Rows may remain; authorization must deny for disabled accounts |

```text
FOUNDER DECISION (2026-09-21):
Account lifecycle/status representation = SELECTED — Option A
  explicit account status: active | disabled
Exact column name = UNSELECTED (implementation gate)
```

**Consequences**

- Implies a later migration adding a status field (exact column name UNSELECTED until implementation gate).
- Membership status remains a separate vocabulary.

---

### Decision R2 — System administrator representation

**Current evidence**

- `account_identity.role` ∈ `admin`/`customer`/`business`; mirrored in JWT/`AuthContext.role`.
- Current verifier **trusts** JWT `role`; `assertOwnership` bypasses for `admin`; several repos skip filters when `role === 'admin'`.
- `administrator` on `business_membership` is a **business** role — not system admin.
- `AUTHORIZATION_BOUNDARY_CONTRACT.md` rule 7: admin authority must come from **governed account state** (no fixed-ID promotion).
- Target principle: JWT proves identity; GHM state proves authorization.

**Options considered**

| Option | Description |
|---|---|
| **A** | Controlled account-level system-admin flag/state on/near `account_identity` (governed, not JWT-authoritative) |
| **B** | Separate governed system-administrator relation |
| **C** | Business membership only — remove system admin |

**Technical recommendation — not a Founder decision**

Prefer **Option A**.

- Matches current “account has admin” evidence with least new structure.
- Allows Auth API / Resource API to resolve admin from **DB state** after authentication (JWT claim not authoritative).
- Option B is cleaner isolation but more schema/ops for a private ZAID backend.
- Option C cannot express platform-wide admin bypass evidenced in current code without inventing awkward fake businesses.

```text
FOUNDER DECISION (2026-09-21):
System administrator representation = SELECTED — Option A
  governed account-level system-admin state
  authoritative GHM state — NOT a JWT role claim
Exact storage representation = UNSELECTED (implementation gate)
```

**Consequences**

- Cutover must stop trusting JWT `role=admin` alone; load admin from GHM state.
- Business membership `administrator` remains distinct from system admin.

---

### Decision R3 — Target AuthContext shape

**Current evidence**

- `AuthContext = { userId, role }` (`src/auth/authorization.ts`).
- Services use `userId` for ownership/membership SQL and `role` for coarse/admin checks.
- Target: `sub` = `account_identity.id`; membership not JWT truth.

**Options considered**

| Option | Description |
|---|---|
| **A** | Minimal: authenticated identity id (+ optional session id); authorization resolved from GHM state |
| **B** | Embed membership/roles/permissions snapshot in AuthContext |
| **C** | Keep `{ userId, role }` permanently as the target model |

**Technical recommendation — not a Founder decision**

Prefer **Option A** conceptually:

```text
{
  identityId,          // canonical account_identity.id
  /* optional: sessionId when refresh/session bound */
}
```

- Preserves canonical identity; separates authn from authz.
- Avoids stale membership snapshots (Option B).
- Option C conflicts with Founder “JWT/roles not membership source of truth.”
- Exact TypeScript field names / optional session binding = implementation detail (UNSELECTED).

```text
FOUNDER DECISION (2026-09-21):
Target AuthContext shape = SELECTED — Option A
  identity-centric AuthContext
  establishes authenticated canonical GHM identity
  current authorization resolved from authoritative GHM state
Exact TypeScript field names / optional session binding = UNSELECTED (implementation gate)
```

**Consequences**

- Gradual refactor of coarse `assertRole` / JWT-role trust toward state-backed authorization.
- Must not embed stale membership snapshots as AuthContext truth.

---

### Decision R4 — Controlled bootstrap invocation path

**Current evidence**

- Person mapping `(provider, subject) → account_identity.id` SELECTED; table absent.
- JIT bootstrap SELECTED; must not grant membership/admin.
- Temporary Supabase coexistence SELECTED; never accept Supabase JWTs on Resource API.
- Auth API Contract: bootstrap is **not** public federation; path UNSELECTED.
- Future direct GHM email/password login also SELECTED.

**Options considered**

| Option | Description |
|---|---|
| **A** | Dedicated internal GHM Auth operation (trusted callers only) |
| **B** | Fold entirely into normal login |
| **C** | Migration-only operation, separate from forever-normal login |

**Technical recommendation — not a Founder decision**

Prefer **Option A + C hybrid intent**: a **dedicated controlled Auth boundary operation** used for migration/bootstrap (and reusable for other trusted providers later), **separate from** public email/password login.

- Supports Supabase coexistence without making login accept foreign JWTs.
- Keeps normal login simple (email/password only).
- Pure Option B either couples login to external subjects unsafely or cannot cover migration cleanly.
- Pure “migration-only then delete” (C alone) is acceptable short-term but A gives a durable internal seam.

```text
FOUNDER DECISION (2026-09-21):
Bootstrap invocation path = SELECTED
  dedicated controlled GHM Auth boundary operation
  identity/mapping only
  MUST NOT grant membership, ownership, administrator privileges,
  or arbitrary authorization
Exact operation path / trusted-caller binding = UNSELECTED (implementation gate)
```

**Consequences**

- Requires defining trusted caller identity for the bootstrap operation (implementation gate).
- Must not become a public identity-federation surface.

---

### Decision R5 — Business / organization identity mapping

**Current evidence**

- Founder Decision 8: business/org mapping is a **separate** governed migration; GHM `business.id` canonical where mapped; auth does not auto-map person→business.
- Connect/QuoteFlow use product-local business/org IDs (Supabase UUIDs etc.) — must not assume equality with `ghm.business.id`.
- Person mapping `(provider, subject)` is **not** business mapping.

**Options considered**

| Option | Description |
|---|---|
| **A** | Explicit governed external-reference mapping: `(provider/product, external_business_id) → ghm.business.id` |
| **B** | Separate provider-specific mapping relations per product |
| **C** | Force products to rewrite IDs immediately to GHM ids (no mapping layer) |

**Technical recommendation — not a Founder decision**

Prefer **Option A**.

- Explicit boundary; provider-neutral; matches person-mapping pattern.
- Option B duplicates schema per product.
- Option C is a big-bang cutover risk for live Connect/QuoteFlow.

```text
FOUNDER DECISION (2026-09-21):
Business/organization identity mapping model = SELECTED — Option A
  (provider, external_business_id) → ghm.business.id
Person identity mapping and business identity mapping remain SEPARATE contracts
Exact relation/column names = UNSELECTED (implementation gate)
```

**Note:** Decision 8 already selected *scope* (separate contract, no auto-map). R5 selects the *mapping mechanism shape*. Exact relation names remain UNSELECTED.

**Consequences**

- Enables phased product cutover without assuming Connect/QuoteFlow IDs equal GHM `business.id`.

---

### Decision R6 — Runtime authorization GRANT model (auth persistence)

**Current evidence**

- Roles: `ghm_schema_owner` owns tables/functions; `ghm_migrator` applies DDL; `ghm_runtime` is least-privilege app role.
- Modern slices (e.g. Campaign): `REVOKE INSERT/UPDATE/DELETE` from runtime; `GRANT EXECUTE` on `SECURITY DEFINER` functions.
- Persistence / Identity contracts: auth tables must not imply arbitrary runtime DML.

**Options considered**

| Option | Description |
|---|---|
| **A** | Controlled-function model: runtime `EXECUTE` (+ minimal `SELECT` if needed); mutations via schema-owner `SECURITY DEFINER` |
| **B** | Broad runtime DML on credential/session/refresh/recovery/mapping tables |
| **C** | Hybrid: DML on some auth tables, functions on others |

**Technical recommendation — not a Founder decision**

Prefer **Option A** for authentication durable mutations.

- Consistent with GHM’s established security posture.
- Limits blast radius if app credentials leak.
- Option B violates least privilege for password hashes / refresh hashes.
- Option C is acceptable only with explicit justification per table — default should still be A.

```text
FOUNDER DECISION (2026-09-21):
Auth persistence runtime GRANT model = SELECTED — Option A
  controlled SECURITY DEFINER / schema-owner-owned operations
  runtime receives only required EXECUTE capability
  NO broad runtime DML on auth secrets / session tables
Exact GRANT matrix / function names = UNSELECTED (implementation gate)
```

**Consequences**

- Auth API durable mutations must be designed as governed functions (names UNSELECTED).
- Aligns with Campaign-style runtime boundary.

---

### Decision R7 — Evolution of existing coarse `role`

**Current evidence**

- `account_identity.role` + JWT `role` drive current coarse ACL and admin bypass.
- `canAccessResource` currently lists the **same** resources for all three roles — fine authz is mostly membership/ownership SQL.
- Target: JWT not membership truth; system admin from governed state (R2).

**Options considered**

| Option | Description |
|---|---|
| **A** | Keep `account_identity.role` temporarily for compatibility; remove it as JWT authorization truth during cutover |
| **B** | Migrate meaning into a governed account-level authorization representation (ties to R2) |
| **C** | Remove the field entirely once all consumers migrate |

**Technical recommendation — not a Founder decision**

Prefer **Option A → B incremental path**:

1. Stop issuing/trusting JWT `role` as authz truth (AuthContext R3 / verify cutover).
2. Retain DB `role` temporarily where construction code still reads it **or** map `admin` into R2’s governed admin state.
3. Plan Option C (column removal) only after Resource API + products no longer depend on it.

Avoid a single-step rewrite (jump to C) during first Auth implementation gate.

```text
FOUNDER DECISION (2026-09-21):
Coarse account_identity.role / JWT role evolution = SELECTED
  incremental migration from existing coarse role model
  current DB field may remain temporarily for compatibility
  JWT role claims MUST CEASE being the authoritative source of authorization
  move toward governed GHM state (see R2) without an unnecessary breaking rewrite
Column removal timing = UNSELECTED (after consumers migrate)
```

**Consequences**

- Aligns with R2/R3; do not delete the column before Resource API / product consumers are migrated.
- Leaving JWT `role` authoritative would contradict Founder Decision 4 and R2/R3.

---

### 16.2 Summary table

| # | Topic | Founder selection | Date |
|---|---|---|---|
| R1 | Account lifecycle/status | **SELECTED: Option A** — `active` / `disabled` | 2026-09-21 |
| R2 | System admin representation | **SELECTED: Option A** — governed account-level admin state (not JWT) | 2026-09-21 |
| R3 | Target AuthContext | **SELECTED: Option A** — identity-centric; authz from GHM state | 2026-09-21 |
| R4 | Bootstrap invocation path | **SELECTED** — dedicated controlled GHM Auth boundary op; identity/mapping only | 2026-09-21 |
| R5 | Business/org mapping mechanism | **SELECTED: Option A** — `(provider, external_business_id) → business.id` | 2026-09-21 |
| R6 | Auth persistence GRANTs | **SELECTED: Option A** — SECURITY DEFINER / controlled EXECUTE; no broad runtime DML | 2026-09-21 |
| R7 | Coarse `role` evolution | **SELECTED** — incremental; JWT role not authoritative; field may remain temporarily | 2026-09-21 |

```text
FOUNDER AUTHORIZATION FOR IMPLEMENTATION: NOT GRANTED
Architecture decisions R1–R7 SELECTED.
Exact column/table/function/GRANT names and AuthContext TypeScript shape
remain implementation-gate details unless already frozen elsewhere.
```

---

## Final gate

```text
AUTHENTICATION ISSUANCE ARCHITECTURE DECISION COMPLETE.
FOUNDER DECISIONS 1–12 RECORDED (2026-09-21).
FOUNDER CREDENTIAL / LOGIN DECISIONS C1–C10 RECORDED (2026-09-21).
CRYPTO / SESSION / PERSISTENCE / API / IDENTITY-AUTHZ GATES DOCUMENTED.
FOUNDER DECISIONS R1–R7 SELECTED (2026-09-21).
DOCUMENTATION-ONLY GATE.
IMPLEMENTATION NOT YET AUTHORIZED.
CURRENT VERIFICATION REMAINS HS / JWT_SECRET UNTIL A LATER IMPLEMENTATION GATE.
SUPABASE JWTS MUST NEVER BE ACCEPTED DIRECTLY BY GHM.
PRODUCTS MUST NOT MANUFACTURE AUTHCONTEXT.
PRODUCTS MUST NOT CONNECT DIRECTLY TO GHM POSTGRES.
NO COMMIT / PUSH IMPLIED BY THIS DOCUMENT.
```
