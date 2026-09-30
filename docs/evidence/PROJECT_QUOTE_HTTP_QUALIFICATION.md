# Project Quote HTTP Qualification

## Status

CONSTRUCTION COMPLETE — awaiting local founder-side qualification.

## Slice

Project Quote HTTP API was added without reopening the Project Quote domain/runtime.

## Covered routes

- GET /api/v1/projects/:projectId/quotes
- GET /api/v1/businesses/:businessId/project-quotes
- POST /api/v1/project-quotes
- PATCH /api/v1/project-quotes/:quoteId
- POST /api/v1/project-quotes/:quoteId/accept
- POST /api/v1/project-quotes/:quoteId/reject

## Boundary checks

- Authentication required on all protected routes.
- project_quote resource authorization and registered operation checks are explicit.
- Customer/business role narrowing is explicit at HTTP boundary.
- Create/update reject unknown and server-owned fields.
- Accept/reject are explicit operations with empty request bodies.
- IDs are positive safe integers.
- Domain repository remains authoritative for ownership, eligibility, state, and side effects.
- No payment-provider or commercial construction is included.

## Local qualification command

Run the full configured suite with `npm test` after pulling the branch. This document must only be marked fully qualified after the local result is independently verified.
