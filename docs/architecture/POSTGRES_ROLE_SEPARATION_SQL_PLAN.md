# GHM PostgreSQL Role Separation — Exact Construction SQL Plan

Status: **DESIGN ONLY — NOT EXECUTED**

This document is the exact construction-only mutation plan derived from the measured GHM authority baseline. It is intentionally not wired into the migration runner and must not be executed without the Founder Gate.

## Scope

Target: GHM construction PostgreSQL database only.

Out of scope:

- Zaid Connect production
- QuoteFlow production
- Supabase production
- DNS
- application production environment variables
- production credentials
- live traffic

## Target roles

```text
ghm_schema_owner  NOLOGIN
      ^
      | SET-capable membership only
      |
ghm_migrator      LOGIN / migration process

ghm_runtime       LOGIN / application process
```

`ghm_runtime` must have no membership in `ghm_schema_owner` or `ghm_migrator`.

## Phase 0 — snapshot before mutation

Run and save the complete current authority evidence before changing anything:

```sql
SELECT current_user, session_user, current_database();

SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
       rolcanlogin, rolreplication, rolbypassrls
FROM pg_roles
WHERE rolname IN ('ghm_app_user','ghm_db_user','ghm_schema_owner',
                  'ghm_migrator','ghm_runtime')
ORDER BY rolname;

SELECT member.rolname AS member_role,
       parent.rolname AS granted_role,
       m.admin_option,
       pg_has_role(member.oid, parent.oid, 'USAGE') AS usage_ok,
       pg_has_role(member.oid, parent.oid, 'SET') AS set_ok,
       pg_has_role(member.oid, parent.oid, 'MEMBER') AS member_ok
FROM pg_auth_members m
JOIN pg_roles member ON member.oid = m.member
JOIN pg_roles parent ON parent.oid = m.roleid
WHERE member.rolname IN ('ghm_app_user','ghm_migrator','ghm_runtime')
   OR parent.rolname IN ('ghm_db_user','ghm_schema_owner','ghm_migrator','ghm_runtime')
ORDER BY member.rolname, parent.rolname;

SELECT current_database() AS database_name,
       pg_get_userbyid(datdba) AS database_owner
FROM pg_database
WHERE datname = current_database();

SELECT n.nspname AS schema_name,
       pg_get_userbyid(n.nspowner) AS schema_owner
FROM pg_namespace n
WHERE n.nspname = 'public';

SELECT n.nspname AS schema_name,
       c.relname,
       c.relkind,
       pg_get_userbyid(c.relowner) AS object_owner
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
ORDER BY c.relname;
```

The snapshot is a rollback reference, not optional evidence.

## Phase 1 — create target roles

These statements are intentionally separate from application configuration. Passwords are not stored in GitHub or this document.

```sql
CREATE ROLE ghm_schema_owner
  NOLOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION
  NOBYPASSRLS;

CREATE ROLE ghm_migrator
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION
  NOBYPASSRLS;

CREATE ROLE ghm_runtime
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION
  NOBYPASSRLS;
```

If any role already exists, stop and reconcile its measured state rather than rerunning CREATE ROLE.

`ghm_migrator` and `ghm_runtime` require secure credential provisioning outside the repository before external login is attempted.

## Phase 2 — establish migrator-to-owner SET path

Use a membership that permits explicit SET ROLE but does not inherit owner privileges:

```sql
GRANT ghm_schema_owner TO ghm_migrator WITH INHERIT FALSE, SET TRUE;
```

Immediately verify:

```sql
SELECT
  pg_has_role('ghm_migrator', 'ghm_schema_owner', 'USAGE') AS usage_ok,
  pg_has_role('ghm_migrator', 'ghm_schema_owner', 'SET') AS set_ok,
  pg_has_role('ghm_migrator', 'ghm_schema_owner', 'MEMBER') AS member_ok;

SELECT
  pg_has_role('ghm_runtime', 'ghm_schema_owner', 'USAGE') AS runtime_owner_usage,
  pg_has_role('ghm_runtime', 'ghm_schema_owner', 'SET') AS runtime_owner_set,
  pg_has_role('ghm_runtime', 'ghm_migrator', 'SET') AS runtime_migrator_set;
```

Expected runtime results: all false.

## Phase 3 — transfer GHM object ownership

Ownership transfer must happen before broad old-role revocation.

Preferred dedicated-schema target for future GHM objects is strongly recommended. If the first slice remains in `public`, do not transfer ownership of unrelated legacy objects blindly.

For the currently GHM-owned objects, the intended ownership statements are:

```sql
ALTER TABLE public.account_identity OWNER TO ghm_schema_owner;
ALTER TABLE public.business OWNER TO ghm_schema_owner;
ALTER TABLE public.business_membership OWNER TO ghm_schema_owner;
ALTER TABLE public.ghm_schema_migrations OWNER TO ghm_schema_owner;

ALTER SEQUENCE public.account_identity_id_seq OWNER TO ghm_schema_owner;
ALTER SEQUENCE public.business_id_seq OWNER TO ghm_schema_owner;
ALTER SEQUENCE public.business_membership_id_seq OWNER TO ghm_schema_owner;
```

Database ownership:

```sql
ALTER DATABASE ghm_db OWNER TO ghm_schema_owner;
```

**Schema ownership is deliberately not included in the first mutation set.** The existing `public` schema contains unrelated legacy objects. Transferring `public` ownership would widen the change surface and can affect unrelated legacy behavior. A dedicated GHM schema should be introduced and reconciled before any schema-owner transfer decision.

If provider restrictions reject database ownership transfer to a NOLOGIN role, stop and record the provider limitation. Do not weaken the target model by granting runtime ownership.

## Phase 4 — establish controlled schema migration authority

Because the current migration runner creates objects, the clean target is for it to connect as `ghm_migrator` and explicitly enter the owner role for migration DDL:

```sql
SET ROLE ghm_schema_owner;
```

The migration process must then perform its migration work, including migration-ledger writes, while the effective role is `ghm_schema_owner`.

At the end of the migration transaction/process:

```sql
RESET ROLE;
```

The application runtime never receives this membership.

Important: this is a runtime/migration-process code-path change and must be qualified separately. It is not achieved by granting `ghm_runtime` any owner privileges.

## Phase 5 — future-object default privileges

Default privileges must be set by the role that actually creates future GHM objects.

If migrations execute as `ghm_schema_owner`, establish controlled defaults for objects created by that role. Start from no broad runtime defaults and add only measured runtime capabilities.

Conceptual target:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE ghm_schema_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO ghm_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE ghm_schema_owner IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO ghm_runtime;
```

**Do not execute these exact public-schema defaults until the dedicated-schema decision is made.** The first slice shares `public` with legacy objects, so a default privilege change there can affect future non-GHM objects created by `ghm_schema_owner`.

For the final design, defaults should be scoped to a dedicated GHM schema whenever possible.

## Phase 6 — runtime database/schema authority

```sql
GRANT CONNECT ON DATABASE ghm_db TO ghm_runtime;
```

Do not grant TEMP unless an actual runtime probe demonstrates that it is required.

For a dedicated GHM schema:

```sql
GRANT USAGE ON SCHEMA ghm TO ghm_runtime;
```

For the current first slice in `public`, use only as an interim construction qualification:

```sql
GRANT USAGE ON SCHEMA public TO ghm_runtime;
```

Do not grant schema CREATE.

## Phase 7 — runtime table authority

Exact first-slice grants:

```sql
GRANT SELECT, UPDATE
  ON TABLE public.account_identity
  TO ghm_runtime;

GRANT SELECT, INSERT, UPDATE
  ON TABLE public.business
  TO ghm_runtime;

GRANT SELECT, INSERT
  ON TABLE public.business_membership
  TO ghm_runtime;
```

No runtime grants on:

```text
DELETE
TRUNCATE
TRIGGER
REFERENCES
migration-ledger writes
arbitrary DDL
```

No runtime access to:

```sql
public.ghm_schema_migrations
```

## Phase 8 — identity sequence minimum qualification

Start with:

```sql
GRANT USAGE
  ON SEQUENCE public.account_identity_id_seq,
               public.business_id_seq,
               public.business_membership_id_seq
  TO ghm_runtime;
```

Do not grant SELECT or UPDATE initially.

Positive probe must execute the real Business INSERT path as `ghm_runtime`.

Negative probes must prove that direct sequence mutation is unavailable, including:

```sql
SELECT last_value FROM public.business_id_seq;
```

and:

```sql
SELECT setval('public.business_id_seq', 1);
```

The exact expected failure of the direct probes must be captured. If repository insert fails with USAGE-only, diagnose the actual SQL requirement before increasing privileges. Do not blindly add SELECT/UPDATE.

## Phase 9 — remove old authority path

Only after `ghm_migrator` and `ghm_runtime` have independently passed qualification:

```sql
REVOKE ghm_db_user FROM ghm_app_user;
```

Then remove obsolete direct broad grants from `ghm_app_user` if any remain and are no longer required.

Do not drop `ghm_db_user` in the same change. Keep it as a reversible transitional authority until:

- ownership is verified under `ghm_schema_owner`;
- migration qualification passes under `ghm_migrator`;
- runtime qualification passes under `ghm_runtime`;
- recovery/admin access is independently confirmed.

`pg_read_all_stats` and `pg_signal_backend` must not be transferred to `ghm_runtime` merely because `ghm_app_user` currently has them.

## Phase 10 — positive qualification

Under `ghm_runtime`:

1. SELECT account identity.
2. UPDATE allowlisted account fields.
3. SELECT Business by id.
4. SELECT Business by slug.
5. INSERT Business.
6. UPDATE Business name/slug.
7. SELECT active memberships.
8. INSERT owner membership.
9. Confirm generated identity IDs work with sequence USAGE only.
10. Confirm normal service transaction commit/rollback behavior.

Under `ghm_migrator`:

1. Connect.
2. Explicit `SET ROLE ghm_schema_owner` succeeds.
3. Migration no-op succeeds.
4. Disposable DDL probe succeeds.
5. Migration ledger write succeeds.
6. `RESET ROLE` succeeds.

## Phase 11 — negative qualification

Under `ghm_runtime`, all of these must fail:

```sql
CREATE TABLE public.ghm_runtime_forbidden(id bigint);
CREATE SCHEMA ghm_runtime_forbidden;
TRUNCATE TABLE public.business;
DELETE FROM public.business;
INSERT INTO public.ghm_schema_migrations(version,name,checksum) VALUES ('x','x','x');
UPDATE public.ghm_schema_migrations SET name = name;
DELETE FROM public.ghm_schema_migrations;
SELECT setval('public.business_id_seq', 1);
SET ROLE ghm_schema_owner;
SET ROLE ghm_migrator;
```

The test harness must use disposable names/data and must not modify production.

## Rollback sequence

If qualification fails before old authority removal:

```sql
REVOKE ghm_schema_owner FROM ghm_migrator;
```

Restore ownership to `ghm_db_user` only for objects whose ownership was actually transferred and only where required for recovery.

Revoke new runtime grants if necessary:

```sql
REVOKE CONNECT ON DATABASE ghm_db FROM ghm_runtime;
REVOKE USAGE ON SCHEMA public FROM ghm_runtime;
REVOKE SELECT, UPDATE ON TABLE public.account_identity FROM ghm_runtime;
REVOKE SELECT, INSERT, UPDATE ON TABLE public.business FROM ghm_runtime;
REVOKE SELECT, INSERT ON TABLE public.business_membership FROM ghm_runtime;
REVOKE USAGE ON SEQUENCE public.account_identity_id_seq,
                         public.business_id_seq,
                         public.business_membership_id_seq
  FROM ghm_runtime;
```

Do not drop target roles until recovery is proven unnecessary.

## Founder Gate

The following is the explicit execution gate:

> **FOUNDER APPROVAL REQUIRED:** Authorize the exact PostgreSQL role, membership, ownership, grant, and revoke mutations described in this document against the GHM construction PostgreSQL instance only.

Until that approval is explicitly given, this SQL is **plan-only**.

## Final invariant

After successful qualification:

```text
application runtime
    |
    v
ghm_runtime
    |
    +--> measured application DML/read
    +--> sequence USAGE only unless empirically expanded
    X--> ghm_schema_owner
    X--> ghm_migrator
    X--> DDL
    X--> migration ledger
    X--> broad database/schema creation authority
```

Supabase production remains untouched and remains the rollback provider for the eventual product migration.
