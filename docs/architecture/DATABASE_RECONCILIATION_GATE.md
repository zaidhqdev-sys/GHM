# GHM Database Reconciliation Gate

## Purpose

Prevent GHM from acquiring an invented or accidentally incompatible production schema while it is being prepared to replace managed backend dependencies for ZAID Technologies products.

## Evidence currently available

- GHM targets PostgreSQL through `DATABASE_URL`.
- The application currently contains runtime table creation for legacy tables.
- `ghm.db` is a small legacy SQLite artifact and is explicitly non-canonical.
- The live PostgreSQL endpoint has not yet been successfully inspected from the current environment.

## Blocked until evidence exists

Do not author migrations for business/product tables until the actual PostgreSQL catalog is available and reviewed. In particular, do not infer GHM tables from Zaid Connect's Supabase schema. Connect's migrations are authoritative for Connect, not for GHM.

## Required catalog capture

The reconciliation artifact must capture, at minimum:

- PostgreSQL server/version
- schemas
- tables and columns
- data types and nullability
- primary keys
- foreign keys and delete behavior
- unique constraints
- indexes
- sequences/identity definitions
- views/materialized views
- functions/procedures used by the runtime
- triggers
- row-level security state and policies
- grants/privileges
- row counts where safe to obtain

## Decision rule

The first canonical GHM business migration is created only after the catalog has been reconciled against the intended GHM architecture and any legacy runtime behavior that must be preserved.
