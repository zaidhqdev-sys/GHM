# GHM ↔ Zaid Connect Identity Adapter Qualification

**Status:** CONSTRUCTION QUALIFIED — INTEGRATION FOUNDATION; PRODUCT ADAPTER / CUTOVER NOT AUTHORIZED
**Construction branch:** historical `construction/connect-identity-adapter`; integrated into current `main`
**Scope:** Connect external identity → GHM canonical identity resolution only

## 1. Authorized slice

Founder authorization on 2026-09-30 permits construction of the Connect identity adapter within the frozen contract in `GHM_CONNECT_IDENTITY_ADAPTER_CONTRACT.md`.

This slice is limited to:

- resolving `(provider=supabase, subject=Connect Supabase UUID)`;
- returning the existing GHM canonical account identity mapping;
- controlled minimum bootstrap when the integration caller explicitly authorizes bootstrap;
- idempotent persistence through the already-qualified GHM auth persistence boundary.

It does not authorize:

- Supabase JWT verification by GHM;
- Connect session migration;
- Connect login replacement;
- membership/ownership/admin grants;
- business migration;
- product profile migration;
- production routing/cutover;
- storage, realtime, payments, or other product adapters.

## 2. Implementation boundary

The implementation is intentionally a domain/integration seam rather than a public HTTP endpoint.

At the time this identity-adapter slice was qualified, its scope did not include a separately qualified service-to-service trust boundary. A service assertion/replay-protection construction sub-slice has since been recorded in `CONNECT_GHM_SERVICE_TRUST_BOUNDARY_CONTRACT.md` and `CONNECT_SERVICE_REPLAY_PROTECTION_QUALIFICATION.md`; that evidence does not qualify the full Connect↔GHM trust boundary or authorize a public endpoint. Any HTTP/service exposure remains separately gated.

Therefore:

`trusted Connect integration boundary`
→ `ConnectIdentityAdapter`
→ `qualified AuthPersistence`
→ `account_external_identity / account_identity`

The bounded read-only service HTTP endpoint has since received its own construction qualification (`CONNECT_SERVICE_HTTP_READ_BOUNDARY_QUALIFICATION.md`), alongside separate request-context, operation-resolution, authorization-binding, dispatch and assertion-replay slices. This does not qualify the full HTTP/service transport for product use: the complete trust/credential boundary, deployment-managed issuance/rotation, additional handlers, broader resource authorization and production endpoint configuration remain separately gated.

## 3. Implemented invariants

The implementation must preserve:

1. provider is fixed to `supabase`;
2. subject must be a UUID;
3. UUID is normalized before mapping;
4. Supabase JWTs are not accepted as identity input;
5. existing mapping is returned without bootstrap;
6. absent mapping remains unmapped unless bootstrap is explicitly allowed;
7. bootstrap delegates to the existing minimum-bootstrap function;
8. mapping does not grant authorization;
9. no membership/ownership/admin mutation occurs in this slice.

## 4. Qualification checklist

Local evidence required before branch can be considered qualified:

- [x] TypeScript build passes (`npm run build`).
- [x] Full test suite passes: 388/388 (`npm test`).
- [x] Adapter unit tests pass: 6/6.
- [x] Database persistence qualification remains green, including external identity lookup/bootstrap/link tests.
- [x] Documentation/readiness reconciliation recorded.
- [x] Adapter construction integrated into current mainline without production cutover.

## 5. STOP boundary

Do not add HTTP transport, product session migration, business mapping, membership migration, or production configuration in this branch.

The identity adapter construction slice is **QUALIFIED** and integrated. A separate bounded read-only service HTTP endpoint is also construction-qualified in `CONNECT_SERVICE_HTTP_READ_BOUNDARY_QUALIFICATION.md`; that does not qualify broader HTTP/product exposure. Product session migration, public/browser exposure, production routing, and cutover remain separately gated.


## 6. Local qualification evidence — 2026-09-30

Verified on `construction/connect-identity-adapter` at commit `4f36dca`:

- `npm test`: **388 pass / 0 fail / 0 cancelled / 0 skipped**.
- Connect adapter tests: **6 pass / 0 fail**.
- `npm run build`: **TypeScript compilation passed**.
- Database auth persistence qualification remained green, including external identity lookup/bootstrap idempotency and non-admin bootstrap, external identity linking, disabled-account linking, and runtime privilege boundaries.

This qualifies the constructed adapter seam as a construction slice only. Together with the separate read-only HTTP qualification, it does not authorize product session migration, Supabase JWT acceptance by GHM, public/browser or broader product HTTP exposure, membership/ownership/admin migration, business mapping migration, production routing, shadow traffic, or cutover.

## Scope reconciliation for the no-Supabase target — 2026-10-13

This qualification remains valid only for the original source-identity adapter slice, which explicitly resolved `(provider=supabase, subject=Connect Supabase UUID)`. That is historical migration/input provenance and current-runtime compatibility evidence—not qualification of the target no-Supabase Connect authentication path. The target must use GHM-native credentials and must not require Supabase for ongoing identity resolution. A new target-runtime qualification is required after the identity contract and implementation are revised; no scope expansion or cutover is implied here.
