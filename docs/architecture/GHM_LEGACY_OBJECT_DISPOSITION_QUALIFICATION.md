# GHM Legacy Object Ownership & Data Preservation Qualification

## Status
CONSTRUCTION — READ-ONLY QUALIFICATION

## Purpose
Establish the evidence boundary required before changing ownership, retiring legacy objects, or retiring legacy database roles.

## Safety
This audit performs catalog reads and exact row-count reads only. It MUST NOT execute GRANT, REVOKE, ALTER ROLE, DROP ROLE, DROP OWNED, REASSIGN OWNED, ALTER TABLE OWNER, DDL, INSERT, UPDATE, DELETE, TRUNCATE, or data migration.

It requires the one-off `GHM_LEGACY_AUDIT_DATABASE_URL`. It must never fall back to `DATABASE_URL` or `GHM_MIGRATOR_DATABASE_URL`.

## Required evidence
- Exact live columns, RLS state, and row counts for the five legacy public tables.
- Every object still owned by `ghm_app_user` or `ghm_db_user`.
- Dependency edges touching legacy objects.
- Functions/views/triggers/constraints referencing legacy objects or legacy roles.
- Explicit disposition for each legacy dataset.
- Preservation of the two legacy `public.users` rows pending authoritative QuoteFlow/source provenance reconciliation.

## Current known disposition boundary
- `public.users`: preserve and reconcile to canonical identity/migration provenance; do not delete or migrate blindly.
- `public.profiles`: empty; preserve/archive decision before retirement.
- `public.todos`: empty; retirement only after preservation check.
- `public.files`: empty; preservation/archive boundary must be explicit.
- `public.password_reset_tokens`: empty; retire after preservation check; canonical recovery is already separate.

## Qualification meaning
A PASS means the evidence is sufficient to **design** an ownership/disposition mutation. It does not authorize mutation.

The next mutation slice, if separately approved, must transfer/reconcile ownership and sever legacy authority in a controlled order, followed by a fresh role/object authority audit.

## Documentation reconciliation
This document is subordinate to the canonical database authority model, role-separation runbook, migration ownership model, and QuoteFlow migration provenance boundary. Historical legacy references remain valid evidence and must not be removed merely to satisfy static scanners.

## TLS qualification
The audit client uses the repository's `DATABASE_SSL` setting for the read-only legacy audit connection. TLS is never disabled by default; the audit does not weaken database transport security.
