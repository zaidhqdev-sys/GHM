# GHM ↔ Connect Integration Lifecycle Construction Qualification

**Status:** CONSTRUCTION QUALIFIED — INTEGRATION LIFECYCLE SUB-SLICE ONLY  
**Branch:** `construction/connect-integration-lifecycle`  
**Baseline:** `main` at `ab69ef1`  
**Scope:** Persistent GHM-authoritative Connect integration identity and lifecycle gating

## 1. Qualification boundary

This slice adds the persistence and runtime read boundary required to distinguish a known, active Connect integration from an unknown, disabled, or revoked integration.

It does not expose HTTP, issue production credentials, perform deployment, or migrate Connect sessions.

The ES256 assertion primitive remains a separate cryptographic slice. Assertion verification itself remains transport-independent and does not query lifecycle state synchronously.

## 2. Canonical lifecycle model

GHM owns `ghm.connect_integration` with:

- stable integration identifier;
- human-readable display name;
- lifecycle state: `active | disabled | revoked`;
- creation/update timestamps;
- disabled timestamp;
- revoked timestamp.

The integration identifier is the same bounded service subject represented by the ES256 assertion `sub` claim.

The table is not a credential store.

## 3. Persistence authority

Runtime access is deliberately narrow:

- `ghm_runtime` receives SELECT access to the lifecycle row;
- lifecycle mutation functions are SECURITY DEFINER and owned by `ghm_schema_owner`;
- mutation functions are not granted to PUBLIC or `ghm_runtime`;
- runtime lookup uses the named `ghm.connect_integration_get(text)` function;
- no generic table/RPC surface is introduced.

Lifecycle transitions:

- create → active;
- active → disabled;
- disabled → active;
- active/disabled → revoked;
- revoked is terminal.

A revoked integration cannot be re-enabled.

## 4. Runtime fail-closed rule

`requireActiveConnectIntegration()`:

1. validates the integration identifier before repository access;
2. rejects unknown integrations;
3. rejects disabled integrations;
4. rejects revoked integrations;
5. returns the canonical lifecycle record only when status is active.

The lifecycle module does not manufacture user identity, roles, membership, ownership, or AuthContext.

## 5. Qualification evidence

Local full suite:

- **426 tests**
- **426 passed**
- **0 failed**
- build passed

Live PostgreSQL qualification:

- **6 tests**
- **6 passed**
- **0 failed**

The live qualification verified:

1. runtime can read an active integration and the active gate accepts it;
2. disabled integration is rejected by the runtime gate;
3. disabled integration can return to active;
4. revoked integration is rejected;
5. revoked integration cannot be re-enabled;
6. runtime cannot mutate lifecycle directly.

The migration was applied successfully through the normal GHM migration runner. No manual database mutation was used.

## 6. Explicitly not qualified

This slice does not qualify:

- ES256 cryptographic verification beyond the separate assertion qualification;
- replay/`jti` persistence;
- HTTP exposure;
- request envelopes;
- end-user identity carriage;
- identity bootstrap;
- resource dispatch;
- production credential issuance;
- deployment/routing/CORS;
- session migration;
- production cutover;
- provider cleanup.

## 7. Stop boundary

The next bounded service-trust slice is trusted request-envelope and integration-context establishment.

That next slice must not be treated as implemented merely because the lifecycle authority now exists.

**Result:** GHM has a construction-qualified persistent Connect integration lifecycle authority with runtime fail-closed semantics and verified least-privilege database access, while the broader service boundary remains separately gated.
