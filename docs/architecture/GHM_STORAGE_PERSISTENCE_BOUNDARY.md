# GHM Storage Persistence Boundary

## Status

**QUALIFIED — narrow runtime persistence boundary — 2026-10-05**

The storage metadata table is intentionally not directly writable by `ghm_runtime`.

Runtime storage lifecycle mutations are exposed through four narrowly scoped GHM-owned PostgreSQL functions:

- `ghm.storage_create_pending`
- `ghm.storage_mark_available`
- `ghm.storage_mark_deletion_pending`
- `ghm.storage_mark_deleted`

The functions are controlled `SECURITY DEFINER` persistence boundaries owned by the non-login `ghm_schema_owner`, with fixed `search_path` and public execution revoked. They do not replace application authorization.

## Security boundary

Direct table DML is denied to `ghm_runtime`; lifecycle execution is limited to the explicitly granted runtime function boundary.

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

The persistence boundary was runtime-qualified on 2026-10-05: direct runtime DML denial, allowed lifecycle execution, invalid transition rejection, terminal deleted-state persistence, and restricted execution authority all passed.

Historical gate criteria:

1. migration applies cleanly;
2. runtime direct table DML fails;
3. allowed lifecycle functions succeed under `ghm_runtime`;
4. invalid lifecycle transitions fail;
5. `ghm_migrator` has no runtime storage mutation path;
6. tenant/resource authorization remains service-owned;
7. provider failure cannot produce false `available` or `deleted` state;
8. documentation remains reconciled.

No object provider provisioning or product integration is included.


## Metadata lookup scope follow-up

The source migration now replaces `storage_get_object(bigint)` with an account-aware `storage_get_object(bigint,bigint)`, checking active public business-logo visibility or active business membership and returning the same missing-object error for unauthorized IDs. The repository passes the authenticated `AuthContext.userId`, with a regression test asserting the second argument. The read-only audit SQL checks that the one-argument function is absent and the two-argument overload exists. This is defense in depth only; a shared runtime credential can supply arbitrary function parameters, so application-level membership authorization remains required. The migration is not applied to production or sandbox. Disposable database migration/lifecycle tests and real membership-backed integration tests remain required.
