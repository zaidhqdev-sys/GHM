# Business Hours Qualification — 2026-09-16

## Status

**QUALIFIED / CLOSED** for the frozen Business Hours construction boundary.

## Canonical boundary

- Resource: `business_hours`
- Relation: `ghm.business_hours`
- Parent: `ghm.business`
- Operations: `read`, `readPublic`, `replace`

The resource models a Business-owned weekly operating schedule. It does not model instantaneous open-now state, booking capacity, holidays/exceptions, staff/resource availability, service-specific hours, or notification behavior.

## Authoritative construction evidence

- `docs/architecture/BUSINESS_HOURS_OPERATION_CONTRACT.md`
- `docs/architecture/BUSINESS_HOURS_SOURCE_AUDIT.md`
- `database/migrations/20260916223000_create_business_hours.sql`
- `src/resources/business-hours/contracts.ts`
- `src/resources/business-hours/service.ts`
- `src/resources/business-hours/repository.ts`
- `src/resources/registry.ts`
- `scripts/qualify-business-hours-runtime.mjs`

## Runtime qualification — PASS

Qualification was executed from local `C:\GHM` after synchronization to the GitHub construction branch.

Verified:

- 170/170 automated tests passed;
- migration completed successfully;
- runtime identity: `ghm_db/ghm_runtime`;
- cleanup authority: `ghm_db/ghm_migrator`;
- Business Hours replacement and `created_by` provenance;
- active Business member read;
- approved active Business public read;
- non-management replace rejection;
- unauthorized replace rejection;
- runtime direct INSERT denial;
- runtime UPDATE denial;
- runtime DELETE denial;
- runtime privilege boundary: SELECT=yes, INSERT=no, UPDATE=no, DELETE=no, replacement function execute-only;
- final runtime result: `GHM BUSINESS HOURS RUNTIME QUALIFICATION: PASS`.

## Implementation correction during qualification

The first qualification attempt exposed an application/database contract mismatch: the application input uses camelCase field names while the PostgreSQL replacement function validates snake_case JSON keys. The repository was corrected to explicitly map the application model to the database function payload before invoking the governed replacement function.

No runtime privilege was broadened and no database validation was weakened.

## Closure

Business Hours is **QUALIFIED / CLOSED** for this construction slice.

Do not reopen this resource unless new evidence demonstrates regression or a separately authorized lifecycle/exception capability requires a new contract.

This closure does not authorize production migration, Supabase data movement, credential changes, DNS/routing changes, provider cutover, shadow qualification, or production replacement of Zaid Connect or QuoteFlow.
