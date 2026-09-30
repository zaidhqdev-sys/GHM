# GHM Review Operation Contract

## Status

**CONSTRUCTION QUALIFICATION CONTRACT — QUALIFIED / CLOSED**

This contract reconciles the authoritative Zaid Connect Review capability into the GHM identity and Business model. The first canonical GHM Review slice has been implemented and construction-qualified.

It does **not** authorize production deployment, production database migration, provider/bootstrap mutation, product cutover, DNS/routing changes, shadow traffic, or migration of Zaid Connect or QuoteFlow.

## 1. Canonical domain concept

A **Review** is a customer-authored evaluation of a specific Business, subject to moderation before public visibility.

A Review is distinct from an Enquiry and Project. It records a customer-to-Business trust/reputation signal and moderation lifecycle.

The GHM Review slice binds to canonical GHM identities:

- reviewer → `ghm.account_identity.id`
- reviewed Business → `ghm.business.id`
- moderation authorization → canonical GHM administrator authorization

GHM does not reproduce Supabase `auth.uid()`, Supabase UUIDs, Supabase RLS policies, or security-definer functions as the authorization model.

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

The Business eligibility dependency is reconciled in GHM: `ghm.business` exposes independent `is_active` publication state plus `verification_status` and `is_verified`, with the invariant that `verification_status = 'approved'` implies `is_verified = true` and all non-approved states imply `is_verified = false`. The Review public/receive eligibility therefore maps exactly to Connect's three conditions: `is_active = true`, `is_verified = true`, and `verification_status = 'approved'`.

### Business ownership

Business ownership is determined through `ghm.business_membership`, where the target Business must not have an active `owner` membership for the authenticated reviewer. The membership model provides one active owner per Business and must be queried as a governed relationship, not supplied by the caller.

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

The unique `(business_id, reviewer_id)` invariant is a database integrity requirement and was covered by runtime qualification under concurrency.

The authorization contract does not depend on caller-supplied reviewer identity, moderation status, moderator identity, or Business ownership claims.

## 6. Moderation lifecycle

The authoritative Review moderation vocabulary is:

`pending → approved | rejected`

A pending Review has no moderator, moderation timestamp, or rejection reason.

An approved Review has a moderator and moderation timestamp and no rejection reason.

A rejected Review has a moderator, moderation timestamp, and a nonblank rejection reason.

Only pending Reviews may transition through the moderation operation. Re-moderation of an already approved or rejected Review is outside the first slice unless separately contracted.

The first slice preserves these invariants transactionally.

## 7. Public visibility

Public Review reads expose only Reviews whose moderation status is `approved` and whose target Business satisfies the canonical public-eligibility contract.

The Connect source requires all three Business conditions:

- `is_active = true`;
- `is_verified = true`;
- `verification_status = 'approved'`.

GHM represents these conditions directly on `ghm.business`; Review implementation enforces all three and does not collapse activation into verification.

Public Review reads do not expose pending or rejected Reviews.

## 8. Rating aggregate boundary

The Connect source treats Business `rating` and `review_count` as canonical aggregates calculated from **approved Reviews only**. The aggregate is recalculated when Review moderation changes the approved set.

The GHM Business schema reconciles these as physically stored Review/Trust-owned derived values on `ghm.business`:

- `rating numeric(3,2) NOT NULL DEFAULT 0`, constrained to 0–5;
- `review_count integer NOT NULL DEFAULT 0`, constrained to non-negative values.

These are not caller-supplied Business identity fields. Their mutation belongs to the Review/Trust aggregate boundary and is not exposed as ordinary Business profile mutation.

The first Review implementation maintains these canonical Business aggregates within the same transaction as the moderation transition, with qualification proving aggregate correctness.

Qualification demonstrated:

- pending Reviews do not affect public rating/count;
- approval adds exactly one approved Review to the aggregate;
- rejection does not add to the aggregate;
- moderation and aggregate mutation are transactionally consistent.

Any future authorized removal policy must separately preserve aggregate correctness; no delete operation is currently authorized.

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

The GHM implementation uses canonical snake_case database fields and maps them to the repository's established camelCase domain contracts.

The reviewer snapshot is intentionally duplicated domain data: it records the identity presentation associated with the submission and is not treated as a live mirror or authorization source.

## 10. Least privilege

The dedicated runtime role receives only privileges required by qualified Review operations.

Construction qualification demonstrated prevention of direct runtime mutation of protected Review identity/moderation fields and no runtime DELETE capability.

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

The GHM implementation uses the established `AuthContext` and authorization registry rather than duplicating role checks in ad-hoc HTTP handlers.

## 12. Transaction and concurrency boundary

The following are atomic where applicable:

- Review creation and all submission invariants that must hold at acceptance;
- duplicate-review prevention under concurrent submissions;
- moderation state transition and moderator metadata;
- approved-review aggregate maintenance.

A failed duplicate submission does not leave a partial Review or other side effect.

Rollback evidence was captured for failed create and failed moderation paths.

The authoritative Connect rollback artifact for the source migration removes the Review table, triggers, policies, functions, and grants transactionally. GHM maintains an explicit construction rollback plan for the migration it creates.

## 13. Relationship to Business Identity, Enquiry, and Project

Review depends on canonical Business Identity resources:

- `ghm.account_identity` → reviewer and moderator identities;
- `ghm.business` → reviewed Business and Review/Trust-owned aggregates;
- `ghm.business_membership` → Business ownership check where required.

Review is independent of Enquiry and Project in the first slice.

A Review does not automatically create or mutate an Enquiry or Project.

Any rule such as “a customer may review only after a completed Project” is **not** present in the authoritative Review migration and was not invented during construction.

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
- runtime DELETE.

The Connect codebase contains AI review-moderation functionality, but the authoritative database contract requires administrator authorization for moderation. AI assistance must not silently become the authorization authority.

## 15. Qualification result

The first canonical GHM Review slice is **QUALIFIED / PASS / CLOSED**.

Construction evidence demonstrated:

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
22. aggregate correctness;
23. automated repository/service/API tests covering the authorization boundary.

The qualification record establishes the Review construction boundary as closed. Future Review changes or additional operations require a separately governed contract and qualification evidence.

## 16. Construction dependency gate

The Review dependency gate is reconciled and closed for the first canonical GHM Review slice:

- **Business eligibility/verification semantics:** resolved by the reconciled `ghm.business` `is_active`, `verification_status`, and `is_verified` contract;
- **Business owner lookup:** resolved through `ghm.business_membership`, using the active `owner` relationship;
- **administrator authorization:** resolved through the established canonical `AuthContext.role = 'admin'` boundary; Business membership does not confer moderation authority;
- **Business rating/review count:** resolved as Review/Trust-owned derived fields physically stored on `ghm.business`;
- **public Review projection:** implemented as the explicitly governed public Review read boundary; no raw table wildcard is authorized.

The dependency gate no longer blocks the qualified first-slice Review implementation.

## 17. Founder boundary

**REVIEW DIRECTION: APPROVED**

**REVIEW CONTRACT: QUALIFIED / CLOSED FOR THE FIRST CANONICAL CONSTRUCTION SLICE**

**REVIEW SCHEMA AND RESOURCE IMPLEMENTATION: QUALIFIED / PASS**

This closure remains construction-only. Production deployment and product cutover remain separately gated.
