# Opportunity Participant HTTP Qualification

## Qualification boundary

The HTTP qualification covers only the currently authorized read/list/create surface.

## Verified checks

- authentication required
- resource operation must be registered
- resource authorization must pass
- opportunity and participant identifiers must be positive safe integers
- canonical create fields are accepted
- server-owned fields are rejected
- authenticated context is passed to the service
- not-found responses are mapped without disclosure
- update/PATCH is intentionally absent because transition authority is not qualified

## Runtime authority

The existing Opportunity Participant runtime qualification remains the source of truth for domain authority, including visibility, management permission, principal XOR validation, duplicate protection, and the explicit deferred-update boundary.

## Status reconciliation — 2026-10-12

The original note below was written before the router's later mainline authentication-middleware wiring fixes. The Opportunity Participant HTTP router is integrated on `main`; the later repository-wide checkpoint passed 557/557 tests. The old statement that this record “is not a merge authorization” is historical, not a current block on the merged construction slice.

The qualified HTTP surface remains read/list/create only. PATCH/update remains absent because transition authority is not qualified. This record does not authorize production exposure, broader mutation, or cutover.
