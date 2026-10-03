# Opportunity Participant Lifecycle Transition Authority

**Status:** RECONCILIATION RESULT — TRANSITION AUTHORITY NOT YET AUTHORIZED  
**Resource:** `ghm.opportunity_participant`  
**Scope:** Determine whether a participant lifecycle mutation contract can be constructed from current source evidence.

## 1. Result

The existing Opportunity Participant resource is construction-qualified for its initial persisted relationship boundary.

A separate participant lifecycle transition authority **cannot currently be frozen or implemented** without inventing product behavior.

The current reconciled Zaid Connect source defines the status vocabulary:

- `invited`
- `active`
- `declined`
- `withdrawn`
- `removed`
- `completed`

but the source audit explicitly does **not** establish a complete participant transition state machine.

Therefore GHM must not infer transitions such as:

- `invited -> active`
- `invited -> declined`
- `active -> withdrawn`
- `active -> removed`
- `active -> completed`
- re-invitation transitions

merely because those states exist.

## 2. Canonical evidence

The current GHM source reconciliation identifies:

- `docs/architecture/OPPORTUNITY_PARTICIPATION_SOURCE_AUDIT.md`
- `docs/architecture/OPPORTUNITY_PARTICIPATION_SCHEMA_CONTRACT.md`
- `docs/architecture/OPPORTUNITY_PARTICIPATION_OPERATION_CONTRACT.md`

as the canonical construction evidence.

The production Zaid Connect Opportunity foundation establishes the participant table, principal model, role vocabulary, status vocabulary, visibility semantics, and creation workflows.

It does not establish a complete participant lifecycle workflow contract.

The production source also explicitly defers broader Opportunity workflows including Opportunity matching, recommendations, outcomes, notifications, and related workflow behavior.

## 3. Current GHM boundary

The existing repository intentionally rejects participant updates with:

`Participant updates are not supported until a concrete transition authority is qualified`

This behavior is correct and must remain in place.

The registered `update` operation must not be interpreted as permission to mutate status or role.

## 4. What is authoritative now

The following remain authoritative:

### Status vocabulary

The six source-defined values remain valid physical states.

### Status meaning

Participation status is distinct from Opportunity lifecycle status.

### Creation

The existing source-backed creation workflows may establish:

- creator Account / `creator` / `active`
- owner Business / `owner` / `active`
- Marketplace recipient Business / `recipient` / `active`

where those workflows are separately constructed and qualified.

### Authorization

Participant access remains distinct from Opportunity management authority.

Management remains tied to the existing Opportunity creator / owner-Business management boundary.

### Immutability

Participant principal, Opportunity association, and creation provenance are not generic lifecycle-update fields.

### Database privilege

Runtime broad `UPDATE` and `DELETE` must remain denied until a concrete mutation authority is separately justified and qualified.

## 5. What is explicitly not authorized

No GHM lifecycle mutation may currently be constructed for:

- acceptance;
- decline;
- withdrawal;
- removal;
- completion;
- re-invitation;
- participant role reassignment.

No actor/self-service distinction may be invented for those transitions.

No transition matrix may be inferred from the order of status names.

No lifecycle behavior may be inferred from the existence of an `update` registry operation.

## 6. Required future evidence

A lifecycle transition authority may be opened only when current product evidence establishes, for each supported transition:

1. initiating actor/principal;
2. required Opportunity state;
3. current participant state;
4. resulting participant state;
5. authorization rule;
6. role-specific behavior;
7. whether the transition is reversible;
8. concurrency/stale-state semantics;
9. notification or side-effect requirements, if any;
10. whether the transition is actually implemented and production-supported.

Until those facts are evidenced, the safe canonical behavior is mutation denial.

## 7. Construction consequence

Do **not** add:

- a lifecycle migration;
- a transition function;
- repository transition methods;
- participant self-service transitions;
- administrative transition methods;
- HTTP transition routes;
- runtime UPDATE privilege.

The existing deferred-update boundary is the correct implementation state.

## 8. Qualification boundary

The initial Opportunity Participant capability remains **QUALIFIED / CLOSED**.

Participant lifecycle transitions remain **UNQUALIFIED / NOT AUTHORIZED**.

This is not a regression or an incomplete implementation defect. It is an intentional evidence boundary inherited from the source reconciliation.

## 9. Production safety

No production database, Supabase schema, credentials, routing, provider integration, shadow traffic, or cutover is authorized by this document.
