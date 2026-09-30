# GHM Database Authority

## Status

This directory is the future canonical schema authority for GHM Core Engine.

## Rules

1. PostgreSQL is the target database for GHM production.
2. Repository migrations are the canonical schema authority.
3. `src/server.ts` must not create or alter product tables at application startup.
4. `ghm.db` is a legacy SQLite artifact and is not a source for production migrations.
5. No product migration may be generated from an unverified schema guess.
6. The live GHM PostgreSQL schema must be reconciled before the first product/business migration is authored.
7. Every migration must be deterministic, reviewable, and recorded in `ghm_schema_migrations`.
8. Production migration execution must fail closed on migration errors.
9. Product cutover remains blocked until database compatibility and rollback procedures are qualified.

## Current foundation

`00000000000000_create_migration_ledger.sql` establishes the migration ledger only. It intentionally does not recreate the legacy runtime tables.

## Reconciliation gate

Before adding `users`, `profiles`, product domains, indexes, policies, functions, or compatibility views, capture and review the actual GHM PostgreSQL catalog. The current repository does not contain sufficient evidence to safely infer that schema.
