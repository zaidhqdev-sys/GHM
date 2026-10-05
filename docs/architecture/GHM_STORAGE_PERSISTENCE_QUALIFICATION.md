# GHM Storage Persistence Qualification

## Status

**QUALIFIED / PASS — 2026-10-05**

## Purpose

Qualify the narrow PostgreSQL persistence boundary for `ghm.storage_object`.

This qualification is intentionally provider-free. It proves database authority and lifecycle transitions before an object-storage adapter is introduced.

## Required runtime identity

The qualification must run as the intended `ghm_runtime` identity. It records both session and current role.

## Qualified evidence

The harness checks:

1. direct runtime INSERT is denied;
2. runtime has no direct INSERT/UPDATE/DELETE table privilege;
3. pending creation succeeds through the canonical function;
4. invalid lifecycle transition fails;
5. pending -> available succeeds;
6. available -> deletion_pending succeeds;
7. deletion_pending -> deleted succeeds;
8. final metadata records deleted state.

The qualification fails closed on unexpected direct table mutation. The completed runtime qualification passed the required direct-DML denial and lifecycle transition gates.

## Cleanup

The qualification creates one isolated probe object. The object is driven to the terminal `deleted` state rather than being removed from metadata, preserving lifecycle evidence.

## Scope

This does not qualify:

- provider credentials;
- object upload/download;
- signed URLs;
- tenant authorization;
- provider/object reconciliation;
- backup/recovery.

Those remain subsequent gates: provider credentials, live upload/download, full tenant/resource authorization, provider reconciliation, backup/recovery, HTTP/product exposure, and production provider enablement.

## Documentation reconciliation

The result must remain consistent with:

- storage capability boundary;
- storage service contract;
- storage metadata persistence boundary;
- GHM database authority;
- authorization/tenant-isolation contracts.

No provider provisioning is authorized.
