# QuoteFlow ↔ GHM Identity Link — QuoteFlow Attestation Authority Decision

**Status:** SELECTED — QUOTEFLOW-OWNED SERVER ATTESTATION; GHM REMAINS SYSTEM OF RECORD

## Decision

The dual-sided confirmation model requires an independently authoritative QuoteFlow-side confirmation. The current QuoteFlow mobile application cannot provide that authority because its private signing material must never be shipped in the client.

The target architecture therefore introduces a **minimal QuoteFlow-owned server authority** whose sole identity-link responsibility is to authenticate the current QuoteFlow principal through the current product authority, validate the exact ceremony, and issue a short-lived signed confirmation assertion.

This component is an integration/attestation boundary, **not a second system of record**. GHM remains the canonical backend, persistence authority, authorization authority, and eventual independent production backend.

## Trust separation

The trust domains are intentionally separate:

1. **QuoteFlow attestation authority** — signs only QuoteFlow-side confirmation assertions.
2. **GHM service/integration authority** — authenticates the application-to-GHM transport.
3. **GHM user authority** — validates the GHM-side owner/administrator or exact account authority.
4. **GHM persistence authority** — activates the relationship only after both confirmations are valid.

The QuoteFlow attestation private key MUST never be present in the mobile bundle, repository, or client-accessible configuration.

## Migration boundary

During the current migration period, the QuoteFlow attestation authority may validate the currently authoritative QuoteFlow authentication system. That is a transitional implementation detail, not the target backend authority.

The contract MUST be designed so that the QuoteFlow authentication source can later move to GHM without changing the identity-link persistence/lifecycle model.

Supabase is therefore not selected as the permanent trust authority and no Supabase Edge Function is required by this architecture.

## Assertion requirements

The QuoteFlow authority signs an asymmetric assertion containing at minimum:

- issuer;
- audience;
- key identifier;
- confirmation identifier;
- relationship type;
- exact QuoteFlow subject;
- exact GHM target;
- ceremony identifier;
- ceremony version;
- issued-at;
- expiry;
- QuoteFlow-side provenance.

GHM verifies signature, issuer, audience, key, freshness, exact ceremony binding, exact target binding, and replay status before recording the confirmation.

## Key ownership

QuoteFlow owns its attestation signing private key.

GHM stores and trusts only the corresponding public verification key(s), subject to an explicit key-registration/rotation contract.

GHM's existing Connect ES256 service key MUST NOT be reused for QuoteFlow attestation. The two trust domains remain cryptographically and operationally distinct.

## Fail-closed rule

If QuoteFlow cannot produce a valid independently authenticated assertion for the exact ceremony, GHM MUST NOT record QuoteFlow confirmation and MUST NOT activate the relationship.

## Explicit non-goals

This decision does not authorize:

- identity-link schema creation;
- runtime mutation;
- HTTP route creation;
- key provisioning;
- production credential changes;
- QuoteFlow mobile changes;
- automatic matching;
- migration/import;
- shadow traffic;
- production cutover.

## Next gate

Define the concrete QuoteFlow attestation assertion and key-registration/rotation contracts. Then implement the GHM persistence boundary only after those trust contracts are qualified.

