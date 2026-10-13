# GHM Database Authority

## Status

This directory contains the canonical migration authority for the GHM Internal Runtime. `ghm` is the current application schema; GHM Core Engine references in older records are legacy naming unless explicitly marked otherwise.

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

The initial migration-ledger migration established the ledger foundation. Subsequent qualified migrations construct the dedicated `ghm` schema and bounded resource/authentication capabilities. Do not infer the current database state from the initial migration alone; reconcile the full ordered migration history and the current-state/evidence records.

## Reconciliation gate

The dedicated `ghm` schema, migration ledger, and least-privilege role separation are implemented and qualified. Legacy `public.*` objects and legacy roles remain a separate preservation/remediation boundary: inspect live catalog/data/dependencies and the current authority runbooks before any ownership transfer, role retirement, data disposition, or destructive mutation. Product cutover and unqualified product migrations remain gated.
