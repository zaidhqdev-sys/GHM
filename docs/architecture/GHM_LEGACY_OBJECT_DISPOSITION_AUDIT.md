# GHM Legacy Object and Data Disposition Audit

## Status

**CONSTRUCTION — READ-ONLY AUDIT**

The live authority audit established that `ghm_app_user` and `ghm_db_user` remain present, with `ghm_db_user` owning legacy `public.*` objects. This boundary determines whether those objects contain data or retain database dependencies before any ownership transfer or role retirement.

## Scope

The audit inspects:

- legacy-role-owned relations and estimated row counts;
- exact row counts for legacy `public.users`, `profiles`, `todos`, `files`, and `password_reset_tokens`;
- PostgreSQL dependency edges;
- routine definitions referencing legacy objects or roles;
- views and triggers referencing legacy objects;
- constraints involving legacy objects;
- same-name objects under canonical `ghm`;
- routine definitions referencing legacy role names.

## Implementation note

PostgreSQL aggregate catalog entries are excluded from function-definition inspection because `pg_get_functiondef` is not valid for aggregate objects. Ordinary functions and procedures remain in scope.

## Safety

This harness is catalog/read-only plus SELECT row counts. It performs no DDL, GRANT, REVOKE, role change, ownership change, DELETE, UPDATE, INSERT, or data migration.

## Gate

No legacy role retirement, ownership transfer, or legacy-object removal is authorized by this audit alone. The resulting evidence must be reconciled against application source, migration history, data-preservation requirements, and operational recovery requirements.

## Decision

**DISPOSITION PENDING** until the live evidence is reconciled.

## Exact row counts

The audit uses a fixed, explicit UNION query for the five known legacy tables. PostgreSQL does not permit a table identifier to be supplied through a value parameter; the earlier parameterized identifier form was invalid and has been removed.

## RLS count execution boundary

Legacy tables may retain historical row-level-security policies that reference the application GUC `app.current_user_id`. Exact aggregate counts therefore execute after a session-only `SET ROLE ghm_schema_owner`, using the canonical non-login schema owner already reachable by the migrator. This does not grant, revoke, alter, or persist any database privilege.

## Legacy RLS owner boundary

The audit does not synthesize `app.current_user_id`. It captures `relrowsecurity` and `relforcerowsecurity`, then performs session-local read-only counts as the actual legacy table owner `ghm_db_user`. If RLS blocks that owner, the harness records the per-table failure instead of altering RLS state or inventing application identity context.