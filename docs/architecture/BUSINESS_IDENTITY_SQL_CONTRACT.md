# GHM Business Identity SQL Contract

Status: construction design; not a migration authorization.

## Scope

This contract maps the reconciled Business Identity operations to parameterized SQL shapes. It deliberately separates authorization from SQL and avoids `SELECT *`.

## SQL shapes

### `identity.resolve`

1. Read the authenticated account from `account_identity` by `id = $1`.
2. Read active memberships from `business_membership` by `account_id = $1` and `status = 'active'`.
3. If a selected business id `$2` is supplied, resolve only an active membership for `(account_id=$1,business_id=$2)` and then read that business by id.
4. If no selection is supplied, return no implicit business choice unless the service contract explicitly defines deterministic single-business selection. The initial contract treats selection as explicit.

### `profile.readSelf`

```sql
SELECT id, full_name, phone, avatar_ref, role, created_at, updated_at
FROM account_identity
WHERE id = $1;
```

### `profile.updateSelf`

Dynamic SQL is prohibited. Build the SET clause only from the fixed whitelist: `full_name`, `phone`, `avatar_ref`, plus `updated_at`. The WHERE predicate is always `id = $1`.

### `businessContext.listMemberships`

```sql
SELECT id, business_id, account_id, membership_role, membership_status,
       created_by, created_at, updated_at
FROM business_membership
WHERE account_id = $1
ORDER BY created_at, id;
```

### `business.readPublic`

Public reads use an explicit safe projection and `is_active = true`. No managed/protected fields are returned.

Candidate projection:

```sql
SELECT id, name, slug, verification_status, is_active,
       description, category, province, city, physical_address,
       latitude, longitude, phone, whatsapp, email, website,
       avatar_letter, avatar_color, years_in_business,
       created_at, updated_at
FROM business
WHERE id = $1 AND is_active = true;
```

The final public projection remains subject to Connect schema reconciliation before migration authorization.

### `business.readManaged`

Read a business only after verifying an active membership for the caller. The service may return the managed profile projection plus registration identity through its dedicated operation, but protected governance fields remain read-only and explicit.

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

The service must commit both or neither. No orphan business is permitted.

### `business.updateProfile`

The service must first verify an active membership with a role that has `business.manage` permission. The UPDATE is a fixed allowlisted column set and must never accept protected governance fields.

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

The SQL above requires runtime authority only for:

- CONNECT on the database;
- USAGE on the owning schema;
- SELECT on `account_identity`, `business`, `business_membership`;
- INSERT on `business` and `business_membership`;
- UPDATE on the explicitly writable account/business columns.

Sequence privileges are required if ids use database sequences.

The runtime role does **not** require CREATEDB, CREATEROLE, ownership of the schema, arbitrary DDL, or blanket TRUNCATE/REFERENCES/TRIGGER authority.

The exact grant statements will be generated only after the canonical GHM migration defines the actual column defaults, identity/sequence strategy, and constraints.

## Qualification requirement

Before this contract can authorize a migration, reconcile the final Connect definitions for `profiles`, `businesses`, and `business_memberships` in timestamp order and freeze the GHM-owned field mapping. Then implement positive and negative repository tests against the GHM schema.
