# GHM PostgreSQL Authority Model

Status: **CONSTRUCTION MODEL — ROLE SEPARATION, DEDICATED `ghm` SCHEMA, RUNTIME AUTHORITY, AND MIGRATOR QUALIFICATION COMPLETE; BOOTSTRAP CLEANUP REMAINS OPEN**

## Purpose

GHM separates database ownership, migration authority, and application runtime authority. This document records the measured legacy baseline, the current qualified construction boundary, and the remaining provider/bootstrap work.

## Production safety boundary

This model applies only to the GHM construction PostgreSQL instance.

Zaid Connect and QuoteFlow production remain on Supabase. No production environment variable, DNS, credential, routing, or live-traffic change is authorized by this document.

## Legacy measured authority

The original construction role chain was:

```text
ghm_app_user -> ghm_db_user
```

`ghm_db_user` had broad database/schema/object authority, including CREATEDB/CREATEROLE and broad legacy table privileges. The original `public` schema and legacy objects therefore represented an over-privileged transitional authority model.

That legacy state remains evidence only. It is not the target runtime authority.

## Target identities

### `ghm_schema_owner`

- NOLOGIN.
- Owns GHM application objects where ownership is required.
- Not an application runtime identity.
- Not inherited by runtime.

### `ghm_migrator`

- LOGIN identity for the standalone migration process.
- NOINHERIT.
- No application runtime use.
- Has an explicit SET-capable membership into `ghm_schema_owner` for controlled migration DDL/ownership work.

### `ghm_runtime`

- LOGIN identity for the GHM HTTP/application runtime.
- NOINHERIT.
- Does not own the database, GHM schema, tables, sequences, or migration ledger.
- No CREATEDB or CREATEROLE.
- No schema CREATE, destructive DML, arbitrary DDL, migration-ledger mutation, or role-escalation path.

## Executed role separation

The construction-only role-separation Founder Gate was authorized on 2026-09-09.

The dedicated roles were created and verified with restricted attributes. The controlled migration path is:

```sql
GRANT ghm_schema_owner TO ghm_migrator WITH INHERIT FALSE, SET TRUE;
```

A real `ghm_migrator` login qualified `SET ROLE ghm_schema_owner` while retaining `session_user = ghm_migrator`. `ghm_runtime` has no membership or SET path into either authority role.

## Canonical GHM application schema

The current canonical construction application schema is **`ghm`**.

The first canonical Business Identity slice and subsequent qualified resource slices are introduced through repository-owned migrations and are owned separately from runtime authority.

The `public` schema is legacy/shared construction state and is deliberately not the canonical GHM application schema. It was not converted into the GHM runtime boundary merely to simplify role separation.

## Current qualified runtime boundary

For the current qualified construction capabilities, runtime authority is measured against the dedicated `ghm` schema and concrete repository SQL.

The first Business Identity runtime boundary is:

```text
CONNECT on ghm_db
USAGE on ghm

account_identity      SELECT, UPDATE
business              SELECT, INSERT, UPDATE
business_membership   SELECT, INSERT
required identity     USAGE only
sequences
```

The migration ledger is migration authority, not runtime authority.

The exact live ACL evidence is canonical over illustrative grant syntax.

## Runtime negative authority

The qualified runtime identity was verified as:

```text
current_user      = ghm_runtime
session_user      = ghm_runtime
current_database  = ghm_db
```

Negative probes passed for:

- CREATE SCHEMA;
- CREATE TABLE;
- TRUNCATE first-slice tables;
- DELETE first-slice tables;
- migration-ledger INSERT/UPDATE/DELETE;
- direct sequence mutation;
- `SET ROLE ghm_schema_owner`;
- `SET ROLE ghm_migrator`.

Forbidden PostgreSQL operations were rejected with `42501`.

The current TEMP decision is **NO GRANT REQUIRED** for the qualified runtime boundary.

## Dedicated migration authority

The standalone migration runner uses `GHM_MIGRATOR_DATABASE_URL`.

Qualification established:

```text
current_user     = ghm_migrator
session_user     = ghm_migrator
current_database = ghm_db
```

The explicit owner SET path, migration-ledger reconciliation, transaction commit, repeat/no-op behavior, and repository checksum matching passed.

Result:

```text
GHM DEDICATED MIGRATION RUNNER QUALIFICATION: PASS
```

Detailed historical qualification evidence remains in `docs/MIGRATOR_QUALIFICATION_2026-09-10.md`.

## Bootstrap membership cleanup — OPEN / BLOCKED

The construction database still contains memberships granted by bootstrap `postgres` authority:

```text
ghm_db_user -> ghm_schema_owner
ghm_db_user -> ghm_migrator
ghm_db_user -> ghm_runtime
```

The current dedicated roles cannot revoke memberships whose grantor is the independent bootstrap authority. This is a provider/bootstrap-authority limitation, not evidence that `ghm_runtime` can assume owner/migrator authority.

Do not delete `ghm_db_user`, rotate credentials merely to seek authority, or perform an unqualified revoke/drop workaround.

## Ownership and default privileges

The `ghm` application objects are separated under `ghm_schema_owner`.

Future-object defaults are scoped deliberately and do not grant blanket runtime DML across unrelated schemas. Any future default privilege change must be qualified against the concrete GHM schema and object lifecycle.

The legacy `public` schema remains unchanged except for the already-qualified temporary construction operations documented in the historical role-separation record.

## Resource-derived authority rule

Runtime privileges are not inferred from legacy ownership or from a generic database-wide grant.

For every future governed capability:

1. product source evidence is reconciled;
2. the resource contract is defined;
3. repository SQL is implemented;
4. exact tables, sequences, and functions are measured;
5. least-privilege runtime ACLs are granted;
6. positive and negative qualification passes;
7. the resulting evidence becomes canonical for that slice.

No blanket runtime DML is permitted as a shortcut.

## Current gate position

Closed/qualified construction capabilities include:

- Business Identity;
- Transaction;
- Authorization;
- Resource API boundary;
- Operational Boundary;
- Project private/public disclosure;
- Enquiry;
- Review and aggregate reconciliation.

The remaining database authority work is:

1. resolve bootstrap role memberships through the independent provider/bootstrap authority;
2. continue governed schema/ACL reconciliation for future resource slices;
3. preserve least-privilege future-object defaults;
4. only after all replacement gates and recovery requirements are satisfied, remove unnecessary legacy `ghm_app_user -> ghm_db_user` authority.

These remaining items do **not** reopen the already-qualified runtime, migration, resource, authorization, transaction, project, enquiry, or review gates.

## Production replacement boundary

Construction qualification does not authorize production cutover.

Zaid Connect and QuoteFlow remain on their existing Supabase production backends until product adapters, shadow qualification, controlled cutover, and tested rollback independently pass their gates.
