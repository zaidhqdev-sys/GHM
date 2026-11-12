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

