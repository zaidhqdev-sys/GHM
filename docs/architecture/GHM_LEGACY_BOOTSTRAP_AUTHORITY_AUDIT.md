# GHM Legacy Bootstrap Authority Audit

## Status
**CONSTRUCTION — READ-ONLY AUDIT HARNESS**

This boundary determines whether legacy PostgreSQL roles `ghm_app_user` and `ghm_db_user` still have live authority or dependencies. It performs catalog reads only.

## Evidence
The harness inspects role attributes, memberships, object ownership, schema privileges, table privileges, routine privileges, and database privileges for legacy and canonical GHM roles.

## Safety
No GRANT, REVOKE, ALTER ROLE, DROP ROLE, DROP OWNED, REASSIGN OWNED, DDL, or DML operation is performed.

## Gate
Role retirement requires reconciliation of live ownership, grants, memberships, runtime dependencies, migration dependencies, and operational recovery paths. Legacy roles remain unchanged until that evidence is complete.