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
