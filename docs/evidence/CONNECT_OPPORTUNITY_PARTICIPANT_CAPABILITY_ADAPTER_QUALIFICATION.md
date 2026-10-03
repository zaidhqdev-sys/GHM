# Connect Opportunity Participant Capability Adapter Qualification

## Qualification boundary

**CONSTRUCTION QUALIFIED — OPPORTUNITY PARTICIPANT CAPABILITY ADAPTER SUB-SLICE**

This slice exposes the already-qualified Opportunity Participant domain service through the governed Connect capability path. It does not introduce persistence, provider access, or a second domain owner.

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

The current `main` line contains the complete adapter and governed HTTP dispatch path, including:

- `src/integrations/connect/opportunity-participant-adapter.ts`
- `src/integrations/connect/opportunity-participant-adapter.test.ts`
- `src/http/connect-service-router.ts`
- `src/http/connect-service-router.test.ts`

The full repository qualification run on 2026-10-03 passed **515/515 tests**, including the Opportunity Participant adapter and governed Connect service HTTP coverage. The adapter therefore satisfies its construction-level unit/HTTP qualification gate.

This evidence does **not** claim live PostgreSQL runtime qualification for the participant resource itself. The dedicated `qualify:opportunity-participant-runtime` harness remains the required runtime evidence before the resource can be treated as runtime-qualified.

## Closure

The **Connect Opportunity Participant adapter seam is CONSTRUCTION QUALIFIED**.

The underlying Opportunity Participant resource remains governed by its existing resource contract and runtime qualification boundary. This adapter qualification does not authorize:

- production Connect traffic
- Supabase replacement or data migration
- public/browser HTTP exposure
- provider changes
- shadow qualification
- controlled cutover
- reopening the Opportunity Participant resource

