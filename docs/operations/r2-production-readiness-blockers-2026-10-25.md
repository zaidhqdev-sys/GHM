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


## Repository query invocation refinement — 2026-10-25 21:47 UTC

After the composite-row mapping fix, a further PostgreSQL review identified that expanding a composite-returning function with `(function_call).*` can risk repeated evaluation of the function expression. Changed the five lifecycle queries to `SELECT * FROM ghm.storage_...(...)`, which returns the composite columns from a set-returning FROM item and avoids that repeated-expression pattern. Updated the repository regression assertion to require the `SELECT * FROM` form. CI run 1620 is in progress for the query change; the subsequent assertion update does not yet have a reported workflow run. Treat these latest commits as unvalidated until CI passes on the current head.

The PR remains draft. Live migration ledger/checksum and full constraints review still need authorized read-only access; do not add R2 credentials or change Render. No database writes or migrations were performed.


## Latest storage repository validation — 2026-10-25 21:49 UTC

- CI run 1620 failed for the intermediate query patch. The follow-up commit changed all five calls to `SELECT * FROM ghm.storage_...(…)` and updated the regression assertion; CI run 1621 passed, and the current documentation/head commit `f15869b0b951c22b93dc5a8f7b49d2b5e62ad98b` also has CI run 1622 passed. This validates the current branch head's build, test suite, migration audit policy tests, and runtime-boundary checks.
- Source review confirmed the canonical migrations: the table migration defines identity, FK, status/lifecycle checks, uniqueness and indexes; the boundary migration revokes direct table DML and defines lifecycle routines; the hardening migration changes them to SECURITY DEFINER with fixed search_path and PUBLIC execute revoked.
- Production migration-ledger access remains blocked by DB permissions: the connection runs with `current_user=ghm_db_user`, `session_user=ghm_app_user`, and `has_schema_privilege(current_user,'ghm','USAGE')=false`. Queries against `ghm.ghm_schema_migrations` fail with permission denied for schema `ghm`. No applied-version/checksum claim can be made from this connection. An authorized `ghm_schema_owner`/migration-audit read-only session is required.
- No migration, database write, or Render change was performed. PR remains draft. R2 activation remains blocked pending ledger/checksum reconciliation, authorized live-constraint review, and real membership-backed tenant isolation qualification.


## Handover synchronization and qualification-script safety — 2026-10-25 21:53 UTC

The main production handover was updated in commit `9bd01f01d3a47a3e86bad75aed8ef1bfa3cea10b` to supersede stale statements that the canonical storage migration was absent. The three canonical migration files are present, and catalog checks observe the table/functions in production and shared sandbox. The remaining database blocker is ledger/checksum and full DDL reconciliation through an authorized read-only role, not absence of source files.

Additional safety finding: `scripts/qualify-storage-persistence.mjs` is a mutating probe, not a read-only audit. Its direct-INSERT negative test issues an INSERT with no SQL placeholder but passes `[tenantBusinessId]` as a bind-parameter array; PostgreSQL can reject the mismatched parameter count before checking privileges, making the test falsely pass. Do not use this script as privilege evidence and do not run it against production/shared sandbox. Correct this probe and require a dedicated disposable qualification database before executing lifecycle writes.

Current branch head `b3da5f03e23fff8ecb6a20905b84f9d469944f67` passed CI run 1623. PR #184 remains draft and unmerged. No database writes, migrations, or Render configuration changes were made.


## Qualification probe guard added — 2026-10-25 21:54 UTC

Updated `scripts/qualify-storage-persistence.mjs` to fix its direct-INSERT denial probe (it now supplies the tenant ID as `$1` and uses a unique generated provider key). Since the script creates and advances storage records, it now requires explicit `GHM_STORAGE_QUALIFICATION_ALLOW_MUTATIONS=true` and a database name clearly marked qualification/qual/test/disposable. This guard has not yet been CI-validated, and the script has not been executed against any DB. Use only on a dedicated disposable database; never production or shared sandbox.

The main handover now includes the same correction and guardrails. CI run 1623 passed for the preceding branch head; no workflow result is yet reported for this script patch. PR remains draft, no database writes or Render changes.


## Latest continuation — 2026-10-25 21:56 UTC

CI run 1628 passed for the then-current PR head `5e69a2cfb59c9adfb22413d19547ae683b8aceb4`; PR #184 remains draft and unmerged. Latest source inspection shows `scripts/qualify-storage-persistence.mjs` still accepts `GHM_RUNTIME_DATABASE_URL` and generic `DATABASE_URL` fallbacks when `GHM_QUALIFICATION_DATABASE_URL` is absent. The mutating script therefore needs another safety hardening pass before it is considered usable: accept only the dedicated qualification URL, use `SELECT * FROM ghm.storage_create_pending(...)` for consistent row mapping, and make the final read `SELECT * FROM ghm.storage_get_object($1)` rather than repeating the function call. The repository tool blocked the source update, so these changes are not applied. Do not run the qualification script on any database until this is corrected, CI-tested, and a disposable DB target is explicitly provisioned.

The production handover was updated with the same findings in commit `45da83731e2527b688256d9d04e6f0fa87294247`. No database writes, migrations, or Render configuration changes were made. The R2 environment variables remain on hold pending authorized migration-ledger/DDL reconciliation and real membership-backed tenant isolation testing.


## Storage qualification safety fixes applied — 2026-10-25 21:58 UTC

The latest source changes now remove `GHM_RUNTIME_DATABASE_URL` and generic `DATABASE_URL` fallbacks; the script accepts only `GHM_QUALIFICATION_DATABASE_URL`. The direct-INSERT denial probe now uses a matching `$1` bind and unique provider key, and the lifecycle create/transition/final-read queries use `SELECT * FROM ghm.storage_...(...)` for consistent row mapping and single function evaluation. Existing explicit mutation opt-in and database-name guard remain.

These edits are source-reviewed but latest-head CI has not yet been confirmed. Do not execute the script until CI passes and a dedicated disposable qualification database is provisioned/verified. Production/shared sandbox remain prohibited targets. Ledger/DDL reconciliation and membership-backed tenant-isolation tests remain blockers; no database writes, migrations, or Render changes were made.


## Strict qualification assertions added — 2026-10-25 22:00 UTC

The storage qualification script now requires expected SQLSTATE values for negative security probes (`42501` direct table DML denied; `P0001` invalid pending-to-deleted transition), checks that all runtime direct DML privileges are false and all required lifecycle function EXECUTE privileges are true, and normalizes the final deleted transition to `SELECT * FROM ghm.storage_mark_deleted($1)`. This prevents arbitrary SQL/parameter errors from being counted as proof of a privilege boundary.

CI run 1634 passed before this latest test-hardening commit; CI run 1635 is queued and must pass before these newest changes are considered validated. The qualification script has not been executed. The live ledger query remains blocked by the inspection role's lack of `ghm` schema USAGE. Do not add R2 variables, execute the script on production/shared sandbox, run migrations, or change Render. PR #184 remains draft/unmerged.


## Follow-up qualification guard review — 2026-10-26

After CI run 1637 passed for the previous head, static review tightened the qualification script's database-name check to require delimited qualification/test/disposable tokens, made direct-DML privilege checks fail closed on NULL/unknown results, and made final lifecycle-state validation require exactly one row with status `deleted`. These newest source commits still need CI confirmation. The qualification script has not been run against any database. No database writes, migrations, or Render changes were made. Remaining blockers are authorized read-only migration ledger/checksum and live DDL review, verified disposable-database qualification, and real membership-backed tenant-isolation tests.


## Latest validation result — 2026-10-26

CI run 1639 passed for source commit `eec2d4dbb20d4a19e0984c537792279cc71401bf`, covering the stricter qualification database-name token, fail-closed privilege checks, and exact final deleted-state assertion. PR #184 remains draft/unmerged. The script has not been run against any database; CI does not prove live migration ledger/checksum reconciliation, live grants, or real membership-backed cross-tenant authorization. These docs were committed after the tested source commit and have no reported workflow run. No database writes, migrations, or Render changes were made. Keep R2 variables on hold.


## Qualification script syntax repair — 2026-10-26

Static review identified malformed literal `\\n` sequences in the final lifecycle assertion, making the script invalid JavaScript. Corrected to normal source newlines in commit `40fb35e44a71a440cf50c27192aaf4e986df8edc`. The workflow-run lookup returned no CI result for the current PR head, so the repair is not yet validated. Do not execute the script until CI passes. No database or Render changes were made; production R2 credentials remain on hold.


## Explicit syntax CI gate — 2026-10-26

CI workflow now runs `node --check scripts/qualify-storage-persistence.mjs` before build/test, making script parse failures an explicit CI failure. Latest source/workflow commit is `61f083c7e5eeb1ea0983edf3a391dc6da8dd996c`; CI run 1647 is currently in progress. No qualification DB run, DB write, migration, or Render change occurred. Keep production R2 credentials on hold until CI passes and the remaining database/tenant-isolation checks are completed.


## Follow-up migration-owner convention review — 2026-10-26

Verified `src/db/migrate.ts`: the migration runner connects with `GHM_MIGRATOR_DATABASE_URL`, executes `SET ROLE ghm_schema_owner`, and verifies `current_user = ghm_schema_owner` and `session_user = ghm_migrator` before executing migration SQL inside a transaction. PostgreSQL creates/replaces the lifecycle functions under the effective role in that migration session; therefore the missing explicit `ALTER FUNCTION ... OWNER TO ...` statements are not by themselves proof of wrong ownership for functions created by this runner. The role switch is documented in the main handover as validated against production earlier. This is a source/process review only, not a live storage migration or grant verification. Before applying storage migrations, still verify role attributes and function owners/grants on the intended target using the approved read-only audit connection, and test the migration on a disposable database. No database or Render settings were changed. PR #184 remains draft/unmerged.


## Read-only audit query file available — 2026-10-26

Added [`database/audits/storage-persistence-readonly-audit.sql`](../../database/audits/storage-persistence-readonly-audit.sql). It gathers connection identity, role attributes, storage relation owner/RLS state, lifecycle function owner/security settings/ACLs, direct runtime DML privileges, and migration-ledger presence without writes or role switching. Use only with the approved audit connection, one explicitly selected target at a time, and keep production and sandbox results separate. This does not qualify the migration or authorize applying it. No live database or Render changes were made.


## Read-only role audit results — 2026-10-26

CI run 1654 passed for the branch head containing the read-only audit file and handover updates. Read-only role checks against Render show `ghm_schema_owner` exists and is non-login, non-superuser, and `NOBYPASSRLS` on both production and sandbox. `ghm_migrator` and `ghm_runtime` exist and are also non-superuser/`NOBYPASSRLS`; production `ghm_app_user` is likewise non-superuser/`NOBYPASSRLS`. However, the inspection role receives `permission denied for schema ghm` (SQLSTATE 42501) when querying relation/ledger metadata in either database. Table/function ownership, effective grants, and ledger checksums therefore remain unresolved. This is an access limitation, not proof that objects are missing. No database writes, migrations, or Render changes occurred. Do not add production R2 credentials yet.


## Live storage catalog audit — 2026-10-26

CI run 1656 passed on the branch head. Read-only PostgreSQL catalog queries now confirm that both production `ghm_db` and sandbox `ghm_payfast_sandbox_db` have `ghm.storage_object` owned by `ghm_schema_owner`, plus all five storage lifecycle functions. Each function is `SECURITY DEFINER`, owned by `ghm_schema_owner`, pins `search_path=pg_catalog, ghm`, and grants EXECUTE to `ghm_runtime` and the owner; no PUBLIC EXECUTE grant appears in the ACL. `ghm_runtime` has no direct SELECT/INSERT/UPDATE/DELETE privileges on the storage table. The live table has the expected lifecycle/status/visibility/size/content checks, provider-key uniqueness, PK, and business FK. This corrects the earlier conclusion drawn from a failing `to_regclass` query: schema access was denied, not object absence.

Migration ledger rows/checksums remain unverified because the inspection connection cannot SELECT `ghm.ghm_schema_migrations`. Do not widen permissions or switch roles ad hoc; use the approved audit process. No functions were executed, no data was written, and no migrations or Render settings changed. Disposable-database lifecycle tests and real membership-backed cross-tenant integration tests remain outstanding; keep production R2 variables on hold.


## Latest source/CI review — 2026-10-26

CI run 1658 passed for branch head `265c877837cfbd1f73aeeb1bb564d2309dcd9485`. The storage persistence qualification script is guarded by explicit `GHM_QUALIFICATION_DATABASE_URL` and `GHM_STORAGE_QUALIFICATION_ALLOW_MUTATIONS=true`, checks the database name for qualification/test/disposable markers, and covers direct table-DML denial plus lifecycle transitions. It has not been executed because a dedicated disposable qualification database is not provisioned/verified in this session.

Authorization-test limitation: `src/http/storage-router.tenant-auth.test.ts` uses mocked storage services that deliberately throw `Business tenant access denied`; these tests verify route-level 403 mapping and unauthenticated rejection, not real PostgreSQL membership resolution. Adapter unit tests also inject mocked transaction callbacks. Real membership-backed cross-tenant integration tests remain a blocker.

Migration ledger limitation: `scripts/forensic-migration-reconciliation.mjs` is designed to run under `GHM_MIGRATOR_DATABASE_URL`, checks the established `ghm_migrator` -> `ghm_schema_owner` role transition, and opens a `BEGIN READ ONLY` transaction before ledger/checksum reconciliation. The current inspection connection cannot read ledger rows. Run the audit from the approved operational environment and record sanitized results; do not paste credentials into GitHub/chat. Only run the mutating lifecycle qualification against a separately provisioned disposable database. No live writes, migrations, or Render settings changes occurred. Keep production R2 variables on hold.


## Latest CI and remaining operational actions — 2026-10-26

CI run 1660 passed for branch head `48887b07118d7d995e40f9ba0ecd94680d7609b7`. This confirms the branch's build/tests, not live migration-ledger reconciliation or mutating storage qualification. The current session does not have an approved `GHM_MIGRATOR_DATABASE_URL` for the read-only ledger script or a verified disposable qualification database. Do not use production or the shared PayFast sandbox as a substitute. From the approved operational environment, run `scripts/forensic-migration-reconciliation.mjs` with `GHM_MIGRATION_AUDIT_DATABASE=ghm_db`, save sanitized output, then qualify lifecycle transitions on a dedicated disposable database with the explicit mutation opt-in. Real PostgreSQL membership-backed cross-tenant integration tests remain required. No live writes, migrations, or Render settings changes occurred; do not add production R2 variables yet.


## New code review fix: retryable deletion — 2026-10-26

Found and fixed a lifecycle recovery issue in `src/storage/service.ts`: an object left in `deletion_pending` after provider failure could not be retried via the service. Deletion now accepts `available` and `deletion_pending`, authorizes both, transitions only an `available` object, retries provider deletion, and marks the row `deleted` only after provider deletion succeeds. Added tests for successful retry and a provider failure during retry. Commits: `a1afb1d6a71c869e6971b04aa9291c2bb3f62b89`, `2633fde904e6fadbd7ac74585558c22e9a6dfa68`. CI for these code changes remains unconfirmed. This is not production qualification; no database or Render settings changed, and production R2 variables remain on hold.


## Additional blocker: metadata getter is not tenant-scoped — 2026-10-26

CI run 1666 passed for the retryable deletion fix. A least-privilege review found `ghm.storage_get_object(bigint)` is a `SECURITY DEFINER` function granted to `ghm_runtime` that returns an object row solely by ID; it does not take a tenant identifier or enforce visibility. Normal service flow checks authorization after loading the row, but direct SQL invocation by the runtime role can retrieve metadata for arbitrary IDs. This is a database-layer tenant-isolation weakness under a compromised runtime/query path. It does not disclose provider credentials, but must be resolved before production enablement. Design and test a tenant-scoped lookup while preserving explicitly public logo reads; do not change live DB functions or permissions ad hoc. No database or Render settings changed. Keep production R2 variables on hold.


## Account-scoped metadata getter — 2026-10-26

Added a source migration replacing the ID-only metadata getter with a two-argument lookup that checks active public business-logo visibility or active membership for the supplied account, and drops the old unscoped function. Repository calls now pass the authenticated context account ID, a regression test asserts that parameter, and the read-only audit SQL checks the old/new signatures. Important limitation: this is defense in depth, not cryptographic binding to the end-user identity; the application must still enforce membership authorization because a shared DB runtime role can supply function arguments. The migration has not been applied to any live database. CI, disposable-database migration/lifecycle qualification, and real membership-backed integration tests remain outstanding. No Render settings changed; production R2 variables remain on hold.


## Scoped metadata lookup CI result — 2026-10-26

CI run [1678](https://github.com/zaidhqdev-sys/GHM/actions/runs/40242355456) passed the build, test suite, migration audit policy tests, and runtime-boundary verification for head `9fea65df616abb9ee1c9b8e1fd19bad82209b942`. An earlier run failed only because two new tests over-escaped a regular expression; the assertions were corrected to literal substring checks. This is not live database qualification: the new migration has not been applied, no disposable-database migration/lifecycle run has been performed, and real PostgreSQL membership-backed tenant-isolation tests remain open. No live DB or Render changes were made; production R2 variables remain on hold.



## Proxy-trust remediation continuation — 2026-10-29 20:50 UTC

Scope confirmed by operator: GHM identity qualification (sandbox/test) has no trust-proxy setting; the warning is specific to GHM Internal Runtime (production). Do not change the qualification service.

### New work performed

- Created branch `fix/render-trust-proxy-hop-config-2026-10-29`.
- Added `TRUST_PROXY_HOPS` support in `src/config.ts`: explicit non-negative integer from 0 through 10, invalid values fail startup, and the numeric setting takes precedence over legacy `TRUST_PROXY=true`.
- Added config tests for numeric hop configuration, precedence over the legacy boolean, and rejection of malformed/out-of-range values.
- Updated `.env.example` to recommend explicit, topology-verified hop count rather than unrestricted trust.
- Opened PR #193: https://github.com/zaidhqdev-sys/GHM/pull/193. CI run `40952611309` completed successfully for commit `7c922970f36933765a6c3264cea54e7349a612bd`; the quality job passed the build, disposable PostgreSQL qualification, test suite, migration audit policy tests, and runtime boundary verification. The later handover-only commits do not change application code. See https://github.com/zaidhqdev-sys/GHM/actions/runs/40952611309.
- No production or sandbox Render environment variables, service settings, or deployments were changed. PR #193 remains unmerged.

### Platform guidance and limitation

Render's published guidance includes an Express example using `app.set('trust proxy', 1)` behind its load balancer: https://render.com/articles/how-to-implement-authentication-and-authorization. Render also describes traffic traversing Cloudflare and Render load balancers and recommends reading `X-Forwarded-For` for client IP: https://render.com/articles/how-render-handles-ddos-attacks. This guidance supports investigating a numeric hop policy, but does not itself prove the exact forwarded-header chain reaching this particular service. Do not apply `TRUST_PROXY_HOPS=1` to production until the effective chain/client IP is checked with a safe request or confirmed with Render support.

### Important unresolved discrepancy

The production app log shows `ERR_ERL_PERMISSIVE_TRUST_PROXY` at `2026-10-29T20:06:15.836212737Z`. Reviewing the currently available `main` versions of `src/config.ts`, `src/http/app.ts`, and `src/server.ts` found boolean proxy configuration but did not identify an `express-rate-limit` middleware call in those inspected files. The running instance/deployed build or another imported module therefore needs reconciliation before claiming the new config alone fixes the warning. Inspect the exact deployed commit/build artifact and dependency call path.

### Next steps

1. Let PR #193 CI complete; fix any test/build failures before merge.
2. Inspect the exact production deployment's commit and compiled artifact/module stack for the source of the rate-limit validation warning. Record evidence.
3. Safely establish the forwarded-header chain on production (use a temporary diagnostic that does not log secrets or persist arbitrary headers, or confirm with Render support). Verify that forged leftmost `X-Forwarded-For` values cannot alter the rate-limit identity.
4. After merge and successful deployment only, set a topology-verified numeric `TRUST_PROXY_HOPS` on **GHM-Internal-Runtime** if warranted, then verify startup logs and rate-limit behavior. Do not touch GHM identity qualification for this warning.
5. Keep storage migration reconciliation and R2 go-live gates unchanged.

These steps were repository/documentation and read-only platform investigation only; no live configuration change or deploy was made.


### Bounded legacy fallback update — 2026-10-29 20:52 UTC

The implementation was tightened after review: if legacy `TRUST_PROXY=true` is set and `TRUST_PROXY_HOPS` is unset, the application now uses numeric `1` instead of Express boolean `true`. An explicit `TRUST_PROXY_HOPS` value still takes precedence. A config test asserts the legacy boolean is narrowed to one hop. This avoids the permissive boolean that triggered `ERR_ERL_PERMISSIVE_TRUST_PROXY` while preserving a safe migration path. CI must be rerun for this latest code commit before merge. This is based on Render's published Express example using one hop, but does not yet prove the original-client IP is resolved correctly in this service; after deployment, verify observed `req.ip`/rate-limit key behavior with spoofed `X-Forwarded-For` tests. No Render setting or deployment was changed here.


### Source-path reconciliation correction — 2026-10-29 20:53 UTC

Follow-up inspection located the rate limiter in `src/http/auth-router.ts`, which the earlier source check had not inspected. It creates `express-rate-limit` middleware for login (10 requests/15 minutes), password recovery (5/15 minutes), and refresh (60/15 minutes). `src/http/app.ts` sets Express trust proxy from `config.trustProxy`. The production stack therefore matches the repository's auth-router rate limiter; the earlier statement that the source did not expose the call path was incomplete and is superseded by this correction. Existing test `POST /api/v1/auth/login enforces the approved 10-per-15-minute IP limit` verifies the basic limiter, but does not yet test spoofed `X-Forwarded-For`. The new config regression test narrows legacy `TRUST_PROXY=true` to numeric one hop. After successful CI and rollout, verify the production IP key with spoofed-header tests and a safe external request. Do not change the identity qualification service.
