# Durable Tenant Isolation Boundary

Status: QUALIFIED — 2026-10-05

Tenant authority is derived from authenticated account identity plus active membership in an active GHM business. Caller-supplied business identifiers never establish authority.

## Qualified invariants

- Existing test suite: 520/520 pass.
- Runtime identity: `ghm_runtime`.
- Active membership resolves the canonical tenant context.
- Cross-business resolution fails closed.
- Tenant resolution and protected work use the same PostgreSQL client boundary.
- Qualification completes without changing legacy role privileges or production architecture.

## Scope

This qualification establishes the reusable tenant-resolution boundary. Existing resource repositories are not bulk-refactored here; resource-specific adoption remains separately qualified construction work.

## Qualification command

`npm run qualify:tenant-isolation-runtime`

No production cutover is implied by this qualification.
