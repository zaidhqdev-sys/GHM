# GHM Business Listing Verification Reconciliation

Status: **construction architecture decision; first-slice reconciliation QUALIFIED / CLOSED.**

## 1. Source-of-truth finding

The authoritative Zaid Connect Business contract distinguishes three independent concepts:

- `verification_status` — verification workflow state;
- `is_verified` — verified capability/state consumed by workflows that require verified businesses;
- `is_active` — independent Business activation/publication state.

Connect's public directory requires `verification_status = 'approved'` and `is_active = true`. Review eligibility additionally requires `is_verified = true`.

The Founder directory-review workflow changes `verification_status` and `is_verified` while deliberately leaving `is_active` independent. Owners are not granted ordinary mutation authority over these governed fields.

## 2. GHM decision

GHM Business identity preserves this distinction rather than collapsing `is_verified` into `verification_status`.

The canonical Business fields include:

```text
verification_status
is_verified
is_active
```

`is_active` remains independently mutable from verification state.

The initial GHM construction vocabulary remains the existing reduced set:

```text
pending
approved
rejected
```

Connect-only workflow states such as `under_review` and `information_requested` are not copied into the first GHM slice without a separate capability decision. The first-slice invariant is:

```text
verification_status = 'approved'  =>  is_verified = true
verification_status != 'approved' =>  is_verified = false
```

The default/unverified construction state is represented by the non-approved state with `is_verified = false`; the exact provider workflow labels are not treated as GHM authorization primitives.

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

Business owners, administrators, and members must not self-approve or self-verify through ordinary Business mutation. The governed mutation path must be an explicitly authorized administrative/governance operation and must remain provider-neutral.

No provider-specific Supabase allowlist, `auth.uid()` UUID, or security-definer implementation is copied into GHM.

## 5. Verification history

The Connect source contains Founder review-event metadata. GHM does not copy those provider-specific fields merely to satisfy the Review dependency.

Verification history is a separate future capability decision. The current construction slice establishes only the canonical current state required by downstream eligibility.

## 6. Review dependency

Review creation and public Review visibility consume the canonical GHM eligibility predicate above.

Customer identity remains `ghm.account_identity.id`; Business target remains `ghm.business.id`.

The Review dependency is reconciled and qualified. It no longer blocks the first canonical Review construction slice.

## 7. Migration safety

The construction implementation established the required first-slice state without authorizing production changes:

1. `is_verified` is a distinct Business field with a safe false default;
2. the first-slice verification state remains within the reconciled GHM vocabulary;
3. `is_active` values remain independent of verification;
4. the approved/verified invariant is enforced;
5. no production data or provider changes are authorized by this decision.

## 8. Explicit non-goals

This decision does not authorize:

- production cutover;
- Supabase schema mutation;
- provider/bootstrap role cleanup;
- automatic approval or self-verification;
- a new verification-history/audit-log subsystem;
- arbitrary expansion of Connect's internal workflow vocabulary.

The GHM Review schema and aggregate boundary are already separately qualified; they are not pending dependencies of this reconciliation.

## 9. Decision

**Business verification reconciliation is CLOSED / QUALIFIED for the current construction boundary.**

The canonical first-slice eligibility contract is:

```text
Business eligible for Review/public trust
= is_active = true
  AND is_verified = true
  AND verification_status = 'approved'
```

The first-slice Review/Trust aggregate fields `rating` and `review_count` are physically stored on `ghm.business` with mutation ownership retained by the Review/Trust capability. Their placement and transaction ownership are separately reconciled and qualified.

Future verification workflow expansion, governance mutation endpoints, or history/audit capabilities require their own explicit contracts and qualification evidence.
