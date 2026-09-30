# Opportunity Participant HTTP Boundary Reconciliation

## Scope

This records the HTTP boundary for the already-qualified Opportunity Participant runtime resource.

## Canonical authority

The canonical service exposes read, list, and create operations. An update method exists in the service contract, but the repository explicitly rejects participant updates until a concrete transition authority is qualified.

## HTTP decision

Exposed routes:
- GET /api/v1/opportunities/:opportunityId/participants
- GET /api/v1/opportunity-participants/:participantId
- POST /api/v1/opportunity-participants

PATCH is intentionally not exposed.

## Security boundary

Every route requires authentication, registered operation authorization, and the existing resource authorization primitive. The repository remains authoritative for opportunity visibility, participant visibility, and participant-management authority.

Create input is restricted to opportunityId, accountId or businessId, participationRole, and participationStatus. Server-owned fields are rejected.

## Deferred authority

Participant status/role updates are not converted into generic HTTP mutation because the runtime qualification explicitly records that transition authority is not yet qualified.

## Non-scope

No deletion, arbitrary mutation, payment/provider integration, commercial entitlement, Contact Access, or domain reopening is introduced.
