# GHM Business Listing Verification Reconciliation

Status: **construction architecture decision; schema migration authorized on the construction branch only.**

## 1. Source-of-truth finding

The authoritative Zaid Connect Business contract distinguishes three independent concepts:

- `verification_status` — verification workflow state;
- `is_verified` — verified capability/state consumed by workflows that require verified businesses;
- `is_active` — independent Business activation/publication state.

Connect's public directory requires `verification_status = 'approved'` and `is_active = true`. Review eligibility additionally requires `is_verified = true`.

The Founder directory-review workflow changes `verification_status` and `is_verified` while deliberately leaving `is_active` independent. Owners are not granted ordinary mutation authority over these governed fields.

## 2. GHM decision

GHM Business identity must preserve this distinction rather than collapsing `is_verified` into `verification_status`.

The canonical Business fields become:

```text
verification_status
is_verified
is_active
```

`is_active` remains independently mutable from verification state.

The initial GHM verification vocabulary is expanded to the source-of-truth workflow states:

```text
unverified
under_review
information_requested
approved
rejected
```

The default state is `unverified` and `is_verified` defaults to `false`.

## 3. Eligibility boundary

The canonical GHM public Business eligibility predicate is:

```text
verification_status = 'approved'
AND is_verified = true
AND is_active = true
```

This is intentionally the stricter predicate required by the Review/public trust boundary. A future capability may define a less restrictive read predicate only through an explicit contract; no caller may infer eligibility from a single field.

## 4. Authorization boundary

Verification state is governed Business state, not ordinary owner profile data.

Business owners, administrators, and members must not self-approve or self-verify through ordinary Business mutation. The eventual mutation path must be an explicitly authorized administrative/governance operation and must remain provider-neutral.

No provider-specific Supabase allowlist, `auth.uid()` UUID, or security-definer implementation is copied into GHM.

## 5. Verification history

The Connect source contains Founder review-event metadata. GHM does not copy those provider-specific fields merely to satisfy the Review dependency.

Verification history is a separate future capability decision. The current migration establishes only the canonical current state required by downstream eligibility.

## 6. Review dependency

Review creation and public Review visibility must consume the canonical GHM eligibility predicate above.

Customer identity remains `ghm.account_identity.id`; Business target remains `ghm.business.id`.

## 7. Migration safety

The construction migration must:

1. add `is_verified` with a safe false default;
2. map the existing construction-only `pending` state to `unverified` before replacing the constraint;
3. replace the reduced verification vocabulary with the reconciled vocabulary;
4. leave `is_active` values untouched;
5. avoid production data or provider changes.

## 8. Explicit non-goals

This decision does not authorize:

- production cutover;
- Supabase schema mutation;
- provider/bootstrap role cleanup;
- Review table creation;
- rating/review_count creation;
- verification history/audit-log creation;
- automatic approval or self-verification.

## 9. Decision

**Business verification reconciliation is CLOSED for the current construction boundary.**

The remaining Review dependency is physical placement and transaction ownership of the derived `rating` / `review_count` aggregate. The authoritative Connect implementation stores those values on `businesses` as protected Review/Trust-owned aggregates, so GHM may preserve that external shape while keeping mutation ownership with the Review/Trust capability.
