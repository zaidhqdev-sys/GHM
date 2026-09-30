# GHM Business Listing Verification Contract

Status: **construction architecture contract; first-slice verification/eligibility boundary QUALIFIED / PASS.**

## 1. Purpose

Define the provider-neutral Business listing verification and eligibility capability required by the GHM Business and Review slices.

This document is an architecture contract only. It does not authorize production changes, data migration, or product cutover.

## 2. Source-of-truth evidence

Zaid Connect remains authoritative for the current product contract. Its current Business representation explicitly distinguishes three listing fields:

- `verification_status`
- `is_verified`
- `is_active`

The current directory/public-read implementation requires an eligible Business to satisfy `verification_status = 'approved'` and `is_active = true`; other product workflows also explicitly require `is_verified = true` alongside those conditions.

The Founder-controlled directory review workflow independently updates `verification_status` and `is_verified`, while deliberately leaving `is_active` unchanged. Its current status vocabulary is `unverified`, `under_review`, `information_requested`, `approved`, and `rejected`.

Therefore GHM must not silently collapse `is_verified` into `verification_status`, nor treat `is_active` as a verification state.

## 3. Canonical GHM ownership

GHM owns Business state in `ghm.business`.

The first canonical construction slice reconciles these fields:

- `id`
- `name`
- `slug`
- `verification_status`
- `is_verified`
- `is_active`
- `rating`
- `review_count`
- `created_at`
- `updated_at`

The GHM verification status vocabulary remains the reduced construction vocabulary `pending`, `approved`, `rejected`; this is not presented as a complete copy of Connect's internal workflow vocabulary.

## 4. Reconciliation decision

The first canonical GHM Business/Review construction slice resolves the previously open questions as follows:

1. **Separate `is_verified`: YES.** GHM retains a distinct `is_verified` capability field because Connect uses it independently and Review eligibility requires it explicitly.
2. **Verification status vocabulary:** GHM retains its existing reduced construction vocabulary `pending`, `approved`, `rejected`. Connect-only workflow states such as `under_review` and `information_requested` are not silently invented in the GHM schema.
3. **`is_active`: independent.** Activation/publication remains separate from verification state.
4. **Public/Review eligibility:** a Business is eligible only when `is_active = true`, `is_verified = true`, and `verification_status = 'approved'`.
5. **Mutation authority:** ordinary Business profile management does not authorize verification or activation mutation. Governed state changes require the explicit GHM authorization boundary.
6. **Workflow history:** detailed verification workflow history is not part of the first Business Identity/Review slice and requires a separately governed capability if later required.
7. **Review consumption:** Review uses the canonical Business eligibility predicate rather than provider-specific RLS/RPC mechanisms.

The key invariant is:

```text
verification_status = 'approved'  =>  is_verified = true
verification_status != 'approved' =>  is_verified = false
```

`is_active` remains independent of both.

## 5. Working semantic distinction

The construction decision is now explicit:

- `verification_status` represents the GHM Business verification state within the reduced construction vocabulary;
- `is_verified` is a distinct verified flag and is not authorization by itself;
- `is_active` represents independent Business activation/publication state.

This is no longer an unresolved placeholder for the first canonical slice. Any expansion of the verification workflow requires a new contract decision.

## 6. Public eligibility boundary

The GHM public directory contract owns the provider-neutral eligibility predicate:

```text
business.is_active = true
AND business.is_verified = true
AND business.verification_status = 'approved'
```

Review public visibility consumes this canonical Business eligibility boundary and does not reproduce Supabase-specific RLS/RPC conditions.

## 7. Authorization boundary

Business owners/members must not be able to self-approve, self-verify, or otherwise mutate governed verification state merely because they can manage ordinary Business profile data.

Any Founder/admin governance capability must use an explicit GHM authorization contract. Provider-specific Founder allowlists, fixed external profile UUIDs, Supabase `auth.uid()`, and security-definer RPCs are not portable authorization primitives and are not copied into GHM.

## 8. Review dependency

Review creation requires an eligible target Business.

Review public reads require an eligible Business and an approved Review.

This dependency is now reconciled and qualified for the first canonical GHM Review slice. The Review dependency no longer blocks Review schema or runtime qualification.

## 9. Explicit non-goals

This contract does not implement or authorize:

- a separate verification-history subsystem;
- arbitrary expansion of the Connect verification workflow vocabulary;
- directory UI changes;
- notifications;
- provider migration;
- production data synchronization;
- Supabase RLS/RPC replication;
- Founder account bootstrap;
- automatic approval;
- unrestricted public Business projection.

## 10. Qualification result

The first canonical Business verification/eligibility boundary is **QUALIFIED / PASS** as a construction dependency.

Qualification evidence establishes:

- explicit separation of `verification_status`, `is_verified`, and `is_active`;
- approved-status/verified invariant;
- public/Review eligibility requiring all three conditions;
- governed Business ownership and authorization boundaries;
- Review consumption of the canonical eligibility boundary;
- runtime and database evidence for the qualified first slice.

Future verification workflow expansion or mutation endpoints require separate qualification.

## 11. Founder boundary

**Direction:** Business listing verification/eligibility is a canonical Business/Review dependency.

**Current construction decision:** reconciled and qualified for the first canonical GHM slice.

**Not authorized:** production changes, provider migration, production data migration, product adapters, or cutover.

The first-slice reconciliation is closed. Future workflow states, verification history, and governance mutation surfaces remain separately governed.
