# GHM Opportunity Participation Operation Contract

**Status:** CONSTRUCTION AUTHORIZED — operation contract frozen 2026-09-16

## 1. Purpose

Define the narrow GHM operation boundary for `ghm.opportunity_participant` after source reconciliation with the current Zaid Connect Opportunity foundation.

The contract covers persisted participation relationships and their authorization boundary. It does not create a public participant-management API or authorize workflows not evidenced by the reconciled production source.

## 2. Resource identity

Canonical resource:

```text
o pportunity_participant
```

Canonical PostgreSQL relation:

```text
ghm.opportunity_participant
```

The resource is subordinate to the Opportunity domain but has its own typed repository/service boundary.

## 3. Operations

The initial GHM operation vocabulary is intentionally narrow:

| Operation | Purpose |
|---|---|
| `read` | Read participation relationships that the authenticated context is authorized to see. |
| `create` | Establish a participation relationship through a governed workflow. |
| `update` | Change an existing participation role/status only where the caller is explicitly authorized. |

There is **no** `delete` operation in the initial contract.

There is **no** public `invite`, `accept`, `decline`, `withdraw`, `remove`, or `complete` operation yet. Those names may describe status transitions in the persisted vocabulary, but the source reconciliation does not provide enough evidence for separate public GHM operation contracts.

There is **no** generic participant-management HTTP endpoint authorized by this contract.

## 4. Typed identifiers

```text
OpportunityParticipantId = bigint
OpportunityId = bigint
AccountId = bigint
BusinessId = bigint
```

No provider-specific identifiers are accepted at the GHM boundary.

## 5. Read contract

The repository must support an explicit typed read boundary sufficient for Opportunity participant-aware authorization and later product workflows.

The read boundary must permit filtering by the parent Opportunity and participant principal using parameterized values.

The repository must never expose arbitrary table/column selection or raw SQL identifiers from request input.

### Authorization

Read authorization must distinguish at least:

1. authenticated Account is the Opportunity creator;
2. authenticated Account is the Account participant;
3. authenticated Account is a member of a participating Business and the Business participation status is one of `invited`, `active`, `completed`;
4. authorized Opportunity management context requires creator or governed owner-Business management authority.

A participant relationship alone must not grant unrestricted Opportunity management.

The exact public projection of Opportunity data remains governed by the Opportunity resource contract. Participant reads must not silently broaden Opportunity disclosure.

## 6. Create contract

Creation is permitted only through a governed service operation with an authenticated `AuthContext`.

The service must derive `created_by` from the authenticated context. It must not trust a caller-supplied provenance identity.

The service must validate:

- parent Opportunity exists and is eligible for the operation;
- exactly one of `accountId` or `businessId` is supplied;
- role is one of the six canonical roles;
- status is one of the six canonical statuses when the specific workflow explicitly authorizes a non-default status;
- principal/role duplicate protection is enforced by the database;
- any Business-specific authorization or qualification required by the parent workflow is satisfied.

The service must execute authorization and mutation within the same checked-out PostgreSQL transaction context where the operation depends on database authorization state.

### Default status

If the governed creation workflow does not explicitly authorize another status, the database default is `active`.

### Creator creation

Opportunity creation must atomically establish:

```text
creator Account + role creator + status active
```

The participant row's `created_by` is the creator Account.

### Owner creation

When Opportunity creation supplies `owner_business_id`, the same atomic workflow must establish:

```text
owner Business + role owner + status active
```

with `created_by` equal to the Opportunity creator Account.

These are workflow invariants, not generic participant self-service operations.

## 7. Update contract

The initial update operation is restricted to fields explicitly authorized by a future participant-transition workflow:

```text
participation_role
participation_status
```

The following are immutable through participant update:

```text
id
opportunity_id
account_id
business_id
created_by
created_at
```

`updated_at` is server-controlled.

No generic authenticated caller may change participation role or status merely because the caller can read the row.

Until a concrete transition authority is separately specified and qualified, the service must reject unsupported participant updates.

## 8. Role semantics

Canonical role vocabulary:

```text
creator
owner
recipient
responder
evaluator
fulfiller
```

Role semantics are responsibility labels, not GHM authentication roles and not Business membership roles.

In particular:

- `owner` participation is not the same thing as Business membership `owner`;
- `recipient` must remain distinct from `owner`;
- `creator` identifies the Account that created the Opportunity;
- `responder`, `evaluator`, and `fulfiller` must not be assigned new semantics during this construction slice.

## 9. Status semantics

Canonical status vocabulary:

```text
invited
active
declined
withdrawn
removed
completed
```

Participation status is independent of Opportunity lifecycle status.

This contract does not define a transition graph between these statuses because the reconciled source does not evidence a complete participant lifecycle state machine.

Therefore the following are **not** authorized assumptions:

```text
invited -> active
active -> withdrawn
active -> removed
active -> completed
```

They may be implemented only after a concrete source-backed transition contract is established.

## 10. Business participant authorization

For a Business participant, the participant subject is the Business.

The authenticated Account's membership in that Business is a separate authorization relationship.

GHM must evaluate Business membership using the canonical Business/membership model and must not copy membership role/status onto the participant row.

## 11. Opportunity management separation

Participant operations must not bypass Opportunity management authorization.

Existing Opportunity management authority remains:

```text
creator Account
OR
authorized member of owner Business with governed management permission
```

The participant operation layer may consult that authority but must not redefine it.

## 12. Cross-resource atomicity

The following creation paths require transaction-capable repository/service composition:

### Opportunity → creator participation

Creation of the Opportunity and its creator participation must commit or roll back together.

### Opportunity → owner participation

Where `owner_business_id` is supplied, Opportunity creation and owner participation must commit or roll back together.

### Enquiry → Opportunity → recipient participation

The eventual Marketplace workflow must atomically create the Opportunity, compatible Enquiry/Lead relationship, and recipient participation. This contract does not itself implement that workflow.

### Project → Opportunity → Project relationship

The eventual Project workflow must preserve atomicity for the Opportunity and Project relationship while also establishing the creator participation. This contract does not itself implement that workflow.

## 13. Error boundary

The service must expose stable domain errors rather than PostgreSQL implementation details.

At minimum, the boundary must distinguish:

- authentication required;
- resource access denied;
- Opportunity not found / not accessible;
- invalid participant principal;
- invalid participation role;
- invalid participation status;
- duplicate participant role;
- unsupported participant mutation;
- transaction failure.

Error messages must not disclose unrelated-resource existence.

Exact HTTP mapping is deferred until an HTTP resource route is separately authorized.

## 14. Concurrency

The database unique indexes are authoritative for duplicate prevention.

Concurrent attempts to establish the same principal/Opportunity/role combination must resolve through database uniqueness rather than application pre-checks.

Qualification must test concurrent duplicate creation and verify that the final state contains at most one canonical row for the constrained combination.

## 15. Repository contract

The eventual TypeScript contract should be equivalent in scope to:

```text
createParticipant(context, input)
getParticipant(context, participantId)
listOpportunityParticipants(context, opportunityId)
updateParticipant(context, participantId, input)
```

These names are implementation guidance, not permission to expose all methods publicly.

Repository implementations must use explicit `ghm.*` identifiers, parameterized values, and the authorized transaction context.

## 16. Service contract

The service owns domain validation and authorization orchestration.

The service must not:

- accept a caller-controlled `created_by`;
- bypass the registry/authorization boundary;
- infer management authority from participation alone;
- infer participant status from Opportunity lifecycle;
- manufacture new role/status values;
- expose generic SQL operations.

## 17. Registry contract

A dedicated resource registration is required before HTTP exposure.

Initial intended resource vocabulary:

```text
opportunity_participant
```

Initial intended operations:

```text
read
create
update
```

The registry entry must not imply that all three operations are available to every authenticated role or through a public route.

Authorization remains resource- and operation-specific.

## 18. No HTTP exposure yet

This contract deliberately does not authorize a new `/api/v1/opportunity-participants` route or equivalent public endpoint.

The existing production source currently lacks a general standalone participant-management API. GHM construction therefore begins with the domain/resource boundary and qualification tests, not speculative API exposure.

## 19. Qualification requirements

Before this operation contract can be marked qualified, evidence must demonstrate:

1. authenticated context is required;
2. registry operation is explicit;
3. parent Opportunity authorization is enforced;
4. Account participant read path works for an authorized context;
5. Business participant read path correctly evaluates membership;
6. unauthorized contexts are denied without unrelated-resource disclosure;
7. creator participation is atomically established;
8. owner participation is atomically established when applicable;
9. recipient participation remains distinct from owner;
10. invalid Account+Business combinations are rejected;
11. invalid role values are rejected;
12. invalid status values are rejected;
13. duplicate principal/role creation is rejected;
14. concurrent duplicate creation is safe;
15. unsupported status/role mutation is denied;
16. immutable fields cannot be changed;
17. rollback removes partial participant state on failed atomic workflows;
18. runtime privileges are least-privilege and match actual operations;
19. repository/service authorization remains in one checked-out DB context where required;
20. build, tests, and diff checks pass;
21. no previously qualified GHM capability regresses.

## 20. Construction boundary

The operation contract authorizes the following next implementation sequence:

```text
migration
  -> repository
  -> service
  -> registry
  -> unit/integration qualification
  -> runtime privilege qualification
```

It does not authorize production migration or product backend changes.

## 21. Production safety

Zaid Connect and QuoteFlow remain on their existing production backend during GHM construction. No production environment, routing, credentials, data, Supabase schema, or cutover state may be changed under this contract.
