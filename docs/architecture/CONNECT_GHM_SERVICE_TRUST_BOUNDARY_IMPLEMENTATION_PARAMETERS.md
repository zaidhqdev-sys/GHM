# Connect ↔ GHM Service Trust Boundary — Implementation Parameters

**Status:** CONSTRUCTION PARAMETER RECORD — CRYPTOGRAPHIC ASSERTION SUB-SLICE
**Parent contract:** `CONNECT_GHM_SERVICE_TRUST_BOUNDARY_CONTRACT.md`
**Baseline:** `0394fe96`
**Construction branch:** `construction/connect-service-trust-boundary`

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

The frozen implementation in this branch is limited to signing/verifying the ES256 service assertion. It must not be described as a qualified HTTP/service boundary. Integration persistence, enable/disable/revocation, replay-state enforcement, HTTP exposure, end-user identity carriage, resource dispatch, production issuance, deployment, routing, and cutover remain deferred and separately gated.
