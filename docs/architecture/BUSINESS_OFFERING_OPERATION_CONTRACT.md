# GHM Business Offering Operation Contract

**Status:** QUALIFIED / CLOSED — construction qualification passed 2026-10-01
**Source:** Zaid Connect commit `abcffa73f893602c25310a58946bebb91fd7eeb5`
**Scope:** Business offerings only

## 1. Purpose

Define the GHM-owned boundary for a Business's products, services, and solutions as evidenced by the current Connect implementation.

This resource represents Business-owned commercial offering information. It is not a catalogue taxonomy, capability assertion, recommendation, ranking, matching, verification, or payment system.

## 2. Canonical resource

Canonical resource:

```text
business_offering
```

Canonical relation:

```text
ghm.business_offering
```

Parent resource:

```text
ghm.business
```

The existing `ghm.business_capability` and `ghm.capability` resources remain separate and are not reopened by this contract.

## 3. Source reconciliation

Connect establishes `business_offerings` as a Business-scoped relation with these operations:

- list offerings for a Business, optionally active-only;
- retrieve one offering by Business + slug;
- create an offering;
- update an offering;
- deactivate an offering.

Connect's source migration establishes:

- `offering_type` values `service`, `product`, `solution`;
- required `name` and normalized `slug`;
- optional `description`;
- optional non-negative `price_amount`;
- three-letter uppercase `currency_code`, default `ZAR`;
- optional `price_unit`;
- `is_active`, default true;
- non-negative `sort_order`, default 0;
- `created_by`, `created_at`, and `updated_at`;
- unique `(business_id, slug)`;
- indexes supporting Business active ordering and type/active filtering.

Connect authorization permits public reads of active offerings belonging to active, approved Businesses. Managed reads require Business read permission. Managed create/update/delete require Business management permission.

GHM must preserve these business semantics while using GHM-owned identifiers and authorization. Connect UUIDs and Supabase Auth identities are not accepted as GHM identifiers.

## 4. Typed identifiers

Initial GHM identifiers:

```text
BusinessOfferingId = uuid
BusinessId = bigint
AccountId = bigint
```

No provider-specific identifiers are accepted at the GHM boundary.

## 5. Persisted fields

The canonical GHM offering contains:

```text
id
business_id
offering_type
name
slug
description
price_amount
currency_code
price_unit
is_active
sort_order
created_by
created_at
updated_at
```

Field rules:

### offering_type

```text
service
product
solution
```

### name

- required;
- trimmed;
- length 1–160 characters.

### slug

- required;
- length 1–120 characters;
- lowercase;
- ASCII slug format: `^[a-z0-9]+(?:-[a-z0-9]+)*$`;
- unique within a Business.

### description

- optional;
- when supplied, trimmed;
- length 1–4000 characters.

### price_amount

- optional;
- when supplied, numeric and >= 0.

### currency_code

- required;
- default `ZAR`;
- exactly three uppercase alphabetic characters.

### price_unit

- optional;
- when supplied, trimmed;
- length 1–80 characters.

### is_active

- required;
- default true.

### sort_order

- required;
- default 0;
- integer >= 0.

### provenance/timestamps

- `created_by` is derived from authenticated context;
- `created_at` and `updated_at` are database-managed;
- caller-supplied provenance is not authoritative.

## 6. Operations

Initial operation vocabulary:

| Resource | Operation | Purpose |
|---|---|---|
| `business_offering` | `read` | Read offerings through an authorized Business context. |
| `business_offering` | `readPublic` | Read active offerings for an active, approved Business. |
| `business_offering` | `create` | Create an offering for a Business under management authority. |
| `business_offering` | `update` | Update an existing offering under management authority. |
| `business_offering` | `delete` | Not exposed; deactivation is the lifecycle operation. |

Deactivation is represented by the existing `update` operation setting `is_active = false`; it is not a physical delete.

No standalone public HTTP route is authorized by this contract.

## 7. Read contract

### Managed read

The caller must have an active relationship to the Business through the canonical GHM membership model and the operation must be authorized as `business_offering.read`.

Managed reads may include inactive offerings.

### Public read

Public read returns only active offerings belonging to a Business that is:

- active; and
- approved under the canonical public Business disclosure boundary.

Public read must not expose inactive offerings.

The public disclosure predicate is evaluated from canonical GHM Business state. It must not trust caller-supplied approval or activity flags.

Public offering discovery does not authorize arbitrary Business directory search, ranking, recommendation, or matching.

## 8. Create contract

Creation requires:

1. authenticated `AuthContext`;
2. canonical Business existence;
3. active Business membership with management authority;
4. valid offering input;
5. an active management authorization decision for the Business.

The service derives `created_by` from the authenticated context.

The caller cannot establish or override:

- `business_id` outside the authorized target;
- `created_by`;
- `created_at`;
- `updated_at`.

The database unique constraint is authoritative for duplicate `(business_id, slug)` prevention.

## 9. Update contract

Update requires active Business management authority for the Business owning the target offering.

The service must resolve the target offering before applying the mutation and must prevent cross-Business mutation.

Mutable fields are limited to:

```text
offering_type
name
slug
description
price_amount
currency_code
price_unit
is_active
sort_order
```

The following are never caller-controlled:

```text
id
business_id
created_by
created_at
updated_at
```

An update that changes `slug` must continue to satisfy the Business-scoped uniqueness constraint.

Deactivation is an update to `is_active = false`.

Reactivation is not separately authorized; if supported by the implementation it remains subject to the same management update boundary and must not bypass the lifecycle contract.

## 10. Lifecycle boundary

This slice authorizes only the source-evidenced active/inactive state.

It does not authorize:

- hard deletion;
- offering approval or verification;
- offering reviews;
- offering inventory;
- stock management;
- booking;
- checkout;
- payment processing;
- subscriptions;
- provider synchronization;
- recommendation/ranking;
- matching;
- AI classification;
- automatic offering generation;
- product cutover.

## 11. Authorization

Authorization is evaluated from authenticated GHM context and canonical Business membership.

Management authority uses the established GHM Business management boundary (owner/administrator).

The service must not infer authority from:

- caller-supplied roles;
- Connect claims;
- Supabase JWTs;
- `created_by`;
- Business identity fields;
- offering contents.

Public reads use the canonical public Business disclosure boundary.

## 12. Repository contract

The typed repository surface is equivalent to:

```text
listBusinessOfferings(context, input)
getBusinessOfferingBySlug(context, businessId, slug)
createBusinessOffering(context, input)
updateBusinessOffering(context, offeringId, input)
```

Repository implementations must:

- use explicit `ghm.*` identifiers;
- use parameterized values;
- use governed transaction/auth context;
- enforce Business scoping;
- never expose arbitrary SQL/table operations.

A dedicated `deactivateBusinessOffering` method may exist internally only if it preserves the same governed update boundary; it does not create a new public operation.

## 13. Service responsibilities

The service owns:

- typed input validation;
- authorization orchestration;
- Business scoping;
- stable domain errors;
- lifecycle validation;
- duplicate/concurrency handling.

The service must not:

- accept provider identifiers;
- trust caller-controlled provenance;
- bypass registry authorization;
- perform payment operations;
- perform matching or ranking;
- expose generic SQL;
- copy Connect RLS implementation details.

## 14. Error boundary

At minimum, distinguish:

- authentication required;
- Business access denied;
- Business not found / not accessible;
- offering not found;
- offering not publicly visible;
- invalid offering type;
- invalid name;
- invalid slug;
- invalid description;
- invalid price;
- invalid currency code;
- invalid price unit;
- invalid sort order;
- duplicate offering slug;
- cross-Business mutation denied;
- unsupported mutation;
- transaction failure.

Errors must not disclose unrelated Business or offering existence where the caller lacks authority.

## 15. Concurrency

The database is authoritative for unique `(business_id, slug)`.

Qualification must demonstrate that concurrent creation or slug-changing updates cannot leave duplicate Business-scoped slugs.

Business-scoped update authorization must remain bound to the target row's canonical Business.

## 16. Runtime privilege boundary

Runtime database grants must expose only the operations required by the qualified resource.

No generic table/query privilege is permitted.

The runtime role must not receive category-administration, provider, payment, or unrelated mutation privileges merely because those concepts coexist in the product.

## 17. HTTP boundary

This contract does not authorize a standalone public Business Offering HTTP API.

Resource registration may support internal qualification only. Any public HTTP exposure requires a separate authorization decision and an explicit HTTP contract.

## 18. Qualification requirements

Before this slice is construction-qualified, evidence must demonstrate:

1. authenticated managed read is enforced;
2. public read returns only active offerings of active, approved Businesses;
3. inactive offerings are excluded from public reads;
4. create requires Business management authority;
5. caller-controlled `created_by` is ignored/rejected;
6. Business ownership/scoping cannot be crossed;
7. offering type validation is enforced;
8. name/description bounds are enforced;
9. slug normalization and bounds are enforced;
10. price validation is enforced;
11. currency validation is enforced;
12. price-unit bounds are enforced;
13. sort-order validation is enforced;
14. duplicate Business-scoped slugs are rejected;
15. concurrent duplicate/slug-change operations are safe;
16. update cannot alter immutable/provenance fields;
17. deactivation is retained rather than deleted;
18. runtime DELETE is denied;
19. provider-specific identifiers are rejected;
20. Supabase JWTs are not accepted as GHM authentication;
21. runtime grants match the operation surface;
22. build, tests, and diff checks pass;
23. previously qualified GHM capabilities remain green;
24. architecture/readiness/evidence/handover documentation is reconciled to the resulting implementation.

## 19. Qualification result

**Status:** QUALIFIED / PASS / CLOSED for the GHM Business Offering construction slice.

The implementation was reconciled onto current GHM mainline and independently qualified against live PostgreSQL using the dedicated runtime and migrator identities.

Qualification evidence:

```text
RUNTIME IDENTITY PASS: ghm_db/ghm_runtime
CLEANUP AUTHORITY PASS: ghm_db/ghm_migrator
OUTSIDER READ REJECTION PASS
CUSTOMER READ REJECTION PASS
NON-MANAGEMENT CREATE REJECTION PASS
OUTSIDER CREATE REJECTION PASS
MANAGEMENT CREATE + SERVER PROVENANCE PASS
AUTHORIZED MEMBER READ PASS
SLUG LOOKUP PASS
NON-MANAGEMENT UPDATE REJECTION PASS
MANAGEMENT UPDATE + IMMUTABLE FIELD INVARIANT PASS
ACTIVE FILTER + DEACTIVATION PASS
PUBLIC INACTIVE FILTER PASS
CONCURRENT DUPLICATE SLUG INVARIANT PASS
RUNTIME DIRECT INSERT + UPDATE GRANT PASS
RUNTIME DELETE DENIAL PASS
RUNTIME PRIVILEGE PASS: SELECT=yes permitted INSERT/UPDATE columns=yes immutable UPDATE=no DELETE=no
GHM BUSINESS OFFERING RUNTIME QUALIFICATION: PASS
```

The qualification covers managed/public authorization, canonical Business public visibility, server-derived provenance, validation, Business scoping, lifecycle deactivation, concurrency, least-privilege runtime grants, and delete denial. It does not authorize a public HTTP API, Connect cutover, provider migration, or any capability listed in the lifecycle non-authorizations.

## 20. Construction sequence

```text
migration
  -> typed contracts
  -> repository
  -> service
  -> registry
  -> qualification tests
  -> runtime privilege qualification
  -> documentation reconciliation
```

No Connect schema mutation, production migration, product cutover, shadow traffic, or Supabase provider cleanup is authorized by this contract.

## 21. Explicit founder gate

This contract records the founder authorization expressed on 2026-09-30 by proceeding after the evidence-backed Business Offering source audit.

The original construction authorization was limited to the Business Offering boundary defined here. The resulting qualification closes this construction slice; it does not authorize Business Capability lifecycle/evidence, public Business directory expansion, commercial payment operations, Project↔Opportunity atomic workflows, directory founder-review workflows, or production cutover.
