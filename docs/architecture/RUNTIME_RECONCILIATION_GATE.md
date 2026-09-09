# GHM Runtime Reconciliation Gate

## Status

Construction gate. This document defines the boundary for replacing the legacy runtime bootstrap with repository-owned migrations and governed runtime behavior.

## Problem

The repository contains two runtime states:

1. the hardened configuration/authentication changes developed locally; and
2. the older `src/server.ts` currently represented on the construction branch.

These states must not be treated as equivalent.

## Required reconciliation

Before GHM can progress toward production replacement, the construction line must converge on one canonical runtime implementation that:

- fails closed when required configuration is missing;
- does not create or alter product tables during application startup;
- does not silently promote a fixed user ID to administrator;
- uses the canonical configuration module for secrets, database URL, CORS, and runtime settings;
- does not expose unrestricted table-name CRUD/query access;
- keeps authorization decisions bound to the authenticated request and transaction/query context;
- keeps password-reset tokens out of API responses and logs;
- does not claim password-reset delivery exists until a trusted delivery mechanism is implemented;
- has explicit startup, readiness, health, and shutdown behavior.

## Database boundary

`src/server.ts` is not authorized to become a second schema authority. Product/business schema must be introduced through `database/migrations` and recorded by `ghm_schema_migrations`.

The migration runner already provides deterministic ordering, checksums, transaction scope, and an advisory lock.

## Production safety

This reconciliation is construction-only. It must not change Zaid Connect or QuoteFlow production configuration, traffic, Supabase data, DNS, or credentials.

Supabase remains the live rollback path until GHM independently passes qualification.

## Exit criteria

This gate closes only when:

1. the hardened runtime is present on the construction line;
2. runtime schema mutation is removed;
3. unsafe admin bootstrap is removed;
4. authorization semantics are explicitly governed;
5. generic table access is replaced or formally constrained by an approved resource contract;
6. build and automated qualification checks pass;
7. the actual GHM PostgreSQL catalog has been captured and reconciled.
