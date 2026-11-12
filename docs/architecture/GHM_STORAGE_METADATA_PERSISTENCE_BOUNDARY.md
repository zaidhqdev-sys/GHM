# GHM Storage Metadata Persistence Boundary

## Status

**QUALIFIED — storage metadata foundation / persistence boundary — 2026-10-05**

The storage metadata foundation is constructed and qualified on the current mainline. `ghm.storage_object` is the authoritative PostgreSQL metadata record for GHM object storage.

It does not provision an object-storage provider, expose an HTTP endpoint, migrate existing objects, or grant broad runtime DML.

## Canonical record

`ghm.storage_object` is the authoritative GHM record for an object.

The provider stores bytes; this table stores the product/backend meaning of those bytes.

Each record binds:

- tenant/business;
- resource;
- object class;
- provider key;
- content metadata;
- visibility;
- lifecycle state;
- integrity information;
- timestamps.

## Lifecycle

The schema enforces:

`pending -> available -> deletion_pending -> deleted`

A pending object cannot claim availability.

A deleted object retains its metadata record so deletion history remains explicit.

## Runtime persistence boundary

Direct runtime table DML is denied. Narrow GHM-owned lifecycle functions provide the approved persistence path. See `GHM_STORAGE_PERSISTENCE_BOUNDARY.md`, `GHM_STORAGE_PERSISTENCE_FUNCTION_AUTHORITY.md`, and `GHM_STORAGE_PERSISTENCE_QUALIFICATION.md`.

## Provider independence

`provider_key` is opaque to product clients.

The schema does not encode an S3 bucket, provider URL, provider account, or provider-specific credential.

## Product mapping

The first planned object class is `business_logo`.

No historical Supabase object is imported by this migration.

## Qualification scope and current status

**Qualified:** metadata schema, persistence boundary, lifecycle authority, provider-neutral storage service/provider contract foundations, configuration/key boundaries, and persistence qualification.

**Qualified separately after this metadata slice:** controlled live signed upload/download, provider-side metadata observation, payload integrity, and deletion against Cloudflare R2 (see `../evidence/STORAGE_LIVE_PROVIDER_QUALIFICATION_2026-10-05.md`). This does not qualify production credential enablement.

**Still open:** full service-level tenant/resource authorization, HTTP/product exposure, recovery/backup, orphan/reconciliation jobs, deployment-managed production configuration, and production provider enablement.

## Documentation reconciliation

This schema must remain reconciled with:

- `GHM_STORAGE_PROVIDER_ADAPTER_RECONCILIATION.md`;
- `GHM_STORAGE_PERSISTENCE_BOUNDARY.md`;
- `GHM_STORAGE_PERSISTENCE_FUNCTION_AUTHORITY.md`;
- `GHM_STORAGE_PERSISTENCE_QUALIFICATION.md`;
- `../evidence/STORAGE_LIVE_PROVIDER_QUALIFICATION_2026-10-05.md`;
- GHM database authority;
- authorization/tenant-isolation contracts;
- storage recovery contract.

No provider provisioning or object migration is authorized by this document.


## 2026-11-12 security-boundary reconciliation — persistence is not actor authorization

## 12 November 2026 — Storage metadata authority status

The original persistence qualification remains valid for its narrow claim: direct runtime table DML is denied and the legacy SECURITY DEFINER functions preserve the storage lifecycle. It did not establish database-authenticated end-user identity. The 12 November audit correctly identified five legacy functions that remained directly executable by the shared `ghm_runtime` credential: `storage_create_pending`, `storage_get_object`, `storage_mark_available`, `storage_mark_deletion_pending`, and `storage_mark_deleted`.

**Source remediation is now implemented:**
- `gateway_storage_create_pending`, `gateway_storage_get_object`, and `gateway_storage_mark_deletion_pending` require the one-use signed Actor Gateway v2 assertion, validate the signed operation/context against database arguments, and enforce the actor's active Business membership and owner/administrator authority where mutation is required.
- `gateway_storage_mark_available` and `gateway_storage_mark_deleted` require both the user actor assertion and a separate domain-separated Resource API provider attestation. PostgreSQL verifies the 32-byte HMAC, operation, 60-second freshness, exact provider context and one-use nonce.
- The Actor Gateway has the corresponding authenticated routes and a dedicated database reader. The Resource API uses the HTTPS Storage Metadata Gateway client for metadata create/read/deletion-pending/availability/deletion operations and forwards the caller's bearer token. Production storage fails closed if the Actor Gateway URL or provider-attestation secret is missing; it cannot silently fall back to direct runtime metadata access.
- `storage_get_public_business_logo` remains the narrowly scoped public approved-logo lookup; this work does not broaden public storage access.

**Disposable qualification passed:** the migrations applied to PostgreSQL 18; the provider dual-proof qualification exercised legitimate availability/deletion plus invalid signature, expiry, context substitution, cross-business actor, nonce replay and invalid-state denials; verifier/secret ACL checks confirmed neither runtime nor Actor Gateway can read the secret or directly execute the verifier, while only Actor Gateway can execute the transition wrappers. A separate five-function cutover rehearsal revoked PUBLIC/runtime execution, confirmed runtime direct calls were denied, verified the replacement Actor Gateway wrappers remained executable, and restored the exact original ACL snapshot. The full repository workflow passed on run `43233465264`.

**Current status: SOURCE REMEDIATION COMPLETE; DISPOSABLE QUALIFICATION PASSED; PRODUCTION CUTOVER OPEN.** The five legacy direct runtime grants have not been revoked in production. No production migration, provider secret provisioning, role change or deployment occurred. Production cutover still requires the documented fresh verified backup, production role-administration access, final operational approval and a separately reviewed manual execution/rollback window.

Required adversarial evidence: runtime direct invocation denied after cutover; cross-tenant object read denied; non-member pending-object creation denied; member-but-not-manager lifecycle mutations denied; forged/expired/replayed/wrong-operation/context-substituted assertions denied; provider metadata mismatch never reaches available state; authorized upload/completion/read/deletion workflows still pass; public approved-logo lookup remains functional. No production cutover is authorized. The production Render role-administration blocker, fresh-backup gate and no-paid-infrastructure hosting constraint remain independent release blockers.
