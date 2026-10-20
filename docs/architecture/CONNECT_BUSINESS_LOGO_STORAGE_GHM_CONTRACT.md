# Connect Business Logo Storage → GHM Contract

**Status:** Contract proposal only — storage provider, canonical asset schema, and data migration are not yet qualified.

## Purpose

Move Connect's governed Business logo upload/removal off Supabase Storage and UUID-based RPCs without weakening owner authorization, file validation, object cleanup, or public directory rendering.

The current implementation lives in `src/lib/businessLogo.js` and `businessService.uploadLogo/clearLogo` in `src/lib/lib_supabase.js`. It uses the public `media` bucket, a deterministic `logos/{supabase-business-uuid}/logo.{jpg|jpeg|png|webp}` object path, and the `set_business_logo`/`clear_business_logo` RPCs.

The GHM-backed Connect profile editor now fails closed and disables upload/removal until an equivalent GHM contract exists. Do not pass numeric GHM Business IDs into the legacy UUID service.

## Authority and asset identity

- GHM owns the canonical numeric Business ID and must authorize each upload/delete using an active owner/administrator membership and `business.manage` capability for that exact Business.
- The client must not choose an arbitrary Business ID, object path, or public logo URL and expect the backend to bind it.
- Store an opaque canonical `logo_ref`/asset key against `ghm.business`; derive the public URL from trusted server configuration. Never accept a caller-supplied `logo_url` as an authoritative write.
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
