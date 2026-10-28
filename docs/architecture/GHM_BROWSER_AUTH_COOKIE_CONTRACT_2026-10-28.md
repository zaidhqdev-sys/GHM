# GHM browser-auth cookie contract — decision record

**Date:** 2026-10-28  
**Status:** Proposed contract for review; not deployed, not a production cutover authorization.  
**Scope:** Resolve the mismatch between Connect's staged same-origin browser-auth client/proxy and GHM's native bearer-token auth routes.

## Verified current contract

GHM `src/http/auth-router.ts` exposes:
- `POST /api/v1/auth/register` — 201 with `accessToken`, `refreshToken`, `tokenType`, `expiresIn`, `sessionId`, `accountId`.
- `POST /api/v1/auth/login` — 200 with the same token payload.
- `POST /api/v1/auth/refresh` — requires JSON `refreshToken`, returns rotated token payload.
- `POST /api/v1/auth/logout` — requires JSON `refreshToken`, revokes it.

Connect PR #39's `src/features/authentication/ghmWebAuthClient.js` instead expects same-origin `POST /api/ghm/auth/web/{register,login,refresh,logout}`; it expects refresh credentials in an HttpOnly cookie and an access-token-only JSON response. The Vercel proxy maps these browser routes to GHM `/api/v1/auth/web/*`, which is not present in the inspected GHM `main` auth router. These contracts currently do not match.

## Required browser contract

A GHM-owned browser-auth adapter may expose these routes, separate from the existing native bearer-token contract:

| Browser route at GHM | Input | Successful response | Refresh credential |
|---|---|---|---|
| `POST /api/v1/auth/web/register` | `{ email, password, fullName?, role? }` | 201 with `accessToken, tokenType, expiresIn, sessionId, accountId`; never return `refreshToken` | Set HttpOnly cookie |
| `POST /api/v1/auth/web/login` | `{ email, password }` | 200 with access-only payload | Set/rotate HttpOnly cookie |
| `POST /api/v1/auth/web/refresh` | No body credential | 200 with access-only payload | Read cookie and rotate it |
| `POST /api/v1/auth/web/logout` | No body credential | 200 `{ ok: true }` | Revoke cookie token when valid; always clear cookie |

The existing native `/api/v1/auth/{register,login,refresh,logout}` contract must remain unchanged for server clients and QuoteFlow until their callers are explicitly migrated.

## Security requirements before implementation

1. The browser calls only the same-origin Vercel `/api/ghm/auth/web/*` proxy. No browser-to-GHM service assertion, no signing secret in `VITE_*` variables.
2. Require an exact configured `Origin` allowlist for all browser-auth POSTs. Do not use wildcard origins or trust forwarded-origin headers from the browser.
3. Cookie is host-only (no `Domain`), `HttpOnly`, `Secure` in production, `SameSite=Lax`, and path-scoped to `/api/ghm` so it is sent to the same-origin proxy, not arbitrary Connect routes. Clear it with the exact same Path/SameSite/Secure attributes.
4. Cookie lifetime must be explicit and bounded by a reviewed GHM configuration; do not infer refresh-token expiry from access-token `expiresIn`. If required cookie config is absent or invalid, fail closed.
5. Rotate refresh tokens using the existing GHM Auth service. Do not return the refresh token in JSON or put it in localStorage/sessionStorage. Access tokens remain memory-only in Connect.
6. Enforce request size, method, JSON-body validation, rate limits, no-store cache headers, generic credential errors, and audit logging that excludes passwords/tokens/cookies. If server-side logout revocation fails, clear the browser cookie but return a service error rather than claiming revocation succeeded.
7. Proxy must allowlist exactly the four browser-auth paths, forward the cookie only to the configured GHM origin, forward `Set-Cookie` to the browser without weakening attributes, reject untrusted origins, and never become an arbitrary-host proxy.
8. Validate cookie path behavior end-to-end: browser cookie path is evaluated against the Vercel URL (`/api/ghm`), while GHM receives the cookie only because the same-origin proxy forwards it. Do not set the cookie's Path to the upstream GHM route.
9. Login, register, refresh, logout, replayed refresh, expired/revoked sessions, origin rejection, rate limits, and cookie clearing need HTTP-level tests. Verify against a non-production deployed GHM runtime before cutover.
10. Do not silently link legacy UUIDs to GHM numeric account/business IDs, auto-create memberships, or elevate roles as part of authentication.

## Required next implementation slice

- Add a separately named GHM browser-auth router backed by the existing GHM Auth service, with explicit validated cookie configuration and origin checks.
- Register it in `createApp` without changing the native auth routes.
- Add HTTP tests for cookie attributes, response payload redaction, refresh rotation/revocation, and Origin denial.
- Keep Connect PR #39's same-origin proxy/client as a draft until the GHM adapter is deployed to a non-production environment and end-to-end browser tests pass.
- Continue the broader caller inventory: this contract fixes authentication only. It does **not** remove remaining Supabase Postgres/RPC, Edge Function, Storage, or Realtime dependencies.

## Release gates

No production environment changes, deployment, merge, data import, provider activation, payment activation, or cutover are authorized by this decision record. Required approval gates in the Connect migration handover remain in force.


## Additional runtime security gate observed — 2026-10-28

A read-only inspection of Render application logs for the current `GHM-Internal-Runtime` service showed repeated `express-rate-limit` validation warnings: `ERR_ERL_PERMISSIVE_TRUST_PROXY` because Express `trust proxy` is set to `true`. The warning explicitly notes that this permits clients to bypass IP-based rate limiting by influencing forwarded IP headers. The source mounts auth rate limiters, so this must be treated as a runtime security qualification blocker, not dismissed as a cosmetic log.

Before production browser-auth cutover, review the existing Render proxy topology and configure Express to trust only the known proxy hop/ranges supported by the hosting environment (or use a validated platform-specific setting), then prove the client IP and rate-limit key behavior with integration tests and fresh runtime logs. Do not blindly set a hop count without confirming the request path. This browser-auth PR does not change production proxy trust configuration.


## Proxy-trust remediation candidate — 2026-10-28

The GHM configuration branch now maps the existing explicit `TRUST_PROXY=true` setting to Express hop count `1`, instead of boolean `true`; unset/false remains `false`. Added config tests verify both behaviors. This is a **candidate code fix**, not a runtime change. Render service metadata identifies GHM Internal Runtime as a public Render web service behind Render's ingress; before deployment, verify with the deployed service and request-level tests that the one-hop trust boundary matches the actual ingress path.

Release gate: CI must pass, and a non-production integration test must prove that spoofed client-supplied `X-Forwarded-For` chains cannot rotate/bypass the auth rate-limit key, while legitimate requests still resolve to the intended client IP. Recheck fresh logs for absence of `ERR_ERL_PERMISSIVE_TRUST_PROXY`. Do not manually change the production environment or deploy this branch as part of this PR.


## Runtime recheck — 2026-10-28 21:46 UTC

A fresh read-only Render log query still returns `ERR_ERL_PERMISSIVE_TRUST_PROXY` warnings at 20:35:16Z and 20:55:46Z from the live `GHM-Internal-Runtime` instance. The live service is configured for auto-deploy from branch `main`; its latest listed successful deployment is commit `a2501ee9a10f51d7c2866107e261b57f7f82253b` (documentation-only health-check evidence). The proxy-trust candidate remains on the draft PR branch, so these production warnings are expected to persist until an approved deployment is made.

The latest PR #191 head `aa0cc98797b98ba89470b2516e93d942e92ed9b0` has a completed GHM CI run with conclusion `success`. This does not change production or prove runtime IP behavior. Direct HTTP inspection of the Render health endpoint was not available through the current read-only inspection path; no live authentication requests were sent.
