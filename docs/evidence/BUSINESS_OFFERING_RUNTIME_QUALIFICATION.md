# Business Offering Runtime Qualification

**Status:** QUALIFIED / PASS / CLOSED  
**Qualification date:** 2026-10-01  
**Construction branch:** `construction/business-offering-mainline-reconciled`  
**Base:** consolidated GHM `main` at `09bdef2039b80d73244b7f3026f3c4413e2227c5`

## Scope

This evidence closes the GHM Business Offering construction slice only.

Qualified surface:

- managed Business Offering read;
- public active-offering read;
- create under Business management authority;
- server-derived `created_by`;
- Business-scoped slug uniqueness;
- update under management authority;
- deactivation through update;
- runtime least-privilege grants;
- runtime DELETE denial.

No public HTTP route, Connect cutover, provider migration, or production traffic change is authorized.

## Live qualification evidence

The dedicated runtime qualification was executed against live PostgreSQL with separate runtime and migrator identities:

```text
RUNTIME IDENTITY PASS: ghm_db/ghm_runtime
CLEANUP AUTHORITY PASS: ghm_db/ghm_migrator
OUTSIDER READ REJECTION PASS
CUSTOMER READ REJECTION PASS
NON-MANAGEMENT CREATE REJECTION PASS
OUTSIDER CREATE REJECTION PASS
MANAGEMENT CREATE + SERVER PROVENANCE PASS
AUTHORIZED MEMBER READ PASS
SLUG LOOKUP PASS
NON-MANAGEMENT UPDATE REJECTION PASS
MANAGEMENT UPDATE + IMMUTABLE FIELD INVARIANT PASS
ACTIVE FILTER + DEACTIVATION PASS
PUBLIC INACTIVE FILTER PASS
CONCURRENT DUPLICATE SLUG INVARIANT PASS
RUNTIME DIRECT INSERT + UPDATE GRANT PASS
RUNTIME DELETE DENIAL PASS
RUNTIME PRIVILEGE PASS: SELECT=yes permitted INSERT/UPDATE columns=yes immutable UPDATE=no DELETE=no
GHM BUSINESS OFFERING RUNTIME QUALIFICATION: PASS
```

## Repository qualification

The implementation was reconciled directly onto current GHM `main`.

The slice contains:

- repository-owned migration `20260930200000_create_business_offering.sql`;
- typed contracts;
- governed repository/service implementation;
- registry operation registration;
- focused service tests;
- live runtime qualification harness;
- runtime column-level privilege verification;
- architecture/readiness/evidence documentation reconciliation.

The migration was applied successfully through the dedicated migration runner. The runtime privilege qualification intentionally verifies column-level INSERT/UPDATE grants rather than incorrectly requiring table-level mutation privileges.

## Security and ownership conclusions

- Public visibility uses the canonical active + verified + approved Business predicate.
- Runtime INSERT/UPDATE authority is narrowed to required columns.
- Offering identifiers, Business ownership, provenance, and timestamps are protected.
- Runtime DELETE is denied.
- Duplicate Business-scoped slugs remain database-authoritative.
- Concurrent duplicate creation is qualified.
- Cross-Business authorization is rejected.
- No provider-specific identifier is promoted to a GHM identifier.

## Boundary

This evidence does not authorize:

- a standalone Business Offering HTTP API;
- Connect product adapter implementation;
- Supabase session migration;
- data backfill or production migration;
- payment, storage, realtime, matching, recommendation, or directory expansion;
- reopening any closed GHM capability.

## Reconciliation rule

Business Offering is now **QUALIFIED / CLOSED** at the GHM construction boundary. Future changes require a new governed construction slice or an explicitly authorized adapter/projection contract; this evidence must not be treated as authorization to mutate the closed slice.
