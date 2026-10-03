# Connect Opportunity Participant Capability Adapter Qualification

## Qualification boundary

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

## Qualification status

Construction evidence is recorded here. Final PASS requires the repository full test suite and HTTP qualification to complete successfully.
