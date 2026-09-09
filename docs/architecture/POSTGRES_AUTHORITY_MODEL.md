# GHM PostgreSQL Authority Model

Status: construction design; no PostgreSQL role/grant mutation authorized by this document.

## Purpose

GHM must separate database ownership, migration authority, and application runtime authority. The current construction database does not satisfy that separation: `ghm_app_user` inherits `ghm_db_user`, while `ghm_db_user` owns the database, `public` schema, application tables, and identity sequences and has CREATEDB/CREATEROLE plus broad object privileges.

This document records the target authority boundary derived from measured GHM SQL and the first Business Identity migration.

## Current measured authority

The current role chain is:

```text
ghm_app_user
  -> pg_read_all_stats
  -> pg_signal_backend
  -> ghm_db_user
```

Measured `ghm_db_user` attributes:

- LOGIN: true
- SUPERUSER: false
- INHERIT: true
- CREATEROLE: true
- CREATEDB: true
- REPLICATION: false
- BYPASSRLS: false

Measured ownership:

- database `ghm_db` owner: `ghm_db_user`
- schema `public` owner: `ghm_db_user`
- application tables and identity sequences: `ghm_db_user`

Measured effective privileges for `ghm_app_user` include database CREATE, schema CREATE, and SELECT/INSERT/UPDATE/DELETE/TRUNCATE on `account_identity` and the migration ledger. The table-grant inventory also shows broad SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER privileges on all inspected application tables.

No mutation is implied by recording these facts.

## Target identities

### `ghm_schema_owner`

- NOLOGIN role.
- Owns the GHM database objects that require ownership.
- Must not be used by application runtime.
- Must not be inherited by runtime roles.
- No routine application credentials.

### `ghm_migrator`

- Controlled login identity used only by the standalone migration process.
- May connect to the GHM database.
- Must have the minimum DDL/ledger authority required by the migration runner.
- Must not be an application runtime identity.
- Must not be granted to the runtime role.
- Migration authority must be explicit rather than obtained by inheriting the schema owner.

The exact DDL grant set remains provider/ownership dependent and must be qualified in the construction database before mutation is finalized.

### `ghm_runtime`

- Login identity used by the GHM HTTP/application runtime.
- Must not own the database, application schema, tables, sequences, or migration ledger.
- Must not have CREATEDB or CREATEROLE.
- Must not have schema CREATE.
- Must not have TRUNCATE, TRIGGER, or REFERENCES unless a measured runtime capability later proves one necessary.
- Must not write the migration ledger.
- Must not execute arbitrary DDL.

## Runtime grant derivation — first Business Identity slice

The implemented repository SQL establishes the following runtime object requirements.

### Database

Required:

- CONNECT
- TEMP only if the runtime/client behavior requires temporary objects; otherwise omit from the target grant.

Not required:

- database CREATE

### Schema

Required:

- USAGE on the application schema

Not required:

- CREATE on the application schema

### `account_identity`

Observed runtime SQL:

- SELECT by authenticated account id.
- UPDATE only `full_name`, `phone`, `avatar_ref`, and `updated_at`, with a fixed SQL statement.

Therefore the target table authority is:

- SELECT
- UPDATE

No account INSERT is currently required by the implemented first-slice repository.

### `business`

Observed runtime SQL:

- SELECT by id.
- SELECT by slug.
- INSERT with server-controlled `verification_status`, `is_active`, timestamps, and generated identity id.
- UPDATE only `name`, `slug`, and `updated_at` through a fixed SQL statement.

Therefore the target table authority is:

- SELECT
- INSERT
- UPDATE

The runtime must not be granted DELETE or TRUNCATE.

### `business_membership`

Observed runtime SQL:

- SELECT active memberships for the authenticated account.
- SELECT an active owner/administrator membership during managed Business update.
- SELECT for the Business-creation precondition.
- INSERT the owner membership during Business creation.

Therefore the target table authority is:

- SELECT
- INSERT

The runtime must not be granted UPDATE, DELETE, or TRUNCATE in the first slice.

### Identity sequences

The first migration uses PostgreSQL identity columns for all three primary keys. The exact sequence privilege required by the runtime role must be verified in the construction database before finalizing grants. The qualification should establish the minimum sequence capability needed for inserts without granting sequence ownership or arbitrary sequence mutation.

### Migration ledger

`ghm_schema_migrations` is migration authority, not runtime authority.

Target runtime access:

- no SELECT
- no INSERT
- no UPDATE
- no DELETE
- no TRUNCATE

The migration process alone may write the ledger.

## Permission matrix

| Capability | schema owner | migrator | runtime |
|---|---:|---:|---:|
| LOGIN | No | Yes | Yes |
| Database ownership | Yes | No | No |
| Schema ownership | Yes | No | No |
| Application object ownership | Yes | No | No |
| CREATEDB | No | No | No |
| CREATEROLE | No | No | No |
| Application schema USAGE | N/A | Yes | Yes |
| Application schema CREATE | ownership | only if required for controlled migration | No |
| Business Identity SELECT | ownership | controlled migration access | Yes |
| Business Identity INSERT | ownership | controlled migration access | Yes where required |
| Business Identity UPDATE | ownership | controlled migration access | Yes where required |
| Business Identity DELETE | ownership | only if migration requires it | No |
| TRUNCATE | ownership | only if migration requires it | No |
| TRIGGER | ownership | only if migration requires it | No |
| REFERENCES | ownership | only if migration requires it | No unless measured |
| Migration ledger write | ownership | Yes | No |
| Arbitrary DDL | ownership | Yes, migration scope | No |

The table uses conceptual authority. Exact PostgreSQL GRANT/REVOKE statements are intentionally deferred until ownership transfer and migration execution mechanics are verified.

## Membership and inheritance rules

The target design must avoid making the runtime a member of the schema-owner or migrator role. Runtime authority must not be recovered indirectly through role inheritance.

Where role membership is used for operational delegation, the membership must be explicit, minimal, and verified for both effective privileges and ability to `SET ROLE`.

`pg_read_all_stats` and `pg_signal_backend` are not application data authorities. They should not be inherited by the final runtime identity unless an explicit operational requirement is documented and approved.

## Ownership/default privilege rules

Ownership must be separated before broad legacy grants are removed. Otherwise revocation can leave the application unable to operate or can preserve authority through ownership.

Default privileges must be defined by the role that creates future GHM application objects. The migration process must not accidentally recreate broad runtime access through creator-owned default ACLs.

The final model must explicitly cover:

1. database ownership;
2. schema ownership;
3. table/index/sequence ownership;
4. migration-ledger ownership;
5. default privileges for future tables and sequences;
6. runtime table/sequence grants;
7. migration DDL grants;
8. role memberships and inheritance;
9. `SET ROLE` exposure;
10. provider-specific restrictions on role alteration.

## Qualification before mutation

Before changing the construction database, perform read-only verification of:

- exact migration runner connection identity;
- all current role memberships;
- `SET ROLE` possibilities relevant to the target roles;
- current table and sequence ownership;
- current schema/database ownership;
- default ACLs;
- exact sequence privilege required by identity inserts;
- whether migration DDL can be performed through a dedicated migrator without schema-owner inheritance;
- whether the runtime repository passes all first-slice positive/negative tests with the proposed grants.

Only after those checks should a reversible construction-only role migration be prepared.

## Safety boundary

This authority model applies only to the GHM construction PostgreSQL instance. Zaid Connect and QuoteFlow remain on Supabase. No production environment variable, DNS, credential, routing, or live traffic change is part of this design.
