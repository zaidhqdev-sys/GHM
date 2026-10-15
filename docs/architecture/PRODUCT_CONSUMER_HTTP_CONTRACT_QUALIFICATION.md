# Product Consumer HTTP Contract Qualification

## Migration-state boundary — GHM-native Connect target (2026-10-15)

**Target qualification warning:** This document preserves the shared semantic HTTP envelope and its original Connect construction integration. Its current-Connect notes below still describe the legacy Supabase external-identity reference and are evidence of that bounded source-era contract only. They do not qualify the approved target runtime, which must remove active Supabase runtime dependencies and use GHM-native identity/session semantics. Do not copy the legacy provider field into the target contract or treat this document's construction qualification as proof of target identity, session migration, browser-safe access, end-to-end product parity, deployment readiness, or cutover authorization. The current target boundary and execution state are governed by `GHM_CURRENT_STATE.md`, `GHM_CONNECT_PRODUCTION_READINESS_GAP_REGISTER.md`, the dated Connect migration handover, and the separately qualified target contract when one exists. No implementation or cutover is authorized by this clarification.


## Status

**CONSTRUCTION QUALIFIED — SHARED PRODUCT CONSUMER HTTP SEMANTIC CONTRACT ONLY**

## Purpose

This slice freezes the shared semantic request/response contract used when a product consumes governed GHM capabilities over service-to-service HTTP.

The contract is intentionally semantic rather than a generic product router. Product-specific routes remain responsible for establishing the correct service identity, credential audience, integration lifecycle, and product-specific external identity provider.

## Canonical request envelope

```json
{
  "operation": {
    "resource": "<registered GHM resource>",
    "operation": "<registered GHM operation>"
  },
  "externalIdentity": {
    "provider": "<product identity provider>",
    "subject": "<product external subject>"
  },
  "input": {}
}
```

`input` is optional at the shared envelope level. Each capability owns its own closed input contract and validation.

The product may identify its external identity, but GHM remains authoritative for mapping that identity to a GHM account and for authorization. The service credential is separate from the end-user identity envelope.

## Canonical response envelope

Successful capability execution returns:

```json
{ "result": <capability result> }
```

The shared contract does not expose tables, SQL, database functions, repository methods, or arbitrary handler names.

## Semantic error vocabulary

The contract reserves these stable error codes:

- `unauthorized`
- `forbidden`
- `invalid_request`
- `not_found`
- `validation_failed`
- `conflict`
- `invalid_state`
- `dependency_failure`
- `internal_error`

Individual routes may expose only the subset justified by their qualified capabilities. Authentication and trust failures remain generic.

## Product-specific boundary

This qualification does **not** create a generic `/api/v1/product/service` endpoint.

For the current Connect construction, the route remains:

`POST /api/v1/connect/service`

Connect-specific authority remains responsible for its ES256 service assertion, Connect integration lifecycle, replay protection, Supabase external identity reference, and browser-origin rejection.

A future QuoteFlow route must establish its own service identity and credential audience rather than reusing Connect authority.

## Verified construction

The shared parser is used by the existing Connect service route. Focused tests verify:

1. canonical envelope parsing;
2. omitted input preservation;
3. malformed envelope rejection;
4. continued Connect-specific provider validation at the product boundary.

The existing Connect HTTP qualification remains the authority for the full Connect execution chain. This document only freezes the reusable semantic envelope.

## Explicit non-goals

This slice does not authorize:

- generic registry-wide HTTP dispatch;
- automatic exposure of every GHM resource;
- product credential issuance or rotation;
- end-user identity bootstrap;
- Connect or QuoteFlow auth/session migration;
- production routing, DNS, CORS, or cutover;
- storage, realtime, payment, webhook, or provider adapters;
- business-level idempotency beyond the separately qualified service-assertion replay boundary;
- bypassing resource-specific authorization, validation, ownership, membership, or lifecycle rules.

## Stop boundary

The next product construction slice may use this semantic contract, but must add an explicit product-specific adapter and capability qualification rather than treating the shared envelope as authorization or execution authority.
