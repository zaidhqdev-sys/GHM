# GHM PostgreSQL Role Separation — Exact Construction SQL Plan

Status: **EXECUTED THROUGH RUNTIME AUTHORITY QUALIFICATION — BOOTSTRAP CLEANUP REMAINS BLOCKED**

This document is the exact construction-only mutation plan derived from the measured GHM authority baseline. The Founder Gate was explicitly authorized on 2026-09-09. The role, membership, ownership, and runtime-grant mutations described below have been executed against the GHM construction PostgreSQL instance and independently qualified where stated. Remaining bootstrap membership cleanup is provider/bootstrap-authority dependent and has not been falsely marked complete.

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

`ghm_runtime` has no membership in `ghm_schema_owner` or `ghm_migrator` and has no SET ROLE path into either.

## Phase 0 — snapshot before mutation

Completed read-only snapshot before role mutation. Evidence recorded in the 2026-09-09 handover and authority documentation.

The pre-mutation state established that `ghm_app_user` inherited `ghm_db_user`, with effective SET ROLE capability, while `ghm_db_user` owned the database, public schema, first-slice objects, and identity sequences.

## Phase 1 — create target roles

Executed successfully on the GHM construction database.

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

Measured result: all three target roles have the intended attributes. `ghm_schema_owner` is NOLOGIN; `ghm_migrator` and `ghm_runtime` are LOGIN; none is superuser, CREATEDB, CREATEROLE, replication, or BYPASSRLS.

Passwords are not stored in GitHub or this document.

## Phase 2 — establish migrator-to-owner SET path

Executed successfully:

```sql
GRANT ghm_schema_owner TO ghm_migrator WITH INHERIT FALSE, SET TRUE;
```

Measured result:

- `ghm_migrator` membership in `ghm_schema_owner` — true;
- inherited owner usage — false;
- explicit SET ROLE capability — true;
- `ghm_runtime` membership/SET capability into owner — false;
- `ghm_runtime` membership/SET capability into migrator — false.

## Phase 3 — transfer GHM object ownership

The first ownership attempt exposed an identity-sequence dependency: transferring an identity table automatically transfers its identity sequence. The explicit sequence ownership statements were therefore removed from the transactional transfer set.

The corrected Phase 3B succeeded.

Executed against the four GHM-owned tables:

```sql
ALTER TABLE public.account_identity OWNER TO ghm_schema_owner;
ALTER TABLE public.business OWNER TO ghm_schema_owner;
ALTER TABLE public.business_membership OWNER TO ghm_schema_owner;
ALTER TABLE public.ghm_schema_migrations OWNER TO ghm_schema_owner;
```

PostgreSQL automatically transferred:

```text
account_identity_id_seq
business_id_seq
business_membership_id_seq
```

to `ghm_schema_owner` because they are identity sequences owned by the corresponding tables.

The `public` schema was deliberately not transferred because it contains unrelated legacy objects.

A temporary `CREATE` privilege on `public` was required during the ownership operation and was explicitly revoked immediately afterward. Final measured state: `ghm_schema_owner` has no CREATE privilege on `public`.

Phase 3C also succeeded:

```sql
ALTER DATABASE ghm_db OWNER TO ghm_schema_owner;
```

Measured final ownership for the first-slice GHM objects:

- database `ghm_db` — `ghm_schema_owner`;
- `account_identity` — `ghm_schema_owner`;
- `business` — `ghm_schema_owner`;
- `business_membership` — `ghm_schema_owner`;
- `ghm_schema_migrations` — `ghm_schema_owner`;
- all three identity sequences — `ghm_schema_owner`.

## Phase 3D — bootstrap membership cleanup

An attempted cleanup of the original `ghm_db_user` memberships did not complete because the three memberships were granted by the bootstrap `postgres` role, not by `ghm_db_user`.

The attempted transaction did not remove those memberships. This is intentional in the final evidence: no false claim of cleanup is made.

Current measured bootstrap memberships remain:

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

These memberships are granted by `postgres` and therefore cannot be revoked by `ghm_db_user` itself. They require an independent bootstrap/provider-authority path.

This is the remaining authority-cleanup blocker.

## Phase 4 — establish controlled schema migration authority

The real `ghm_migrator` login path has been qualified independently.

Measured:

```text
ghm_migrator -> ghm_schema_owner
membership = true
SET ROLE = true
```

A real login as `ghm_migrator` successfully executed:

```sql
SET ROLE ghm_schema_owner;
```

and became effective `ghm_schema_owner` while retaining `session_user = ghm_migrator`.

The migration runner has not yet been switched from its existing construction connection to the dedicated `ghm_migrator` credential. That is a separate code/configuration qualification and must remain construction-only.

## Phase 5 — future-object default privileges

Not executed.

Default privileges on the shared `public` schema remain deliberately deferred because `public` contains unrelated legacy objects. A dedicated GHM schema should be established and reconciled before future-object defaults are applied.

## Phase 6 — runtime database/schema authority

Executed:

```sql
GRANT CONNECT ON DATABASE ghm_db TO ghm_runtime;
GRANT USAGE ON SCHEMA public TO ghm_runtime;
```

No schema CREATE privilege was granted.

Measured:

```text
schema USAGE = true
schema CREATE = false
```

The existing database TEMP capability has not yet been separately removed; whether TEMP is required by the runtime remains an explicit qualification item rather than an assumption.

## Phase 7 — runtime table authority

Executed:

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

Measured effective ACL exactly matches the intended first-slice boundary:

```text
account_identity      SELECT/UPDATE
business              SELECT/INSERT/UPDATE
business_membership   SELECT/INSERT
```

No runtime DELETE, TRUNCATE, TRIGGER, or REFERENCES grants were added.

## Phase 8 — identity sequence minimum qualification

Executed:

```sql
GRANT USAGE
  ON SEQUENCE public.account_identity_id_seq,
               public.business_id_seq,
               public.business_membership_id_seq
  TO ghm_runtime;
```

Read-only ACL inspection confirms runtime sequence privileges are USAGE only; SELECT and UPDATE are false.

A direct `setval` negative probe was rejected with PostgreSQL `42501`.

The first qualification harness initially attempted an invalid `account_identity` INSERT. That was a test-harness defect: the approved runtime contract grants SELECT/UPDATE on `account_identity`, not INSERT. No database correction was required. A corrected ACL qualification subsequently passed.

## Phase 9 — remove old authority path

**NOT COMPLETE.**

The intended cleanup remains:

```sql
REVOKE ghm_db_user FROM ghm_app_user;
```

but it has not been executed because the construction bootstrap role memberships require independent authority and because the legacy owner role still has transitional responsibilities.

Do not drop `ghm_db_user` in the current construction state. It remains a transitional/recovery identity for legacy objects and provider bootstrap reconciliation.

## Phase 10 — positive runtime authority qualification

The empty construction GHM tables mean data-dependent CRUD cannot all be exercised without introducing disposable fixture rows. The formal qualification therefore used effective privilege probes against the actual runtime identity, supplemented by negative execution probes.

Measured runtime identity:

```text
current_user  = ghm_runtime
session_user  = ghm_runtime
current_database = ghm_db
migrator_member = false
migrator_set = false
owner_member = false
owner_set = false
```

Measured positive ACL boundary:

```text
account_identity SELECT  = true
account_identity UPDATE  = true
business SELECT          = true
business INSERT          = true
business UPDATE          = true
business_membership SELECT = true
business_membership INSERT = true
all three sequence USAGE = true
public schema USAGE      = true
public schema CREATE     = false
```

Result:

```text
POSITIVE PASS: runtime ACL matches intended first-slice boundary
```

## Phase 11 — negative runtime authority qualification

All required negative probes were executed as `ghm_runtime` and rejected with PostgreSQL `42501`:

```text
CREATE TABLE                    PASS — rejected
CREATE SCHEMA                   PASS — rejected
TRUNCATE business               PASS — rejected
DELETE business                 PASS — rejected
INSERT migration ledger        PASS — rejected
UPDATE migration ledger        PASS — rejected
DELETE migration ledger        PASS — rejected
SEQUENCE setval                 PASS — rejected
SET ROLE ghm_schema_owner       PASS — rejected
SET ROLE ghm_migrator           PASS — rejected
```

Migration-ledger effective privileges were also measured as false for SELECT, INSERT, UPDATE, and DELETE.

Final runtime qualification result:

```text
GHM RUNTIME AUTHORITY QUALIFICATION: PASS
```

## Rollback sequence

Rollback remains available because the old transitional identity has not been dropped and production has not been touched.

Any rollback must be based on the measured pre-change ownership/ACL snapshot and only restore objects/privileges that were actually changed by this construction operation.

Do not drop target roles until recovery is proven unnecessary.

## Founder Gate

Founder approval was explicitly granted for execution of this exact construction-only role/membership/ownership/grant/revoke plan on 2026-09-09.

No production system was included in that authorization.

## Final invariant currently qualified

```text
application runtime
    |
    v
ghm_runtime
    |
    +--> measured application DML/read
    +--> sequence USAGE only
    X--> ghm_schema_owner
    X--> ghm_migrator
    X--> DDL
    X--> migration ledger
    X--> schema CREATE
    X--> DELETE/TRUNCATE/TRIGGER/REFERENCES
```

The runtime boundary is qualified. The remaining incomplete item is cleanup of bootstrap memberships granted by `postgres`, plus dedicated migration-runner credential/configuration qualification.

Supabase production remains untouched and remains the rollback provider for the eventual product migration.
