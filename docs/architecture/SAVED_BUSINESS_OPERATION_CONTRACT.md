# GHM Saved Business Operation Contract

## Status

**CONSTRUCTION CONTRACT — AUTHORIZED FOR DEDICATED RESOURCE SLICE**

This contract freezes the first GHM Saved Business boundary reconciled from the live Zaid Connect source audit. It authorizes construction and qualification of this isolated resource only. It does not authorize production migration, provider cutover, data movement, DNS/routing changes, shadow traffic, or product configuration changes.

## 1. Canonical domain concept

A **Saved Business** is an account-owned relationship indicating that an authenticated account has saved an eligible Business for later discovery.

The relationship is private to the owning account. The related Business remains governed by the canonical Business public projection and is not made public through the Saved Business resource.

Saved Business is distinct from:

- Business membership;
- Reviews and rating aggregates;
- Trust scoring/evidence;
- Enquiries/leads;
- notifications;
- profile-view analytics;
- directory ranking or recommendation state.

## 2. Canonical identity mapping

Production Connect uses:

```text
saved_businesses.user_id      -> profiles.id
saved_businesses.business_id  -> businesses.id
```

GHM maps these to provider-neutral canonical identities:

```text
saved_business.account_id     -> ghm.account_identity.id
saved_business.business_id    -> ghm.business.id
```

The authenticated account is always taken from `AuthContext.userId`.

A caller-supplied account identifier must not be used as authorization proof.

## 3. First-slice operation surface

The canonical GHM operation vocabulary is:

```text
saved_business.read
saved_business.create
saved_business.delete
```

The Connect `savedService.toggle()` behavior is an application convenience implemented as either create or delete. GHM does not expose a provider-specific toggle operation.

### `saved_business.read`

Actor: authenticated account.

Authorization:

```text
saved_business.account_id = context.userId
```

Result:

- reads Saved Business relationships owned by the authenticated account;
- may be scoped to a specific Business or return the account's saved relationships;
- does not permit reading another account's saved relationships.

There is no anonymous/public read of Saved Business state.

### `saved_business.create`

Actor: authenticated account.

Authorization and invariants:

1. authenticated account is `context.userId`;
2. target Business exists;
3. target Business is active;
4. target Business is verified;
5. target Business verification status is `approved`;
6. no existing `(account_id, business_id)` relationship exists;
7. relationship owner is derived from the authenticated context;
8. duplicate creation is rejected by the database uniqueness invariant.

Result:

- creates one Saved Business relationship;
- `created_at` is server generated;
- caller cannot assign another account as owner.

### `saved_business.delete`

Actor: authenticated account.

Authorization:

```text
saved_business.account_id = context.userId
```

Result:

- deletes only the caller's own relationship for the specified Saved Business;
- deleting another account's relationship is rejected;
- no Business membership authority is relevant to this operation.

## 4. Data contract

The first GHM slice is intentionally minimal:

```text
saved_business
  id
  account_id
  business_id
  created_at
```

The relationship is represented by canonical GHM `bigint` identity keys.

No copied Supabase UUID is part of the GHM contract.

## 5. Database integrity

The database must enforce:

```text
UNIQUE(account_id, business_id)
```

The relationship must reference existing canonical GHM Account and Business identities.

Deleting a parent identity must follow the canonical GHM ownership/dependency policy rather than leaving an orphaned Saved Business relationship.

The database uniqueness invariant is part of the runtime concurrency boundary; application-level read-before-insert is not sufficient evidence by itself.

## 6. Business eligibility dependency

Saved Business creation depends on the canonical GHM Business public-eligibility state:

```text
business.is_active = true
AND business.is_verified = true
AND business.verification_status = 'approved'
```

This predicate must be evaluated against the canonical Business row.

The Saved Business implementation must not create a second eligibility vocabulary or copy provider-specific RLS predicates.

A Business becoming ineligible after a relationship is saved does not, by itself, authorize automatic deletion or expiry. No such lifecycle exists in the first slice.

## 7. Read projection boundary

The persisted Saved Business relationship is private state.

A caller that needs Business presentation data may consume the separately governed Business public projection. Saved Business implementation must not weaken Business column visibility or expose private Business registration/directory-review fields.

The resource does not own Business presentation fields.

## 8. Transaction boundary

Create must be atomic with all checks required to establish the relationship.

At minimum, qualification must prove:

- invalid/nonexistent Business rejection;
- inactive Business rejection;
- unverified/non-approved Business rejection;
- duplicate relationship prevention;
- concurrent duplicate creation cannot produce two rows;
- unauthorized account ownership cannot be created.

Delete must be atomic for the caller-owned relationship and must not permit cross-account deletion.

No multi-resource workflow is introduced by this slice.

## 9. Least privilege

The runtime role may perform only the database actions required by the three qualified operations.

The implementation must not grant arbitrary direct table mutation beyond the resource boundary.

If database column grants are used, qualification must verify the effective privilege boundary rather than infer it from table-level privileges alone.

## 10. Error/validation boundary

The resource must reject:

- unauthenticated access;
- invalid account identity;
- invalid Business identity;
- Business that is not currently eligible for Saved Business creation;
- duplicate create;
- cross-account read;
- cross-account delete.

The service layer owns domain validation and authorization orchestration; repository code owns persistence and database error translation according to established GHM conventions.

## 11. Explicit exclusions

This contract does not include:

- `toggle` as a persisted operation;
- bulk save/unsave;
- folders, tags, or collections;
- saved searches;
- saved enquiries;
- expiration or retention;
- automatic removal when Business eligibility later changes;
- Trust score calculation;
- Trust evidence;
- recommendations/ranking;
- notifications;
- realtime events;
- analytics;
- anonymous saved state;
- public Saved Business reads;
- arbitrary table APIs.

Each excluded capability requires separate source evidence and a separate contract.

## 12. Construction deliverables

The dedicated construction slice must provide:

1. architecture documentation;
2. canonical GHM migration under `ghm` schema;
3. resource contracts;
4. repository implementation;
5. service implementation;
6. resource registry integration;
7. authorization integration;
8. focused tests;
9. runtime qualification script;
10. qualification record;
11. handover reconciliation.

No production deployment or provider cutover is part of this work.
