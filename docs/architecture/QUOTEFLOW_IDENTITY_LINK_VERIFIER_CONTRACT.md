# QuoteFlow ↔ GHM Identity Link — Attestation Verifier Contract

**Status:** CONSTRUCTION SLICE — DEDICATED VERIFIER ONLY

## Purpose

This module verifies a signed QuoteFlow identity-link attestation. It is deliberately separate from GHM bearer authentication.

## Trust boundary

The verifier has its own issuer, audience, ceremony, version, claim type, and verification-key input. It does not generalize or modify the existing AccessJwtService.

The verifier reuses only the existing ES256 key-map primitive and the jsonwebtoken verification mechanism already used by GHM.

## Accepted contract

A valid attestation must contain:

- sub: positive safe-integer QuoteFlow identity id encoded as decimal text;
- iss: quoteflow;
- aud: ghm-identity-link;
- ceremony: identity-link;
- version: 1;
- iat and exp: positive Unix-second integers with exp > iat;
- JWT header alg: ES256;
- JWT header kid: a configured active or previous QuoteFlow verification key.

Issuer, audience, algorithm, key id, and clock tolerance are enforced during cryptographic verification. Ceremony and version are validated after verification.

## Deliberate non-responsibilities

This slice does not:

- authenticate a GHM bearer request;
- authorize an identity-link operation;
- create or mutate an identity mapping;
- persist replay/confirmation state;
- expose HTTP routes;
- load production QuoteFlow key configuration;
- depend on Supabase.

## Qualification

Unit qualification covers acceptance of a valid attestation and fail-closed rejection of wrong issuer, audience, ceremony, version, unknown key id, non-ES256 header, malformed subject, and invalid timestamp ordering.

The next construction slice may compose this verifier with the already-defined identity-link authority and dual-confirmation contracts. Persistence remains a separate gate.