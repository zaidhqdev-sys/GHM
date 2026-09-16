# GHM Opportunity Participation Schema Contract

**Status:** CONSTRUCTION AUTHORIZED — schema contract frozen 2026-09-16

## 1. Purpose

Define the provider-neutral PostgreSQL schema for the Opportunity Participation relationship reconciled from the current Zaid Connect production Opportunity foundation.

This contract authorizes construction on the GHM construction branch only. It does not authorize production migration, Supabase changes, product adapters, shadow traffic, credential changes, or cutover.

## 2. Canonical relation

```text
ghm.opportunity_participant
```

Each row represents one Account-or-Business participation relationship with one GHM Opportunity.

The table is a child resource of `ghm.opportunity` and must use the existing GHM identity and Business relations rather than provider-specific identifiers.

## 3. Canonical columns

| Column | Type | Nullability | Default | Authority |
|---|---|---|---|---|
| `id` | `bigint` identity | NOT NULL | database | database |
| `opportunity_id` | `bigint` | NOT NULL | none | existing Opportunity |
| `account_id` | `bigint` | nullable | none | Account principal when participation is Account-based |
| `business_id` | `bigint` | nullable | none | Business principal when participation is Business-based |
| `participation_role` | `text` | NOT NULL | none | governed role contract |
| `participation_status` | `text` | NOT NULL | `active` | governed participation lifecycle |
| `created_by` | `bigint` | NOT NULL | none | authenticated account provenance |
| `created_at` | `timestamptz` | NOT NULL | `now()` | database |
| `updated_at` | `timestamptz` | NOT NULL | `now()` | database |

No Supabase UUID, `auth.uid()`, provider user identifier, provider Business identifier, or RLS-specific column is part of the GHM schema.

## 4. Foreign keys

### Opportunity

```text
ghm.opportunity_participant.opportunity_id
  -> ghm.opportunity.id
```

Delete behavior: `ON DELETE CASCADE`.

Participation cannot survive deletion of its parent Opportunity.

### Account principal

```text
ghm.opportunity_participant.account_id
  -> ghm.account_identity.id
```

Delete behavior: `ON DELETE CASCADE`.

An Account-owned participation relationship has no independent meaning after the canonical Account identity is removed.

### Business principal

```text
ghm.opportunity_participant.business_id
  -> ghm.business.id
```

Delete behavior: `ON DELETE CASCADE`.

Business participation has no independent meaning after the referenced Business is removed.

### Creator provenance

```text
ghm.opportunity_participant.created_by
  -> ghm.account_identity.id
```

Delete behavior: `ON DELETE RESTRICT`.

Creation provenance is retained as an integrity boundary and must not become an arbitrary caller-controlled identity field.

## 5. Principal invariant

Exactly one participant principal is required:

```text
(account_id IS NOT NULL AND business_id IS NULL)
OR
(account_id IS NULL AND business_id IS NOT NULL)
```

The database must enforce this invariant.

A row cannot represent both an Account and a Business, and a row cannot represent neither.

## 6. Role vocabulary

The physical contract permits exactly:

```text
creator
owner
recipient
responder
evaluator
fulfiller
```

The database must reject arbitrary role values.

Roles describe the participant's governed responsibility in the Opportunity. They are not interchangeable with GHM account roles (`admin`, `customer`, `business`) or Business membership roles (`owner`, `administrator`, `member`).

## 7. Participation status vocabulary

The physical contract permits exactly:

```text
invited
active
declined
withdrawn
removed
completed
```

The database must reject arbitrary participation status values.

Participation status is independent of Opportunity lifecycle status. It must not be stored in or inferred from `ghm.opportunity.lifecycle_status`.

## 8. Default status

New participation rows default to:

```text
active
```

This matches the reconciled source behavior for automatically established creator and owner relationships.

Invitation/application workflows that require `invited` or another non-default status must explicitly provide that value through a separately authorized operation; no generic caller-controlled status mutation is authorized merely by this schema contract.

## 9. Duplicate protection

The source contract requires two separate partial unique indexes.

### Account participant uniqueness

```text
UNIQUE (opportunity_id, account_id, participation_role)
WHERE account_id IS NOT NULL
```

### Business participant uniqueness

```text
UNIQUE (opportunity_id, business_id, participation_role)
WHERE business_id IS NOT NULL
```

The database is authoritative for duplicate protection. Application pre-checks must not be the only correctness mechanism.

This intentionally permits one principal to have different participation roles in the same Opportunity where the source contract permits those distinct responsibilities, while preventing duplicate rows for the same principal/role combination.

## 10. Required indexes

The initial schema should contain only indexes justified by the reconciled participation authorization and lookup boundaries:

1. Account participation lookup:
   `account_id, participation_status, created_at DESC` where `account_id IS NOT NULL`.

2. Business participation lookup:
   `business_id, participation_status, created_at DESC` where `business_id IS NOT NULL`.

3. Opportunity role/status lookup:
   `opportunity_id, participation_role, participation_status`.

The partial unique indexes above also serve duplicate protection and relevant lookup paths.

No speculative marketplace, matching, recommendation, analytics, or search indexes are authorized by this contract.

## 11. Timestamp behavior

`created_at` and `updated_at` are server-generated.

`updated_at` must change on a governed participant-row update.

The implementation should use the established GHM resource-local timestamp pattern unless a shared timestamp mechanism is separately authorized.

## 12. Ownership and authorization relationship

Participation is not ownership by default.

The following distinctions are mandatory:

- `creator` participation identifies the Account that created the Opportunity.
- `owner` participation identifies the owning Business when an Opportunity has an `owner_business_id`.
- `recipient` participation is a separate responsibility and must not be collapsed into `owner`.
- `responder`, `evaluator`, and `fulfiller` are distinct responsibilities.

Being any participant does not grant unrestricted Opportunity management authority.

Opportunity management remains governed by the existing Opportunity authorization contract: creator Account or authorized owner-Business management permission.

## 13. Automatic creator participation

When an Opportunity is created, the reconciled source establishes the authenticated creator Account as:

```text
participation_role = creator
participation_status = active
```

with `created_by` equal to the creator Account.

GHM must preserve this behavior through the governed Opportunity creation workflow. It must not be recreated as an eventually consistent or best-effort side effect.

## 14. Automatic owner participation

When an Opportunity has a non-null `owner_business_id`, the reconciled source establishes that Business as:

```text
participation_role = owner
participation_status = active
```

with `created_by` equal to the Opportunity creator Account.

This relationship must remain distinct from any later `recipient` participation.

## 15. Marketplace recipient participation

The reconciled Marketplace enquiry workflow can establish the target Business as:

```text
participation_role = recipient
participation_status = active
```

The recipient relationship is distinct from the Business's `owner` relationship.

GHM must preserve that distinction in the physical model and in later cross-resource workflow construction.

The Marketplace workflow remains a later cross-resource transactional capability; this schema contract does not itself authorize implementation of the full Enquiry → Opportunity workflow.

## 16. Participant visibility dependency

The source visibility predicate recognizes participant Accounts and Business members for participation statuses:

```text
invited
active
completed
```

Creator access is also recognized independently.

GHM must therefore expose participant-aware authorization through an explicit service/repository boundary. It must not implement participant visibility as:

```text
opportunity.visibility = 'participants'
```

alone.

The physical schema supports this boundary through the Opportunity foreign key, Account/Business principal columns, role, and status.

## 17. Business membership relationship

A Business participant is a relationship to `ghm.business`, not directly to `ghm.business_membership`.

Membership is used by the authorization layer to determine whether the authenticated Account is a member of the participating Business.

The participant table must not duplicate membership role or membership status.

Existing Business membership vocabulary remains independently governed:

```text
owner
administrator
member
```

Participation roles and membership roles must not be conflated despite the shared word `owner`.

## 18. Creation provenance

`created_by` records the authenticated GHM Account responsible for establishing the participant row.

The field is provenance, not the participant principal. A Business participant therefore has:

- `business_id` populated;
- `account_id` null;
- `created_by` referencing the Account that created the relationship.

This preserves the source model's distinction between participant subject and mutation provenance.

## 19. Runtime privilege direction

The runtime role must receive only the privileges required by the eventually qualified participation operations.

Construction target:

- `USAGE` on schema `ghm`;
- `SELECT` on `ghm.opportunity_participant`;
- `INSERT` only on participant data fields required by authorized creation workflows;
- `UPDATE` only on `participation_role` and `participation_status` if the final governed operation contract requires those mutations;
- required sequence usage;
- no blanket `ALL` privilege.

`id`, timestamps, and creation provenance must not become arbitrary caller-controlled update fields.

No runtime `DELETE` privilege should be granted unless a separately authorized participant-removal operation proves that delete semantics are required. The reconciled production source uses a `removed` participation status and does not justify physical deletion as the default lifecycle operation.

Runtime privilege grants must be measured against actual repository operations during qualification, not copied from Supabase grants or assumed from table ownership.

## 20. Migrator / schema-owner authority

`ghm_migrator` / `ghm_schema_owner` remains the DDL and governed construction authority according to the established GHM role separation.

The migration must:

- target `ghm.*` explicitly;
- avoid `public` search-path assumptions;
- avoid runtime startup DDL;
- avoid blanket runtime DML grants;
- preserve migration-ledger integrity.

## 21. Repository boundary

The eventual repository must expose typed participant operations rather than generic table access.

At minimum, the implementation must support the read and mutation behaviors required by the separately frozen Opportunity Participation operation contract.

The repository must:

- use fixed `ghm.opportunity_participant` identifiers;
- use parameterized values;
- use explicit columns;
- bind authorization to `AuthContext`;
- keep authorization and mutation in the same transaction context where required;
- never accept a caller-controlled table/schema/column/query identifier;
- never use participant membership as a substitute for Opportunity management authority.

The physical schema contract does not itself create an HTTP endpoint or public participant-management API.

## 22. Resource registration boundary

`opportunity_participant` is a distinct GHM resource concept even though it is owned by the Opportunity domain.

It must not be registered or exposed as generic CRUD merely because the physical table exists.

The final resource registry entry and operation vocabulary require a separate implementation contract and qualification evidence.

## 23. Cross-resource transaction boundaries

The participant schema must support atomic workflows where participation is created as part of Opportunity creation or a later cross-resource operation.

At minimum, the following eventual workflows must be capable of atomic participation persistence:

1. Opportunity creation → creator participation.
2. Opportunity creation with owner Business → owner participation.
3. Marketplace enquiry Opportunity creation → recipient participation.
4. Project-type Opportunity creation → creator participation and Project relationship.

The schema contract does not authorize implementation of those complete workflows yet. Their cross-resource operation contracts remain separately governed.

## 24. Explicit non-goals

This schema does not authorize:

- new participant roles;
- new participant statuses;
- generic participant CRUD HTTP endpoints;
- arbitrary participant deletion;
- notification delivery;
- matching or recommendation;
- AI ranking;
- response/evaluation/award state machines beyond the reconciled participation vocabulary;
- Business membership redesign;
- Opportunity lifecycle redesign;
- Enquiry redesign;
- Project redesign;
- production migration;
- Supabase schema mutation;
- product adapters;
- shadow traffic;
- production cutover.

## 25. Qualification gate

The schema cannot be considered qualified until evidence demonstrates:

1. migration applies cleanly to the GHM construction database;
2. `ghm.opportunity_participant` exists with the exact contract columns;
3. Opportunity foreign key is correct and cascades as specified;
4. Account and Business foreign keys are correct;
5. `created_by` provenance foreign key is correct;
6. Account/Business XOR constraint rejects invalid subjects;
7. role constraint rejects arbitrary roles;
8. status constraint rejects arbitrary statuses;
9. default status is `active`;
10. Account partial uniqueness is enforced;
11. Business partial uniqueness is enforced;
12. required indexes exist and speculative indexes are absent;
13. timestamp behavior is correct;
14. runtime identity is `ghm_runtime`;
15. runtime privileges match actual repository requirements;
16. runtime cannot bypass the service authorization boundary through excessive grants;
17. creator participation behavior is atomic and correct;
18. owner participation behavior is atomic and correct where applicable;
19. participant visibility semantics are qualified through the explicit authorization path;
20. participant role/status mutation behavior is explicitly authorized and qualified before being exposed;
21. duplicate/concurrency behavior is qualified;
22. rollback behavior is qualified for participation mutation workflows;
23. migration ledger/catalog/privilege evidence reconciles;
24. `npm run build` passes;
25. `npm test` passes;
26. `git diff --check` passes for new implementation files;
27. no existing qualified GHM capability regresses;
28. final handover evidence records the closure result.

## 26. Construction sequence

1. Freeze this schema contract.
2. Construct `ghm.opportunity_participant` migration.
3. Apply migration only to the construction database.
4. Reconcile catalog and constraints.
5. Define the participant operation contract.
6. Implement repository/service boundaries.
7. Register the resource and authorized operations.
8. Add positive/negative, duplicate, concurrency, and rollback tests.
9. Qualify runtime and privilege boundaries.
10. Reconcile cross-resource creator/owner behavior.
11. Update the handover only after all evidence passes.

## 27. Production safety

This is construction-only.

Zaid Connect and QuoteFlow remain on Supabase. No production database migration, data movement, environment-variable change, credential rotation, DNS/routing change, provider cleanup, shadow traffic, or cutover is authorized by this contract.
