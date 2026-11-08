# Proposed migration provenance remediation

**Status:** Implementation staged in draft PR #239 — not merged or applied  
**Prepared:** 2026-11-08  
**Repository:** `zaidhqdev-sys/GHM`  
**Current audit verdict:** `INVESTIGATE`

## Executive decision

Do not repair the local ledger, run migrations, or edit the operational manifests as part of forensic discovery. The evidence now supports a narrow source-history reconciliation, but the Business registration migration has a real same-version/different-bytes collision that must be resolved before the migration runner can safely proceed.

The recommended target state is:

1. Preserve `20261019210000` as historical applied provenance only; do not leave a different SQL body under that version in `database/migrations`.
2. Re-introduce the later Business-registration authorization behavior as a **new, unused migration version** with forward-only, idempotent SQL that works both when the historical table already exists and on a clean install.
3. Correct the QuoteFlow retained-history checksum to the exact applied SQL checksum.
4. Add the exact identity-authority migration to retained history.
5. Re-run the read-only audit and targeted tests. Only after review should any migration execution be separately authorized.

## Evidence

### A. Business registration version collision

- Live ledger version: `20261019210000`.
- Live and retained historical checksum: `4115cd79560e7ac7f11cae52734970a5ab9f0ba5100c34ceb2df5fe467327324`.
- Retained source blob recorded in the registry: `7681736389b13c82a81f7a6419826204ef584676`.
- Current main-branch file was reintroduced by `e6b396399f41cd6bc6d87044ab99fd32e99cd46e` on 2026-11-05, with blob `c1c3e4d9b4148376109177cf3106aa3519e15df6`.
- The current SQL contains later `b.is_active = true` authorization guards; the path history traces those additions to `01eae6c7a0fe939873ffbfe714d8268fb730488d`.
- The historical applied SQL and current file are not byte-identical.

The migration runner loads every numbered SQL file and, for an already-applied version, rejects a differing checksum unless the exact database checksum is present in `config/historical-migration-provenance-exceptions.json`. That exception would silence the runner mismatch but would not resolve the forensic audit's `REPOSITORY_MIGRATION_PRESENT` classification. It is therefore not the recommended fix.

**Recommended treatment:** remove the current SQL body from the old version path and re-author it as a new, uniquely numbered forward migration. Do not simply rename the existing 180-line body unchanged: it contains non-idempotent table creation and would fail against a database where the historical migration already created the table. The new migration must be reviewed to use `CREATE TABLE IF NOT EXISTS` plus explicit shape/constraint validation (or equivalent guarded DDL), and `CREATE OR REPLACE FUNCTION` for the updated authorization routines. It must preserve ownership, RLS, grants/revokes, comments, and the historical schema contract. Add assertions for incompatible pre-existing table shapes rather than silently accepting them. The new version must be selected only after checking all repository branches and migration ordering.

### B. QuoteFlow applied migration

- Live ledger version: `20261020130000_create_quoteflow_migration_business_provisioning`.
- Exact live SHA-256: `3c09cc7ecb8f566f0d359832ad91cc7b644570220236713c02a0763a0521345b`.
- Exact source: parent commit `7fb1bbe07fc64ede652ae589ab72bdc96f23d906`, blob `21731433c2a998fff8d86d628d3589f8768dd618`.
- Commit `5229b37700f2e21ac4caf2d4c5547bb929ab2de8` changed `unverified` to `pending`; resulting blob `620efa57ac35d494f1aa506f26a7ad810c821d9a` hashes to `a453171e85f6717476258c6d2d59a39b663be89826316036e6b9891cadfb13e9`.
- The current retained-history record uses that later checksum, not the live applied checksum.

**Proposed metadata correction:** retain version/name, set checksum to `3c09cc7ecb8f566f0d359832ad91cc7b644570220236713c02a0763a0521345b`, and update source/reason to cite the exact parent commit/blob and distinguish the later `pending` edit. Do not change the live ledger.

### C. Identity-authority restriction

- Live ledger version: `20261031100000_restrict_identity_authority_reader`.
- Exact live SHA-256: `a6692f473f05647aa8b829a1b9263f69376f2e647b124a013543d8ec7d9186bf`.
- Exact source branch: `reconciliation/ghm-identity-mainline-restored-20261031`.
- Exact blob: `e34dd0700885b182c79b1f09f2af5d94281849c2`.
- Introducing commit: `d166df2df9fe4a3e00da50935f118ef5322d05ae` (2026-10-31).

The migration revokes runtime execution on `ghm.auth_read_connect_identity_authority(bigint)`. It is absent from main and from the retained-history registry, but its SQL bytes exactly match the live ledger.

**Proposed metadata correction:** add a retained-history record for version `20261031100000`, with the exact name/checksum above and source/reason citing the branch, commit, and blob. This is a provenance record, not an instruction to re-run the SQL.

## Proposed change set (separate reviewed PR)

1. Add this migration-history evidence and decision record to the PR description.
2. Move the later Business registration SQL behavior to a new unused version. Author a safe forward migration rather than renaming the old SQL verbatim.
3. Keep the `20261019210000` retained-history entry and its exact applied checksum. Ensure no repository migration file remains at that version.
4. Correct the `20261020130000` retained-history checksum and provenance source to the exact live-applied bytes.
5. Add the `20261031100000` retained-history record with exact source provenance.
6. Do not add migration-runner exceptions merely to bypass the collision. Do not rewrite any live ledger checksums.
7. Keep the eight ledger-absent repository migrations as pending until their release readiness and intended environment are independently reviewed. Seven are present on main; `20261108140000` is only on `fix/business-profile-compat-contract-20261108`. Several files explicitly state construction-only/no production cutover.

## Acceptance checks before any migration execution

- `npm run audit:migrations` reports no `REPOSITORY_MIGRATION_PRESENT`, no `LEDGER_MISMATCH`, no `unrecognized_extra`, and no `invalid_retained_history` for these three historical versions.
- The audit recognizes `20261019210000`, `20261020130000`, and `20261031100000` as verified retained history with exact live names and checksums.
- A clean disposable PostgreSQL 18 database can apply the new forward migration from an empty schema.
- A second disposable PostgreSQL 18 database seeded with the exact historical Business registration schema can apply the same forward migration without duplicate-object failures and with the intended active-Business authorization behavior.
- Tests assert the table shape, constraints, RLS, owner, grants/revokes, and function definitions after both paths.
- Migration-runner tests prove checksum mismatch still fails closed and that a failed transaction rolls back all earlier migrations in the same run.
- Verify unique 14-digit migration version ordering across all active branches before assigning the new version.
- Re-run the read-only forensic audit and inspect the complete report before approving any execution.

## Explicit non-actions and safety gate

The original proposal was advisory only. The implementation now staged in draft PR #239 changes repository migration source and the retained-history registry on its review branch; it does not change the exception manifest, local/hosted database, migration ledger, or any hosted environment. It does not authorize `npm run migrate`, a ledger rewrite, production deployment, or Render workspace selection. Merge and any database execution require separate review and explicit authorization.

## Implementation checkpoint — 2026-11-09

Implementation is staged on branch `fix/migration-provenance-reconciliation-20261109` for review; it has not been merged or executed against any database.

### Changes staged
- Retired `database/migrations/20261019210000_create_business_registration_identity.sql` from the active migration directory, leaving the original applied checksum in retained history.
- Added `20261108150000_reconcile_business_registration_identity_authorization.sql`. It creates the table only when absent, validates the expected existing column/type/constraint shape, ensures RLS, restores the schema owner/revokes, and replaces the two authorization functions with the active-Business checks. It does not drop or rewrite table data.
- Updated the migration contract test to target the new forward migration and assert the guarded table shape.
- Corrected the QuoteFlow retained-history record to the exact live applied checksum `3c09cc7...` and exact applied SQL blob `21731433...`.
- Added the identity-authority retained-history record for exact checksum `a6692f47...`, commit `d166df2...`, blob `e34dd070...`.
- Left `config/historical-migration-provenance-exceptions.json` unchanged; no exception was added to bypass the version collision.

### Validation still required
- Exact-head CI build and tests, including the updated migration contract test.
- Disposable PostgreSQL 18 qualification against both an empty schema and a seeded schema containing the historical Business registration table. The second path must prove no duplicate-object errors, no table/data loss, and correct function ownership/ACL/RLS.
- Read-only migration audit against the previously qualified local database after pulling the branch; expect the old historical version to classify as verified retained history and the new migration to appear pending.
- Review the other pending migrations in timestamp order before any database execution.

### Explicit boundary
No database connection, migration command, ledger write, production change, Render operation, deployment, or manifest exception was performed. This PR is a code/provenance proposal for review only. It is not approval to run migrations or deploy.

### Exact-head CI qualification — PASS
- PR #239 head: `77dca310ad4945b28ef919805a3a47797043e2de`.
- GitHub Actions quality run #2222 (`42532985591`) passed: build, full disposable PostgreSQL 18 migration run, historical-function upgrade on the already-existing registration table, complete application test suite, commercial payment qualification, migration audit policy tests, and runtime-boundary verification.
- The new CI fixture first restores the exact pre-active-Business function definitions from historical commit parent `5944e594813a1c13c90ca2df0be5b4d808565c32`, then runs the new migration in a transaction. Assertions verify both functions contain `b.is_active = true`, table RLS is enabled, owner is `ghm_schema_owner`, direct runtime SELECT remains revoked, and runtime function EXECUTE remains granted. Transaction is rolled back after assertions.
- CI log explicitly reports: `PASS: historical functions were upgraded on the pre-existing table; authorization, RLS, owner, and ACL checks passed; transaction rolled back.`
- Cloudflare Pages check for this exact head passed. This is a preview build, not a production deployment.
- Still outstanding: local read-only migration audit against the owner's qualified database after branch checkout, and human review/approval of all pending migrations. PR remains draft and unmerged.

## Pending migration release-readiness review — 2026-11-09

A source review of the pending mainline migration set found two concrete blockers that must be resolved before migration execution or release:

1. **Business profile patch persistence gap** — `20261105190000_extend_business_directory_location_contact.sql` accepts and validates `avatar_letter`, `avatar_color`, and `years_in_business` in `ghm.update_business_profile`, but its final `UPDATE ghm.business SET` omits all three columns. Calls can succeed without persisting those values. Do not silently edit the historical migration in place: establish whether any other environment has applied it, then prefer a separately versioned forward correction if it may have been applied.
2. **Capability evidence read isolation gap** — `20261105213000_create_business_capability_evidence.sql` grants `ghm_runtime` direct table-wide `SELECT`, while the table has a `visibility` field but does not enable RLS or define tenant-scoped read access in this migration. The table stores evidence URLs, descriptions, issuer/reference details and verification state. Define and test the intended private/authenticated/public visibility and Business tenant boundary before granting reads.

Additional review notes:
- `20261105230000_create_founder_directory_review.sql` deliberately creates an empty founder reviewer allowlist. No reviewer identity should be seeded implicitly; a separately authorized reviewer mapping remains required before the workflow can be used.
- `20261106090000_business_logo_storage_binding.sql` and `20261107211500_reconcile_business_profile_and_founder_authority.sql` both touch the logo binding. The latter uses `IF NOT EXISTS` for the column/index, but the former is non-idempotent. Preserve timestamp order and qualify both fresh and partially reconciled schema states.
- `20261106200000_link_project_to_opportunity.sql` adds a nullable FK and unique partial index; verify the application transaction creates/links the canonical project Opportunity atomically and that no legacy project path bypasses it.

These are source-review findings, not proof of runtime exploitation or data exposure in a deployed database. The migration set remains **not release-ready** pending fixes, focused tests, full CI, and a fresh read-only local audit. No migration was run against the owner's local or production database.


### Forward correction for the Business profile patch persistence gap

The earlier migration is intentionally left byte-for-byte unchanged. A new forward migration, `20261109100000_persist_business_profile_presentation_fields.sql`, now replaces `ghm.update_business_profile` with the same validation/authorization contract plus the missing assignments for `avatar_letter`, `avatar_color`, and `years_in_business`. The static migration contract test now asserts those assignments exist in the forward migration. This fix is staged in PR #239 and requires the same exact-head CI and PostgreSQL 18 qualification as the other changes.
