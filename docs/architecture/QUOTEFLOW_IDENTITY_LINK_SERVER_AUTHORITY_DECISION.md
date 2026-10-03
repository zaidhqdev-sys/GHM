# QuoteFlow ↔ GHM Identity Link — Server Authority Decision

**Status:** SELECTED — SUPABASE EDGE FUNCTION AS QUOTEFLOW-SIDE SERVER AUTHORITY; RUNTIME IMPLEMENTATION NOT YET AUTHORIZED

## Founder/Product architecture decision

Use a dedicated Supabase Edge Function as the QuoteFlow-side server authority for identity-link confirmation.

This is selected because QuoteFlow already treats Supabase as the authoritative backend for authentication, organization membership, legal acceptance, and subscription context. A dedicated Edge Function keeps the mobile client outside the trust boundary and lets the QuoteFlow-side confirmation derive authority from `auth.uid()` server-side.

## Trust flow

```text
QuoteFlow mobile client
        ↓ authenticated Supabase session
Supabase Edge Function
        ↓ derives auth.uid() + validates ceremony
short-lived one-time QuoteFlow attestation
        ↓ server-to-server
GHM identity-link authority
        ↓ independently checks GHM authority
atomic activation
```

## Key ownership

QuoteFlow attestation signing material MUST be server-side only. It MUST NOT be bundled into the Android application or stored in repository source.

GHM verification MUST use a separately qualified public verification key or equivalent attestation mechanism. GHM Connect integration signing keys remain a separate trust domain.

Key rotation, issuer identity, audience, TTL, replay protection, and failure/recovery behavior require an implementation contract before secrets or runtime infrastructure are provisioned.

## Authority separation

The Edge Function proves QuoteFlow-side authority only.

GHM remains responsible for independently proving GHM-side account or Business authority.

An Edge Function request, authenticated Supabase session, or successful network call MUST NOT by itself activate a GHM identity link.

## Scope

This decision authorizes architecture selection only. It does NOT authorize:

- creating the Edge Function;
- provisioning signing secrets;
- creating GHM identity-link tables/functions;
- creating HTTP routes;
- QuoteFlow production UI changes;
- automatic identity matching;
- migration/import;
- adapters;
- shadow traffic;
- production routing or cutover.

## Next construction gate

Define the exact Edge Function ceremony API and attestation contract, including authenticated principal derivation, ceremony creation/lookup, exact target binding, one-time confirmation ID, signing/verification model, replay handling, and failure recovery.

After that contract is qualified, implementation may proceed on isolated construction branches with live qualification before any production authority changes.