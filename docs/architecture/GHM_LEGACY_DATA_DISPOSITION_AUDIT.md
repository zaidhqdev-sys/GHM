# GHM Legacy Data Preservation and Disposition Audit

## Status

**CONSTRUCTION — READ-ONLY AUDIT**

This slice follows the legacy object-authority audit. It establishes the exact live contents and relationship integrity of the five legacy public tables without changing PostgreSQL roles, privileges, RLS, ownership, schema, or data.

## Separate audit connection

Exact data inspection requires:

`GHM_LEGACY_AUDIT_DATABASE_URL`

This is deliberately separate from `GHM_RUNTIME_DATABASE_URL`, `GHM_MIGRATOR_DATABASE_URL`, and the legacy application credentials. The audit connection is a one-off read-only boundary and must be independently authorized for the legacy data. The harness never grants membership or changes database privileges.

If the variable is absent, the command exits successfully with `BLOCKED_AUDIT_CONNECTION_REQUIRED` and performs no fallback to runtime/migrator credentials.

## Scope

The audit records:

- exact row counts for `public.users`, `profiles`, `todos`, `files`, and `password_reset_tokens`;
- column shape and nullability;
- user-account data presence without emitting raw email addresses or password hashes;
- profile/todo/file/reset-token relationship integrity and orphan counts;
- file storage-key cardinality;
- reset-token lifecycle counts;
- optional deterministic matching of a known legacy account using `GHM_LEGACY_AUDIT_EMAIL_SHA256`;
- a preliminary disposition matrix for each dataset.

The optional email hash input is SHA-256 of the normalized legacy email (lowercase, trimmed). The audit output never prints the email itself.

## Safety

The harness performs SELECT-only inspection. It does **not**:

- INSERT, UPDATE, DELETE, TRUNCATE or migrate data;
- ALTER/DROP/CREATE database objects;
- GRANT or REVOKE privileges;
- SET ROLE;
- alter RLS policies;
- change ownership;
- issue application recovery operations.

## Disposition rules

- `users`: reconcile to canonical GHM account/identity and QuoteFlow migration provenance before retirement.
- `profiles`: reconcile to canonical GHM profile/business resources before retirement.
- `files`: preserve or migrate metadata/storage before any deletion.
- `password_reset_tokens`: preserve only if operationally required; otherwise retire as legacy authentication state after recovery-path reconciliation.
- `todos`: establish whether any business value exists; otherwise retire only after preservation/recovery requirements are closed.

No dataset receives an unconditional DELETE disposition from this audit.

## Gate

The output is evidence, not authorization to mutate. The next decision requires:

1. exact row counts;
2. relationship/orphan reconciliation;
3. known QuoteFlow account reconciliation;
4. canonical GHM successor mapping;
5. storage preservation decision for files;
6. recovery/security decision for reset tokens;
7. explicit disposition for each legacy dataset.

Only after those are reconciled should role/object retirement be considered.
