# GHM Commercial Offer HTTP Contract

**Status:** IMPLEMENTED — exact-head CI pending  
**Date:** 2026-11-10  
**Scope:** authenticated read-only South African Business Pro offer projection

## Endpoint

`GET /api/v1/commercial/offer/:businessId?planCode=:planCode`

The caller supplies a canonical positive GHM Business ID and an explicit stable plan code. GHM derives the authenticated account from the verified bearer context. The repository requires active Business membership before reading the offer.

## Projection ownership

The response is computed from canonical GHM rows:

- active `commercial_plan` and the highest currently effective active `commercial_plan_version`;
- South Africa (`ghm.country.code = 'ZA'`) and its canonical default currency, constrained to active ZAR;
- active/effective country-specific `commercial_plan_price` rows for the selected version;
- `commercial_trial` history for one-trial-per-Business eligibility;
- `commercial_founding_allocation` rows compared with the plan-version founding limit;
- current subscription/entitlements from the existing Commercial access projection.

No Connect/Supabase price, plan, identity, or Business UUID is accepted as authority. No fixed database IDs or hard-coded prices are used.

## Response semantics

The projection contains plan identity/version, trial duration and eligibility, founding limit/allocated count/availability, founding and standard prices (minor units, canonical currency code, monthly interval), current access, and evaluation timestamp.

If the plan/version is not active and effective, the endpoint returns 404. If the canonical ZA/ZAR price rows are absent, the corresponding prices are null and founding availability is false. Missing prices are not synthesized from UI copy.

## Security and side effects

This endpoint is read-only. It does not activate a trial, prepare payment, create checkout, mutate an entitlement, reserve founding allocation, or call a payment provider. Active membership is checked in the same authorized transaction before plan or price data is disclosed.

## Explicit follow-on gate

Connect's current UI has trial/subscription terms version strings, but those strings are not yet backed by an approved GHM-published legal document and durable acceptance contract. Do not expose browser trial activation or payment preparation until the approved document content/version/hash, actor-bound acceptance evidence, and corresponding GHM write authorization are implemented and qualified.

Payment provider checkout remains separately gated. No PayFast or Paystack activation, production migration, deployment, or cutover is authorized by this read contract.
