# QuoteFlow ↔ GHM Identity Link — Key Trust Governance Reconciliation

**Status:** AUDITED — NO EXISTING GENERAL KEY-REGISTRATION AUTHORITY; TRUST ANCHOR MUST REMAIN DEPLOYMENT/GOVERNANCE CONTROLLED

## Audit result

The current GHM repository has a mature ES256 configuration boundary for GHM-issued authentication:

- active private/public key material is loaded from deployment environment configuration;
- key identity is selected by `kid`;
- an optional previous public key supports controlled verification overlap;
- verification is explicitly constrained to ES256 and the configured issuer/audience.

This mechanism belongs to the **GHM-issued service/authentication trust domain**.

The repository does not currently expose a general-purpose runtime public-key registration, replacement, or retirement authority that can safely be reused for QuoteFlow attestation keys.

## Decision

Do **not** create a generic key-management API.

For the first QuoteFlow attestation trust anchor, the public verification key MUST be introduced through a narrowly scoped GHM deployment/bootstrap configuration boundary, with no runtime end-user mutation path.

This is intentionally smaller than a general key registry.

The QuoteFlow attestation key is a separate trust domain from GHM's own ES256 signing key and MUST use a distinct issuer/audience and key namespace.

## Rotation

Until a dedicated key lifecycle resource is separately qualified, QuoteFlow attestation rotation remains a governed deployment change:

1. configure the new QuoteFlow public key alongside the old verification key;
2. qualify the new key and issuer/audience binding;
3. switch QuoteFlow issuance to the new `kid`;
4. retain the old public key only for the bounded overlap period;
5. retire the old key through deployment configuration;
6. preserve historical confirmation provenance.

No HTTP key-management endpoint is required.

## Security boundary

The following remain forbidden:

- mobile key registration;
- caller-supplied public keys;
- arbitrary JWKS trust;
- reusing GHM's own signing key;
- storing QuoteFlow private keys in GHM;
- runtime self-service key changes;
- broad admin key-management privileges.

## Important distinction

This decision does not mean the existing GHM ES256 key loader becomes the QuoteFlow trust store unchanged.

The implementation must provide a dedicated QuoteFlow-attestation trust configuration with its own issuer/audience and verification-key set, even if the underlying cryptographic loading/rotation primitives are reused.

## Next gate

Define the exact deployment configuration names, trust-domain constants, rotation overlap semantics, and qualification tests for the dedicated QuoteFlow attestation verifier.

Only then should runtime identity-link persistence be implemented.

**Fail closed:** no explicitly configured and qualified QuoteFlow verification key means no QuoteFlow confirmation.
