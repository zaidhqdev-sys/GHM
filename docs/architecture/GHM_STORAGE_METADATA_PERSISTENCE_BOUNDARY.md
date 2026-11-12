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

The original persistence qualification remains valid for its narrow claim: direct runtime table DML is denied and the SECURITY DEFINER functions preserve the storage lifecycle. It did **not** qualify database-authenticated end-user identity or protect against a holder of the shared `ghm_runtime` credential supplying another account/business/object ID directly to those functions. The earlier design deliberately left tenant authorization in the application service; that assumption is superseded for sensitive database operations by the approved isolated issuer / signed Actor Gateway trust-boundary direction in ADR-001 and the 10 November release-readiness handover.

The 12 November whole-database SECURITY DEFINER audit identified five non-public storage functions still directly executable by `ghm_runtime`: `storage_create_pending`, `storage_get_object`, `storage_mark_available`, `storage_mark_deletion_pending`, and `storage_mark_deleted`. Application authorization/provider checks remain defense in depth, but do not establish a database actor boundary for direct SQL invocation. This is an OPEN finding, not an approved exception.

Target remediation: add signed Actor Gateway wrappers for storage metadata create/read/availability/deletion operations. Each wrapper must verify the v2 one-use HMAC assertion and compare its signed context to the actual actor, tenant, object ID and operation arguments; enforce active actor and current owner/administrator membership where mutation is required; and preserve provider-side verification before marking an object available/deleted. Then add a manual-only cutover that revokes runtime EXECUTE on the five legacy functions. Keep `storage_get_public_business_logo` as the narrowly scoped public approved-logo lookup unless separate evidence requires changing it. Do not revoke the current grants until the replacement gateway path and disposable PostgreSQL qualification pass.

Required adversarial evidence: runtime direct invocation denied after cutover; cross-tenant object read denied; non-member pending-object creation denied; member-but-not-manager lifecycle mutations denied; forged/expired/replayed/wrong-operation/context-substituted assertions denied; provider metadata mismatch never reaches available state; authorized upload/completion/read/deletion workflows still pass; public approved-logo lookup remains functional. No production cutover is authorized. The production Render role-administration blocker, fresh-backup gate and no-paid-infrastructure hosting constraint remain independent release blockers.
