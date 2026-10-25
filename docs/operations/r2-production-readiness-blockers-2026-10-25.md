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


## CI failure and correction — 2026-10-25 21:20 UTC

CI run 1598 failed in two new adapter tests. The failures exposed a real testability/refactor issue: the private-read path still called the default tenant transaction instead of the injected transaction, and the mismatched-business test constructed matching caller/resource business IDs. Corrected both:
- private-read membership now uses the injected tenant transaction boundary consistently;
- the mismatched-tenant test now supplies a caller business ID that differs from the resource tenant.

CI run 1600 was in progress after the correction. Do not treat the new adapter suite as green until a workflow run for the corrected commits passes. The route-level tests currently verify unauthenticated requests; authenticated cross-tenant HTTP integration is still not complete.

No database migrations or Render settings were changed.


## Live database recheck — 2026-10-25 21:22 UTC

A new read-only recheck found an important state change relative to the earlier preflight: `ghm.storage_object` and all five `storage_*` lifecycle functions are now present in **both production and the shared sandbox database**. The earlier note saying they were absent is historical and no longer reflects current live state. This recheck did not create or modify these objects.

Observed on both DBs:
- `storage_object` is owned by `ghm_schema_owner`; its ACL grants table DML only to that owner (no direct runtime DML grant shown).
- All five lifecycle routines are owned by `ghm_schema_owner`, are `SECURITY DEFINER`, set a fixed `search_path` of `pg_catalog, ghm`, and grant EXECUTE to `ghm_runtime` plus the owner.
- The live lifecycle routines accept object/business IDs but do not themselves resolve end-user tenant membership; application-layer authorization remains essential.
- Current repository search still finds no checked-in migration definition for these live objects, and the migration ledger could not be read with the read-only connection's privileges. Therefore the origin/version/checksum of the live schema change is unverified.

CI runs 1601 and 1602 completed successfully for the authorization test/refactor commits. Run 1600 failed on an earlier commit in the same series; the subsequent corrected commits are green.

Next: reconcile the live schema against the canonical migration history/source, inspect constraints and lifecycle transition rules using an authorized read-only role, and add authenticated cross-tenant HTTP/integration tests. Do not rerun or create a migration merely because the prior preflight said the objects were missing. No database or Render settings were changed during this recheck.


## Lifecycle routine and identifier review — 2026-10-25 21:27 UTC

CI run 1603 completed successfully for the current authorization-test fixes.

A read-only inspection of the live sandbox database retrieved all five function definitions and table columns. The lifecycle routines enforce state transitions:
- create inserts status `pending`;
- mark-available only transitions `pending` to `available`;
- mark-deletion-pending only transitions `available` to `deletion_pending`;
- mark-deleted only transitions `deletion_pending` to `deleted`;
- get-by-ID returns a row by ID.
The functions are SECURITY DEFINER, use fixed `search_path = pg_catalog, ghm`, and do not perform caller/tenant membership checks themselves.

**New potential schema defect to resolve before enablement:** the `ghm.storage_object.id` column is a non-null bigint and the catalog query showed no column default or identity property, while a sequence named `storage_object_id_seq` exists and is owned by that column. The create routine omits `id` in its INSERT. A trigger/default may be absent; current read-only role lacks sufficient privileges to fully inspect trigger definitions, so this needs an authorized schema-owner review before concluding inserts work. Do not test by inserting into the shared sandbox; verify from catalog under an authorized read-only role or a disposable DB.

The live constraints could not be fully read with the available read-only credentials due to schema permission restrictions. The checked-in migration source/history is still not reconciled with the live objects. Next action: obtain the authoritative migration/DDL source or schema-owner review, verify ID generation and constraints, then add a disposable-DB lifecycle test and authenticated cross-tenant HTTP tests. Production and sandbox remain unmodified by this inspection; no Render settings were changed.


## ID-generation finding resolved — 2026-10-25 21:29 UTC

Follow-up read-only PostgreSQL catalog inspection resolves the earlier suspected ID-generation defect. The `id` column has `attidentity = 'd'` (GENERATED BY DEFAULT identity), and `storage_object_id_seq` is internally linked to that column. The missing `column_default` expression was expected for an identity column; the create routine's omission of `id` is correct. The earlier “potential schema defect” entry above is superseded by this result; no schema change is indicated by this finding.

The sandbox read-only connection still cannot inspect `ghm.storage_object` constraints or triggers directly because of schema privileges. Catalog-level identity metadata was accessible and conclusive for ID generation. No insert or other write was attempted.

Latest CI run 1603 is green. Next work remains focused on the genuine blockers: establish the authoritative source/migration history for the live storage objects, get constraints and grants reviewed through an authorized schema-owner path, and implement authenticated cross-tenant route/integration tests. The live SQL lifecycle functions enforce status transitions but do not identify the end-user tenant, so the application authorization adapter must continue to be verified end-to-end.

No live database or Render settings were changed.


## Production schema comparison and public-read tests — 2026-10-25 21:31 UTC

- Read-only catalog comparison confirms production has the same `GENERATED BY DEFAULT AS IDENTITY` ID metadata and identity sequence linkage as sandbox. The ID-generation concern is resolved for both environments.
- Production catalog confirms `ghm.storage_object` is owned by `ghm_schema_owner`; direct table DML grants are not listed for application roles; all five storage lifecycle functions are `SECURITY DEFINER`, owned by `ghm_schema_owner`, use fixed `search_path=pg_catalog, ghm`, and grant EXECUTE to `ghm_runtime` and the owner. This matches the previously observed sandbox function/table ownership and privilege pattern.
- Added `src/storage/authorization-public-read.test.ts` for active-business public logo reads, inactive-business denial, and caller identity mismatch before database access. Added it to the npm test command. CI for the new commits `c2fe8efc24bd3f4172a9c36950e377d21dd4b1f8` and `943d003b3ed64e488e5b191d8c689860db2b309b` must complete before this suite is considered validated.
- This does not resolve the missing canonical migration history/source or replace authorized constraint review. The available DB connection cannot inspect all constraints/trigger metadata due schema privileges. Authenticated HTTP cross-tenant tests are still not implemented; existing router tests cover only unauthenticated rejection.
- No database writes, migrations, or Render settings changes were made.


## Authenticated storage HTTP denial coverage — 2026-10-25 21:34 UTC

- CI runs 1606 and 1607 passed, validating the public-read authorization unit tests and package test-command inclusion.
- Added a narrow injectable route seam so HTTP tests can exercise authenticated route handling without contacting a real database or object store.
- Added `src/http/storage-router.tenant-auth.test.ts`: covers authenticated requests to completion, access-grant, deletion, and upload where the storage service reports tenant denial, and asserts the HTTP layer returns 403. Existing tests cover unauthenticated rejection.
- CI run 1612 is in progress for the latest test-command change; do not call this latest suite green until CI completes successfully.
- Scope limitation: these are HTTP boundary tests using a controlled service seam; they do not replace a disposable-Postgres end-to-end test of the real authorization adapter against actual tenant membership rows. That remains required before production enablement.
- No database writes, migrations, or Render changes were made.


## Latest CI and PR summary correction — 2026-10-25 21:37 UTC

CI run 1612 completed successfully for the package test-command commit, including build, full test suite, migration audit policy tests, and runtime-boundary verification. The authenticated HTTP boundary tests are therefore green as tests, with the documented limitation that they use a controlled service seam and do not prove the real PostgreSQL tenant-membership path end-to-end.

Updated PR #184's body to remove stale claims that the live storage objects are absent and to accurately list current validation and remaining gates. PR remains draft and unmerged. Canonical migration/source reconciliation, authorized constraint/privilege review, disposable-Postgres lifecycle tests, and real membership-backed cross-tenant integration tests remain blockers. No DB writes, migrations, or Render settings changes were made.


## Canonical migration source reconciliation — 2026-10-25 21:38 UTC

Correction to earlier tracker entries: the canonical storage migrations DO exist in the repository under `database/migrations/` on this branch:

- `20261004220000_create_storage_object.sql` defines the table, identity ID, foreign key to `ghm.business`, uniqueness/check constraints, and indexes.
- `20261004221000_establish_storage_persistence_boundary.sql` revokes direct table access from runtime/migrator and defines the five lifecycle routines.
- `20261004222000_harden_storage_persistence_function_authority.sql` changes those routines to SECURITY DEFINER, fixes search_path, revokes PUBLIC execute, and grants execution to `ghm_runtime`.

This resolves the claim that no checked-in migration source exists. Earlier searches were incomplete; the prior statement that the canonical migration was absent is superseded. The actual remaining reconciliation is to compare the live ledger/checksums and live DDL against these exact migration files. The read-only role previously could not inspect the ledger/constraints fully, so whether these versions/checksums are applied to each live DB remains unconfirmed.

Security review point from the canonical SQL: the SECURITY DEFINER routines enforce input validation and lifecycle status transitions but do not independently check authenticated tenant membership. The app authorization adapter currently checks membership and owner/administrator role before invoking them. Therefore real runtime authorization integration tests and confirmation that only the trusted app server holds `ghm_runtime` credentials are required; database routines alone are not a tenant boundary.

No migration was executed, no database was modified, and no Render settings were changed.


## Storage repository contract defect found and patched — 2026-10-25 21:43 UTC

Source review found a concrete runtime defect in `src/storage/repository.ts`: the SQL selected each composite-returning lifecycle function as `... AS row`, but `mapStorageMetadata` expects the returned object to contain table columns at the top level. PostgreSQL drivers return the composite under a nested `row` field for that query shape, so fields such as `id` and `tenant_business_id` would not be mapped correctly. Updated the five repository calls to expand the composite with `SELECT (ghm.storage_...(...)).*` and map the top-level columns. Updated `src/storage/repository.test.ts` fixtures to match actual row shape and added a regression assertion, then added that test file to the npm test script.

CI run 1616 is in progress for the repository query fix; run 1617 is in progress for its regression test. The latest test inclusion commit has not yet reported a workflow run. Do not count this fix as validated until CI for the latest branch head completes.

Migration source reconciliation is now partially complete: the three canonical migration files were found. However, the production read-only role returned permission denied for schema `ghm` when reading the migration ledger, and no `public.ghm_schema_migrations` table exists. Thus applied versions/checksums and exact DDL equivalence remain unverified; an authorized schema-owner/migration-audit read-only check is needed. No writes/migrations/Render changes were made.
