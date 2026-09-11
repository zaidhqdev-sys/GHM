# GHM Project Resource Contract

Status: **qualified private Project resource contract; public disclosure implementation not authorized**

## Purpose

Define the provider-neutral Project capability implemented in the dedicated GHM schema and qualified through the private owner-bound Resource API slice. This contract does not authorize product adapters, production cutover, public Project disclosure, or reproduction of the Connect `projects`/`project_quotes` schema as-is.

## Source boundary

The current Connect implementation establishes Project as a customer-originated project request/opportunity. Its canonical contract currently contains:

- `id`;
- customer identity reference;
- `title`;
- `description`;
- `category`;
- `province`;
- `city`;
- optional `budget_min` and `budget_max`;
- `urgency` with `standard`, `urgent`, and `emergency` values;
- `status` with `open`, `in_progress`, `completed`, and `cancelled` values;
- `created_at` and `updated_at`.

The Connect contract also contains `project_quotes`, a public marketplace projection, and an atomic quote-decision function. Those are separate capabilities and are explicitly outside this first Project contract.

## GHM identity model

GHM must not copy Connect's `customer_id -> profiles.id` ownership implementation blindly.

Project ownership must bind to the canonical GHM account identity represented by `ghm.account_identity`. A Project is owned by an authenticated account, not by a Business membership.

Business participation in a Project is a later capability. A Business owner or administrator is not automatically the Project owner merely because the account has an active Business membership.

An account may own multiple Projects. Project creation must not impose a one-Project-per-account invariant.

## Initial Project capability

The initial governed resource is `project` with these candidate operations:

- `read` — read a Project when the caller satisfies the Project visibility rule;
- `create` — create a new Project for the authenticated account;
- `update` — update an eligible owned Project.

Delete is intentionally not part of the initial Project registry capability even though Connect currently permits deletion of open projects with no quote history. If deletion is required later, it needs a separate contract and qualification because its safety depends on downstream Project participation/history.

## Ownership and authorization

### Create

An authenticated account may create a Project for itself. The account identity must be bound from the authenticated `AuthContext`; caller-supplied owner/account identifiers must not become an authorization primitive.

Creation establishes the Project owner atomically with the Project row. The service must not accept an arbitrary account id as ownership authority.

### Read

The Project contract distinguishes the currently qualified private owner context from the separately governed public disclosure context:

1. **Owner read** — the authenticated owning account may read its own Project and its lifecycle/history fields.
2. **Marketplace/public read** — only fields explicitly classified as public may be returned for an eligible open Project.

The public representation must not expose private account identity or unrelated quote/business data merely because those rows are relationally available.

The public-read eligibility rule has been reconciled with the current Connect marketplace behavior: only Projects with status = 'open' are eligible for public disclosure. Public disclosure must use a dedicated non-sensitive projection and must not expose private account identity or unrelated quote/business data.

### Update

Only the owning account may update an eligible Project. The first GHM Project slice should preserve the current Connect constraint that owner editing applies to an `open` Project.

The update contract must whitelist mutable Project fields. Lifecycle state must not be caller-controlled through a general profile update operation.

At minimum, the candidate mutable fields are:

- `title`;
- `description`;
- `category`;
- `province`;
- `city`;
- `budget_min`;
- `budget_max`;
- `urgency`.

`id`, owner identity, `status`, `created_at`, and `updated_at` are not caller-controlled fields.

## Validation contract

The current Connect validation/schema evidence establishes these baseline constraints:

- title: 5–160 trimmed characters;
- description: 20–5000 trimmed characters;
- category: 2–80 trimmed characters;
- province: 2–80 trimmed characters;
- city: 2–120 trimmed characters;
- budget minimum: null or >= 0;
- budget maximum: null or >= 0;
- when both budgets exist, maximum >= minimum;
- urgency: `standard | urgent | emergency`;
- initial status on creation: `open`.

These values are evidence for contract reconciliation, not permission to copy the physical Connect schema without GHM-specific review.

## Lifecycle contract

The observed lifecycle vocabulary is:

```text
open
in_progress
completed
cancelled
```

`open` and `in_progress` are active states; `completed` and `cancelled` are history states.

The first Project slice should not expose arbitrary status mutation. Lifecycle transitions require their own explicit operation contract and evidence. In particular, accepting a future Project quote may transition a Project to `in_progress`, but quote acceptance is not part of this Project slice.

## Transaction requirements

Project creation must be atomic: no Project may be committed without its authenticated owner relationship being established.

Project update must bind authorization and the Project mutation to the same operation context. The repository must not perform a separate unawaited ownership lookup and then mutate the Project through an unrelated context.

No transaction primitive beyond what the actual Project repository requires should be added speculatively. If a later lifecycle operation spans Project and another resource, that operation requires a separate transaction contract.

## Repository boundary

The Project repository must:

- use fixed `ghm.*` schema identifiers;
- use parameterized values;
- select explicit columns;
- reject caller-controlled table/schema/column/query input;
- expose only Project contract operations;
- keep ownership predicates inside the authorized repository operation;
- avoid cross-resource SQL shortcuts.

The Project repository must not expose `project_quotes`, Business membership, marketplace projections, storage, or realtime data as implicit Project fields.

## Proposed first-slice schema shape

The minimum candidate GHM table is a dedicated `ghm.project` relation containing only the Project capability fields required by the reconciled contract:

- `id`;
- `account_id` (owner reference to `ghm.account_identity`);
- `title`;
- `description`;
- `category`;
- `province`;
- `city`;
- `budget_min`;
- `budget_max`;
- `urgency`;
- `status`;
- `created_at`;
- `updated_at`.

The Project schema contract has been reconciled to the live GHM catalog, the migration has been applied to the construction database, and the runtime privilege evidence has been qualified. The applied relation is `ghm.project`; this does not authorize production cutover.

## Explicit exclusions

The first Project slice does not include:

- `project_quotes`;
- Business quote submission;
- quote acceptance/rejection;
- `project_marketplace` as a database view;
- Business verification dependencies;
- Project-to-Business ownership;
- arbitrary lifecycle mutation;
- generic search/query endpoints;
- storage or realtime dependencies;
- Connect or QuoteFlow adapters;
- production migrations or cutover.

## Qualification requirements

The Project implementation qualification gate is closed for the current private owner-bound slice. Evidence covers:

1. canonical GHM schema reconciliation;
2. exact runtime privilege derivation;
3. authenticated owner binding;
4. create success and rollback behavior;
5. owner read success;
6. unauthorized/non-owner read denial where applicable;
7. public disclosure boundary, if public Project reads are implemented; public eligibility is now reconciled as status = 'open'.
8. owner update success for eligible Projects;
9. non-owner update denial;
10. immutable owner/status enforcement;
11. invalid input and budget-range rejection;
12. transaction/context binding;
13. automated positive and negative tests;
14. live qualification against the canonical GHM PostgreSQL path.

## Open reconciliation items

The current private Project slice is qualified. The remaining reconciliation boundary is deliberately limited to capabilities not included in that slice:

- implementation and qualification of the dedicated public Project disclosure projection;
- lifecycle transition authority beyond creation/open-owner editing;
- whether any future GHM workflow requires Project deletion;
- any additional query/index requirements introduced by a separately authorized public projection or future Project operation;
- any additional runtime ACL changes required by a separately authorized capability.

Account-based ownership, the canonical `ghm.account_identity` relationship, the current indexes, and the runtime ACLs for the private Project slice are already reconciled and qualified.
## Production safety

This contract is construction-only. Zaid Connect and QuoteFlow remain on their existing production backend. It does not authorize a production database URL change, data migration, credential rotation, DNS/routing change, provider/bootstrap mutation, product adapter, shadow traffic, or cutover.
