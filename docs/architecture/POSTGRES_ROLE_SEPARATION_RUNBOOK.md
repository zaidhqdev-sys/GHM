# GHM PostgreSQL Role Separation Runbook

Status: construction design only. This runbook does not authorize execution of PostgreSQL role, ownership, membership, or grant mutations.

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

## Current construction authority

Measured current state:

- `ghm_app_user` LOGIN/INHERIT.
- `ghm_app_user` is a member of `ghm_db_user` and can `SET ROLE` to it.
- `ghm_db_user` LOGIN/INHERIT, CREATEDB and CREATEROLE.
- `ghm_db_user` owns the database, public schema, Business Identity tables, migration ledger, and identity sequences.
- `ghm_app_user` therefore has effective database/schema/object authority far beyond application runtime needs.

## Proposed mutation sequence

### Phase A — create authority roles

Create:

- `ghm_schema_owner` as NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOREPLICATION, NOBYPASSRLS.
- `ghm_migrator` as LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS, with INHERIT disabled unless a measured migration dependency requires it.
- `ghm_runtime` as LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS, NOINHERIT.

Credential material must never be committed to the repository or written into this document.

### Phase B — establish migration-only owner path

The preferred construction mechanism is:

1. Grant `ghm_schema_owner` to `ghm_migrator` with an explicit SET-capable membership path.
2. Do not make `ghm_migrator` inherit schema-owner privileges by default.
3. Use the migration process with an explicit `SET ROLE ghm_schema_owner` only for ownership/DDL operations that require owner authority.
4. Verify that `ghm_runtime` has no membership in either authority role and cannot SET either role.

This is intentionally a controlled migration authority path rather than an application-runtime inheritance path.

### Phase C — ownership transfer

Transfer ownership of the GHM construction database objects to `ghm_schema_owner` where provider rules permit:

- database `ghm_db`;
- application schema used by GHM;
- `account_identity`;
- `business`;
- `business_membership`;
- `ghm_schema_migrations`;
- `account_identity_id_seq`;
- `business_id_seq`;
- `business_membership_id_seq`.

The existing `public` schema requires special care because it may contain legacy objects. Do not transfer ownership of unrelated legacy objects merely because they share the schema. Prefer a dedicated GHM application schema for future work if architecture permits; otherwise explicitly account for legacy ownership and ACLs before changing `public` ownership.

Ownership transfer must be qualified against the provider's role/ownership restrictions before execution.

### Phase D — future-object defaults

Default privileges must be controlled by the role that actually creates future GHM objects.

The preferred rule is:

- schema owner controls object ownership;
- migrator receives only controlled DDL authority;
- runtime receives no default DDL authority;
- future table defaults grant only measured runtime DML;
- future sequence defaults grant only measured runtime sequence capability;
- migration ledger is excluded from runtime defaults.

Do not assume `ALTER DEFAULT PRIVILEGES` changes existing objects; existing grants and ownership must be handled separately.

### Phase E — establish runtime grants

After ownership is separated, grant `ghm_runtime` only the first-slice capabilities:

Database:

- CONNECT
- TEMP only if measured necessary

Schema:

- USAGE

`account_identity`:

- SELECT
- UPDATE

`business`:

- SELECT
- INSERT
- UPDATE

`business_membership`:

- SELECT
- INSERT

Identity sequences:

- begin with USAGE only;
- do not grant SELECT or UPDATE unless the positive repository insert probe proves they are required.

`ghm_schema_migrations`:

- no runtime access.

Explicitly deny by omission rather than adding broad grants for:

- CREATE on schema;
- database CREATE;
- CREATEDB;
- CREATEROLE;
- TRUNCATE;
- TRIGGER;
- REFERENCES;
- DELETE;
- arbitrary DDL;
- migration-ledger writes;
- sequence UPDATE/ownership.

### Phase F — migrate the application identity

The GHM application runtime must move from `ghm_app_user` to `ghm_runtime` only after positive and negative qualification succeeds.

The migration runner must move from `ghm_app_user` to `ghm_migrator` only after the dedicated migration path successfully performs a no-op migration check and, in a controlled test, the required DDL/ledger operation.

No production application environment variable is part of this construction exercise.

### Phase G — retire the old authority path

Only after both dedicated identities have been independently qualified:

1. Remove `ghm_app_user` membership in `ghm_db_user`.
2. Remove obsolete broad grants from the old application identity where safe.
3. Remove unnecessary membership in `pg_signal_backend` and `pg_read_all_stats` from the runtime identity.
4. Reduce `ghm_db_user` to a transitional administrative role only if required by the provider; otherwise retire it after ownership has moved and recovery access is proven.
5. Never remove the final administrative/recovery path without an independent tested path.

## Positive qualification

Under `ghm_runtime`:

- identity SELECT succeeds;
- account profile UPDATE succeeds for the allowlisted columns;
- Business SELECT succeeds;
- Business INSERT succeeds and receives an identity id;
- Business UPDATE succeeds for the allowlisted fields;
- membership SELECT succeeds;
- owner membership INSERT succeeds;
- normal service transactions commit and release cleanly.

Under `ghm_migrator` / explicit owner path:

- migration ledger can be read/written as required;
- migration no-op succeeds;
- a disposable migration DDL probe succeeds;
- ownership operations required by the migration lifecycle succeed.

## Negative qualification

Under `ghm_runtime`:

- `CREATE SCHEMA` fails;
- `CREATE TABLE` fails;
- `CREATE DATABASE` fails;
- `TRUNCATE` fails;
- `DELETE` fails on first-slice tables;
- migration-ledger INSERT/UPDATE/DELETE fails;
- direct sequence UPDATE fails;
- `SET ROLE ghm_schema_owner` fails;
- `SET ROLE ghm_migrator` fails;
- no inherited membership exposes owner/migrator authority.

Under `ghm_migrator`:

- application business operations are not used as proof of runtime authority;
- migrator does not become the runtime identity.

## Rollback principle

Rollback must be role/ownership/grant specific and reversible:

1. Preserve the original measured evidence.
2. Do not drop old roles until the new identities are independently proven.
3. If runtime qualification fails, restore the construction application identity path before proceeding with any further tightening.
4. If migration qualification fails, retain the existing migration runner identity until a replacement migration path is proven.
5. Never roll back by changing production product configuration; production is outside this runbook.

## Founder gate

No role mutation is authorized merely because this runbook exists.

Execution requires an explicit founder approval after:

- provider feasibility is confirmed;
- the exact SQL mutation set is reviewed;
- a recovery path is confirmed;
- the runtime positive/negative test plan is accepted.

Until that gate, all GHM PostgreSQL work remains read-only.
