# GHM PostgreSQL Role Separation Runbook

Status: **CONSTRUCTION RECORD — ROLE SEPARATION AND DEDICATED MIGRATOR QUALIFIED; BOOTSTRAP CLEANUP REMAINS OPEN**

## Objective

Separate the current construction authority chain into three explicit identities without changing Zaid Connect or QuoteFlow production:

```text
ghm_schema_owner  (NOLOGIN)
        ^
        | explicit migration SET ROLE path only
        |
ghm_migrator      (LOGIN, migration process only)

ghm_runtime       (LOGIN, application runtime only)
```

The final runtime identity must have no path to the schema owner or migrator.

## Preconditions

Before any mutation:

1. Construction database backup/recovery path is confirmed.
2. No Zaid Connect or QuoteFlow production environment is changed.
3. No production DNS, routing, credentials, or traffic is changed.
4. The current migration ledger is captured and checksum-verified.
5. Current role, membership, ownership, grant, and default-ACL evidence is captured.
6. The exact runtime SQL has been reconciled to the intended first-slice grants.
7. Provider restrictions on role creation, ownership transfer, and password rotation are confirmed.
8. A founder gate explicitly authorizes the construction-only mutation.

These preconditions were satisfied for the executed 2026-09-09 construction role-separation work.

## Current construction authority

The measured original state was:

- `ghm_app_user` LOGIN/INHERIT.
- `ghm_app_user` was a member of `ghm_db_user` and could `SET ROLE` to it.
- `ghm_db_user` LOGIN/INHERIT, CREATEDB and CREATEROLE.
- `ghm_db_user` owned the database, public schema, Business Identity tables, migration ledger, and identity sequences.
- `ghm_app_user` therefore had effective database/schema/object authority far beyond application runtime needs.

Role separation has since been executed for the first-slice GHM objects and independently qualified for runtime and migration paths.

## Executed authority separation

### Phase A — create authority roles

Created and verified:

- `ghm_schema_owner` as NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOREPLICATION, NOBYPASSRLS.
- `ghm_migrator` as LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOREPLICATION, NOBYPASSRLS.
- `ghm_runtime` as LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOREPLICATION, NOBYPASSRLS.

Credential material is not committed to the repository or written into this document.

### Phase B — establish migration-only owner path

Executed:

```sql
GRANT ghm_schema_owner TO ghm_migrator WITH INHERIT FALSE, SET TRUE;
```

A real login as `ghm_migrator` successfully qualified `SET ROLE ghm_schema_owner`; `session_user` remained `ghm_migrator`.

`ghm_runtime` has no membership or SET path into either authority role.

### Phase C — ownership transfer

The first-slice GHM tables were transferred to `ghm_schema_owner`:

- `account_identity`;
- `business`;
- `business_membership`;
- `ghm_schema_migrations`.

Their identity sequences transferred automatically with the corresponding identity tables.

The `ghm_db` database owner was transferred to `ghm_schema_owner`.

The existing `public` schema was deliberately not transferred because unrelated legacy objects coexist there. A temporary `CREATE` privilege on `public` used during ownership work was revoked immediately afterward.

### Phase D — bootstrap membership cleanup

**OPEN / BLOCKED.**

The following memberships remain:

```text
ghm_db_user -> ghm_schema_owner
  admin_option = true
  inherit = false
  set = false

ghm_db_user -> ghm_migrator
  admin_option = true
  inherit = false
  set = false

ghm_db_user -> ghm_runtime
  admin_option = true
  inherit = false
  set = false
```

They were granted by bootstrap `postgres`, so `ghm_db_user` cannot revoke them itself. An independent provider/bootstrap-authority path is required.

Do not delete `ghm_db_user` as a substitute; it remains relevant to legacy-object recovery and provider bootstrap authority.

### Phase E — future-object defaults

**NOT EXECUTED.**

Default privileges remain deferred until a dedicated GHM application schema is reconciled. No broad shared-`public` defaults were added.

### Phase F — runtime authority

Executed first-slice grants:

```sql
GRANT CONNECT ON DATABASE ghm_db TO ghm_runtime;
GRANT USAGE ON SCHEMA public TO ghm_runtime;

GRANT SELECT, UPDATE
  ON TABLE public.account_identity
  TO ghm_runtime;

GRANT SELECT, INSERT, UPDATE
  ON TABLE public.business
  TO ghm_runtime;

GRANT SELECT, INSERT
  ON TABLE public.business_membership
  TO ghm_runtime;

GRANT USAGE
  ON SEQUENCE public.account_identity_id_seq,
               public.business_id_seq,
               public.business_membership_id_seq
  TO ghm_runtime;
```

No schema CREATE, runtime DELETE, TRUNCATE, TRIGGER, REFERENCES, or migration-ledger privileges were granted.

### Phase G — dedicated migration runner

The migration runner now uses `GHM_MIGRATOR_DATABASE_URL` and has been independently qualified against the construction PostgreSQL database.

Measured:

```text
current_user     = ghm_migrator
session_user     = ghm_migrator
current_database = ghm_db
```

Observed execution included:

```text
POOL.CONNECT
SET ROLE ghm_schema_owner
identity query
BEGIN
pg_advisory_xact_lock
migration ledger existence check
migration ledger SELECT
COMMIT
```

Migration ledger reconciliation, transaction commit, repeat/no-op behavior, and repository checksum matching all passed.

Detailed evidence: `docs/MIGRATOR_QUALIFICATION_2026-09-10.md`.

Result:

```text
GHM DEDICATED MIGRATION RUNNER QUALIFICATION: PASS
```

### Phase H — old authority path

**NOT COMPLETE.**

The old `ghm_app_user -> ghm_db_user` path remains until replacement migration/runtime paths and recovery access are independently qualified and the bootstrap memberships are resolved through the independent authority path.

Do not execute the final revoke or drop as a shortcut around the provider/bootstrap blocker.

## Positive qualification

Under `ghm_runtime`:

- identity SELECT/UPDATE capability qualified;
- Business SELECT/INSERT/UPDATE capability qualified;
- membership SELECT/INSERT capability qualified;
- identity sequence USAGE qualified;
- normal forbidden operations were rejected.

Under `ghm_migrator` / explicit owner path:

- direct dedicated login identity qualified;
- explicit owner SET path qualified;
- migration ledger reconciliation qualified;
- transaction commit qualified;
- repeat/no-op behavior qualified;
- repository migration checksums matched the live ledger.

## Negative qualification

Under `ghm_runtime`:

- `CREATE SCHEMA` fails;
- `CREATE TABLE` fails;
- `TRUNCATE` fails;
- `DELETE` fails on first-slice tables;
- migration-ledger INSERT/UPDATE/DELETE fails;
- direct sequence `setval` fails;
- `SET ROLE ghm_schema_owner` fails;
- `SET ROLE ghm_migrator` fails;
- no inherited membership exposes owner/migrator authority.

Required forbidden probes were rejected with PostgreSQL `42501`.

## Rollback principle

Rollback remains available because the old transitional identity has not been dropped and production has not been touched.

If runtime qualification fails, restore the construction application path before further tightening. If migration qualification fails, retain the previous construction migration path until a replacement is proven.

Never roll back by changing production product configuration.

## Founder gate

The exact construction-only role/membership/ownership/grant/revoke plan was explicitly authorized by the Founder on 2026-09-09.

No production system was included in that authorization.

## Current gate position

Role separation through runtime authority qualification is complete. Dedicated migration-runner qualification is also complete.

The remaining authority work is:

1. bootstrap membership cleanup through the independent `postgres`/provider authority path;
2. dedicated GHM application schema and future-object default-privilege reconciliation;
3. runtime TEMP requirement decision;
4. Transaction Qualification with authentication, authorization, explicit repositories, runtime boundary, and reconciled schema;
5. only then final removal of the old `ghm_app_user -> ghm_db_user` authority path.

Production Supabase remains unchanged.
