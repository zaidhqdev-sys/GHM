# GHM Storage Metadata Persistence Boundary

## Status

**CONSTRUCTION — SCHEMA FOUNDATION**

This migration establishes the canonical PostgreSQL metadata record for GHM object storage.

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

## Authorization

This migration intentionally does not grant broad runtime DML.

The next storage implementation slice must establish the narrow runtime persistence boundary, with service-owned authorization and lifecycle transitions.

## Provider independence

`provider_key` is opaque to product clients.

The schema does not encode an S3 bucket, provider URL, provider account, or provider-specific credential.

## Product mapping

The first planned object class is `business_logo`.

No historical Supabase object is imported by this migration.

## Qualification required

Before runtime enablement:

- schema migration qualification;
- least-privilege runtime grants;
- lifecycle transition tests;
- tenant isolation tests;
- provider metadata reconciliation;
- orphan cleanup;
- recovery qualification.

## Documentation reconciliation

This schema must remain reconciled with:

- `GHM_STORAGE_CAPABILITY_BOUNDARY.md`;
- `GHM_STORAGE_SERVICE_CONTRACT.md`;
- GHM database authority;
- authorization/tenant-isolation contracts;
- storage recovery contract.

No provider provisioning or object migration is authorized by this document.
