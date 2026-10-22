# GHM Database Authority

## Status

This directory contains the canonical migration authority for the GHM Internal Runtime. `ghm` is the current application schema; GHM Core Engine references in older records are legacy naming unless explicitly marked otherwise.

## Rules

1. PostgreSQL is the target database for GHM production.
2. Repository migrations are the canonical schema authority.
3. `src/server.ts` must not create or alter product tables at application startup.
4. `ghm.db` is a legacy SQLite artifact and is not a source for production migrations.
5. No product migration may be generated from an unverified schema guess.
6. The live GHM PostgreSQL schema was reconciled before the initial dependent product/business migrations. Every subsequent migration must still be reconciled against the current live construction catalog, migration ledger, and resource contract before it is authored or applied.
7. Every migration must be deterministic, reviewable, and recorded in `ghm_schema_migrations`.
8. Migration execution must require `GHM_MIGRATION_DATABASE_NAME` and `GHM_MIGRATION_DATABASE_HOST`; both must explicitly match the migration URL before SQL is executed. The connected database and `ghm_migrator` / `ghm_schema_owner` authority must also be verified.
9. Fixture-mutating qualification scripts must require an explicit expected database name and host (`GHM_QUALIFICATION_DATABASE_NAME` / `GHM_QUALIFICATION_DATABASE_HOST` or `GHM_NONPRODUCTION_DATABASE_NAME` / `GHM_NONPRODUCTION_DATABASE_HOST`) and verify both runtime and migration URLs before connecting or creating fixtures.
10. Production migration execution must fail closed on migration errors.
11. Product cutover remains blocked until database compatibility and rollback procedures are qualified.

## Current foundation

The initial migration-ledger migration established the ledger foundation. Subsequent qualified migrations construct the dedicated `ghm` schema and bounded resource/authentication capabilities. Do not infer the current database state from the initial migration alone; reconcile the full ordered migration history and the current-state/evidence records.

## Reconciliation gate

The dedicated `ghm` schema, migration ledger, and least-privilege role separation are implemented and qualified. Legacy `public.*` objects and legacy roles remain a separate preservation/remediation boundary: inspect live catalog/data/dependencies and the current authority runbooks before any ownership transfer, role retirement, data disposition, or destructive mutation. Product cutover and unqualified product migrations remain gated.

## Explicit database target guards

Do not rely on database-name defaults or compare only the runtime and migration URLs to each other. The configured expected database name and PostgreSQL host must be supplied independently of the connection strings. Render's short database host and its `.frankfurt-postgres.render.com` form are normalized for comparison. Missing or mismatched expectations are a hard stop before migration SQL or qualification fixtures. These guards do not replace live catalog/ledger reconciliation, credential/role checks, or isolated-database approval.
