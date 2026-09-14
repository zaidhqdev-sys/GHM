# Project Quote Operation Contract

**Status:** QUALIFIED / CLOSED / PASS — runtime qualification completed 2026-09-14

## 1. Purpose

Define the provider-neutral GHM capability for quotes submitted by eligible Businesses against customer-owned Projects.

This contract is derived from the verified Zaid Connect Project Quote capability and reconciled against the qualified GHM Business Identity, Project, Authorization, and Transaction boundaries.

GHM must reproduce the business capability, not copy Supabase implementation details.

## 2. Source Boundary

The verified product capability establishes:

- one quote per Business per Project;
- customers can read quotes received against their own Projects;
- Businesses can read their own submitted quotes;
- only eligible Businesses may submit quotes;
- submitted quotes may be updated while the Project remains open;
- the Project owner may accept or reject a submitted quote;
- acceptance atomically rejects competing submitted quotes and moves the Project to `in_progress`.

Supabase auth.uid(), RLS, RPCs, security-definer functions, and provider-specific identifiers are not GHM contract primitives.

## 3. Identity Model

- Project ownership: `ghm.project.account_id -> ghm.account_identity.id`
- Quote Business: `ghm.project_quote.business_id -> ghm.business.id`
- AuthContext is authoritative.
- Caller-supplied identity IDs never establish authority.
- Business membership alone does not establish quote authority.

## 4. Operations

The Project Quote resource authorizes:

- `readReceived`
- `readOwn`
- `create`
- `update`
- `accept`
- `reject`

There is no delete operation.

There is no arbitrary status-mutation operation.

There is no withdraw operation in this construction slice.

## 5. Project Dependency

A quote belongs to exactly one Project:

`ghm.project_quote.project_id -> ghm.project.id`

The Project remains customer-owned.

Create and update require the Project to be `open`.

Accepting a quote transitions the Project from `open` to `in_progress`.

No other Project lifecycle transitions are introduced by this contract.

## 6. Business Eligibility

For quote creation and update, the authenticated account must:

1. own the Business;
2. have an active Business;
3. have verification status `approved`;
4. have `is_verified = true`.

Business membership roles do not receive additional quote authority through this contract.

Admin expansion is excluded.

## 7. Create

Create requires:

- authenticated caller;
- existing Project;
- Project status `open`;
- submitting account is not the Project customer;
- existing Business owned by caller;
- Business active;
- Business verification approved;
- Business verified;
- no existing quote for the same Project and Business.

Create fields:

- `project_id`
- `business_id`
- `amount`
- `labour_min`
- `labour_max`
- `materials_min`
- `materials_max`
- `total_min`
- `total_max`
- `duration_days`
- `description`

The initial status is always `submitted`.

The database generates the quote ID and timestamps.

Caller input cannot establish status or timestamps.

Duplicate submission is enforced by the database uniqueness constraint.

## 8. Validation

- `amount >= 0`
- labour ranges, when supplied, are non-negative and `max >= min`
- materials ranges, when supplied, are non-negative and `max >= min`
- total ranges, when supplied, are non-negative and `max >= min`
- `duration_days` is optional; when supplied it is a positive integer, with the physical target range `1..3650`
- description is optional; when supplied, trimmed length is `10..5000`

Status vocabulary retained from the product contract:

- `submitted`
- `accepted`
- `rejected`
- `withdrawn`

Only `submitted`, `accepted`, and `rejected` are exercised by the authorized operations in this slice.

## 9. Uniqueness

Database invariant:

`UNIQUE(project_id, business_id)`

There can be at most one quote from a Business for a Project.

The database constraint is authoritative; application pre-checks are not relied upon for correctness.

## 10. Read Received

`readReceived` is authorized only for the authenticated owner of the Project.

The repository must enforce Project ownership against AuthContext.

Returned data must not expose unrelated private customer, Business, or account data.

## 11. Read Own

`readOwn` is authorized only for the authenticated owner of the Business associated with the quote.

The repository must enforce Business ownership against AuthContext.

## 12. Update

Update is authorized only when:

- the authenticated account owns the quote's Business;
- the quote status is `submitted`;
- the Project status is `open`.

Mutable fields:

- amount
- labour_min
- labour_max
- materials_min
- materials_max
- total_min
- total_max
- duration_days
- description

The following are immutable through update:

- quote ID
- Project ID
- Business ID
- status
- created_at
- updated_at

## 13. Reject

Only the authenticated Project owner may reject a quote.

Requirements:

- quote exists;
- quote belongs to the Project;
- Project is owned by caller;
- quote status is `submitted`;
- Project status is `open`.

Reject changes only the selected quote to `rejected`.

Project status remains unchanged.

The authorization check and mutation occur within the same transaction.

## 14. Accept

Only the authenticated Project owner may accept a quote.

Requirements:

- quote exists;
- quote belongs to the Project;
- Project is owned by caller;
- quote status is `submitted`;
- Project status is `open`.

Acceptance is one atomic transaction:

1. establish AuthContext;
2. begin transaction;
3. identify the selected quote's Project;
4. lock the Project;
5. verify Project ownership;
6. verify Project remains `open`;
7. lock the selected quote;
8. verify the quote remains `submitted`;
9. reject all other `submitted` quotes for that Project;
10. accept the selected quote;
11. transition Project `open -> in_progress`;
12. commit.

Rollback must leave the quote set and Project state unchanged.

## 15. Concurrency

Concurrent acceptance attempts must not produce multiple accepted quotes.

Database invariants and row locking are authoritative.

The physical schema must include a uniqueness invariant allowing at most one accepted quote per Project.

## 16. Transaction Boundary

Protected operations bind AuthContext to the same checked-out PostgreSQL PoolClient/transaction used for authorization and mutation.

No second pool connection may be used to establish authority.

Create, update, reject, and accept must not introduce a TOCTOU gap between authorization and mutation.

## 17. Repository Rules

Repositories must:

- use fixed `ghm.*` relations;
- use parameterized values;
- use explicit column lists;
- avoid caller-controlled SQL identifiers;
- avoid provider-specific IDs;
- avoid unrelated-resource shortcuts;
- keep authorization predicates adjacent to the mutation;
- preserve the transaction boundary for compound decisions.

## 18. Runtime Privilege Direction

Runtime authority is least privilege:

- schema USAGE;
- SELECT on required Project Quote data;
- INSERT only for authorized quote creation fields;
- UPDATE only on mutable quote fields;
- column-level UPDATE(status) only for the governed quote accept/reject decisions;
- sequence USAGE where required;
- Project column-level UPDATE(status) only for the governed open ? in_progress transition; it does not authorize a generic Project lifecycle/status operation.

No blanket `ALL` privilege is authorized.

No quote operation may gain DELETE authority.

## 19. Explicit Non-Goals

This contract does not authorize:

- arbitrary Project lifecycle mutation;
- Project deletion;
- Business membership role expansion;
- Business-admin quote authority;
- generic CRUD;
- quote withdrawal;
- reproduction of the Connect marketplace view;
- reproduction of Supabase RLS/RPC/security-definer implementation;
- notification construction;
- commercial/payment logic;
- storage;
- realtime;
- product adapters;
- production migration;
- production cutover;
- provider credential or routing changes.

## 20. Qualification Gate

The qualification gate is CLOSED / PASS. The completed runtime qualification demonstrated:

1. dependency boundaries;
2. Business eligibility;
3. received-quote ownership;
4. own-quote ownership;
5. cross-customer denial;
6. cross-Business denial;
7. create;
8. duplicate prevention;
9. validation boundaries;
10. update;
11. update denial;
12. accept;
13. reject;
14. competing submitted quotes rejected on acceptance;
15. Project transition to `in_progress`;
16. one-accepted invariant;
17. rollback;
18. concurrent acceptance;
19. least-privilege positive probes;
20. least-privilege negative probes;
21. AuthContext binding;
22. transaction binding;
23. automated tests;
24. live runtime qualification;
25. migration/catalog reconciliation;
26. final repository evidence;
27. contract/schema consistency;
28. production-safety verification;
29. closure gate.

## 21. Construction Sequence and Closure

1. Freeze this operation contract.
2. Reconcile the physical schema.
3. Define the Project Quote schema contract.
4. Construct repository/service boundaries.
5. Define and measure runtime SQL privileges.
6. Construct the migration.
7. Add automated tests.
8. Perform live runtime qualification.
9. Reconcile migration, catalog, privilege, and runtime evidence.
10. Close the capability gate — COMPLETED.

Existing qualified capabilities remain CLOSED/PASS.

Project Quote qualification evidence:

- 
pm run qualify:project-quote-runtime — PASS.
- 
pm run build — PASS.
- 
pm test — PASS — 98/98.
- git diff --check — PASS.
- migration, catalog, privilege, authorization, transaction, rollback, and concurrency boundaries — PASS.
- no production migration, cutover, DNS, routing, credential, or traffic change performed.

Project Quote depends on those qualified boundaries and must not reopen them without new evidence of regression or contract change.

## 22. Production Safety

This construction work does not authorize:

- Connect production migration;
- QuoteFlow production migration;
- DNS/routing changes;
- credential rotation;
- provider removal;
- production data movement;
- production cutover.

Connect and QuoteFlow remain on their current Supabase backends until the later shadow-qualification and cutover gates are explicitly authorized.



