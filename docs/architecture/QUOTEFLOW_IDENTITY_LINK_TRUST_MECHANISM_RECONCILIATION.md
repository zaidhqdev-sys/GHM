# QuoteFlow ↔ GHM Identity Link — Trust Mechanism Decision

**Status:** TRUST MECHANISM NOT YET AUTHORIZED — CURRENT QUOTEFLOW RELEASE HAS NO SERVER-TO-SERVER ATTESTATION CHANNEL

## Audit result

QuoteFlow currently has Supabase Postgres migrations and security-definer RPCs, but no Supabase Edge Functions or other server-side application runtime is present in the repository for issuing a cross-system signed confirmation assertion.

The existing authenticated RPC boundary is suitable for enforcing QuoteFlow-side authority inside Supabase Postgres, but it does not by itself provide a secure server-to-server transport to GHM.

## Consequence

Do not invent or embed a private signing key in the mobile application.

Do not send the Supabase access token to GHM as a substitute for a dedicated confirmation assertion.

Do not repurpose the existing GHM Connect ES256 key pair as a QuoteFlow issuer.

Do not activate an identity link based only on an authenticated network request.

## Required architecture

A server-side QuoteFlow authority must exist between Supabase Auth/RPC authorization and GHM. It must:

1. authenticate the QuoteFlow principal through the existing server-authorized boundary;
2. validate the exact ceremony and target;
3. issue a short-lived, one-time, audience-bound confirmation assertion;
4. protect issuer signing material outside the mobile bundle;
5. send the assertion server-to-server to GHM;
6. allow GHM to verify issuer, audience, signature/attestation, ceremony, version, exact subjects/targets, freshness and replay state.

## Open product/infrastructure decision

The current repository does not establish whether that server-side authority should be implemented as a Supabase Edge Function, a GHM-owned integration endpoint with independently verifiable QuoteFlow credentials, or another managed server-side component.

That choice is an architecture decision and must be made before runtime implementation.

## Production boundary

QuoteFlow production behavior remains unchanged. No new secrets, functions, endpoints, mappings, migrations, adapters, or cutover are authorized by this reconciliation.

**Fail closed:** without an independently authenticated QuoteFlow server-side attestation channel, the GHM identity-link relationship cannot become ACTIVE.