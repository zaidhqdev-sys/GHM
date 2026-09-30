# GHM Production Security Baseline

GHM is not production-approved until all controls below are satisfied.

## Runtime configuration

- `NODE_ENV=production` must be explicit in production.
- `DATABASE_URL` must be present and point to the approved PostgreSQL instance.
- `JWT_SECRET` must be present, high-entropy, and unique per environment.
- The application must fail fast when required secrets are missing.
- No fallback credentials, tokens, or secrets may exist in source code.

## HTTP security

- CORS must use an explicit allowlist of trusted origins.
- Production cookies must use `secure`, `httpOnly`, and an appropriate `sameSite` policy.
- Request body sizes must be bounded.
- Proxy configuration must be explicit when deployed behind a reverse proxy.
- Authentication and password-reset endpoints must be rate limited.

## Authentication

- Bearer tokens must use strict `Bearer <token>` parsing.
- JWT verification must use the configured secret and approved algorithms.
- Password-reset tokens must be stored hashed, expire quickly, be single-use, and never be returned in API responses.
- Password-reset delivery must occur through an approved delivery boundary.

## Database and authorization

- Schema changes must be migration-owned and reproducible.
- Startup must not create, drop, or recreate security policies.
- Every request-scoped database authorization context must be established before queries execute.
- Generic table access must be removed or restricted behind explicit per-domain authorization, validation, tenant isolation, and audit logging.
- RLS policies must be tested for owner, member, admin, and cross-tenant access.

## Operational readiness

- Liveness and readiness endpoints must be available.
- Database connectivity failures must produce safe health responses.
- The server must shut down gracefully and release database/socket resources.
- Errors must be centrally handled without leaking secrets or stack traces.
- Logs must be structured and must not contain passwords, tokens, or sensitive personal data.

## Release gate

A release is blocked until typecheck, build, tests, migration checks, security checks, and deployment smoke tests pass on the exact commit being released.
