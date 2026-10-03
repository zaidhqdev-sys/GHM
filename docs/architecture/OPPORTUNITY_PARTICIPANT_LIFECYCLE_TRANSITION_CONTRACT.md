# Opportunity Participant Lifecycle Transition Contract

**Status:** CONSTRUCTION CONTRACT — FROZEN FOR REVIEW  
**Resource:** `ghm.opportunity_participant`  
**Scope:** Lifecycle transition authority only

## 1. Purpose

The Opportunity Participant resource and Connect adapter are already construction-qualified for creation and read boundaries. Participant status mutation was explicitly deferred because a lifecycle transition authority had not yet been defined.

This contract defines the allowed **participation-status** transitions and the invariants required before any runtime mutation authority is constructed.

It does not authorize implementation, HTTP mutation exposure, production routing, provider integration, Supabase migration, shadow qualification, or cutover.

## 2. Canonical owner

`ghm.opportunity_participant.participation_status` is owned by the Opportunity Participant resource.

No second domain may directly mutate this field.

The lifecycle authority must operate through the canonical Opportunity Participant service/repository boundary and a narrow database mutation primitive. Broad runtime `UPDATE` remains prohibited.

## 3. Current status vocabulary

The existing canonical status set is:

- `invited`
- `active`
- `declined`
- `withdrawn`
- `removed`
- `completed`

No new status is introduced by this contract.

## 4. Transition matrix

Only the following transitions are authorized:

| Current | Next | Meaning |
|---|---|---|
| invited | active | participant accepts/enters active participation |
| invited | declined | participant declines the invitation |
| invited | withdrawn | invitation/participation is withdrawn before activation |
| invited | removed | participant is administratively removed before activation |
| active | withdrawn | active participant withdraws |
| active | removed | participant is administratively removed |
| active | completed | participation is completed |
| declined | invited | declined participant is re-invited |
| withdrawn | invited | withdrawn participant is re-invited |
| removed | invited | removed participant is re-invited |

All other transitions are denied.

In particular:

- `completed` is terminal under this contract.
- `declined`, `withdrawn`, and `removed` cannot directly become `active`; re-entry is through `invited`.
- There is no direct `invited -> completed`.
- There is no direct `declined -> completed`.
- There is no direct `withdrawn -> completed`.
- There is no direct `removed -> completed`.

A future business workflow may extend this matrix only through a new explicit contract.

## 5. Authority model

Lifecycle mutation is a governed operation, not ordinary participant update.

The existing participant management boundary establishes that the Opportunity creator or owner-business administrator may manage participation. This contract preserves that boundary for administrative transitions.

Participant self-service is limited to transitions explicitly attributable to the participant's own principal:

- account participant: `invited -> active`, `invited -> declined`, `active -> withdrawn`
- business participant: the same transitions when the authenticated account is an active member of the participant business

Administrative transitions:

- `invited -> withdrawn`
- `invited -> removed`
- `active -> removed`
- `declined -> invited`
- `withdrawn -> invited`
- `removed -> invited`

require existing Opportunity participant-management authority.

Re-invitation does not itself authorize automatic activation.

## 6. Provenance

The authenticated GHM context is the source of transition authority.

The transition implementation must not accept a caller-supplied actor identifier as authority.

The persisted participant row remains authoritative for:

- current status
- participant principal
- opportunity
- immutable creation provenance

The authenticated context establishes who is performing the transition.

No verification, trust, membership, provider result, payment event, or matching result may be inferred as a lifecycle transition by this contract.

## 7. Immutable fields

Lifecycle transition must not modify:

- `id`
- `opportunity_id`
- `account_id`
- `business_id`
- `created_by`
- `created_at`

The following are also outside lifecycle transition authority:

- `participation_role`
- participant principal
- opportunity association

Role changes require a separate contract. They must not be smuggled through a status-transition operation.

Only:

- `participation_status`
- `updated_at`

may change as part of this lifecycle operation.

## 8. Concurrency and stale-state protection

Every lifecycle mutation must carry the caller's expected current status.

The database mutation must atomically:

1. locate the participant;
2. lock the participant row;
3. verify the authenticated authority;
4. verify the persisted status equals the expected current status;
5. verify the transition exists in the frozen matrix;
6. update the status and timestamp;
7. return the resulting participant.

A stale expected status must fail without mutation.

Last-write-wins behavior is prohibited.

## 9. Terminal and replay behavior

A successful transition is idempotence-sensitive:

- repeating the same transition with the old expected status must fail as stale;
- attempting the same current-to-next transition after it has already occurred must fail unless a separately authorized reverse/re-entry transition exists in this matrix;
- `completed` cannot be reopened by this contract.

No silent normalization of invalid transitions is permitted.

## 10. Transaction and rollback requirements

The transition must execute atomically inside the existing authorized transaction boundary.

Any authorization failure, stale-state failure, invalid transition, or database failure must leave the participant unchanged.

No partial lifecycle state is acceptable.

## 11. Database privilege boundary

The runtime role must not receive broad `UPDATE` or `DELETE` privilege on `ghm.opportunity_participant` merely to implement lifecycle authority.

Preferred construction is a narrow, governed mutation primitive with only the required execution privilege.

The primitive must independently enforce the transition matrix and authority boundary rather than trusting the application alone.

## 12. HTTP boundary

This contract does not authorize a new public HTTP lifecycle route.

Any future HTTP exposure must be separately qualified against this contract, including authenticated context, operation registration, authorization ordering, stale-state handling, and error semantics.

## 13. Non-goals

This contract does not define:

- opportunity outcome
- matching or recommendation
- participant ranking
- notification delivery
- invitation transport
- booking
- payment/provider results
- commercial entitlement
- trust changes
- evidence verification
- automatic participation based on external events
- production migration
- Supabase cutover
- shadow qualification

## 14. Construction gate

Before runtime implementation can be qualified, the construction slice must prove:

- all allowed transitions succeed;
- all unsupported transitions fail;
- participant self-service cannot perform administrative transitions;
- administrative authority is enforced;
- stale expected status fails without mutation;
- completed is terminal;
- re-invitation returns only to invited;
- actor provenance is derived from authenticated context;
- immutable fields cannot change;
- role cannot change through lifecycle authority;
- direct runtime UPDATE/DELETE remains denied;
- rollback leaves state unchanged;
- concurrent conflicting transitions serialize safely;
- full repository tests remain green;
- live PostgreSQL qualification reconciles persisted rows and privilege boundaries.

No production or cutover implication follows from construction qualification.
