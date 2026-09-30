# GHM Frontend Construction Boundary

**Status:** First frontend slice constructed
**Authority:** Local repository `C:\GHM`
**Baseline:** branch `construction/saved-business-resource`, HEAD `ff63a2d`
**Application root:** `web/`

## 1. Frontend / API boundary

```text
GHM Frontend (web/)
  → HTTPS
GHM HTTP API (GHM-Internal-Runtime)
  → GHM runtime
  → PostgreSQL
```

The browser communicates **only** through GHM HTTP APIs.

The frontend MUST NOT:

- connect directly to PostgreSQL
- use Supabase Auth or Supabase JWTs
- manufacture or serialize GHM `AuthContext`
- contain privileged credentials
- determine authorization independently
- treat JWT role claims as authorization truth
- bypass GHM HTTP routes
- use legacy HS JWTs

Authorization remains **DB-backed inside GHM**. The UI only reacts to successful API responses.

## 2. Legacy public frontend freeze

These assets remain frozen and untouched by the new frontend:

- `public/index.html`
- `public/dashboard.html`
- `public/ghm.js`
- `public/mountain.jpg`
- `public/mountain2.png`

The new application lives under `web/` and does not depend on or modify `public/`.

## 3. Technology choice

| Choice | Rationale |
|--------|-----------|
| Vite | Deterministic local build; minimal SPA tooling |
| React | Small authenticated shell without a rewrite path |
| TypeScript | Aligns with GHM backend typing discipline |

No Redux, Zustand, Axios, React Query, UI kit, or auth SDK in this slice.

## 4. Auth token handling

Auth endpoints:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`

Token rules:

| Token | Storage |
|-------|---------|
| Access token | **Memory only** |
| Refresh token | **`sessionStorage`** |
| localStorage | **Not used** |
| Cookies | **Not used yet** |

Session behavior:

1. Login stores access in memory and refresh in `sessionStorage`.
2. Authenticated calls send `Authorization: Bearer <accessToken>`.
3. Missing/expired access or HTTP `401` triggers **exactly one** refresh attempt.
4. Successful refresh **replaces both** access and refresh tokens (rotation).
5. Failed refresh clears client auth and returns to login.
6. Logout calls `/api/v1/auth/logout` when a refresh token exists, then always clears local state.
7. On reload, access is gone; if refresh exists, restore via one refresh.

## 5. API base URL

Environment variable:

```text
VITE_GHM_API_BASE_URL
```

Local default / documented construction host:

```text
https://ghm-internal-runtime.onrender.com
```

No server secrets belong in the frontend (`DATABASE_URL`, `JWT_SECRET`, ES256 private key, token pepper, etc.).

## 6. First-slice scope

In scope:

1. Login page
2. Authenticated application shell
3. Profile page via `GET /api/v1/profile`
4. Dedicated GHM auth client (login / refresh / logout / authenticated fetch)

Out of scope (explicit deferrals):

- businesses / projects / enquiries / campaigns UI
- admin / customer / quote / settings UI
- signup, password recovery, password change, MFA, social login
- cookies / CSRF infrastructure
- Socket.IO / realtime / PWA / mobile
- design system / component library
- permanent logo / favicon

## 7. CORS deployment requirement

Backend CORS is **not** modified in this slice because the deployed frontend origin does not exist yet.

Before a deployed frontend can call the construction API from the browser:

```text
CORS_ORIGINS must explicitly allow the deployed frontend origin
```

Local `vite` development against Internal-Runtime will also require the exact local origin (for example `http://localhost:5173`) to be present in `CORS_ORIGINS` on that API host when browser calls are made cross-origin.

## 8. Commands

From `web/`:

```bash
npm install
npm run dev
npm run build
npm test
```

Do not treat this document as authorization to deploy or to alter backend CORS.
