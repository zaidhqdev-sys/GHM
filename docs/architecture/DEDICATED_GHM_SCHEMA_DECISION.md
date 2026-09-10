# Dedicated GHM Application Schema Decision

**Status:** Construction — design decision only
**Branch:** `construction/dedicated-ghm-schema`
**Date:** 2026-09-10

## Decision

The canonical dedicated application schema for GHM Core Engine is **`ghm`**.

This decision establishes the namespace boundary for GHM-owned application resources. It does **not** authorize a production cutover and does not by itself authorize mutation of the currently qualified first-slice database.

## Why `ghm`

- It is explicitly identifiable as GHM-owned.
- It separates GHM application resources from the legacy `public` namespace.
- It leaves legacy provider/bootstrap objects in `public` without making them part of the GHM application contract.
- It provides a stable target for schema-level runtime grants.
- It provides a stable target for future-object default privileges owned by `ghm_schema_owner`.
- It avoids coupling future GHM resources to the historical legacy schema layout.

## Boundary

The intended future topology is:

```text
public
├── legacy/provider-era objects
└── legacy authority path

       X  not GHM application authority

 ghm
 ├── GHM-owned application resources
 ├── migration-controlled objects
 └── future GHM resource slices
```

`ghm_schema_owner` remains the owner of GHM-owned schema objects. `ghm_migrator` receives only the explicit migration elevation path. `ghm_runtime` receives only measured application privileges.

## Existing First Slice

The currently qualified Business Identity resources were created in `public`:

- `account_identity`
- `business`
- `business_membership`
- associated identity sequences
- `ghm_schema_migrations`

They must not be moved merely because this decision has been made. Any relocation from `public` to `ghm` is a separate migration and qualification event because it changes object addresses, grants, ownership evidence, and runtime qualification.

## Future-Object Defaults

Default privileges must be established only after the `ghm` schema exists and its ownership boundary is explicitly reconciled.

The intended owner of future GHM application objects is `ghm_schema_owner`.

Future defaults must be scoped deliberately to the GHM application namespace and must not broaden privileges on legacy `public` objects.

No global/default privilege mutation is part of this decision.

## Runtime Boundary

The runtime role is `ghm_runtime`.

The target schema boundary is:

```text
ghm_runtime
    |
    +--> USAGE on ghm
    +--> measured privileges on individual GHM resources
    X--> CREATE on ghm
    X--> ownership/elevation
    X--> migration ledger mutation
```

The exact schema-level and object-level ACL statements must be qualified against the live construction database before they become canonical migration behavior.

## Migration Strategy

A future schema migration must be designed as a controlled construction change. It must answer, before execution:

1. Whether the existing first-slice tables remain temporarily in `public` or are relocated into `ghm`.
2. How ownership is preserved.
3. How sequences and constraints are preserved.
4. How runtime grants are re-established.
5. How migration-ledger authority is preserved.
6. How rollback/recovery is performed.
7. How the resulting catalog is captured and reconciled.

The migration must be repository-owned and idempotent through the existing migration ledger mechanism.

## Explicit Non-Goals

This decision does not:

- change Render `DATABASE_URL`;
- change the production runtime role;
- remove `ghm_db_user`;
- revoke provider/bootstrap memberships;
- alter Zaid Connect;
- alter QuoteFlow;
- migrate production product data;
- establish global default privileges;
- perform a production cutover.

## Gate

This document closes the **schema naming/design decision** only.

The next gate is a read-only reconciliation of the exact relocation/default-privilege plan against the current migration runner, catalog, ownership, ACLs, and qualification harness. Only after that reconciliation should a construction migration be proposed for Founder approval.
