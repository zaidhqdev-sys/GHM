# Business Offering HTTP API Qualification

Status: PASS (construction evidence; merge gate remains founder-controlled)

## Scope

Exposes the existing canonical Business Offering service through the GHM HTTP boundary.

Included:
- anonymous public active-offering list for an approved/verified business
- authenticated business/admin offering list
- authenticated business/admin slug lookup
- business/admin create
- business/admin update
- strict request-field validation
- resource/operation registration checks
- canonical service delegation

Excluded:
- database migrations
- schema/privilege changes
- Supabase changes
- payment/provider changes
- new Business Offering domain behavior
- Connect adapter work

## Routes

- GET /api/v1/public/businesses/:businessId/offerings
- GET /api/v1/businesses/:businessId/offerings
- GET /api/v1/businesses/:businessId/offerings/:slug
- POST /api/v1/business-offerings
- PATCH /api/v1/business-offerings/:offeringId

## Authorization

Private read/create/update operations require the Business Offering resource to be registered and the caller to be an admin or business role.

The canonical service and repository remain responsible for business membership/management authorization.

Public reads require the registered `business_offering.readPublic` operation and use the canonical public service method without an authenticated context.

## Validation

HTTP parsing rejects:
- malformed/non-positive business identifiers
- unsupported request fields
- invalid offering types
- invalid field primitive types
- empty update bodies
- malformed UUID offering identifiers at the canonical service boundary

The HTTP layer does not duplicate domain ownership rules.

## Evidence

Construction branch: `construction/business-offering-http-api`

Base: `d07deb019cea2dd18316f36040d9626ca78f9754`

Tests added in `src/http/business-offering-router.test.ts` cover public access, invalid identifiers, private role gating, context/input binding, not-found handling, create/update allowlists, and customer denial.

Final qualification requires local `npm test` and `npm run build` evidence before merge.
