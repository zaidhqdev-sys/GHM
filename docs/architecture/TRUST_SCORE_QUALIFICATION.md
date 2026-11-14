# Trust Score Database Actor-Boundary Qualification — 2026-11-11

## Scope

This qualification covers the Trust Score calculation mutation only. It does not close the separate direct table-read boundary.

## Implementation

- Migration: `database/migrations/20261111150000_add_signed_trust_score_gateway.sql`
- Manual cutover: `database/cutovers/20261111150000_revoke_legacy_trust_score_runtime.sql`
- Actor Gateway reader: `src/actor-gateway/trust-score-reader.ts`
- Actor Gateway route: `POST /v1/trust-scores/:businessId/calculate`
- Resource API client: `src/http/trust-score-gateway-client.ts`
- Resource API route: `POST /api/v1/trust-scores/:businessId/calculate`
- Disposable qualification: `scripts/qualify-trust-score-gateway-cutover-postgres.mjs`

The gateway derives the actor from the verified GHM access JWT. The signed v2 assertion binds the actor, operation `trust.score.calculate`, and exact Business ID. The gateway-only SECURITY DEFINER wrapper verifies the assertion and invokes the existing calculation function with the verified actor. The original Business membership and calculation rules are preserved.

Production Resource API behavior fails closed when the gateway is unavailable or unconfigured. The legacy function remains available in non-production until the manual cutover is approved.

## Exact-head qualification — PASS

Implementation head: `34172a7057a56ed027a0baead9640a3a835f7b59`.

GitHub Actions [run #3198](https://github.com/zaidhqdev-sys/GHM/actions/runs/43094248583) completed successfully. Both `quality` and `web-quality` passed, including build, full automated test suite, complete migrations and disposable PostgreSQL Trust Score cutover qualification.

Explicit PostgreSQL log results:

- `MANUAL TRUST SCORE CUTOVER APPLIED TO DISPOSABLE POSTGRESQL: PASS`
- `RUNTIME LEGACY TRUST SCORE EXECUTE DENIED: PASS`
- `SIGNED TRUST SCORE CALCULATION + ACTOR PROVENANCE: PASS`
- `SIGNED TRUST SCORE TARGET SUBSTITUTION DENIED: PASS`
- `SIGNED TRUST SCORE ASSERTION REPLAY DENIED: PASS`
- `SIGNED TRUST SCORE ACTOR SUBSTITUTION DENIED: PASS`
- `RUNTIME TRUST SCORE GATEWAY EXECUTE DENIED: PASS`
- `TRUST SCORE POST-CUTOVER FUNCTION ACL: PASS`
- `GHM TRUST SCORE SIGNED GATEWAY QUALIFICATION: PASS`

The cutover was applied only to disposable localhost PostgreSQL using distinct runtime, Actor Gateway and migrator identities.

## Still open — direct reads

The earlier migration grants `SELECT` on `ghm.trust_score` to `ghm_runtime`. The application repository currently applies public visibility and owner/administrator membership predicates, but a direct database reader can bypass those application filters.

Do not revoke direct table SELECT until the public list/get projection and authorised-member read path are implemented and qualified. Preserve the existing public eligibility boundary (active + verified + approved) and the owner/administrator visibility rule.

## Production status

No production migration, permission change, secret change, service deployment or data mutation was made. The manual cutover remains unapplied in production. Production rollout still requires Render role-model resolution, a fresh independently verified production backup and explicit approval.


## Read-boundary replacement — implementation pending qualification (2026-11-11)

A follow-on implementation now adds signed `trust.score.read` member get/list wrappers, preserving active + verified + approved public visibility and active owner/administrator membership; public runtime get/list projections; and a manual cutover revoking runtime direct SELECT and sequence access. The Resource API authenticated GET routes forward the original bearer token through Actor Gateway, while public GET routes call the restricted public SQL projections. The disposable qualification runner now checks direct SELECT/sequence denial, member/private reads, unrelated-account denial and public projection filtering.

**Status: IMPLEMENTED / QUALIFICATION PENDING.** The calculation mutation PASS above is not sufficient to close the read boundary. Exact-head CI and disposable PostgreSQL read qualification are still pending. The expanded manual cutover must not be applied to production until those checks pass and separate production gates are satisfied.
