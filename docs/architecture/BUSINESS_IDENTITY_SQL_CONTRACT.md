# GHM Business Identity SQL Contract

Status: **construction contract reconciled to the applied first-slice schema; repository implementation and qualification remain open.**

## Scope

This contract maps the reconciled Business Identity operations to parameterized SQL shapes. It deliberately separates authorization from SQL and avoids `SELECT *`.

## First-slice SQL boundary

The applied first migration contains only these columns:

- `account_identity`: `id`, `full_name`, `phone`, `avatar_ref`, `role`, `created_at`, `updated_at`
- `business`: `id`, `name`, `slug`, `verification_status`, `is_active`, `created_at`, `updated_at`
- `business_membership`: `id`, `business_id`, `account_id`, `membership_role`, `membership_status`, `created_by`, `created_at`, `updated_at`

SQL for fields outside this list is not authorized by this first-slice contract.

## SQL shapes

### `identity.resolve`

1. Read the authenticated account from `account_identity` by `id = $1`.
2. Read active memberships from `business_membership` by `account_id = $1` and `membership_status = 'active'`.
3. If a selected Business id `$2` is supplied, resolve only an active membership for `(account_id=$1,business_id=$2)` and then read that Business by id.
4. A stale, inactive, or revoked selection fails closed.

### `profile.readSelf`

```sql
SELECT id, full_name, phone, avatar_ref, role, created_at, updated_at
FROM account_identity
WHERE id = $1;
```

### `profile.updateSelf`

Dynamic SQL is prohibited. Build the SET clause only from the fixed whitelist: `full_name`, `phone`, `avatar_ref`, plus `updated_at`. The WHERE predicate is always `id = $1`.

The application must not expose arbitrary-column updates.

### `businessContext.listMemberships`

```sql
SELECT id, business_id, account_id, membership_role, membership_status,
       created_by, created_at, updated_at
FROM business_membership
WHERE account_id = $1
  AND membership_status = 'active'
ORDER BY created_at, id;
```

### `business.readPublic`

The first-slice public projection is restricted to columns actually present in the canonical schema:

```sql
SELECT id, name, slug, verification_status, is_active,
       created_at, updated_at
FROM business
WHERE id = $1
  AND is_active = true;
```

Later public profile fields require their own schema and capability reconciliation.

### `business.readManaged`

Read a Business only after the service verifies an active membership for the caller. The first-slice projection is the explicit Business projection above; private registration identity and richer managed profile data are later capabilities.

### `business.create`

Business creation is one transaction:

```sql
INSERT INTO business (name, slug, verification_status, is_active, created_at, updated_at)
VALUES ($1, $2, 'pending', true, now(), now())
RETURNING id, name, slug, verification_status, is_active, created_at, updated_at;
```

Then:

```sql
INSERT INTO business_membership
  (business_id, account_id, membership_role, membership_status, created_by, created_at, updated_at)
VALUES ($business_id, $account_id, 'owner', 'active', $account_id, now(), now());
```

The service must commit both or neither. No orphan Business may be committed.

### `business.updateProfile`

For the first schema slice, the only Business columns eligible for managed update are:

```text
name
slug
updated_at
```

The service must first verify an active membership with a role that has `business.manage` permission. A fixed parameterized UPDATE must bind both the Business identity and the authorization context.

Candidate WHERE:

```sql
WHERE id = $business_id
  AND EXISTS (
    SELECT 1
    FROM business_membership
    WHERE business_id = $business_id
      AND account_id = $account_id
      AND membership_status = 'active'
      AND membership_role IN ('owner', 'administrator')
  )
```

No PostgreSQL `SECURITY DEFINER` function is required for this service contract.

## Privilege derivation

For the first-slice SQL above, runtime authority requires only the privileges actually exercised by the repository implementation:

- CONNECT on the database;
- USAGE on the application schema;
- SELECT on the three first-slice tables;
- UPDATE on `account_identity`'s explicitly writable profile columns;
- INSERT on `business` and `business_membership`;
- UPDATE on `business` only when the first-slice managed-update repository operation is implemented and qualified;
- sequence privileges required by identity-backed inserts.

The runtime role does **not** require CREATEDB, CREATEROLE, ownership, arbitrary DDL, blanket TRUNCATE, or migration-ledger authority.

The exact grant set must remain evidence-derived from implemented repository SQL and measured against the live catalog. The current ACL qualification establishes a construction baseline; it does not authorize adding privileges merely because this document names a possible future operation.

## Qualification requirement

The schema is now applied and qualified for construction. The remaining gate is repository implementation and qualification:

1. implement explicit repository/service interfaces;
2. implement parameterized SQL matching these shapes;
3. verify transaction binding;
4. derive exact runtime privileges from the actual SQL;
5. execute positive and negative authorization/privilege tests;
6. reconcile resulting evidence back into the handover and governing architecture docs.

No production migration, product cutover, or Supabase change is authorized by this document.
