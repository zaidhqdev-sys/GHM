# GHM Business Listing Verification Contract

Status: **construction architecture contract; schema implementation blocked pending Founder review of this boundary.**

## 1. Purpose

Define the provider-neutral Business listing verification capability required to reconcile Zaid Connect directory eligibility before Review can be implemented in GHM.

This document is an architecture contract only. It does not authorize production changes, data migration, or a GHM schema mutation.

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

Current canonical fields are:

- `id`
- `name`
- `slug`
- `verification_status`
- `is_active`
- `created_at`
- `updated_at`

The existing GHM schema intentionally uses the reduced vocabulary `pending`, `approved`, `rejected`. This contract does not redefine that vocabulary implicitly.

## 4. Required reconciliation

Before implementing Review, GHM must establish a formal mapping between the current Connect verification model and GHM Business state.

The mapping must answer, explicitly:

1. Whether GHM needs a separate `is_verified` capability field.
2. Whether GHM `verification_status` should remain the current reduced vocabulary or expand to represent workflow states such as `under_review` and `information_requested`.
3. Whether `is_active` remains an independent publication/lifecycle gate.
4. Which state combination constitutes public Business eligibility in GHM.
5. Which actor/capability may change each field.
6. Whether verification workflow history belongs to the Business capability or a separate governance capability.
7. How Review's public-read invariant will consume Business eligibility without depending on provider-specific RLS/RPC mechanisms.

No one of these questions may be resolved by copying Connect columns without an explicit ownership decision.

## 5. Working semantic distinction

Until formally reconciled:

- `verification_status` represents the Business verification workflow state.
- `is_verified` represents a distinct verified flag used by current Connect workflows and must not be inferred to be redundant.
- `is_active` represents independent Business activation/publication state.

This is a temporary architecture constraint, not permission to add `is_verified` immediately.

## 6. Public eligibility boundary

The GHM public directory contract must expose a provider-neutral eligibility predicate owned by GHM. The predicate must be defined only after the reconciliation in Section 4.

Review public visibility must consume that canonical Business eligibility boundary rather than duplicate provider-specific conditions.

## 7. Authorization boundary

Business owners/members must not be able to self-approve, self-verify, or otherwise mutate governed verification state merely because they can manage ordinary Business profile data.

Any Founder/admin governance capability must use an explicit GHM authorization contract. Provider-specific Founder allowlists, fixed external profile UUIDs, Supabase `auth.uid()`, and security-definer RPCs are not portable authorization primitives and must not be copied into GHM.

## 8. Review dependency

Review creation requires an eligible target Business.

Review public reads require an eligible Business and an approved Review.

Consequently Review schema implementation remains blocked until this Business eligibility contract is reconciled and its ownership is established.

## 9. Explicit non-goals

This contract does not implement:

- Review tables;
- rating aggregates;
- directory UI;
- notifications;
- provider migration;
- production data synchronization;
- Supabase RLS/RPC replication;
- Founder account bootstrap;
- automatic approval;
- public Business data projection.

## 10. Qualification gate

A future implementation must qualify, at minimum:

- state vocabulary and transition invariants;
- public eligibility behavior;
- owner/non-owner authorization boundaries;
- governed verification mutation boundaries;
- interaction with Business active state;
- Review dependency consumption;
- runtime identity and least-privilege SQL;
- transaction/rollback behavior where state transitions are implemented;
- live construction database evidence;
- cleanup using the dedicated migrator.

## 11. Founder boundary

**Direction:** Business listing verification/eligibility is a prerequisite dependency for Review.

**Authorized now:** evidence reconciliation and this architecture contract.

**Not authorized now:** schema mutation, production changes, data migration, or Review implementation.

The next decision is the explicit reconciliation of the three Connect fields against the GHM Business ownership model, followed by a separately governed schema decision if a new field or workflow state is required.
