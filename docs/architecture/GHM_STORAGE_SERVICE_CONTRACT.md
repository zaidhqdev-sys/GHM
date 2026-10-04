# GHM Storage Service Contract

## Status

**CONSTRUCTION — CONTRACT / IMPLEMENTATION READINESS**

This contract follows the GHM storage capability boundary. It authorizes design of the service contract only; it does not authorize provider provisioning, production object writes, or migration of historical Supabase objects.

## Existing implementation evidence

GHM already declares S3-compatible client and presigner dependencies:

- `@aws-sdk/client-s3`
- `@aws-sdk/s3-request-presigner`

The repository also has an existing `S3_ENDPOINT` environment convention from earlier runtime configuration.

These are implementation evidence only. They do not establish an approved storage provider, production bucket, credential set, or canonical object model.

## Canonical service surface

The first GHM storage service must expose provider-neutral operations equivalent to:

- `createUpload`
- `completeUpload`
- `getObjectAccess`
- `deleteObject`
- `getObjectMetadata`

Provider-specific SDK types must not cross the service boundary.

## Create upload

Inputs:

- authenticated caller context;
- tenant/business/resource owner;
- object class;
- declared content type;
- declared byte size;
- optional safe display filename.

GHM must:

1. authenticate;
2. authorize the owning resource;
3. validate object-class policy;
4. validate size/type;
5. allocate a GHM object ID;
6. generate a server-controlled provider key;
7. persist an upload-pending metadata state;
8. return controlled upload instructions.

The client must never choose the authoritative provider key.

## Complete upload

Completion must verify that the provider object exists and that observable metadata is consistent with the GHM record.

Where provider capabilities permit, checksum/ETag or an equivalent integrity signal must be captured.

Only successful verification transitions the object to `available`.

## Access

GHM decides whether access is public, authenticated, private, or internal.

For non-public objects, GHM returns short-lived provider access or mediates the transfer.

A provider URL alone is never authorization.

## Delete

Deletion requires GHM authorization and transitions metadata through a deletion state before/while provider deletion occurs.

Provider failure must remain observable and retryable.

No successful API response may claim permanent deletion when the provider operation has not been confirmed.

## Object key

Provider keys are GHM-generated.

Recommended logical form:

`objects/{tenant_id}/{object_id}`

Object class and resource identity belong in canonical metadata rather than being trusted from a client-provided path.

Human filenames are metadata only and must never control authorization.

## Metadata model

Minimum canonical fields:

- `id`
- `tenant_id`
- `resource_type`
- `resource_id`
- `object_class`
- `provider_key`
- `content_type`
- `byte_size`
- `checksum`
- `visibility`
- `status`
- `original_filename`
- `created_at`
- `available_at`
- `deleted_at`

The schema must include constraints for status/visibility and indexes for tenant/resource lookup.

## Transaction boundary

PostgreSQL cannot atomically commit a transaction with an external object provider.

Therefore:

- metadata state is authoritative;
- provider operations are explicitly reconciled;
- `pending` objects may be cleaned/retried;
- `available` means provider verification has succeeded;
- `deletion_pending` means deletion is not yet complete;
- reconciliation tooling is required before production storage qualification.

## First object class

The first implementation candidate is:

`business_logo`

Policy derived from the current Connect contract:

- JPEG, PNG, WebP;
- maximum 2 MiB;
- business-management authorization;
- public representation permitted;
- deterministic business-scoped semantics.

This does not authorize immediate migration of existing Connect logo objects.

## Security boundary

The service must fail closed on:

- unauthenticated upload;
- unauthorized business/resource;
- unsupported object class;
- unsupported MIME type;
- oversized object;
- client-selected provider key;
- malformed tenant/resource identifiers;
- access to another tenant's object;
- expired/invalid access grant.

## Required qualification

Before production use, the storage implementation must qualify:

1. authorization isolation;
2. object-key non-forgeability;
3. upload type/size enforcement;
4. pending/available lifecycle;
5. provider failure handling;
6. access expiry;
7. delete semantics;
8. tenant isolation;
9. orphan reconciliation;
10. metadata/provider consistency;
11. safe logging with no credentials;
12. recovery/restore procedure.

## Provider decision

No provider is selected by this contract.

An S3-compatible adapter is the implementation seam because the codebase already has AWS SDK dependencies and an S3 endpoint convention. The provider can be selected later without changing the product-facing contract.

## Documentation reconciliation

Implementation must remain reconciled with:

- `GHM_STORAGE_CAPABILITY_BOUNDARY.md`;
- GHM database authority;
- GHM authorization/tenant isolation;
- Connect business identity/profile contracts;
- storage recovery qualification.

No provider provisioning or production mutation is authorized by this document.
