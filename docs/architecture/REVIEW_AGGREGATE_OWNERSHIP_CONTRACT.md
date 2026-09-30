# GHM Review Aggregate Ownership Contract

Status: **construction architecture contract; aggregate placement and first Review qualification are CLOSED / PASS.**

## 1. Source-of-truth finding

The authoritative Zaid Connect Reviews contract confirms that reviews are customer-authored records: `reviews.reviewer_id` references the customer/profile identity, while each Review references its target Business through `business_id`.

Connect separately stores `businesses.rating` and `businesses.review_count`. Those values are protected aggregates owned by the Reviews and Trust contract, not ordinary Business-owner-editable fields.

The aggregate is recalculated from **approved Reviews only**:

- `review_count` = count of approved Reviews for the Business;
- `rating` = average rating of approved Reviews, rounded to two decimal places;
- no approved Reviews => `review_count = 0`, `rating = 0`.

## 2. GHM ownership and physical placement decision

GHM preserves the source-of-truth shape while separating physical placement from mutation ownership:

- `ghm.review` owns individual customer Review records and their moderation lifecycle;
- Reviews/Trust owns the derived Business rating aggregates;
- `ghm.business.rating` and `ghm.business.review_count` are physically stored on Business because they are Business-facing derived state used by public Business discovery;
- ordinary Business identity/profile mutation must never allow callers to write these aggregates.

The aggregate columns are therefore **Business-resident but Review/Trust-owned**.

## 3. Customer ownership

A Review is authored by an authenticated customer identity resolved through `ghm.account_identity.id`.

The customer owns the authored relationship for authorization purposes, but the Review is a relationship between:

```text
customer -> Business
```

The target Business remains the recipient/domain context for the Review and its derived aggregate.

## 4. Aggregate invariants

1. Only approved Reviews contribute to public rating/count aggregates.
2. Pending and rejected Reviews contribute nothing to the aggregate.
3. Aggregate values are derived, not caller-supplied.
4. Business owners cannot manually set `rating`/`review_count` through ordinary Business mutation.
5. A moderation transition that changes approved participation must leave the aggregate consistent within the governed transaction boundary.
6. A Review deletion, if deletion is ever authorized by a future explicit contract, must recalculate the affected Business aggregate. The current Review operation contract authorizes no delete.
7. Cross-Business Review access must not alter another Business's aggregate.
8. Public Review visibility and aggregate eligibility must use the same canonical Business eligibility boundary.

## 5. Provider-neutral implementation boundary

Connect currently enforces these rules through PostgreSQL triggers and security-definer functions. GHM must not copy those mechanisms merely because they exist in Supabase.

GHM implements the capability through explicit repository/service transaction logic and governed database state. The implementation has been qualified for rollback, authorization, concurrency, and aggregate correctness.

## 6. Dependency status

Resolved and qualified:

- Business verification state distinction: `verification_status`, `is_verified`, `is_active`;
- canonical strict eligibility for Review/public trust: approved + verified + active;
- physical aggregate placement: `ghm.business.rating` and `ghm.business.review_count`;
- aggregate mutation ownership: Reviews/Trust capability, not Business owner/profile mutation;
- canonical administrator/moderation authorization;
- Review moderation transaction boundary;
- public Review visibility boundary.

The Review implementation and aggregate reconciliation are **CLOSED / PASS** for the construction slice.

Future Trust Score behavior, additional public projection fields, deletion policy, and product adapters remain separately governed work.

## 7. Explicit non-goals

This contract does not authorize production cutover, Supabase mutation, provider/bootstrap cleanup, product adapters, shadow traffic, or controlled migration/cutover.

## 8. Current conclusion

**Customers author Reviews; Reviews target Businesses; Reviews/Trust owns the derived aggregates; the aggregates physically reside on `ghm.business` as protected derived state.**

The first Review slice, including aggregate reconciliation, is qualified for construction. This closes the aggregate-placement dependency for the current GHM Review capability.
