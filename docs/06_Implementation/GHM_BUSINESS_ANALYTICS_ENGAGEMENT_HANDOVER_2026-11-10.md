# GHM Business Engagement and Analytics — Handover

**Date:** 2026-11-10  
**Repository:** `zaidhqdev-sys/GHM`  
**Branch:** `feat/ghm-business-analytics-engagement-20261110`  
**Base:** `feat/connect-marketplace-supplier-contract-ghm-20261110` (stacked on Marketplace supplier-classification PR #243)  
**Status:** implementation committed; exact-head CI pending. No production migration, deployment, merge, or cutover.

## Objective

Replace Connect's legacy Supabase `record_business_engagement_event` and `get_business_analytics_dashboard` calls with first-party GHM APIs and PostgreSQL-owned aggregation.

## Implemented

- Add `ghm.business_engagement_event`, append-only event storage with bounded event vocabulary/context, actor identity from verified GHM auth context, and least-privilege runtime insert/select grants.
- Add authenticated `POST /api/v1/business-engagement-events`; caller cannot choose actor/account ID.
- Record only currently active, verified, approved businesses; active members of the target Business cannot generate self-engagement events.
- Enforce a per-account 60-events/minute transactional rate limit using an advisory lock and count check.
- Add `GET /api/v1/businesses/:businessId/analytics?days=7|30|90`.
- Dashboard aggregation is server-side from canonical GHM engagement events, Enquiries, and Project Quotes; no client-side invented metrics.
- Analytics requires an active owner/administrator membership and an active commercial subscription entitlement named `business.analytics`.
- Add service, repository, router, registry, and migration contract tests; add CI branch coverage for this stacked PR.

## Metric mapping

| Connect dashboard field | GHM source |
|---|---|
| profile views / calls / WhatsApp / quote requests / website / directions / saves / shares | `ghm.business_engagement_event` |
| leads | `ghm.enquiry` |
| quotes | `ghm.project_quote` |
| projects won | accepted Project Quotes |
| conversion rate | accepted Project Quotes ÷ Enquiries |
| recent activity | latest five engagement events |

The legacy Connect metric label “leads” maps to canonical GHM Enquiries. “Projects won” currently maps to accepted Project Quotes because the existing GHM project lifecycle does not expose an independent won state in this contract. This semantic mapping requires product review before cutover.

## Explicit safety and parity gates

1. **Entitlement catalogue:** analytics fails closed unless the Business's active GHM commercial plan version includes `business.analytics`. This change does not seed or infer that entitlement. Before production release, reconcile the commercial plan/entitlement catalogue and add the entitlement only through an approved migration. Do not grant it broadly or bypass the gate.
2. **Anonymous engagement:** writes are authenticated-only. Anonymous public profile views are not counted in this iteration; do not add anon writes until abuse prevention, privacy, retention and rate-limit design are approved.
3. **Business IDs:** Connect must pass canonical GHM Business IDs, not legacy Supabase UUIDs.
4. **Metric parity:** review the Enquiry/Lead and accepted-Quote/Project-won mapping with product owner.
5. **Migration:** apply only to disposable CI PostgreSQL for now. No live database mutation is authorized.

## Validation plan

- Build and full test suite.
- Apply full migration chain to disposable PostgreSQL 18.
- Run migration audit and runtime boundary verification.
- Confirm route authorization, membership/entitlement denial, event eligibility, self-engagement rejection, and rate limit.
- Exact-head CI must pass before PR review.

## Current release boundary

No production migration, provider activation, environment change, deployment, merge or cutover. This is a draft backend implementation stacked on GHM Marketplace PR #243; merge order and final base must respect that dependency.


## CI iteration log — 2026-11-10

- Initial PR CI run #2308 (run ID `42736810915`) stopped at TypeScript build before migrations/tests.
- Error 1: migration contract test used `import.meta.url`, unsupported by the repository's CommonJS TypeScript build. Fixed by resolving the migration path from `process.cwd()`.
- Error 2: route validation did not narrow `number` to the supported period union `7 | 30 | 90`. Fixed by narrowing after the allowlist check.
- Follow-up branch head: `f8552589a88a33543df26b1f005144c0361bbac1`.
- Exact-head CI rerun is pending. No migration was applied in the failed run; no production changes.


## Disposable PostgreSQL qualification added

- Added `scripts/qualify-business-analytics-engagement-postgres.mjs`, restricted to `NODE_ENV=test` and exact disposable database identity.
- Uses separate `ghm_runtime` and `ghm_migrator` identities.
- Exercises an authenticated viewer event write, rejects self-engagement from an active Business owner, verifies the 60/minute account-wide event limit, and verifies Analytics fails closed when the Business has no active `business.analytics` entitlement.
- Wired as `npm run qualify:business-analytics-engagement` immediately after migration application in CI.
- This is a disposable PostgreSQL qualification only. No production DB has been accessed or mutated.
- Latest branch commit at this documentation update: workflow also runs on feature-branch pushes, so future exact-head validation does not depend on a stacked-PR target filter.
