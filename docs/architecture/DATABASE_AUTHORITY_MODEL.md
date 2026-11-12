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

Qualified construction posture: dedicated `ghm_runtime` login with `NOINHERIT` and the measured first-slice application ACL boundary.

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

- `ghm_schema_owner` owns the first-slice GHM objects in the dedicated `ghm` application schema;
- `ghm_migrator` is the dedicated migration login and successfully SETs `ghm_schema_owner` explicitly;
- `ghm_runtime` is separately qualified with only the measured first-slice application ACL;
- the old `ghm_db_user` bootstrap memberships remain unresolved because they were granted by bootstrap `postgres`.

The old `ghm_app_user -> ghm_db_user` path must not be removed until replacement migration/runtime paths and recovery access are independently qualified.

## Qualified first-slice runtime boundary

The measured construction runtime boundary is:

```text
ghm.account_identity      SELECT/UPDATE
ghm.business              SELECT/INSERT/UPDATE
ghm.business_membership   SELECT/INSERT
identity sequences        USAGE only
public schema             USAGE, no CREATE
migration ledger          no SELECT/INSERT/UPDATE/DELETE
```

Negative qualification rejected runtime CREATE/DDL, destructive operations, migration-ledger writes, direct sequence mutation, and SET ROLE into owner/migrator with PostgreSQL `42501`.

## Reconciliation status

The role separation and dedicated migration runner have been executed and qualified for the current construction slice.

The dedicated migration runner uses `GHM_MIGRATOR_DATABASE_URL`, connects as `ghm_migrator`, explicitly SETs `ghm_schema_owner`, reconciles the migration ledger, commits its transaction, and passes repeat/no-op qualification. Detailed evidence is recorded in `docs/MIGRATOR_QUALIFICATION_2026-09-10.md`.

The dedicated `ghm` application schema is established. Future-object defaults are scoped to the GHM schema and do not grant blanket application DML. The first-slice runtime boundary has been independently qualified, including negative authority probes and the Review runtime qualification using `ghm_runtime`.

This does not constitute production qualification.

## Remaining authority work

1. Resolve bootstrap `ghm_db_user` memberships through the independent `postgres`/provider authority path.
2. Continue qualification and reconciliation of each future governed resource slice against its concrete schema, repository, transaction, authorization, runtime, and ACL requirements.
3. Only after all replacement gates are satisfied consider final removal of the old `ghm_app_user -> ghm_db_user` authority path.

## Production safety

Zaid Connect and QuoteFlow remain on Supabase until GHM is fully qualified and a reversible migration plan exists.

No production credentials, routing, DNS, environment variables, or product traffic are changed by this construction authority work.


## 2026-11-12 security-boundary reconciliation — persistence is not actor authorization

The original persistence qualification remains valid for its narrow claim: direct runtime table DML is denied and the SECURITY DEFINER functions preserve the storage lifecycle. It did **not** qualify database-authenticated end-user identity or protect against a holder of the shared `ghm_runtime` credential supplying another account/business/object ID directly to those functions. The earlier design deliberately left tenant authorization in the application service; that assumption is superseded for sensitive database operations by the approved isolated issuer / signed Actor Gateway trust-boundary direction in ADR-001 and the 10 November release-readiness handover.

The 12 November whole-database SECURITY DEFINER audit identified five non-public storage functions still directly executable by `ghm_runtime`: `storage_create_pending`, `storage_get_object`, `storage_mark_available`, `storage_mark_deletion_pending`, and `storage_mark_deleted`. Application authorization/provider checks remain defense in depth, but do not establish a database actor boundary for direct SQL invocation. This is an OPEN finding, not an approved exception.

Target remediation: add signed Actor Gateway wrappers for storage metadata create/read/availability/deletion operations. Each wrapper must verify the v2 one-use HMAC assertion and compare its signed context to the actual actor, tenant, object ID and operation arguments; enforce active actor and current owner/administrator membership where mutation is required; and preserve provider-side verification before marking an object available/deleted. Then add a manual-only cutover that revokes runtime EXECUTE on the five legacy functions. Keep `storage_get_public_business_logo` as the narrowly scoped public approved-logo lookup unless separate evidence requires changing it. Do not revoke the current grants until the replacement gateway path and disposable PostgreSQL qualification pass.

Required adversarial evidence: runtime direct invocation denied after cutover; cross-tenant object read denied; non-member pending-object creation denied; member-but-not-manager lifecycle mutations denied; forged/expired/replayed/wrong-operation/context-substituted assertions denied; provider metadata mismatch never reaches available state; authorized upload/completion/read/deletion workflows still pass; public approved-logo lookup remains functional. No production cutover is authorized. The production Render role-administration blocker, fresh-backup gate and no-paid-infrastructure hosting constraint remain independent release blockers.
