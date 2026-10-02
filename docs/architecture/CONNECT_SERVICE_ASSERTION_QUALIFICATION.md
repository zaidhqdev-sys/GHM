# GHM ↔ Connect Service Assertion Cryptographic Qualification

**Status:** CONSTRUCTION QUALIFIED — CRYPTOGRAPHIC ASSERTION SUB-SLICE ONLY  
**Branch:** `construction/connect-service-assertion-qualification`  
**Baseline:** `main` at 2026-10-02  
**Scope:** ES256 Connect service assertion signing and verification

## 1. Qualification boundary

This qualification covers only the transport-independent cryptographic assertion primitive already constructed under:

- `src/integrations/connect/service-assertion.ts`
- `src/integrations/connect/service-assertion.test.ts`
- `CONNECT_GHM_SERVICE_TRUST_BOUNDARY_CONTRACT.md`
- `CONNECT_GHM_SERVICE_TRUST_BOUNDARY_IMPLEMENTATION_PARAMETERS.md`

It establishes that the assertion primitive enforces the frozen cryptographic parameters. It does **not** qualify a public HTTP/service boundary.

## 2. Frozen parameters verified

- Algorithm: ES256 only.
- Issuer: `ghm-service-auth`.
- Audience: `ghm-connect-service`.
- Subject: Connect integration identifier, never an end-user account id.
- `kid`: required and resolved only from configured verification keys.
- `iat`, `exp`, `jti`: required.
- Maximum assertion lifetime: 5 minutes.
- Verification clock tolerance: 60 seconds.
- `jti` is the request identifier.
- Previous configured verification key may be accepted during bounded key rotation.
- Signing material is configuration-only and is not committed.

## 3. Security invariants verified

The implementation:

1. rejects non-ES256 algorithms;
2. rejects unknown/retired key identifiers;
3. verifies exact issuer and audience;
4. requires printable bounded integration and request identifiers;
5. requires integer issuance and expiry timestamps;
6. rejects lifetimes greater than five minutes;
7. rejects future-issued assertions beyond the configured tolerance;
8. returns only verified integration identity and request identifier;
9. does not manufacture an end-user `AuthContext`;
10. does not interpret the service subject as a GHM account id or role;
11. does not accept an end-user Supabase JWT as a GHM credential;
12. supports the configured previous verification key for rotation.

## 4. Test evidence

The current mainline full suite was locally verified at:

- **421 pass**
- **0 fail**
- **0 cancelled**
- **0 skipped**

The service assertion test suite is part of the canonical test inclusion and covers:

- sign/verify;
- issuer/audience/algorithm rejection;
- unknown key and expiry rejection;
- malformed identifiers and excessive lifetime rejection;
- previous-key rotation verification.

## 5. Explicitly not qualified

This qualification does **not** establish:

- integration persistence;
- integration enable/disable/revocation state;
- replay/`jti` persistence or replay rejection;
- HTTP exposure;
- end-user identity carriage;
- identity bootstrap;
- resource dispatch;
- production credential issuance;
- deployment/routing/CORS;
- Connect session migration;
- production cutover;
- shadow traffic;
- provider cleanup.

## 6. Stop boundary

The next service-trust construction slice must not be invented from this qualification.

Any construction involving integration lifecycle, replay state, HTTP exposure, end-user identity carriage, or resource dispatch requires its own evidence-backed contract and explicit authorization.

**Result:** The cryptographic service-assertion primitive is construction-qualified and may be reused as a foundation for the next separately governed service-trust slice.
