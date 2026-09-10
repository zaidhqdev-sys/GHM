# GHM Business Identity Operation Contract

## Status

Construction contract. No production cutover and no production Connect changes are authorized by this document.

## Evidence basis

Direct Connect source inspection establishes the current identity, Business membership, Business creation, Business read, and Business update boundaries. GHM preserves those capability distinctions without copying Connect's Supabase/RLS/RPC implementation.

## Operation matrix

| Operation | GHM boundary | Authorization | Transaction | First-slice status |
|---|---|---|---|---|
| Resolve account identity | `identity.resolve` | authenticated principal | read-only; independent reads acceptable | contract defined |
| Read own profile | `profile.readSelf` | principal owns account identity | read-only | contract defined |
| Update own profile | `profile.updateSelf` | principal owns account identity | single transaction | contract defined; SQL pending |
| List active Business memberships | `businessContext.listMemberships` | authenticated principal; account_id equals principal | read-only | contract defined |
| Resolve active Business context | `businessContext.resolve` | active membership belongs to principal | read-only | contract defined |
| Read Business public-safe | `business.readPublic` | public eligibility rules | read-only | first-slice SQL pending |
| Create Business | `business.create` | authenticated business-operator context | required atomic write | first-slice SQL pending |
| Update managed Business identity | `business.updateProfile` | active membership with `business.manage` | single transaction | first-slice SQL pending |
| Read Business memberships for managed Business | `businessContext.listBusinessMemberships` | owner/administrator according to final policy | read-only | later qualification |

## Identity resolution contract

### Input

```text
Authenticated principal
- accountId: provider-neutral GHM account identifier
- optional selectedBusinessId: provider-neutral Business identifier
```

### Output

```text
ApplicationIdentity
- account
- role
- memberships[]
- activeMembership | null
- activeBusiness | null
- businessId | null
- businessPermissions[]
- identityStatus
```

A selected Business is valid only when the principal has an active membership for that Business. Multiple active memberships with no valid selection produce `business-selection-required`. A stale, inactive, or revoked selection must fail closed.

## Profile contract

The first GHM schema provides these account profile fields:

```text
full_name
phone
avatar_ref
role
```

The repository contract must expose an explicit whitelist. It must not accept arbitrary column names or `SELECT *` as a public API contract.

The first migration does not contain an `avatar_url` column; the GHM representation is `avatar_ref`. Any provider-specific URL/storage semantics remain outside this schema slice.

## Business creation contract

### Input

```text
CreateBusinessInput
- name: string
```

The server must validate the trimmed name, derive a deterministic slug, enforce uniqueness, and establish the owner membership atomically.

### Server behavior

1. Authenticate principal.
2. Verify business-operator context.
3. Verify the creation-flow membership invariant.
4. Normalize/derive deterministic slug.
5. Insert the first-slice Business identity.
6. Insert the active owner membership in the same transaction.
7. Return the newly created Business identity/context.

### Failure behavior

If Business creation succeeds but owner membership creation fails, the transaction must roll back the Business. No orphan Business may be committed.

## Business update contract

The **first-slice GHM `business` table contains only**:

```text
id
name
slug
verification_status
is_active
created_at
updated_at
```

Accordingly, the first repository implementation is limited to the fields actually present in the canonical schema. No nonexistent Connect profile fields may be accepted or granted merely because they exist in Connect.

For the first slice:

```text
Allowed managed identity update:
- name
- slug
```

The service must still enforce the business-management authorization boundary and must reject attempts to mutate:

```text
id
verification_status
is_active
created_at
updated_at
```

Later fields such as description, category, location, contact information, registration identity, ratings, counters, logo binding, directory-review state, and commercial state require separately reconciled migrations and operation contracts.

## Membership contract

The first-slice membership model is:

```text
membership_role:
  owner | administrator | member

membership_status:
  active | inactive | revoked
```

It enforces one active owner per Business and uniqueness of `(business_id, account_id)`.

GHM preserves these domain invariants while using its own physical representation. Connect's compatibility `owner_id` column, RLS policies, and RPC names are not required to be reproduced.

## Permission contract

The application authorization vocabulary remains conceptually:

```text
business.read
business.manage
analytics.read
trust.read
```

For the first Business Identity slice, `business.read` and `business.manage` are the relevant authorization capabilities. Role-to-permission derivation remains an application concern and must not be encoded as PostgreSQL administrative privilege.

## First canonical schema

The schema has now been authored and applied through repository migration `20260909150000_create_business_identity.sql`.

```text
account_identity
  id
  full_name
  phone
  avatar_ref
  role
  created_at
  updated_at

business
  id
  name
  slug
  verification_status
  is_active
  created_at
  updated_at

business_membership
  id
  business_id
  account_id
  membership_role
  membership_status
  created_by
  created_at
  updated_at
```

This is the canonical first-slice schema for construction. It is not the complete Zaid Connect schema and does not authorize later product domains.

## Qualification tests required

### Positive

- authenticated principal can resolve own identity;
- authenticated principal can read own profile;
- authenticated principal can update permitted profile fields;
- principal can list active memberships;
- one active membership resolves automatically;
- multiple active memberships require explicit valid selection;
- invalid/revoked membership selection fails closed;
- principal can read eligible Business identity;
- authorized business operator can create a Business;
- creation atomically creates owner participation;
- authorized operator can update `name` and `slug` only.

### Negative

- unauthenticated identity resolution fails;
- one principal cannot read another principal's private profile;
- arbitrary profile columns cannot be updated;
- membership for another account cannot be used as context;
- revoked/inactive membership cannot establish context;
- Business creation cannot create an orphan Business;
- member cannot perform `business.manage` operations;
- ordinary Business update cannot change owner/participation, verification, activation, identifiers, or timestamps;
- runtime cannot create/alter/drop schema objects;
- runtime cannot create databases or roles;
- runtime cannot use migration authority.

## Gate result

**Contract reconciled to the applied first-slice schema. Application repository/transaction/authorization qualification remains open.**

Next implementation work is explicit service/repository SQL for these operations, followed by measured runtime privileges and positive/negative transaction and authorization qualification.
