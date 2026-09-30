# GHM Commercial Capability Architecture Contract

**Status:** CONSTRUCTION CONTRACT — AUTHORIZED FOR SCHEMA DESIGN
**Date:** 2026-09-15
**Scope:** GHM Commercial Capability
**Production state:** Supabase remains production authority
**Provider integrations:** Not part of GHM core construction

---

## 1. Purpose

GHM Commercial Capability provides the canonical provider-neutral commercial state required by the ZAID ecosystem.

The capability represents:

- commercial plans;
- versioned plan definitions;
- entitlements;
- Business trials;
- Business subscriptions;
- payment attempts;
- payment transactions;
- provider events;
- commercial lifecycle events;
- founding allocations where applicable.

GHM owns the commercial meaning and lifecycle state.

Payment providers such as Paystack or PayFast remain external adapters. Provider-specific checkout, webhook transport, credentials, SDKs, and provider API behavior do not become GHM domain dependencies.

GHM must not reproduce the Supabase/RPC implementation shape of Zaid Connect or QuoteFlow.

---

## 2. Canonical ownership

The existing GHM `business` resource remains the canonical Business identity.

The commercial relationship is:

GHM Business
  -> Commercial Subscription
     -> Plan Version
     -> Entitlements
     -> Trial
     -> Payment Attempts
     -> Payment Transactions
     -> Provider Events
     -> Commercial Events
     -> Optional Founding Allocation

Commercial construction must not introduce a second organization/business identity model.

QuoteFlow's Supabase `organization` maps conceptually to the existing GHM Business boundary.

Zaid Connect's Supabase `business` maps directly to the existing GHM Business boundary through the eventual product adapter.

---

## 3. Product reconciliation

### 3.1 Zaid Connect

Connect establishes the richer commercial lifecycle:

- Business-specific plan;
- versioned plan;
- trial;
- subscription;
- enabled entitlements;
- payment preparation;
- payment attempts;
- provider transactions;
- provider events;
- subscription activation;
- failed payment state;
- cancellation-at-period-end;
- expiry;
- founding-price allocation;
- founding protection;
- commercial lifecycle events.

These semantics are part of the source contract.

Connect-specific implementation details are not canonical GHM architecture.

GHM does not reproduce:

- Supabase RPC names;
- Supabase RLS policies;
- Supabase UUID layout;
- `regional_configurations` as a provider-shaped dependency;
- `service_role`;
- Paystack-specific checkout logic;
- Connect's commercial launch authorization mirror.

### 3.2 QuoteFlow

QuoteFlow establishes a smaller commercial consumer:

- plan: `free | pro`;
- subscription status: `inactive | active | cancelled | expired`;
- provider: `none | paystack | other`;
- provider reference;
- start/end dates;
- server-authoritative entitlement state.

QuoteFlow does not require its own commercial schema.

The GHM commercial capability supports QuoteFlow as a consumer of the shared model without forcing QuoteFlow to adopt Connect-only concepts.

Connect's richer lifecycle therefore extends the shared commercial model rather than creating a separate commercial system.

---

## 4. Commercial plan

A commercial plan identifies a product-facing commercial offering.

A plan contains:

- stable code;
- human-readable name;
- intended audience;
- lifecycle state.

Plan lifecycle:

- draft
- active
- retired

Plan codes are stable identifiers.

A product adapter may map its product plan codes into GHM plan/version identifiers.

---

## 5. Plan version

Commercial behavior must be versioned.

A plan version defines the commercial terms applicable during a defined period.

A version contains:

- plan;
- positive version number;
- trial duration;
- optional founding allocation limit;
- optional founding protection duration;
- effective period;
- lifecycle.

A new commercial definition must create a new version rather than silently mutating historical commercial meaning.

Historical subscriptions retain their plan-version identity.

---

## 6. Entitlements

Entitlements represent capability access granted by a plan version.

An entitlement contains:

- stable entitlement code;
- access level;
- metadata.

The initial shared access level is:

`enabled`

Entitlements are evaluated from authoritative commercial state.

The application must not treat a client-selected plan or locally stored plan value as proof of entitlement.

QuoteFlow's `free/pro` model may consume a subset of the entitlement surface.

Connect may consume a larger entitlement set.

---

## 7. Trial

A trial belongs to one Business.

A Business may have at most one canonical commercial trial.

A trial contains:

- Business;
- plan version;
- activating account;
- activation timestamp;
- expiry timestamp;
- lifecycle;
- ended timestamp.

Trial lifecycle:

- active
- expired
- converted
- cancelled

A trial must have a valid expiry after activation.

Conversion to paid subscription is represented explicitly rather than silently deleting or rewriting trial history.

---

## 8. Subscription

A subscription is the authoritative commercial access state for a Business.

A subscription contains:

- Business;
- plan version;
- applicable price;
- optional trial;
- lifecycle status;
- current billing period;
- cancellation state;
- optional provider reference;
- optional founding protection state;
- timestamps.

The shared lifecycle must accommodate both Connect and QuoteFlow.

Canonical lifecycle states:

- trialing
- active
- past_due
- grace_period
- cancel_at_period_end
- cancelled
- expired
- suspended

Product adapters may expose a smaller vocabulary.

For example, QuoteFlow may project:

- trialing / active -> active
- cancel_at_period_end / cancelled -> cancelled
- expired -> expired
- no active subscription -> inactive

The adapter must not destroy the richer GHM state.

---

## 9. Payment attempt

A payment attempt represents an attempt to initiate or complete payment for a commercial subscription.

It contains:

- Business;
- subscription;
- price;
- initiating account;
- amount;
- currency;
- billing interval;
- status;
- idempotency key;
- optional checkout reference;
- expiry;
- failure information.

Payment-attempt lifecycle:

- pending_checkout
- pending_payment
- succeeded
- failed
- expired
- cancelled

Idempotency is mandatory.

Repeated requests using the same valid idempotency key must resolve to the same commercial attempt rather than creating duplicate commercial intent.

---

## 10. Payment transaction

A payment transaction records an authoritative financial result associated with commercial state.

Transaction kinds:

- payment
- refund
- reversal
- chargeback

Transaction status:

- pending
- succeeded
- failed

Transactions retain:

- Business;
- subscription;
- optional payment attempt;
- optional provider event;
- amount;
- currency;
- provider transaction reference;
- occurred timestamp;
- recorded timestamp;
- bounded metadata.

A transaction is historical evidence and must not be rewritten to manufacture a new commercial outcome.

---

## 11. Provider events

Provider events are an adapter boundary.

A provider event records an externally supplied event without making the external provider the owner of GHM commercial state.

Required concepts:

- provider code;
- provider event ID;
- event type;
- payload hash;
- received timestamp;
- occurred timestamp;
- processing status;
- processed timestamp;
- bounded metadata.

Provider event identity must be unique per provider.

Provider events must be idempotently processed.

The GHM commercial core must not contain Paystack-specific or PayFast-specific business logic.

---

## 12. Commercial events

Commercial lifecycle changes must have auditable domain events.

Examples include:

- trial_activated
- subscription_payment_prepared
- subscription_activated
- subscription_payment_failed
- subscription_cancel_scheduled
- subscription_expired
- founding_allocation_granted

Commercial events provide historical evidence of state transitions.

They must not be used as a generic application event bus.

---

## 13. Founding allocation

Founding allocation is an optional commercial capability required by Connect's current commercial contract.

A founding allocation contains:

- Business;
- subscription;
- payment transaction;
- plan version;
- unique founding sequence;
- allocation timestamp;
- protection expiry.

A Business may receive at most one founding allocation.

A founding allocation must be backed by a successful qualifying commercial transaction.

The shared commercial core may support founding allocation without requiring QuoteFlow to use it.

---

## 14. Authorization boundary

Commercial operations are Business-scoped.

Read operations require valid authenticated identity and appropriate Business participation/read authority.

Management operations require the existing GHM Business management authorization boundary.

Commercial creation or mutation must not establish Business membership implicitly.

Commercial state must never be authorized using:

- client-supplied role claims;
- product-local ownership assumptions;
- provider callbacks alone;
- a submitted Business ID without GHM authorization.

The existing GHM authentication and Business authorization model remains canonical.

---

## 15. State transition rules

Commercial state transitions must be explicit and transactional.

Examples:

Trial:
- trial -> converted
- trial -> expired
- trial -> cancelled

Payment:
- pending_checkout -> pending_payment
- pending_checkout -> cancelled
- pending_payment -> succeeded
- pending_payment -> failed
- pending_payment -> expired

Subscription:
- active -> cancel_at_period_end
- active -> past_due
- active -> suspended
- cancel_at_period_end -> cancelled
- past_due -> active
- past_due -> pending_payment

Invalid lifecycle transitions must be rejected.

Payment success must not be able to activate an unrelated Business subscription.

---

## 16. Concurrency and idempotency

The commercial capability must protect against:

- duplicate trial creation;
- duplicate payment preparation;
- duplicate provider events;
- duplicate successful transactions;
- duplicate founding allocation;
- concurrent subscription updates;
- concurrent cancellation;
- concurrent expiry processing.

Database constraints and transactional locking are authoritative.

Application-level checks alone are insufficient.

---

## 17. Provider neutrality

GHM commercial state must not depend on:

- Paystack availability;
- PayFast availability;
- a specific provider SDK;
- provider credentials;
- provider webhook transport;
- provider-specific response formats.

The provider adapter translates external events into the GHM commercial contract.

Conceptually:

Product
  -> GHM Commercial API
     -> Commercial State
     -> Provider Adapter
        -> Paystack
        -> PayFast
        -> Future Provider

The adapter boundary is outside the canonical commercial schema semantics.

---

## 18. Launch authorization

Connect's current `commercial_launch_authorized` value is a product/deployment release gate.

It is not itself a subscription lifecycle state.

GHM therefore does not make that flag part of the canonical subscription state.

A future product adapter may independently prevent commercial operations when the product's release gate is closed.

---

## 19. Resource API boundary

The commercial capability must be exposed through explicit resource operations.

It must not introduce:

- generic SQL querying;
- generic table endpoints;
- provider-specific endpoints inside the core;
- unrestricted subscription updates;
- client-controlled entitlement grants.

The resource registry will define individual supported operations after the schema contract is implemented.

---

## 20. Auditability

Commercial mutations must preserve:

- actor identity;
- Business identity;
- relevant plan/version;
- timestamps;
- idempotency identity;
- provider event identity where applicable;
- historical transaction evidence.

Historical commercial records must remain attributable.

---

## 21. Database authority

The database is authoritative for:

- uniqueness;
- foreign-key integrity;
- lifecycle constraints;
- monetary validity;
- idempotency;
- founding allocation uniqueness;
- temporal validity;
- subscription ownership.

The runtime role must receive only the privileges required by the approved Commercial Resource API.

Schema mutation authority remains separate through the existing GHM migrator/schema-owner boundary.

---

## 22. Explicit non-goals

This construction does not include:

- Paystack integration;
- PayFast integration;
- provider credentials;
- webhook deployment;
- payment checkout UI;
- product subscription UI;
- migration of live Supabase data;
- production DNS/routing changes;
- production credential rotation;
- production cutover;
- Supabase removal;
- generic billing engine functionality;
- invoice/accounting functionality beyond the commercial transaction evidence required by the source contracts.

Those are separately governed concerns.

---

## 23. Construction acceptance criteria

Commercial schema construction may be considered qualified only when evidence proves:

1. canonical Business ownership;
2. plan/version integrity;
3. entitlement integrity;
4. trial uniqueness and lifecycle;
5. subscription lifecycle;
6. payment-attempt idempotency;
7. payment-transaction integrity;
8. provider-event idempotency;
9. founding-allocation integrity;
10. authorization boundaries;
11. runtime ACL boundaries;
12. transaction/concurrency behavior;
13. invalid transition rejection;
14. audit provenance;
15. repository/service/API alignment;
16. clean build/test/diff-check;
17. dedicated runtime qualification PASS.

A partial or infrastructure-failed qualification is not PASS.

---

## 24. Production boundary

Construction of this capability does not authorize:

- production schema migration;
- production data movement;
- Supabase shutdown;
- product backend switching;
- Paystack/PayFast provider migration;
- DNS changes;
- credential rotation;
- shadow qualification;
- controlled cutover.

Zaid Connect and QuoteFlow remain on their existing Supabase backends until their separate shadow-qualification and controlled-cutover gates are satisfied.
