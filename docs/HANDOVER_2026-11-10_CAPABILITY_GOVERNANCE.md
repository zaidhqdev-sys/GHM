# Capability catalogue governance — implementation handover (2026-11-10)

## Current work
Draft PR #250 introduces GHM admin capability catalogue operations. Its follow-up PR #268 adds database-boundary invariants and is stacked on #250.

## PR #268 changes
- A transaction-scoped advisory lock serializes hierarchy mutations so concurrent changes cannot each pass a stale cycle check.
- Parent references must exist and cannot target retired capabilities.
- Parent cycles are rejected at the database boundary.
- Slugs are trimmed and lowercased before uniqueness enforcement; the existing unique index remains authoritative.
- Published slugs remain immutable.
- Replacement references must target a different active capability in the same taxonomy version and only be set on deprecated/retired capabilities; a referenced replacement cannot later leave active state or change taxonomy version.
- Disposable PostgreSQL qualification includes direct SQL hierarchy-cycle, duplicate-slug and replacement-target-retention denial cases.

## Security blocker remains open
PR #250's three SECURITY DEFINER functions still authorize using caller-supplied `p_actor_account_id` and remain executable by `ghm_runtime`. HTTP role checks do not bind a direct SQL caller to the claimed actor. Neither PR #250 nor #268 is approved for merge until a database-verifiable actor binding or isolated gateway path is implemented and each RPC is tested for positive use and cross-actor spoof denial.

## Release controls
- Keep #250 and #268 draft/unmerged.
- Do not run production migrations, mutate catalogue data, change roles/grants, deploy or activate the catalogue.
- PayFast work remains paused pending sandbox access.
- Legal-document approval work remains parked until core systems are stable.
- No production action was taken as part of this work.

## Next
1. Implement gateway-owned capability list/create/update/transition operations, deriving admin identity from verified JWT subject.
2. Route resource API admin capability endpoints through the gateway when configured, with fail-closed/no-legacy-fallback behavior.
3. Change capability governance SQL functions to require `ghm.assert_actor_gateway` and grant EXECUTE only to `ghm_actor_gateway` after the HTTP caller is migrated.
4. Add actual disposable `ghm_runtime` spoof-denial tests for all three functions, positive gateway tests, and repeat full CI.
5. Reconcile #243 supplier-classification actor binding and compatibility separately; keep #244 stacked until dependencies and entitlement/metric semantics are resolved.


## Actor Gateway implementation follow-up (draft PR #269) — 2026-11-10

The capability governance API now has a gateway-backed implementation path:
- Added gateway-only PostgreSQL wrappers for list, create-draft, update-draft and lifecycle transition. Each calls `ghm.assert_actor_gateway` and verifies that the token-derived active account is an administrator/system administrator.
- Gateway wrappers are executable by `ghm_actor_gateway` only; `ghm_runtime` is explicitly denied access to these new wrappers.
- Added typed gateway reader and HTTP endpoints. The gateway derives actor identity from verified ES256 JWT `sub`; no actor ID is accepted from the request body or query.
- Added an API client and optional `GHM_ACTOR_GATEWAY_URL` routing for all four admin operations. Gateway errors fail closed without a fallback. The environment variable is optional for staged rollout; until configured, the pre-existing runtime path remains active.
- Brought the previously merged Actor Gateway foundation migrations and runtime files into this stacked branch, followed by capability invariant migration #24000 and gateway capability migration #25000.
- Added HTTP-level test coverage for token-subject binding and a client test for bearer-token forwarding/fail-closed behavior. The capability disposable PostgreSQL qualification now verifies that `ghm_runtime` cannot execute the new gateway-only wrappers.

**Important remaining cutover gate:** the legacy `ghm_runtime` EXECUTE grants on the original three SECURITY DEFINER capability functions are intentionally still present in the existing #250 migration. Therefore this work adds a safe gateway path but does not yet eliminate direct actor-ID spoofing through those legacy RPCs. Do not merge/enable capability governance until a separately reviewed cutover migration revokes those legacy runtime grants after the API is deployed with `GHM_ACTOR_GATEWAY_URL` set, and exact-head disposable PostgreSQL tests prove direct `ghm_runtime` invocation is denied for all three original RPCs while gateway operations pass.

No production migration, role/grant mutation, gateway service, environment variable, deployment or catalogue activation was performed. Exact-head CI is pending.

## Gateway principal qualification expansion — 2026-11-10

- CI now provisions a dedicated `ghm_actor_gateway` login with `LOGIN NOINHERIT`, an isolated credential, and a separate `GHM_ACTOR_GATEWAY_DATABASE_URL`; it is not granted membership in `ghm_runtime` or vice versa.
- Capability PostgreSQL qualification now requires three distinct runtime, gateway and migrator connection URLs.
- Added assertions that runtime cannot `SET ROLE ghm_actor_gateway` and gateway cannot `SET ROLE ghm_runtime`.
- Added real database positive tests for gateway capability listing, draft creation, draft update and lifecycle transition, plus non-admin gateway listing denial.
- Added checks that runtime cannot execute the gateway-only capability wrappers. The legacy capability RPCs still retain runtime EXECUTE grants; this is deliberately not described as a completed cutover.
- CI will run against the updated capability branch. No passing status is claimed until exact-head workflow completion.
- Production cutover remains separate: deploy/configure the API with `GHM_ACTOR_GATEWAY_URL`, verify routing, then separately revoke the three legacy runtime grants with direct SQL denial tests. Do not apply that migration or alter production grants here.
