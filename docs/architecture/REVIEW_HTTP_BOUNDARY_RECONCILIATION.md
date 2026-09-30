# Review HTTP Boundary Reconciliation

## Status
Construction artifact — not merged.

## Audit basis
The Review HTTP surface was audited against the canonical Review contracts, service, repository boundary, resource registry, authorization model, and existing HTTP router patterns on `construction/support-request-http-api`.

## Canonical service boundary
The Review service exposes exactly:
- `createReview(context, input)`
- `getOwnReview(context, reviewId)`
- `getPublicReviews(businessId, limit?)`
- `getPendingReviews(context, limit?)`
- `moderateReview(context, reviewId, input)`

The service itself enforces:
- customer role for creation and own-review reads;
- admin role for pending-review reads and moderation;
- rating 1–5;
- title 3–120 characters;
- body 10–2000 characters;
- moderation decisions `approved` or `rejected`;
- rejection reason required for rejection and bounded to 1–2000 characters;
- limits bounded to 100.

## HTTP boundary
Routes constructed:
- `GET /api/v1/public/reviews?businessId=&limit=`
- `GET /api/v1/reviews?limit=` — admin pending reviews
- `POST /api/v1/reviews` — customer creation
- `GET /api/v1/reviews/:reviewId` — customer own review
- `PATCH /api/v1/reviews/:reviewId/moderation` — admin moderation

The HTTP layer deliberately does not expose:
- arbitrary review field updates;
- reviewer identity mutation;
- moderation metadata mutation;
- direct moderation-status writes;
- deletion;
- arbitrary role selection;
- provider/payment integration.

## Authorization
Public reads require the registered `review.readPublic` operation but no bearer identity.

Authenticated routes require both:
1. the expected role for the operation; and
2. registered Review operation access plus the existing resource authorization boundary.

Moderation accepts only the canonical decision/rejection-reason shape. The route does not let callers choose `moderatedBy`, `moderatedAt`, or moderation status directly.

## Important boundary decision
The registry contains separate `approve` and `reject` operations. The moderation HTTP surface is one endpoint because the canonical service has one `moderateReview` method. The router validates the decision and additionally confirms the corresponding registered operation before delegation.

## Scope
This is an HTTP exposure of an already-qualified Review domain. It does not reopen or alter the Review domain model, repository, schema, or authorization design.

## Deferred
No changes are made here to commercial/provider verification, Contact Access, or Enquiry disclosure/redaction.
