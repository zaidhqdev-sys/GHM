# Actor Gateway production migration-batch implementation
**Date:** 2026-11-17 18:54 UTC  
**Scope:** Actor Gateway deployment prerequisite only.  
**Status:** Batch-selection primitive added on a draft branch; not yet integrated into the production migration runner and not deployable.
## Implemented in this tranche
- Added `src/db/migration-batches.ts` to distinguish inventory from execution authority.
- A production batch requires an explicit committed batch ID, a non-empty purpose, exact repository version/name pairs, no duplicate IDs or versions, and an exact contiguous prefix of currently pending migrations.
- The selector rejects unknown batches, already-applied entries, name mismatches, skipped earlier pending migrations, and duplicate entries.
- Added unit tests for these rules.
## Important limitation
This is an isolated selection primitive only. It is not wired into `src/db/migrate.ts`, does not execute SQL, does not establish a safe first Actor Gateway batch, and does not change production. The existing seven-entry production inventory remains incomplete and must not be mistaken for the full pending set. Do not run `npm run migrate`.
The 17 November post-deployment revocation migrations remain excluded from any pre-deployment batch. The gateway's exact database-function allowlist and feature-path cutover dependencies still require migration-by-migration reconciliation before a batch manifest can be committed.
No Render service was submitted or deployed; no production SQL, credentials, secrets, role memberships, or environment variables were changed.

## CI failure investigation — 17 November 2026 19:01 UTC

- Workflow job `134288409920` failed only at the web dependency audit. Web TypeScript build and all 26 web tests passed first. The five reported high findings collapse to one underlying issue: `picomatch` ReDoS (CVE-2026-112366 / GHSA-fc5q-39xc-vjpf), reached through Vite/Vitest `fdir` and `tinyglobby` dependencies.
- The lockfile resolves `picomatch` 4.0.7, which the advisory marks affected. The audit's `--force` suggestion would downgrade Vitest to 3.1.4. Upstream fix PR #238 is still open and no patched release was identified in the available advisory. Do not apply the forced downgrade or suppress the finding; keep the web audit gate failing until a reviewed upstream patch/release or a demonstrably safe dependency path is available.
- Workflow job `134288409058` passed build and worker bundle steps, then failed while applying the disposable migration sequence at the post-deployment capability-governance cutover. The verifier function had been created and altered to `ghm_schema_owner` / `SECURITY DEFINER` / `search_path=pg_catalog,ghm` by the earlier signed-assertion migration. The failing gate compared `pg_proc.proconfig` to a literal string including a space; the migration's `SET search_path` uses no space, so exact array membership was brittle.
- Updated the cutover gate to read the `search_path` option through `pg_options_to_table(p.proconfig)` and normalize whitespace before comparing to `pg_catalog,ghm`. Ownership and `SECURITY DEFINER` checks remain strict. This correction is committed in the PR branch; it still requires a fresh disposable PostgreSQL CI run to prove it.
- Neither failure changed production. The failed migration transaction ran against disposable PostgreSQL only. No Render deployment or production migration was performed.
