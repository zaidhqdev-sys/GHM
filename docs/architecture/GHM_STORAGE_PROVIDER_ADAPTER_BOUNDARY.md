# GHM Storage Provider Adapter Boundary

## Status

**CONSTRUCTION — PROVIDER ADAPTER CONTRACT**

This slice defines the provider-neutral adapter interface. It does not provision a bucket, upload a product object, or select a production provider.

## Adapter operations

The provider adapter must expose only the object operations required by the GHM storage service:

- `putObject`
- `headObject`
- `deleteObject`
- `createUploadGrant`
- `createDownloadGrant`

The service passes an opaque provider key and validated content policy. Provider-specific SDK types remain inside the adapter.

## Required semantics

### putObject

Stores bytes under the exact GHM-generated provider key.

The adapter must not reinterpret or normalize the key.

### headObject

Returns provider metadata required for completion verification:

- existence;
- content type;
- byte size;
- integrity signal where available.

### deleteObject

Deletes the provider object and returns explicit success/failure.

### createUploadGrant

Creates a short-lived controlled upload mechanism where supported.

The adapter must not expose long-lived provider credentials.

### createDownloadGrant

Creates short-lived access for authenticated/private objects.

Public objects may use a stable product representation only when the GHM visibility policy permits it.

## Provider independence

The interface must not expose:

- bucket names;
- provider account IDs;
- SDK command types;
- provider URLs as authorization;
- provider credentials;
- provider-specific error classes.

Provider configuration belongs in deployment/runtime configuration.

## Error semantics

Adapter errors must be normalized into GHM-owned categories:

- `NOT_FOUND`
- `CONFLICT`
- `ACCESS_DENIED`
- `INVALID_OBJECT`
- `PAYLOAD_TOO_LARGE`
- `PROVIDER_UNAVAILABLE`
- `INTEGRITY_MISMATCH`
- `UNKNOWN`

The storage service decides whether an error is retryable.

## Consistency boundary

The provider adapter never changes PostgreSQL metadata.

The storage service coordinates:

1. canonical metadata creation;
2. provider operation;
3. provider verification;
4. canonical lifecycle transition.

This prevents the provider from becoming a second product authority.

## First implementation target

The first adapter may use the existing AWS SDK dependencies and `S3_ENDPOINT` convention.

That establishes compatibility with S3-compatible infrastructure without selecting a vendor or committing Connect/QuoteFlow to provider-specific semantics.

## Qualification gates

Before production enablement:

- provider credential isolation;
- upload grant expiry;
- download grant expiry;
- object-key confinement;
- content-type/size policy enforcement;
- provider failure mapping;
- checksum/integrity verification;
- tenant/resource authorization through GHM service;
- orphan reconciliation;
- deletion retry;
- recovery/restore.

## Documentation reconciliation

This contract must remain consistent with:

- storage capability boundary;
- storage service contract;
- storage metadata schema;
- storage persistence qualification;
- runtime secret/configuration boundaries.

No production provider provisioning is authorized by this document.
