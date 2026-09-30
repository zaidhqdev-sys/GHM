# Cross-Resource Lifecycle Transition Capability

## Status

QUALIFIED / CLOSED / PASS — implementation and runtime qualification completed 2026-09-14.

## Purpose

Define the narrowly scoped capability required for a governed Project Quote
decision to transition an open Project to `in_progress` without exposing
generic Project lifecycle mutation to the GHM runtime.

## Boundary

The Project resource remains the owner of Project lifecycle semantics.

The Project Quote decision operation owns the business decision that may cause
the specific Project transition:

    open -> in_progress

This does NOT introduce:

- generic Project status mutation;
- a Project lifecycle API;
- caller-controlled status;
- arbitrary status transitions;
- Business membership lifecycle authority;
- provider-specific authorization;
- Supabase RPC/security-definer dependencies.

## Required Capability

The GHM application must have a dedicated internal capability representing:

    transition Project from open to in_progress

The capability MUST:

1. operate only inside the existing authorized transaction boundary;
2. use the authenticated `AuthContext` already established for the Project Quote
   decision;
3. identify the Project by parameterized resource ID;
4. verify the Project is the authenticated customer's owned Project as required
   by the Project Quote decision contract;
5. require the Project's current status to be `open`;
6. permit only the transition `open -> in_progress`;
7. reject every other source status;
8. reject every other target status;
9. never accept a caller-supplied arbitrary status;
10. not expose a generic Project status-update operation.

## Transaction Requirement

The transition MUST execute on the same checked-out `PoolClient` used by the
Project Quote decision.

The complete acceptance operation remains one transaction:

    authorize
      -> begin
      -> identify Project from selected quote
      -> lock Project
      -> validate Project ownership/status
      -> lock selected quote
      -> validate selected quote
      -> reject competing submitted quotes
      -> accept selected quote
      -> transition Project open -> in_progress
      -> commit

No second database connection is permitted.

No TOCTOU gap is permitted between Project authorization/state validation and
the transition.

## Database Boundary

The existing Project runtime boundary remains unchanged for generic Project
operations.

In particular:

- `ghm_runtime` must NOT receive generic Project status-update authority merely
  to enable Project Quote acceptance;
- no blanket `UPDATE` grant may be introduced;
- column-level `UPDATE(status)` is permitted only as the explicitly selected
  underlying PostgreSQL primitive for the dedicated capability and requires
  explicit security and completed runtime qualification;
- no `SECURITY DEFINER` function or provider-specific RPC is authorized by
  this contract.

The selected database mechanism is column-level `UPDATE(status)` as the
underlying PostgreSQL primitive. It is not an application-level generic Project
status capability and has passed runtime qualification.

## Capability Ownership

The transition is an internal dependency of the Project Quote decision
operation.

Project remains the canonical owner of:

- Project status vocabulary;
- valid Project lifecycle states;
- Project lifecycle invariants.

Project Quote remains the canonical owner of:

- quote acceptance/rejection decision semantics;
- the condition under which the specific Project transition occurs;
- the atomic decision transaction.

Neither resource may silently absorb the other's contract.

## Failure Semantics

The capability MUST fail when:

- the caller is unauthenticated;
- the Project does not exist;
- the caller does not own the Project;
- the Project is not `open`;
- the selected quote is not eligible for acceptance;
- the transition target is anything other than `in_progress`.

Failure MUST NOT disclose unrelated Project existence.

If any part of the decision transaction fails, the entire transaction MUST
roll back.

## Qualification Evidence

The qualification gate is CLOSED / PASS. Runtime qualification proved:

### Positive

1. authenticated Project owner can accept an eligible submitted quote;
2. acceptance transitions Project exactly from `open` to `in_progress`;
3. selected quote becomes `accepted`;
4. competing submitted quotes become `rejected`;
5. all mutations occur atomically.

### Negative

6. unauthenticated caller cannot invoke the capability;
7. non-owner cannot trigger the transition;
8. closed/non-open Project cannot transition;
9. arbitrary target status cannot be supplied;
10. arbitrary source status cannot be bypassed;
11. generic Project update cannot mutate status;
12. runtime role cannot directly perform an unauthorized generic Project
    status mutation;
13. failed quote decision rolls back the Project transition;
14. concurrent acceptance cannot produce two accepted quotes or an invalid
    Project state.

### Privilege

15. effective runtime privileges are measured before construction;
16. the new mechanism grants only the minimum capability required;
17. no blanket table privilege is introduced;
18. no DELETE authority is introduced;
19. no generic Project lifecycle authority is introduced.

## Project Contract Impact

The existing Project contract does NOT gain a generic lifecycle operation.

The existing Project Resource contract is amended only to recognize that the
separately governed Project Quote decision may invoke the dedicated
`open -> in_progress` capability.

This does not reopen the already-qualified Project private CRUD boundary.

## Production Safety

This is construction-only.

No:

- production migration;
- production privilege change;
- production routing change;
- credential change;
- Supabase cutover;
- Connect migration;
- QuoteFlow migration

is authorized by this contract.

## Construction Gate

Implementation is blocked until the database mechanism for this capability
has been explicitly selected and independently reviewed against:

- least privilege;
- transaction integrity;
- provider neutrality;
- Project boundary preservation;
- completed runtime qualification evidence.



