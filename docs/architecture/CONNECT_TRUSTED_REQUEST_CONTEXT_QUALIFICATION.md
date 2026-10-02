# Connect Trusted Request Context Qualification

**Status:** CONSTRUCTION QUALIFIED — TRUSTED REQUEST CONTEXT SUB-SLICE ONLY
**Evidence:** 431/431 tests passing; TypeScript build passing on construction branch

## Scope

This slice establishes the in-process trusted context that follows successful Connect service-assertion verification.

Canonical chain:

    verified ES256 service assertion
      → active Connect integration lifecycle
      → trusted integration principal
      → bounded request envelope

The context is not an end-user AuthContext. It identifies the calling Connect integration only. End-user identity, when present, remains an explicit Supabase external identity reference and is not authorization truth.

## Implemented controls

- assertion subject and request identifier must remain internally consistent;
- the integration must exist and be active in GHM;
- disabled/revoked lifecycle state fails closed;
- integration principal is GHM-derived;
- request identifiers are bounded opaque identifiers;
- user-scoped external identity is explicitly { provider: "supabase", subject };
- malformed external identity references fail closed;
- requested resource operation must already exist in the governed resource registry;
- the resulting envelope is immutable;
- no role, membership, ownership, administrator state, or end-user AuthContext is manufactured.

## Explicit non-qualification

This slice does **not** qualify:

- HTTP exposure;
- browser-origin enforcement;
- replay protection or jti persistence;
- end-user identity resolution;
- bootstrap;
- resource dispatch;
- resource authorization;
- durable audit;
- production credentials;
- deployment, routing, DNS, CORS, or cutover;
- Connect authentication/session migration.

The assertion remains responsible for cryptographic verification. This slice consumes only the already-verified assertion result; it does not re-implement JWT verification.

## Stop boundary

Construction stops at trusted request-context establishment. The next slice, if separately authorized, may address the callable service boundary and operation dispatch contract without weakening this trust chain.
