# QuoteFlow ↔ GHM Identity Link — QuoteFlow Confirmation Assertion Contract

**Status:** CONTRACT DRAFT — QUOTEFLOW-SIDE CONFIRMATION MUST BE INDEPENDENTLY AUTHENTICATED BEFORE PERSISTENCE IMPLEMENTATION

## Purpose

The dual-sided identity-link decision requires two independently authoritative confirmations. A GHM service assertion proving that a Connect integration request is authentic proves the **integration**, not that QuoteFlow independently approved a specific identity link.

Therefore a generic Connect service JWT MUST NOT be treated as QuoteFlow confirmation.

## Required QuoteFlow confirmation evidence

A QuoteFlow-side confirmation presented to GHM MUST be cryptographically or otherwise independently authenticated by a previously qualified QuoteFlow authority and MUST bind all of:

- confirmation side = QuoteFlow;
- relationship type = account or business;
- exact QuoteFlow subject;
- exact GHM target identifier;
- ceremony identifier;
- expected ceremony version;
- confirmation timestamp;
- unique confirmation identifier / replay-resistant identifier;
- issuer/audience or equivalent authority binding;
- expiration/freshness;
- sufficient provenance to establish which QuoteFlow authority confirmed the relationship.

The assertion MUST NOT permit the caller to substitute the target IDs after confirmation.

## Separation of authorities

The existing GHM Connect service assertion:

- authenticates the Connect integration;
- identifies the integration request;
- has a five-minute lifetime;
- is ES256 verified;
- does NOT establish QuoteFlow product authority;
- does NOT establish approval of an identity link.

The existing Connect authorization binding also deliberately requires the GHM account identity to already be mapped and does not bootstrap identity.

Accordingly, the future link operation must carry two distinct proofs:

1. **QuoteFlow proof** — independently authenticated QuoteFlow confirmation for the exact ceremony/relationship/IDs.
2. **GHM proof** — authenticated GHM principal satisfying the already-qualified account or Business-side authority rule.

Neither proof substitutes for the other.

## Replay and substitution

A QuoteFlow confirmation MUST be single-use or replay-detectable for the ceremony/version.

GHM MUST reject:

- expired confirmations;
- unknown issuers/keys;
- invalid signatures or equivalent authentication;
- wrong audience/context;
- wrong relationship type;
- wrong QuoteFlow subject;
- wrong GHM target;
- wrong ceremony;
- wrong expected version;
- reused confirmation identifiers;
- stale confirmations.

Confirmation of one ceremony MUST never activate another ceremony.

## Persistence implication

The persistence layer MUST record sufficient confirmation provenance to make activation auditable without storing bearer secrets.

At minimum the logical record needs:

- confirmation identifier;
- authenticated QuoteFlow issuer/authority;
- exact relationship and target pair;
- ceremony/version;
- confirmation timestamp;
- activation timestamp.

Raw tokens/secrets/passwords MUST NOT be persisted as the canonical relationship record unless a separate security contract explicitly authorizes it.

## Construction boundary

This contract does not authorize:

- changes to QuoteFlow;
- a new signing key;
- provider credentials;
- identity-link tables;
- database functions;
- HTTP routes;
- Connect adapter routing;
- automatic matching;
- migration/import;
- shadow traffic;
- production cutover.

## Next gate

Before identity-link persistence implementation, qualify the actual QuoteFlow-side authority mechanism and its trust boundary. The implementation can then consume that qualified proof without weakening the dual-confirmation model.

**Fail closed:** if QuoteFlow confirmation cannot be independently authenticated and bound to the exact ceremony, GHM MUST leave the relationship non-active.
