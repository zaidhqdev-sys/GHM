# GHM Database Reconciliation Gate

## Purpose

Prevent GHM from acquiring an invented or accidentally incompatible production schema while it is being prepared to replace managed backend dependencies for ZAID Technologies products.

## Evidence currently available

The live GHM PostgreSQL catalog has been captured successfully from the intended Render PostgreSQL instance.

Verified evidence:

- PostgreSQL 18.6;
- database `ghm_db`;
- current non-system schema: `public`;
- live application authentication succeeds as `ghm_app_user`;
- effective PostgreSQL role is `ghm_db_user` on the legacy construction path;
- live catalog contains five legacy application tables: `files`, `password_reset_tokens`, `profiles`, `todos`, and `users`;
- no application views;
- no materialized views;
- no application routines/procedures;
- no application triggers;
- RLS is enabled on `files`, `todos`, and `users`, and disabled on `profiles` and `password_reset_tokens`;
- existing RLS policies use `app.current_user_id` / `app.current_user_role` settings;
- foreign keys from `files`, `password_reset_tokens`, `profiles`, and `todos` reference `users.id` with `ON DELETE CASCADE`;
- unique constraints/indexes and identity sequences are present for the legacy tables;
- the legacy table grants held by `ghm_db_user` are broad and include `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, and `TRIGGER`, all grantable;
- safe catalog capture contains metadata only and does not capture row contents, passwords, tokens, connection strings, or secrets.

The captured catalog is evidence of the **legacy/infrastructure database state**, not the canonical GHM business schema.

## Connect schema authority reconciliation

Direct repository inspection established that Zaid Connect contains a canonical migration history under `supabase/migrations/` and also contains `src/supabase/supabase_schema.sql`.

The migration history is the authoritative schema-evolution source for Connect. The consolidated `src/supabase/supabase_schema.sql` is a legacy/consolidated design artifact and must **not** be treated as the current production schema authority.

Therefore the GHM rule is explicit: **read Connect migrations in timestamp order and reconcile their final state; never derive GHM schema from `src/supabase/supabase_schema.sql`.**

## Important catalog interpretation

The catalog capture is filtered to exclude PostgreSQL internal schemas such as `pg_toast`. PostgreSQL system internals are not GHM application objects and must not be treated as part of the application schema inventory.

## Legacy schema assessment

The current application tables are not sufficient grounds for creating canonical product tables:

- `users`, `profiles`, and `password_reset_tokens` represent an existing identity foundation;
- `files` represents existing storage metadata and is compatible with the decision to use Supabase Storage temporarily behind a provider-neutral storage capability boundary;
- `todos` is legacy/demo state and is not a canonical ZAID business domain;
- existing RLS policies are legacy database authorization behavior and must not be copied blindly into the target authorization architecture;
- disabled RLS on `profiles` and `password_reset_tokens` is a legacy finding, not a target security decision;
- no Connect or QuoteFlow product schema existed in the captured legacy catalog, confirming that GHM was not populated by blindly copying Connect's Supabase schema.

## First-slice GHM schema reconciliation

The first canonical GHM Business Identity slice has now been introduced through repository-owned migrations and applied to the construction database.

Canonical migration authority remains:

- `database/migrations/00000000000000_create_migration_ledger.sql`
- `database/migrations/20260909150000_create_business_identity.sql`

The resulting first-slice objects are:

- `account_identity`;
- `business`;
- `business_membership`;
- `ghm_schema_migrations`;
- their identity sequences.

These objects are owned by `ghm_schema_owner`. Runtime authority is separately qualified through `ghm_runtime`, while migration execution is separately qualified through `ghm_migrator` with explicit `SET ROLE ghm_schema_owner`.

This closes the original database-discovery/design dependency for the first slice. It does **not** mean the full GHM product schema is complete or that production replacement is qualified.

## Authority reconciliation status

The PostgreSQL authority distinction has now been executed and qualified for the current construction slice:

- dedicated schema-owner role established;
- dedicated migrator role and migration runner qualified;
- dedicated runtime role and first-slice least-privilege boundary qualified;
- runtime negative authority probes passed;
- bootstrap `ghm_db_user` memberships remain unresolved because they were granted by the independent bootstrap `postgres` authority.

The remaining database work is therefore **authority cleanup, dedicated schema/default-privilege reconciliation, and qualification of the next governed resource slices**, not basic connectivity discovery or definition of the initial role distinction.

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

The required catalog categories are materially captured. The remaining database gate is **reconciliation of the target schema and authority boundary**, with the first canonical GHM slice already established and qualified.

## Decision rule

Every future canonical GHM schema change must be introduced through repository-owned migrations, reconciled against the governing architecture, and qualified against the live construction catalog before dependent repository SQL is introduced.

No legacy Connect consolidated schema is a substitute for migration-history reconciliation.

## Remaining gate dependencies

1. Resolve bootstrap `ghm_db_user` memberships through the independent provider/bootstrap authority path.
2. Establish and reconcile a dedicated GHM application schema before setting future-object defaults.
3. Measure and decide the final TEMP privilege for `ghm_runtime`.
4. Complete Transaction Qualification with authentication, authorization, explicit repositories, runtime boundary, and reconciled schema.
5. Continue product-resource schema reconciliation only as each governed capability is ready.
6. Keep Zaid Connect and QuoteFlow on Supabase throughout construction and qualification.
