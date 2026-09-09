# GHM Business Identity Runtime Grants

Status: construction design; no database role mutation performed.

The canonical Business Identity migration uses identity-backed bigint columns. Runtime privileges therefore include sequence usage for inserts. The migration authority, not the runtime role, creates tables, constraints, indexes, and sequences.

## Required runtime privileges

```sql
GRANT CONNECT ON DATABASE ghm_db TO <runtime_role>;
GRANT USAGE ON SCHEMA public TO <runtime_role>;

GRANT SELECT ON TABLE account_identity, business, business_membership TO <runtime_role>;
GRANT INSERT (full_name, phone, avatar_ref, role)
  ON TABLE account_identity TO <runtime_role>;
GRANT UPDATE (full_name, phone, avatar_ref, updated_at)
  ON TABLE account_identity TO <runtime_role>;

GRANT INSERT (name, slug, verification_status, is_active, created_at, updated_at)
  ON TABLE business TO <runtime_role>;
GRANT UPDATE (
  name, slug, description, category, province, city, physical_address,
  latitude, longitude, phone, whatsapp, email, website,
  avatar_letter, avatar_color, years_in_business, updated_at
)
  ON TABLE business TO <runtime_role>;

GRANT INSERT (
  business_id, account_id, membership_role, membership_status,
  created_by, created_at, updated_at
) ON TABLE business_membership TO <runtime_role>;

GRANT USAGE, SELECT ON SEQUENCE account_identity_id_seq TO <runtime_role>;
GRANT USAGE, SELECT ON SEQUENCE business_id_seq TO <runtime_role>;
GRANT USAGE, SELECT ON SEQUENCE business_membership_id_seq TO <runtime_role>;
```

The `business` UPDATE list above intentionally includes the managed-profile fields only after those columns are actually present in the canonical schema. The first migration currently contains only the identity/lifecycle columns, so the implementation must not request or grant privileges for absent columns.

## Correction for first migration

For the exact first migration as committed, the runtime grants are therefore limited to:

- SELECT on all three tables;
- INSERT/UPDATE on `account_identity` according to the profile contract;
- INSERT on `business` for creation;
- INSERT on `business_membership` for owner membership;
- no Business profile UPDATE privilege until the profile fields are introduced by a later, separately reconciled migration;
- sequence USAGE/SELECT for all three identity sequences if runtime inserts use generated IDs.

The service must enforce managed Business update authorization and field allowlists independently of PostgreSQL grants.

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
- arbitrary sequence `UPDATE`/`DELETE`;
- arbitrary function execution;
- migration-ledger write authority.

No role changes are authorized by this document. Actual grants are a later database-identity qualification step after repository SQL is implemented and tested.
