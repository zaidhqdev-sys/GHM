# Connect Marketplace Supplier Classification — GHM Handover

**Date:** 2026-11-10  
**Repository:** `zaidhqdev-sys/GHM`  
**Branch:** `feat/connect-marketplace-supplier-contract-ghm-20261110`  
**Base checkpoint:** `ce1e7bcd28f8ccaaebc0b45f1cadc0b8f94b0ec6` (GHM main at branch creation)  
**Status:** implementation in progress; draft PR/CI pending at document creation.

## Objective

Move Connect Marketplace's production business listing reads from Supabase to GHM while preserving its supplier/contractor toggle and existing public-directory eligibility rules.

## Implemented in this branch

- Added canonical `ghm.business.is_supplier` with a false default. Existing non-null values are preserved; null legacy values become false (contractor).
- Added `ghm.update_business_supplier_classification(accountId, businessId, isSupplier)`, a narrow SECURITY DEFINER function. It requires an active owner/administrator membership, validates inputs, uses a fixed search path, revokes PUBLIC execution and grants execution only to `ghm_runtime`.
- Extended authenticated Business Identity and PATCH `/api/v1/businesses/:businessId` with owner-managed boolean `isSupplier`. The repository uses the new narrow function inside the existing tenant transaction; it does not grant direct table UPDATE to the browser/runtime.
- Exposed `isSupplier` in public Business profile and Directory projections.
- Extended the anonymous public Directory query with strict `businessType=suppliers|contractors`. Repository filtering is on canonical `ghm.business.is_supplier` and composes with the existing active + verified + approved visibility predicate.
- Added service, HTTP, and migration/security contract tests; included the new tests in `npm test`.
- In Connect, `marketplaceService.js` now delegates listing to the existing GHM public directory client. Direct Supabase table access was removed from this active Marketplace caller. Connect tests cover the supplier filter mapping and reject a Supabase dependency.

## API contract

- Public read: `GET /api/v1/public/businesses?businessType=suppliers`
- Public read: `GET /api/v1/public/businesses?businessType=contractors`
- Owner/administrator write: `PATCH /api/v1/businesses/:businessId` with `{"isSupplier":true|false}`
- Public profile and directory payloads include `isSupplier`.

Supplier/contractor is a self-managed Marketplace classification only. It is not evidence of a verified capability, insurance, quality, Trust score, or approval.

## Known parity gap: featured listings

Current GHM main does not publish an authoritative `isFeatured` field or a governed feature/unfeature workflow. The legacy Supabase Marketplace sorted `is_featured` before rating. Connect preserves a featured-first client ordering when GHM eventually returns an authoritative `isFeatured`, but current GHM responses do not contain it; current ordering is therefore rating-first. Do not invent or infer featured status from Trust, verification, paid tier, directory review, or supplier classification. A separately authorized canonical GHM feature-selection contract and reviewed data disposition are required to restore featured ordering faithfully.

## Validation and safety

- Exact-head CI has not yet been checked at the time of this handover; use the workflow run tied to the final PR head.
- CI should apply all migrations to disposable PostgreSQL, compile TypeScript, run the full suite and migration audit.
- No production DB migration, production data change, provider/secret/config change, deployment, merge or cutover was performed.
- Do not apply the migration to production from this PR. Existing production legacy columns/data and the canonical GHM target require the separately governed migration audit/release process.

## Next steps

1. Complete GHM exact-head CI and review any failures.
2. Run the Connect exact-head quality workflow after the updated Marketplace client and contract tests.
3. Review production-like migration compatibility for existing legacy `is_supplier` values; do not mutate production as part of this code PR.
4. Define a governed featured-listing contract and source-of-truth/data disposition.
5. Continue the remaining Supabase removal register: Analytics, Relationships/Outcomes, Onboarding, Commercial/Admin, AI, notification/push, central facade/SDK/config and all other active callers.


## CI iteration log — 2026-11-10 01:06 UTC

- First exact-head CI run #2297 (ID `42732406656`) completed: TypeScript build and all migrations on disposable PostgreSQL passed; the full test suite failed on three stale deep-equality expectations after adding the optional `businessType` query property.
- Failures were limited to two public Directory HTTP test expectations and one Directory service normalization expectation; no migration, build, or supplier classification assertion failed.
- Updated those tests to assert `businessType: undefined` when no filter is supplied.
- Follow-up exact-head CI run #2299 (ID `42732701547`) was in progress after these corrections. Check its final status before treating the branch as qualified.
- The Connect PR quality run #172 failed only because the new Marketplace adapter test expected page size 75 while the adapter correctly caps requests at GHM's 50-item public Directory maximum. Corrected the test to expect 50; a fresh Connect exact-head run is pending.


## Second CI iteration and PostgreSQL qualification — 2026-11-10 01:10 UTC

- Follow-up run #2299 (ID `42732701547`) applied migrations and built successfully but the full suite still had one stale assertion: the anonymous directory-default HTTP test did not include `businessType: undefined` in its expected service input.
- Corrected the final expectation in commit `da30cedac7649c3c69238bc7f884eccc4d36b997`.
- Added `scripts/qualify-business-supplier-classification-postgres.mjs`: uses separate `ghm_runtime` and `ghm_migrator` identities, creates disposable owner/member fixtures, verifies default contractor value, owner supplier/contractor updates, member denial, null rejection, and cleanup.
- Added npm script `qualify:business-supplier-classification` and CI step immediately after disposable migration application.
- Qualification script is restricted to `NODE_ENV=test` and checks exact disposable database identity. It is not a production migration or production qualification.
- New exact-head CI after the final test and qualification wiring commits is pending; verify its final result before claiming pass.
