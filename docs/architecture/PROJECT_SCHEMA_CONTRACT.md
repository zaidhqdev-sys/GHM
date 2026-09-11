# GHM Project Schema Contract

Status: **qualified Project schema contract; construction-only, no production cutover authority**

## Purpose

Define the physical PostgreSQL contract for the first governed GHM `project` resource. This document follows the provider-neutral Project resource contract and the already-qualified dedicated `ghm` Business Identity schema.

This contract authorizes construction of the Project migration on the dedicated construction branch. It does not authorize production migration, product adapter work, data migration, cutover, provider/bootstrap mutation, or changes to Zaid Connect or QuoteFlow production.

## Canonical relation

```text
ghm.project
```

Project ownership is account-based:

```text
ghm.project.account_id
  -> ghm.account_identity.id
```

Business membership is not an ownership relationship for Projects. An account may own multiple Projects.

## Columns

| Column | Type | Nullability | Default | Authority |
|---|---|---|---|---|
| `id` | `bigint` | NOT NULL | identity | database |
| `account_id` | `bigint` | NOT NULL | none | authenticated context |
| `title` | `text` | NOT NULL | none | owner on create/update |
| `description` | `text` | NOT NULL | none | owner on create/update |
| `category` | `text` | NOT NULL | none | owner on create/update |
| `province` | `text` | NOT NULL | none | owner on create/update |
| `city` | `text` | NOT NULL | none | owner on create/update |
| `budget_min` | `numeric(12,2)` | NULL | none | owner on create/update |
| `budget_max` | `numeric(12,2)` | NULL | none | owner on create/update |
| `urgency` | `text` | NOT NULL | `standard` | owner on create/update |
| `status` | `text` | NOT NULL | `open` | database/resource lifecycle |
| `created_at` | `timestamptz` | NOT NULL | `now()` | database |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | database |

`account_id`, `status`, timestamps, and `id` are never caller-controlled update fields.

## Constraints

The physical schema must enforce the baseline contract that has already been reconciled from the Connect Project implementation:

- `title`: trimmed length 5–160;
- `description`: trimmed length 20–5000;
- `category`: trimmed length 2–80;
- `province`: trimmed length 2–80;
- `city`: trimmed length 2–120;
- `budget_min` is null or >= 0;
- `budget_max` is null or >= 0;
- when both budgets exist, `budget_max >= budget_min`;
- `urgency` is `standard`, `urgent`, or `emergency`;
- `status` is `open`, `in_progress`, `completed`, or `cancelled`;
- new rows default to `status = 'open'`.

No database constraint should permit an arbitrary Project lifecycle value.

## Ownership integrity

The foreign key to `ghm.account_identity(id)` must use the canonical GHM identity relation.

The relationship must preserve the existing account identity on account deletion according to the established GHM identity ownership model. For the first construction slice, the intended behavior is cascading deletion of an account's Projects, matching the account-owned nature of the resource and avoiding orphaned Project rows.

No foreign key to `ghm.business` or `ghm.business_membership` is part of this first Project relation.

## Index contract

The first implementation should include only indexes justified by the governed Project operations:

1. owner listing:
   `account_id, created_at DESC`;
2. open Project retrieval ordered by creation time:
   `created_at DESC` with a partial predicate for `status = 'open'`.

A broad marketplace/filter index is intentionally not copied from Connect because the GHM marketplace projection is not part of this slice.

Additional indexes require evidence from an implemented GHM query contract rather than speculative optimization.

## Runtime privilege contract

`ghm_runtime` receives only the privileges required by the Project resource implementation.

Required construction target:

- `USAGE` on schema `ghm`;
- `SELECT` on `ghm.project`;
- `INSERT` on `ghm.project`;
- `UPDATE` only on the mutable Project columns:
  - `title`;
  - `description`;
  - `category`;
  - `province`;
  - `city`;
  - `budget_min`;
  - `budget_max`;
  - `urgency`;
- `USAGE` on the Project identity sequence.

No `DELETE` privilege is required for the first Project slice.

No blanket `ALL`, blanket DML, or arbitrary sequence/table privilege is permitted.

Ownership and lifecycle authorization remain application/service concerns. PostgreSQL privileges must not be treated as a substitute for authenticated owner predicates.

## Schema authority

The Project migration is owned by `ghm_schema_owner` through the existing dedicated-schema construction model. Runtime DML executes as `ghm_runtime` through the established application path.

The migration must not depend on `public` search-path resolution. All Project identifiers must be explicitly qualified as `ghm.*`.

## Timestamp behavior

`updated_at` must change when a Project row is updated through the governed repository operation. The implementation may use a dedicated Project trigger/function or another repository-approved mechanism, but it must not silently modify unrelated resources.

## Repository boundary

The physical table does not authorize arbitrary SQL access. The repository must expose only explicit Project operations and explicit columns.

The repository must enforce:

- authenticated owner binding from `AuthContext` on create;
- owner predicate on owner reads;
- owner predicate plus `status = 'open'` on owner updates;
- explicit mutable-column whitelist;
- parameterized values;
- no caller-controlled schema/table/column/query input;
- no implicit Business membership joins;
- no quote or marketplace fields.

## Deliberate exclusions

This schema does not create:

- `project_quotes`;
- `project_marketplace`;
- quote acceptance/rejection state;
- Business verification dependencies;
- Project-to-Business ownership;
- generic search/query infrastructure;
- storage or realtime relations;
- Connect or QuoteFlow adapters;
- lifecycle transition functions;
- Project deletion workflow.

## Qualification record

The migration and implementation contract have now been reconciled against the live GHM construction database. The following qualification requirements have passed:

1. schema/column/constraint reconciliation;
2. foreign key to `ghm.account_identity`;
3. exact `ghm_runtime` ACLs;
4. sequence privilege;
5. default privileges for future Project sequences where applicable;
6. create success with authenticated owner binding;
7. create rollback on failure;
8. owner read success;
9. non-owner read denial;
10. owner update success while `open`;
11. non-owner update denial;
12. update denial once non-open;
13. immutable owner/status enforcement;
14. invalid input and budget-range rejection;
15. transaction/context binding;
16. automated positive and negative tests;
17. live runtime qualification against the canonical GHM PostgreSQL path.

The migration is applied only to the GHM construction database. This remains construction-only and must not be interpreted as production cutover authority.
