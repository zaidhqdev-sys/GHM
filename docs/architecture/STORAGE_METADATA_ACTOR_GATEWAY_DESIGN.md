# Storage Metadata Actor Gateway Design

**Status:** implemented in source; disposable PostgreSQL 18 migration, adversarial and grant rollback qualification passed; production cutover not performed  
**Date:** 2026-11-12  
**Scope:** replace direct Resource API runtime execution of the five non-public storage metadata SECURITY DEFINER functions with signed Actor Gateway operations.

## Security finding

The whole-database SECURITY DEFINER inventory and function-body review identified five functions still directly executable by `ghm_runtime` that do not independently bind the requested operation to an authenticated database actor:

- `ghm.storage_create_pending`
- `ghm.storage_get_object`
- `ghm.storage_mark_available`
- `ghm.storage_mark_deletion_pending`
- `ghm.storage_mark_deleted`

The Resource API previously performed membership and provider checks before calling these functions. Those checks did not constrain a holder of the shared `ghm_runtime` database credential invoking them directly. The source remediation is now implemented: Resource API metadata operations use signed Actor Gateway wrappers and provider-confirmed transitions require a separate Resource API HMAC attestation verified inside PostgreSQL. The five legacy functions remain directly executable by `ghm_runtime` in production until the separately approved manual cutover. The cutover and exact rollback have been rehearsed successfully on disposable PostgreSQL 18.

## Trust boundary and assertion contract

Extend the existing isolated Actor Gateway and v2 one-use HMAC-SHA256 assertion mechanism. Do not create a second gateway, assertion format, secret, or principal.

- The HTTP gateway verifies the GHM ES256 bearer token once and derives the actor account ID exclusively from its verified subject. For mark-available and mark-deleted, the user bearer token alone is insufficient: the database also requires the separately signed provider-workflow attestation.
- The Actor Gateway database connection uses `ghm_actor_gateway`.
- Each database wrapper calls `ghm.assert_actor_gateway_capability`, which requires that session login, an active actor, a timestamp within the existing 60-second window, a unique nonce, the exact operation name, and a full 32-byte HMAC comparison.
- Each wrapper compares the signed JSON context with the actual SQL arguments. Object-targeted operations derive the tenant/business from the stored object row; callers cannot substitute a different tenant ID.
- The existing verifier operation allow-list now includes the five storage operation names below. Preserve the shared verifier's existing checks and nonce behavior.

## Typed operation contract

| Operation | Signed context / arguments | Database authorization |
|---|---|---|
| `storage.metadata.create` | businessId, resourceType, resourceId, objectClass, providerKey, contentType, byteSize, visibility | Active actor; resource must be the supported Business resource; current owner/administrator membership for the supplied Business; validate required metadata invariants before invoking the existing pending-row function. |
| `storage.metadata.read` | objectId | Active actor. Resolve the object by ID inside the wrapper. Preserve the existing public-read exception only for an active Business and its public Business Logo in `available` state; pending, deletion-pending and deleted public objects are not readable cross-business. Otherwise require current Business membership. Return no row for an inaccessible/nonexistent object, preserving the existing not-found behavior. |
| `storage.metadata.mark_available` | objectId, checksum, providerKey, contentType, byteSize | Resolve Business and provider metadata from the object row; require active owner/administrator membership plus a valid separate provider attestation; preserve the pending-to-available transition. |
| `storage.metadata.mark_deletion_pending` | objectId | Resolve Business from the object row; require active owner/administrator membership; preserve the existing retry/idempotency semantics. |
| `storage.metadata.mark_deleted` | objectId, providerKey | Resolve Business/provider key from the object row; require active owner/administrator membership plus a valid separate provider attestation; preserve the deletion-pending-to-deleted lifecycle. |

The wrappers may delegate to the existing storage functions after establishing the signed actor and authorization predicates. The legacy functions must not remain directly callable by `ghm_runtime` after the manual cutover. The public approved-logo lookup `ghm.storage_get_public_business_logo` is a separate, narrowly scoped public projection and remains unchanged unless new evidence requires otherwise.

## Preserve provider lifecycle and API behavior

The Resource API remains responsible for object-store interactions; the database gateway is the authority for metadata and actor/tenant authorization.

1. Upload: validate policy, request signed metadata creation, then request the provider upload grant. A provider grant failure must not create an authorization bypass; existing pending-object cleanup/recovery behavior must be retained or explicitly qualified.
2. Completion: read metadata through the gateway, verify provider HEAD size/content type, fetch and validate actual bytes, then request signed `mark_available`. A provider mismatch must never produce an available row.
3. Download: read metadata through the gateway, enforce the existing visibility/public-business behavior, then issue a provider download grant only for an available object.
4. Deletion: read metadata through the gateway, authorize the manager, mark deletion pending, delete from the provider, then mark deleted. A failed provider deletion leaves the object deletion-pending and retryable.

The gateway must not accept provider claims from an HTTP caller as proof of upload or deletion. Provider verification remains in the trusted Resource API storage service, while the database gateway independently enforces actor, tenant, target and operation authority.

## Resource API integration

The Resource API storage router now uses `HttpStorageMetadataGatewayClient` through `src/http/storage-router.ts` and `src/http/app.ts`. The client forwards the original verified GHM bearer token, validates the HTTPS Actor Gateway origin, rejects redirects, bounds request time/response size, and signs provider-transition attestations. Production storage requires `GHM_ACTOR_GATEWAY_URL` and `GHM_STORAGE_PROVIDER_WORKFLOW_ATTESTATION_SECRET` and fails closed if either is missing. `src/storage/repository.ts` remains as a non-production/development fallback only; production cannot silently fall back to direct legacy function execution.

The existing Resource API authorization adapter remains useful as defense in depth but is not the database security boundary. The gateway's signed actor is authoritative. Do not silently fall back to direct legacy RPC execution when gateway mode is required.

## Manual cutover

The five-function cutover and rollback have been rehearsed on disposable PostgreSQL 18 by `scripts/qualify-storage-metadata-runtime-grant-revocation-postgres.mjs`. It verifies `session_user = 'ghm_migrator'` and `current_user = 'ghm_schema_owner'`, snapshots the PUBLIC, `ghm_runtime`, `ghm_migrator` and `ghm_actor_gateway` execution state, revokes EXECUTE from all four principals, confirms direct calls fail for runtime, migrator and Actor Gateway logins, verifies the five replacement Actor Gateway wrapper grants remain, and restores the original execution state. The rehearsal leaves the five production legacy grants unchanged. The rehearsal script is qualification evidence, not the production cutover script. Production revocation remains a separate manual operation requiring a fresh verified backup, role-administration access and approval. No production grants were changed.

## Required qualification

Disposable PostgreSQL 18 qualification has proved the following in the completed expanded storage step of run `43236301670`; subsequent exact-head runs are rechecking the expanded fixture and full repository suite:

- Direct invocation of all five legacy functions is denied for `ghm_runtime`, `ghm_migrator` and `ghm_actor_gateway` during the disposable cutover rehearsal, then the original execution state for the four modified principals is restored.
- Signed gateway operations succeed for authorized owners/administrators, including pending creation, metadata read, availability, deletion request and provider-confirmed deletion.
- Cross-business private-object reads and cross-business mutations are denied.
- Non-member pending-object creation is denied.
- Member-but-not-owner/administrator lifecycle mutations are denied.
- Inactive actors are denied.
- Invalid provider signatures, expired attestations, replayed nonces, wrong provider operations and provider-context substitution are denied; actor context is bound to the database arguments.
- Public approved-logo lookup still works for an active public Business without Business membership; unapproved/inactive/non-public objects are not exposed.
- Provider metadata mismatch is denied without changing a pending row. Existing Resource API storage-service tests continue to cover provider HEAD/byte/image validation; the new PostgreSQL qualification proves the database does not accept mismatched stored metadata.
- Upload grant, completion, public logo read, authenticated read, deletion, provider failure and deletion retry workflows retain their intended behavior.
- Startup/grant verifiers and whole-database inventory reflect the post-cutover privilege boundary.
- The manual cutover and rollback both reject an unexpected operator identity.

## Explicit non-goals and release gates

- No production role/grant changes, migration, secret change, deployment, service creation or traffic routing.
- No paid infrastructure.
- Do not change Saved Business semantics; it remains user favourites/bookmarks.
- Do not merge the construction branch or conflate it with PR #272.
- Production remains blocked independently by Render role-administration resolution, a fresh independently verified backup, and an approved deployment/network/rollback plan.

## Critical separation: user authority versus trusted provider workflow

A user bearer token alone must **not** authorize provider-completion transitions. Because the Actor Gateway is reachable over HTTPS, an authenticated manager could otherwise call a new `mark_available` endpoint directly and bypass the Resource API's provider HEAD/byte validation. Likewise, a direct user call to `mark_deleted` must not claim that the object-store deletion has already happened. The gateway must not treat "the Resource API normally checks this first" as proof.

Use two distinct authorization classes:

1. **Actor-authorized metadata operations:** create pending, metadata read, and request deletion-pending. These are bound to the verified GHM actor JWT, exact operation, object/business context and database membership/role predicates. The HTTP route may be user-reachable because the database wrapper independently enforces the user's actual authority.
2. **Resource-service workflow transitions:** mark available and mark deleted. These must be inaccessible with only an end-user bearer token. Require an additional Resource API service-to-service attestation, distinct from the user's JWT and the database HMAC assertion. The attestation must be bound to operation, object ID, tenant/business, expected transition, provider verification result and short expiry/nonce; only the Resource API storage workflow may mint it after successful provider verification/deletion. The Actor Gateway validates the provider-attestation envelope shape and forwards its fields unchanged; it does not possess the provider signing key and cannot mint the proof. PostgreSQL cryptographically verifies the provider HMAC, operation, timestamp, context and nonce. The Actor Gateway separately produces the signed actor assertion. Do not expose these operations through ordinary user-authorized routes.

The service attestation is an additional application-to-application trust boundary, not a substitute for the database's signed actor/tenant assertion. It must use a dedicated secret/configuration with strict startup validation, HTTPS, redirect rejection, bounded body size, short expiry, replay protection, and no logging of credentials. Do not reuse the public actor assertion secret as the service credential. If the existing deployment/network constraints cannot protect this channel adequately, pause implementation and return with a decision rather than silently exposing the transition endpoints.

### System cleanup and provider deletion retry

The current product lifecycle allows abandoned pending uploads to be cleaned up, and deletion retries may run without an interactive user. Do not invent a user actor for these operations. First enumerate every cleanup caller and decide whether it is an authenticated owner/admin action or a true background/system job. For a true system job, define a separate narrowly scoped service operation/credential that can only target eligible expired pending objects (and, if needed, retry deletion-pending objects after provider deletion) under explicit age/state predicates. It must not accept arbitrary Business/object IDs as unconstrained authority. Its own signed context and database-side invariants must be qualified. If no current background cleanup caller exists, do not build a speculative system API; retain the user-authorized manager cleanup path and document that scope.

### Provider evidence must be explicit

The Actor Gateway database wrapper cannot independently prove an object-store side effect merely from an object ID. The Resource API's provider HEAD/content/byte validation and successful provider delete must be represented by the separate service attestation above, or by a future independently verified provider callback/attestation design. The database wrapper should bind and consume that evidence exactly once, alongside the object and transition. A plain boolean such as `providerVerified: true` supplied in JSON is not evidence.

This two-class design supersedes any reading of the earlier table that a normal user JWT alone may invoke all five operations. The implementation must not proceed with a user-callable `mark_available` or `mark_deleted` route.

## Refined provider-attestation contract

The implementation target for the two provider-confirmed transitions is a dual-proof wrapper. The ordinary user JWT and the Resource API's provider-workflow proof establish different facts and neither substitutes for the other.

### Database proof

Add a dedicated `ghm.storage_provider_workflow_attestation_secret` singleton table and `ghm.storage_provider_workflow_attestation_nonce` replay table, both owned by `ghm_schema_owner`. Revoke all table access from `PUBLIC`, `ghm_runtime`, `ghm_actor_gateway` and `ghm_migrator`. Add a SECURITY DEFINER verifier `ghm.assert_storage_provider_workflow_attestation` callable only from the Actor Gateway database login. It verifies a canonical 32-byte HMAC-SHA256, exact operation, 60-second timestamp window, active one-use nonce and constant-time full 32-byte comparison. Its signed payload is domain-separated from the user actor assertion, for example `ghm-storage-provider:v1|<operation>|<issuedAt>|<nonce>|<hex-encoded-context>`.

The secret must be provisioned independently to the Resource API signing environment and the database secret row through a documented, audited operator process. It must not be embedded in migrations, committed files, the Actor Gateway environment, or a general runtime database-readable table. The disposable provisioning path is implemented and tested in `scripts/provision-storage-provider-attestation-secret.mjs`: it requires the explicit localhost disposable database and migrator URL, mutation opt-in, `session_user = ghm_migrator`, `SET LOCAL ROLE ghm_schema_owner`, and never logs the secret. No production secret has been provisioned.

### Dual-proof transition wrappers

- `gateway_storage_mark_available` receives the user actor v2 assertion plus the provider attestation. The actor assertion binds `objectId`, `checksum`, `providerKey`, `contentType`, `byteSize` and the actor operation `storage.metadata.mark_available`. The provider attestation binds the same fields plus the stored tenant/business ID and operation `storage.provider.mark_available`. The wrapper derives the tenant and canonical provider key from the stored row, compares every field to the row, requires an active owner/administrator membership for the actor, requires the row to be `pending`, consumes both nonces, then performs the transition.
- `gateway_storage_mark_deleted` receives the user actor v2 assertion plus provider attestation. Both bind `objectId`, stored tenant/business ID and provider key; operations are `storage.metadata.mark_deleted` and `storage.provider.mark_deleted`. The wrapper derives tenant/provider key from the stored row, requires active owner/administrator membership, requires `deletion_pending`, consumes both nonces, then marks deleted.
- The provider attestation is signed only after the Resource API has successfully performed the corresponding provider verification or deletion. A client-supplied boolean, user JWT claim, object ID alone, or gateway-generated signature is not acceptable proof.
- Actor Gateway routes remain behind the verified user bearer middleware. The transition request carries the Resource API attestation in the JSON `attestation` body field; the Actor Gateway does not possess the signing key and cannot mint a valid provider proof. It validates the envelope shape, forwards the attestation fields unchanged to the database wrapper, and PostgreSQL performs cryptographic verification.
- The Resource API client must use HTTPS, reject redirects, bound request time and body size, never log the attestation, and fail closed if the Actor Gateway or proof is missing. The signing secret must not be sent in the request; only the short-lived signed attestation is sent.

The database wrapper must compare the attested tenant and provider key to the stored row rather than trusting request arguments. The transition's row-state predicate prevents replaying a valid proof into a second state change. Both nonce stores independently prevent replay within their validity windows.

### Cleanup caller inventory

The current implementation exposes cleanup only through the authenticated storage delete workflow. `src/storage/service.test.ts` covers user-authorized cleanup of abandoned pending uploads and retry of deletion-pending objects. The repository tree contains no storage cleanup worker or scheduled storage cleanup entry point. Therefore do not add a system cleanup credential/API at this stage. Keep pending-object cleanup and deletion retry under the authenticated manager workflow; re-open this decision only if a real background caller is introduced and evidenced.

### Secret provisioning precedent

Read-only inspection of `scripts/qualify-actor-gateway-principal.mjs` confirms the established Actor Gateway assertion-secret provisioning pattern: a dedicated migrator connection begins a transaction, executes `SET LOCAL ROLE ghm_schema_owner`, and inserts/rotates the 32-byte secret into the protected singleton table. The script obtains the secret from an environment variable; it does not commit the value. This is a concrete repository precedent, not permission to run it against production.

The provider-attestation implementation should use a separate environment variable (for example `GHM_STORAGE_PROVIDER_WORKFLOW_ATTESTATION_SECRET`) supplied only to the Resource API signer and the explicitly invoked provisioning/qualification process. A separate provisioning script should use the same migrator-to-schema-owner transaction pattern, require an explicitly named disposable/qualification database for automated tests, verify the exact database identity before mutation, and never print the secret. Production provisioning remains blocked by the already documented Render role-administration issue and must not be attempted in this construction work.

