# Connect Business Logo Storage → GHM Contract

**Status:** Canonical GHM upload/bind/clear/public API lifecycle is implemented on GHM PR #272, but complete deployed non-production lifecycle qualification remains a hard gate. The database binding actor-provenance boundary is being moved behind the signed Actor Gateway; exact-head qualification is pending. The S3-compatible Cloudflare R2 provider path passed provider-level qualification on 2026-10-26, but deployed upload, public rendering and cleanup recovery are not yet qualified.

## Purpose

Move Connect's governed Business logo upload/removal off Supabase Storage and UUID-based RPCs without weakening owner authorization, file validation, object cleanup, or public directory rendering.

The current implementation lives in `src/lib/businessLogo.js` and `businessService.uploadLogo/clearLogo` in `src/lib/lib_supabase.js`. It uses the public `media` bucket, a deterministic `logos/{supabase-business-uuid}/logo.{jpg|jpeg|png|webp}` object path, and the `set_business_logo`/`clear_business_logo` RPCs.

The GHM-backed Connect profile editor now fails closed and disables upload/removal until an equivalent GHM contract exists. Do not pass numeric GHM Business IDs into the legacy UUID service.

## Authority and asset identity

- GHM owns the canonical numeric Business ID and must authorize each upload/delete using an active owner/administrator membership and `business.manage` capability for that exact Business.
- The client must not choose an arbitrary Business ID, object path, or public logo URL and expect the backend to bind it.
- Store the canonical `storage_object.id` in `ghm.business.logo_storage_object_id`; never accept a caller-supplied `logo_url` or provider key as an authoritative write. The object is tenant/resource checked before binding.
- Keep logo assets distinct from private verification/registration documents. A public logo must not imply that any other file in the same storage provider is public.
- A legacy Supabase UUID path must not be rewritten as a numeric path by string substitution. Any existing-logo copy requires a separately verified canonical Business mapping and an idempotent data-migration plan.

## Provider decision gate

No storage provider is currently qualified by this contract. Before implementation, choose and document an object store/CDN supported by the deployment environment (for example, an approved S3-compatible object store or managed blob provider), and verify:

- server-side credentials are available to GHM without shipping them to the browser;
- object keys are deterministic and tenant-scoped;
- public-read URLs are HTTPS and use a trusted configured origin;
- upload, overwrite, and delete semantics are documented;
- object size/type constraints and lifecycle policies are enforced;
- preview, non-production, backup, and rollback behavior are understood.

Do not use ephemeral application-container disk as durable logo storage. Do not assume a provider is configured merely because the application can generate a URL.

## Candidate operations

### Upload/replace

Candidate route: `PUT /api/v1/businesses/:businessId/logo`.

1. Authenticate the caller with GHM bearer auth.
2. Parse the canonical numeric Business ID strictly (positive safe integer; no string coercion).
3. Require active owner/administrator membership and `business.manage` for that Business.
4. Enforce a maximum payload size of 2 MiB at the HTTP boundary and again in the service.
5. Validate file bytes/signature server-side. Allow JPEG, PNG, and WebP only; reject SVG, GIF, HEIC/HEIF, empty files, malformed images, and mismatched MIME/signature.
6. Enforce a longest image edge of at most 2048 px using a trusted image decoder; client-provided dimensions are not authoritative.
7. Derive the extension from validated bytes, not from an untrusted filename. Use a canonical key such as `logos/{businessId}/logo.{jpg|png|webp}`; never interpolate arbitrary path fragments.
8. Write the new object, then atomically bind the canonical `logo_ref` to the Business. If the database bind fails, remove the newly written object and leave the previous reference intact.
9. After the new reference is committed, remove obsolete logo variants. Cleanup failure must be observable/retryable and must not roll the Business back to a stale URL.
10. Return the canonical Business projection with a derived `logoUrl`, not storage credentials or a caller-supplied URL.

### Clear

Candidate route: `DELETE /api/v1/businesses/:businessId/logo`.

1. Re-check GHM auth and `business.manage`.
2. Clear the canonical Business `logo_ref` first.
3. Delete the previously referenced object(s) and return a structured cleanup status if object deletion fails after the reference was cleared.
4. Do not restore a stale public reference when object cleanup fails; support a retry/cleanup job.

### Public projection

- Public directory and saved-Business APIs may return a derived `logoUrl` only when it comes from the canonical GHM asset reference and trusted public origin.
- No wildcard select after adding private asset fields.
- A missing or invalid reference returns `null`; do not fall back to an arbitrary URL supplied by the client.
- Public caching may be enabled for content-addressed or versioned URLs; if using a fixed path, define cache invalidation/versioning so replacements become visible.

## Compatibility and migration

- Preserve the current accepted formats and 2 MiB limit; the legacy helper also intends a 2048 px longest-edge limit, but its browser-side check is optional and not authoritative.
- Preserve the old behavior of replacing previous logo variants and clearing the database reference before delete cleanup, while making the GHM write/cleanup failure states explicit.
- GHM Business IDs are numeric and legacy Connect Business IDs are UUIDs. Existing object-copy work must use a verified mapping table/crosswalk, not email/name matching or ID coercion.
- Keep the Connect editor's upload/removal controls disabled until this contract is implemented and non-production tested.

## Required verification

1. Service tests for allowed MIME/signature pairs, extension spoofing, empty/oversized/malformed images, pixel bounds, path traversal, and non-canonical IDs.
2. Authorization tests for no session, inactive membership, unrelated Business, member-only role, and missing `business.manage`.
3. Object-store adapter tests for upload, replace, clear, delete failure, and deterministic keys.
4. Transaction/compensation tests proving old logo reference survives a failed upload/bind and new objects are removed when DB binding fails.
5. Public directory/saved-Business contract tests proving `logoUrl` is derived from canonical storage and private object keys/credentials are not exposed.
6. Deployed non-production tests for upload, replace, public rendering, remove, and cleanup retry.
7. A separately reviewed data-migration plan for any existing Supabase logo objects and verified UUID→numeric Business mapping.

## Explicitly not authorized

- Production provider provisioning, secret creation, or cutover.
- Automatic migration of logo objects by guessing Business identity.
- Browser-held storage credentials or arbitrary caller-supplied public URLs.
- Reusing the public-logo store for private registration or verification documents.
- Re-enabling legacy Supabase logo upload/remove in the GHM numeric-ID profile editor.

## Current implementation checkpoint — GHM PR #272

- Migration `20261106090000_business_logo_storage_binding.sql` adds `ghm.business.logo_storage_object_id`, a unique canonical reference to `ghm.storage_object`.
- `ghm.set_business_logo_object(account_id, business_id, storage_object_id)` re-checks active owner/administrator membership and verifies tenant Business ID, resource identity, `business_logo` class, public visibility and available status before binding. It returns the previous object ID so the API can clean up after replacement.
- `ghm.storage_get_public_business_logo(business_id)` returns only the provider key for an available public logo belonging to an active, verified and approved Business.
- HTTP routes are being added for authenticated PUT/DELETE logo binding and anonymous public logo redirect through a short-lived provider download grant. Replacement/clear binds or clears the canonical reference before deleting the previous object; cleanup failures return HTTP 202 with a retry object ID.
- Business Identity, public Business profile and public Directory projections now return the GHM public logo route when a canonical logo object is bound.
- These changes are construction-only on `integration/capability-gateway-qualification-20261110` in PR #272. Migrations and manual cutovers are qualified only against disposable CI PostgreSQL; no production database has been migrated and no provider bucket or credential has been changed.

## Database actor-provenance remediation — in progress

The active HTTP binding route previously called `ghm.set_business_logo_object(account_id,business_id,storage_object_id)` directly using the Resource API's runtime database credential. The function trusts the supplied account ID for its membership check. PR #272 now adds a signed Actor Gateway wrapper (`business.logo.bind`) that binds the JWT-derived actor, Business ID and nullable object ID in the HMAC assertion; the Resource API forwards the original bearer token and production fails closed when the gateway is unavailable. A separate manual cutover revokes runtime EXECUTE on the legacy function. This batch is IMPLEMENTED / QUALIFICATION PENDING until its exact-head disposable PostgreSQL and full CI checks pass. Do not apply the manual cutover in production.

## Remaining hard gate before Connect enables upload controls

- Storage completion now downloads the bounded object bytes through the provider, verifies the actual JPEG/PNG/WebP signature against the declared content type, checks the file structure/header and reads pixel dimensions, and enforces the 2 MB and 2048-pixel longest-edge limits before marking metadata available. This is header/structure validation, not a full image decoder or re-encoder; the public route serves only fixed image MIME types with nosniff protection.
- The legacy browser helper's MIME/size/dimension checks are not an authoritative security boundary. Server-side signature/header and dimension validation is now implemented and covered by tests. A full decoder/re-encoder remains a possible hardening step, but is not a substitute for the required deployed lifecycle qualification.
- Qualify complete upload → complete → bind → public redirect/render → replace → clear → cleanup retry using an explicitly approved non-production storage target. The provider-level R2 qualification alone is insufficient.
- Until the complete upload → complete → bind → public redirect/render → replace → clear → cleanup-retry journey passes against an explicitly approved non-production bucket, Connect must keep logo upload/removal disabled and must not call the legacy UUID-based Supabase logo service with numeric GHM Business IDs.



## Additional shared storage metadata security gate

The signed Business Logo binding wrapper is only one database-boundary control. A follow-on audit found the shared storage metadata SECURITY DEFINER functions still rely on application-side authorization and a trusted shared runtime credential: `storage_get_object(bigint,bigint)` accepts a caller-supplied account ID; `storage_create_pending` accepts tenant/resource identity; and the mark-available/deletion-pending/deleted lifecycle functions accept object IDs without a signed actor assertion. These functions are used by upload completion, access and deletion as well as logo flows. Existing storage qualification does not prove forged-actor or direct cross-tenant lifecycle resistance.

This remains a separate OPEN GHM storage workstream. Do not revoke the existing storage lifecycle EXECUTE grants or claim the complete storage subsystem is security-qualified until the signed metadata gateway covers create/get/complete/cleanup transitions and all upload, public-read, replacement, clear and deletion flows pass disposable PostgreSQL qualification. The Business Logo binding cutover alone does not close this gate.
