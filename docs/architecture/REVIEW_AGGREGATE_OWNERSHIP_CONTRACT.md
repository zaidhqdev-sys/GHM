# GHM Review Aggregate Ownership Contract

Status: **construction architecture contract; implementation remains gated by Business eligibility reconciliation.**

## 1. Source-of-truth finding

The authoritative Zaid Connect Reviews contract confirms that reviews are customer-authored records: `reviews.reviewer_id` references the customer/profile identity, while each review also references its target Business through `business_id`.

The current Connect schema separately stores `businesses.rating` and `businesses.review_count`. Those values are explicitly documented as protected aggregates owned by the Reviews and Trust contract, not as ordinary Business-owner-editable fields.

The aggregate is recalculated from **approved reviews only**. The canonical calculation is:

- `review_count` = count of approved reviews for the Business;
- `rating` = average rating of approved reviews, rounded to two decimal places;
- no approved reviews => `review_count = 0`, `rating = 0`.

The aggregate is synchronized when reviews are inserted, updated, or deleted where the approved state is involved.

## 2. Ownership decision for GHM

GHM should preserve the domain ownership distinction:

- `ghm.review` owns individual customer review records and their moderation lifecycle;
- the Reviews/Trust capability owns the derived Business rating aggregates;
- ordinary Business identity/profile mutation must not allow callers to write the aggregates.

This does **not** yet authorize adding `rating` or `review_count` to `ghm.business`. The physical placement remains a schema decision after the Business/Review boundary is fully reconciled.

## 3. Customer ownership

A Review is authored by an authenticated customer identity resolved through `ghm.account_identity.id`.

The customer is the owner of the authored relationship for authorization purposes, but the Review is not a standalone customer-owned profile object: it is a relationship between:

```text
customer -> Business
```

The target Business remains the recipient/domain context for the review and its derived aggregate.

## 4. Aggregate invariants

Any GHM implementation must preserve these invariants:

1. Only approved reviews contribute to public rating/count aggregates.
2. Pending and rejected reviews contribute nothing to the aggregate.
3. Aggregate values are derived, not caller-supplied.
4. Business owners cannot manually set rating/review_count through ordinary Business mutation.
5. A review moderation transition that changes approved participation must leave the aggregate consistent within the governed transaction boundary.
6. A review deletion, if deletion is ever authorized by a future explicit contract, must recalculate the affected Business aggregate. The current Review operation contract authorizes no delete.
7. Cross-Business review access must not alter another Business's aggregate.
8. Public Review visibility and aggregate eligibility must use the same canonical Business eligibility boundary.

## 5. Provider-neutral implementation boundary

Connect currently enforces these rules through PostgreSQL triggers and security-definer functions. GHM must not copy those mechanisms merely because they exist in Supabase.

GHM may implement the same capability through explicit repository/service transaction logic, database-owned derived-state mechanisms, or a separately governed projection. The chosen mechanism must have one canonical owner and must be qualified for rollback and concurrency.

## 6. Required dependency decisions

Before physical Review schema implementation, GHM must resolve:

- Business public eligibility and the relationship among `verification_status`, `is_verified`, and `is_active`;
- whether `rating` and `review_count` belong physically on `ghm.business` or in a Review-owned projection/read model;
- whether public Business reads should expose aggregate fields directly or through a dedicated projection;
- moderation authority and role semantics;
- aggregate consistency and transaction ownership.

## 7. Explicit non-goals

This contract does not create or alter tables, views, triggers, functions, grants, production data, or product traffic.

It does not authorize Review implementation yet.

## 8. Current conclusion

The Founder statement that Reviews belong to customers is consistent with the authoritative Connect schema: **customers author Reviews; Reviews target Businesses; Reviews/Trust owns the derived Business rating aggregates.**

Therefore GHM should model `reviewer_id -> ghm.account_identity.id` and `business_id -> ghm.business.id`, while keeping `rating` and `review_count` as governed derived values rather than customer- or Business-owner-editable state.

The next governed action is to reconcile the physical aggregate placement and Business eligibility boundary, then update the Review contract if that decision changes its implementation boundary.
