# GHM Saved Business Source Audit

**Status:** SOURCE RECONCILED — construction candidate 2026-09-16

## 1. Purpose

Reconcile the production Zaid Connect Saved Business capability before any GHM schema, repository, service, registry, or runtime qualification work is authorized.

This audit covers the account-owned saved-business relationship only. The production migration also establishes Trust score persistence, but Trust is a separate capability and is not folded into this resource boundary.

## 2. Production source authority

Primary production migration:

```text
zaid-connect/supabase/migrations/20260721170743_establish_trust_and_saved_business_contracts.sql
```

Supporting production implementation:

```text
zaid-connect/src/lib/lib_supabase.js
zaid-connect/src/hooks/hooks_index.js
zaid-connect/src/features/business-profile/BusinessProfileScreen.jsx
zaid-connect/src/features/directory/DirectoryScreen.jsx
zaid-connect/tests/saved-business-public-read-allowlist-contract.test.js
zaid-connect/docs/06_Implementation/EXTRACTION_MAP.md
```

## 3. Production relation

Canonical production table:

```text
public.saved_businesses
```

Columns:

```text
id
user_id
business_id
created_at
```

Relationships:

```text
user_id     -> public.profiles(id)     ON DELETE CASCADE
business_id -> public.businesses(id)   ON DELETE CASCADE
```

Uniqueness:

```text
(user_id, business_id)
```

The relationship is therefore one saved Business per authenticated account/business pair, with duplicate saves prevented by the database constraint.

## 4. Production authorization boundary

Saved Businesses are private account-owned relationships.

Production RLS establishes:

- authenticated users may SELECT their own saved rows only;
- authenticated users may INSERT a row only when `user_id = auth.uid()`;
- INSERT additionally requires the target Business to be active, verified, and approved;
- authenticated users may DELETE their own saved rows only;
- anonymous users receive no Saved Business access;
- table privileges are explicitly limited to authenticated SELECT/INSERT/DELETE.

The production contract does not authorize arbitrary UPDATE of a saved relationship.

## 5. Production operation behavior

The application exposes Saved Business behavior through `savedService` and the Business Profile / Directory UI.

The canonical behavior is a toggle:

```text
existing save -> delete relationship -> return false
no existing save -> insert relationship -> return true
```

The authenticated account identity is supplied to the service from the current application user. The target Business identifier is the only business-side input.

The Business Profile feature owns the presentation behavior. The domain relationship itself is the `saved_businesses` persistence boundary.

The Directory feature also consumes the saved state for discovery/profile interaction.

## 6. Saved Business reads

The application exposes a `getAll(userId)` operation through `savedService` and `useSaved(userId)`.

The returned application shape is the saved Business records, not raw relationship records alone. The implementation embeds the Business through the canonical public directory Business column allowlist and maps the result to the embedded Business object.

The current production allowlist explicitly excludes private registration/review workflow columns, including:

```text
registration_number
directory_review_submitted_at
directory_review_last_reason
directory_review_last_event_type
```

A production regression test explicitly requires `savedService.getAll` to:

- avoid `businesses(*)` wildcard embedding;
- use `businesses(${PUBLIC_DIRECTORY_BUSINESS_SELECT})`;
- avoid the private 4A columns;
- avoid profile embedding;
- preserve the returned `s.businesses` mapping shape.

## 7. Target Business eligibility

A Saved Business may be created only for a Business satisfying the production visibility condition:

```text
business.is_active = true
AND business.is_verified = true
AND business.verification_status = 'approved'
```

This eligibility is enforced by the production database INSERT policy. GHM must preserve the same rule server-side.

The audit does not authorize saving pending, rejected, inactive, or otherwise non-public Businesses.

## 8. Delete semantics

Delete is owner-scoped to the authenticated account.

The production toggle removes the existing relationship by its saved-row id after resolving the current account/business pair.

There is no separate arbitrary update operation and no cross-account delete authority.

## 9. Domain boundary

Saved Business is a relationship resource, not a Business resource mutation.

It does not authorize mutation of:

- Business name;
- Business verification state;
- Business trust state;
- Business tier;
- Business profile fields;
- Business membership;
- reviews;
- enquiries;
- opportunities;
- notifications.

It is also not a Trust score resource. Trust is established by the same historical migration but has separate persistence, calculation, permissions, and presentation contracts.

## 10. Provider-specific behavior excluded from GHM

The following Supabase-specific mechanisms are source evidence for authorization only and must not become GHM dependencies:

- `auth.uid()`;
- Supabase RLS;
- Supabase Data API grants;
- Supabase client query syntax;
- Realtime;
- Storage;
- external delivery providers.

GHM authentication remains supplied by `AuthContext`; GHM authorization must be enforced by its repository/service boundary and runtime database privilege model.

## 11. Construction authorization boundary

The reconciled initial GHM Saved Business operation surface is:

```text
read
create
delete
```

Operationally, the product presents `create` + `delete` as a toggle, but GHM keeps the underlying relationship operations explicit so ownership and least-privilege rules remain testable.

There is no arbitrary UPDATE operation.

There is no administrator mutation operation established by this source.

There is no anonymous operation.

## 12. Required qualification evidence

Before closure, qualification must independently demonstrate:

1. exact Saved Business schema;
2. runtime identity and cleanup identity separation;
3. exact runtime privilege boundary;
4. authenticated account binding;
5. eligible Business create;
6. duplicate relationship denial/preservation;
7. ineligible Business create denial;
8. own read/list isolation;
9. cross-account read isolation;
10. own delete;
11. cross-account delete denial;
12. arbitrary UPDATE denial;
13. anonymous/unauthenticated denial where the GHM boundary exposes such a context;
14. persisted relationship reconciliation;
15. governed cleanup with no runtime ACL weakening.

## 13. Explicit exclusions

Not authorized by this audit:

- Trust score construction;
- Trust score calculation;
- verification adjudication;
- Business profile mutation;
- Business membership mutation;
- saved Business notes/tags/folders;
- saved Business sharing;
- notification generation;
- recommendations or ranking;
- analytics event construction;
- automatic expiry;
- administrator saved-list management;
- public visibility of a user's saved relationships.

## 14. Source conclusion

Saved Business is a small, explicit, production-backed account-to-Business relationship with a clear owner boundary and database-enforced public-Business eligibility. It is suitable for a narrow provider-neutral GHM resource construction.

Trust remains a separate future reconciliation because its production source defines a calculated score with multiple evidence dimensions and backend-owned calculation authority. No Trust behavior is inferred from the Saved Business contract.
