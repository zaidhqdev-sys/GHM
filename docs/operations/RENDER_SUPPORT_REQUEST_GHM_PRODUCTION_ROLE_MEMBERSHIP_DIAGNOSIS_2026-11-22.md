# Render Support Request — GHM Production PostgreSQL Role Membership Diagnosis

**Status:** Prepared for owner submission; not sent by this repository change  
**Environment:** ZAID Technologies Render workspace; Frankfurt production PostgreSQL  
**Database service:** `ghm-db`  
**Database:** `ghm_db`, PostgreSQL 18.6  
**Related application:** `ghm-actor-gateway`  
**Purpose:** Obtain provider-supported, non-destructive diagnosis and remediation guidance. This request does not authorize a production change.

## Request

Hello Render Support,

We need assistance reviewing PostgreSQL role memberships on our existing Frankfurt production database. Please first confirm the supported provider/bootstrap procedure and whether any of the observed memberships are managed or re-created by Render. **Please do not change roles, memberships, grants, ownership, database settings, or restart services without a separately agreed change window and explicit written authorization.**

A read-only catalogue inspection on 22 November 2026, executed through the Render Postgres query facility as `session_user=ghm_app_user` / `current_user=ghm_db_user`, reported the following membership edges with `ghm_db_user` as the member and `ADMIN OPTION=true`:

- `ghm_actor_gateway`
- `ghm_migrator`
- `ghm_schema_owner`
- `ghm_runtime`
- `ghm_auditor`
- `ghm_payment_provider`

The same inspection showed the intended `ghm_migrator` → `ghm_schema_owner` membership as `SET=true`, `INHERIT=false`, `ADMIN OPTION=false`.

The application role `ghm_actor_gateway` exists with LOGIN enabled and restrictive flags (INHERIT, SUPERUSER, CREATEDB, CREATEROLE and BYPASSRLS disabled). PostgreSQL privilege checks for that role reported database CONNECT=true, database CREATE=false, schema `ghm` USAGE=false and CREATE=false. These are named-role effective privilege checks; the query session itself was **not** `ghm_actor_gateway`.

The Actor Gateway service's latest inspected deployment built but failed startup at its database privilege assertion. The application log category was `database_privileges_rejected`. The service is configured on branch `main` with auto-deploy disabled. No assumption is being made that the service is connected to the database inspected above; its actual runtime target and session identity still need to be confirmed without disclosing connection strings.

## Questions for Render

1. Are the listed `ghm_db_user` membership edges provider/bootstrap-managed, and which supported mechanism should be used to correct them without fighting Render's control plane?
2. Can Render confirm the supported least-privilege model for an application/query login, a dedicated Actor Gateway login, a dedicated migrator login, and a non-login schema-owner role?
3. Can Render provide or perform a provider-authorized, read-only confirmation of the effective role memberships, role attributes, database/schema ownership, and grants for these roles? Please include the member, granted role, `ADMIN OPTION`, `INHERIT OPTION`, and `SET OPTION` values where supported.
4. What supported method should be used to ensure that the application/query login cannot administer or assume the Actor Gateway, migrator, schema-owner, runtime, auditor, or payment-provider roles?
5. Does Render provide a supported way to verify the Actor Gateway's actual database target and runtime session identity without revealing or exporting its connection string or secret environment values?
6. What fresh backup/PITR evidence and restore-validation procedure does Render recommend before any role-membership or ACL correction? Please distinguish logical export/restore from point-in-time recovery guarantees.
7. Can you confirm whether any role-membership changes would be reverted by service redeploy, database maintenance, restore, or provider reconciliation?

## Required evidence and change controls

Before any production change, we require:

- Provider-confirmed supported remediation procedure and expected before/after catalogue state.
- Fresh production backup with timestamp, retention/PITR status, and provider confirmation.
- A documented restore/recovery validation path and recovery limitations.
- An owner-approved change plan, rollback plan, and maintenance window.
- Post-change read-only evidence proving the application/query login no longer has administrative membership in the protected roles, while the exact intended migrator-to-schema-owner `SET` membership remains non-inheriting and non-admin.
- A separate authorized read-only production migration-ledger/checksum audit. The previous attempt to read `ghm.ghm_schema_migrations` through the query connection was denied with SQLSTATE 42501; no bypass was attempted.

## Explicit exclusions

- Do not execute migrations or DDL.
- Do not grant `USAGE` on schema `ghm` or grant function execution as a diagnostic shortcut.
- Do not change passwords, rotate credentials, expose connection strings, or disclose secret environment-variable values in a ticket.
- Do not deploy, restart, or change the Actor Gateway service branch.
- Do not enable payment preparation or alter payment-provider state.
- Do not alter the production migration batch manifest. It must remain exactly `[]` until separately reviewed and authorized.

Thank you. Please respond with the supported diagnostic and remediation procedure, the provider-owned responsibilities, and any backup/recovery prerequisites before proposing a change.
