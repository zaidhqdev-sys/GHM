# Connect ↔ GHM Service Trust Boundary — Implementation Parameters

**Status:** CONSTRUCTION PARAMETER RECORD — CRYPTOGRAPHIC ASSERTION SUB-SLICE
**Parent contract:** `CONNECT_GHM_SERVICE_TRUST_BOUNDARY_CONTRACT.md`
**Baseline:** `0394fe96`
**Construction branch:** `construction/connect-service-trust-boundary`

> **Status reconciliation — 2026-10-12:** The branch/baseline fields above record the original construction slice and are not current mainline references. The ES256 assertion primitive has a verified cryptographic sub-slice; this parameter record does not qualify the full service boundary, production credential issuance, HTTP exposure, routing, or cutover. See the parent contract `CONNECT_GHM_SERVICE_TRUST_BOUNDARY_CONTRACT.md` and `../evidence/CONNECT_SERVICE_ASSERTION_CONSTRUCTION_EVIDENCE.md` for current scope limits.

## Purpose

Freeze the transport-independent cryptographic parameters required for the first service-assertion construction slice. This record does not authorize production credentials, deployment, routing, or Connect migration.

## Service assertion

The first slice uses a compact JWT service assertion signed with ES256.

| Parameter | Frozen value |
|---|---|
| Algorithm | `ES256` |
| Issuer | `ghm-service-auth` |
| Audience | `ghm-connect-service` |
| Subject | authorized Connect integration identifier; never an end-user account id |
| Key identifier | JWT header `kid`, required |
| Issued-at | `iat`, required, integer Unix seconds |
| Expiry | `exp`, required; 5-minute maximum lifetime |
| Request identifier | `jti`, required; opaque printable identifier, 1–128 chars |
| Verification clock tolerance | 60 seconds |
| Credential transport | `Authorization: Bearer <service assertion>` |

## Verification rules

The verifier MUST:

- allow only `ES256`;
- require a known `kid` from configured verification keys;
- require the exact issuer and audience above;
- require `sub`, `iat`, `exp`, and `jti` with the types above;
- reject an assertion whose lifetime exceeds five minutes;
- apply 60 seconds of bounded clock tolerance to expiry/not-before validation;
- return only the verified integration identity and request identifier;
- never manufacture an end-user `AuthContext`;
- never interpret the integration subject as a GHM account id or role.

## Key configuration

The existing ES256 key loader is reused for signing and verification. No signing material is generated or committed by this slice.

Active verification uses `GHM_JWT_ES256_KID` and `GHM_JWT_ES256_PUBLIC_KEY_PEM`. Existing previous-key configuration remains available for bounded key rotation.

## Explicitly deferred

This parameter record does not implement or qualify:

- integration persistence;
- integration enable/disable or revocation state;
- replay/`jti` persistence or replay rejection;
- HTTP route exposure;
- end-user identity carriage;
- identity bootstrap;
- resource dispatch;
- production credential issuance;
- deployment, routing, CORS, or cutover.

Those concerns require their own bounded implementation/qualification evidence.

## Qualification boundary

The original construction branch froze only the ES256 assertion signing/verification primitive; that branch-local scope must not be mistaken for the scope of later work. Since then, integration lifecycle persistence, durable assertion-jti replay protection, trusted request context, governed operation resolution, authorization binding, resource dispatch, and a bounded read-only HTTP endpoint have each received separate construction qualification records. Those records qualify only their stated slices. Full end-to-end service-boundary qualification, additional mutation handlers and business-operation idempotency, deployment-managed credential issuance/rotation, production deployment/routing, broad product exposure, and cutover remain separately gated.
