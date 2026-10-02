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

## 5. Test evidence

Unit coverage added for:

- active integration acceptance;
- unknown integration rejection;
- disabled integration rejection;
- revoked integration rejection;
- malformed integration identifier rejection before repository access.

The repository is wired into the normal TypeScript test build through `package.json`.

## 6. Explicitly not qualified

This slice does not qualify:

- ES256 cryptographic verification beyond the already separate assertion qualification;
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

The next slice is not assumed by this document.

The lifecycle authority must be verified against the real migrated PostgreSQL schema before it is treated as live construction evidence. Only after that evidence is green should the next bounded service-trust slice be considered: trusted request envelope and integration-context establishment.

**Result:** GHM now has a bounded construction implementation for persistent Connect integration lifecycle authority, with runtime fail-closed semantics and no HTTP or production exposure.
