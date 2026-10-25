# R2 production-readiness blockers — 2026-10-25

This note records follow-up review of draft PR #184. It is a blocker list, not approval to configure Render or run migrations.

## Verified blockers

1. **Database schema is absent.** The read-only preflight recorded in the main handover found no `ghm.storage_object` table and none of the required lifecycle functions in either production `ghm_db` or sandbox `ghm_payfast_sandbox_db`. The current storage repository invokes these routines directly. No production migration was run.
2. **Configured download TTL is not enforced.** `src/storage/config.ts` reads `STORAGE_DOWNLOAD_GRANT_MAX_TTL_SECONDS`, but `src/http/storage-router.ts` does not pass the value into `createStorageService`; `src/storage/service.ts` hard-codes a 3600-second cap. Wire the configured cap through and test lower configured values.
3. **Partial activation detection is incomplete.** `src/config.ts` decides whether to activate storage by checking endpoint, region, bucket, and access-key variables, but does not include `STORAGE_PROVIDER` or the TTL settings. Include all storage-specific knobs in fail-closed detection and add tests.
4. **Route and database authorization qualification is still required.** Add tests for unauthenticated calls, cross-tenant object IDs, upload completion ownership, authorization failures, and lifecycle function/table privileges. Passing general CI does not substitute for these focused checks.

## Correct environment-variable contract

The names read by `src/storage/config.ts` are:

- Required when storage is enabled: `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`
- Optional/configurable: `STORAGE_PROVIDER` (defaults to `s3`), `STORAGE_ENDPOINT` (Cloudflare R2 HTTPS S3 endpoint), `STORAGE_FORCE_PATH_STYLE` (defaults to true when an endpoint is provided), `STORAGE_UPLOAD_GRANT_TTL_SECONDS` (defaults to 900), `STORAGE_DOWNLOAD_GRANT_MAX_TTL_SECONDS` (defaults to 3600)

For Cloudflare R2, the expected values are typically `STORAGE_PROVIDER=s3`, `STORAGE_REGION=auto`, and `STORAGE_FORCE_PATH_STYLE=true`. Confirm the actual bucket name and account endpoint in Cloudflare. Never record either access-key secret in GitHub or chat.

## Go/no-go

**Do not add R2 credentials to Render yet.** The next engineering steps are to author and review the schema migration under the repository's established migration/security conventions, implement the TTL and fail-closed fixes, add focused tests, and qualify the migration in the shared sandbox DB using the approved migration process. Production migration and production credential configuration remain separate gated operations requiring explicit approval. No Render environment variables or database state were changed during this review.

## Follow-up implementation — 2026-10-25

Implemented on this feature branch after the initial review:

- `STORAGE_DOWNLOAD_GRANT_MAX_TTL_SECONDS` is now passed from runtime config through the HTTP router into the storage service, and the service enforces that configured cap.
- Storage activation/partial-config detection now includes provider, path-style, and both TTL variables, so setting one of these alone causes startup validation to fail rather than silently leaving storage disabled.
- Added focused tests for a lower configured download TTL and for partial provider/TTL configuration.

CI completed successfully for the hardening commit `b4c4012a5fbc5057188e2c8ec192a67ebe2b5d48` and the subsequent documentation commit `8c47398e0ec474f52fa00a938affc26d50706a38` (workflow runs 1586 and 1587). This verifies the repository CI suite for those commits, but does not substitute for route-level authorization tests or database migration qualification.

## Remaining blockers

- The canonical storage schema migration is still not authored. I have not created one by guessing at the database security conventions: the current runtime calls `SECURITY DEFINER` lifecycle functions while the runtime role should not have direct table DML, and the migration must define the exact object shape, transitions, ownership, grants, and tenant-boundary protections correctly. A guessed migration could create a cross-tenant write vulnerability.
- HTTP route-level tests and explicit cross-tenant/database-privilege qualification remain outstanding.
- No database, Render environment, production service, or sandbox service was changed.


## Latest continuation — 2026-10-25 21:02 UTC

- Rechecked GitHub Actions: CI passed for the TTL/config hardening and subsequent docs update.
- PR #184 remains open and draft; it has not been merged.
- The migration remains the critical blocker because both live databases were previously verified to lack the storage table and lifecycle functions. The migration runner uses `GHM_MIGRATOR_DATABASE_URL`, assumes `ghm_migrator` can `SET ROLE ghm_schema_owner`, and applies pending migration files transactionally. I did not execute it.
- I will not create a speculative schema migration without confirming existing role/grant conventions and exact database contract, and I will not run a migration against the shared sandbox or production DB without the approved migration plan.
- No Render settings, credentials, or database state were changed.


## Continued review — 2026-10-25 21:05 UTC

A further source review of `src/http/storage-router.ts` found why route-level tests are required before this can be enabled:

- The complete/access/delete handlers first look up metadata and then construct the service caller's `businessId` from that metadata. This is safe only if the authorization adapter independently derives and verifies the authenticated user's tenant membership from `AuthContext`, and never trusts that caller-supplied business ID as authority. That must be verified in the adapter and integration-tested with a user from a different tenant.
- The upload handler accepts `businessId` from request JSON. This is acceptable only if `assertCanManage` resolves actual tenant authority from the authenticated context and denies a non-member; a request field must not grant membership.
- The source path `src/storage/authorization-adapter.ts` could not be retrieved through the connected GitHub file API during this review, so I cannot truthfully certify the above invariant from source here.

Accordingly, I am not approving the storage routes or inventing a migration that must align with their authorization contract. Required next step: retrieve/review the adapter and the existing tenant resolver + DB grants, then add cross-tenant route/integration tests and author a migration that enforces tenant checks inside the database routines as well as in application code.

CI green for the earlier TTL/config fix is not a pass for these security conditions. No environment variables, database state, or Render settings were changed.


## Follow-up at 2026-10-25 21:07 UTC

The storage authorization adapter and tenant resolver were retrieved and reviewed. The adapter verifies the authenticated user ID, checks active tenant membership through `withTenantTransaction`, restricts business-logo management/deletion to owner or administrator membership, and allows public reads only for public business resources on active businesses. The tenant resolver binds both business ID and authenticated account ID in its membership query and rejects absent membership. Existing `src/auth/tenant-resolver.test.ts` already covers active membership, missing membership, and invalid tenant IDs.

This improves confidence in the application-layer boundary, but route-level storage authorization tests and a checked-in migration remain missing. The lifecycle repository invokes SQL functions without a caller identity parameter, so the database migration must be reviewed against the runtime role and transaction context rather than assuming the SQL routines can identify the end user. I did not apply a migration or change Render/database settings. PR #184 remains draft and unmerged.


## Service-level authorization regression tests — 2026-10-25 21:11 UTC

Added four tests to `src/storage/service.test.ts` to assert that denied authorization prevents side effects for upload creation, upload completion, private access signing, and deletion state transitions. The tests exercise the service's authorization gates; they are not a substitute for HTTP-route tests or live PostgreSQL privilege checks.

CI for the test commit `d6eda4381920c2d8a91100e40d26157019a7bb17` was still in progress at the time of this update (run 1591). Await a completed successful run before considering the test commit validated.

### Still required

- HTTP-level tests for missing authentication and cross-tenant attempts across all four endpoints.
- Canonical migration for `ghm.storage_object` and lifecycle functions, reviewed against actual schema-owner/migrator grants and the transaction model.
- Qualification on a disposable test database, followed by an approved migration window for the shared sandbox. Production migration remains a separate explicit gate.

No migration was executed and no Render/database settings were changed.


## HTTP authentication regression tests — 2026-10-25 21:14 UTC

- CI run 1591 completed successfully for commit `d6eda4381920c2d8a91100e40d26157019a7bb17`, including the service-level authorization regression tests.
- Added `src/http/storage-router.test.ts` with HTTP tests for unauthenticated requests to upload, complete, access-grant, and delete endpoints. Added this test file to the package test command.
- The latest commits `ff85323a5a3250eb5c8b46e834f292f0bf82a554` and `beda357f3ce6b9172461a31be11061b785ec9189` do not yet have a reported PR workflow run. Treat the HTTP tests as unverified until CI runs and passes.
- These tests establish unauthenticated denial only; they do not simulate authenticated cross-tenant attempts. Cross-tenant route/integration tests and the database migration/privilege qualification remain blockers.
- No database migration or Render configuration was changed.


## Authorization adapter qualification tests — 2026-10-25 21:17 UTC

Added `src/storage/authorization-adapter.test.ts` with tests for: binding the requested tenant to the authenticated context, rejecting a caller-supplied different business ID before a tenant query, denying non-manager membership, and propagating missing-membership denial for private-object reads. Added the suite to the package test command.

CI run 1596 passed for the preceding authorization-boundary refactor commit. CI runs 1597 and 1598 for the new tests and test-command inclusion were still in progress at this update; they must complete successfully before these tests are considered validated.

A source search did not find checked-in `ghm_schema_owner` role/bootstrap or `ALTER DEFAULT PRIVILEGES` conventions. This confirms the schema migration cannot yet be safely authored from available checked-in examples. Do not infer or create roles/grants speculatively; inspect the authoritative DB bootstrap/role setup and confirm the storage table's full transition/tenant contract first.

Current remaining production blockers: migration and least-privilege qualification; authenticated cross-tenant HTTP tests with a controlled transaction/database seam; and a disposable-database integration test for lifecycle transitions and privileges. No live DB or Render changes were made.
