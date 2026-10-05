# GHM Dependency & Role End-State Qualification

**Status: CONSTRUCTION — READ-ONLY QUALIFICATION GATE**

## Purpose

Prove that the current application, migration runner, authentication/recovery paths, and deployment-facing configuration can operate on the canonical PostgreSQL role separation without depending on the legacy `ghm_app_user` / `ghm_db_user` authority chain.

This slice performs no database mutation.

## Evidence boundary

The qualification combines:

- static repository inspection of source, configuration, CI, scripts, and architecture documents;
- runtime PostgreSQL identity inspection through the configured runtime and migrator credentials;
- transitive PostgreSQL role-path inspection;
- explicit checks that authentication/recovery remain behind the canonical GHM persistence boundary.

Secrets and connection strings are never printed.

`GHM_LEGACY_AUDIT_DATABASE_URL` is explicitly excluded from runtime and migration dependencies. It is a one-off read-only legacy audit credential only.

## Canonical end state

| Role | End state | Responsibility |
|---|---|---|
| `ghm_runtime` | LOGIN, NOINHERIT, no admin role path | GHM application runtime |
| `ghm_migrator` | LOGIN, NOINHERIT, explicit SET path to `ghm_schema_owner` | Repository migrations |
| `ghm_schema_owner` | NOLOGIN | Canonical `ghm` schema/object ownership |
| `ghm_app_user` | legacy / no application dependency | Retire after proof |
| `ghm_db_user` | legacy / no application dependency | Retire after ownership/data/provider reconciliation |

The canonical target is a decision boundary, not a mutation authorization.

## Current source findings

The current runtime pool is constructed from `config.databaseUrl`, which is sourced from `DATABASE_URL`.

The migration runner independently requires `GHM_MIGRATOR_DATABASE_URL`, connects as `ghm_migrator`, and explicitly enters `ghm_schema_owner`.

Authentication, password recovery, and QuoteFlow migration reset flows use the canonical `PostgresAuthPersistence` boundary rather than legacy `public.users` / `password_reset_tokens` persistence.

Therefore the key dynamic question is whether the configured `DATABASE_URL` actually resolves to `ghm_runtime`. The qualification script proves this against the live construction database without exposing credentials.

## Qualification rules

PASS requires all of:

1. runtime credential resolves to `ghm_runtime`;
2. migrator credential resolves to `ghm_migrator`;
3. runtime has no transitive path to `ghm_migrator` or `ghm_schema_owner`;
4. migrator retains its explicit schema-owner path;
5. runtime and migrator are distinct PostgreSQL identities;
6. no unexpected source/config reference requires `ghm_app_user` or `ghm_db_user`;
7. auth/recovery/migration-reset remain on canonical GHM persistence;
8. no mutation is performed.

Any failed condition is **BLOCKED**.

## Important interpretation

A passing qualification proves dependency separation for the measured construction credentials. It does **not** authorize role revocation.

Role mutation remains separately gated on:

- two legacy `public.users` rows being preserved/reconciled;
- every legacy object having a disposition;
- independent provider/bootstrap authority for membership cleanup;
- post-mutation authority audit;
- rollback evidence.

## Legacy data boundary

The legacy-object audit established five legacy public tables remain owned by `ghm_db_user`, with only two rows in `public.users` and zero rows in the other four tables.

The two users remain preserved until authoritative QuoteFlow/Supabase provenance is available. Email-only inference is prohibited.

## Execution

Run:

`npm run qualify:legacy-role-dependency`

The command requires the construction runtime and migrator database credentials to be present in the local environment. It is read-only.

## Decision

The script emits one of:

- **QUALIFIED** — all dependency and identity gates pass;
- **BLOCKED** — at least one dependency/identity gate fails;
- **CONFLICT_REQUIRES_REVIEW** — reserved for contradictory evidence that cannot be safely resolved by the read-only qualification.

No result authorizes GRANT, REVOKE, ALTER ROLE, DROP ROLE, ownership changes, or data migration.

## Documentation reconciliation

This contract reconciles the role-separation model, migration runner boundary, QuoteFlow existing-user migration boundary, and legacy-object disposition findings. The legacy role audit remains a separate evidence artifact and is not silently overwritten by this qualification.
