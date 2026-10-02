# Connect Service HTTP Read Boundary Qualification

## Status

**CONSTRUCTION QUALIFIED — SERVICE HTTP READ BOUNDARY SUB-SLICE ONLY**

## Scope

This slice establishes the first callable HTTP service-to-service boundary for Zaid Connect into GHM.

It is deliberately limited to the existing 'saved_business.read' capability.

The route is:

POST /api/v1/connect/service

The service credential is carried as an HTTP Bearer credential and is verified by the existing ES256 Connect service-assertion primitive.

## Verified authority chain

Connect service assertion
        ↓
active Connect integration lifecycle
        ↓
trusted Connect request context
        ↓
canonical GHM operation resolution
        ↓
Connect external identity resolution
        ↓
current GHM account authorization state
        ↓
GHM resource authorization
        ↓
saved_business.read capability
        ↓
typed SavedBusinessService

The HTTP boundary does not create a second authorization system.

## HTTP controls

- Service credential is required in the Authorization header.
- Browser-originated requests carrying an Origin header are rejected.
- Supabase identity is carried separately from the service credential.
- External identity bootstrap is explicitly disabled.
- The operation must pass the canonical GHM resource registry.
- Only 'saved_business.read' is callable through this slice.
- Request input is closed and typed for the saved-business read operation.
- Capability dispatch remains explicit and typed.
- Authentication/trust failures use generic unauthorized responses.
- Credentials and raw Authorization headers are not logged.
- Unexpected failures log only the error class/name.

## Replay boundary

This slice exposes only a read operation. It does not claim replay protection.

The service assertion jti remains request-identifier carriage only. Replay persistence/detection for non-idempotent mutations remains separately gated.

No mutation capability is exposed by this HTTP boundary.

## Resource boundary

The route does not accept:

- table names;
- SQL;
- database functions;
- repository method names;
- arbitrary handler names;
- caller-selected privileged AuthContext.

It invokes only the already-qualified typed Saved Business service through the already-qualified Connect capability dispatcher.

## Qualification evidence

Focused HTTP tests cover:

1. full assertion → lifecycle → trusted-context → operation → identity → authorization → dispatch chain;
2. browser-originated request rejection;
3. missing service credential rejection;
4. disabled integration rejection;
5. mutation capability rejection;
6. unmapped identity rejection;
7. identity bootstrap remains disabled;
8. malformed request rejection.

The repository-wide npm test and TypeScript build remain the merge gates.

## Explicit stop boundary

This qualification does not authorize:

- Connect mutation HTTP operations;
- replay persistence/detection;
- production credentials;
- production routing or DNS;
- Supabase session migration;
- production Connect cutover;
- shadow traffic;
- provider cleanup;
- arbitrary registry-wide HTTP dispatch;
- storage, realtime, payment, or other product adapters.

## Next bounded work

Any additional Connect HTTP capability must be added as an explicit, typed operation with its own qualification evidence.

Mutation operations require a separately qualified replay/idempotency boundary before they are exposed through the service transport.
