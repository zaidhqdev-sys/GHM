# QuoteFlow ↔ GHM Identity Link Decision Boundary

## Status

**CONSTRUCTION SLICE — PERSISTENCE-FREE DECISION BOUNDARY**

This slice composes the qualified QuoteFlow attestation verifier contract with authenticated GHM-side confirmation and deterministic exact-pair decisions.

It does not persist links.

## Boundary

`QuoteFlow attestation → verified QuoteFlow identity → authenticated GHM confirmation → exact-pair decision → persistence gate`

The QuoteFlow attestation is cryptographically verified by the dedicated verifier.

For an account link, the GHM account identity is derived from the authenticated GHM context. A caller cannot supply an arbitrary GHM account identifier as proof.

For a Business link, the GHM Business identifier must already have been resolved through an authenticated and authorized GHM Business-membership decision. The decision boundary accepts that resolved identifier; it does not treat a caller-supplied arbitrary identifier as authority.

## Deterministic outcomes

The decision boundary returns either:

- `eligible` for an exact, non-conflicting pair;
- `reject` with a stable reason for an authority failure.

Rejection reasons include:

- missing GHM confirmation;
- confirmation-kind mismatch;
- account principal mismatch;
- missing QuoteFlow organization;
- account-link conflict;
- Business-link conflict;
- invalid GHM context.

An identical existing active mapping is idempotently eligible. An incompatible mapping is rejected.

## Persistence boundary

This slice intentionally has no database writes and no HTTP.

A future persistence layer must atomically enforce:

- uniqueness/cardinality;
- exact pair;
- lifecycle state;
- immutable provenance;
- replay/idempotency;
- revocation;
- concurrency behavior.

## Explicit non-goals

No:

- identity-link tables;
- confirmation tables;
- mapping RPCs;
- HTTP routes;
- adapters;
- QuoteFlow changes;
- Supabase changes;
- production key configuration;
- cutover.

## Qualification

The unit qualification covers:

- authenticated GHM account derivation;
- resolved Business derivation;
- missing confirmation;
- exact account match;
- wrong account rejection;
- account conflict;
- identical account idempotency;
- Business kind mismatch;
- missing organization;
- Business conflict;
- identical Business idempotency.

Persistence remains separately gated.
