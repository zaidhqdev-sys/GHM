# GHM Business Identity Operation Contract

## Status

Construction contract reconciled to the applied first-slice schema and current repository implementation. Live Resource API qualification remains open until the corrected multi-business qualification passes. No production cutover and no production Connect changes are authorized by this document.

## Evidence basis

Direct Connect source inspection establishes the current identity, Business membership, Business creation, Business read, and Business update boundaries. GHM preserves those capability distinctions without copying Connect's Supabase/RLS/RPC implementation.

## Operation matrix

| Operation | GHM boundary | Authorization | Transaction | First-slice status |
|---|---|---|---|---|
| Resolve account identity | `identity.resolve` | authenticated principal | read-only; independent reads acceptable | implementation present; qualified in prior construction evidence |
| Read own profile | `profile.readSelf` | principal owns account identity | read-only | implementation present; qualified in prior construction evidence |
| Update own profile | `profile.updateSelf` | principal owns account identity | single transaction | implementation present; qualified in prior construction evidence |
| List active Business memberships | `businessContext.listMemberships` | authenticated principal; account_id equals principal | read-only | implementation present; qualified in prior construction evidence |
| Resolve active Business context | `businessContext.resolve` | active membership belongs to principal | read-only | implementation present; multi-membership behavior implemented; qualification evidence remains part of Resource API closure |
| Read Business public-safe | `business.readPublic` | public eligibility rules | read-only | implementation present; qualified in Resource API construction evidence except overall gate closure |
| Create Business | `business.create` | authenticated business-operator context | required atomic write; account row locked before creation | implementation present; multi-business semantics reconciled; Resource API qualification open |
| Update managed Business identity | `business.updateProfile` | active membership with `business.manage` | single transaction | implementation present; qualified in Resource API construction evidence except overall gate closure |
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

### Reconciled ownership rule

A Business-operator account **may create more than one Business**. Existing active Business memberships do not block creation of another Business. This is required by the Connect source-of-truth model: Business ownership is Business-scoped through membership, and an account may participate in multiple Businesses. The account's active membership in one Business does not make it administrator of another Business, and creating a Business does not grant platform-wide administration.

The newly created Business receives exactly one active owner membership for the creating account. Existing memberships remain unchanged. Multiple active memberships are resolved through explicit Business selection rather than by imposing one-account/one-Business semantics.

### Server behavior

1. Authenticate principal.
2. Verify business-operator context.
3. Within the creation transaction, lock the authenticated `account_identity` row with `FOR UPDATE`.
4. Do **not** reject the account merely because it already has an active Business membership.
5. Normalize/derive deterministic slug.
6. Insert the new first-slice Business identity.
7. Insert the active owner membership for the creating account in the same transaction.
8. Return the newly created Business identity/context.

The account-row lock remains valuable for serializing concurrent Business-creation attempts for the same authenticated account, but it is not a one-Business invariant.

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

Business-management authorization is **Business-scoped**: an owner/administrator membership grants management for that Business only. It does not make the account a platform administrator and does not confer management of other Businesses.

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
- authorized business operator can create a Business with no prior membership;
- authorized business operator with an existing active Business membership can create an additional Business;
- additional Business creation preserves existing memberships;
- each created Business gets an active owner membership for its creating account;
- concurrent Business creation for one account cannot create orphan Businesses or duplicate ownership within a single Business;
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

**Business creation semantics are reconciled to Connect's multi-business ownership model. Resource API qualification remains open until the corrected live HTTP qualification demonstrates creation of an additional Business while preserving the existing Business membership and all authorization boundaries.**

No production Zaid Connect changes, production database cutover, provider/bootstrap mutations, or later product adapters are authorized by this reconciliation.
