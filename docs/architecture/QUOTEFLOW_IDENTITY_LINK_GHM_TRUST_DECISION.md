# QuoteFlow ↔ GHM Identity Link — GHM-Owned Trust Decision

**Status:** SELECTED — GHM IS THE INDEPENDENT BACKEND AND TRUSTING AUTHORITY; IMPLEMENTATION CONTRACT REQUIRED BEFORE RUNTIME

## Architecture decision

GHM remains the canonical independent backend. QuoteFlow does not introduce a new backend authority for this migration.

The existing GHM Connect service-authentication pattern is retained as the application-to-GHM transport trust boundary, but its current assertion is NOT sufficient as identity-link confirmation because it authenticates the integration only.

Therefore the identity-link design uses two authenticated layers:

1. **Application transport authentication:** QuoteFlow/Connect authenticates to GHM using the existing GHM service assertion trust domain.
2. **QuoteFlow confirmation attestation:** a dedicated GHM-validated claim set binds the authenticated QuoteFlow-side confirmation to the exact identity-link ceremony.

GHM remains responsible for verifying both layers and remains the final persistence/activation authority.

## No Supabase dependency in target architecture

Supabase may remain the current QuoteFlow production identity provider during the migration period, but it is not the target backend or identity-link trust authority.

Future QuoteFlow authentication can be migrated to GHM without redesigning the identity-link persistence model.

## Critical unresolved implementation point

The current GHM ES256 service assertion contains integration ID and request ID, but no identity-link ceremony claims. It must therefore be extended through a dedicated identity-link assertion contract rather than overloaded implicitly.

The extension must have a dedicated issuer/audience or capability boundary, exact ceremony binding, replay protection, expiry, and separate key/trust-domain governance where required.

## Next gate

Define the dedicated GHM identity-link attestation claims and verification contract. Then implement the GHM persistence/function boundary and qualification harness against that contract.

No Supabase Edge Function, Supabase schema, production routing, or QuoteFlow production backend dependency is authorized.