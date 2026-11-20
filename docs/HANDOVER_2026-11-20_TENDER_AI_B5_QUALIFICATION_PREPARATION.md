# Handover 2026-11-20 — B5 disposable-PostgreSQL qualification preparation (Tender AI Phase 1)

Feature branch `feat/tender-ai-phase1`. No merge, deployment, production migration, role change, credential or infrastructure.

## Outcome
* The PostgreSQL qualification was **not run**: no existing disposable qualification database was reachable and confirmed safe.
* Static review answered the audit foreign-key question (RESTRICT, matches Q12; `SET NULL` is the analysis-to-tracking link only)
  and found one real gap (text PostgreSQL cannot store), corrected with regression tests. See design section 10.
* A full qualification script was written and wired in, never executed.

## Why the run is blocked (exact)
* Environment inspected: no `DATABASE_URL`/`GHM_*` variables, nothing listening on 5432/5433, no socket in `/var/run/postgresql`,
  no `.pgpass`.
* The only PostgreSQL present is the image's stock Debian cluster `16/main` (down, created when the image was built). It is not
  mentioned in any handover and has no qualification database or GHM roles, so its safety as the established environment cannot
  be shown; using it would mean starting a service and creating a database and roles, which was not permitted.
* The established qualification environments in the handovers are (a) the GitHub Actions `postgres:18` service container
  (`ghm_disposable_test`), and (b) the owner's local PostgreSQL 18 on port 5433 (`ghm_payfast_qualification`). Neither is reachable
  from this session. The CI workflow does not trigger on this branch, and I did not dispatch it (it was not authorised, and it
  would be the first execution of the tender SQL anywhere).

## Options to unblock (owner decision)
1. Authorise a `workflow_dispatch` run of `CI` on `feat/tender-ai-phase1` (existing ephemeral container, no new infrastructure).
   The principal qualification script would then execute the tender section.
2. Run `npm run qualify:actor-gateway-principal` on the owner's local PostgreSQL 18 (disposable database named
   `ghm_disposable_test`, roles per the CI setup) with the branch checked out.

## Changes in this step
* `src/tender/storable-text.ts` + use in both validators; tests `storable-text.test.ts`, `analysis-storage-size.test.ts`,
  `tender-qualification-script.test.ts` (static).
* `scripts/qualify-tender-gateway-postgres.mjs` (new) and a guarded call in `scripts/qualify-actor-gateway-principal.mjs`.
* Docs: design section 10, parity doc difference, this handover.

## Still unproven until that run passes
Everything in design 9 "Not yet proven", the SET NULL cascade through the immutability trigger, the 12 KiB payload in a real
`jsonb`, and the new qualification script itself (it may contain mistakes that only execution will show).
