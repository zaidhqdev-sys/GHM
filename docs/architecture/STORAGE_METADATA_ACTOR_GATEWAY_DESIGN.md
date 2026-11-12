# Storage Metadata Actor Gateway Design

**Status:** approved implementation target; not yet implemented or qualified  
**Date:** 2026-11-12  
**Scope:** replace direct Resource API runtime execution of the five non-public storage metadata SECURITY DEFINER functions with signed Actor Gateway operations.

## Security finding

The whole-database SECURITY DEFINER inventory and function-body review identified five functions still directly executable by `ghm_runtime` that do not independently bind the requested operation to an authenticated database actor:

- `ghm.storage_create_pending`
- `ghm.storage_get_object`
- `ghm.storage_mark_available`
- `ghm.storage_mark_deletion_pending`
- `ghm.storage_mark_deleted`

The Resource API currently performs membership and provider checks before calling them. Those checks do not constrain a holder of the shared `ghm_runtime` database credential who invokes the functions directly. This is an open finding. Existing grants must remain until the replacement is implemented and qualified.

## Trust boundary and assertion contract

Extend the existing isolated Actor Gateway and v2 one-use HMAC-SHA256 assertion mechanism. Do not create a second gateway, assertion format, secret, or principal.

- The HTTP gateway verifies the GHM ES256 bearer token once and derives the actor account ID exclusively from its verified subject.
- The Actor Gateway database connection uses `ghm_actor_gateway`.
- Each database wrapper calls `ghm.assert_actor_gateway_capability`, which requires that session login, an active actor, a timestamp within the existing 60-second window, a unique nonce, the exact operation name, and a full 32-byte HMAC comparison.
- Each wrapper compares the signed JSON context with the actual SQL arguments. Object-targeted operations derive the tenant/business from the stored object row; callers cannot substitute a different tenant ID.
- Extend the existing verifier operation allow-list only for the five storage operation names below. Preserve the shared verifier's current checks and nonce behavior.

## Typed operation contract

| Operation | Signed context / arguments | Database authorization |
|---|---|---|
| `storage.metadata.create` | businessId, resourceType, resourceId, objectClass, providerKey, contentType, byteSize, visibility | Active actor; resource must be the supported Business resource; current owner/administrator membership for the supplied Business; validate required metadata invariants before invoking the existing pending-row function. |
| `storage.metadata.read` | objectId | Active actor. Resolve the object by ID inside the wrapper. Preserve the existing public-read exception only for an active Business and its public Business Logo; otherwise require current Business membership. Return no row for an inaccessible/nonexistent object, preserving the existing not-found behavior. |
| `storage.metadata.mark_available` | objectId, checksum | Resolve Business from the object row; require active owner/administrator membership; preserve the existing pending-to-available transition and metadata constraints. |
| `storage.metadata.mark_deletion_pending` | objectId | Resolve Business from the object row; require active owner/administrator membership; preserve the existing retry/idempotency semantics. |
| `storage.metadata.mark_deleted` | objectId | Resolve Business from the object row; require active owner/administrator membership; preserve the existing deletion-pending-to-deleted lifecycle. |

The wrappers may delegate to the existing storage functions after establishing the signed actor and authorization predicates. The legacy functions must not remain directly callable by `ghm_runtime` after the manual cutover. The public approved-logo lookup `ghm.storage_get_public_business_logo` is a separate, narrowly scoped public projection and remains unchanged unless new evidence requires otherwise.

## Preserve provider lifecycle and API behavior

The Resource API remains responsible for object-store interactions; the database gateway is the authority for metadata and actor/tenant authorization.

1. Upload: validate policy, request signed metadata creation, then request the provider upload grant. A provider grant failure must not create an authorization bypass; existing pending-object cleanup/recovery behavior must be retained or explicitly qualified.
2. Completion: read metadata through the gateway, verify provider HEAD size/content type, fetch and validate actual bytes, then request signed `mark_available`. A provider mismatch must never produce an available row.
3. Download: read metadata through the gateway, enforce the existing visibility/public-business behavior, then issue a provider download grant only for an available object.
4. Deletion: read metadata through the gateway, authorize the manager, mark deletion pending, delete from the provider, then mark deleted. A failed provider deletion leaves the object deletion-pending and retryable.

The gateway must not accept provider claims from an HTTP caller as proof of upload or deletion. Provider verification remains in the trusted Resource API storage service, while the database gateway independently enforces actor, tenant, target and operation authority.

## Resource API integration

Replace the five direct calls in `src/storage/repository.ts` with a typed `StorageMetadataGatewayClient` when the gateway is configured/required. The client forwards the original verified GHM bearer token, uses HTTPS origin validation, rejects redirects, bounds request time, and fails closed when the required gateway is unavailable. Remove the Resource API runtime's direct function dependency only after end-to-end gateway wiring is in place.

The existing Resource API authorization adapter remains useful as defense in depth but is not the database security boundary. The gateway's signed actor is authoritative. Do not silently fall back to direct legacy RPC execution when gateway mode is required.

## Manual cutover

Add a separate manual-only SQL cutover for the five legacy functions. It must fail closed unless `session_user = 'ghm_migrator'` and `current_user = 'ghm_schema_owner'`, and revoke direct EXECUTE from `PUBLIC`, `ghm_runtime`, `ghm_migrator`, and `ghm_actor_gateway` as appropriate to the observed ACL matrix. Preserve only explicitly justified grants. Include a database-only rollback script with the same operator identity guard. Do not apply either script to production as part of this construction work.

## Required qualification

Use disposable PostgreSQL 18.6 and the real migration chain. Tests must prove:

- Runtime direct invocation of all five legacy functions is denied after cutover.
- Signed gateway operations succeed for authorized actors.
- Cross-tenant object reads and mutations are denied.
- Non-member pending-object creation is denied.
- Member-but-not-owner/administrator lifecycle mutations are denied.
- Inactive actors are denied.
- Forged, expired, replayed, wrong-operation, wrong-object and context-substituted assertions are denied.
- Public approved-logo lookup still works for an active public Business without Business membership; unapproved/inactive/non-public objects are not exposed.
- Provider HEAD metadata mismatch, byte-length mismatch and invalid image bytes never transition an object to available.
- Upload grant, completion, public logo read, authenticated read, deletion, provider failure and deletion retry workflows retain their intended behavior.
- Startup/grant verifiers and whole-database inventory reflect the post-cutover privilege boundary.
- The manual cutover and rollback both reject an unexpected operator identity.

## Explicit non-goals and release gates

- No production role/grant changes, migration, secret change, deployment, service creation or traffic routing.
- No paid infrastructure.
- Do not change Saved Business semantics; it remains user favourites/bookmarks.
- Do not merge the construction branch or conflate it with PR #272.
- Production remains blocked independently by Render role-administration resolution, a fresh independently verified backup, and an approved deployment/network/rollback plan.
