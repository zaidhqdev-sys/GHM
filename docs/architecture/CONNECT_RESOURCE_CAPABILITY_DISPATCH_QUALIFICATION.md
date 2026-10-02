# Connect Resource Capability Dispatch Qualification

## Scope

This document records the bounded construction qualification for dispatching an already-authorized Connect operation to an explicit GHM resource service.

The slice is intentionally limited to the existing `saved_business` resource.

## Contract

The dispatcher accepts a `ConnectAuthorizedOperation` produced by the Connect authorization-binding boundary and a closed, typed capability input.

For this slice the only dispatchable capabilities are:

- `saved_business.read`
- `saved_business.create`
- `saved_business.delete`

Each capability maps to the existing `SavedBusinessService` contract. No SQL, table name, repository method name, arbitrary function name, or caller-selected service is accepted as dispatch input.

## Security invariants

1. The supplied capability must exactly match the capability already authorized for the request.
2. The authorized resource must be `saved_business`.
3. The authorized operation must match the capability's operation.
4. Dispatch occurs only after the Connect authorization-binding stage has produced the GHM `AuthContext`.
5. The dispatcher passes that same `AuthContext` to the typed resource service.
6. Capability or resource mismatches fail before the service is called.
7. The dispatcher does not bootstrap identity, resolve external identities, perform authorization, mutate lifecycle state, or expose HTTP.
8. No generic fallback dispatch path exists.

## Qualification evidence

The focused automated suite covers:

- saved-business item read dispatch;
- saved-business list dispatch;
- saved-business create dispatch with typed input;
- saved-business delete dispatch;
- capability mismatch denial before service access;
- authorized-operation mismatch denial before service access;
- resource mismatch denial before service access.

The full `npm test` suite remains the construction gate and must pass before merge.

## Explicit stop boundary

This slice does not authorize:

- HTTP exposure of Connect operations;
- arbitrary registry-wide Connect dispatch;
- replay-state persistence;
- production traffic changes;
- Supabase cutover;
- new database schema or privilege changes;
- replacement of existing resource services.

The next resource capability can be added only as another explicit handler with its own typed contract and qualification evidence.
