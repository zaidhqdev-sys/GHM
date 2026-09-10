# GHM Database Authority Model

## Purpose

Define the intended PostgreSQL authority separation before and during construction qualification.

This document is an architecture contract. It does not authorize production changes.

## Core decision

GHM must not use one broad PostgreSQL identity for schema ownership, migrations, application runtime, and operational observation.

The target model separates authority into distinct responsibilities:

```text
                     GHM PostgreSQL
                           |
             +-------------+-------------+
             |             |             |
             v             v             v
        Schema owner    Migrator      Runtime
        / ownership     authority     authority
             |             |             |
          DDL/owner      migrations     product CRUD
          no runtime     controlled     least privilege
          login use      deployment

                           +
                           |
                           v
                    Observation
                    / diagnostics
                    read-only where
                    practical
```

## Authority classes

### 1. Schema owner

Purpose: own GHM schemas and database objects.

Requirements:

- not used by application runtime;
- no application credential stored in product runtime configuration;
- owns canonical application schemas/objects where PostgreSQL ownership is required;
- authority is structural, not an application authorization mechanism.

Qualified construction posture: `ghm_schema_owner` is `NOLOGIN` and owns the first-slice GHM database objects.

### 2. Migration authority

Purpose: execute repository-owned migrations.

Requirements:

- can create/alter/drop objects required by the migration system;
- can maintain the migration ledger;
- can acquire the migration advisory lock;
- can operate only against the intended GHM database;
- is never exposed to product request handlers;
- credentials are deployment/operator controlled, not product-request controlled.

Qualified construction posture: dedicated `ghm_migrator` login with `NOINHERIT` and an explicit SET-capable membership into `ghm_schema_owner`.

### 3. Runtime application authority

Purpose: serve authenticated GHM product requests.

Requirements:

- no `CREATEDB`;
- no `CREATEROLE`;
- no schema ownership;
- no arbitrary DDL;
- no database-level administrative authority;
- only explicit application schemas/tables and required sequences/functions;
- only the operations actually required by GHM repositories;
- no blanket `TRUNCATE`, `REFERENCES`, or `TRIGGER` privileges unless a measured runtime requirement proves them necessary;
- runtime authorization remains in GHM application policy and transaction boundaries, not in a broad database role.

Qualified construction posture: dedicated `ghm_runtime` login with `NOINHERIT` and the measured first-slice ACL boundary.

### 4. Observation / diagnostics authority

Purpose: health, diagnostics, metrics, and controlled operational inspection.

Requirements:

- read-only against application data where possible;
- no schema mutation;
- no application writes;
- no role/database administration;
- should be separated from runtime if operational tooling requires privileges beyond the runtime role.

This class remains optional until an actual diagnostic requirement exists; it must not be invented merely for symmetry.

## Application admin versus database admin

A GHM `admin` application role is **not** equivalent to PostgreSQL administrative authority.

An application-level administrator may perform explicitly governed GHM operations. It must not imply `CREATEROLE`, `CREATEDB`, unrestricted DDL, or ownership of the database.

## Current-state reconciliation

The original construction path authenticated `ghm_app_user` and resolved to effective role `ghm_db_user`, which had broad database/schema/table authority. That state has now been separated for the first Business Identity slice.

Construction evidence confirms:

- `ghm_schema_owner` owns the `ghm_db` database and first-slice GHM objects;
- `ghm_migrator` is the dedicated migration login and successfully SETs `ghm_schema_owner` explicitly;
- `ghm_runtime` is separately qualified with only the measured first-slice application ACL;
- the old `ghm_db_user` bootstrap memberships remain unresolved because they were granted by bootstrap `postgres`.

The old `ghm_app_user -> ghm_db_user` path must not be removed until replacement migration/runtime paths and recovery access are independently qualified.

## Qualified first-slice runtime boundary

The measured construction runtime boundary is:

```text
account_identity      SELECT/UPDATE
business              SELECT/INSERT/UPDATE
business_membership   SELECT/INSERT
identity sequences    USAGE only
public schema         USAGE, no CREATE
migration ledger      no SELECT/INSERT/UPDATE/DELETE
```

Negative qualification rejected runtime CREATE/DDL, destructive operations, migration-ledger writes, direct sequence mutation, and SET ROLE into owner/migrator with PostgreSQL `42501`.

## Reconciliation status

The role separation and dedicated migration runner have been executed and qualified for the current construction slice.

The dedicated migration runner uses `GHM_MIGRATOR_DATABASE_URL`, connects as `ghm_migrator`, explicitly SETs `ghm_schema_owner`, reconciles the migration ledger, commits its transaction, and passes repeat/no-op qualification. Detailed evidence is recorded in `docs/MIGRATOR_QUALIFICATION_2026-09-10.md`.

This does not constitute production qualification.

## Remaining authority work

1. Resolve bootstrap `ghm_db_user` memberships through the independent `postgres`/provider authority path.
2. Reconcile a dedicated GHM application schema and future-object default privileges.
3. Measure whether runtime TEMP is required; if not, remove it from the final runtime authority where possible.
4. Complete Transaction Qualification together with authentication, authorization, explicit resource repositories, runtime boundary, and reconciled schema.
5. Only after all replacement gates are satisfied consider final removal of the old `ghm_app_user -> ghm_db_user` authority path.

## Production safety

Zaid Connect and QuoteFlow remain on Supabase until GHM is fully qualified and a reversible migration plan exists.

No production credentials, routing, DNS, environment variables, or product traffic are changed by this construction authority work.
