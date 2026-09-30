# Dedicated GHM Application Schema Decision

**Status:** Construction decision established; first-slice relocation and qualification CLOSED / PASS
**Branch:** `construction/review-aggregate-reconciliation` carries the current qualified state.
**Original decision date:** 2026-09-10

## Decision

The canonical dedicated application schema for GHM Core Engine is **`ghm`**.

This decision establishes the namespace boundary for GHM-owned application resources. It does **not** authorize a production cutover and does not by itself authorize mutation of production.

## Why `ghm`

- It is explicitly identifiable as GHM-owned.
- It separates GHM application resources from the legacy `public` namespace.
- It leaves legacy provider/bootstrap objects in `public` without making them part of the GHM application contract.
- It provides a stable target for schema-level runtime grants.
- It provides a stable target for future-object default privileges owned by `ghm_schema_owner`.
- It avoids coupling future GHM resources to the historical legacy schema layout.

## Boundary

The intended and now-qualified topology is:

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

## Existing First Slice — Current State

The original 2026-09-10 design anticipated a possible first slice in `public`. That state has been superseded by the completed construction relocation.

The qualified Business Identity first slice is now canonical under `ghm`:

- `ghm.account_identity`
- `ghm.business`
- `ghm.business_membership`
- associated identity sequences
- `ghm.ghm_schema_migrations`

The relocation was performed as a repository-owned construction migration and subsequently qualified against the live catalog and runtime harness. The original `public` placement is historical evidence only and is not the current GHM application contract.

## Future-Object Defaults

Default privileges must be established only after the `ghm` schema exists and its ownership boundary is explicitly reconciled.

The intended owner of future GHM application objects is `ghm_schema_owner`.

Future defaults must be scoped deliberately to the GHM application namespace and must not broaden privileges on legacy `public` objects.

No global/default privilege mutation is part of this decision.

## Runtime Boundary

The runtime role is `ghm_runtime`.

The qualified schema boundary is:

```text
ghm_runtime
    |
    +--> USAGE on ghm
    +--> measured privileges on individual GHM resources
    X--> CREATE on ghm
    X--> ownership/elevation
    X--> migration ledger mutation
```

The first-slice schema/object ACLs and runtime behavior have been qualified against the live construction database. New resource privileges remain evidence-gated.

## Migration Strategy

Future schema migrations must be designed as controlled construction changes. They must answer, before execution:

1. Whether the resource belongs in the canonical `ghm` namespace.
2. How ownership is preserved.
3. How sequences and constraints are preserved.
4. How runtime grants are established from actual repository SQL.
5. How migration-ledger authority is preserved.
6. How rollback/recovery is performed.
7. How the resulting catalog is captured and reconciled.

Each migration must be repository-owned and idempotent through the existing migration ledger mechanism.

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

The **schema naming/design decision is closed**, and the **first Business Identity dedicated-schema relocation is also qualified**.

The remaining database authority issue is provider/bootstrap authority and legacy-role cleanup, which is blocked by the currently available managed PostgreSQL authority. Future resource slices require their own evidence-led reconciliation and qualification.
