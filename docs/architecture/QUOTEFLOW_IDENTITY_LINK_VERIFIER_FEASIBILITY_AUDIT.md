# QuoteFlow ↔ GHM Identity Link — Verifier Feasibility Audit

**Status:** AUDITED — REUSE CRYPTOGRAPHIC PRIMITIVES, NOT GHM AUTH TRUST CONFIGURATION

## Findings

The existing GHM auth foundation already demonstrates the required low-level controls:

- ES256 only;
- explicit `kid`;
- verification-key lookup by trusted configuration;
- exact issuer and audience;
- explicit clock tolerance;
- rejection of unknown/retired keys;
- no algorithm fallback.

The existing key loader also supports active/previous public-key overlap.

The existing bearer path correctly keeps authorization state outside the JWT and reloads current account state from GHM.

## Boundary decision

These primitives are suitable for reuse at the cryptographic implementation level.

The QuoteFlow attestation verifier MUST remain a separate service/module with:

- its own configuration loader;
- its own issuer constant;
- its own audience constant;
- its own verification-key configuration;
- its own claim parser;
- its own identity-link claim type;
- its own replay/confirmation integration.

The existing `AccessJwtService` MUST NOT be generalized into a polymorphic verifier that accepts arbitrary issuer/audience/claim sets. That would weaken the trust boundary.

## Operation registry

The existing Connect operation resolver only admits operations already present in the canonical resource registry. Identity-link confirmation must therefore receive its own dedicated capability/operation entry rather than being hidden under a generic Connect operation.

The operation itself does not grant activation authority. Persistence remains responsible for validating the dual-confirmation invariants.

## Important existing constraint

The current Connect authorization binding deliberately requires a pre-existing Supabase external-identity mapping and has `allowBootstrap: false`.

That is correct for ordinary Connect resource authorization and MUST NOT be modified to bootstrap identity links.

Identity-link confirmation is a separate capability.

## Recommended implementation shape

A narrow verifier boundary should expose only:

- verification of a supplied signed QuoteFlow assertion;
- normalized, strongly typed claims;
- no persistence;
- no authorization decision for the GHM side;
- no identity mapping creation;
- no HTTP concerns.

A separate identity-link service will later compose:

1. authenticated GHM context;
2. QuoteFlow attestation verification;
3. exact ceremony/version validation;
4. GHM-side authority validation;
5. transactional persistence.

## Gate result

**PASS — cryptographic primitives are reusable; trust domains remain separate.**

No runtime implementation was changed by this audit.

## Next gate

Define the implementation contract for the dedicated verifier and operation boundary, then build only the verifier + unit qualification before identity-link persistence.

