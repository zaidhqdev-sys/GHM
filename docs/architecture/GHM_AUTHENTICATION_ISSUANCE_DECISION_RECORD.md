# GHM Authentication Issuance Decision Record

**Canonical owner:** GHM platform governance
**Status:** Architecture decision record — documentation-only gate
**Authority:** Local repository `C:\GHM`
**Baseline:** branch `construction/saved-business-resource`, HEAD `0a9a9f7`
**Depends on:**
- [GHM_APPLICATION_BACKEND_PLATFORM_CHARTER.md](./GHM_APPLICATION_BACKEND_PLATFORM_CHARTER.md)
- [PRODUCT_INTEGRATION_BOUNDARY_CONTRACT.md](./PRODUCT_INTEGRATION_BOUNDARY_CONTRACT.md)

## Nature

This document establishes the **factual current state** and **decision boundary** for authentication **issuance** relative to GHM authentication **verification** and GHM **authorization**.

It does **not**:

- select an identity provider
- select a token issuer
- select authentication transport
- authorize login/signup/refresh implementation
- authorize hosting/deployment for an issuer
- modify AuthContext, Campaign, Resource API, or any runtime code
- collapse issuance, verification, and authorization into one generic “auth” concept

```text
TOKEN ISSUER = UNSELECTED
IDENTITY PROVIDER = UNSELECTED
AUTHENTICATION TRANSPORT = UNSELECTED
AUTHENTICATION ISSUANCE IMPLEMENTATION = NOT AUTHORIZED
```

## 1. Purpose

Authentication issuance must be separated from authentication verification and authorization because they have different owners, different security risks, and different implementation gates.

| Concern | Meaning |
|---|---|
| **Authentication issuance** | login/sign-in; signup/registration where applicable; credential verification; session/token issuance; refresh/revocation if applicable; account lifecycle implications |
| **Authentication verification** | bearer token verification; JWT validation; AuthContext construction; trusted identity propagation into GHM |
| **Authorization** | business membership; ownership; role; resource operation ACL; GHM authorization authority over governed operations |

Selecting (or inventing) an issuer before this boundary is frozen would couple every ZAID product to an ungoverned identity path and risk privilege escalation into GHM resources.

## 2. Current verified state (repository evidence)

### 2.1 What GHM currently does

| Behavior | Evidence |
|---|---|
| Reads `Authorization: Bearer …` | `src/auth/request-context.ts` |
| Verifies JWT with shared secret `config.jwtSecret` (`JWT_SECRET`) | `src/auth/request-context.ts`, `src/config.ts` |
| Requires payload claims `userId` (positive safe integer) and `role` (`admin` \| `customer` \| `business`) | `src/auth/request-context.ts`, `src/auth/authorization.ts` |
| Returns immutable `AuthContext { userId, role }` | `src/auth/request-context.ts` |
| HTTP middleware `requireAuth` attaches `req.authContext` or returns `{ error: 'unauthorized' }` | `src/auth/http.ts` |
| Protected Resource API routes use `requireAuth` then registry/ACL then services | `src/http/app.ts`, `src/http/enquiry-router.ts` |
| Services/repositories require `AuthContext` and bind actor ids from context (not caller-chosen creators) | e.g. `src/resources/campaign/*`, `src/resources/business-identity/*`, `src/db/authorized-transaction.ts` |
| Coarse role→resource ACL via `canAccessResource` | `src/auth/authorization.ts`, `src/resources/registry.ts` |

### 2.2 What GHM currently does **not** do

| Capability | Evidence of absence |
|---|---|
| Product-facing login / signup / sign-out HTTP endpoints | No matching routes under `src/http/`; wired routes are `/`, `/healthz`, profile/businesses/projects/enquiries only (`src/http/app.ts`, `src/http/enquiry-router.ts`) |
| Application JWT **issuance** in `src/` | No `jwt.sign` in application modules; `jwt.sign` appears only in tests |
| Refresh-token issuance or rotation | No refresh routes or refresh logic in `src/` |
| Token revocation list / logout invalidation service | Not present in `src/auth/` |
| Password / credential verification for users | No credential verify path in `src/`; `bcrypt` is listed in `package.json` dependencies but **not imported** under `src/` |
| Session-cookie authentication for product identity | `express-session` listed in dependencies; **not imported** under `src/` |
| Documented product issuer contract (issuer/audience/claims algorithm policy for products) | Not present as a GHM issuer contract; verification accepts tokens signed with `JWT_SECRET` without explicit `issuer` / `audience` options in `jwt.verify` |
| Identity-provider SDK integration in GHM runtime | No OIDC/OAuth/Clerk/Auth0/Supabase Auth SDK usage found under `src/` |

### 2.3 JWT signing locations (tests / qualification only)

`jwt.sign(...)` appears only in:

- `src/auth/request-context.test.ts`
- `src/http/app.test.ts`
- `src/http/enquiry-router.test.ts`

These construct tokens for automated tests using `config.jwtSecret`. They are **not** a product-facing issuance capability.

### 2.4 JWT verification parameters currently enforced

From `src/auth/request-context.ts`:

- Bearer header required
- `jwt.verify(token, config.jwtSecret)` — secret-based verification
- Payload must include valid `userId` and `role`

**Not currently enforced in verification code:**

- explicit `issuer` claim check
- explicit `audience` claim check
- explicit algorithm allow-list beyond library defaults for the secret path
- mapping from external UUID identities to GHM bigint account ids

These gaps are factual current-state observations, not authorizations to leave them unresolved forever.

### 2.5 Runtime / package evidence

| Item | Evidence |
|---|---|
| Config requires `JWT_SECRET` (min length 32 in production) | `src/config.ts` |
| Config requires `INVITE_CODE` | `src/config.ts` — required at startup; **no product auth issuance usage found under `src/`** |
| `jsonwebtoken` imported by runtime verification | `src/auth/request-context.ts` |
| `package.json` lists `@types/jsonwebtoken` under **devDependencies** | `package.json` |
| `package.json` does **not** list `jsonwebtoken` under `dependencies` | `package.json` |
| `package-lock.json` / `node_modules` contain `jsonwebtoken@9.0.3` | lockfile / install tree evidence of packaging inconsistency relative to `package.json` |
| Unused auth-adjacent dependencies present | `bcrypt`, `express-session`, `express-rate-limit` in `package.json` with no `src/` imports found |

### 2.6 Product-ecosystem evidence in this repository

Connect identity is audited as **Supabase Auth** (UUID sessions), not interchangeable with GHM’s bigint JWT AuthContext:

- `docs/architecture/CONNECT_IDENTITY_BACKEND_SOURCE_AUDIT.md`
- `docs/architecture/GHM_CONNECT_BACKEND_READINESS_AUDIT.md`
- `docs/architecture/GHM_CONNECT_PRODUCTION_READINESS_GAP_REGISTER.md`

Those documents record that Connect issuance and GHM verification are different models and that issuance ownership is an open decision. They do **not** authorize selecting Supabase Auth (or any other issuer) for GHM.

Platform charter / product integration boundary already mark JWT issuance as **UNRESOLVED** and forbid products from manufacturing privileged AuthContext values:

- `docs/architecture/GHM_APPLICATION_BACKEND_PLATFORM_CHARTER.md`
- `docs/architecture/PRODUCT_INTEGRATION_BOUNDARY_CONTRACT.md`

### 2.7 Summary of current issuance state

```text
GHM authentication verification: PRESENT
GHM AuthContext construction: PRESENT
GHM authorization: PRESENT (construction-qualified slices)
GHM authentication issuance (login/signup/refresh product capability): ABSENT
JWT signing in application code: ABSENT (tests only)
Auth HTTP endpoints: ABSENT
Token issuer contract: UNSELECTED / UNDEFINED
```

## 3. Authentication boundary (conceptual)

Conceptual model only — **no issuer selected**:

```text
Credential / identity authentication
        ↓
Authentication issuer
        ↓
Token / session
        ↓
GHM verification
        ↓
AuthContext
        ↓
GHM authorization
        ↓
Authorized resource operation
```

Products must eventually present credentials/tokens that GHM can verify into AuthContext.
How those credentials/tokens are issued remains an open Founder decision.

## 4. GHM responsibility

GHM must remain authoritative for:

- verification of trusted authentication context (once issuer contract is defined)
- AuthContext semantics consumed by services
- business identity
- memberships
- authorization
- resource ownership rules
- operation authorization
- transaction / security boundary
- least-privilege database access

GHM must **not** trust product-supplied role/ownership claims as a substitute for verification + authorization.

## 5. Issuer responsibility (unselected)

An eventual authentication issuer — wherever it lives — would need to provide capabilities such as:

- credential authentication
- account registration where required
- secure credential handling
- token/session issuance
- issuer identity semantics
- audience semantics
- expiration
- refresh/revocation **if** that model is selected
- account lifecycle
- appropriate security controls

This document does **not** decide whether GHM itself, a separate ZAID-controlled service, or an external provider performs these functions.

## 6. Decision options (neutral — no ranking)

### Option A — GHM issues authentication credentials/tokens

| Aspect | Notes |
|---|---|
| Responsibilities | GHM would own login/signup (or equivalent), credential store/handling, token issuance, and verification |
| Coupling | Tight coupling of product login UX to GHM issuer surface |
| Security boundary | Issuer secrets and resource DB authority must remain carefully separated |
| Operational | GHM becomes identity operations owner |
| Provider dependence | Low external IdP dependence; higher GHM operational burden |
| Migration/replacement | Replacing issuer later means migrating accounts/sessions |
| AuthContext | GHM would mint claims that its verifier already understands (`userId`, `role`) — still requires explicit claims contract |
| Local-first | Possible if issuer is reachable by local products without forcing cloud product hosting |
| Still undecided | Credential store, protocol, refresh, recovery, MFA, transport, key management |

### Option B — Separate ZAID-controlled authentication service issues; GHM verifies

| Aspect | Notes |
|---|---|
| Responsibilities | Issuer service owns credentials/tokens; GHM owns verification + AuthContext + authorization |
| Coupling | Clear split between identity service and resource platform |
| Security boundary | Issuer keys vs GHM verify keys/trust material must be contracted |
| Operational | Two services to operate |
| Provider dependence | Can remain ZAID-controlled |
| Migration/replacement | Issuer can evolve if claims/AuthContext mapping stays stable |
| AuthContext | Mapping contract from issuer identity → GHM `userId`/`role` required |
| Local-first | Local products can call issuer + GHM if both are reachable |
| Still undecided | Service boundaries, claims, bootstrap of `ghm.account_identity` |

### Option C — External identity/authentication provider issues; GHM verifies

| Aspect | Notes |
|---|---|
| Responsibilities | External provider owns credentials/sessions; GHM verifies and maps into AuthContext |
| Coupling | Product login coupled to provider; GHM coupled to provider token semantics unless abstracted |
| Security boundary | Trust external signatures/JWKS; map external subject → GHM account |
| Operational | Provider SLAs, billing, incident coupling |
| Provider dependence | High unless abstraction is strong |
| Migration/replacement | Harder if vendor claims leak into GHM contracts |
| AuthContext | Explicit mapping required (Connect evidence shows UUID Supabase Auth ≠ GHM bigint JWT today) |
| Local-first | Provider reachability still required; does not imply product cloud hosting |
| Still undecided | Which provider (if any), mapping, bootstrap, claim allow-list |

### Option D — Hybrid / delegated model

Meaningful because repository evidence already shows Connect using Supabase Auth while GHM uses a different JWT AuthContext model (`CONNECT_IDENTITY_BACKEND_SOURCE_AUDIT.md`). A hybrid could mean different products temporarily use different issuers while GHM verification converges on one AuthContext contract — **or** phased migration. This is **not** a selected architecture; it is an option space only.

Still undecided: whether hybrid is temporary or permanent; mapping ownership; cutover gates.

**No option is ranked, preferred, recommended, or selected by this document.**

## 7. Decisions that are not yet made

Unless proven otherwise by repository evidence, the following remain **UNSELECTED**:

- token issuer
- identity provider
- credential store
- authentication transport
- session model
- JWT vs opaque token as the long-term product credential form (current verification path is JWT-shaped, but issuance model is unselected)
- refresh-token strategy
- revocation strategy
- account recovery
- MFA
- OAuth/OIDC role (if any)
- hosting/deployment model for the issuer
- cryptographic parameters beyond what verification currently uses (`JWT_SECRET` shared-secret verify)

Do not invent decisions.

## 8. Required future contracts (before implementation)

Before authentication issuance implementation is authorized, contracts should exist for at least:

1. issuer → GHM token/credential contract
2. claims contract (`userId` / `role` mapping and allowed extras)
3. issuer / audience contract
4. token lifetime contract
5. AuthContext mapping contract
6. account identity mapping / bootstrap into `ghm.account_identity` (and related identity tables)
7. error semantics for issuance vs verification failures
8. refresh / revocation semantics (if selected)
9. product login / session integration contract (transport-specific later)
10. version / compatibility policy
11. security / secret-management requirements
12. qualification tests (positive/negative; no silent bypass)

Keep these semantic and transport-neutral where possible until Founder selects issuer architecture and transport.

## 9. Local-first implication

- KBM may remain **local-first**.
- Local-first does **not** mean direct database access.
- Local-first does **not** require Vercel.
- Local-first does **not** require Supabase.
- Authentication architecture must still provide a **trusted path into GHM** (verified AuthContext).
- Do **not** introduce cloud hosting solely to solve this architecture gate.

## 10. Provider independence

- GHM must not leak provider-specific authentication assumptions into resource contracts.
- Provider-specific SDKs must remain behind an approved boundary (if an external issuer is later chosen).
- AuthContext should represent trusted semantics (`userId`, `role`), not vendor-specific application behavior.
- A future provider replacement should be architecturally possible without rewriting GHM resource authorization semantics.

Connect’s current Supabase Auth usage is **product evidence**, not a GHM issuer selection.

## 11. Security non-negotiables

- GHM must not trust product-supplied role/ownership claims.
- GHM authorization remains authoritative.
- Account identity must map deterministically to GHM account identity once issuance is selected.
- Token validation must have explicit issuer/audience/algorithm/key requirements **once the issuer contract is selected**.
- Secrets / private keys must not enter source control.
- Browser/client credentials must never become database credentials.
- Direct product → PostgreSQL remains forbidden.
- No silent authentication bypasses for local development or production.
- Products must not manufacture privileged AuthContext values.

This document does **not** invent cryptographic parameters that have not been selected.

## 12. Implementation gate

```text
NO AUTHENTICATION ISSUANCE IMPLEMENTATION IS AUTHORIZED BY THIS DOCUMENT.
```

Before implementation, Founder authorization is required for:

- issuer architecture (Option A/B/C/D or successor)
- authentication protocol / token model
- claims contract
- account lifecycle model
- transport
- security / key management model
- implementation plan
- qualification strategy

Related gates remain separate:

- product callable transport is **HTTP/API (SELECTED)**; Campaign HTTP exists at `785df12`; authentication **issuance** transport remains **UNSELECTED**
- product adapters / shadow / cutover remain **FUTURE / GATED**

## 13. Relationship to existing documents

| Document | Relationship |
|---|---|
| `GHM_APPLICATION_BACKEND_PLATFORM_CHARTER.md` | Platform ownership; JWT issuance marked unresolved |
| `PRODUCT_INTEGRATION_BOUNDARY_CONTRACT.md` | Supported consumer requires trustworthy AuthContext; issuance unresolved |
| `RESOURCE_API_BOUNDARY_CONTRACT.md` | Current HTTP Resource API assumes verified AuthContext; does not define issuance |
| `CONNECT_IDENTITY_BACKEND_SOURCE_AUDIT.md` | Evidence that Connect issuance ≠ GHM AuthContext model |
| Campaign contracts / `src/resources/campaign/` | Consume AuthContext; creator derived from `userId`; unchanged by this ADR |

This ADR refines the authentication **issuance** boundary. It does **not** override existing qualified resource behavior.

## 14. Open questions (from repository evidence)

1. Who owns authentication issuance for GHM-backed products (GHM vs ZAID service vs external provider vs hybrid)?
2. How will issuer subject identity map to GHM `account_identity.id` (bigint), especially given Connect UUID evidence?
3. What issuer/audience/algorithm/key material will verification require once an issuer is selected?
4. Should product JWT `role` remain a coarse claim, and how does it relate to business membership roles (`owner`/`administrator`/`member`)?
5. What is the intended use of required `INVITE_CODE` configuration relative to account onboarding (present in config; unused for issuance in `src/`)?
6. How should `package.json` declare runtime `jsonwebtoken` dependency relative to current lockfile/install evidence (packaging consistency)?
7. Are unused `bcrypt` / `express-session` dependencies historical placeholders or intended future issuer building blocks? (No `src/` usage found; no selection made here.)

## 15. Status table

| Item | Status |
|---|---|
| GHM JWT verification | PRESENT |
| AuthContext | PRESENT |
| GHM authorization | PRESENT (construction) |
| Authentication issuance product capability | ABSENT |
| Token issuer | UNSELECTED |
| Identity provider | UNSELECTED |
| Authentication transport | UNSELECTED |
| Issuance implementation | NOT AUTHORIZED |
| Callable product transport | HTTP/API (SELECTED); Campaign HTTP at `785df12` |
| Direct product DB access | NOT APPROVED |

## Final gate

AUTHENTICATION ISSUANCE DECISION RECORD COMPLETE.
DOCUMENTATION-ONLY GATE.
NO AUTHENTICATION ISSUANCE IMPLEMENTATION AUTHORIZED.
NO IDENTITY PROVIDER SELECTED.
NO TOKEN ISSUER SELECTED.
NO TRANSPORT SELECTED.
GHM AUTHORIZATION REMAINS AUTHORITATIVE.
DIRECT PRODUCT DATABASE ACCESS REMAINS NOT APPROVED.
