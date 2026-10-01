# GHM Connect Public Directory / Search Contract

**Status:** CONTRACT FROZEN — DIRECTORY/SEARCH CONSTRUCTION GATE REQUIRED  
**Connect source:** `abcffa73f893602c25310a58946bebb91fd7eeb5`  
**GHM baseline:** `0e589d57e2d7da991bfc4420ff23fe9db454248a`  
**Predecessor contract:** `GHM_CONNECT_PUBLIC_BUSINESS_DIRECTORY_CONTRACT.md`

## 1. Purpose

Define the smallest canonical GHM discovery boundary needed to reproduce the **proven** public Business directory behavior from Connect without copying provider-local fields into GHM or conflating discovery with a known-Business read.

This contract covers discovery/search semantics only. It does not authorize provider migration, production routing, shadow traffic, data backfill, new schema, or cutover.

## 2. Boundary distinction

Two operations are intentionally distinct:

```text
business.readPublic
  known Business → one public Business projection

directory.read
  discovery criteria → many publicly eligible Businesses
```

`business.readPublic` remains the canonical known-Business projection.

`directory.read` owns discovery semantics: filters, ordering, pagination, and a list projection.

The directory must consume canonical Business/Category ownership rather than create a second Business identity model.

## 3. Connect evidence reconciled

The audited Connect directory supports:

- public Business discovery
- optional text/search criteria
- category filtering
- city filtering
- supplier filtering
- tier filtering
- pagination
- featured/rating ordering
- location/map-oriented behavior

Connect also exposes provider-local Business fields such as province, city, address, coordinates, supplier status, tier, featured status, media, profile views, legal/registration data, and other presentation fields.

Only behavior whose canonical GHM ownership is proven is admitted to this first directory contract.

## 4. Directory v1 scope

Directory v1 consists of:

1. public visibility eligibility
2. optional text query
3. optional canonical category filter
4. deterministic pagination
5. deterministic ordering
6. narrow public Business projection

### 4.1 Explicitly deferred from v1

The following are **not** part of Directory v1:

- city/province filtering
- physical-address filtering
- latitude/longitude filtering
- radius/geo search
- supplier filtering
- tier filtering
- featured ordering
- media/logo/avatar fields
- profile-view ordering
- legal/registration fields
- years-in-business filtering
- provider UUIDs
- Trust/review/hour/capability composition into each directory row
- external search-engine introduction

These remain gaps or separate contracts until canonical GHM ownership and semantics are established.

## 5. Public eligibility

A directory row is eligible only when the canonical Business satisfies:

```sql
is_active = true
AND is_verified = true
AND verification_status = 'approved'
```

The directory must use the same canonical public-visibility rule established by the qualified `business.readPublic` boundary.

A Business that fails any part of this predicate is excluded from directory results.

No caller-provided visibility override exists.

## 6. Text query

Directory v1 MAY accept one optional normalized text query.

The query searches only canonical Business fields already admitted to the public projection:

- `name`
- `slug`
- `description`

The query must not search provider-local or private Business fields.

For an omitted query, all publicly eligible Businesses are candidates.

For a blank/whitespace query, behavior is equivalent to an omitted query after normalization.

The exact PostgreSQL matching mechanism is an implementation concern and must not introduce a new search provider merely to reproduce current Connect behavior.

No schema/index mutation is authorized by this contract solely for text search. If qualification demonstrates a performance requirement, that must be handled as a separately reviewed architecture change.

## 7. Category filter

Directory v1 MAY accept one canonical category identifier or slug according to the existing Business Category contract.

Category data remains owned by the existing Business Category resource.

The directory must not copy category names/slugs into `ghm.business` or create a directory-specific category table.

Category filtering means:

```text
publicly eligible Business
AND
active canonical Business Category assignment
matching the requested canonical category
```

The exact category assignment status semantics must reuse the already-qualified Business Category boundary.

If a requested category does not resolve to a canonical category, the directory returns no matching Businesses rather than inventing a category or falling back to provider data.

## 8. Pagination

Directory v1 uses explicit page-number pagination.

Contract defaults:

- default page size: **20**
- maximum page size: **50**
- requested page size must be a positive integer
- requested page number must be a positive integer
- values above the maximum page size are rejected
- invalid pagination values are rejected before repository execution

The response must make the pagination state explicit and deterministic.

Minimum response shape:

```text
{
  items: PublicDirectoryBusiness[],
  page: number,
  pageSize: number,
  total: number
}
```

`total` counts the complete result set after visibility and supplied filters but before pagination.

The implementation must not silently return an unbounded result set.

## 9. Stable ordering

Directory v1 uses one canonical deterministic ordering:

```text
rating DESC
reviewCount DESC
businessId ASC
```

The final `businessId ASC` tie-breaker is mandatory.

This ordering deliberately does **not** reproduce Connect's current featured-first ordering because no canonical GHM ownership for `is_featured` has been established.

No client-provided arbitrary sort expression is accepted.

Missing values must follow the canonical database semantics of the admitted projection; the implementation must not invent a second ranking rule.

## 10. Directory projection

Each directory item uses this narrow projection:

```text
businessId
name
slug
description
rating
reviewCount
jobsCompleted
verificationStatus
isVerified
createdAt
updatedAt
```

The shape is intentionally aligned with the qualified `business.readPublic` projection.

The directory must not expose:

- account/member identity
- ownership/membership details
- provider UUIDs
- private verification/moderation details
- Trust internals
- review bodies
- business hours
- capabilities
- provider-local directory fields

A later composed response may reference separately qualified public resources only after an explicit composition contract.

## 11. Public access

Directory discovery is a public-read boundary.

No GHM bearer token is required.

An invalid or absent GHM authentication header must not turn a public directory request into an authenticated identity lookup.

The directory must not infer authorization from provider credentials.

Public access does not bypass the canonical visibility predicate.

## 12. Operation registration

The canonical operation registry must contain:

```text
directory.read
```

This is distinct from:

```text
business.readPublic
```

The operation is read-only.

No directory create/update/delete/replace operation is introduced by this contract.

## 13. HTTP boundary

The first HTTP boundary, if construction is approved, is:

```text
GET /api/v1/public/businesses
```

Supported query parameters are limited to the contract:

```text
q
category
page
pageSize
```

No unsupported filter or sort parameter is silently accepted.

The route is public and returns the directory response shape defined above.

Known-Business public routes remain separate:

```text
GET /api/v1/public/businesses/:businessId
GET /api/v1/public/businesses/slug/:slug
```

## 14. Error semantics

Construction must preserve a deterministic distinction between:

- malformed request parameters → **400**
- valid request with no matches → **200** with an empty `items` array
- internal database/repository failure → existing GHM internal-error boundary
- unsupported filter/sort parameter → **400**

A missing category that is syntactically valid but does not resolve to a canonical category is a valid discovery request with zero matches, not a provider fallback.

## 15. Canonical ownership rules

The directory may consume:

- `ghm.business`
- canonical Business Category assignment data
- canonical review aggregate fields already maintained on Business

The directory may not become owner of:

- Business identity
- categories
- reviews
- Trust
- hours
- capabilities
- external identity mappings

No directory materialization table is required for v1.

## 16. No schema invention

This contract does not authorize:

- new Business columns
- a `business_directory` table
- a duplicate category table
- geo indexes
- search-provider infrastructure
- provider-specific projection storage
- migration of Connect Business records

Implementation must first prove that the existing canonical schema can satisfy the v1 query.

If it cannot, stop and open a separate architecture gap rather than silently changing schema.

## 17. Construction and qualification sequence

If construction proceeds:

1. Add `directory.read` to the canonical operation registry.
2. Add a dedicated directory contract/type boundary.
3. Implement a read-only repository over canonical GHM ownership.
4. Implement service-level validation for `q`, `category`, `page`, and `pageSize`.
5. Implement the public HTTP route.
6. Add focused tests for visibility, filters, pagination, ordering, projection, and malformed parameters.
7. Run live PostgreSQL qualification with temporary fixtures.
8. Verify category filtering against canonical category assignments.
9. Verify deterministic ordering and pagination across tied rows.
10. Verify no fixtures remain after rollback.
11. Run the complete GHM suite and diff-check.
12. Reconcile the exact construction delta against `main`.
13. Stop for founder verification before mainline promotion.

## 18. Explicit non-authorizations

This contract does not authorize:

- Connect production cutover
- Supabase routing changes
- shadow traffic
- provider cleanup
- business UUID mapping changes
- payment/realtime changes
- storage/media migration
- city/location schema construction
- supplier/tier construction
- featured ranking construction
- geo/radius search
- search-engine introduction
- modification of qualified Business Identity semantics
- modification of existing migration history

The next implementation slice is strictly **Directory v1** as defined here.
