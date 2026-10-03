# QuoteFlow ↔ GHM Identity Link — Attestation Assertion Contract

**Status:** CONTRACT DRAFT — NO SIGNING/VERIFICATION RUNTIME AUTHORIZED

## Canonical assertion

The QuoteFlow attestation authority issues a compact signed assertion for one exact identity-link confirmation.

The assertion is an authorization artifact, not a session token and not a replacement for GHM authentication.

### Required claims

- `iss`: immutable QuoteFlow attestation authority identifier
- `aud`: immutable GHM identity-link audience
- `kid`: signing-key identifier
- `sub`: exact QuoteFlow principal identifier
- `link_type`: `account` or `business`
- `ghm_target`: exact GHM target identifier, encoded as an opaque identifier
- `ceremony_id`: unique ceremony identifier
- `ceremony_version`: expected integer version
- `confirmation_id`: unique single-use confirmation identifier
- `iat`: issued-at Unix timestamp
- `exp`: short expiry timestamp
- `confirmation_side`: fixed value `quoteflow`
- `provenance`: non-secret identifier describing the QuoteFlow authority that performed the confirmation

## Binding rules

GHM MUST compare every identity-link input against the verified assertion. A caller MUST NOT be able to supply a different subject, target, relationship type, ceremony, version, or confirmation identifier after the assertion is verified.

An account assertion can authorize only an account relationship. A business assertion can authorize only a business relationship.

The assertion MUST NOT authorize the GHM-side confirmation. GHM must independently authenticate and authorize that side.

## Freshness and replay

The assertion MUST be short-lived.

GHM MUST reject:

- missing or malformed required claims;
- unknown issuer;
- unknown or retired key;
- invalid signature;
- wrong audience;
- unsupported relationship type;
- wrong confirmation side;
- wrong QuoteFlow subject;
- wrong GHM target;
- wrong ceremony/version;
- future-issued assertion outside permitted clock skew;
- expired assertion;
- previously consumed confirmation identifier.

A valid assertion may be consumed at most once for its ceremony/version.

## Key rotation

Assertions identify their signing key with `kid`.

GHM verification trust may contain an active key and a deliberately retained previous public key during a controlled rotation window. Rotation MUST NOT silently broaden trust to arbitrary keys.

Retirement of a key MUST stop acceptance of new assertions from that key while preserving historical provenance.

## No bearer-secret persistence

GHM MUST NOT persist the raw signed assertion as the canonical identity-link relationship record.

GHM persists the confirmation identifier, issuer/provenance, exact binding values, ceremony/version, and confirmation timestamp sufficient for audit and replay prevention.

## Security boundary

The assertion private key belongs exclusively to the QuoteFlow attestation authority.

It MUST NOT be:

- embedded in the mobile application;
- stored in the QuoteFlow repository;
- exposed to browser/mobile JavaScript;
- shared with GHM;
- reused as the GHM Connect service key.

## Migration compatibility

The assertion contract deliberately does not encode a dependency on Supabase.

The QuoteFlow attestation authority may change how it authenticates the current QuoteFlow principal during migration while preserving the same signed assertion contract consumed by GHM.

## Qualification requirement

Before runtime implementation, qualification MUST prove signature verification, issuer/audience/key enforcement, exact target binding, ceremony/version binding, expiry/future-time handling, replay rejection, key rotation/retirement, malformed claim rejection, account/business separation, and fail-closed behavior.

**Fail closed:** no valid attestation means no QuoteFlow confirmation and no activation.
