# GHM Database Authority Model

## Purpose

Define the intended PostgreSQL authority separation before any privilege or role changes are made to the construction database.

This document is an architecture contract. It does not authorize immediate role mutation.

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
- not used by normal migration execution;
- no application credential stored in product runtime configuration;
- owns canonical application schemas/objects where PostgreSQL ownership is required;
- authority is structural, not an application authorization mechanism.

Preferred PostgreSQL posture: `NOLOGIN` owner role.

### 2. Migration authority

Purpose: execute repository-owned migrations.

Requirements:

- can create/alter/drop objects required by the migration system;
- can maintain the migration ledger;
- can acquire the migration advisory lock;
- can operate only against the intended GHM database;
- is never exposed to product request handlers;
- credentials are deployment/operator controlled, not product-request controlled.

Preferred PostgreSQL posture: dedicated login role with explicit DDL authority, separate from runtime credentials.

The existing migration runner remains standalone and is not startup-wired. Its authority must therefore be provisioned explicitly when migration execution is introduced.

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

Preferred PostgreSQL posture: dedicated login role with least-privilege grants.

### 4. Observation / diagnostics authority

Purpose: health, diagnostics, metrics, and controlled operational inspection.

Requirements:

- read-only against application data where possible;
- no schema mutation;
- no application writes;
- no role/database administration;
- should be separated from runtime if operational tooling requires privileges beyond the runtime role.

This class is optional until an actual diagnostic requirement exists; it must not be invented merely for symmetry.

## Application admin versus database admin

A GHM `admin` application role is **not** equivalent to PostgreSQL administrative authority.

Application-level administration means an authenticated principal may perform explicitly governed GHM operations. It must not imply `CREATEROLE`, `CREATEDB`, unrestricted DDL, or ownership of the database.

```text
GHM admin principal
       |
       v
application authorization policy
       |
       v
explicit repository operation
       |
       v
runtime DB authority
```

Elevated database operations belong to the migration/operations boundary, not ordinary application requests.

## Current-state reconciliation

The live construction database currently authenticates `ghm_app_user` and resolves to effective role `ghm_db_user`. The effective role currently has broad database/schema/table authority.

This is a measured construction-state finding only. It is not the target model.

No existing role should be revoked, deleted, or reconfigured until the required runtime privileges are measured against actual GHM repository SQL and the migration requirements are mapped separately.

## Reconciliation sequence

1. Inventory every SQL statement currently reachable from GHM runtime code.
2. Inventory migration SQL and classify each statement as schema-owner, migration, or runtime authority.
3. Establish the canonical application schema boundary.
4. Create dedicated role identities without removing the current construction path.
5. Grant measured runtime privileges to the dedicated runtime role.
6. Verify positive runtime operations.
7. Verify negative operations: DDL, role creation, database creation, truncation, trigger/reference authority where not required, and access outside the application boundary.
8. Run migration qualification separately with migration authority.
9. Only after successful verification, remove unnecessary authority from the legacy construction role/path.
10. Keep rollback available throughout construction.

## Qualification gate

The role boundary is not qualified merely because roles exist.

Qualification requires evidence that:

- runtime can perform every required repository operation;
- runtime cannot perform forbidden administrative operations;
- migrations can perform required schema changes;
- migrations are not callable from ordinary request handling;
- application admin privileges do not become database admin privileges;
- role configuration does not silently broaden runtime authority;
- production products remain untouched during construction.

## Production safety

Zaid Connect and QuoteFlow remain on Supabase until GHM is fully qualified and a reversible migration plan exists.

No production credentials, routing, DNS, environment variables, or product traffic are changed by this architecture decision.

## Next evidence required

The next implementation gate is a read-only privilege/SQL inventory:

- enumerate runtime SQL call sites;
- classify required table/sequence/schema privileges;
- inspect migration SQL requirements;
- identify privileges currently inherited through `ghm_db_user` that are not required by either path;
- design the exact grant/revoke plan before applying it.
