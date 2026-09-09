# GHM Business Identity Operation Contract

## Status

Construction contract. No production cutover and no production Connect changes are authorized by this document.

## Evidence basis

Direct Connect source inspection confirms the current application resolves identity by loading the canonical Profile, loading active Business memberships for the Account, and deriving the active Business context and permissions from the selected membership. A single membership is auto-selected; multiple memberships require an eligible selection; an invalid or revoked selection fails closed. The active Business selection does not change the Account Role. fileciteturn124file0L2-L2 fileciteturn125file0L2-L2

Connect's Business creation UI calls the Business service with the authenticated Account ID and Business name; the service derives the slug and persists the Business through the existing backend contract. fileciteturn132file0L2-L2

The production Business service exposes public-safe reads, Business creation, Business update, owner registration identity retrieval, and ownership-scoped reads. Its public Business projection deliberately excludes registration number and directory-review fields. fileciteturn137file0L2-L2

The owner editor defines the currently editable Business fields and separately identifies fields that owners must never mutate directly, including verification, activation, ownership, rating, review count, profile views, jobs completed, insurance verification, and logo binding. fileciteturn129file0L2-L2

The approved Connect data architecture keeps Account identity, Profile, Account Role, Business ownership, and Business identity distinct. fileciteturn93file0L2-L2

## Operation matrix

| Operation | Product evidence | GHM boundary | Authorization | Transaction | Notes |
|---|---|---|---|---|---|
| Resolve account identity | `resolveApplicationIdentity` | `identity.resolve` | authenticated principal | read-only; independent reads acceptable | Profile is canonical for persisted role |
| Read own profile | `profileService.getProfile` | `profile.readSelf` | principal owns account identity | read-only | Never expose arbitrary-account profile lookup |
| Update own profile | `profileService.updateProfile` | `profile.updateSelf` | principal owns account identity | single transaction | Initial whitelist: `full_name`, `phone`, `avatar_url`; do not accept arbitrary columns |
| List active Business memberships | `businessMembershipService.getForAccount` | `businessContext.listMemberships` | authenticated principal; account_id must equal principal | read-only | Only active memberships participate in context selection |
| Resolve active Business context | identity selection logic | `businessContext.resolve` | membership must be active and belong to principal | read-only | Selection is application context, not persisted mutation |
| Read Business public-safe | `businessService.getById/getBySlug/list` | `business.readPublic` | public eligibility rules | read-only | Projection must remain explicit; no `SELECT *` contract |
| Read Business for authorized operator | `businessService.getForOwnerEditor` | `business.readManaged` | `business.read` / `business.manage` according to operation | read-only | Private registration identity is a separate sub-capability |
| Create Business | `businessService.create` | `business.create` | authenticated business-operator context; no existing active membership for creation flow | required atomic write | Creation establishes owner participation atomically |
| Update managed Business profile | `businessService.update` + owner editor payload | `business.updateProfile` | active membership with `business.manage` | single transaction | Explicit editable-field whitelist; protected state cannot be caller-written |
| Read registration identity | `businessService.getRegistrationIdentity` | `business.readRegistrationIdentity` | owner/authorized managed operator | read-only | Private field set is separate from public Business projection |
| Read Business memberships for managed Business | membership service | `businessContext.listBusinessMemberships` | owner/administrator according to final GHM policy | read-only | Membership administration is not part of first mutation scope |

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

The selected Business is valid only when the principal has an active membership for that Business. Multiple memberships with no valid selection produce `business-selection-required`. A stale selection must never grant Business context. fileciteturn102file0L2-L2

## Business creation contract

### Input

```text
CreateBusinessInput
- name: string
```

The client currently validates that the trimmed name is present, at least two characters, and produces a non-empty slug. GHM must repeat the invariant server-side rather than trusting client validation. fileciteturn132file0L2-L2

### Server behavior

1. Authenticate principal.
2. Verify business-operator context.
3. Verify the principal is not already represented by an active Business membership for the creation flow.
4. Normalize/derive a deterministic slug.
5. Enforce Business-name and slug invariants.
6. Create Business.
7. Create the active owner membership in the same transaction.
8. Return the newly created Business identity/context.

### Failure behavior

If Business creation succeeds but owner membership creation fails, the transaction must roll back the Business. No orphan Business may be committed.

## Business update contract

The current owner editor exposes these editable fields:

```text
name
slug
description
category
province
city
physical_address
latitude
longitude
phone
whatsapp
email
website
avatar_letter
avatar_color
years_in_business
registration_status
registration_number
legal_name
```

However, GHM should not implement these as one unrestricted generic update object. Registration identity is a protected sub-capability and must be separated from ordinary public/profile fields. The current Connect editor itself distinguishes protected fields from owner-editable fields. fileciteturn129file0L2-L2

### Ordinary managed Business profile update

Candidate first-slice fields:

```text
name
slug
description
category
province
city
physical_address
latitude
longitude
phone
whatsapp
email
website
avatar_letter
avatar_color
years_in_business
```

### Protected registration identity

```text
registration_status
registration_number
legal_name
```

This requires a dedicated operation because the production contract treats registration number as private and uses a separate registration-identity RPC for owner retrieval. fileciteturn137file0L2-L2

### Never caller-writable through ordinary Business update

```text
id
owner_id
verification_status
is_verified
is_active
directory_review_submitted_at
directory_review_last_reason
directory_review_last_event_type
tier
is_featured
rating
review_count
profile_views
jobs_completed
insurance_verified
logo_url
```

These are governed state, derived state, ownership, or separate capability state and must not be accepted through the ordinary Business profile update contract. fileciteturn129file0L2-L2

## Membership contract

The current Connect membership model is:

```text
membership_role:
  owner | administrator | member

membership_status:
  active | inactive | revoked
```

It enforces one active owner per Business and uniqueness of `(business_id, account_id)`. fileciteturn105file0L2-L2

GHM should preserve these domain invariants while deciding its own physical representation. The first GHM migration must not blindly reproduce Connect's owner compatibility column and trigger merely because they exist in the current implementation.

## Permission contract

Current Connect permission vocabulary observed in the identity layer:

```text
business.read
business.manage
analytics.read
trust.read
```

Current role-to-permission derivation is:

```text
owner         → all four
administrator → all four
member        → business.read
```

This is an application authorization contract, not a requirement to create PostgreSQL functions with the same names. fileciteturn124file0L2-L2

GHM must keep authorization separate from PostgreSQL administrative privilege.

## First-slice schema candidate

The evidence now supports a deliberately small candidate schema for the first GHM business migration:

```text
account_identity
  id
  full_name
  phone
  avatar_ref
  role
  referral_code (only if an actual first-slice operation requires it)
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

This is a **candidate**, not an authorized migration schema. `verification_status` and `is_active` remain in the candidate because public Business resolution depends on governed visibility state, while directory-specific metadata remains outside the first slice.

The existing Connect public Business projection contains many additional fields, but those fields belong to later directory/profile capabilities and should not be pulled into the first GHM migration unless a measured first-slice operation requires them. fileciteturn137file0L2-L2

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
- authorized operator can update permitted Business profile fields.

### Negative

- unauthenticated identity resolution fails;
- one principal cannot read another principal's private profile;
- arbitrary profile columns cannot be updated;
- membership for another account cannot be used as context;
- revoked/inactive membership cannot establish context;
- Business creation cannot create an orphan Business;
- member cannot perform `business.manage` operations;
- ordinary Business update cannot change owner, verification, activation, rating, counters, or other governed fields;
- runtime cannot create/alter/drop schema objects;
- runtime cannot create databases or roles;
- runtime cannot use migration authority.

## Gate result

**Operation contract reconciled. Candidate schema identified. Migration still not authorized.**

The next gate is to turn this contract into explicit GHM service/repository interfaces and SQL statements, then derive exact PostgreSQL privileges from those statements. Only after that should the first business migration be created.
