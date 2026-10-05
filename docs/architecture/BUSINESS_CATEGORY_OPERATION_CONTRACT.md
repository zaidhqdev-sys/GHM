# GHM Business Category Boundary Contract

**Status:** QUALIFIED — tenant adoption qualified 2026-10-05  
**Source:** Zaid Connect commit `abcffa73f893602c25310a58946bebb91fd7eeb5`  
**Scope:** Business category taxonomy + Business category assignment only

## 1. Purpose

Define the GHM-owned boundary for the Connect business-category model without copying Supabase/RLS implementation details.

The resource represents:
1. a governed category taxonomy; and
2. a Business's assignment of one or more categories, with at most one primary category.

This boundary is classification data. It is not recommendation, ranking, matching, verification, endorsement, or AI inference.

## 2. Canonical resources

```text
business_category
business_category_assignment
```

Canonical relations:

```text
ghm.business_category
ghm.business_category_assignment
```

Parent resource:

```text
ghm.business
```

The existing `ghm.business_capability` resource remains a separate qualified resource and is not reopened by this contract.

## 3. Source reconciliation

Connect source evidence establishes:

- `business_categories` as the hierarchical category catalogue;
- `business_category_assignments` as the canonical Business/category relationship;
- unique `(business_id, category_id)`;
- at most one primary assignment per Business;
- active-category selection;
- a governed primary-category operation;
- compatibility synchronization of the legacy Business category field.

GHM must preserve these business semantics while using GHM-owned identifiers and authorization.

Connect UUIDs and Supabase Auth identities are not accepted as GHM identifiers.

## 4. Category taxonomy

The canonical GHM category contains:

```text
id
parent_id
name
slug
description
is_active
sort_order
created_at
updated_at
```

Identifiers are GHM-owned UUIDs.

Rules:

- `id` is unique;
- `slug` is unique and normalized;
- `parent_id` may be null;
- a category cannot parent itself;
- inactive categories are not selectable for new Business assignments;
- taxonomy reads are read-only in this construction slice;
- category administration/mutation is not authorized.

Hierarchy traversal must remain bounded by the resource contract and must not become arbitrary graph traversal.

## 5. Category assignment

The canonical assignment contains:

```text
id
business_id
category_id
is_primary
created_by
created_at
updated_at
```

Rules:

- `business_id` references a canonical GHM Business;
- `category_id` references a canonical GHM category;
- `(business_id, category_id)` is unique;
- at most one assignment for a Business may have `is_primary = true`;
- `created_by` is derived from authenticated context;
- caller-supplied provenance is not authoritative;
- assignments are retained unless a separately qualified lifecycle contract authorizes removal.

## 6. Operations

Initial operation vocabulary:

| Resource | Operation | Purpose |
|---|---|---|
| `business_category` | read | Read active/selectable taxonomy data |
| `business_category_assignment` | read | Read assignments for an authorized Business context |
| `business_category_assignment` | create | Assign an active category to an authorized Business |
| `business_category_assignment` | update-primary | Establish which existing assignment is primary |
| `business_category_assignment` | delete | Not authorized in this construction slice |

No public HTTP route is authorized by this contract.

## 7. Authorization

### Category read

Category taxonomy is governed reference data.

The initial resource may expose read access to authenticated contexts through the GHM resource boundary. Public directory exposure is not authorized by this contract.

### Assignment read

The caller must have an active relationship to the Business through the canonical GHM membership model. Tenant resolution is canonical and is performed on the same PostgreSQL transaction client as protected assignment work; cross-Business access is denied.

### Assignment create / primary transition

The caller must have Business management authority.

For this slice, Business management authority means an active membership with the canonical management roles already established by GHM: owner or administrator.

Authorization is evaluated from the authenticated `AuthContext` and canonical Business membership. The caller cannot rebind the resolved tenant through mutation input. It must not be inferred from Connect claims, Supabase JWTs, caller-supplied roles, or assignment fields.

## 8. Primary-category transition

The source Connect operation `set_primary_business_category` establishes a single primary category. GHM's construction slice requires the target category to have an existing assignment; assignment creation remains the separate `create` operation.

GHM must implement this as a transactionally governed operation:

1. authenticate the caller;
2. authorize Business management authority;
3. validate the Business;
4. validate the target category exists and is active/selectable;
5. validate that the target assignment already exists;
6. clear any existing primary assignment for that Business;
7. set the target assignment as primary;
8. commit atomically.

The database must enforce the at-most-one-primary invariant independently of application pre-checks.

This operation must not depend on the legacy `business.category` string as its authority.

## 9. Legacy Business category compatibility

Connect currently synchronizes a legacy Business category field when the primary category changes.

GHM must **not** reproduce that field merely for schema parity.

If Connect migration requires a compatibility projection, that projection is a separate product-adapter concern. It does not make the legacy field canonical inside GHM.

## 10. Lifecycle boundary

This slice does not authorize:

- category catalogue administration;
- arbitrary hierarchy mutation;
- category deletion;
- category merge;
- category deprecation workflows;
- Business profile/public directory projection;
- search or ranking;
- recommendations;
- AI classification;
- automatic category assignment;
- product cutover.

## 11. Typed repository surface

Intended repository surface:

```text
listBusinessCategories(context, filters)
getBusinessCategory(context, categoryId)
listBusinessCategoryAssignments(context, businessId)
assignBusinessCategory(context, input)
setPrimaryBusinessCategory(context, input)
```

Exact naming may be adjusted during implementation without changing the contract.

No generic SQL/table API is permitted.

## 12. Service responsibilities

The service owns:

- input validation;
- authorization orchestration;
- category selectability checks;
- assignment uniqueness handling;
- primary-transition orchestration;
- stable domain errors.

The service must not:

- accept provider identifiers;
- trust caller-supplied `created_by`;
- trust caller-supplied membership roles;
- accept Supabase JWTs;
- perform public discovery/ranking;
- mutate category taxonomy;
- expose arbitrary SQL.

## 13. Error boundary

At minimum, the service must distinguish:

- authentication required;
- Business access denied;
- Business not found / not accessible;
- category not found;
- category inactive/not selectable;
- invalid category identifier;
- duplicate assignment;
- assignment not found;
- unsupported mutation;
- primary-transition conflict;
- transaction failure.

Errors must not disclose unrelated Business or category existence where the caller lacks authority.

## 14. Concurrency

The database is authoritative for:

- unique `(business_id, category_id)`;
- at-most-one-primary assignment.

Primary transitions must execute inside one authorized transaction.

Qualification must demonstrate concurrent primary transitions cannot leave multiple primary assignments.

## 15. No HTTP exposure

This construction contract does not authorize a public GHM category API.

Resource registration may be prepared only to support internal qualification. Public HTTP exposure requires a separate authorization decision.

## 16. Qualification evidence

The 2026-10-05 runtime qualification passed with runtime identity `ghm_runtime` and cleanup authority `ghm_migrator`. Evidence covered category reads and active filtering, management authorization, cross-Business read/assignment denial, server-derived provenance, duplicate assignment rejection, atomic/concurrent primary transitions, inactive/unassigned primary rejection, runtime privilege boundaries, runtime insert/delete denial, invalid UUID validation, and the existing 520-test suite.

## 17. Qualification requirements

Before this slice is considered construction-qualified, evidence must demonstrate:

1. category reads work through the governed repository;
2. inactive categories cannot be selected;
3. assignment reads require Business access;
4. assignment creation requires Business management authority;
5. caller-controlled `created_by` cannot be trusted;
6. invalid category references are rejected;
7. duplicate assignments are rejected;
8. exactly one primary is enforced;
9. primary transitions are atomic;
10. concurrent primary transitions are safe;
11. unauthorized callers cannot mutate assignments;
12. category taxonomy cannot be mutated by runtime roles;
13. delete is denied where not authorized;
14. provider-specific identifiers are rejected;
15. Supabase JWTs are not accepted as GHM authentication;
16. runtime grants match the operation surface;
17. build/tests/diff checks pass;
18. existing qualified GHM capabilities remain green;
19. architecture/readiness/handover documentation is reconciled to the resulting implementation.

## 18. Construction sequence

```text
migration
  -> typed contracts
  -> repository
  -> service
  -> resource registration
  -> qualification tests
  -> runtime privilege qualification
  -> documentation reconciliation
```

No Connect schema mutation, production migration, product cutover, shadow traffic, or Supabase provider cleanup is authorized by this contract.

## 19. Explicit founder gate

This contract records the construction authorization expressed on 2026-09-30 by proceeding after the evidence-backed source audit.

The authorization is limited to the Business Category boundary defined here. It does not authorize Business Offerings, category administration, public directory exposure, product authentication migration, or production cutover.
