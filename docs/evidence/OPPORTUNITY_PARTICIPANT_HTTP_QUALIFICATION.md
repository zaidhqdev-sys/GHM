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

## Status

HTTP construction is subject to the repository's full local build/test verification. It is not a merge authorization.
