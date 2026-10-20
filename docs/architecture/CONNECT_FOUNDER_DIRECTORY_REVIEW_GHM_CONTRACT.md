# Connect Founder Directory Listing Review → GHM Contract

**Status:** Contract proposal only — implementation and reviewer authority are not qualified.

## Purpose

Migrate Connect's Founder-controlled public directory listing review workflow from Supabase RPCs to GHM without changing who may submit a listing, who may decide publication, what is publicly visible, or which private registration fields may be read.

The current Connect implementation is in `supabase/migrations/20260825170000_establish_founder_directory_listing_review_workflow.sql` and the later registration-classification migration `20260825183000_establish_business_registration_classification.sql`. The current client adapter is `directoryListingReviewService` in `src/lib/lib_supabase.js`; submission is initiated from the owner business-profile editor and decisions are made in `AdminDirectoryReviewPanel.jsx`.

## Authority boundaries

- GHM is authoritative for canonical account IDs, Business IDs, active memberships, Business activation, and verification state.
- Founder directory-review authority is a dedicated allowlist/capability, independent of the general admin role.
- Do not transfer the legacy Supabase reviewer UUID to GHM by matching email, name, slug, or other heuristics. A separately approved, auditable identity mapping is required before seeding any canonical GHM reviewer.
- A Connect role such as `admin`, an account's broad GHM role, business-operator intent, or ordinary Business membership must not grant Founder review authority.
- The client may render review controls, but every submit/list/decision operation must re-check authorization server-side.

## State and public visibility

Use the canonical GHM verification vocabulary:

- `unverified`
- `under_review`
- `information_requested`
- `approved`
- `rejected`

Preserve the distinct meanings of `verification_status`, `is_verified`, and `is_active`. The existing GHM constraint requires `is_verified = true` only when status is `approved`; activation remains independent. Public directory eligibility must continue to follow GHM's existing public-directory predicate and its contract tests. Submission must never auto-approve or activate a Business.

## Required operations

### 1. Owner submission/resubmission

A versioned operation (candidate route: `POST /api/v1/businesses/:businessId/directory-review`) must:

- Require an authenticated account with active owner/administrator membership and `business.manage` authority for the exact canonical numeric Business ID.
- Reject inactive/unmanaged businesses, malformed IDs, unsupported versions, and the known test-business fixtures used by Connect.
- Require the self-declared registration classification before submission:
  - `registered`: non-empty registration number (1–120 chars) and legal name (1–200 chars).
  - `unregistered`: registration number and legal name must be absent.
- Allow submission from `unverified`, `rejected`, and `information_requested`; transition to `under_review`.
- Treat a repeated submission while already `under_review` as idempotent: no duplicate event and no duplicate notifications.
- Set `is_verified = false`, record submission time and event type, append a review event, and notify the explicit Founder reviewer set in the same transaction.

### 2. Founder queue

A versioned, paginated operation (candidate route: `GET /api/v1/admin/directory-reviews?status=under_review&limit=20&offset=0`) must:

- Require the dedicated Founder reviewer authority. General system-admin status alone is insufficient.
- Allow only documented status filters; bound `limit` to 1–100 and require a non-negative integer offset.
- Order pending work deterministically by submission time ascending (nulls last), then creation time.
- Return only the projection needed for review. Registration number and legal name are private review data and must never be included in public directory reads, saved-business projections, or ordinary owner/profile reads.
- Exclude known test-business fixtures from review queues.

### 3. Founder decision

A versioned operation (candidate route: `PATCH /api/v1/admin/directory-reviews/:businessId`) must:

- Re-check the dedicated Founder allowlist/capability at the GHM service boundary.
- Accept only `approve`, `reject`, or `request_information`.
- Require a trimmed reason of 1–1000 characters for `reject` and `request_information`; approval clears the previous reason.
- Permit decisions only from `under_review`; reject attempts to decide an already decided or otherwise ineligible Business.
- Apply these state transitions:
  - `approve` → status `approved`, `is_verified = true`.
  - `reject` → status `rejected`, `is_verified = false`.
  - `request_information` → status `information_requested`, `is_verified = false`.
- Leave `is_active` unchanged.
- Append an immutable event containing actor, from/to status, decision, reason where applicable, version, and timestamp.
- Notify the Business owner in the same transaction. Notification failure must not silently report a completed decision without the corresponding event/notification contract; the implementation must explicitly choose and test atomic rollback semantics.

### 4. Owner review presentation

A separately authorized owner/manage read (candidate route: `GET /api/v1/businesses/:businessId/directory-review-presentation`) may return the minimum fields needed for owner feedback UX, including current review status, last reviewer reason, last event type, and submission timestamp. It must require active membership and business-manage authority and must not expose the Founder queue's private registration fields.

## Data model and database requirements

- Add a canonical GHM reviewer allowlist or equivalent explicit capability, keyed by GHM account identity. No default reviewer and no implicit admin grant.
- Add an append-only review event ledger keyed to canonical Business and actor account IDs, with validated event/status vocabulary, reason length, object-shaped metadata, and indexes for Business history and queue ordering.
- Add the self-declared registration classification and private registration identity fields only after confirming canonical schema ownership and column/operation grants. The legacy contract expressly states these are declarations, not independently verified CIPC/VAT facts.
- Enforce least-privilege database grants/RLS or authorized repository transactions. Ordinary authenticated users must not read/write the reviewer allowlist, event ledger, review metadata, registration number, or legal name directly.
- Public Business/directory projections must use explicit allowlists; never use wildcard selects after adding private columns.

## Notifications

Connect's existing submission RPC notifies Founder reviewers on first submission/resubmission; a decision notifies the Business owner. The new GHM event path should use canonical membership/allowlist IDs and numeric Business metadata. The separate Connect notification inbox/realtime client migration is not a prerequisite for persisting these events, but notification delivery/read UX must remain explicitly qualified.

## Required verification

1. Migration tests for status/verification constraints, private-column grants, allowlist protection, event-ledger append-only behavior, and test-fixture exclusion.
2. Repository/service tests for owner authorization, idempotent submission, all allowed/denied transitions, reason bounds, reviewer allowlist enforcement, notification atomicity, and private-field projections.
3. HTTP tests for missing/invalid auth, invalid IDs/versions/filters/pagination, non-disclosing unauthorized selection, and request-body validation.
4. Regression tests proving public directory visibility remains gated by the existing GHM predicate and `is_active` is not modified by review decisions.
5. A verified canonical mapping for the existing Founder reviewer before any reviewer seed is enabled.
6. Deployed non-production end-to-end tests for owner submission, Founder queue, decision, owner presentation, notifications, and public visibility.

## Explicitly not authorized by this contract

- Production deployment or cutover.
- Automatic reviewer mapping by email/name or import of the legacy UUID allowlist.
- Automatic approval, activation, or verification of existing Businesses.
- Treating self-declared registration data as independently verified.
- Reusing the general admin role as Founder review authority.
- Enabling a new reviewer before the canonical GHM account mapping is separately approved.
