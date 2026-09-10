# GHM Business Identity Runtime Grants

Status: **construction grant contract reconciled to the measured first-slice runtime boundary; further privilege changes remain gated.**

The canonical Business Identity migration uses identity-backed bigint columns. The migration authority, not the runtime role, creates tables, constraints, indexes, and sequences.

## Measured first-slice runtime boundary

The qualified construction runtime role is `ghm_runtime`. Its first-slice boundary is:

- database CONNECT;
- application-schema USAGE;
- SELECT on `account_identity`, `business`, and `business_membership`;
- INSERT/UPDATE authority on `account_identity` only as required by the implemented profile operations;
- INSERT authority on `business` and `business_membership` for the creation flow;
- identity-sequence usage sufficient for qualified inserts;
- no migration-ledger authority;
- no schema DDL authority.

The exact column ACL remains evidence-derived from the live catalog and the repository SQL actually implemented. This document does not authorize speculative grants.

## First-slice privilege contract

Conceptually, the first repository implementation may require:

```sql
GRANT CONNECT ON DATABASE ghm_db TO ghm_runtime;
GRANT USAGE ON SCHEMA public TO ghm_runtime;

GRANT SELECT ON TABLE account_identity, business, business_membership
  TO ghm_runtime;

GRANT INSERT (full_name, phone, avatar_ref, role)
  ON TABLE account_identity TO ghm_runtime;

GRANT UPDATE (full_name, phone, avatar_ref, updated_at)
  ON TABLE account_identity TO ghm_runtime;

GRANT INSERT (name, slug, verification_status, is_active, created_at, updated_at)
  ON TABLE business TO ghm_runtime;

GRANT INSERT (
  business_id, account_id, membership_role, membership_status,
  created_by, created_at, updated_at
) ON TABLE business_membership TO ghm_runtime;
```

These statements are a derivation target, not an instruction to mutate the database now. They must be checked against the actual repository SQL, defaults, identity strategy, and live ACL before any privilege mutation.

## Business update boundary

The canonical first-slice `business` table contains only identity/lifecycle fields. Therefore no Business profile UPDATE grant is authorized merely because later Connect profile fields exist.

If the first-slice managed Business update repository operation is implemented, its allowed fields are:

```text
name
slug
updated_at
```

The service must independently enforce `business.manage` authorization and must reject governed fields such as `verification_status` and `is_active`.

## Sequence boundary

Identity-backed inserts require sequence access as measured by the actual PostgreSQL catalog. The qualified runtime role has only the sequence capability necessary for ordinary generated-id use; sequence mutation such as `setval` is not part of runtime authority.

Do not broaden sequence privileges to arbitrary update/delete authority.

## Explicitly absent

Do not grant the runtime role:

- table ownership;
- schema ownership;
- `CREATE` on the application schema;
- `CREATEDB`;
- `CREATEROLE`;
- `TRUNCATE`;
- `REFERENCES` unless a measured query later requires it;
- `TRIGGER`;
- arbitrary sequence mutation;
- arbitrary function execution;
- migration-ledger write authority;
- migration/schema-owner authority.

## Qualification state

Database role separation and the first-slice runtime boundary have already been qualified in construction. The remaining work is not to re-authorize the role model, but to reconcile the exact ACL against the repository SQL as that implementation is introduced.

Any new privilege must therefore follow this order:

1. explicit repository operation exists;
2. SQL is parameterized and reviewed;
3. transaction/auth/authz behavior is qualified;
4. required privilege is derived from actual SQL;
5. live ACL is measured;
6. handover and governing docs are reconciled.

No production role mutation, production migration, product cutover, or Supabase change is authorized by this document.
