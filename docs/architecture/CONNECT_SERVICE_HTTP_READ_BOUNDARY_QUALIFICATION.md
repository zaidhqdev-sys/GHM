# Connect Service HTTP Read Boundary Qualification

## Migration-state boundary — legacy identity input is not target qualification (2026-10-15)

This qualification records the bounded service-to-service read boundary as tested, including its legacy Connect external-identity input. The statements below that carry a Supabase identity reference describe the qualified source-era sub-slice only; they do **not** qualify the approved target runtime. The target must remove active Supabase runtime dependencies and establish GHM-native identity/session semantics through a separately contracted and qualified path. Do not infer target authentication, session migration, browser-safe access, broader workflow parity, deployment readiness, or production cutover from this read-boundary result. Current target status is governed by `GHM_CURRENT_STATE.md`, `GHM_CONNECT_PRODUCTION_READINESS_GAP_REGISTER.md`, the dated migration handover, and target-specific qualification evidence. No implementation or cutover is authorized by this clarification.


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

This slice exposes only a read operation and does not itself qualify mutation idempotency. Durable, atomic consumption of the service assertion `jti` was subsequently qualified as a separate middleware/security slice; see `CONNECT_SERVICE_ASSERTION_REPLAY_QUALIFICATION.md` and `CONNECT_SERVICE_REPLAY_PROTECTION_QUALIFICATION.md`. That assertion-replay control does not by itself provide business-operation idempotency for future non-idempotent mutation handlers, which remain separately gated.

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

Mutation operations require a separately qualified replay/idempotency boundary before they are exposed through the service transport. The assertion replay-protection sub-slice has since been qualified and is recorded in `CONNECT_SERVICE_ASSERTION_REPLAY_QUALIFICATION.md`; that only establishes atomic assertion-`jti` consumption, not business-operation idempotency or qualification of additional mutation handlers. Those remain separate gates.
