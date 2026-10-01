# Connect Service Assertion Construction Evidence

**Status:** CONSTRUCTION EVIDENCE — CRYPTOGRAPHIC SUB-SLICE VERIFIED
**Construction branch:** `construction/connect-service-trust-boundary-reconciled`
**Mainline baseline:** `3407a903d9937f76823cafa6b026a60661d06048`
**Reconciliation commit:** `e0c761a77c0965b061d5909027bbab006c5c7ef7`
**Evidence date:** 2026-10-01

## Scope

This record covers only the ES256 service-assertion primitive. It does **not** qualify the broader Connect ↔ GHM service trust boundary.

## Repository implementation

- `src/integrations/connect/service-assertion.ts`
- `src/integrations/connect/service-assertion.test.ts`
- `docs/architecture/CONNECT_GHM_SERVICE_TRUST_BOUNDARY_IMPLEMENTATION_PARAMETERS.md`

## Local verification

Executed from `C:\GHM` on the reconciled branch:

1. `npm run migrate` — PASS
   - all 15 documented historical migration provenance exceptions accepted;
   - no new migration was introduced by this slice.
2. `npm test` — PASS
   - 414 tests passed;
   - 0 failed, 0 skipped, 0 todo.
3. `npm run build` — PASS.

## Assertion-specific evidence

The test suite directly demonstrates:

- valid Connect integration assertion signs and verifies;
- wrong issuer rejected;
- wrong audience rejected;
- wrong algorithm rejected;
- unknown `kid` rejected;
- expired assertion rejected;
- malformed integration identity rejected;
- malformed request identifier rejected;
- excessive assertion lifetime rejected;
- previous verification key accepted during rotation overlap;
- ES256 assertion uses the frozen issuer, audience, `kid`, `iat`, `exp`, and `jti) contract;
- service assertion subject represents the integration identity, not an end-user GHM account.

## Explicit non-evidence / deferred controls

The implementation intentionally does **not** claim qualification for:

- integration persistence;
- integration enable/disable or revocation;
- replay/jti persistence;
- HTTP exposure;
- browser-origin enforcement at an exposed route;
- end-user identity carriage;
- identity bootstrap through the service boundary;
- resource operation dispatch;
- production credential issuance;
- deployment, routing, cutover, or production credentials.

Those controls remain governed by the parent Service Trust Boundary Contract and require separate construction and qualification evidence.

## Qualification disposition

**Disposition: CRYPTOGRAPHIC CONSTRUCTION VERIFIED; PARENT SERVICE TRUST BOUNDARY REMAINS UNQUALIFIED.**

This record must not be interpreted as authorization to expose the assertion verifier over HTTP, issue production Connect credentials, or bypass the existing GHM authorization boundary.
