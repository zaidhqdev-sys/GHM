# GHM PostgreSQL Role Separation — Exact Construction SQL Plan

Status: **EXECUTED THROUGH RUNTIME AND DEDICATED MIGRATOR QUALIFICATION — BOOTSTRAP CLEANUP REMAINS BLOCKED**

This document records the construction-only role, membership, ownership, and grant plan. The Founder Gate was authorized on 2026-09-09. Executed historical SQL is retained as evidence; where historical statements reference `public`, they describe the legacy/pre-dedicated-schema state at that point in construction and are not the current canonical GHM application-schema boundary.

## Scope

Target: GHM construction PostgreSQL database only.

Out of scope:

- Zaid Connect production
- QuoteFlow production
- Supabase production
- DNS
- production environment variables
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

Completed read-only snapshot before role mutation. The pre-mutation state established that `ghm_app_user` inherited `ghm_db_user`, with effective SET ROLE capability, while `ghm_db_user` owned the database, legacy `public` schema, first-slice objects, and identity sequences.

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

Passwords are not stored in GitHub or this document.

## Phase 2 — establish migrator-to-owner SET path

Executed successfully:

```sql
GRANT ghm_schema_owner TO ghm_migrator WITH INHERIT FALSE, SET TRUE;
```

A real login as `ghm_migrator` qualified `SET ROLE ghm_schema_owner`. Runtime has no membership or SET capability into owner or migrator.

## Phase 3 — transfer GHM object ownership

### Historical executed state

The first ownership attempt exposed an identity-sequence dependency: transferring an identity table automatically transfers its identity sequence. The corrected ownership transfer therefore did not separately transfer those identity sequences.

The original construction transfer statements referenced the then-current `public` objects:

```sql
ALTER TABLE public.account_identity OWNER TO ghm_schema_owner;
ALTER TABLE public.business OWNER TO ghm_schema_owner;
ALTER TABLE public.business_membership OWNER TO ghm_schema_owner;
ALTER TABLE public.ghm_schema_migrations OWNER TO ghm_schema_owner;
```

PostgreSQL automatically transferred the corresponding identity sequences.

The database owner was transferred to `ghm_schema_owner`. The shared legacy `public` schema itself was deliberately not transferred because unrelated legacy objects coexist there.

A temporary `CREATE` privilege on `public` used during ownership work was revoked immediately afterward.

### Current canonical interpretation

The current GHM application schema is **`ghm`**. Subsequent canonical resource migrations and runtime grants are scoped to `ghm`; historical `public.*` statements above must not be copied as current target SQL.

## Phase 3D — bootstrap membership cleanup

**OPEN / BLOCKED.**

The following memberships remain because they were granted by bootstrap `postgres` authority:

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

They require an independent provider/bootstrap-authority path. Do not delete `ghm_db_user` or attempt an unqualified workaround.

## Phase 4 — dedicated migration authority and runner qualification

The real `ghm_migrator` login path has been independently qualified.

Measured:

```text
ghm_migrator -> ghm_schema_owner
membership = true
SET ROLE = true
```

The standalone migration runner uses `GHM_MIGRATOR_DATABASE_URL`.

Independent qualification passed for:

- direct migration identity;
- explicit `SET ROLE ghm_schema_owner`;
- migration ledger reconciliation;
- transaction commit;
- repeat/no-op behavior;
- repository checksum matching.

Result:

```text
GHM DEDICATED MIGRATION RUNNER QUALIFICATION: PASS
```

## Phase 5 — future-object default privileges

The dedicated GHM application schema is now established for the current construction boundary. Future-object defaults remain a controlled authority item and must not grant blanket runtime DML.

No broad shared-`public` application defaults were introduced.

Any final default-privilege policy must be measured against the dedicated `ghm` schema and qualified before being treated as production-replacement authority.

## Phase 6 — runtime database/schema authority

### Historical execution record

Earlier role-separation SQL granted runtime access against the then-current `public` schema. Those statements are retained as historical execution evidence and are not the current canonical target.

### Current qualified boundary

The current canonical runtime application schema is `ghm`.

The runtime boundary is:

```text
CONNECT on ghm_db
USAGE on ghm
no CREATE on ghm
```

The current TEMP decision is **NO GRANT REQUIRED** for the qualified runtime boundary.

## Phase 7 — runtime table authority

### Current qualified resource boundary

Runtime table privileges are derived from concrete repository SQL and qualified per resource. The first Business Identity slice is:

```text
account_identity      SELECT/UPDATE
business              SELECT/INSERT/UPDATE
business_membership   SELECT/INSERT
```

No runtime DELETE, TRUNCATE, TRIGGER, REFERENCES, or migration-ledger mutation is granted.

The exact live ACL evidence remains canonical over illustrative SQL syntax.

## Phase 8 — identity sequence minimum qualification

The qualified runtime boundary uses identity sequence `USAGE` only where required by runtime inserts.

A direct `setval` negative probe under `ghm_runtime` was rejected with PostgreSQL `42501`. SELECT and UPDATE on the identity sequences are not part of the runtime boundary.

The initial `account_identity` INSERT qualification failure was a test-harness defect because the approved contract grants SELECT/UPDATE, not INSERT. No database grant correction was required.

## Phase 9 — remove old authority path

**NOT COMPLETE.**

The intended eventual cleanup is:

```sql
REVOKE ghm_db_user FROM ghm_app_user;
```

It remains deferred until bootstrap authority, recovery, replacement runtime paths, and production-replacement gates are independently satisfied.

Do not drop `ghm_db_user` as a shortcut.

## Phase 10 — positive runtime authority qualification

Measured runtime identity:

```text
current_user  = ghm_runtime
session_user = ghm_runtime
current_database = ghm_db
migrator_member = false
migrator_set = false
owner_member = false
owner_set = false
```

Qualified positive boundary:

```text
account_identity SELECT/UPDATE
business SELECT/INSERT/UPDATE
business_membership SELECT/INSERT
required identity sequence USAGE only
```

Result:

```text
POSITIVE PASS: runtime ACL matches the qualified construction boundary
```

## Phase 11 — negative runtime authority qualification

Required negative probes were rejected with PostgreSQL `42501`:

```text
CREATE TABLE                    PASS — rejected
CREATE SCHEMA                   PASS — rejected
TRUNCATE business               PASS — rejected
DELETE business                 PASS — rejected
INSERT migration ledger         PASS — rejected
UPDATE migration ledger         PASS — rejected
DELETE migration ledger         PASS — rejected
SEQUENCE setval                 PASS — rejected
SET ROLE ghm_schema_owner       PASS — rejected
SET ROLE ghm_migrator           PASS — rejected
```

Final result:

```text
GHM RUNTIME AUTHORITY QUALIFICATION: PASS
```

## Rollback sequence

Rollback remains available because the old transitional identity has not been dropped and production has not been touched.

Any rollback must use the measured pre-change ownership/ACL snapshot and restore only construction changes actually made by the relevant operation.

Do not drop target roles until recovery is proven unnecessary.

## Founder Gate

Founder approval was explicitly granted for execution of this construction-only role/membership/ownership/grant/revoke plan on 2026-09-09.

No production system was included in that authorization.

## Current final invariant

```text
application runtime
    |
    v
ghm_runtime
    |
    +--> measured resource DML/read in dedicated ghm schema
    +--> required sequence USAGE only
    X--> ghm_schema_owner
    X--> ghm_migrator
    X--> DDL
    X--> migration ledger mutation
    X--> schema CREATE
    X--> DELETE/TRUNCATE/TRIGGER/REFERENCES
```

The runtime boundary, dedicated `ghm` application schema, and migration runner are qualified for the current construction slices. Remaining authority work is provider/bootstrap membership cleanup, future-object privilege reconciliation, and future resource-specific ACL qualification.

Production replacement remains separately gated. Zaid Connect and QuoteFlow remain on Supabase and are untouched.
