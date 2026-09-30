# GHM Cross-Resource Lifecycle Capability — Architecture Decision Record

## Status

QUALIFIED / CLOSED / PASS — capability mechanism selected, implemented, and runtime-qualified 2026-09-14.

## Context

The governed Project Quote decision requires one cross-resource lifecycle
effect:

    Project: open -> in_progress

The Project resource remains the canonical owner of Project lifecycle
semantics.

The Project Quote resource remains the canonical owner of quote decision
semantics.

The existing GHM transaction boundary requires the complete decision to run on
one authorized PostgreSQL `PoolClient`.

The existing Project runtime privilege boundary intentionally does not grant
`ghm_runtime` generic Project status mutation.

## Existing Qualified Boundary

The qualified Project runtime boundary provides:

- schema USAGE;
- SELECT on `ghm.project`;
- INSERT on the authorized Project creation columns;
- UPDATE on mutable Project fields;
- sequence USAGE;
- no DELETE privilege;
- no Project status UPDATE privilege.

The application repository also deliberately excludes `status` from generic
Project updates.

This boundary is already qualified and must not be weakened merely to enable
Project Quote acceptance.

## Architectural Requirement

Project Quote acceptance requires a narrowly scoped internal capability:

    transition Project from open to in_progress

The capability must:

- execute inside the existing authorized transaction;
- use the same `AuthContext`;
- use the same checked-out `PoolClient`;
- identify the Project through a parameterized ID;
- preserve Project ownership authorization;
- require current status `open`;
- permit only `open -> in_progress`;
- reject arbitrary target states;
- reject arbitrary lifecycle mutation;
- preserve atomic quote decision semantics.

## Options Evaluated

### Option 1 — Generic Project `UPDATE` privilege

Rejected.

Granting broad UPDATE authority would violate the least-privilege Project
boundary.

### Option 2 — Column-level `UPDATE(status)`

Conditionally viable as the underlying PostgreSQL primitive, but NOT as the
application capability itself.

PostgreSQL column privilege does not encode the semantic transition:

    open -> in_progress

It therefore must never be exposed as a generic Project status-update
operation.

The only acceptable application use is a dedicated internal transition
primitive whose SQL enforces:

    WHERE id = ?
      AND account_id = ?
      AND status = 'open'

and performs exactly:

    status = 'in_progress'

The primitive must not accept an arbitrary target status and must execute
inside the existing authorized Project Quote transaction.

Use of `UPDATE(status)` requires explicit runtime qualification proving:

- generic Project update still cannot mutate status;
- unauthorized direct runtime status mutations are rejected by the chosen
  application boundary;
- only the governed `open -> in_progress` operation is reachable through
  GHM application code;
- authorization and ownership are checked before the mutation;
- concurrent decisions remain safe;
- the complete decision remains atomic.

Therefore column-level `UPDATE(status)` is not itself the capability. It is
the selected database primitive beneath the separately governed
application capability.

### Option 3 — Reuse `ghm_schema_owner`

Rejected.

`ghm_schema_owner` is the schema-owning non-login role. Giving runtime access
to that authority would collapse the distinction between application runtime
and schema ownership.

The existing:

    ghm_migrator -> ghm_schema_owner

relationship is a migration-authority boundary, not an application-runtime
pattern.

### Option 4 — Introduce a capability role

Not selected at this stage.

The current GHM role topology contains no established capability-role pattern
for cross-resource lifecycle mutation.

Introducing one would require explicit role semantics, inheritance rules,
effective-privilege qualification, and lifecycle/security review.

It must not be created opportunistically as a workaround.

### Option 5 — SECURITY DEFINER function / provider-specific RPC

Rejected.

This would introduce a database-executed privilege-escalation mechanism and
would conflict with the provider-neutral Project Quote contract.

It would also move authorization semantics into a mechanism that the current
GHM architecture has explicitly not adopted for this boundary.

### Option 6 — Application-only transition without database authority

Rejected.

The application repository cannot execute a Project status transition when
the runtime role does not possess the required database authority.

Pretending the TypeScript boundary alone solves the database privilege
boundary would leave the implementation internally inconsistent.

## Decision

**Column-level `UPDATE(status)` is selected as the underlying PostgreSQL
primitive for the Project lifecycle capability.**

This selection does NOT authorize generic Project status mutation.

Therefore:

1. the existing Project runtime privilege boundary is preserved except for
   the explicitly qualified column-level `UPDATE(status)` primitive;
2. no blanket Project UPDATE grant is added;
3. `ghm_runtime` is not granted `ghm_schema_owner`;
4. no capability role is introduced;
5. no SECURITY DEFINER function is introduced;
6. no provider-specific RPC is introduced;
7. the application capability remains exclusively
   `transitionOpenProjectToInProgress`;
8. the capability remains constrained to `open -> in_progress`;
9. runtime qualification MUST prove that arbitrary Project status mutation is
   not reachable through the GHM application boundary;
10. Project Quote implementation may proceed through construction and
    qualification, but no production database change is authorized.

The corresponding Project Quote decision operation also requires
column-level `UPDATE(status)` on `ghm.project_quote` for its governed
`submitted -> accepted` and `submitted -> rejected` mutations.

That privilege is likewise an underlying database primitive only. It does not
create a generic Project Quote status-update operation.

Both effective privilege changes were explicitly measured and qualified. The resulting capability is CLOSED / PASS.

## Ownership

Project remains canonical for:

- Project status vocabulary;
- Project lifecycle invariants;
- valid Project states.

Project Quote remains canonical for:

- quote decision semantics;
- acceptance/rejection;
- the condition that causes the specific Project transition.

The transaction boundary remains canonical for atomic execution.

## Validated Design Requirements

The selected capability mechanism was validated against all of the following requirements:

### Authority

The mechanism grants exactly the ability required for:

    open -> in_progress

and no generic Project lifecycle authority.

### Isolation

Generic Project update remains unable to mutate `status`.

### Authorization

The Project Quote decision must establish the authenticated Project owner
before invoking the capability.

### Transaction

The capability executes using the same checked-out `PoolClient`.

### Concurrency

Concurrent quote decisions cannot produce:

- multiple accepted quotes;
- an accepted quote on a non-open Project;
- an invalid Project lifecycle state.

### Failure

Any failure in quote acceptance or Project transition rolls back the entire
decision transaction.

### Runtime qualification evidence

The completed qualification proved both:

- the intended transition succeeds;
- unauthorized direct and indirect status mutation fails.

### Effective privilege

The actual PostgreSQL effective privileges of the runtime identity were measured after construction and reconciled successfully.

## Impact on Qualified Resources

This decision does NOT reopen:

- Project private CRUD qualification;
- Review qualification;
- Opportunity qualification;
- Enquiry qualification;
- Authorization boundary qualification;
- Transaction qualification.

Any future mechanism that changes effective Project runtime authority must
explicitly identify whether requalification of the Project boundary is
required.

## Production Safety

Construction-only.

This ADR authorizes no:

- production migration;
- production privilege change;
- production role change;
- production routing change;
- credential change;
- Supabase cutover;
- Connect migration;
- QuoteFlow migration.

## Gate

Project Quote implementation and the cross-resource lifecycle mechanism are CLOSED / PASS.

The mechanism was explicitly selected, implemented, independently runtime-qualified, and reconciled against the Project boundary.

No production migration, cutover, routing, credential, or provider change is authorized by this ADR.


