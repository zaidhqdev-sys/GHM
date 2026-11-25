# GHM handover — public Directory filter compatibility
Date: 2026-11-25

## Objective
Keep the existing Connect Marketplace behavior while replacing its Supabase backend dependency with GHM. This is a narrow compatibility correction, not a redesign or new product gate.

## Source finding
- GHM main public directory route in src/http/app.ts previously allowed q/category/province/city/geo/sort/page/pageSize but rejected businessType.
- The Directory contract and PostgreSQL repository already support businessType: suppliers|contractors; the repository filters canonical ghm.business.is_supplier.
- GHM PR #243 contained route-parser support and HTTP tests, but remains draft/unmerged and stacked with other work. Do not merge it wholesale for this isolated fix.
- Connect's active Marketplace listing still queries Supabase and preserves approved + verified + active visibility, search, category, province, supplier/contractor filter, count, and ordering by featured then rating then creation date.

## Implemented in this focused branch
Branch: fix/public-directory-business-type-filter-20261125
- src/http/app.ts: allow businessType; validate exactly suppliers or contractors; pass it to Directory service.
- src/http/app.test.ts: cover supplier query parsing, contractor query parsing and rejection of unknown values.
- Code commits:
  - 268802d0d8cf1bf92a7c95673442748530f9e4d4 — route compatibility.
  - 3b19843c10ea539115faf4bfda0aeb5a126c76d3 — HTTP contract coverage.
- Draft PR: #308.

## Remaining parity before Connect Marketplace listing cutover
Legacy Marketplace orders is_featured DESC, rating DESC, created_at DESC. Current GHM Directory repository orders by rating/review count (or requested supported sort); it has no canonical featured projection or governed feature/unfeature workflow. Do not infer featured status from Trust, verification, subscription, review or supplier classification. This remains a real product-parity gap to resolve from the pre-GHM baseline, not a reason to redesign the Marketplace.

## Validation boundary
- Route and regression test changes are committed.
- No local full GHM test suite or exact-head CI result is claimed.
- No production runtime verification has been performed.
- Existing GitHub Actions allowance limitation remains documented; do not blindly rerun while exhausted.

## Safety / scope
No production DB migration, production data mutation, Render deployment/configuration, secrets, service creation, paid infrastructure, PayFast activation or Connect cutover was performed. Existing branches and PRs #243/#244, Connect #68/#70/#71 remain untouched.
## 2026-11-25 — Featured listing parity investigation

Rechecked current Connect main and GHM main before continuing.

### Original Connect behavior confirmed
- Connect main `84d7edb64346f1b698f9b76bcb54d2e653df1292`, `src/features/marketplace/marketplaceService.js`: public listing selects approved, verified and active businesses; optional search/category/province/supplier filter; exact count; order is `is_featured DESC`, `rating DESC`, `created_at DESC`.
- Connect main `src/supabase/supabase_schema.sql`: Business columns include `is_featured boolean default false` and `featured_until timestamptz`. The Business tier enum also contains `featured`, but this is not equivalent to the listing flag and must not be substituted.
- Marketplace UI consumes `business.is_featured` to mark featured cards. This is observable product behavior, not merely an internal sort preference.

### GHM main behavior confirmed
- GHM `src/resources/directory/repository.ts` selects canonical business fields and filters `is_supplier`; no `is_featured` or `featured_until` projection, active feature lifecycle or featured-first ordering is present in this repository.
- GHM `DirectoryQuery` supports supplier/contractor filtering but has no featured filter/order contract.
- PR #308 only repairs HTTP parsing for businessType. It does not deliver featured parity.

### Next required backend work
- Inspect canonical GHM Business schema/migrations and existing admin/owner governance before choosing where a featured flag and expiry belong. Do not infer or copy the legacy Supabase value into production without a source-of-truth migration plan.
- Preserve `is_featured` display data and `featured_until` expiry semantics in the GHM public Directory response; expired features must not remain featured.
- Preserve featured-first ordering, then rating, then creation time, with stable pagination and count.
- Find the existing legitimate authority that sets/unsets featured status. Do not create a browser-writable flag or grant ordinary Business owners/admin clients direct DB mutation.
- Once GHM endpoint and authority exist, update Connect Marketplace client and UI mapping, remove Supabase listing reads, and add exact contract coverage.

### Current status
- Investigation only; no featured schema or write API has been added yet.
- No GHM PR #308 merge, Connect Marketplace cutover, DB migration, production data write, deploy or service change.
- Keep PR #308 draft until its exact-head CI is available and then integrate it with the smallest safe change.
## 2026-11-25 — GHM Business authority and feature-field audit

Inspected the current GHM main Business Identity and Directory contracts/repositories to identify the safe source for featured status.

### Confirmed source facts
- `src/resources/business-identity/contracts.ts` defines BusinessVerificationStatus and BusinessIdentity, but BusinessIdentity has no featured flag or expiry field.
- `BUSINESS_PROFILE_PROTECTED_FIELDS` explicitly includes `is_featured`; ordinary owner-managed Business profile updates must not control this field.
- `src/resources/business-identity/repository.ts` selects canonical `ghm.business` fields including is_active, is_supplier and verification_status, but no featured state/expiry.
- `src/resources/business-identity/service.ts` permits public visibility only for active businesses with verificationStatus `approved`; there is no feature-management operation or lifecycle in this service.
- `src/resources/directory/contracts.ts` and `src/resources/directory/repository.ts` expose supplier filtering and rating/review/newest/distance ordering, but no feature projection or featured-first ordering.
- The `PublicBusiness` contract similarly has no `isFeatured` property.

### Authority conclusion
`is_featured` is explicitly protected from ordinary profile updates. No existing GHM feature/unfeature authority or expiry lifecycle was found in the inspected Business Identity and Directory source. Do not add a public owner-editable field, infer it from `tier`, or assume that a legacy `featured_until` column exists in GHM. The canonical DB migration/schema and admin authority must be verified before adding SQL that references feature columns.

### Implementation decision
No speculative schema or SQL was added. The next safe step is to identify the canonical GHM migration that creates `ghm.business` and inspect any existing privileged/admin capability pathway. Then add the smallest governed feature lifecycle (if no existing one is present), expose effective featured state, and preserve featured-first ordering. If no existing authority is available, use the existing GHM capability governance design rather than bypassing it.

### Scope status
PR #308 remains a route-parser compatibility fix only. It does not close featured parity. No DB schema change, migration, new admin endpoint, production data write, deployment, or Connect Marketplace cutover was made.
## 2026-11-25 — Canonical Business schema and promotion-authority source verification

Used the recursive GHM main Git tree to identify the exact canonical migration files (rather than guessing migration names).

### Canonical schema facts
- `database/migrations/20260909150000_create_business_identity.sql` creates `ghm.business` with name, slug, verification_status, is_active and timestamps. It does not define is_featured or featured_until.
- `database/migrations/20261105230000_create_founder_directory_review.sql` adds directory review metadata, a dedicated founder reviewer allowlist, immutable review events and SECURITY DEFINER submit/list/decision functions.
- `database/migrations/20261109140000_close_evidence_and_founder_review_authority.sql` explicitly disables Founder directory review: `ghm.is_directory_listing_founder_reviewer()` always returns false and runtime execution is revoked from the review submit/list/decision functions. `src/http/directory-review-router.ts` also returns deterministic 403 for these endpoints.
- `database/migrations/20261110160000_add_admin_capability_catalogue_governance.sql` permits active system administrators to govern Capability taxonomy drafts/lifecycle only. It is not a general Business promotion authority and must not be reused to mutate featured listing state.
- `docs/architecture/CONNECT_FOUNDER_DIRECTORY_REVIEW_GHM_CONTRACT.md` explicitly states Founder review authority is separate from general system-admin status and that the contract is proposal-only / not qualified.

### Original Connect promotion facts
- `supabase/migrations/20260718130542_establish_directory_business_contract.sql` defines `tier` and protected `is_featured` on `public.businesses`; its comments say `is_featured` is protected promotion state and client owners cannot mutate it.
- That migration explicitly deferred subscription/payment-controlled promotion. Do not infer that any business should be featured because of a plan, subscription, review, verification or trust score.
- The Connect source audit previously recorded `featured_until`, but its exact migration and active write authority have not yet been verified from the complete Supabase migration history. Treat expiry as an unverified legacy contract detail until located; do not add a GHM column based only on the earlier summary.

### Implementation consequence
There is currently no qualified GHM authority for changing featured promotion state. Founder directory review is disabled and is a different business process; Capability catalogue admin functions are unrelated. Do not add a new promotion mutation using either path or expose is_featured to owners. The next step is to establish whether any live Connect workflow actually writes is_featured/featured_until and inspect the complete legacy migration history / database contract. If no active writer exists, preserve the effective existing read state during migration without inventing new commercial promotion controls. Keep PayFast/payment activation out of scope.

### Current delivery status
PR #308 remains the isolated supplier/contractor query parser fix. This investigation made no schema or application code changes, did not add a feature lifecycle, and did not cut over Connect Marketplace. No production database, data, deployment, secrets or paid service changed.
## 2026-11-25 — Legacy featured-state writer audit completed

Connect main complete tree and code search confirms no active application writer for `is_featured` and no active use of `featured_until`.

- Connect migration `20260718130542_establish_directory_business_contract.sql` adds protected `is_featured boolean not null default false`, creates featured-first indexes, and states subscription/payment-controlled promotion is out of scope.
- Connect migration `20260825190000_remediate_businesses_registration_number_column_privileges.sql` grants `is_featured` SELECT only; no client UPDATE grant is made.
- Across all 45 tracked Supabase migrations and all code search hits, there is no feature/unfeature RPC, application write path or expiry lifecycle. The only active behavior is read/projection, featured-first ordering and UI display.
- `featured_until` occurs only in the checked-in schema snapshot; no active Marketplace query, reader, writer or migration uses it. Do not carry it into GHM as an active behavior.

Therefore GHM needs no new promotion authority to preserve the behavior that actually exists. Add only protected `is_featured NOT NULL DEFAULT false`, public read projection and featured-first ordering. No write path. Fresh GHM Businesses default false; legacy values cannot be presumed or imported from the unavailable Supabase database. Do not add Founder review, commercial plan or PayFast dependency.

Next change is a narrow GHM schema/Directory contract implementation, followed by Connect Marketplace caller cutover. No production changes were made in this audit.
## 2026-11-25 — Protected featured Directory parity implementation

Implemented on this focused branch after the legacy writer audit established that the original product only reads protected featured state; there is no active feature/unfeature writer or expiry behavior.

### Code changes
- Migration `20261125010000_add_protected_business_featured_directory_order.sql`: adds `ghm.business.is_featured BOOLEAN NOT NULL DEFAULT false` and a partial public-directory ordering index for active, verified, approved Businesses. No write function, owner grant, promotion workflow, payment rule or expiry field is added.
- `PublicBusiness` adds optional `isFeatured` and the public Business repository maps the canonical database flag.
- Directory repository selects and maps `is_featured`; featured Businesses remain first for default rating, newest, reviews and distance sort modes. Existing visibility filters, supplier/contractor filters, count and pagination remain intact.
- Migration contract tests verify default/protected field boundary, public projection and featured-first order. They are included in `npm test`.

### Safe defaults and data
New Businesses default to not featured. No historical values are imported because the legacy Supabase database is unavailable and owner has accepted fresh signup. No GHM write authority is created.

### Validation status
Source changes and regression contract tests are committed. Full local build/test and exact-head CI have not yet been run. Do not claim production qualification. No production migration or deployment has occurred.


### Final source review — 2026-11-25
- Rechecked the exact branch source after implementation. The migration, public Business projection and Directory projection all include the protected flag; the HTTP route passes the optional businessType value through.
- Corrected the pagination-default HTTP test expectation to include `businessType: undefined`, matching the expanded route contract.
- Added `src/db/business-featured-directory-migration-contract.test.ts` and included it plus the Directory service test in the package test command.
- Latest source commit at this handover update: `7633f4f6ca6cb085c8e0496bfa0e6a56e3ca67b2`.
- Validation remains unrun locally; GitHub Actions allowance remains exhausted. This is source-complete but not build/test/production-qualified. No migration was run against any database.


### Follow-up package/test hygiene — 2026-11-25
- Removed a duplicate invocation of `dist/resources/directory/service.test.js` from the `npm test` script; the existing single invocation remains and the new featured migration contract test remains included.
- This is a script de-duplication only. No runtime or migration behavior changed.


### Exact-head CI diagnosis and correction — 2026-11-25
- Inspected GitHub Actions run `45515122239` and downloaded its `ghm-test-suite-diagnostics` artifact. Build succeeded; disposable PostgreSQL migration and qualification setup completed; the web-quality job passed.
- Test suite result: 1,090 passed / 1 failed. The sole failure was the pre-existing anonymous Directory HTTP route test at `src/http/app.test.ts:126`: its expected query object omitted the newly added optional `businessType: undefined` property. This was a test expectation mismatch, not a runtime Directory behavior failure.
- Corrected that exact assertion in commit `c0587bc016729f0923c0e17ee740dbe10e98a112`. The separate pagination-default assertion already included the property.
- Do not rerun Actions until the included allowance is available; this run did start and execute jobs (unlike the earlier allowance-blocked attempts). The correction is not yet revalidated.
- No source change to Connect Marketplace was needed for caller cutover: the existing PR #68 branch already routes Marketplace listing reads through the GHM Directory client and maps `isFeatured` to the existing card field. Its branch is 186 commits ahead and 1 behind main, and overlaps PR #70; do not merge it wholesale or duplicate its work.


### Duplication check against existing supplier-classification work — 2026-11-25
- PR #272 is already merged into GHM main. It supplies the Actor Gateway foundation and protected supplier-classification write boundary. This work was not recreated in PR #308.
- GHM main already contains `DirectoryQuery.businessType` in `src/resources/directory/contracts.ts` and canonical `is_supplier`; however, main's HTTP route did not parse/pass `businessType`, and its Directory repository did not apply the filter. PR #243 contains the broader supplier-classification + filter implementation but remains draft/unmerged and is based on an older stacked history.
- PR #308 intentionally carries only the missing current-main HTTP query parsing and Directory repository predicate, not the supplier schema, supplier write API, Actor Gateway or Connect Marketplace client migration. This avoids importing the large/obsolete PR #243 stack and avoids duplicating #272.
- Connect PR #68 already has the Marketplace GHM Directory caller and card mapping. No second Marketplace caller migration is required. The #308 dependency is only the current-main GHM endpoint parity (businessType filtering plus protected featured projection/order).
- Mainline branch audit: GHM #308 is 18 commits ahead / 0 behind main at its base; Connect #68 is 186 ahead / 1 behind and overlaps #70; Connect #70 is 31 ahead / 0 behind; QuoteFlow #25 is 253 ahead / 0 behind. Do not merge Connect #68 wholesale or recreate #70/#25 work.
- GHM #308 exact-head run #5771 (run ID `45515122239`) built, completed the disposable migration/qualification setup and passed web-quality, but the main test suite failed only on the anonymous Directory route expectation missing `businessType: undefined` (1,090 passed / 1 failed). Corrected in `c0587bc016729f0923c0e17ee740dbe10e98a112`. The follow-up run #5772 (run ID `45515788327`) was cancelled during container initialization before checkout/tests; it is not validation. The fix remains unverified.
- Inspection of current-main `public-repository.ts` confirms its shared public-business column projection includes the new field only on the PR branch; Directory query selects and maps it on the PR branch. Owner profile update inputs do not include the field.


### Connect caller-to-GHM backend coverage audit — 2026-11-25
Audited existing Connect PR #68 GHM clients against GHM main routes/resources to avoid duplicate endpoints.

**Existing GHM implementations found:** Directory (subject to PR #308); Relationships/Outcomes; Onboarding Progress; Notifications; Commercial offer/access/subscription/admin launch-state; Trust Score; Storage/Business Logo. Their source existence does not establish live production readiness.

**Confirmed missing GHM endpoints/resources:**
- Connect `ghmBusinessAnalyticsService` calls `GET /api/v1/businesses/:businessId/analytics?days=7|30|90`; current GHM main has no analytics router, resource, migration or analytics-named source artifact.
- Connect `ghmBusinessEngagementService` calls `POST /api/v1/business-engagement-events`; current GHM main has no engagement router, resource, migration or engagement-named source artifact.
- These are existing Connect clients/UI, not requests for new product features. The missing backend endpoints are genuine cutover gaps.
- Existing AnalyticsScreen expects `business_id`, `period_days`, engagement profile_views/calls/whatsapp_clicks, leads, quotes, projects_won, conversion_rate and recent_activity with `id/event_type/occurred_at`.
- Existing engagement client accepts event types profile_view/call/whatsapp/quote_request/website_visit/direction_request/save/share, sources web/mobile, and bounded context keys visitor_id/campaign/referrer/surface. Supabase migration history documents 24-hour profile-view deduplication and the profile_views aggregate counter.
- Before implementing these GHM resources, recover exact original Supabase table/function definitions and inspect active callers. Preserve semantics; do not trust client-supplied account IDs or invent metrics. No historical Supabase event import is required; fresh GHM events accumulate after cutover.


## 2026-11-25 — Existing Connect Analytics and Engagement contracts ported to GHM

### Duplicate-work investigation
- Recovered Connect's authoritative migration `supabase/migrations/20260727010000_reconcile_core_production_runtime_contracts.sql`. It already defines the canonical append-only `business_engagement_events` contract, allowlisted event types, 24-hour profile-view deduplication follow-up, denormalized profile-view counter, and deterministic `get_business_analytics_dashboard` projection.
- Confirmed that this migration explicitly retires the older `analytics_events`, `lead_tracking`, and `business_analytics` assumptions. The old schema snapshot is not the authoritative implementation. No legacy analytics table is being recreated.
- The GHM main branch had no corresponding analytics or engagement resource/router/migration. This PR adds the missing backend counterpart; Connect's existing clients and UI remain unchanged.

### GHM implementation added
- Migration `20261125020000_add_business_engagement_analytics.sql`: append-only Business engagement facts, bounded context and event vocabulary, web/mobile source, visitor-scoped 24-hour profile-view deduplication, and a canonical `ghm.business.profile_views` counter updated by an insert trigger.
- Resource `src/resources/business-analytics/`: typed contracts, validation service and PostgreSQL repository.
- HTTP `src/http/business-analytics-router.ts`: public engagement event recording with optional verified GHM authentication; actor account is derived only from verified middleware context and never from request payload. Analytics read is authenticated and validates 7/30/90-day periods.
- Analytics uses GHM Enquiries for lead counts and GHM Project Quotes for submitted/accepted quote counts, matching the legacy dashboard projection's canonical facts. No invented metrics or historical Supabase data import.
- Wired the resource and routes into the existing GHM Resource API app; no new service or infrastructure.
- Added service and HTTP regression tests and included both in `npm test`.

### Security and compatibility notes
- Active Business visibility is required before public engagement events are recorded.
- Analytics reads require active owner/administrator Business membership.
- Event vocabulary is restricted to profile_view/call/whatsapp/quote_request/website_visit/direction_request/save/share; source is web/mobile; context keys are bounded to visitor_id/campaign/referrer/surface.
- Profile views are deduplicated per Business/visitor for 24 hours; repeated views return HTTP 204 and do not increment the counter.
- No historic event rows are imported because Supabase is unavailable. Fresh GHM events start accumulating after deployment.
- No production migration, Render deployment, production cutover, payment activation, or new paid infrastructure occurred.

### Validation
- New source and tests are committed on PR #308. Exact-head CI run #5783 (ID `45517222291`) is pending at the time of this handover update. Do not claim build/test success until its jobs complete.
- Previous #5774 was cancelled before completing its quality job and is not validation of these changes.


### Final test inventory and CI allowance status — 2026-11-25
- Added `src/db/business-analytics-migration-contract.test.ts` to verify canonical event vocabulary, bounded context, Business-scoped 24-hour deduplication, profile-view counter trigger and GHM account actor reference.
- Added `src/resources/business-analytics/service.test.ts` and `src/http/business-analytics-router.test.ts` to the standard `npm test` script.
- Exact-head CI run #5783 (`45517222291`) was cancelled before any jobs initialized (empty jobs result). It is not a source test failure and does not validate this implementation. The included Actions allowance/runner restriction remains the reason exact-head CI cannot presently qualify this change.
- Latest code/test commit: `45a51f8653d89a76f4d63902b258632397a1f538`; latest handover commit: `a284f5fadedf4b54a03c9de4770960c1f5dca56b`. The test-only package update is later than that handover commit and is recorded here.
- PR #308 remains draft and must not be merged/deployed until validation can run. No production migration or runtime deployment has occurred.


### Final source review — 2026-11-25
- Reviewed the final HTTP route, app registration, repository and migration after the test additions. The GHM engagement endpoint accepts anonymous visitors and optionally authenticates supplied bearer tokens; invalid supplied tokens fail authentication. The actor account is never accepted from the event payload.
- Visitor dedupe keys are stored as bounded text so authenticated GHM numeric account IDs can use an `account:<id>` key without lossy UUID coercion. Anonymous callers are deduplicated when the existing client supplies a visitor ID.
- Analytics uses only canonical GHM tables: `ghm.enquiry`, `ghm.project_quote`, and the new append-only event table. `projects_won` follows the recovered legacy dashboard's accepted Project Quote count semantics.
- Simplified the dedupe transaction block in commit `4b291555b1f0ab99ad7a558021ec85519ea72ab1`. This is a source-only cleanup; no behaviour change.
- Latest source commit: `4b291555b1f0ab99ad7a558021ec85519ea72ab1`. CI remains unavailable/cancelled before jobs initialized; no successful build/test claim.


### Latest exact-head workflow attempt — 2026-11-25
- After the final source/handover update, GHM CI run #5787 (`45517540928`) was cancelled before jobs initialized. No build, test, or migration qualification ran.
- Connect quality run #370 (`45517368838`) likewise has no step records or downloadable logs (`BlobNotFound`). It supplies no source-level failure diagnosis.
- Exact-head validation remains outstanding on both branches. No merge, production migration or deployment was performed.


### Follow-up source audit and correction — 2026-11-25
- Reopened PR #308 changed-file inventory and inspected the exact Directory, Analytics router/repository, migrations and tests; no duplicate Marketplace caller migration was created. Connect PR #68 already owns the Marketplace/Analytics/engagement clients; PR #70 owns the Project/Opportunity caller changes; QuoteFlow PR #25 remains the local-first identity transition.
- Confirmed PR #308 branch is 43 commits ahead / 0 behind GHM main at the current compare point. Its latest exact-head Actions run #5787 (45517540928) has no jobs; run #5783 (45517222291) likewise has no jobs. These are not passing validation and provide no code-level failure evidence.
- Source review found an eligibility mismatch: the new public engagement recorder checked is_active and verification_status='approved' but omitted is_verified=true, while the public Directory requires all three. Corrected src/resources/business-analytics/repository.ts to apply the same visibility predicate. Correction commit: e32f220ee166b915858842a7f87568d3c7d4f4c9.
- Remaining source-review items to qualify locally before merge: run full TypeScript/build/tests and disposable PostgreSQL migration chain; verify runtime DB role has required INSERT/SELECT/visitor UPDATE and column UPDATE grants; test trigger execution under actual runtime role; confirm accepted Project Quote status and Enquiry mapping against legacy analytics projection; test anonymous visitor dedupe and retention/cleanup behavior; confirm response shape exactly matches Connect Analytics screen. Do not infer these from contract tests alone.
- A source-only audit found no basis to merge or deploy. No production DB migration, deployment, production data change, paid infrastructure or payment activation occurred.


### GitHub allowance-aware audit — 2026-11-25
- Owner explicitly confirmed GitHub Actions allowance/runner limits remain in effect for approximately six more days. No Actions workflow was dispatched, rerun, or intentionally triggered during this work. Avoid PR pushes that auto-trigger Actions until the reset unless explicitly required; prefer read-only GitHub inspection and local validation in existing worktrees.
- Re-inspected the analytics migration and repository against the original Connect migration and later commercial-offer migration. The legacy analytics projection reads `public.leads` and `public.project_quotes`; GHM maps to `ghm.enquiry` and `ghm.project_quote`. This mapping still needs semantic qualification: verify Enquiry corresponds to the legacy Lead lifecycle and accepted Quote corresponds to the original `projects_won` meaning. Do not claim parity from matching column names.
- The later Connect commercial migration adds `business.analytics` entitlement to the dashboard RPC, but the backend transition's agreed free early-access path must not reintroduce a paid entitlement gate. Keep analytics available to authorized Business members during free early access; do not port the old Business Pro restriction.
- Original analytics authorization uses the `analytics.read` Business permission, not merely an assumed owner/administrator role check. Current GHM implementation limits dashboard access to active owner/administrator memberships. Verify the GHM membership/permission model and preserve intended authorized staff access; do not widen access without a policy mapping.
- Original engagement event source permits a bounded non-empty source string up to 80 chars; GHM currently narrows to `web` or `mobile`. Confirm actual active Connect caller values before changing or accepting this narrower contract.
- Original July 27 migration inspected here contains no 24-hour visitor-deduplication table/logic in the shown event function. Current GHM adds visitor dedupe. Treat the 24-hour rule as an application/other-migration contract only if confirmed in full history; avoid claiming it was defined by this migration alone.
- GHM event recorder public-Business eligibility now matches Directory: active, verified and approved (commit e32f220ee166b915858842a7f87568d3c7d4f4c9).
- Migration SQL grants runtime access to the event/visitor tables and limited Business counter columns; trigger execution under the actual `ghm_runtime` role, sequence usage and migration-chain execution still require local PostgreSQL qualification. No production DB access was used.
- No code changes beyond the eligibility correction were made in this pass. No workflow run was started, no merge/deployment occurred, and no production or paid infrastructure was changed.


### Follow-up compatibility audit — corrections from exact legacy source — 2026-11-25
- Re-read complete legacy membership foundation migration `20260721023613_establish_business_membership_foundation.sql`. Its `has_business_permission` grants `analytics.read` to owner and administrator, not ordinary member. GHM PR #308's active owner/administrator membership check therefore matches the legacy permission helper's effective role mapping. Earlier handover concern that this mapping was unresolved is closed; no role broadening is needed.
- Re-read complete original Analytics/Engagement migration `20260727010000_reconcile_core_production_runtime_contracts.sql` and later commercial migration `20260727233000_configure_south_african_offer_trial_activation.sql`. Original Analytics projection counts Leads by created_at, total Project Quotes by created_at, and accepted Project Quotes as `projects_won`; PR #308 maps these to `ghm.enquiry`, `ghm.project_quote`, and accepted quote status. The query shape matches, but production semantic equivalence still depends on GHM Enquiry lifecycle/schema parity and quote status mapping; keep this as a local fixture/data-contract test, not an unresolved guess.
- The later commercial migration adds `business.analytics` entitlement to the RPC. This is explicitly not to be carried into free early access; PR #308 currently has no commercial entitlement check, which is consistent with the agreed free-access objective.
- Original migration allows any trimmed source string of 1–80 characters. The active Connect PR #68 client currently sends only `web` or `mobile`, so GHM's narrower enum is compatible with the active caller today; note it as intentional bounded client contract, not a present mismatch.
- The inspected original engagement function contains no visitor dedupe. GHM's 24-hour dedupe is an additional behaviour, not a verified legacy compatibility requirement. It may remain only if it is harmless to current product metrics and its concurrency/expiry behaviour is tested; do not claim it reproduces a legacy requirement.
- No CI run, PR push, code change, merge, production DB operation, deployment or paid infrastructure change occurred during this audit. GitHub Actions allowance constraint remains active for approximately six more days per owner instruction.
