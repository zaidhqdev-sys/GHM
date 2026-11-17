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
