# GHM Remaining Work Register — 2026-10-05

**Status:** CURRENT GOVERNED REMAINING-WORK REGISTER  
**Repository authority:** consolidated `main` at `4fd34bc620ab0612f8f643d7b4f7b8374ed6a2cf` before this construction slice  
**Purpose:** establish the exact work that remains before GHM can become the backend for Zaid Connect and QuoteFlow.

## GHM-05 — Commercial provider operations

**Classification:** GHM commercial integration — partially qualified / open.

Qualified foundations:
- governed commercial payment preparation boundary;
- governed commercial payment-result boundary;
- Connect identity → GHM account resolution;
- active-account/business-management authorization;
- payment-preparation idempotency;
- provider-event idempotent application;
- PayFast checkout/redirect HTTP boundary;
- PayFast ITN HTTP boundary;
- PayFast signature/source-IP/merchant/amount/status verification;
- PayFast configuration with sandbox as the non-production default.

Remaining:
- PayFast ITN server-to-server confirmation against the provider validation endpoint — current construction slice;
- PayFast sandbox end-to-end qualification, including checkout, ITN server confirmation and governed payment-result application;
- runtime qualification against a non-production provider environment;
- only then production provider enablement/cutover.

**Approved provider direction:** PayFast is approved for the commercial payment path. Provider approval/configuration is not itself evidence that the provider-specific GHM integration is production-enabled.

Do not create another generic event ledger.

## CONNECT-04 — Connect server/provider runtime equivalents

Commercial checkout/webhook, AI proxy and other server-runtime behaviours require explicit ownership and provider-boundary contracts before any GHM implementation. PayFast is the approved commercial provider direction; provider-specific checkout/webhook implementation remains open until sandbox/runtime qualification completes and must terminate in the governed GHM commercial boundaries rather than create a parallel commercial ledger.

## Other remaining-work classifications

The following remain unchanged from the reconciled register: storage live-provider/service qualification; database bootstrap authority cleanup; explicitly selected product-facing HTTP; public Business/directory composition; Connect product adapter and source reconciliation; Connect realtime/runtime/workflow decisions; QuoteFlow authoritative provenance, reset/re-enrollment, GHM session client, Business provisioning and cutover; and production deployment, recovery, observability, shadow qualification and controlled cutover.

**Construction stop condition:** every new GHM-core slice requires authoritative source evidence, one canonical owner, explicit contract/authorization, implementation, runtime/persistence/ACL qualification and documentation reconciliation.

**Founder gates remain unchanged:** commercial provider integration/credentials, storage enablement, product adapters, QuoteFlow migration, legacy database authority mutation, shadow qualification, and production routing/credential/traffic cutover require explicit Founder authorization.
