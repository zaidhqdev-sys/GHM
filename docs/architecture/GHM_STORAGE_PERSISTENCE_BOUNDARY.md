# GHM Storage Persistence Boundary

## Status

**CONSTRUCTION — NARROW RUNTIME MUTATION**

The storage metadata table is intentionally not directly writable by `ghm_runtime`.

Runtime storage lifecycle mutations are exposed through four narrowly scoped GHM-owned PostgreSQL functions:

- `ghm.storage_create_pending`
- `ghm.storage_mark_available`
- `ghm.storage_mark_deletion_pending`
- `ghm.storage_mark_deleted`

The functions are `SECURITY INVOKER`. They do not bypass database privileges or resource authorization.

## Security boundary

Direct table privileges are revoked from `ghm_runtime` and `ghm_migrator`.

Only the explicitly granted function executions are available to the runtime role.

This preserves the GHM principle that a runtime role receives the minimum persistence authority required by a canonical service contract.

## Lifecycle

The functions enforce the storage lifecycle:

`pending -> available -> deletion_pending -> deleted`

Invalid transitions fail closed.

The provider operation remains outside PostgreSQL. The application/storage adapter must only call the completion/deletion transition after the corresponding provider operation has been verified.

## Authorization

These persistence functions do not replace application authorization.

The storage service must authorize:

- authenticated caller;
- tenant/business membership;
- resource ownership/access;
- object class;
- object policy;

before invoking the persistence function.

The database function is a persistence boundary, not an authorization shortcut.

## Provider independence

No provider-specific credential, bucket, URL, or SDK type is persisted by this migration.

`provider_key` remains an opaque GHM-generated identifier.

## Qualification required

Before merging into the canonical backend path:

1. migration applies cleanly;
2. runtime direct table DML fails;
3. allowed lifecycle functions succeed under `ghm_runtime`;
4. invalid lifecycle transitions fail;
5. `ghm_migrator` has no runtime storage mutation path;
6. tenant/resource authorization remains service-owned;
7. provider failure cannot produce false `available` or `deleted` state;
8. documentation remains reconciled.

No object provider provisioning or product integration is included.
