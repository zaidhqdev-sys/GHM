# QuoteFlow ↔ GHM Identity Link — Confirmation Authority Reconciliation

**Status:** QUALIFICATION BLOCKED — CURRENT QUOTEFLOW RELEASE HAS AUTHENTICATED SUPABASE IDENTITY, BUT NO QUALIFIED CROSS-SYSTEM LINK-CONFIRMATION AUTHORITY

## Evidence

The current QuoteFlow release uses Supabase Auth as its authenticated user identity and persists the session through the Supabase client.

The current organization context is obtained through the server-authorized `get_my_organization_context` RPC, and organization creation/completion use server-authorized RPCs.

The audited QuoteFlow source does not contain an identity-link ceremony, cross-system link confirmation API, GHM target binding, signed link assertion, or replay-resistant confirmation mechanism.

## Consequence

The authenticated QuoteFlow user identity is sufficient to establish **who is logged into QuoteFlow**.

It is not sufficient, by itself, to establish that QuoteFlow has approved an arbitrary GHM account or Business target.

Therefore the dual-confirmation contract cannot safely consume the current Supabase session as a generic proof of cross-system link approval.

No identity-link persistence or adapter implementation should proceed until a dedicated QuoteFlow-side confirmation boundary is designed and qualified.

## Required future boundary

The QuoteFlow-side operation must be server-authorized and must bind the authenticated Supabase principal to:

- exact ceremony identifier;
- relationship type;
- exact QuoteFlow subject;
- exact GHM target;
- expected ceremony version;
- one-time/replay-resistant confirmation identifier;
- freshness/expiry;
- auditable confirmation provenance.

The QuoteFlow client must not be trusted to self-assert the GHM target or to manufacture a confirmation assertion.

## Current release remains unchanged

This reconciliation does not authorize changes to QuoteFlow production behavior, Supabase schema, GHM persistence, adapters, HTTP routes, migration/import, shadow traffic, or cutover.

**Fail closed:** current QuoteFlow identity proves authentication, not cross-system link approval.
