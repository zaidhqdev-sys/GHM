# QuoteFlow Subscription / Entitlement → GHM Commercial Reconciliation

## Status

**SOURCE RECONCILED — NO QUOTEFLOW COMMERCIAL ADAPTER AUTHORIZED**

This is documentation/source reconciliation only. It does not authorize a GHM migration, commercial adapter, provider integration, Supabase mutation, production routing change, or cutover.

## QuoteFlow source evidence

QuoteFlow's organization context exposes:

- subscription_plan: `free | pro | null`
- subscription_status: `inactive | active | cancelled | expired | null`

The organization context is populated from a Supabase `subscriptions` relation associated with the QuoteFlow organization.

The current QuoteFlow onboarding path creates a subscription row for the organization if one does not already exist.

The product entitlement layer currently defines:

- `free`
  - maximum 5 customers
- `pro`
  - unlimited customers

The entitlement calculation is local product logic:

`getEntitlements(plan)`

and customer creation checks the locally supplied plan against the customer count.

Therefore QuoteFlow currently has **two related but distinct concepts**:

1. subscription state/plan persisted in the organization context;
2. product entitlement behavior calculated by the app.

The current source does not establish that every entitlement is a direct projection of GHM commercial state.

## GHM source evidence

GHM already has a provider-neutral commercial/payment preparation domain.

That qualified construction boundary covers commercial reference/payment preparation and trial/commercial foundations, but it does not establish a QuoteFlow-specific subscription contract or authorize provider result/webhook application.

GHM therefore has a commercial foundation, but not yet an evidence-backed QuoteFlow subscription adapter.

## Reconciliation result

### 1. Subscription owner

QuoteFlow scopes subscription records to its organization.

GHM's canonical tenant/business model is Business, but the previous organization reconciliation established that QuoteFlow organization is **not yet proven equivalent to GHM Business**.

Therefore a QuoteFlow subscription cannot currently be mapped to a GHM Business subscription without first resolving the organization/business mapping.

**Decision:** no subscription foreign-key mapping yet.

### 2. Plan vocabulary

QuoteFlow has exactly:

- free
- pro

This vocabulary is product-specific.

GHM commercial preparation does not automatically imply the same plan identifiers, prices, entitlements, trial rules, or lifecycle.

**Decision:** do not create GHM `free/pro` plan values merely from QuoteFlow's enum.

### 3. Subscription status

QuoteFlow exposes:

- inactive
- active
- cancelled
- expired

These statuses are not sufficient evidence for a GHM commercial lifecycle.

In particular, the source does not establish:

- cancellation effective timing;
- whether cancelled subscriptions remain entitled until period end;
- expiration semantics;
- renewal semantics;
- trial semantics;
- grace periods;
- payment failure semantics;
- provider event ordering;
- refund/reversal semantics.

**Decision:** no status mapping or transition authority yet.

### 4. Entitlements

QuoteFlow's only currently evidenced entitlement is the customer-count limit:

- free → 5 customers;
- pro → unlimited customers.

This is a product capability rule, not proof that GHM should own the entitlement calculation.

No evidence currently establishes a canonical GHM entitlement resource or that GHM commercial state is the sole source for QuoteFlow's customer limit.

**Decision:** retain entitlement calculation as QuoteFlow product logic until a commercial/entitlement contract says otherwise.

### 5. Provider authority

QuoteFlow source examined here does not establish a payment-provider result/webhook application contract.

GHM's commercial preparation boundary intentionally remains provider-neutral.

Therefore this reconciliation does not introduce PayFast checkout, callbacks, webhook processing, provider IDs, or payment-result mutations.

**Decision:** provider integration remains separately governed work.

## Canonical ownership decisions

For construction:

- QuoteFlow organization subscription remains QuoteFlow/Supabase-owned.
- QuoteFlow `free/pro` entitlement calculation remains QuoteFlow product-owned.
- GHM remains canonical for its already-qualified provider-neutral commercial/payment preparation domain.
- No cross-system subscription record is created.
- No provider result is treated as a subscription authority.
- No QuoteFlow subscription is migrated into GHM.

## Required future contract before an adapter

A QuoteFlow commercial adapter requires explicit evidence for:

1. organization ↔ Business identity mapping;
2. canonical subscription owner;
3. plan catalog and pricing source;
4. trial semantics;
5. billing interval;
6. subscription state machine;
7. cancellation/effective-period semantics;
8. payment failure/grace-period semantics;
9. provider event/result authority;
10. entitlement derivation;
11. customer-limit enforcement authority;
12. read/write ownership;
13. idempotency and event ordering;
14. migration/shadow-read strategy;
15. cutover and rollback semantics.

## Explicit non-goals

Do not create:

- QuoteFlow subscription tables in GHM;
- free/pro GHM plan enums solely from this evidence;
- entitlement tables;
- PayFast webhooks;
- payment provider callbacks;
- provider-specific subscription IDs;
- QuoteFlow commercial adapter code;
- production Supabase changes;
- production routing/cutover.

## Current decision

**QuoteFlow subscription and entitlement remain QuoteFlow/Supabase/product-owned.**

GHM's commercial foundation remains intact and provider-neutral.

The QuoteFlow backend adapter is therefore still blocked on a deliberate commercial contract rather than implementation.

This closes the current source-reconciliation pass without inventing a commercial model.
