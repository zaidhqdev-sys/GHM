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

## Current qualification reconciliation — 2026-10-26

The migration runner completed successfully against the explicitly selected qualification database on 2026-10-26, and catalog checks confirmed the scoped `storage_get_object(bigint,bigint)` function, removal of the one-argument overload, owner-controlled `SECURITY DEFINER` lifecycle functions, runtime execute grants, and no direct runtime table DML grant. This catalog evidence does not replace the dedicated mutation qualification under the intended restricted qualification role.

The live Cloudflare R2 provider data path was requalified on 2026-10-26; all checks passed, including upload, metadata observation, payload integrity, deletion, and absence confirmation. See `../evidence/STORAGE_LIVE_PROVIDER_QUALIFICATION_2026-10-26.md`. The only bucket created so far is named `zaid-ghm-production`, so the successful provider test must not be interpreted as proof of a dedicated non-production storage environment.

Still open: guarded database persistence qualification in the intended role, authenticated application/API end-to-end qualification, complete tenant/resource authorization, recovery/orphan reconciliation, backups, and production enablement.
