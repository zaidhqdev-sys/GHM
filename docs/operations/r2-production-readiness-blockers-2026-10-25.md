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

Latest observed CI run for commit `b4c4012a5fbc5057188e2c8ec192a67ebe2b5d48` was still in progress when this note was updated; do not treat these changes as test-passed until the run completes.

## Remaining blockers

- The canonical storage schema migration is still not authored. I have not created one by guessing at the database security conventions: the current runtime calls `SECURITY DEFINER` lifecycle functions while the runtime role should not have direct table DML, and the migration must define the exact object shape, transitions, ownership, grants, and tenant-boundary protections correctly. A guessed migration could create a cross-tenant write vulnerability.
- HTTP route-level tests and explicit cross-tenant/database-privilege qualification remain outstanding.
- No database, Render environment, production service, or sandbox service was changed.
