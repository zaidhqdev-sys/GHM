# Issue #1 — Production Foundation Status

**Issue:** #1 — Production hardening: establish secure backend baseline  
**Status:** OPEN — foundation work is in progress  
**Canonical source:** this document records the current repository state; individual construction contracts remain historical evidence for their bounded slices.

**Documentation reconciliation:** 2026-10-02 — this status document was reconciled against current `main`. Superseded authentication gate records remain historical provenance; this document is the current Issue #1 roll-up.

## Current baseline

The production configuration/secret boundary was construction-qualified on PR #21 and is now merged into `main` at `5c71846cd96b05c45956254d912dfc0a609760e6`. Its canonical contract is `PRODUCTION_CONFIGURATION_SECRET_BOUNDARY_CONTRACT.md`. The qualified rule is that production configuration fails closed unless `DATABASE_SSL=true`; this is a construction gate only and does not authorize production environment changes.

Current main includes these completed Issue #1 slices:

- PR #13 — legacy authentication reconciliation — merged as de8143ff99a0b7ca1711cebb47af7091715d8265. The temporary HS/JWT_SECRET bearer path was removed. GHM resource authentication is ES256-only.
- PR #14 — runtime/HTTP hardening — merged as b18a407e0ad1184f2821b08736e0b638e835e1f1. CORS validation, HTTP timeouts, ETag/security headers, readiness/health and operational-boundary qualification were established.
- PR #16 — CI quality gates — merged as c7b70e0e0bf9fea57817c66c80337bacc778cb3c. Repository CI runs install, build, test, and runtime-boundary verification.
- PR #17 — password recovery delivery boundary — merged as 2237995ea3006c8e39fde7739e63e291be735fe1. Recovery credentials are handed only to an injected delivery boundary; HTTP does not disclose the raw recovery token.
- PR #20 — Quote status concurrency reconciliation — merged as 74554bc6607d8c24c248d6cc516e726540a0af18. Quote status mutation re-reads/locks the target inside the authorized transaction boundary.
- PR #21 — production configuration/secret boundary — **MERGED** at `5c71846cd96b05c45956254d912dfc0a609760e6`. Construction qualification requires `DATABASE_SSL=true` in production and fails closed otherwise; the candidate passed 416/416 tests.

## Security/authentication authority

The current GHM-native authentication contract is:

- GHM is the authentication authority.
- Access tokens use ES256.
- Issuer is ghm-auth and audience is ghm-api.
- kid is required.
- sub is the canonical GHM identity identifier.
- Authorization derives from current database state rather than JWT role claims.
- Supabase JWTs are not accepted as GHM credentials.
- Password recovery credentials are stored hashed at rest and are not returned by the HTTP API.

## Runtime boundary

The current runtime boundary includes:

- strict CORS origin configuration;
- bounded request/header/keep-alive timeouts;
- ETag disabled;
- baseline security headers;
- startup database connectivity verification before readiness;
- graceful HTTP/server and database shutdown;
- safe uncaught/unhandled error logging;
- runtime-boundary verification in CI.

## CI authority

The repository quality gate is .github/workflows/ci.yml and currently runs:

1. npm ci
2. npm run build
3. npm test
4. npm run verify:runtime

The workflow uses non-production qualification environment values only.

## Issue #1 remaining work

Issue #1 is NOT closed. Remaining acceptance work includes migration-owned and reproducible PostgreSQL schema reconciliation against the application allowlist, governed table access with validation/authorization/tenant isolation/audit logging, and any remaining production startup/readiness/error-contract evidence required by the Issue #1 acceptance criteria. The current evidence does not yet support closing Issue #1.

Do not infer Issue #1 completion from the merged slices above. Each remaining acceptance criterion must be independently evidenced before closure.

## Change discipline

- Do not reopen previously qualified resource slices without new evidence.
- Do not introduce provider dependencies merely to satisfy a boundary contract.
- Do not commit secrets or private key material.
- Prefer read-only audit before mutation.
- Keep one canonical owner for each contract/concept.
- Keep Connect/QuoteFlow production cutover outside Issue #1 foundation work unless explicitly authorized.
