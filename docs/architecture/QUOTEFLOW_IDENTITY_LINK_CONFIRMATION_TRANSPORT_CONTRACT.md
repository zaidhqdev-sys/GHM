# QuoteFlow ↔ GHM Identity Link — Confirmation Transport Contract

**Status:** TRANSPORT CONTRACT DRAFT — NO RUNTIME TRANSPORT OR CREDENTIAL PROVISIONING AUTHORIZED

## Decision

The QuoteFlow confirmation MUST travel to GHM through a server-to-server trust boundary. The mobile client MUST NOT call the GHM identity-link confirmation operation directly.

The existing Connect service assertion is intentionally not reused as the QuoteFlow confirmation proof. It authenticates the Connect integration and request, but contains no claim proving that QuoteFlow approved a specific identity-link ceremony.

## Required transport

QuoteFlow-side server authority MUST produce an independently authenticated confirmation assertion after validating the authenticated Supabase principal and the exact ceremony.

GHM MUST verify that assertion before recording QuoteFlow confirmation.

The transport assertion MUST bind:

- issuer / QuoteFlow authority;
- audience / GHM identity-link authority;
- confirmation ID;
- ceremony ID;
- expected version;
- relationship type;
- exact QuoteFlow subject;
- exact GHM target;
- issued-at and expiry;
- sufficient provenance to identify the confirming QuoteFlow authority.

## Trust boundary

```text
QuoteFlow authenticated principal
        ↓
QuoteFlow server-authorized confirmation
        ↓
authenticated confirmation assertion
        ↓
server-to-server transport
        ↓
GHM assertion verification
        ↓
GHM-side authority confirmation
        ↓
atomic identity-link activation
```

The mobile client may initiate the ceremony but cannot manufacture, sign, alter, or replay the confirmation assertion.

## Authentication mechanism

A concrete signing-key or equivalent attestation mechanism is intentionally NOT selected yet. Existing GHM ES256 service keys authenticate the Connect integration and MUST NOT be repurposed without an explicit trust-domain contract.

Before implementation, the following must be qualified:

1. QuoteFlow issuer identity.
2. GHM audience identity.
3. Key/attestation ownership and rotation.
4. Verification-key distribution.
5. Assertion lifetime and clock skew.
6. Confirmation-ID replay storage and retention.
7. Failure and key-rotation behavior.
8. Recovery when QuoteFlow confirmation succeeds but GHM does not receive it.

## Security invariants

GHM MUST reject an assertion if any bound ceremony field differs from the pending ceremony.

GHM MUST reject expired, invalid, unknown, replayed, or incorrectly-audienced assertions.

GHM MUST independently perform its account or Business-side authority check.

An authenticated transport connection alone MUST NOT activate a link.

## Explicit non-goals

No signing-key provisioning, new secret, network credential, HTTP endpoint, database migration, persistence implementation, adapter, production routing, shadow traffic, or cutover is authorized by this contract.

## Next gate

Qualify the concrete QuoteFlow-to-GHM trust mechanism and key ownership/rotation model. Only then should the persistence implementation consume the confirmation assertion.