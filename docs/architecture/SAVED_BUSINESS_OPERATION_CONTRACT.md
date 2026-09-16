# GHM Saved Business Operation Contract

**Status:** CONSTRUCTION AUTHORIZED — operation contract frozen 2026-09-17

## 1. Purpose

Define the provider-neutral operation boundary for the production-backed Zaid Connect Saved Business capability.

Canonical resource:

```text
saved_business
```

Canonical relation:

```text
ghm.saved_business
```

Saved Business is an account-owned relationship to a canonical Business. It does not create a second Business identity.

## 2. Production source authority

The production source audit reconciles the source relationship `public.saved_businesses` to the GHM resource `ghm.saved_business`.

Production behavior establishes:

- one saved relationship per account/Business pair;
- authenticated owner-scoped reads;
- authenticated owner-bound creates;
- authenticated owner-scoped deletes;
- no arbitrary update operation;
- creation only for an active, verified, approved Business;
- public Business projection when Business data accompanies a saved result.

GHM preserves those domain boundaries without reproducing Supabase RLS, `auth.uid()`, client query syntax, or provider-specific RPC implementation.

## 3. Operation matrix

| Operation | Purpose | Authorization | Transaction | Initial status |
|---|---|---|---|---|
| `read` | Read/list the authenticated account's Saved Business relationships, with canonical public Business data where exposed | authenticated principal owns the account scope | read-only | construction target |
| `create` | Save one eligible Business for the authenticated account | authenticated principal; owner derived from `AuthContext` | required atomic write | construction target |
| `delete` | Remove one Saved Business relationship owned by the authenticated account | authenticated principal owns the relationship | required atomic write | construction target |

There is no `update` operation.

There is no `toggle` operation in GHM. A product adapter may implement a toggle UX by selecting whether to call `create` or `delete`, but the GHM boundary remains explicit.

There is no administrator Saved Business operation in this contract.

There is no anonymous Saved Business operation in this contract.

## 4. Authentication boundary

Every protected Saved Business operation requires an authenticated `AuthContext`.

The authenticated account is:

```text
context.userId
```

The caller must not be allowed to substitute another account identifier as the owner.

GHM's authorization model requires protected work to carry the same authenticated context into the checked-out database transaction. The resource repository must therefore use the authorized transaction boundary rather than an unrelated database connection.

## 5. Read contract

### Input

The initial read surface accepts the authenticated account context and, where needed, a specific Saved Business identifier or Business identifier as a parameterized resource value.

No table name, column name, or ownership identifier is accepted as a dynamic SQL fragment.

### Scope

The read scope is strictly:

```text
saved_business.account_id = authenticated context.userId
```

A specific Saved Business read must return only a relationship owned by the authenticated account.

A list read returns only relationships owned by the authenticated account.

### Returned Business data

When Business information is included, the repository/service returns the canonical public-safe Business projection. It must not expose private Business registration, verification workflow internals, private account/profile fields, or the Saved Business relationship to unrelated users.

## 6. Create contract

### Input

```text
CreateSavedBusinessInput
- businessId: number
```

The authenticated account is not an input field. It is derived from `AuthContext`.

### Preconditions

The service must require:

1. authenticated context;
2. valid positive Business identifier;
3. canonical Business exists;
4. Business is active;
5. Business is verified;
6. Business verification status is `approved`;
7. the account/Business relationship does not already exist.

Eligibility is exactly:

```text
business.is_active = true
AND business.is_verified = true
AND business.verification_status = 'approved'
```

### Atomic behavior

The create operation must perform the eligibility check and relationship insert within the protected database boundary so the operation cannot silently substitute a different owner account.

The persisted row must use:

```text
account_id = context.userId
business_id = input.businessId
```

The server controls `id` and `created_at`.

### Duplicate behavior

The `(account_id, business_id)` uniqueness constraint is authoritative. A duplicate create must not create another relationship row.

The service must expose a deterministic domain error/result for duplicate creation rather than treating a duplicate as a second saved relationship.

## 7. Delete contract

### Input

```text
DeleteSavedBusinessInput
- savedBusinessId: number
```

Where a product adapter uses a Business identifier to represent the toggle action, the adapter must first resolve the authenticated account's own relationship; the repository delete remains owner-scoped.

### Authorization

The delete predicate must bind both the resource identifier and authenticated owner:

```text
id = input.savedBusinessId
AND account_id = context.userId
```

A caller cannot delete another account's Saved Business relationship.

The operation must not disclose whether an unrelated account's relationship exists.

### Behavior

Successful deletion removes exactly the authenticated account's relationship.

No parent Business or account identity is deleted.

## 8. Arbitrary update prohibition

There is no Saved Business update operation.

The repository must not expose an update method that permits mutation of:

```text
id
account_id
business_id
created_at
```

The runtime role is not granted UPDATE on `ghm.saved_business`.

Any attempted arbitrary update must therefore fail at the application boundary and remain denied by the database privilege boundary.

## 9. Business eligibility ownership

Saved Business consumes Business Identity state; it does not own that state.

The following fields remain owned by Business Identity/verification governance:

```text
is_active
is_verified
verification_status
```

Saved Business must not mutate or reinterpret those fields.

Review aggregates such as Business rating/review count are not part of Saved Business authorization and are not mutated by it.

## 10. Resource authorization

Saved Business is an authenticated account-owned resource.

The authorization sequence is:

```text
HTTP/application request
        |
        v
verified AuthContext
        |
        v
registered saved_business + operation
        |
        v
account ownership assertion
        |
        v
single authorized DB transaction
        |
        v
Saved Business repository
```

The generic GHM role vocabulary (`admin`, `customer`, `business`) does not by itself grant Saved Business access to another account's relationship. Ownership remains the decisive resource boundary for this capability.

No platform-admin bypass is authorized by this contract.

## 11. Runtime privilege boundary

The migration grants the runtime role only the table privileges required by the resource:

```text
SELECT
INSERT(account_id, business_id)
DELETE
sequence USAGE
```

No UPDATE is authorized.

No schema-ownership, role-management, or migration privilege is authorized.

Cleanup authority remains separate from runtime authority.

The application boundary, not PostgreSQL session variables supplied by the caller, establishes the authenticated owner identity. A session setting must not be introduced as a substitute for `AuthContext` ownership enforcement.

## 12. Provider boundary

The GHM implementation must not depend on:

- Supabase RLS;
- `auth.uid()`;
- Supabase security-definer RPCs;
- Supabase Data API behavior;
- provider-specific saved-business toggle RPCs;
- Realtime;
- Storage;
- notifications;
- ranking/recommendation infrastructure.

Product adapters map their existing behavior into the GHM `read`, `create`, and `delete` operations.

## 13. Qualification requirements

The Saved Business qualification must independently demonstrate:

### Schema

1. exact `ghm.saved_business` columns and types;
2. both canonical foreign keys;
3. cascade behavior;
4. uniqueness of `(account_id, business_id)`;
5. account-first listing index;
6. runtime grants exactly as authorized;
7. absence of runtime UPDATE privilege.

### Authentication and authorization

8. unauthenticated access is denied at the protected application boundary;
9. authenticated account identity is derived from `AuthContext`;
10. caller-supplied owner/account substitution is rejected or ignored;
11. one account can read only its own relationships;
12. cross-account read isolation holds;
13. one account can delete only its own relationship;
14. cross-account delete is denied without unrelated-resource disclosure.

### Create

15. eligible active/verified/approved Business can be saved;
16. inactive Business cannot be saved;
17. unverified Business cannot be saved;
18. non-approved Business cannot be saved;
19. duplicate save cannot create a second row;
20. persisted owner is the authenticated account.

### Update and persistence

21. arbitrary update is denied;
22. persisted read-after-create reconciles to the authenticated owner and Business;
23. delete removes the intended relationship;
24. governed cleanup can remove qualification fixtures without weakening runtime privileges.

## 14. Construction order

```text
schema contract
  -> migration
  -> operation contract
  -> repository
  -> service
  -> registry
  -> tests / qualification
  -> runtime privilege qualification
```

No public HTTP route is authorized merely because `saved_business` is registered. Route exposure requires a concrete adapter and qualification evidence.

## 15. Explicit exclusions

The initial capability excludes:

- saved notes;
- tags;
- folders;
- sharing;
- public saved relationships;
- administrator saved lists;
- Business profile mutation;
- Business verification adjudication;
- membership mutation;
- Trust mutation;
- ranking/recommendations;
- analytics;
- notifications;
- expiry/archival;
- saved-search functionality;
- collections or favorites beyond the single Saved Business relationship.

## 16. Production safety

This contract is construction-only. No production Zaid Connect database, application, credentials, routing, DNS, or provider configuration may be changed by this work.
