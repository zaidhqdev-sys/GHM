# GHM Storage Service Contract

The Storage Service is the canonical application boundary for object storage used by Connect and QuoteFlow.

## Operations

- `createUpload`: authorize the target resource, enforce object-class policy, create pending metadata, and issue a provider-neutral upload grant.
- `completeUpload`: authorize the resource, inspect the provider object, verify content type and byte size, then transition metadata to `available`.
- `getAccess`: authorize access to an available object and return a provider-neutral download grant.
- `deleteObject`: authorize deletion, transition metadata to `deletion_pending`, delete from the provider, then transition metadata to `deleted`.

## Ownership

The service owns storage policy and lifecycle orchestration. The metadata persistence boundary owns database state transitions. The provider adapter owns provider-specific SDK behavior.

No caller receives provider credentials or provider-specific SDK objects.

## Current policy

Only `business_logo` is currently admitted:

- `image/jpeg`
- `image/png`
- `image/webp`
- maximum 2 MiB
- public visibility policy

Additional object classes must be added deliberately with their own policy and authorization semantics.

## Failure semantics

A provider upload-grant failure leaves metadata pending and never makes the object available.

A completion mismatch never transitions the object to available.

A provider deletion failure leaves metadata in `deletion_pending` for retry/reconciliation.

## Qualification status

This is the construction contract. It is not production storage qualification. Concrete metadata persistence, authorization wiring, configured object-store infrastructure, recovery/reconciliation, and end-to-end runtime tests remain required.
