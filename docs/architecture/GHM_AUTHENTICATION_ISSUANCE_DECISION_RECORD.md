# GHM Authentication Issuance Decision Record

> **Historical-status clarification — 2026-10-13:** The “implementation NOT AUTHORIZED” statements below preserve the Gate 2 issuance decision state and were superseded for the bounded authentication foundation by Founder-approved Gate 3B and its qualified mainline implementation. They do not authorize broader product migration, public endpoint exposure, or production cutover. Use current living contracts and qualification evidence for present status.


**Canonical owner:** GHM platform governance
**Status:** HISTORICAL FOUNDER ARCHITECTURE DECISION RECORD — architecture remains binding; implementation authorization was subsequently granted through Gate 3B and qualified on `main @ ffc4a2a`
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

At the historical baseline recorded by this decision record, GHM only **verified** existing HS Bearer JWTs with `JWT_SECRET` and built `AuthContext` from numeric `userId` + `role`. The active resource-auth implementation has since moved to the canonical ES256 bearer path, and the bounded GHM login/issuance, refresh rotation, persistence, revocation, recovery, and logout foundation is now constructed and qualification-backed under Gate 3B. Do not reuse this paragraph as current implementation status. Connect and QuoteFlow still use Supabase Auth UUID sessions in their product code; product session-client integration, migration, public exposure, and production cutover remain separately gated.

---

## Architectural invariants (must preserve)

These remain binding under the selected target architecture and during implementation gates:

1. Once established, `AuthContext.userId` is authoritative for `ghm.account_identity.id` (bigint).
2. Products must **not** manufacture privileged `AuthContext` values.
3. Products must **not** connect directly to GHM Postgres.
4. GHM **authorization** remains authoritative over governed resource operations (membership/privileged roles are not JWT source of truth).
5. **Historical Gate 2 decision snapshot:** Founder architecture decisions 1–12 were selected (§16), while implementation was not authorized at that time. Gate 3B later authorized and qualified the bounded GHM authentication foundation; product session-client integration, migration, public exposure, and cutover remain separately gated.
6. This decision record preserves the historical implementation baseline. The active GHM HTTP resource-auth path is now the canonical ES256 verifier; no HS/`JWT_SECRET` cutover remains outstanding for resource authentication.

---

## 1. Purpose

Authentication issuance must be separated from authentication verification and authorization because they have different owners, different security risks, and different implementation gates.

| Concern | Meaning |
|---|---|
| **Authentication issuance** | login/sign-in; signup/registration where applicable; credential verification; session/token issuance; refresh/revocation if applicable; account lifecycle implications |
| **Authentication verification** | bearer token verification; JWT validation; AuthContext construction; trusted identity propagation into GHM |
| **Authorization** | business membership; ownership; role; resource operation ACL; GHM authorization authority over governed operations |

**Current product-integration blocker (reconciled 2026-10-12):** the bounded GHM ES256 authentication/session foundation was subsequently implemented and construction-qualified under Gate 3B. The products still do not have a qualified end-to-end GHM session-client/migration path that proves a product login produces a trusted bearer credential resolving to a living `ghm.account_identity.id` and the required product authorization context. Therefore the product-integration blocker remains open, but the underlying GHM issuance/verification foundation is not “not yet implemented.” See `GHM_CURRENT_STATE.md` and the current production-foundation status for scope boundaries.

---

## 2. Historical verified state at the Gate 2 baseline

The evidence sources below describe the repository state observed at the recorded Gate 2 baseline (`239ef5d`), not the current repository. Current implementation status is summarized in the reconciliation notice above and governed by Gate 3B qualification evidence and `GHM_CURRENT_STATE.md`.

| Source | Path / revision |
|---|---|
| GHM | `C:\GHM` @ `239ef5d` |
| Connect | `C:\zaid-connect-audit` @ `abcffa73` |
| QuoteFlow | `C:\QuoteFlow` (live tree) |

### 2.1 What GHM currently does

| Behavior | Evidence |
|---|---|
| Reads `Authorization: Bearer …` | `src/auth/ghm-bearer.ts` |
| Historical verifier | Shared-secret `JWT_SECRET` via `src/auth/request-context.ts`, now removed from active resource authentication |
| Historical claims | `userId` + `role`; superseded by canonical ES256 `sub` plus DB-backed authorization state |
| Current resource context | `src/auth/ghm-bearer.ts` produces canonical GHM auth context; authorization role is derived from DB account state |
| HTTP middleware `requireAuth` attaches `req.authContext` or returns `{ error: 'unauthorized' }` | `src/auth/http.ts` |
| Protected Resource API routes use `requireAuth` then registry/ACL then services | `src/http/app.ts`, routers |
| Services/repositories require `AuthContext` and bind actor ids from context (not caller-chosen creators) | resource modules; `src/db/authorized-transaction.ts` |
| Coarse role→resource ACL via `canAccessResource` | `src/auth/authorization.ts`, `src/resources/registry.ts` |
| Account PK is `ghm.account_identity.id` bigint identity | `database/migrations/20260909150000_create_business_identity.sql` |
| Business membership is bigint-scoped (`ghm.business_membership`) | same migration |

### 2.2 Historical Gate 2 capability gaps — not current status

The table below records the gaps observed at the Gate 2 baseline. It must not be used as a current inventory: the bounded GHM authentication foundation was subsequently constructed and qualified under Gate 3B. Product-specific session-client integration, signup/product onboarding parity, and production migration remain separate gates.

| Capability | Gate 2 baseline (historical) | Current bounded status |
|---|---|---|
| Product-facing login / signup / sign-out / refresh HTTP endpoints | Not present at the baseline | Bounded GHM login/refresh/logout HTTP foundation qualified; product-client integration and signup/onboarding parity remain separately gated |
| Application JWT issuance | No application issuance at the baseline | GHM ES256 issuance foundation qualified |
| Refresh-token issuance or rotation | Absent at the baseline | Opaque refresh rotation/replay handling foundation qualified |
| Token revocation / logout invalidation | Absent at the baseline | Bounded revocation/logout foundation qualified |
| Password / credential verification | No credential path at the baseline | Bounded GHM credential/login foundation qualified |
| Session-cookie authentication | `express-session` listed but not used at the baseline | No product session-cookie migration is implied; current product clients remain Supabase-session based |
| Issuer / audience / algorithm policy | Not implemented at the baseline | GHM ES256 resource verification and bounded issuance contract qualified |
| Asymmetric JWT signing / public-key verification | Absent at the baseline | ES256 foundation qualified |
| Identity-provider SDK integration | No provider SDK at the baseline | Provider-neutral external-identity mapping/bootstrap foundation qualified; no Supabase JWT acceptance |
| External UUID → GHM identity mapping | Absent at the baseline | `provider + subject → ghm.account_identity.id` mapping foundation qualified; production backfill remains open |
| Account bootstrap | Absent at the baseline | Controlled minimum account-identity bootstrap foundation qualified; business/membership provisioning remains separately gated |

### 2.3 JWT issuance locations — historical Gate 2 evidence reconciled

At the Gate 2 baseline, `jwt.sign(...)` appeared only in test modules using the legacy shared-secret verifier. The current bounded GHM issuance implementation lives in `src/auth/foundation/access-jwt.ts` and `src/auth/ghm-auth-service.ts`; it issues ES256 access JWTs with decimal GHM account identity in `sub` and opaque refresh credentials through the qualified persistence foundation. Product clients remain on Supabase sessions until their separate adapter/session-migration gates are qualified.

### 2.4 JWT verification parameters — historical Gate 2 evidence

Historical implementation evidence from `src/auth/request-context.ts` (removed from the active tree):

- Bearer header required
- `jwt.verify(token, config.jwtSecret)` — HS shared-secret verification only
- Historical payload required numeric `userId` and `role`; the active resource path uses canonical ES256 claims and DB-backed authorization state.
- Claim name is **`userId`**, not `sub`
- **`sub` is ignored** (not read)
- **`iss` / `aud` are not checked**

**Gate 2 gaps at the time (historical; not current verifier status):**

- explicit `issuer` claim check
- explicit `audience` claim check
- explicit algorithm allow-list beyond library defaults for the secret path
- mapping from external UUID identities to GHM bigint account ids
- asymmetric public-key verification

The active ES256 verifier now enforces issuer, audience, algorithm, expiry, `kid`, and canonical decimal `sub`; the provider/subject mapping foundation is qualified. Product session-client integration/migration and production cutover remain open.

### 2.5 Runtime / package evidence

| Item | Evidence |
|---|---|
| Historical config | `JWT_SECRET` was required by the removed HS verifier; current `src/config.ts` no longer requires it |
| Config requires `INVITE_CODE` | `src/config.ts` — required at startup; **no product auth issuance usage found under `src/`** |
| Historical runtime dependency | `jsonwebtoken` was used by the removed HS verifier; active resource authentication uses the ES256 access-JWT foundation |
| Packaging note | `@types/jsonwebtoken` in devDependencies; runtime packaging consistency remains an open ops question |

### 2.6 Live-product identity evidence (Connect + QuoteFlow)

| Product | Auth reality (current) | Evidence |
|---|---|---|
| **Zaid Connect** | Supabase Auth email/password; session UUID `session.user.id`; profile PK = `auth.users.id`; RLS/RPCs/`auth.uid()`; client `authService` + `resolveApplicationIdentity` | `C:\zaid-connect-audit` `lib_supabase.js`; `CONNECT_IDENTITY_BACKEND_SOURCE_AUDIT.md` |
| **QuoteFlow** | Supabase Auth; UUID `user.id`; session persisted via AsyncStorage-backed Supabase client; org/legal/subscription RPCs use `auth.uid()` | `C:\QuoteFlow` `AuthContext.tsx`, `supabase.ts`, org/legal migrations |
| **Both** | Product clients do not use GHM `{ userId, role }` tokens; GHM's canonical external-identity mapping foundation is qualified, but product migration/backfill is not | Cross-product read-only audit at the historical baseline; current mapping status is governed by Gate 3B evidence |
| **Both** | Product Supabase JWTs are not accepted by the current GHM resource verifier; GHM now verifies its own ES256 bearer contract |

Connect Edge checkout validates Bearer tokens with **Supabase** `auth.getUser()`; that product path is separate from GHM resource authentication.

**Target coexistence note (architecture only):** Founder decision §16.9 selects temporary Supabase Auth coexistence during migration. That does **not** authorize accepting Supabase JWTs in GHM today, and does not change current product or GHM runtime behavior.

### 2.7 Summary of current implemented issuance state

```text
GHM authentication verification: PRESENT (canonical ES256 bearer; DB-backed account state)
GHM AuthContext construction: PRESENT
GHM authorization: PRESENT (construction-qualified slices)
GHM bounded authentication issuance/login: PRESENT (Gate 3B qualified)
Refresh/session rotation, revocation, recovery and logout foundation: PRESENT (Gate 3B qualified)
External identity mapping/bootstrap foundation: PRESENT (Gate 3B qualified)
Connect / QuoteFlow product session-client migration: NOT YET QUALIFIED
Production product cutover: NOT AUTHORIZED
```

---

## 3. Authentication boundary (conceptual)

Target flow under the **selected architecture** (not implemented at the 2026-09-21 Gate 2 decision point; bounded foundation subsequently constructed and qualified under Gate 3B):

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
- authentication issuance and credential lifecycle (**selected target** at Gate 2; bounded GHM foundation subsequently constructed and qualified under Gate 3B; product session-client/migration integration remains open)

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

This decision record alone does not authorize additional scope beyond the bounded foundation qualified under Gate 3B. Product adapters, broader public exposure, production configuration, and product cutover still require their own authorization and qualification.

---

## 6. Historical option space (superseded for selection)

Prior to Founder selection, the ADR recorded neutral options A–D (GHM issuer, ZAID issuer service, external IdP, hybrid). Those remain historical context only.

**Founder selection (2026-09-21):** GHM is the authentication issuer (decision 1), with temporary Supabase Auth coexistence during migration (decision 9) via a trusted migration/auth boundary — not direct Supabase JWT acceptance.

---

## 7. Founder decisions 1–12 — recorded

Architecture decisions were **SELECTED** in §16 (date `2026-09-21`). The accompanying implementation stop is the **historical Gate 2 decision** and was superseded for the bounded GHM authentication foundation by Gate 3B. Product session-client integration, migration, public exposure, and cutover remain separately gated.

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

## 12. Historical Gate 2 implementation gate — superseded for the bounded foundation

The block below preserves the original Gate 2 scope stop. It is not a current statement that authentication issuance remains unimplemented or unauthorized: Gate 3B subsequently authorized and qualified the bounded GHM authentication foundation. The decision record itself does not authorize additional work beyond that qualified scope.

```text
GATE 2 HISTORICAL DECISION:
NO AUTHENTICATION ISSUANCE IMPLEMENTATION WAS AUTHORIZED BY THIS DOCUMENT.
NO IDENTITY MAPPING MIGRATION WAS AUTHORIZED BY THIS DOCUMENT.
NO JWT VERIFICATION CHANGE WAS AUTHORIZED BY THIS DOCUMENT.
NO PRODUCT CODE CHANGE WAS AUTHORIZED BY THIS DOCUMENT.
FOLLOW-ON AUTHENTICATION CONTRACTS WERE REQUIRED BEFORE IMPLEMENTATION.
```

Founder architecture decisions 1–12 are recorded in §16. The bounded foundation was subsequently authorized and qualified under Gate 3B. Further product adapters, public exposure, production configuration, product migration, and cutover still require their own authorization and qualification.

Related gates remain separate:

- product callable Resource API transport is **HTTP/API (SELECTED)** generally
- selected **authentication** transport target is GHM authentication API → GHM-issued bearer credentials (**SELECTED**; bounded GHM foundation subsequently constructed and qualified under Gate 3B; product session-client integration remains open)
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
| `GHM_AUTHENTICATION_SCHEMA_MIGRATION_CONTRACT.md` | Historical proposal; bounded authentication schema/migration foundation subsequently constructed and qualified under Gate 3B |
| `GHM_AUTHENTICATION_IMPLEMENTATION_PARAMETER_GATE.md` | Historical parameter gate; Gate 3B subsequently approved the bounded implementation parameters and the foundation is qualified |
| `RESOURCE_API_BOUNDARY_CONTRACT.md` | Current HTTP Resource API assumes verified AuthContext; does not define issuance implementation |
| `CONNECT_IDENTITY_BACKEND_SOURCE_AUDIT.md` | Connect UUID Supabase Auth ≠ GHM bigint AuthContext (current evidence) |
| Live-product readiness audits / gap register | Connect backend readiness; issuance was shared blocker |
| Campaign / Brief docs | Out of scope for this gate; AuthContext consumers only |

This ADR records the authentication **issuance architecture** decision. It does **not** override existing qualified resource behavior and does **not** implement issuance.

---

## 14. Disaggregated blocker map (do not conflate)

| Layer | Architecture status | Current implementation status | Blocks product migration today? |
|---|---|---|---|
| Issuer decision | **SELECTED: GHM** | Bounded GHM issuance foundation qualified; product login still Supabase | Yes — product client/migration path remains unqualified |
| Token verification | GHM ES256 + issuer/audience/algorithm/expiry/subject contract | ES256 verifier foundation qualified; old HS/`JWT_SECRET` + `userId`/`role` path superseded | Product integration still requires qualification |
| Identity mapping | **SELECTED** `(provider, subject)` map | Mapping/bootstrap foundation qualified | Production backfill and product migration remain open |
| Auth transport | **SELECTED:** GHM auth API → GHM bearer | Bounded GHM login/refresh/logout foundation qualified; product login still Supabase | Yes — product client/migration path remains unqualified |
| HTTP Resource API transport | Present (thin) | Present | Not the first shared auth blocker once product clients obtain GHM credentials |
| Authorization | Present given AuthContext | Present in qualified slices | Product-specific authorization parity still requires qualification |
| Product adapter | Per-product scope and approval required | Broad adapter/migration remains unqualified | Blocks broad domain consumption; distinct from auth handshake |

---

## 15. Historical Gate 2 status table — current state reconciled above

| Item | Gate 2 status (historical) | Current bounded status |
|---|---|---|
| GHM JWT verification | HS bearer path with `userId`/`role` | ES256 bearer with DB-backed account state qualified |
| AuthContext | Present | Present |
| GHM authorization | Existing resource slices | Qualified in bounded resource slices; product parity remains scoped separately |
| Authentication issuance | Absent | Bounded GHM issuance/login foundation qualified; product session-client integration remains open |
| Asymmetric signing / public-key verification | Absent | ES256 foundation qualified |
| External UUID → bigint mapping | Absent | Mapping/bootstrap foundation qualified; production backfill remains open |
| Refresh / revocation / logout | Absent | Bounded GHM session foundation qualified; product migration remains open |
| Token issuer (target architecture) | GHM selected | GHM issuer foundation qualified |
| Identity provider / credential-store owner | GHM selected | Bounded GHM credential/persistence foundation qualified |
| Authentication transport | GHM auth API → GHM bearer selected | Bounded GHM login/refresh/logout HTTP foundation qualified; product integration remains open |
| Founder decisions 1–12 | Recorded 2026-09-21 | Historical decision remains binding within its approved scope |
| Founder credential / login decisions C1–C10 | Recorded 2026-09-21 | Historical decisions remain binding within their approved scope |
| Product migration / cutover | Not authorized by Gate 2 record | Still separately gated; no production cutover authorized |
| Callable Resource API transport | HTTP/API selected | Present within bounded qualified routes |
| Direct product DB access | Not approved | Not approved |

---

## 16. Founder Decision section

**Historical status at Gate 2 issuance decision: RECORDED — architecture selections complete; implementation NOT GRANTED.** Gate 3B subsequently granted and qualified construction of the bounded GHM authentication foundation; the product-client/migration and production gates remain separate.

Founder selections dated `2026-09-21` define the **selected target architecture**; by themselves, they do not authorize code, migrations, verification changes, or product changes. The bounded authentication foundation was subsequently authorized and qualified through Gate 3B; broader product and production changes remain separately gated.

| # | Decision | Founder selection | Date | Notes |
|---|---|---|---|---|
| 1 | Issuer | **GHM is the authentication issuer.** | 2026-09-21 | Gate 2 status: issuance not implemented then; bounded foundation subsequently constructed and qualified under Gate 3B. |
| 2 | Identity provider / credential-store owner | **GHM owns authentication and credential lifecycle. Credentials are stored separately from `ghm.account_identity`.** | 2026-09-21 | Gate 2 status: credential-store implementation was follow-on work then; the bounded persistence/session foundation was subsequently constructed and qualified under Gate 3B. |
| 3 | Product → GHM authentication transport | **Products authenticate through the GHM authentication API and receive GHM-issued bearer credentials.** | 2026-09-21 | Gate 2 status: Auth API not implemented then. Product session-client integration and end-to-end product login qualification remain open. |
| 4 | Token claims contract | **Use stable GHM identity as `sub`; include `iss`, `aud`, `iat`, and `exp`. Authorization/membership roles are resolved by GHM and are not treated as JWT source of truth.** | 2026-09-21 | `sub` = canonical GHM identity reference. The prior HS `userId`+`role` shape is superseded. |
| 5 | Issuer / audience / algorithm / key-material contract | **GHM uses asymmetric JWT signing. Private signing key remains inside the GHM issuer boundary. Products/APIs verify using trusted public keys. Verification must explicitly validate issuer, audience, algorithm, and expiration. Key rotation is supported.** | 2026-09-21 | **SELECTED:** ES256; `iss`=`ghm-auth`; `aud`=`ghm-api`; access TTL **15m**; **`kid` required**; secret-managed private key inside issuer boundary; prior public key trusted ≥ 15m + skew. Exact encoding/`kid` values/schedule were unselected at Gate 2. The bounded ES256 issuance/verification foundation was subsequently constructed and qualified under Gate 3B; this historical row does not establish product integration or production cutover. |
| 6 | External UUID/`sub` → `ghm.account_identity.id` mapping | **Create a provider-neutral mapping `(provider, subject) → ghm.account_identity.id`. Existing Supabase UUID identities are migrated into this mapping. `ghm.account_identity.id` becomes the canonical internal identity.** | 2026-09-21 | **IMPLEMENTED:** `ghm.account_external_identity`; provider vocabulary for Supabase Auth **SELECTED** as `supabase`; bootstrap + **link** DEFINER ops. No production backfill yet. |
| 7 | Account bootstrap / lifecycle | **Use controlled just-in-time account bootstrap for authenticated identities. A missing mapping may create the minimum `account_identity` + mapping required for authentication, but authentication alone does not grant business/admin privileges. Membership and privileged roles require separate GHM provisioning. GHM controls account lifecycle.** | 2026-09-21 | Gate 2 status: bootstrap not implemented then; bounded account-identity bootstrap was subsequently constructed and qualified under Gate 3B. |
| 8 | Business / organization identity mapping scope | **Treat business/organization identity mapping as a separate governed migration contract. GHM `business.id` is canonical where an explicit mapping is established. Existing product-specific business/org IDs remain external references during migration. Authentication does not automatically map a person to a business.** | 2026-09-21 | Separate from this auth issuance implementation gate. |
| 9 | Supabase Auth may remain temporarily during migration? | **YES.** Supabase Auth may remain temporarily during migration for controlled transition. **Supabase JWTs must NEVER be accepted directly by GHM.** A trusted migration/auth boundary establishes the GHM identity and obtains a GHM credential. Coexistence must have explicit scope, migration criteria, and a sunset/decommission gate. | 2026-09-21 | Coexistence contracts required; no direct Supabase JWT acceptance ever. |
| 10 | Refresh / revocation / logout semantics | **GHM owns refresh, revocation, and logout.** Access tokens are short-lived GHM-issued JWTs. Refresh credentials are server-controlled, revocable, and rotated. Logout revokes the refresh session. Existing access tokens expire according to their short lifetime. Account/session revocation is authoritative in GHM. | 2026-09-21 | **SELECTED:** rotate every successful refresh; single-use; replay → session-family revoke; access **15m**; inactivity **30d**; absolute **90d**. Opaque refresh / persistence were unselected at Gate 2; bounded refresh/session persistence was subsequently constructed and qualified under Gate 3B. |
| 11 | Authentication error semantics | **Standardize authentication failures as HTTP 401 and authorization failures as HTTP 403.** Use stable machine-readable error codes and non-sensitive human-readable messages. Authentication endpoints must avoid account/credential enumeration. | 2026-09-21 | Follow-on error contract required. |
| 12 | First-gate out-of-scope authentication features | **Explicitly defer:** social OAuth; enterprise SSO / SAML; passkeys / WebAuthn; MFA; external identity federation; advanced risk/adaptive authentication; public self-service tenant provisioning; public identity federation; complex multi-device/session administration; admin impersonation. This keeps the first authentication gate appropriate for GHM’s current role as a **private ZAID Technologies backend** and avoids premature enterprise/public IAM complexity. | 2026-09-21 | Deferred features remain out of first implementation gate. |

```text
HISTORICAL GATE 2 STATUS — FOUNDER AUTHORIZATION FOR IMPLEMENTATION: NOT GRANTED AT THAT GATE.
Gate 3B later authorized and qualified the bounded GHM authentication foundation.
Product integration, broader exposure, production secrets, and cutover remain separately gated.
```

### 16.1 Credential / login Founder decisions (follow-on, `2026-09-21`)

Recorded in [GHM_AUTHENTICATION_CREDENTIAL_CONTRACT.md](./GHM_AUTHENTICATION_CREDENTIAL_CONTRACT.md) and reconciled in the Session Contract for session-side effects. These were **SELECTED TARGET** decisions at the time. The bounded credential/session foundation was subsequently constructed and qualified under Gate 3B; product integration and production gates remain open.

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

**Historical status at Gate 2G (2026-09-21):** Founder decisions R1–R7 were selected; implementation was not authorized at that gate. Gate 3B later authorized and qualified the bounded authentication foundation; product migration and cutover remain separately gated.
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

**Historical evidence at Gate 2 — not current implementation status**

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
Exact column name was UNSELECTED at Gate 2; the qualified schema implements `account_status` (`active` / `disabled`) — see the Schema Migration Contract.
```

**Consequences**

- At Gate 2 this implied a later migration; that migration is now qualified and adds `account_status`. Further account-lifecycle scope remains separately gated.
- Membership status remains a separate vocabulary.

---

### Decision R2 — System administrator representation

**Historical evidence at Gate 2 — not current implementation status**

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
Exact storage representation was UNSELECTED at Gate 2; the qualified schema implements `is_system_admin` as governed account-level state — see the Schema Migration Contract.
```

**Consequences**

- Cutover must stop trusting JWT `role=admin` alone; load admin from GHM state.
- Business membership `administrator` remains distinct from system admin.

---

### Decision R3 — Target AuthContext shape

**Historical evidence at Gate 2 — not current implementation status**

- The historical compatibility path used `AuthContext = { userId, role }`; the current GHM bearer path supplies canonical account identity context and derives authorization role from DB state.
- Historical services used `userId`/`role` from the compatibility AuthContext; current resource authorization derives the effective role from GHM account state.
- Target: `sub` = `account_identity.id`; membership not JWT truth.

**Options considered**

| Option | Description |
|---|---|
| **A** | Minimal: authenticated identity id (+ optional session id); authorization resolved from GHM state |
| **B** | Embed membership/roles/permissions snapshot in AuthContext |
| **C** | Historical compatibility model; not the current bearer-auth source of truth |

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

**Gate 2G evidence snapshot (historical; current mapping/bootstrap status is governed by Gate 3B qualification):**

- Person mapping `(provider, subject) → account_identity.id` SELECTED; the mapping table was absent at that gate and is now part of the qualified foundation.
- JIT bootstrap SELECTED; must not grant membership/admin. The bounded account-identity bootstrap foundation is now qualified; business/membership provisioning remains separately gated.
- Temporary Supabase coexistence SELECTED; never accept Supabase JWTs on Resource API.
- Auth API Contract: bootstrap is **not** public federation; product-facing bootstrap remains governed by its bounded current contract and must not be inferred as a public federation API.
- Future direct GHM email/password login also SELECTED; product-client integration remains open.

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

**Historical evidence at Gate 2 — not current implementation status**

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
Exact relation/column names were UNSELECTED at Gate 2; `ghm.business_external_mapping` is now implemented and qualified. Product-specific mapping population/migration remains separately gated.
```

**Note:** Decision 8 selected *scope* (separate contract, no auto-map); R5 selected the *mapping mechanism shape*. The canonical relation is now `ghm.business_external_mapping`; production product mapping/backfill remains gated.

**Consequences**

- Enables phased product cutover without assuming Connect/QuoteFlow IDs equal GHM `business.id`.

---

### Decision R6 — Runtime authorization GRANT model (auth persistence)

**Historical evidence at Gate 2 — not current implementation status**

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
Exact GRANT matrix / function names were UNSELECTED at Gate 2; the bounded schema/function grants are now implemented in qualified migrations. Use the Schema Migration Contract and current role-qualification evidence for exact per-object details.
```

**Consequences**

- Auth API durable mutations use governed functions in the qualified migration set; additional operations require separate scope and qualification.
- Aligns with Campaign-style runtime boundary.

---

### Decision R7 — Evolution of existing coarse `role`

**Historical evidence at Gate 2 — not current implementation status**

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
HISTORICAL GATE 2G STATUS — FOUNDER AUTHORIZATION FOR IMPLEMENTATION WAS NOT GRANTED AT THAT GATE.
Architecture decisions R1–R7 were selected; Gate 3B later authorized and qualified the bounded authentication foundation.
Physical schema/function names are governed by the qualified migrations and schema-migration contract; further scope, product migration, and cutover remain separately gated.
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
CURRENT RESOURCE VERIFICATION IS GHM ES256. Any remaining HS/`JWT_SECRET` references in this record describe the historical baseline and are not active runtime configuration.
SUPABASE JWTS MUST NEVER BE ACCEPTED DIRECTLY BY GHM.
PRODUCTS MUST NOT MANUFACTURE AUTHCONTEXT.
PRODUCTS MUST NOT CONNECT DIRECTLY TO GHM POSTGRES.
NO COMMIT / PUSH IMPLIED BY THIS DOCUMENT.
```
