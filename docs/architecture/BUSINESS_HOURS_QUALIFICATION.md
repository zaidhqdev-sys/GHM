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


## Database actor-provenance and read-boundary qualification — PASS (2026-11-11)

The earlier application-path qualification above remains valid, but it did not prove the database actor boundary. The signed Actor Gateway replacement and read projections have now been implemented and qualified separately.

Implementation head: `67d7049ec2f8fa8727475158558fb23f8724ab0d`.

GitHub Actions run [#3166](https://github.com/zaidhqdev-sys/GHM/actions/runs/43093547768) completed successfully with `quality` and `web-quality` passed. It includes the full test suite, complete migrations and `Qualify Business Hours signed gateway cutover on disposable PostgreSQL`.

The disposable PostgreSQL qualification applied the manual cutover only to localhost disposable CI PostgreSQL and explicitly proved:

- runtime direct SELECT on `ghm.business_hours` denied;
- runtime sequence access denied;
- legacy `ghm.replace_business_hours` EXECUTE denied;
- signed gateway replacement succeeds and `created_by` derives from the verified actor;
- signed member read succeeds for an active Business member;
- unrelated-account member read is denied;
- approved public Business Hours projection remains available through `ghm.get_public_business_hours`;
- actor substitution, request-target substitution and assertion replay are denied;
- runtime cannot execute gateway-only read or replacement wrappers;
- post-cutover function/table ACL matrix passes.

The application now forwards authenticated member GET and PUT requests through the Actor Gateway, preserving the existing Business Hours route and schedule behavior. Public reads use the SECURITY DEFINER visibility-filtered projection, preserving the active + verified + approved public directory boundary.

**Revised status:** Business Hours database actor provenance and read boundary are IMPLEMENTED / QUALIFIED on the exact head above. The previous direct runtime SELECT and sequence grants remain in historical migrations but are revoked by the separate manual cutover; that cutover was exercised only in disposable CI PostgreSQL. It has NOT been applied to production. Production cutover remains separately gated by Render role-model resolution, a fresh independently verified production backup, and explicit rollout approval. No production data, permissions or services were changed.
