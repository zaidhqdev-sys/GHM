# GHM Opportunity Core Construction Contract

**Status:** Construction contract established — implementation not yet qualified.

## Purpose

Opportunity is the next GHM resource slice after the qualified Review slice. This contract translates the live ZAID Connect Opportunity foundation into the GHM capability model without copying the Connect `public` schema literally.

The GHM target schema is `ghm`. Production remains ZAID Connect / Supabase until product-adapter, shadow-qualification, database-reconciliation, and controlled-cutover gates are separately closed.

## Scope of Opportunity Core

Opportunity Core owns the Opportunity itself. It does **not** yet own participant management, capability requirements, or product-specific enquiry/project workflows.

Core responsibilities:

- create an Opportunity owned by the authenticated creator Account;
- read an Opportunity when the caller is authorized by its visibility and participation rules;
- update an owned Opportunity while it remains mutable;
- represent lifecycle and visibility explicitly;
- preserve creator identity and optional owner Business binding;
- preserve optional country and currency references;
- enforce budget and opening/closing date invariants;
- prevent lifecycle transitions from being hidden inside generic CRUD.

Explicitly deferred to later governed slices:

- Opportunity participants and participant-role management;
- participant qualification;
- capability requirements and requirement replacement;
- Enquiry ↔ Opportunity atomic workflow reconciliation;
- Project ↔ Opportunity atomic workflow reconciliation;
- ZAID Connect adapter;
- production migration or cutover.

## Canonical Opportunity Model

The core entity contains:

- `id`
- `opportunity_type_id`
- `creator_account_id`
- `owner_business_id` nullable
- `country_id` nullable
- `currency_id` nullable
- `title`
- `description`
- `lifecycle_status`
- `visibility`
- `budget_min` nullable
- `budget_max` nullable
- `opens_at` nullable
- `closes_at` nullable
- `created_at`
- `updated_at`

The GHM TypeScript contract uses camelCase names while repository SQL uses the canonical `ghm` snake_case columns.

### Read Projections

The full internal Opportunity projection contains the complete canonical entity, including:

- `creatorAccountId`
- `ownerBusinessId`
- `updatedAt`

The safe disclosure projection contains only:

- `id`
- `opportunityTypeId`
- `countryId`
- `currencyId`
- `title`
- `description`
- `lifecycleStatus`
- `visibility`
- `budgetMin`
- `budgetMax`
- `opensAt`
- `closesAt`
- `createdAt`

The repository must use an explicit safe-column selection for disclosure rather than selecting the full entity and removing private fields after retrieval.

## Lifecycle

The canonical lifecycle vocabulary is:

`draft → open → responding → evaluating → awarded → in_progress → completed → cancelled → archived`

The implementation must not silently permit arbitrary lifecycle mutation. Lifecycle transition authority belongs to an explicit operation/service rule, with the allowed transition graph represented in tests before qualification.

Core creation defaults to `draft` unless the creation operation has an explicitly authorized transition to `open`.

Terminal states are `completed`, `cancelled`, and `archived` for Core purposes. A terminal Opportunity is not generally mutable.

## Visibility

Canonical visibility values:

- `private`
- `participants`
- `authenticated`
- `public`

A `public` Opportunity may not be `draft`.

Public reads must expose only fields explicitly designated as public by the resource contract. Private participation, authorization state, and future participant data must not leak through the Core read surface.

## Authorization Boundary

Every authenticated write carries an `AuthContext` and is authorized before repository mutation, using the same GHM authorization boundary already qualified for existing resources.

Creation:

- requires an authenticated Account;
- binds `creator_account_id` to `context.userId` server-side;
- caller input must never choose another creator Account.

Ownership:

- an Opportunity may optionally identify an owning Business;
- binding or changing `owner_business_id` is not a generic caller-controlled field;
- Business-management authorization must be explicit before any operation that changes Business ownership.

Read authorization must distinguish:

- creator access;
- owning Business owner/administrator access;
- participant access (once the Participant slice exists);
- authenticated visibility;
- public visibility.

The Core read surface has two explicit projections:

1. **Full Opportunity projection**
   - returned to the creator;
   - returned to an active owning-Business owner;
   - returned to an active owning-Business administrator;
   - includes creator identity, optional owner Business binding, and `updatedAt`.

2. **Safe Opportunity public projection**
   - returned to unrelated callers when visibility permits authenticated/public disclosure;
   - contains only fields explicitly approved for disclosure by the Core contract;
   - must not expose `creatorAccountId`, `ownerBusinessId`, or `updatedAt`.

Private Opportunities remain isolated from unrelated callers.

Participant visibility remains fail-closed until the Participant slice provides an explicit participant authorization operation. The Core implementation must not invent participant authorization before that slice exists. Until that slice is qualified, participant-specific access is a documented dependency rather than an implicit bypass.

## Validation Invariants

The repository/service boundary must validate at minimum:

- `title` is present and bounded;
- `description` is present and bounded;
- `budget_min` and `budget_max`, when supplied, are finite and non-negative;
- `budget_max >= budget_min` when both exist;
- `opens_at` and `closes_at`, when both exist, satisfy `closes_at >= opens_at`;
- lifecycle and visibility values are from the canonical vocabularies;
- a public Opportunity cannot be draft;
- references such as Opportunity Type are valid and active according to the eventual schema contract;
- creator identity is server-bound;
- unsupported update fields are rejected rather than ignored.

Exact field length limits must be selected from the reconciled Connect migration/contract and recorded in the implementation tests rather than guessed from UI behavior.

## Repository Boundary

The repository must expose typed operations rather than generic table access.

Initial Core operations:

- `createOpportunity`
- `getOpportunity`
- `getOwnedOpportunity`
- `updateOwnedOpportunity`

If lifecycle mutation requires a distinct operation, it must be explicit (for example `transitionOpportunity`) rather than allowing `lifecycleStatus` through an unrestricted update payload.

The service mirrors the repository contract and remains responsible for domain-level normalization/validation that is not safely delegated to SQL constraints.

## Transaction Boundary

All mutating operations use the qualified GHM authorized transaction boundary. There is no second ad-hoc pool and no unawaited authorization query.

Creation is atomic with respect to the Opportunity row and any Core-owned invariants. Participant creation and product workflow side effects are deliberately outside this first slice and must not be simulated as partial writes.

## SQL / Schema Boundary

The canonical application schema is `ghm`.

No new Opportunity implementation may target `public.*` tables. Historical Connect `public` SQL is evidence of the source contract, not the GHM deployment target.

RLS/privilege posture must follow the already-qualified GHM role separation:

- runtime receives only the minimum permissions required by the repository;
- migrator/schema owner owns DDL and migration authority;
- no runtime DDL or startup schema mutation;
- no generic table-query endpoint;
- no privilege escalation through resource operations.

## Qualification Requirements

Opportunity Core cannot be marked qualified until all of the following are evidenced:

1. migration creates the dedicated `ghm` Opportunity core schema and constraints;
2. build passes;
3. unit/service tests cover normalization, validation, lifecycle, visibility, ownership and error behavior;
4. runtime identity is the qualified `ghm_runtime` identity;
5. creation binds the authenticated Account server-side;
6. creator reads return the full Opportunity projection;
7. active owning-Business owners and administrators receive the full Opportunity projection even when they are not the creator;
8. cross-account owned reads/updates are denied;
9. unauthorized Business ownership changes are denied;
10. private Opportunities remain isolated from unrelated callers;
11. authenticated and public disclosure return only the approved safe projection;
12. safe disclosure does not expose `creatorAccountId`, `ownerBusinessId`, or `updatedAt`;
13. participant visibility remains fail-closed before the Participant slice exists;
14. invalid lifecycle/visibility transitions are denied;
15. terminal Opportunities cannot be modified through Core update operations;
16. transaction rollback is evidenced for a failed mutation;
17. direct runtime access outside the repository contract is denied where the privilege model requires it;
18. `npm run build`, `npm test`, and `git diff --check` pass;
19. the resource-specific runtime qualification evidence is documented before the slice is considered CLOSED/PASS.

## Source Reconciliation

This contract is derived from the live ZAID Connect Opportunity foundation and creation workflow, including the canonical Opportunity entity, lifecycle, visibility, participation separation, authorization model, atomic creation workflows, and structured requirements boundary.

The Connect product remains the source of behavioral truth for future adapter reconciliation. GHM remains the source of truth for the backend capability once the corresponding GHM slice is qualified.

## Gate Position

Opportunity Core construction may proceed.

The following remain blocked and are not implied by this contract:

- production database migration;
- Supabase replacement;
- Render/provider bootstrap cleanup;
- ZAID Connect adapter;
- QuoteFlow adapter;
- shadow qualification;
- controlled cutover.
