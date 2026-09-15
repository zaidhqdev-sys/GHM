# GHM Commercial Trial Operation Contract

**Status:** CONSTRUCTION CONTRACT — OPERATION IMPLEMENTATION AUTHORIZED
**Date:** 2026-09-15
**Scope:** `commercial.activateTrial`
**Production state:** Supabase remains production authority

---

## 1. Purpose

Define the governed GHM operation for activating a Business commercial trial.

This operation is provider-neutral and product-adapter-ready. It does not reproduce the Zaid Connect Supabase RPC shape, consent tables, regional launch gate, RLS policies, or provider integration.

## 2. Input contract

The operation accepts:

- `businessId`: canonical GHM Business identifier;
- `planCode`: stable GHM commercial plan code.

`planCode` is required because a Business may have more than one commercial plan. The operation must never choose an arbitrary active plan or hard-code a product plan code.

Plan codes are resolved against `ghm.commercial_plan.code`.

## 3. Authorization

The caller must have:

- an authenticated `AuthContext`;
- an active membership on the target Business;
- Business management authority through `owner` or `administrator` membership.

An ordinary active `member` may read Commercial state but may not activate a trial.

Authorization must be resolved inside the established GHM authorized transaction boundary.

## 4. Plan/version resolution

The operation resolves the eligible plan version at one transaction timestamp `activatedAt`.

The selected row must satisfy:

- `commercial_plan.code = planCode`;
- `commercial_plan.lifecycle_status = 'active'`;
- `commercial_plan_version.lifecycle_status = 'active'`;
- `commercial_plan_version.trial_days > 0`;
- `effective_from <= activatedAt`;
- `effective_until IS NULL OR effective_until > activatedAt`.

When multiple eligible versions exist for the same plan, the highest version number is selected.

No eligible plan/version produces the error:

`Eligible commercial plan not found`

## 5. Trial creation

The operation creates exactly one canonical `ghm.commercial_trial` row containing:

- target Business;
- selected plan version;
- authenticated account as `activated_by`;
- the transaction activation timestamp;
- expiry calculated from `trial_days`;
- lifecycle `active`.

The existing unique Business boundary remains authoritative for one-trial-per-Business behavior.

## 6. Subscription creation

The operation creates the corresponding `ghm.commercial_subscription` in the same transaction:

- target Business;
- selected plan version;
- `price_id = NULL`;
- created trial ID;
- lifecycle `trialing`;
- current period start = `activatedAt`;
- current period end = trial expiry;
- no cancellation state;
- no provider reference.

The existing current-subscription uniqueness boundary remains authoritative.

## 7. Commercial event

The operation appends one `ghm.commercial_event`:

- `business_id` = target Business;
- `subscription_id` = created subscription;
- `event_type` = `trial_activated`;
- `actor_account_id` = authenticated account;
- `source` = `ghm.commercial`;
- `idempotency_key` = NULL;
- payload contains `plan_version_id`, `trial_id`, and `expires_at`;
- `occurred_at` = the same transaction activation timestamp.

The event is audit evidence, not a generic application event bus.

## 8. Atomicity

Trial, subscription, and commercial event creation must execute in one established authorized transaction.

If any step fails, the transaction must roll back and no partial Commercial state may remain visible.

## 9. Concurrency

The repository must rely on the database-enforced uniqueness boundaries for concurrent requests.

Relevant boundaries are:

- one trial per Business;
- one current subscription per Business;
- one trial reference per subscription.

A concurrent uniqueness conflict must not be converted into a second trial or subscription.

## 10. Return contract

The operation returns the created `CommercialTrial` mapped from the authoritative database row.

## 11. Product reconciliation

Zaid Connect currently supplies an explicit plan code when activating a trial. GHM therefore preserves plan selection as a domain input while deliberately excluding Connect-only document-consent and commercial-launch authorization dependencies.

QuoteFlow may use the same operation through a future product adapter when its product-level commercial flow requires trial activation.

## 12. Explicit exclusions

This operation does not:

- call Paystack or PayFast;
- create provider events;
- create payment transactions;
- allocate founding pricing;
- establish Business membership;
- enforce a product deployment launch flag;
- create product-specific consent records;
- expose an HTTP route by itself;
- migrate or mutate production Supabase state.

## 13. Qualification requirements

Implementation qualification must prove:

1. invalid Business ID is rejected before opening a transaction;
2. inactive/revoked membership is rejected;
3. active member role is rejected for management mutation;
4. owner and administrator activation succeeds;
5. invalid plan code is rejected;
6. inactive plan/version is rejected;
7. zero-trial version is rejected;
8. effective-date boundaries are enforced;
9. highest eligible version is selected;
10. trial fields are correct;
11. subscription fields are correct;
12. `trial_activated` event is correct;
13. all writes share one transaction;
14. failure rolls back all writes;
15. duplicate/concurrent activation cannot create duplicate canonical state.

Production qualification and product cutover remain separately governed.
