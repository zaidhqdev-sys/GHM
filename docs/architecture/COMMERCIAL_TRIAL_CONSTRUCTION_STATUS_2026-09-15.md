# GHM Commercial Trial Construction Status — 2026-09-15

**Status:** CONSTRUCTION IMPLEMENTATION IN PROGRESS
**Branch:** `construction/review-aggregate-reconciliation`
**Production state:** Supabase remains production authority

## Current decision

The Commercial trial operation contract was reconciled before implementation.

`commercial.activateTrial` now requires an explicit stable `planCode` in addition to the canonical `businessId`.

This resolves the contract gap identified between the GHM Commercial model and the authoritative Zaid Connect trial operation. GHM does not select an arbitrary plan and does not hard-code a product plan.

## Source reconciliation

Zaid Connect's current trial operation supplies an explicit plan code and resolves the highest active, effective plan version with a positive trial duration at the transaction activation timestamp.

GHM preserves that domain meaning while excluding Connect-only dependencies such as product document consent, regional launch authorization, Supabase RLS, and provider-specific logic.

## GHM implementation

Implemented in:

- `src/resources/commercial/contracts.ts`
- `src/resources/commercial/repository.ts`
- `src/resources/commercial/service.test.ts`
- `src/resources/commercial/repository.test.ts`

Contract documentation:

- `docs/architecture/COMMERCIAL_TRIAL_OPERATION_CONTRACT.md`
- `docs/architecture/COMMERCIAL_CAPABILITY_ARCHITECTURE_CONTRACT.md`
- `docs/architecture/COMMERCIAL_MINIMUM_SCHEMA_CONTRACT.md`

## Runtime behavior constructed

The repository implementation now:

1. validates `businessId` and `planCode` before opening a transaction;
2. uses `withAuthorizedTransaction`;
3. requires active `owner` or `administrator` Business membership;
4. resolves the requested active Commercial plan;
5. resolves the highest active/effective plan version with `trial_days > 0`;
6. uses one database transaction timestamp for plan eligibility and activation;
7. creates the canonical Business trial;
8. creates the corresponding `trialing` subscription with no price/provider reference;
9. appends the `trial_activated` Commercial event;
10. returns the authoritative trial row;
11. relies on database uniqueness for one trial/current subscription per Business;
12. rolls back the entire operation when a later write fails.

The implementation does not add an HTTP route or provider integration.

## Qualification coverage added

Repository tests cover:

- explicit plan-code requirement;
- management authorization boundary;
- highest-version/effective-date/trial eligibility query shape;
- authenticated actor binding;
- trial expiry calculation;
- atomic trial/subscription/event writes;
- authorized transaction boundary;
- no-eligible-plan rejection;
- rollback when the Commercial event write fails;
- existing Commercial read behavior.

Service tests reconcile the new explicit plan-code input.

## Remaining qualification gate

The implementation is not declared runtime-qualified from repository construction alone.

Required next evidence:

- build;
- full test suite;
- `git diff --check`;
- dedicated construction-database runtime qualification using `ghm_runtime` for application behavior and `ghm_migrator` for controlled fixtures/cleanup;
- owner/administrator success;
- member denial;
- invalid/ineligible plan rejection;
- version/effective-date selection;
- duplicate/concurrent trial protection;
- subscription/event correctness;
- rollback evidence;
- runtime ACL verification.

## Production boundary

No production schema migration, Supabase data movement, provider migration, DNS/routing change, credential rotation, product cutover, or production traffic change is authorized by this construction work.

Paystack setup/review remains a separate product/commercial concern and is not a GHM construction qualification gate.
