# QuoteFlow ↔ GHM Identity Link — Attestation Verifier Configuration Contract

**Status:** CONFIGURATION CONTRACT — IMPLEMENTATION NOT YET AUTHORIZED

## Purpose

This contract defines the dedicated GHM trust configuration used to verify QuoteFlow identity-link attestations. It is deliberately separate from GHM's own JWT signing configuration.

## Dedicated configuration

The implementation SHALL use these deployment-only configuration values:

- `GHM_QUOTEFLOW_ATTESTATION_ISSUER`
- `GHM_QUOTEFLOW_ATTESTATION_AUDIENCE`
- `GHM_QUOTEFLOW_ATTESTATION_ACTIVE_PUBLIC_KEY_PEM`
- `GHM_QUOTEFLOW_ATTESTATION_ACTIVE_KID`
- `GHM_QUOTEFLOW_ATTESTATION_PREVIOUS_PUBLIC_KEY_PEM` (optional)
- `GHM_QUOTEFLOW_ATTESTATION_PREVIOUS_KID` (optional)

No private QuoteFlow attestation key is configured in GHM.

Values are deployment trust configuration, not request data.

## Trust-domain constants

The issuer identifies the independently governed QuoteFlow attestation authority.

The audience identifies the GHM identity-link attestation verifier.

Issuer and audience MUST be exact-match values. Prefix matching, host-only matching, caller-selected audiences, and implicit defaults are forbidden.

The QuoteFlow attestation verifier MUST NOT accept the existing GHM JWT issuer/audience as a substitute.

## Key rules

The active key pair is identified by `kid`.

The previous public key MAY coexist with the active key only during a bounded rotation overlap.

Rules:

- active key and `kid` are mandatory;
- previous key and previous `kid` are both present or both absent;
- active and previous `kid` MUST differ;
- PEM material MUST be a valid PKCS#8 public key;
- unknown `kid` fails closed;
- duplicate `kid` values fail configuration validation;
- no request may supply or override a verification key;
- no runtime mutation is exposed.

## Rotation

Rotation is deployment-controlled:

1. deploy the new public key as active while retaining the old public key as previous;
2. qualify configuration and verifier behavior;
3. QuoteFlow begins issuing the new `kid`;
4. allow only the explicitly bounded overlap;
5. remove the previous key;
6. restart/reload through the governed deployment mechanism;
7. assertions signed by the retired key are rejected thereafter.

Rotation MUST NOT rewrite historical confirmation provenance.

## Failure behavior

GHM startup MUST fail closed if:

- issuer is missing;
- audience is missing;
- active key or active `kid` is missing;
- only one previous-key setting is supplied;
- active and previous `kid` are equal;
- key material is malformed;
- trust configuration violates the dedicated trust-domain requirements.

At verification time, invalid configuration or an unavailable trusted key MUST result in rejection, never fallback to GHM's own signing keys or another provider.

## Clock policy

The verifier SHALL use a small explicit clock-skew allowance, defined in the implementation qualification, while requiring:

- `iat` not materially in the future;
- `exp` present;
- `exp > iat`;
- `exp` within the contract's maximum assertion lifetime.

The caller cannot choose a longer accepted lifetime.

## Qualification matrix

The dedicated verifier qualification MUST prove:

1. valid active-key assertion accepted;
2. valid previous-key assertion accepted only during configured overlap;
3. retired previous-key assertion rejected;
4. unknown `kid` rejected;
5. invalid signature rejected;
6. wrong issuer rejected;
7. wrong audience rejected;
8. malformed public key rejected at configuration;
9. missing paired previous-key setting rejected;
10. duplicate/equal key IDs rejected;
11. request-supplied key ignored/rejected;
12. expired assertion rejected;
13. materially future assertion rejected;
14. excessive lifetime rejected;
15. account/business relationship separation enforced;
16. exact subject/target/ceremony/version binding enforced;
17. replayed confirmation rejected;
18. verifier never falls back to GHM JWT signing keys.

## Explicit non-goals

This contract does not authorize:

- adding environment values to production;
- generating or provisioning keys;
- identity-link tables;
- identity-link HTTP routes;
- QuoteFlow production changes;
- automatic matching;
- migration/import;
- shadow traffic;
- production cutover.

## Next gate

After this configuration contract is accepted, the next construction step is a **read-only implementation feasibility audit** of the existing GHM JWT verification/configuration primitives and operation registry, followed by a dedicated verifier design.

No identity-link persistence mutation is authorized by this document.
