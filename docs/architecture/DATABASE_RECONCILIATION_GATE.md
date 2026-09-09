# GHM Database Reconciliation Gate

## Purpose

Prevent GHM from acquiring an invented or accidentally incompatible production schema while it is being prepared to replace managed backend dependencies for ZAID Technologies products.

## Evidence currently available

The live GHM PostgreSQL catalog has now been captured successfully from the intended Render PostgreSQL instance.

Verified evidence:

- PostgreSQL 18.6;
- database `ghm_db`;
- current non-system schema: `public`;
- live application authentication succeeds as `ghm_app_user`;
- effective PostgreSQL role is currently `ghm_db_user`;
- live catalog contains five application tables: `files`, `password_reset_tokens`, `profiles`, `todos`, and `users`;
- no application views;
- no materialized views;
- no application routines/procedures;
- no application triggers;
- RLS is enabled on `files`, `todos`, and `users`, and disabled on `profiles` and `password_reset_tokens`;
- existing RLS policies use `app.current_user_id` / `app.current_user_role` settings;
- foreign keys from `files`, `password_reset_tokens`, `profiles`, and `todos` reference `users.id` with `ON DELETE CASCADE`;
- unique constraints/indexes and identity sequences are present for the legacy tables;
- current table grants are held by `ghm_db_user` and are broad, including `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, and `TRIGGER`, all grantable;
- safe catalog capture contains metadata only and does not capture row contents, passwords, tokens, connection strings, or secrets.

The captured catalog is evidence of the **current legacy/infrastructure database state**, not yet the canonical GHM business schema.

## Important catalog interpretation

The catalog capture's index query also returned PostgreSQL internal `pg_toast` indexes because the query excluded `pg_catalog`/`information_schema` but did not explicitly exclude `pg_toast`. These are PostgreSQL system internals and are not GHM application objects. They must not be treated as part of the GHM schema inventory. The capture query should be hardened to exclude system schemas explicitly on the next evidence refresh.

## Legacy schema assessment

The current application tables are not sufficient grounds for creating canonical product tables:

- `users`, `profiles`, and `password_reset_tokens` represent an existing identity foundation;
- `files` represents existing storage metadata and is compatible with the decision to use Supabase Storage temporarily behind a provider-neutral storage capability boundary;
- `todos` is legacy/demo state and is not a canonical ZAID business domain;
- existing RLS policies are legacy database authorization behavior and must not be copied blindly into the target authorization architecture;
- disabled RLS on `profiles` and `password_reset_tokens` is a legacy finding, not a target security decision;
- no Connect or QuoteFlow product schema exists in this GHM database, which confirms that GHM has not been populated by blindly copying Connect's Supabase schema.

## Effective application privilege finding

The authenticated `ghm_app_user` session currently becomes `ghm_db_user` through the configured role relationship. The effective role can create databases/schema objects and has broad grantable privileges over the existing public tables.

This is acceptable as a **construction-state finding** but does not satisfy the intended least-privilege application boundary for a production-qualified GHM runtime.

Do not remove the role relationship, revoke privileges, or delete the legacy role until the canonical migration/admin/application role model has been designed and the required migration authority has been separated safely.

## Required catalog capture

The reconciliation artifact must capture, at minimum:

- PostgreSQL server/version;
- schemas;
- tables and columns;
- data types and nullability;
- primary keys;
- foreign keys and delete behavior;
- unique constraints;
- indexes;
- sequences/identity definitions;
- views/materialized views;
- functions/procedures used by the runtime;
- triggers;
- row-level security state and policies;
- grants/privileges;
- row counts where safe to obtain.

The required catalog categories above are now materially captured. The remaining database gate is **reconciliation and privilege-boundary design**, not connectivity discovery.

## Decision rule

The first canonical GHM business migration is created only after the captured catalog has been reconciled against the intended GHM architecture and any legacy runtime behavior that must be preserved.

The next database gate is to define and safely establish the distinction between migration/admin authority and runtime application authority. Only then should canonical business tables and explicit repositories be introduced.
