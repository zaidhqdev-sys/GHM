# Legacy Authentication / JWT_SECRET Reconciliation Contract

**Canonical owner:** GHM platform governance  
**Status:** FOUNDER-AUTHORIZED CONSTRUCTION CONTRACT — BOUNDED RECONCILIATION SLICE  
**Parent:** Issue #1 — Production hardening: establish secure backend baseline  
**Branch:** `construction/legacy-auth-jwt-secret-reconciliation`  
**Baseline:** current `main` at construction start  
**Scope:** reconcile the temporary HS `JWT_SECRET` compatibility path with the already-qualified GHM ES256 authentication boundary.

## 1. Problem statement

GHM now has two bearer-authentication paths:

1. **Primary governed path:** GHM-issued ES256 access JWTs, verified by `src/auth/ghm-bearer.ts` / `src/auth/foundation/access-jwt.ts`, with authorization state loaded from `ghm.account_identity`.
2. **Temporary legacy path:** HS JWT verification in `src/auth/request-context.ts`, using `JWT_SECRET` and legacy `userId` + `role` claims.

The current configuration still requires `JWT_SECRET` unconditionally. The authentication API contract explicitly preserves this HS verifier only until a separate implementation/cutover gate.

This slice exists to establish the exact removal/cutover boundary. It must not silently delete the compatibility path, change product authentication, or migrate Connect/QuoteFlow.

## 2. Already-established authority

The following are existing canonical decisions and are not reopened by this slice:

- GHM is the authentication authority for the target GHM-native path.
- Access JWT algorithm is ES256.
- Issuer is `ghm-auth`.
- Audience is `ghm-api`.
- `sub` is the canonical GHM account identity identifier.
- Access-token lifetime is 15 minutes.
- `kid` is required.
- JWT role/membership claims are not authorization truth.
- Resource authorization derives current account state from GHM persistence.
- Supabase JWTs are never accepted as GHM credentials.
- Connect/QuoteFlow production authentication migration is outside this slice.
- The temporary HS verifier is not to be removed without proving that no governed runtime path still depends on it.

## 3. Current evidence baseline

### 3.1 Legacy configuration

`src/config.ts` currently requires:

- `JWT_SECRET`
- `DATABASE_URL`
- `INVITE_CODE`
- `CORS_ORIGINS`

The legacy secret is validated for production length and is exposed as `config.jwtSecret`.

### 3.2 Legacy verifier

`src/auth/request-context.ts`:

- accepts `Authorization: Bearer ...`
- verifies using `jsonwebtoken.verify(token, config.jwtSecret)`
- accepts the legacy `userId` claim
- accepts the legacy `role` claim
- returns the legacy `AuthContext`.

### 3.3 Resource middleware

`src/auth/resource-auth.ts` classifies bearer JWTs first:

- ES256 + `kid` → GHM ES256 path
- HS256/384/512 → legacy HS path
- anything else → rejected.

The legacy branch explicitly calls `authenticateRequest`.

### 3.4 Primary GHM path

`src/auth/ghm-bearer.ts` and the access-JWT foundation already provide the GHM-native path:

- ES256-only verification
- issuer/audience validation
- active/previous `kid` support
- canonical account identity from `sub`
- database-backed account state
- disabled/missing account rejection
- authorization role derived from database state.

### 3.5 Auth HTTP foundation

`src/http/auth-router.ts` already exposes:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`

The GHM Auth service issues ES256 access tokens and opaque refresh credentials.

## 4. Reconciliation invariants

The implementation must preserve all of the following:

1. No production default or fallback signing secret.
2. No new consumer of `config.jwtSecret`.
3. No new consumer of `authenticateRequest`.
4. New governed GHM resource authentication must remain ES256-only.
5. Authorization must continue to derive from current GHM account state, not JWT role claims.
6. Supabase JWTs remain rejected.
7. Existing qualified auth tests and resource qualifications must remain green.
8. No database migration is required merely to remove the legacy HS verifier.
9. No Connect/QuoteFlow cutover is performed.
10. No secret material is written into repository files, tests, logs, commits, or issue comments.
11. The final removal gate must identify every remaining reference to `JWT_SECRET`, `config.jwtSecret`, `authenticateRequest`, and the legacy HS classification path.
12. If any production-relevant caller still depends on the HS path, removal must stop and the dependency must be explicitly documented rather than bypassed.

## 5. Construction sequence

### Gate A — caller inventory

Before deleting or changing the HS path, inventory repository references to:

- `JWT_SECRET`
- `config.jwtSecret`
- `authenticateRequest`
- `legacy-hs`
- `classifyBearerCredential`
- legacy `userId` / `role` JWT issuance or verification.

Classify each reference as:

- production runtime dependency,
- compatibility test,
- documentation/evidence,
- dead code.

### Gate B — compatibility decision

If the caller inventory proves that no governed production route requires HS authentication, the temporary compatibility branch may be removed.

If a production dependency remains, this slice must stop at the boundary and produce a narrower migration contract. It must not weaken the ES256 boundary or silently dual-authorize a new product path.

### Gate C — implementation

Only after Gate B:

- remove the obsolete HS verifier path if proven unused;
- remove the corresponding `JWT_SECRET` configuration requirement;
- remove legacy HS classification from resource authentication;
- update only tests/docs/config that are made obsolete by that removal;
- preserve the ES256 path unchanged except where compilation requires mechanical cleanup.

### Gate D — qualification

Required local evidence before merge:

- clean build;
- complete test suite;
- explicit authentication/security tests proving:
  - valid ES256 access JWT succeeds;
  - wrong algorithm fails;
  - wrong issuer/audience fails;
  - unknown `kid` fails;
  - missing/disabled account fails;
  - JWT role manipulation cannot elevate authorization;
  - HS bearer credentials are rejected after legacy removal;
  - missing `JWT_SECRET` no longer blocks GHM-native production configuration;
- repository-wide zero-reference audit for obsolete legacy symbols;
- no secret values captured in output.

### Gate E — merge boundary

This slice may only be promoted if all prior gates pass.

This slice does **not** close Issue #1 by itself.

## 6. Explicit non-goals

Do not:

- redesign GHM Auth;
- change ES256 claims;
- change session/refresh lifetime policy;
- add a new identity provider;
- accept Supabase JWTs;
- migrate Connect or QuoteFlow;
- change database schema;
- introduce a new auth provider;
- rotate or generate production keys;
- commit private keys or secrets;
- close Issue #1;
- reopen already-qualified resource slices.

## 7. Stop conditions

Stop and report evidence if:

- a production route still requires the legacy HS verifier;
- a hidden dependency on `JWT_SECRET` is discovered;
- removal would break an already-qualified boundary;
- a required migration would become necessary;
- the repository cannot prove the ES256 path is available in the affected runtime;
- tests require real secret material or credentials.

## 8. Completion definition

The slice is complete only when the repository can demonstrate, from source and tests, that:

```text
GHM resource authentication
        ↓
ES256 GHM access JWT
        ↓
canonical account identity
        ↓
database-backed authorization state
```

and the temporary HS/`JWT_SECRET` compatibility path is either:

- **removed and proven unused**, or
- **explicitly retained behind a documented, bounded migration dependency**.

No production cutover is implied by completion of this construction slice.
