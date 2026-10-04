# GHM Storage Persistence Function Authority

## Decision

The `ghm.storage_object` table remains inaccessible for direct runtime DML. The runtime role receives `EXECUTE` only on the canonical storage lifecycle functions.

Those functions use PostgreSQL `SECURITY DEFINER` deliberately because the persistence boundary must perform narrowly scoped table mutations without granting the runtime role table DML.

## Security boundary

- `ghm_schema_owner` owns the storage schema objects.
- `ghm_schema_owner` is a non-login schema owner and is not the application runtime identity.
- `ghm_runtime` has no direct `INSERT`, `UPDATE`, or `DELETE` privilege on `ghm.storage_object`.
- Lifecycle functions use a fixed `search_path` of `pg_catalog, ghm`.
- `PUBLIC` execution is revoked explicitly.
- `ghm_runtime` receives `EXECUTE` only on the five canonical storage persistence functions.
- The functions remain persistence-only; service-layer authorization is not delegated to PostgreSQL function privileges.

## Why SECURITY DEFINER is required here

`SECURITY INVOKER` cannot implement this boundary: the runtime caller has no table DML privilege by design, so lifecycle mutation would fail.

`SECURITY DEFINER` is therefore used as a controlled privilege boundary rather than as an authorization substitute. The owner is the non-login canonical schema owner, the function search path is fixed, and execution is restricted to the runtime role.

## Qualification gate

The storage persistence qualification must prove both sides of the boundary:

1. direct runtime table DML remains denied;
2. canonical lifecycle functions can perform only their permitted transitions;
3. invalid lifecycle transitions remain rejected;
4. the terminal deleted state is recorded;
5. no public function execution is available.

This gate does not qualify provider credentials, object upload/download, tenant authorization, provider reconciliation, or backup/recovery.

## Documentation reconciliation

This decision reconciles the storage persistence boundary with the storage capability boundary, service contract, metadata schema, database authority model, and runtime authorization boundary.

No provider provisioning is authorized by this change.
