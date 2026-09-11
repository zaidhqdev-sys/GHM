# GHM Review Operation Contract

## Status

**CONSTRUCTION QUALIFICATION CONTRACT — AUTHORIZED**

This contract reconciles the authoritative Zaid Connect Review capability into the GHM identity and Business model. It authorizes construction qualification only.

It does **not** authorize production deployment, production database migration, provider/bootstrap mutation, product cutover, DNS/routing changes, shadow traffic, or migration of Zaid Connect or QuoteFlow.

## 1. Canonical domain concept

A **Review** is a customer-authored evaluation of a specific Business, subject to moderation before public visibility.

A Review is distinct from an Enquiry and Project. It records a customer-to-Business trust/reputation signal and moderation lifecycle.

The GHM Review slice must bind to canonical GHM identities:

- reviewer → `ghm.account_identity.id`
- reviewed Business → `ghm.business.id`
- moderation authorization → canonical GHM administrator authorization

GHM must not reproduce Supabase `auth.uid()`, Supabase UUIDs, Supabase RLS policies, or security-definer functions as the authorization model.

## 2. Source-of-truth reconciliation

The authoritative Zaid Connect migration `20260718233401_establish_reviews_and_rating_integrity.sql` establishes these responsibilities:

- customer reviews are bound to a Business and reviewer identity;
- reviewer display identity is captured as a snapshot (`reviewer_name`);
- rating is an integer from 1 through 5;
- title and body have explicit length constraints;
- review moderation states are `pending`, `approved`, and `rejected`;
- rejected reviews require a moderation reason;
- approved reviews are publicly visible only for active, verified, approved Businesses;
- reviewers may see their own reviews;
- administrators may moderate reviews;
- one reviewer may submit at most one review for a Business;
- Business owners cannot review their own Business;
- only active, verified, approved Businesses may receive reviews;
- approved-review aggregates maintain Business `rating` and `review_count`;
- moderation is atomic and only pending reviews may be moderated.

The Connect implementation uses Supabase-specific triggers, RLS, RPC/security-definer functions, `auth.uid()`, `profiles.role`, and Business ownership fields. These mechanisms are source evidence, not GHM implementation requirements.

## 3. Minimum first-slice identity contract

### Reviewer

The authenticated reviewer is the `account_identity.id` carried by `AuthContext.userId`.

`reviewer_name` is a submission-time snapshot. It is not the authorization principal and must not replace `reviewer_id`.

Only an authenticated account with canonical role `customer` may submit a Review in the first slice.

### Reviewed Business

The reviewed Business is the canonical `business.id` relation.

The Business must be eligible under the GHM Business contract: active and approved. The authoritative Connect contract also requires verified/approved verification semantics; because the current GHM Business schema exposes `verification_status` and `is_active` but does not yet expose the full Connect verification vocabulary, the exact mapping must be reconciled before schema implementation rather than guessed.

### Moderator

Only an authenticated canonical `admin` account may approve or reject Reviews.

Business membership roles (`owner`, `administrator`, `member`) do not by themselves grant moderation authority.

## 4. First-slice operations

The construction Review contract is limited to these operations:

| Operation | Actor | Authorization | Result |
| --- | --- | --- | --- |
| `review.create` | authenticated customer | customer identity is `context.userId`; target Business eligible; reviewer is not target Business owner | creates a `pending` Review |
| `review.readOwn` | authenticated customer | `reviewer_id = context.userId` | reads only Reviews submitted by that customer |
| `review.readPublic` | anonymous or authenticated caller | Review is `approved` and target Business is eligible for public visibility | reads approved public Reviews only |
| `review.readPending` | authenticated admin | canonical administrator authorization | reads pending Reviews for moderation |
| `review.approve` | authenticated admin | canonical administrator authorization; target Review is pending | atomically approves Review and updates Business aggregate |
| `review.reject` | authenticated admin | canonical administrator authorization; target Review is pending; rejection reason supplied | atomically rejects Review and records moderator/reason |

No anonymous create operation exists.

A customer cannot read another customer's pending/own-only Review.

A Business owner or member does not receive moderation authority merely from Business membership.

No first-slice Review operation grants delete authority.

## 5. Submission invariants

A create operation must establish all of the following before the Review is accepted:

1. the caller is authenticated;
2. `reviewer_id` is the caller's canonical GHM account identity;
3. the caller has canonical role `customer`;
4. the target Business exists;
5. the target Business is eligible to receive Reviews;
6. the reviewer is not the target Business's active owner;
7. the reviewer has not already submitted a Review for that Business;
8. the reviewer name snapshot is derived from the authenticated identity context or canonical account record, not trusted from an arbitrary authorization claim;
9. rating is between 1 and 5;
10. title is 3–120 characters after trim;
11. body is 10–2000 characters after trim;
12. initial moderation status is `pending`;
13. moderation fields are initially unset.

The unique `(business_id, reviewer_id)` invariant is a database integrity requirement and must also be covered by runtime qualification under concurrency.

The authorization contract must not depend on caller-supplied reviewer identity, moderation status, moderator identity, or Business ownership claims.

## 6. Moderation lifecycle

The authoritative Review moderation vocabulary is:

`pending → approved | rejected`

A pending Review has no moderator, moderation timestamp, or rejection reason.

An approved Review has a moderator and moderation timestamp and no rejection reason.

A rejected Review has a moderator, moderation timestamp, and a nonblank rejection reason.

Only pending Reviews may transition through the moderation operation. Re-moderation of an already approved or rejected Review is outside the first slice unless separately contracted.

The first slice must preserve these invariants transactionally.

## 7. Public visibility

Public Review reads must expose only Reviews whose moderation status is `approved` and whose target Business satisfies the canonical public-eligibility contract.

The Connect source requires all three Business conditions:

- `is_active = true`;
- `is_verified = true`;
- `verification_status = 'approved'`.

GHM must not silently invent a replacement verification model. If the existing GHM Business contract cannot represent the same eligibility semantics, schema reconciliation is required before Review implementation is authorized.

Public Review reads must not expose pending or rejected Reviews.

## 8. Rating aggregate boundary

The Connect source treats Business `rating` and `review_count` as canonical aggregates calculated from **approved Reviews only**. The aggregate is recalculated when Review moderation changes the approved set.

For GHM construction, this establishes a required capability boundary but does **not** yet authorize adding rating columns to `ghm.business` or implementing aggregate mutation.

Before schema implementation, GHM must reconcile whether Business rating/review count belongs in the canonical Business resource, a projection, or a separately governed aggregate capability. No duplicate Business rating concept may be introduced merely to reproduce the Supabase table shape.

If an aggregate is implemented, qualification must demonstrate:

- pending Reviews do not affect public rating/count;
- approval adds exactly one approved Review to the aggregate;
- rejection does not add to the aggregate;
- any later authorized removal policy preserves aggregate correctness;
- moderation and aggregate mutation are transactionally consistent.

## 9. Data boundary

The minimum Review data boundary evidenced by Connect is:

- Review identifier;
- reviewed Business identifier;
- reviewer account identifier;
- reviewer name snapshot;
- rating;
- title;
- body;
- moderation status;
- moderation reason;
- moderator account identifier;
- moderation timestamp;
- created timestamp;
- updated timestamp.

The GHM implementation must use canonical snake_case database fields and map them to the repository's established camelCase domain contracts.

The reviewer snapshot is intentionally duplicated domain data: it records the identity presentation associated with the submission and must not be treated as a live mirror or authorization source.

## 10. Least privilege

The dedicated runtime role must receive only privileges required by qualified Review operations.

At minimum, construction must avoid blanket table DML and must prevent direct runtime mutation of:

- reviewer identity;
- reviewed Business identity;
- reviewer snapshot;
- moderation status except through the qualified moderation repository path;
- moderator identity;
- moderation timestamp;
- moderation reason except through the qualified moderation path.

Column-level PostgreSQL grants may be used where they improve the boundary, but table-wide privilege checks must not be mistaken for evidence of column-level privilege correctness.

Service/repository authorization remains mandatory even when database privileges permit a column operation.

No runtime DELETE privilege is authorized by this contract.

## 11. Authorization boundary

Authorization is relationship- and operation-specific:

- `customer` authorizes submission and own-read, not arbitrary Review access;
- `admin` authorizes moderation, not arbitrary mutation of Business identity;
- public/anonymous callers may read only the approved public projection;
- Business membership does not implicitly grant moderation authority;
- caller-supplied reviewer or moderator IDs are never trusted as authorization proof.

The GHM implementation must use the established `AuthContext` and authorization registry rather than duplicating role checks in ad-hoc HTTP handlers.

## 12. Transaction and concurrency boundary

The following must be atomic where applicable:

- Review creation and all submission invariants that must hold at acceptance;
- duplicate-review prevention under concurrent submissions;
- moderation state transition and moderator metadata;
- approved-review aggregate maintenance if the aggregate is implemented in the first slice.

A failed duplicate submission must not leave a partial Review or other side effect.

Rollback evidence is required for failed create and failed moderation paths.

The authoritative Connect rollback artifact for the source migration removes the Review table, triggers, policies, functions, and grants transactionally. GHM must maintain an equivalent explicit construction rollback plan for any migration it creates.

## 13. Relationship to Business Identity, Enquiry, and Project

Review depends on canonical Business Identity resources:

- `ghm.account_identity` → reviewer and moderator identities;
- `ghm.business` → reviewed Business;
- `ghm.business_membership` → Business ownership check where required.

Review is independent of Enquiry and Project in the first slice.

A Review must not automatically create or mutate an Enquiry or Project.

Any rule such as “a customer may review only after a completed Project” is **not** present in the authoritative Review migration and must not be invented during construction.

## 14. Explicitly out of scope

The first Review qualification does not implement or authorize:

- Supabase `auth.uid()` or RLS replication;
- provider-specific security-definer functions;
- automatic review eligibility derived from Projects, Enquiries, quotes, payments, or completed work;
- notifications;
- realtime messaging;
- AI moderation as an authorization gate;
- automated retention/anonymisation;
- public Business profile UI changes;
- Trust Score recalculation unless separately reconciled;
- product data migration;
- production provider migration;
- production data migration;
- DNS/routing/cutover changes;
- runtime DELETE;
- schema changes to Business rating fields before the aggregate boundary is reconciled.

The Connect codebase contains AI review-moderation functionality, but the authoritative database contract requires administrator authorization for moderation. AI assistance must not silently become the authorization authority.

## 15. Qualification gate

Before a GHM Review schema or runtime implementation is considered qualified, construction must demonstrate:

1. exact reviewer identity binding to `account_identity`;
2. exact reviewed Business binding to `business`;
3. customer-only create authorization;
4. own-read isolation;
5. public approved-review visibility only;
6. administrator-only moderation;
7. own-Business review denial;
8. target Business eligibility enforcement;
9. duplicate-review prevention under concurrency;
10. reviewer snapshot persistence;
11. rating/title/body validation;
12. pending/approved/rejected state invariants;
13. rejection-reason requirement;
14. moderator identity binding;
15. moderation timestamp integrity;
16. recipient/public visibility isolation;
17. no runtime delete capability;
18. least-privilege runtime grants;
19. live qualification using the dedicated `ghm_runtime` identity;
20. cleanup using the dedicated `ghm_migrator` authority;
21. rollback evidence for failed create/moderation paths;
22. aggregate correctness if Business rating/count is included in the first slice;
23. automated repository/service/API tests covering the authorization boundary.

A schema existing in PostgreSQL is not sufficient evidence of qualification.

## 16. Construction dependency gate

Before creating `ghm.review`, the following existing GHM contracts must be reconciled against this Review contract:

- canonical Business eligibility/verification semantics;
- Business owner lookup through `business_membership`;
- administrator authorization semantics;
- whether Business rating and review count are canonical Business fields or a separate projection/aggregate capability;
- public Review projection shape and column exposure.

Until those dependencies are resolved, Review schema creation is intentionally blocked.

## 17. Founder boundary

**REVIEW DIRECTION: APPROVED**

**REVIEW CONTRACT: AUTHORIZED FOR CONSTRUCTION QUALIFICATION**

**REVIEW SCHEMA IMPLEMENTATION: BLOCKED UNTIL THE DEPENDENCY GATE IN SECTION 16 IS RECONCILED**

This authorization remains construction-only. Production deployment and product cutover remain separately gated.
