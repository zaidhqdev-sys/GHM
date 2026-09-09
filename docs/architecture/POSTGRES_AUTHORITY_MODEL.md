# GHM PostgreSQL Authority Model

Status: **CONSTRUCTION MODEL — ROLE SEPARATION EXECUTED THROUGH RUNTIME QUALIFICATION; BOOTSTRAP CLEANUP REMAINS OPEN**

## Purpose

GHM must separate database ownership, migration authority, and application runtime authority. The original construction database did not satisfy that separation: `ghm_app_user` inherited `ghm_db_user`, while `ghm_db_user` owned the database, `public` schema, application tables, and identity sequences and had CREATEDB/CREATEROLE plus broad object privileges.

This document records the measured authority baseline, the target authority boundary, and the actual construction execution/qualification state.

## Production safety boundary

This model applies only to the GHM construction PostgreSQL instance.

Zaid Connect and QuoteFlow production remain on Supabase. No production environment variable, DNS, credential, routing, or live-traffic change is part of this authority work.

## Original measured authority

The original role chain was:

```text
ghm_app_user
  -> ghm_db_user
  -> pg_read_all_stats
  -> pg_signal_backend
```

Measured `ghm_app_user` attributes:

- LOGIN: true
- SUPERUSER: false
- INHERIT: true
- CREATEROLE: false
- CREATEDB: false
- REPLICATION: false
- BYPASSRLS: false

Measured `ghm_db_user` attributes:

- LOGIN: true
- SUPERUSER: false
- INHERIT: true
- CREATEROLE: true
- CREATEDB: true
- REPLICATION: false
- BYPASSRLS: false

Effective role-membership checks for `ghm_app_user` against `ghm_db_user` returned USAGE, SET, and MEMBER true. Therefore the original application identity could inherit `ghm_db_user` authority and explicitly `SET ROLE ghm_db_user`.

Original ownership was:

- database `ghm_db` owner: `ghm_db_user`;
- schema `public` owner: `ghm_db_user`;
- first-slice GHM tables and identity sequences: `ghm_db_user`.

Original effective application authority also included database/schema CREATE and broad table/sequence privileges through the inherited owner role.

## Target identities

### `ghm_schema_owner`

- NOLOGIN.
- Owns GHM objects where ownership is required.
- Not an application runtime identity.
- Not inherited by runtime.
- No routine application credentials.

### `ghm_migrator`

- LOGIN identity for the standalone migration process.
- NOINHERIT.
- Minimum migration DDL/ledger authority only.
- Has an explicit SET-capable membership into `ghm_schema_owner` for controlled migration ownership/DDL operations.
- Not an application runtime identity.

### `ghm_runtime`

- LOGIN identity for GHM HTTP/application runtime.
- NOINHERIT.
- Must not own the database, application schema, tables, sequences, or migration ledger.
- No CREATEDB or CREATEROLE.
- No schema CREATE.
- No DELETE, TRUNCATE, TRIGGER, REFERENCES, arbitrary DDL, migration-ledger access, or role escalation.
- No membership or SET ROLE path into `ghm_schema_owner` or `ghm_migrator`.

## Executed role separation

The Founder Gate was explicitly authorized on 2026-09-09 for the construction PostgreSQL instance only.

The target roles were created and verified with the intended restricted attributes.

The controlled migrator-to-owner path was established:

```sql
GRANT ghm_schema_owner TO ghm_migrator WITH INHERIT FALSE, SET TRUE;
```

A real login as `ghm_migrator` successfully qualified `SET ROLE ghm_schema_owner`, with `session_user = ghm_migrator` and effective `current_user = ghm_schema_owner` after the role switch.

The four first-slice GHM tables were transferred to `ghm_schema_owner`:

```text
account_identity
business
business_membership
ghm_schema_migrations
```

Their identity sequences were automatically transferred with the corresponding identity tables.

The `ghm_db` database owner was transferred to `ghm_schema_owner`.

The `public` schema was deliberately left under its existing ownership because unrelated legacy objects coexist there.

A temporary `CREATE` privilege on `public` was used for ownership transfer and revoked immediately afterward. Final measured `ghm_schema_owner` CREATE privilege on `public` is false.

## Runtime grant derivation — first Business Identity slice

The implemented repository SQL establishes the following runtime requirements.

### Database

Required:

- CONNECT

TEMP remains an explicit measured decision. It is not included in the target application grant merely because the construction environment currently permits it through existing database privileges.

### Schema

Required:

- USAGE on the application schema

Not required:

- CREATE

### `account_identity`

Observed runtime SQL:

- SELECT by authenticated account id;
- UPDATE only `full_name`, `phone`, `avatar_ref`, and `updated_at` through a fixed statement.

Target:

- SELECT
- UPDATE

Account INSERT is not part of the first-slice runtime contract.

### `business`

Observed runtime SQL:

- SELECT by id;
- SELECT by slug;
- INSERT with server-controlled verification/status/timestamps and generated identity id;
- UPDATE only `name`, `slug`, and `updated_at` through a fixed statement.

Target:

- SELECT
- INSERT
- UPDATE

### `business_membership`

Observed runtime SQL:

- SELECT active memberships;
- SELECT active owner/administrator membership for managed operations;
- INSERT owner membership during Business creation.

Target:

- SELECT
- INSERT

### Identity sequences

The first migration uses PostgreSQL identity columns for all three primary keys.

Target runtime sequence privilege is **USAGE only** initially. SELECT and UPDATE are not granted.

A direct `setval` probe under `ghm_runtime` was rejected with PostgreSQL `42501`, confirming direct sequence mutation is unavailable.

### Migration ledger

`ghm_schema_migrations` is migration authority, not runtime authority.

Target runtime access:

- no SELECT
- no INSERT
- no UPDATE
- no DELETE
- no TRUNCATE

## Current qualified runtime boundary

Read-only ACL inspection under `ghm_runtime` confirmed:

```text
account_identity      SELECT/UPDATE
business              SELECT/INSERT/UPDATE
business_membership   SELECT/INSERT
identity sequences    USAGE only
public schema         USAGE, no CREATE
migration ledger      no SELECT/INSERT/UPDATE/DELETE
```

Runtime identity qualification returned:

```text
current_user      = ghm_runtime
session_user      = ghm_runtime
current_database  = ghm_db
migrator_member   = false
migrator_set      = false
owner_member      = false
owner_set         = false
```

Positive ACL qualification passed.

Negative execution qualification passed for:

- CREATE TABLE;
- CREATE SCHEMA;
- TRUNCATE `business`;
- DELETE `business`;
- migration-ledger INSERT/UPDATE/DELETE;
- direct sequence `setval`;
- `SET ROLE ghm_schema_owner`;
- `SET ROLE ghm_migrator`.

All forbidden probes were rejected with PostgreSQL `42501`.

The first runtime CRUD harness failure on `account_identity` INSERT was a test-harness defect, not an ACL defect. The approved contract grants SELECT/UPDATE on `account_identity` and the ACL audit confirmed that exact boundary. No corrective database grant was required.

## Membership and inheritance rules

The runtime must not be a member of the schema-owner or migrator roles. Runtime authority must not be recovered indirectly through role inheritance.

`pg_read_all_stats` and `pg_signal_backend` are not application data authorities and must not be inherited by the final runtime identity unless an explicit operational requirement is documented and approved.

The controlled migrator-to-owner membership uses NOINHERIT plus SET capability so migration ownership/DDL is explicit rather than silently inherited.

## Bootstrap membership cleanup — unresolved

The construction database still contains memberships granted by the bootstrap `postgres` role:

```text
 ghm_db_user -> ghm_schema_owner
 ghm_db_user -> ghm_migrator
 ghm_db_user -> ghm_runtime
```

These were observed with admin option true, inherit false, set false. They were not removed because `ghm_db_user` is not the grantor and therefore cannot revoke them itself.

This is a provider/bootstrap-authority blocker, not evidence that `ghm_runtime` has access to those roles. The direct runtime qualification proves `ghm_runtime` has no membership or SET path into owner/migrator.

`ghm_db_user` must not be deleted merely to hide this unresolved membership state; it remains relevant to legacy-object recovery and provider bootstrap authority.

## Ownership/default privilege rules

Current first-slice ownership is separated under `ghm_schema_owner`, while the shared `public` schema remains deliberately unchanged.

Future-object defaults remain deferred. No broad shared-`public` default privileges were added for the runtime.

A dedicated GHM application schema should be reconciled before applying future-object defaults so GHM defaults cannot accidentally affect unrelated legacy objects.

The final model must explicitly cover:

1. database ownership;
2. schema ownership;
3. table/index/sequence ownership;
4. migration-ledger ownership;
5. default privileges for future tables and sequences;
6. runtime table/sequence grants;
7. migration DDL grants;
8. role memberships and inheritance;
9. SET ROLE exposure;
10. provider-specific bootstrap restrictions.

## Migration runner status

The standalone migration runner currently has a qualified TLS connection path and migration/ledger integrity is qualified.

The dedicated `ghm_migrator` login and SET ROLE path are qualified, but the migration runner has **not yet been switched to the dedicated `ghm_migrator` credential**. That construction-only application/configuration change is a separate qualification gate.

## Final target permission matrix

| Capability | schema owner | migrator | runtime |
|---|---:|---:|---:|
| LOGIN | No | Yes | Yes |
| Database ownership | Yes | No | No |
| Schema ownership | Yes | No | No |
| Application object ownership | Yes | No | No |
| CREATEDB | No | No | No |
| CREATEROLE | No | No | No |
| Application schema USAGE | N/A | Yes | Yes |
| Application schema CREATE | ownership | only where migration requires it | No |
| Business Identity SELECT | ownership | controlled migration access | Yes where required |
| Business Identity INSERT | ownership | controlled migration access | Yes where required |
| Business Identity UPDATE | ownership | controlled migration access | Yes where required |
| Business Identity DELETE | ownership | only where migration requires it | No |
| TRUNCATE | ownership | only where migration requires it | No |
| TRIGGER | ownership | only where migration requires it | No |
| REFERENCES | ownership | only where migration requires it | No |
| Migration ledger write | Yes | Yes via controlled migration path | No |
| Arbitrary DDL | Yes | Yes, migration scope | No |
| Membership into owner/migrator | No | explicit owner SET path only | No |
| SET ROLE into owner/migrator | No | controlled owner SET | No |

## Remaining gates

1. Resolve bootstrap membership cleanup through the independent `postgres`/provider authority path.
2. Switch the standalone migration runner to `ghm_migrator` and explicitly `SET ROLE ghm_schema_owner`, then qualify real migration/no-op/DDL/ledger behavior.
3. Reconcile a dedicated GHM application schema and future-object default privileges.
4. Measure whether runtime TEMP is required; if not, remove it from the final runtime authority where possible.
5. Re-run full build/typecheck/test and authority qualification after migration-runner changes.
6. Only after all replacement gates are satisfied consider final removal of the old `ghm_app_user -> ghm_db_user` authority path.
7. Keep production Supabase unchanged throughout.

## Safety invariant

```text
Zaid Connect production  -> unchanged / Supabase
QuoteFlow production     -> unchanged / Supabase

GHM construction:
  ghm_schema_owner -> ownership
  ghm_migrator     -> controlled migration authority
  ghm_runtime      -> measured application DML/read only
```
