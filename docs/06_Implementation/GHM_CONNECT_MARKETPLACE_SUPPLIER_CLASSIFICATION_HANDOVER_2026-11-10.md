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


## Exact-head CI qualification — PASS (2026-11-10 01:12 UTC)

GHM CI run #2305 (ID `42733018770`) completed successfully on PR head `56ec40a4964d6308f3adfb470ac16e63b5394eef`.

All workflow steps passed:
- TypeScript build
- Full migration chain on disposable PostgreSQL 18
- New GHM supplier classification authorization qualification (owner can set supplier/contractor; active member is denied; null is rejected; fixture cleanup passes)
- Existing business registration, storage, Opportunity SQL, storage lifecycle and tenant authorization qualifications
- Full test suite
- Business Capability lifecycle/two-session replacement qualification
- Commercial payment settlement identity qualification
- Migration audit policy tests
- Runtime boundary verification

This qualifies the PR code on disposable CI only. It does not qualify or authorize applying the migration to production, changing live supplier data, deploying GHM, or cutting over Connect.


## Documentation follow-up CI — PASS

- GHM CI run #2306 (ID `42733223787`) passed on the documentation-updated PR head `9bc39e4d9d15eb870da2b8101fe6c565f3ac0871`.
- The full quality job passed again, including build, migration chain, supplier classification PostgreSQL qualification, full test suite, migration audit and runtime-boundary verification.
- This confirms the handover update did not break the branch. PR remains draft and no production changes occurred.


## Actor Gateway security remediation — 2026-11-10 (draft PR #270)

The original supplier-classification SECURITY DEFINER RPC accepted `p_account_id` from its caller and granted EXECUTE to `ghm_runtime`. A caller using the shared runtime database login could supply another active owner/admin ID. Application-level membership checks did not close this direct-RPC spoofing path.

The security branch adds the following remediation:
- Bring the isolated Actor Gateway foundation and its database principal guard into this stacked branch.
- Add `ghm.gateway_update_business_supplier_classification`, which calls `ghm.assert_actor_gateway` before invoking the existing membership-checked classification function.
- Revoke PUBLIC and `ghm_runtime` execution on the legacy supplier-classification RPC; grant the new wrapper only to `ghm_actor_gateway`.
- Add a gateway HTTP endpoint that verifies the GHM ES256 bearer token and derives the account ID only from its signed `sub`.
- Add the resource API gateway client. The existing Business PATCH contract still accepts an `isSupplier`-only update, but it is forwarded through the gateway; mixed profile + supplier updates are rejected rather than partially applied.
- Remove the direct supplier RPC call from the normal Business identity repository path. If gateway routing is not configured, supplier updates fail closed with 503; they do not fall back to the legacy SQL function.
- Extend disposable PostgreSQL qualification to use distinct `ghm_runtime`, `ghm_migrator`, and `ghm_actor_gateway` credentials. It proves the runtime cannot execute either the legacy RPC or gateway-only wrapper, while the gateway role can update as an owner and cannot update as an ordinary member.
- Add HTTP token-subject binding tests, client forwarding/failure tests, config-origin validation, and CI role provisioning.

**Deployment/cutover ordering (not yet performed):**
1. Provision the isolated `ghm_actor_gateway` login and deploy the Actor Gateway service with only its DB credential and ES256 public verification keys.
2. Configure the resource API's `GHM_ACTOR_GATEWAY_URL` and deploy the API version that routes supplier updates through the gateway.
3. Apply the gateway principal and supplier cutover migrations to the approved target only after the gateway and API are verified. The cutover migration revokes direct `ghm_runtime` access, so the old API code must not be left serving supplier writes.
4. Verify gateway owner success, member denial, and direct `ghm_runtime` RPC denial against a production-like environment before any Connect cutover.

No production role was provisioned, no production migration or grant change was applied, no gateway service or environment variable was created, and no deployment or Connect activation occurred. Exact-head CI for PR #270 is pending. Keep PR #243 and PR #270 draft/unmerged until the new qualification passes and the active-database compatibility review is complete.
