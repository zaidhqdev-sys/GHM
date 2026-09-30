# GHM Saved Business Source Audit

## Status

**SOURCE RECONCILIATION — CONSTRUCTION AUTHORIZATION CANDIDATE**

This document records the verified Zaid Connect Saved Business capability before GHM schema/resource implementation. It does not authorize production migration, production data movement, provider cutover, or product configuration changes.

## 1. Canonical product source

Authoritative product repository:

```text
zaidhqdev-sys/zaid-connect
```

Primary production contract source:

```text
supabase/migrations/20260721170743_establish_trust_and_saved_business_contracts.sql
```

Application operation source:

```text
src/lib/lib_supabase.js
```

User-facing consumption sources:

```text
src/hooks/hooks_index.js
src/features/directory/DirectoryScreen.jsx
src/features/business-profile/BusinessProfileScreen.jsx
src/features/marketplace/MarketplaceScreen.jsx
```

Provider-specific Supabase RLS/auth mechanisms are evidence of the product contract only. They are not to be copied as the GHM authorization model.

## 2. Canonical domain concept

A Saved Business is a private relationship owned by an authenticated account that records that the account has saved an eligible Business for later access.

It is distinct from:

- Business public-directory visibility;
- Review/reputation state;
- Trust score calculation;
- Business membership/management;
- Business profile-view analytics;
- Enquiry/lead creation;
- notification delivery.

The production schema is `public.saved_businesses`.

## 3. Verified production data contract

The production migration establishes:

```text
saved_businesses
  id           uuid primary key
  user_id      uuid not null -> profiles.id
  business_id  uuid not null -> businesses.id
  created_at   timestamptz not null default now()
```

Integrity:

```text
UNIQUE(user_id, business_id)
```

Indexes:

```text
(user_id, created_at DESC)
(business_id)
```

The relationship is account-owned. There is no Business-owned membership role and no public Saved Business relationship.

## 4. Verified authorization boundary

The production source authorizes Saved Business access by the authenticated account identity.

Create requires:

```text
user_id = authenticated account
AND target Business is_active = true
AND target Business is_verified = true
AND target Business verification_status = 'approved'
```

Read requires:

```text
user_id = authenticated account
```

Delete requires:

```text
user_id = authenticated account
```

There is no public/anonymous read, create, or delete operation.

GHM must derive the owner account from `AuthContext.userId`; caller-supplied ownership must not be trusted as authorization proof.

## 5. Verified application operation surface

The production application exposes a UI-level toggle:

```text
savedService.toggle(userId, businessId)
```

The verified implementation performs:

1. lookup of the caller's existing `(user_id, business_id)` row;
2. delete when the relationship exists;
3. insert when the relationship does not exist;
4. return `false` after removal or `true` after creation.

The production hook exposes:

```text
useSaved(userId)
  saved
  savedIds
  toggle
  isSaved(id)
```

Saved Businesses are consumed by the Directory and Business Profile surfaces, and the Marketplace surface exposes save/remove behavior as part of Business discovery.

For GHM's provider-neutral resource boundary, the canonical persisted operations are therefore:

```text
read
create
delete
```

The product-level `toggle` is an adapter/UI convenience over those explicit resource operations. It is not a reason to introduce a provider-specific toggle RPC or a generic mutation operation into GHM.

## 6. Read projection boundary

The current Connect `savedService.getAll` returns the related public Business records rather than exposing raw Saved Business rows to the UI.

The production implementation was later hardened to use the canonical public Business column allowlist rather than `businesses(*)`. The allowlist explicitly excludes private registration/directory-review columns.

GHM should preserve the capability distinction:

```text
Saved Business relationship = private account-owned state
Business presentation       = governed public Business projection
```

GHM must not make the Saved Business table itself public merely because its related Business projection is public.

## 7. Eligibility dependency

Saved Business creation consumes the canonical Business public-eligibility predicate already reconciled in GHM:

```text
business.is_active = true
AND business.is_verified = true
AND business.verification_status = 'approved'
```

This is the same provider-neutral eligibility boundary used by the qualified Review public/receive slice. GHM should reference the canonical Business state rather than reproduce provider-specific RLS predicates.

## 8. Consistency and concurrency requirements

The source establishes a database uniqueness invariant on `(user_id, business_id)`.

GHM construction must preserve that invariant at the database level. Concurrent create attempts for the same account/business pair must not create duplicate relationships.

The source UI toggle is a read-then-write convenience and does not itself establish a stronger transactional toggle contract. GHM should therefore keep `create` and `delete` as separate explicit operations rather than inventing an atomic toggle requirement that is not source-backed.

## 9. Explicit exclusions

This source audit does not authorize construction of:

- Trust score calculation;
- Trust verification evidence;
- Business verification workflow expansion;
- profile-view analytics;
- recommendation/ranking logic;
- notifications;
- realtime delivery;
- saved-searches or saved enquiries;
- folders/tags/collections for saved Businesses;
- automatic expiry or retention;
- bulk save/unsave operations;
- anonymous saved state;
- a generic table API.

Trust score remains a separate capability because the production Trust contract has its own calculation and evidence dependencies.

## 10. GHM construction dependency

The GHM first-slice Business/Review construction already provides the canonical Business identity and public eligibility fields required by Saved Business creation:

```text
business.id
business.is_active
business.is_verified
business.verification_status
```

The existing GHM account identity provides the provider-neutral owner principal:

```text
account_identity.id
```

The Saved Business slice therefore has a bounded dependency surface and does not require copying the Connect Business schema.

## 11. Construction decision

The verified product evidence establishes a concrete, bounded capability suitable for a dedicated GHM construction slice:

```text
Resource: saved_business
Operations:
  read
  create
  delete
```

Authorization is account-owned and Business eligibility is enforced on creation.

No production adapter, migration, cutover, or provider replacement is authorized by this audit.
