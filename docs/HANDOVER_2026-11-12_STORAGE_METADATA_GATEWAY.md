# Handover — Storage Metadata Actor Gateway

**Date:** 2026-11-12  
**Branch:** `construction/auth-issuer-isolation-20261112`  
**Purpose:** continue the GHM authentication issuer / whole-database security qualification without restarting completed audit work.

## Recovered checkpoint

The prior session reported exact-head GitHub Actions success for `d0bf47c13114dcfe477ed45dd28173e6d4a552bd` (both `quality` and `web-quality`, 55/55 quality steps). Its PostgreSQL 18.6 inventory artifact was retrieved and analysed. The subsequent documentation checkpoint was `6b4b298824bc2ee8e8ff922e41bfd97854e9fce536` (as supplied in the prior session; confirm current branch tip before any write or qualification claim).

The inventory contains 97 SECURITY DEFINER routines. Corrected superuser-aware inventory evidence previously recorded 97 routines, 70 direct-grant findings, zero PUBLIC EXECUTE, and application grants grouped as Actor Gateway 25, Resource API runtime 43, payment provider 2, migrator 1. All routines were reported in `ghm`, owned by `ghm_schema_owner`, pinned to `pg_catalog, ghm, pg_temp`, and using trusted languages. The latest corrected artifact cited in the full security audit handover is SHA-256 `504617d724670704e673ed22f4841069d02a19aceeca2674e9b6de9cdb73e64d`, captured at 13:00:08 UTC on 12 November. Do not conflate this with the initial superuser-inflated 97-finding report.

## Confirmed open finding

Five non-public storage metadata functions remain directly executable by `ghm_runtime` and do not independently establish database actor/tenant authority:

- `storage_create_pending`
- `storage_get_object`
- `storage_mark_available`
- `storage_mark_deletion_pending`
- `storage_mark_deleted`

Application-side checks do not protect direct SQL invocation using the shared runtime credential. This is an open finding, not an exception. Do not revoke grants until the signed replacement gateway is implemented and qualified.

## Source inspection completed in this continuation

- `src/storage/repository.ts` directly invokes the five legacy functions through a Resource API authorized transaction.
- `src/storage/service.ts` defines the upload, completion, read and deletion lifecycle and validates provider metadata and image bytes before marking an upload available.
- `src/storage/authorization-adapter.ts` preserves public access for public Business Logo objects belonging to an active Business; other reads require Business membership; management/deletion require owner or administrator.
- `src/http/storage-router.ts` exposes upload, completion, access, deletion and public logo routes.
- The isolated Actor Gateway already has a shared v2 HMAC assertion mechanism and typed readers/HTTP clients; Business Logo binding is the closest existing vertical-slice pattern.
- `ghm.storage_get_public_business_logo` is a separate approved-public-logo lookup and is not one of the five functions to revoke.

## Design checkpoint

The implementation target is documented in `docs/architecture/STORAGE_METADATA_ACTOR_GATEWAY_DESIGN.md`. It defines five exact signed operations, requires wrappers to bind context to actual SQL arguments and derive tenant IDs from stored object rows for object-targeted operations, preserves the public approved-logo read exception, and keeps provider verification in the trusted Resource API service before availability/deletion state transitions.

The design is not implementation or qualification evidence. No code cutover, production change or merge is claimed.

## Next work — small qualified stages

1. Confirm the current construction branch tip and inspect the exact storage function definitions/migration constraints.
2. Extend the shared assertion verifier's operation allow-list and add signed database wrappers for the five operations, with active-actor and membership/manager checks.
3. Add typed Actor Gateway reader and HTTP routes; add the Resource API gateway client and fail-closed repository integration without changing provider lifecycle semantics.
4. Add source-contract, HTTP, reader and adversarial PostgreSQL 18 tests.
5. Add manual-only grant cutover and database-only rollback with `ghm_migrator` / `ghm_schema_owner` operator identity guards.
6. Qualify upload, completion, read, deletion, failure/retry and public approved-logo workflows plus direct runtime denial after cutover.
7. Re-run whole-database inventory and all issuer/Actor Gateway/runtime qualification at exact HEAD.
8. Reconcile all affected docs and update this handover with evidence hashes and exact CI run before considering integration.

## Hard constraints

- No production database changes, role/grant changes, migrations, secrets, deployments, traffic changes or data mutations.
- No paid infrastructure.
- Do not merge the construction branch. PR #272 is separate, open and unmerged; do not conflate its branch or CI with this construction branch.
- Production cutover remains blocked by Render role-administration resolution, a fresh independently verified production backup, and approved deployment/network/rollback planning.
- Preserve Saved Business as user favourites/bookmarks.
- Keep local Windows command instructions in the user's established PowerShell transcript style when local sync/testing instructions are needed.

## 2026-11-12 follow-up — provider transition trust boundary corrected

A deeper threat-model check found an important design constraint before implementation: the Actor Gateway is HTTPS-reachable and its ordinary routes accept end-user bearer tokens. Therefore a user-callable `storage.metadata.mark_available` or `storage.metadata.mark_deleted` endpoint would let an authenticated manager bypass the Resource API's provider HEAD/byte validation or provider deletion ordering by calling the gateway directly.

The design document now explicitly separates:
- actor-authorized operations (pending creation, metadata read, deletion-pending request), with JWT-derived actor and database membership/role checks; and
- provider-workflow transitions (mark available / mark deleted), which must require a separate short-lived, one-use Resource API service attestation bound to operation, object, tenant and provider-verification result. A normal user bearer token is insufficient.

It also flags background cleanup as a separate authority question. The next implementation step must enumerate actual cleanup callers before defining a constrained system operation; do not invent broad system authority or allow arbitrary object IDs. If the current hosting/network constraints cannot secure the service attestation, pause and return with a design decision rather than expose user-callable lifecycle transitions.

Relevant source facts:
- `src/storage/repository.ts` invokes all five legacy functions.
- `src/storage/service.ts` verifies provider HEAD metadata, actual byte length and image bytes before availability; deletion is provider-first after marking deletion-pending, with retry behavior.
- `20261026120000_scope_storage_metadata_lookup.sql` is the migration that replaced the one-argument getter with `storage_get_object(bigint,bigint)`.
- `20261110140000_allow_pending_storage_object_cleanup.sql` broadened deletion-pending to allow abandoned pending objects to enter the existing retryable deletion lifecycle.
- `ghm.storage_get_public_business_logo(bigint)` remains a distinct constrained public projection, not part of the five-function revocation batch.

This is a design-only refinement. No application code, database grants, migrations, production resources or deployments were changed. No security qualification or CI pass is claimed for the new documents.

## Implementation progress — actor-authorized metadata slice

Implemented on the construction branch after the design review:

- `database/migrations/20261112140000_add_signed_storage_metadata_actor_gateway.sql` adds three v2 assertion-bound wrappers: `gateway_storage_create_pending`, `gateway_storage_get_object`, and `gateway_storage_mark_deletion_pending`.
- The shared assertion verifier allow-list was extended while preserving every existing operation: capability governance, supplier/profile/registration, actor identity, business capability, Saved Business, business hours, trust score, Business Logo binding, and Connect provisioning.
- Create binds every metadata argument to signed JSON context, limits this vertical slice to Business Logo metadata, checks active owner/administrator membership, enforces the 2 MiB/type policy, and validates provider keys are under the exact `media/logos/<authorized-business>/<UUID>` namespace.
- Read derives tenant from the stored object and preserves the public Business Logo / active membership behavior.
- Deletion-pending derives tenant from the stored object and requires an active owner/administrator.
- All three wrappers are owned by `ghm_schema_owner`, pin `search_path = pg_catalog, ghm, pg_temp`, and grant EXECUTE only to `ghm_actor_gateway`.
- `src/actor-gateway/storage-metadata-reader.ts` signs the exact operation/context with the existing v2 HMAC mechanism. The HTTP Actor Gateway now has create/read/deletion-pending routes, validates IDs and canonical provider-key shape, and derives actor exclusively from the verified JWT.
- The Actor Gateway startup ACL allow-list now includes exactly the three new wrapper signatures.
- Added migration-contract, reader and HTTP route tests.

Latest implementation commits (ordered):
- `9d7511b4815c12afd299d7e3affa2f20a1e6f894` — initial database wrappers.
- `f185ced5df5945dd97f72aa2849c8352ac927199` — tenant-bound provider key validation.
- `8587fee3ee78fdbfc98db17fe9e296c0e14c88ee` — temporary-safe SECURITY DEFINER search paths.
- `43f84f74f1c5f8b6bc3b35c11041882cb22378a3` — preserved the complete existing assertion operation allow-list.
- `edf2f517695684f848491d6f13799f61d117ba5f` — startup ACL allow-list.
- `cdc54fb6100f98663075600f00d9c60cae26c051` — signed metadata reader.
- `0358981ddaf962d2ac8c477adcf4ecb44dbe6678` — HTTP routes (subsequently corrected in `b2805e10e7b4d2a18566ba819b77703499b1e0ce` after detecting a truncated edit; use the corrected commit).
- `e22af7b7f944cfbab1bdd10c354d46ffade6ad49` — server wiring.
- `e79a8e2320e893811bfc61744d6665479750f263` — route tests.
- `2f8df2f7110a024d54f8a59be751901a496c3f0c` — assertion allow-list regression test.

**Not yet complete:** these are only the actor-authorized operations. Provider-confirmed `mark_available` and `mark_deleted` transitions are deliberately not exposed or implemented. The Resource API storage repository is still using direct runtime SQL for all five legacy functions. No manual grant cutover exists yet. No disposable PostgreSQL 18 qualification or exact-head CI pass is claimed for this implementation.

## Immediate next steps

1. Add and adversarially qualify the separate Resource API provider attestation described in the design. It must be signed by a key unavailable to the Actor Gateway process, checked by PostgreSQL, bound to object/tenant/operation/provider evidence, short-lived and one-use. Do not turn provider transitions into ordinary user-JWT routes.
2. Enumerate and classify every pending-object cleanup/retry caller before designing any system authority.
3. Implement provider transition wrappers and trusted internal transport; only then integrate the complete Storage Metadata Gateway client into `src/storage/repository.ts` and `src/http/storage-router.ts`.
4. Add HTTP, reader, repository and adversarial PostgreSQL 18 tests; verify legitimate upload/completion/public-read/delete/retry lifecycle.
5. Add manual-only revoke/rollback scripts and disposable cutover qualification.
6. Run exact-head CI and full issuer/Actor Gateway/whole-database qualification. Only after all docs are reconciled can integration be considered.

The most recent observed GitHub workflow/status query for commit `b2805e10e7b4d2a18566ba819b77703499b1e0ce` returned no workflow runs or status checks. This is **not** a CI pass. Check the current branch HEAD and CI again before relying on the implementation.

### Latest continuation checkpoint

- Additional hardening: provider key namespace is enforced in both HTTP validation and the SECURITY DEFINER create wrapper; the key must be `media/logos/<businessId>/<UUID>` for the exact authorized Business.
- The shared assertion allow-list was checked against the preceding Connect provisioning migration and corrected to preserve all existing operation names, including Saved Business, business hours, trust score, Business Logo binding and Connect provisioning.
- Startup privilege verifier now expects all three new wrapper signatures, and its source-contract test asserts those entries.
- Corrected the storage migration-contract test regular expressions and added a regression assertion for all pre-existing gateway operations.
- Latest branch HEAD at the time of this checkpoint: `e1f296175c0d0b817502cd29e34c7946b2d56f51`.
- A fresh exact-HEAD workflow/status lookup returned no workflow runs and no status checks. Treat CI as **not yet observed**, not passed.
- No SQL was applied to disposable or production databases in this continuation. No grant revocation, service deployment, or merge occurred.

## Provider-attestation design refinement and cleanup inventory

Inspected the full storage service, HTTP routes, storage tests, storage migration contract tests, and the repository tree for storage/cleanup workers.

- No scheduled/background storage cleanup worker or storage cleanup entry point was found in the current source tree.
- Abandoned pending upload cleanup and deletion-pending retry are performed through the authenticated `StorageService.deleteObject` path; tests cover both behaviors. Do not add speculative system credentials.
- Refined the provider transition design to require **dual proof**: the existing user actor v2 assertion (JWT actor + active owner/administrator membership) plus a separate Resource API HMAC attestation verified directly by PostgreSQL. The provider signing key must be unavailable to the Actor Gateway and its database login.
- Proposed provider attestation is domain-separated (`ghm-storage-provider:v1`), short-lived, one-use, and bound to operation, object ID, stored tenant/business, provider key, and the provider evidence required for the transition.
- The database secret provisioning path is still an unresolved prerequisite. Do not create the secret table and claim security until the operator provisioning route is designed, audited and tested. In particular, do not assume the migrator may read/insert into the protected secret table.

Historical checkpoint note: at the time this paragraph was written, the dual-proof proposal was design-only. It was superseded by the provider-transition migration and transport implementation documented below. Subsequent CI applied the migrations to disposable PostgreSQL 18 and provisioned a temporary test secret through the guarded migrator path; the qualification script removed that secret and its fixtures afterward. No production secret was provisioned. Existing direct runtime function grants remain unchanged.

## Provider-transition database stage

A second database migration now exists: `database/migrations/20261112150000_add_storage_provider_workflow_attestation.sql`.

It adds:
- A separate protected 32-byte provider-attestation secret table and one-use nonce table.
- A domain-separated `ghm-storage-provider:v1` HMAC verifier, executable only through schema-owner-owned wrappers, checking Actor Gateway session identity, operation, 60-second age, full 32-byte comparison and replay.
- `gateway_storage_mark_available` and `gateway_storage_mark_deleted` dual-proof wrappers. Each requires the existing user actor assertion plus the separate Resource API provider attestation, binds the evidence to the stored Business/object/provider key/metadata, requires an active owner/administrator, locks the row, and enforces the exact pending/deletion_pending state transition.
- Both new wrapper signatures are included in the Actor Gateway startup ACL allow-list and a new migration-contract test.

A guarded disposable-only provisioning script was added at `scripts/provision-storage-provider-attestation-secret.mjs`. It requires an explicit qualification database URL and mutation opt-in, verifies `session_user=current_user=ghm_migrator`, checks the database name, uses `SET LOCAL ROLE ghm_schema_owner`, and never logs the secret value. This is a qualification/provisioning precedent only; it does not authorize production provisioning.

Historical implementation checkpoint: the signer, transport, Actor Gateway reader/routes and Resource API client were not yet implemented when this section was first recorded. They have since been added and wired into the Resource API storage router/app, and the dual-proof database path has passed disposable PostgreSQL qualification as detailed below. No production provider secret has been provisioned; legacy runtime grants remain. Do not interpret this as a production cutover.

Latest code commits for this provider stage:
- `13392ac82502613f7533ade85e5d8773c6fafb20` — provider attestation tables, verifier and dual-proof wrappers.
- `976b372bb055d1416f6d471aef00f7cfb62e1303` — startup ACL allow-list includes provider wrappers.
- `d473e4e010f714ebef822a3238fabcc9a2470132` — startup ACL source-contract checks.
- `8e3c02c6b0151efa28bbf8ca0210cdd963e32d3d` — provider attestation migration contract tests.
- `3e6fbaebe300ed00bd0a6127677798c3982484b8` — guarded disposable secret provisioning script.
- `66d92971cb1d14293c8c8ce4c600b5cd63ce303e` — actor assertion operation regression test includes both provider transitions.

## Resource API attestation and gateway transport primitives added

Further implementation after the provider migration:

- `src/actor-gateway/storage-metadata-reader.ts` now forwards both user actor assertions and Resource API provider attestations for mark-available and mark-deleted operations.
- `src/actor-gateway/app.ts` exposes authenticated provider-transition routes that validate the attestation envelope shape and pass it unchanged to the database reader. The Actor Gateway does not possess the provider signing key and does not verify or mint the provider signature.
- `src/http/storage-provider-attestation.ts` creates domain-separated, one-use HMAC provider attestations.
- `src/http/storage-metadata-gateway-client.ts` provides a bounded, HTTPS-origin-validated, redirect-rejecting HTTP client that forwards the user's bearer token and signs provider transition attestations from the Resource API environment. It fails construction if the provider signing key is missing or malformed.
- `src/storage/service.ts` now passes the verified storage record as evidence to mark-available and mark-deleted metadata operations, so the client can bind provider proof to the tenant, provider key, content type and byte size.
- Added signer and provider-transition route tests.
- CI workflow now syntax-checks the disposable-only provider secret provisioning script.

**Integration checkpoint (source-level complete; database qualification partially passed):** `src/http/storage-router.ts` now selects the Actor Gateway-backed metadata store, forwards the original caller bearer token across create/read/delete/complete/access/cleanup paths, and fails closed when the gateway is required but unavailable. `src/http/app.ts` constructs the client from `GHM_ACTOR_GATEWAY_URL` and `GHM_STORAGE_PROVIDER_WORKFLOW_ATTESTATION_SECRET`; production storage startup now requires both. The direct PostgreSQL metadata repository remains only as a non-required fallback for non-production/development. At the time of this source-level checkpoint, the signer secret had not been provisioned and the database migration had not been applied. Subsequent CI provisioned a temporary disposable secret and exercised provider attestations against PostgreSQL 18, including replay and adversarial denials. Full external provider lifecycle qualification and production cutover remain outstanding.

## Storage router and Resource API integration checkpoint — 2026-11-12

Source integration has now been completed across the Resource API:

- `src/http/storage-router.ts` accepts a per-request Storage Metadata Gateway store factory, extracts the existing caller bearer token, and passes it through the storage lifecycle. In required mode, missing bearer tokens are rejected and a missing gateway factory returns unavailable rather than falling back to the direct PostgreSQL repository.
- `src/http/app.ts` constructs `HttpStorageMetadataGatewayClient` from the configured Actor Gateway origin and the separate provider-attestation secret. Production storage refuses startup if the Actor Gateway URL or provider secret is missing, and marks the metadata gateway as required.
- `src/http/storage-metadata-gateway-client.ts` is now the Resource API transport for metadata create/read/deletion-pending/available/deleted operations.
- `src/actor-gateway/app.ts` includes the metadata create/read/deletion-pending and dual-proof provider-transition routes, with the storage reader dependency declared on `ActorGatewayDependencies`.
- Added client transport tests and router fail-closed/token-forwarding tests; added the reader, signer and migration contract tests to the main `npm test` command.
- The Actor Gateway app source was reconciled against the last clean pre-storage route version so the new storage route block appears once and the existing Trust Score, Business Hours and Saved Business routes remain exactly once. This removed a malformed duplicate tail introduced during earlier route insertion.

**CI and qualification status:** the earlier exact-head failures exposed and led to fixes for app route placement, missing Actor Gateway dependency typing, unavailable fetch test types, the stale Business Logo source-contract assertion, and malformed/truncated storage migration SQL. The clean source checkpoint subsequently passed the complete migration set on PostgreSQL 18 and the full `npm test` suite (959/959) in run `43231658336`. A later exact-head run `43232525014` has also passed build, migrations, isolated Actor Gateway principal qualification, guarded provider-secret provisioning, and the new PostgreSQL 18 dual-proof qualification. The overall workflow is still running its remaining repository-wide qualifications; re-check the final conclusion before claiming complete CI.

**Still open:** full end-to-end Resource API ↔ Actor Gateway ↔ PostgreSQL storage lifecycle qualification (including provider upload/head/read/delete against the actual provider), manual runtime-grant revocation and rollback qualification, full issuer/Actor Gateway/database requalification, final docs reconciliation, and founder approval before any merge. The PostgreSQL dual-proof qualification has passed for valid availability/deletion, invalid signature, expiry, context substitution, cross-business actor, nonce replay, invalid lifecycle state, and runtime wrapper EXECUTE denial. No production database, secrets, deployments, grants or roles have been changed. No PR has been merged.

## PostgreSQL 18 dual-proof qualification results — 2026-11-12

Added and wired `scripts/qualify-storage-provider-workflow-attestation-postgres.mjs` into CI immediately after isolated Actor Gateway principal qualification. CI now:

1. Applies all migrations to disposable PostgreSQL 18.
2. Provisions the provider secret using `GHM_MIGRATOR_DATABASE_URL` only, explicit local database identity, `SET LOCAL ROLE ghm_schema_owner`, and the dedicated mutation opt-in.
3. Runs the adversarial provider-transition qualification through the actual `PostgresStorageMetadataGatewayReader` and the `ghm_actor_gateway` database login.
4. Removes the disposable secret and all fixture rows afterward.

The complete workflow passed on run `43232525014`, including the PostgreSQL 18 provider qualification, existing storage qualification, 959/959 automated tests, and the remaining issuer/Actor Gateway/database qualification jobs.

The provider qualification passed for:
- Legitimate availability transition with user actor proof plus Resource API provider proof.
- Legitimate deletion completion with both proofs.
- Invalid provider signature.
- Expired provider attestation.
- Provider context substitution.
- Cross-business actor.
- Replayed nonce reused with a separately valid signature for a different pending object.
- Invalid lifecycle state.
- `ghm_runtime` denied EXECUTE on both provider-transition wrappers.

The provisioning script was tightened after its first CI attempt: it now uses the explicit migrator URL, not the qualification/admin URL, and still rejects non-local or incorrectly named targets. The first attempt was blocked by the identity guard and did not provision the secret. The subsequent run passed.

A further ACL refinement explicitly checks that neither `ghm_runtime` nor `ghm_actor_gateway` can directly execute the provider verifier or read the provider secret table, while only `ghm_actor_gateway` can execute the two transition wrappers. The expanded exact-head run `43232859256` completed successfully.

**Important boundary:** this is database-wrapper qualification, not yet a complete external provider lifecycle or production cutover. Legacy runtime grants remain unchanged; no production secret has been created; no production migration or deployment has occurred.

## Legacy storage grant cutover and rollback qualification — 2026-11-12

Added `scripts/qualify-storage-metadata-runtime-grant-revocation-postgres.mjs` and wired it into CI after provider dual-proof qualification.

The script is strictly restricted to the explicit localhost disposable database, requires the storage mutation opt-in, verifies all three database identities, and uses the migrator's `SET LOCAL ROLE ghm_schema_owner` path.

It discovers and snapshots the exact signatures and original ACLs for the five legacy SECURITY DEFINER storage functions:
- `storage_create_pending`
- `storage_get_object`
- `storage_mark_available`
- `storage_mark_deletion_pending`
- `storage_mark_deleted`

It then revokes PUBLIC and `ghm_runtime` execution in a committed disposable cutover, verifies the effective grants are gone, attempts direct calls using the runtime login and confirms SQLSTATE 42501, verifies all five Actor Gateway wrappers retain EXECUTE, and restores the original PUBLIC/direct-runtime grants exactly. A `finally` rollback path restores the snapshot if any assertion fails after the cutover.

The new qualification step passed in run `43233465264`. This is a disposable cutover-and-rollback rehearsal only. The original production grants remain unchanged. Do not merge or run this script against production as an operational cutover.

The same exact-head run also passed:
- TypeScript build.
- Full migration application to disposable PostgreSQL 18.
- Whole-database SECURITY DEFINER inventory.
- Provider secret provisioning and dual-proof adversarial qualification.
- The legacy five-function revocation and rollback qualification.

The complete repository-wide workflow for code head `dcbd0e317ba739e248674c73496ed0e50724c7e6` completed successfully in run `43233465264`, including the 959-test suite, storage provider dual-proof qualification, five-function storage grant revocation/rollback rehearsal, the remaining Actor Gateway signed-cutover qualifications, and the full auth issuer cutover qualification. The current branch head is `64b97062a63273cd80d42907f9f7fc65825b3f32` after this handover reconciliation; its exact-head workflow is `43233675132` and is running. Re-check that exact-head result before merging.



## Continuation checkpoint — 2026-11-12 14:26 UTC

This section supersedes earlier "not yet implemented" and "not yet qualified" checkpoints above. Those are retained as historical chronology, not current status.

### Current storage implementation

The five legacy metadata operations now route through the signed Storage Metadata Actor Gateway from the Resource API. The implementation includes actor-signed v2 assertions for create/read/deletion-pending and dual proof for provider-confirmed availability/deletion: the user actor assertion plus a separate Resource API HMAC attestation verified by PostgreSQL. The Actor Gateway does not possess the provider signing key. Production Resource API storage requires the Actor Gateway origin and provider-attestation secret and fails closed rather than falling back to direct runtime SQL.

The disposable PostgreSQL 18 adversarial qualification has been expanded beyond the initial provider transition checks. It exercises:
- Signed pending creation and metadata read.
- Private object read by a member and denial of cross-business private read.
- Non-member pending creation denial.
- Ordinary member deletion-request denial.
- Disabled actor denial even when that actor has an active administrator membership row.
- Legitimate pending → available → deletion-pending → deleted lifecycle.
- Invalid provider signature, expired attestation, context substitution, wrong provider operation, provider metadata mismatch without state transition, cross-business actor and nonce replay.
- Legacy function grant revocation/rollback, including direct-call denial for runtime, migrator and Actor Gateway database logins while preserving the five replacement wrapper grants.

### Latest CI failure and correction

Exact-head run `43236598348` failed only at the PostgreSQL 18 storage provider dual-proof qualification. The log identified the test fixture attempting to insert account_status='inactive'. The authoritative lifecycle constraint from `20260921120000_extend_account_identity_auth_lifecycle.sql` permits only `active` and `disabled`. This was a fixture defect, not a production schema change or a weakening of the test.

Corrected the fixture to `disabled` in commit `6bb280bf4d1793120a829ebb3687c7cab3b97179`. Exact-head CI run `43237111882` was triggered for that commit; at the time of this checkpoint, `web-quality` passed and the `quality` job was still running. Do not claim this run passed until its final conclusion is checked.

### Grant cutover rehearsal refinement

The disposable grant rehearsal at `scripts/qualify-storage-metadata-runtime-grant-revocation-postgres.mjs` now snapshots and revokes direct EXECUTE for PUBLIC, `ghm_runtime`, `ghm_migrator` and `ghm_actor_gateway` across the five legacy functions. It verifies all three database login roles are denied direct invocation, checks that the five replacement Actor Gateway wrapper grants remain, and restores the original execution state. The rehearsal remains localhost/disposable-only and uses the migrator `SET LOCAL ROLE ghm_schema_owner` path. It is not a production cutover script.

The design document was updated to reflect this expanded principal coverage in commit `1a2605cbc53a0551d57857e4f6b073f5ac5a3747`.

### Exact current checkpoint

- Construction branch: `construction/auth-issuer-isolation-20261112`.
- Branch HEAD after the latest documentation update must be queried before further edits or qualification claims.
- Latest code-fix commit: `6bb280bf4d1793120a829ebb3687c7cab3b97179`.
- Latest documentation commit: `1a2605cbc53a0551d57857e4f6b073f5ac5a3747`.
- Latest exact-head CI known at this checkpoint: run `43237111882`, not yet complete.
- The prior exact-head run `43236301670` passed before the disabled-actor fixture was added; do not use it as evidence for that new case.
- No production database, grants, roles, secrets, deployments, provider credentials or traffic were changed.
- No PR was merged. PR #272 remains a separate integration branch and must not be conflated with this construction branch.

### Remaining work

1. Check the exact-head CI for the disabled-actor fixture and grant-revocation refinement; fix any real failure and rerun.
2. Reconcile all affected security, storage, issuer and durable handover docs against the current source and actual CI evidence. Historical checkpoint paragraphs must be clearly superseded rather than silently treated as current.
3. Run the complete exact-head whole-database SECURITY DEFINER inventory and issuer/Actor Gateway qualification; retain the artifact and checksum.
4. Review production blockers independently: Render role-administration access, a fresh independently verified backup, approved deployment/network/rollback plan, and production secret provisioning. Do not bypass them.
5. Do not merge or perform production cutover. Founder approval and fully reconciled documentation remain mandatory.


## Retrieved whole-database inventory artifact — 2026-11-12 14:27 UTC

The successful exact code/fixture CI run `43237334881` preserved artifact `security-definer-authority-inventory` (ID `13952542959`), which was retrieved and inspected. ZIP SHA-256 `060094751895ed023ba1411679e0af9c2b60d86fe3`; JSON SHA-256 `8111ac1ff29f67d11961782d4bbe3f614bd1b650afb05f4fa1b723664db1869f`.

Captured without mutation from `ghm_disposable_test` on PostgreSQL 18.6 as `ghm_migrator` at `2026-11-12T14:27:50.233Z`: 103 SECURITY DEFINER routines, all owned by `ghm_schema_owner`, all in `ghm`, all trusted language, all pinned to `pg_catalog, ghm, pg_temp`; zero PUBLIC EXECUTE grants. The 75 preliminary grant findings group into direct EXECUTE grants for runtime 43, Actor Gateway 30, payment provider 2, migrator 1. These are grant inventory items requiring operation-by-operation review, not automatic vulnerability findings. The artifact's decision remains `REVIEW_REQUIRED_NO_AUTOMATIC_APPROVAL`.

The five new storage gateway wrappers are among the 30 Actor Gateway grants. The five legacy metadata functions remain among the 43 runtime grants in the post-rollback snapshot. The cutover test revokes them only during the disposable rehearsal, verifies runtime/migrator/Actor Gateway direct-call denial, verifies wrapper access, then restores the original state. This is not production revocation. The full migration security handover records the role-grant breakdown and the one explicitly scoped migrator mapping lookup.


## External provider end-to-end gate and latest CI — 2026-11-12

### Provider safety and coverage boundary

The repository's storage service and router tests now exercise the complete mocked workflow, including:
- authorization before upload persistence/provider access;
- pending metadata before upload grant;
- provider HEAD metadata and actual byte/image validation before availability;
- mismatch/spoofed image denial;
- available-only access grants;
- deletion-pending before provider deletion, retry after failure, and deleted only after provider success;
- abandoned pending upload cleanup through the existing deletion lifecycle;
- authenticated route behavior, original bearer-token forwarding, required-gateway fail-closed behavior, public approved-logo redirect, Business Logo replace/clear and cleanup retry.

The Resource API ↔ gateway HTTP client tests cover HTTPS origin validation, redirect rejection, bearer-token forwarding, typed responses, and provider attestation signing. These tests use controlled/mock providers; they are not a deployed external-provider end-to-end run.

The live Cloudflare R2 adapter test passed on 2026-10-26 for signed PUT, provider HEAD metadata, signed GET/payload integrity, DELETE and post-delete absence. However, its target bucket was `zaid-ghm-production`, recorded as the only bucket then created. The evidence explicitly says it is not established as a dedicated non-production bucket. **Do not run further live mutation tests against that bucket by default.** A dedicated non-production bucket/container and deployment-managed test credentials are required before running the full new Resource API ↔ Actor Gateway ↔ PostgreSQL ↔ R2 lifecycle. This avoids accidentally mutating production storage and does not authorize new paid infrastructure.

### Inventory interpretation clarification

The 103-routine inventory was captured after the guarded manual-cutover rehearsal scripts had restored their original ACL state. It is therefore a pre-cutover baseline: `ghm_auth_issuer` has no `ghm` schema USAGE or direct function grants in this snapshot, as expected before the isolated issuer cutover. The same CI workflow separately qualifies the ten-function issuer allow-list and disposable cutover/rollback. Do not read the inventory's issuer-zero baseline as a failed issuer qualification or as the post-cutover production state.

### Latest exact-head CI

The complete CI workflow passed in run `43238876670` at source/docs head `fab9f6389d7a7e992dfc93786a42394bbb8064a1`; both `quality` and `web-quality` passed. This includes the 960/960 main test suite, PostgreSQL 18 storage dual-proof and legacy grant rollback qualification, whole-database inventory, and issuer/Actor Gateway cutover qualifications. Further documentation-only reconciliations followed; the current exact branch head and its latest CI run must be checked before claiming final exact-head status.


## Final exact-head storage read-state hardening and inventory — 2026-11-12 14:53 UTC

### Public metadata read lifecycle guard

A final source review compared the new signed gateway_storage_get_object wrapper against the existing account-scoped legacy getter. It found that the new public Business Logo read exception did not explicitly require status='available'. Although the service separately refused download grants for non-available rows, the database metadata read boundary should preserve the legacy status predicate itself.

Fixed database/migrations/20261112140000_add_signed_storage_metadata_actor_gateway.sql so the cross-business public read exception requires an active Business, a public Business Logo identity, and so.status='available'. Private reads still require active membership; owner/administrator mutations remain separately enforced. This does not change the separate public directory projection, which continues to require an active, verified and approved Business.

The PostgreSQL 18 qualification now proves:
- pending public metadata is not readable cross-business;
- available public Business Logo metadata remains publicly readable;
- deletion-pending public metadata is not readable cross-business;
- deleted public metadata is not readable cross-business;
- private object reads still require membership.

All four new lifecycle-state checks passed in exact-head CI run 43241401707, alongside the complete storage dual-proof and grant-revocation/rollback qualification. The main test suite passed 960/960.

### Latest whole-database inventory artifact

The same successful exact-head run 43241401707 preserved artifact security-definer-authority-inventory, ID 13955835753, captured at 2026-11-12T14:51:19.189Z without mutation from ghm_disposable_test on PostgreSQL 18.6 as ghm_migrator.

- ZIP SHA-256: b0549ff7d1b339551f29d127d06496a3c7f853d54ea3e528bd81509f0e6b8dd2
- JSON SHA-256: c20b8c75591b1cabf8f0e52d8028c8002d86da0105acb822351c42d1021926d1
- SECURITY DEFINER routines: 103
- Preliminary non-owner grant findings: 75, requiring human review rather than automatic approval
- All 103 owned by ghm_schema_owner, in schema ghm, trusted languages, exact pinned path pg_catalog, ghm, pg_temp
- PUBLIC EXECUTE grants: 0
- Direct EXECUTE grants: runtime 43, Actor Gateway 30, payment provider 2, migrator 1
- The inventory confirms the updated gateway_storage_get_object definition includes the available state guard.

The inventory remains a disposable pre-cutover baseline, not production catalog evidence. The 75 grant entries must continue to be reviewed against each role's application call path; the five legacy storage grants remain present in the restored baseline.

### Exact branch checkpoint

- Branch: construction/auth-issuer-isolation-20261112
- HEAD: 4ba231ec566e75780ab5a435d7b365f07c1dacbc
- CI run: 43241401707 — both quality and web-quality passed.
- Main test suite: 960/960 passed.
- Storage dual-proof, pending/available/deletion-pending/deleted public-read checks, five-function grant revocation/rollback, issuer cutover qualification, and whole-database inventory: passed.
- No production database, grants, roles, secrets, provider credentials, deployments, buckets or traffic were changed. No PR was merged.

The next genuine storage qualification gate remains the deployed full Resource API ↔ Actor Gateway ↔ PostgreSQL ↔ external provider journey. The existing R2 bucket zaid-ghm-production is not proven to be a non-production target; do not mutate it for this work. A dedicated non-production target is required. Production cutover remains blocked by fresh verified backup, Render role-administration access and approved deployment/network/rollback planning.
