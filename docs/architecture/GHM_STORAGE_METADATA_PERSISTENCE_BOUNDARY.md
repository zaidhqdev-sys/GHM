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

## Qualification scope

Before runtime enablement:

**Qualified:** metadata schema, persistence boundary, lifecycle authority, provider-neutral storage service/provider contract foundations, configuration/key boundaries, and persistence qualification.

**Not yet qualified:** concrete production provider credentials, live upload/download side effects, full service-level tenant/resource authorization, HTTP/product exposure, recovery/backup, orphan/reconciliation jobs, and production provider enablement.

## Documentation reconciliation

This schema must remain reconciled with:

- `GHM_STORAGE_CAPABILITY_BOUNDARY.md`;
- `GHM_STORAGE_SERVICE_CONTRACT.md`;
- GHM database authority;
- authorization/tenant-isolation contracts;
- storage recovery contract.

No provider provisioning or object migration is authorized by this document.
