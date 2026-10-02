# Connect Governed Operation Resolution Qualification

**Status:** CONSTRUCTION QUALIFIED — GOVERNED OPERATION RESOLUTION SUB-SLICE ONLY
**Scope:** canonical naming and registry admission after trusted Connect request-context establishment

## Canonical chain

    verified ES256 service assertion
      → active Connect integration lifecycle
      → trusted Connect integration principal
      → bounded trusted request context
      → governed operation resolution

The resolver consumes an already-qualified trusted request context. It does not verify credentials, establish user identity, authorize a user, or execute a resource service.

## Implemented controls

- trusted request context is required;
- resource and operation are re-checked against the canonical GHM resource registry;
- the resolved capability name is derived by GHM, never caller-selected as a privilege string;
- the result is immutable;
- no end-user AuthContext, role, membership, ownership, or administrator state is manufactured;
- no HTTP endpoint, SQL interface, generic RPC, or resource execution is introduced.

## Explicit non-qualification

This slice does **not** qualify:

- HTTP exposure;
- browser-origin enforcement;
- replay protection or jti persistence;
- end-user identity resolution;
- identity bootstrap;
- GHM authorization against an end-user AuthContext;
- resource-service dispatch/execution;
- durable audit;
- production credentials;
- deployment, routing, DNS, CORS, or cutover;
- Connect authentication/session migration.

## Stop boundary

Construction stops after canonical governed-operation resolution. A later separately authorized slice may bind the resolved operation to GHM authorization and a named resource capability without allowing the Connect integration credential to manufacture end-user privilege.
