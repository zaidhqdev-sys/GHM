# Connect Opportunity Participant Capability Adapter Qualification

## Qualification boundary

**CLOSED / PASS — OPPORTUNITY PARTICIPANT RESOURCE + CONNECT ADAPTER**

This slice exposes the already-qualified Opportunity Participant domain service through the governed Connect capability path. It introduces no second domain owner, provider access, or production routing.

## Capabilities

- `opportunity_participant.read`
- `opportunity_participant.create`
- `opportunity_participant.update`

## Authority

The canonical `OpportunityParticipantService` remains the sole owner of participant persistence and domain rules. The Connect adapter only validates capability alignment and delegates with the authenticated GHM context.

## Safety boundary

- unknown capabilities fail closed
- resource/capability/operation mismatches fail closed
- participant and opportunity identifiers require positive safe integers
- HTTP input rejects unknown fields
- no identity bootstrap is introduced
- no migration, provider, Supabase, or privilege change is part of this slice

## Qualification evidence

### Repository / HTTP

The current `main` line contains the complete adapter and governed HTTP dispatch path:

- `src/integrations/connect/opportunity-participant-adapter.ts`
- `src/integrations/connect/opportunity-participant-adapter.test.ts`
- `src/http/connect-service-router.ts`
- `src/http/connect-service-router.test.ts`

The full repository qualification run on 2026-10-03 passed **515/515 tests**.

### Live PostgreSQL runtime

The dedicated runtime qualification was executed on 2026-10-03 against the canonical GHM PostgreSQL roles and passed:

- runtime identity: PASS
- cleanup authority: PASS
- participant schema presence: PASS
- participant runtime privilege boundary: PASS
- approved business fixture: PASS
- business + membership fixture: PASS
- opportunity creation: PASS
- creator + owner participation atomic binding: PASS
- account participant create/read/list: PASS
- business participant create/member-read: PASS
- unrelated-account read denial: PASS
- unauthorized participant create denial: PASS
- duplicate participant database constraint: PASS
- principal XOR / required validation: PASS
- role/status validation: PASS
- update authority deferred boundary: PASS
- immutable field protection: PASS
- concurrent duplicate creation: PASS
- runtime direct update denial: PASS
- full-list and persisted-row reconciliation: PASS

Final result:

**OPPORTUNITY PARTICIPANT RUNTIME QUALIFICATION PASS**

## Closure

The **Opportunity Participant resource and its Connect capability adapter are now CLOSED / PASS for construction qualification**.

This closes the current participant construction gate. It does not authorize:

- production Connect traffic
- Supabase replacement or data migration
- public/browser HTTP exposure
- provider changes
- shadow qualification
- controlled cutover

Those remain separately governed release boundaries.
