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

**Historical open gates as of the October 2026 metadata-only qualification:** service-level tenant/resource authorization, HTTP/product exposure, recovery/backup, orphan/reconciliation jobs, deployment-managed production configuration, and production provider enablement. The November 12 signed Actor Gateway implementation now closes the source/database actor and tenant authorization gap and wires the Resource API HTTP storage routes to the gateway; disposable PostgreSQL 18 adversarial and grant rollback qualification passed. Remaining gates are a fresh full Resource API ↔ Actor Gateway ↔ external provider upload/HEAD/read/delete qualification, recovery/backup and orphan reconciliation, deployed production configuration/credentials, production provider enablement, and the separately approved legacy runtime grant cutover.

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

**Disposable qualification passed:** the migrations applied to PostgreSQL 18. The expanded provider dual-proof qualification now exercised signed pending-object creation and metadata read; private object access for an authorized Business member and cross-business private-read denial; non-member creation denial; ordinary-member deletion denial; legitimate pending → available → deletion-pending → deleted lifecycle; invalid provider signature; expired attestation; provider-context substitution; wrong provider operation; provider metadata mismatch without state transition; cross-business actor; nonce replay across different pending objects; and invalid lifecycle state. Verifier/secret ACL checks confirmed neither runtime nor Actor Gateway can read the secret or directly execute the verifier, while only Actor Gateway can execute the transition wrappers. A separate five-function cutover rehearsal revoked PUBLIC, runtime, migrator and Actor Gateway execution, confirmed direct calls were denied for runtime/migrator/Actor Gateway logins, verified the replacement Actor Gateway wrappers remained executable, and restored the original execution state. The expanded storage qualification and complete repository workflow passed in run `43237334881` (960/960 main test suite; both CI jobs passed).

**Current status: SOURCE REMEDIATION COMPLETE; DISPOSABLE QUALIFICATION PASSED; PRODUCTION CUTOVER OPEN.** The five legacy direct runtime grants have not been revoked in production. No production migration, provider secret provisioning, role change or deployment occurred. Production cutover still requires the documented fresh verified backup, production role-administration access, final operational approval and a separately reviewed manual execution/rollback window.

Disposable PostgreSQL 18 adversarial evidence now demonstrates: all five legacy direct functions are denied to runtime, migrator and Actor Gateway logins during the revocation rehearsal; the five signed replacement wrappers retain Actor Gateway execution; the original execution state is restored; cross-business private reads and mutations, non-member creation, ordinary-member deletion requests and disabled actors are denied; provider proof signature/expiry/context/operation/metadata mismatch and nonce replay are rejected; and the legitimate pending → available → deletion-pending → deleted metadata lifecycle succeeds. This database qualification does not by itself prove a fresh external provider upload/HEAD/read/delete end-to-end run or production recovery. No production cutover is authorized. The production Render role-administration blocker, fresh independently verified backup, operational/deployment/rollback approval and no-paid-infrastructure hosting constraint remain independent release blockers.
