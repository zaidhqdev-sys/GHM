# Production Configuration and Secret Boundary Contract

**Canonical owner:** GHM platform governance  
**Status:** CONSTRUCTION QUALIFIED — PR #21 PENDING MERGE  
**Reconciliation date:** 2026-10-02  
**Candidate branch:** `construction/production-config-boundary`  
**Candidate HEAD:** `6525376f3666e95fba1bb857974fdbac7146dcf3`  
**Base:** `main @ 74554bc6607d8c24c248d6cc516e726540a0af18`

## Purpose

Define the minimum production configuration boundary required before GHM may be treated as having a qualified production configuration surface.

This contract is limited to application configuration and secret-boundary behavior. It does not authorize production environment changes, credential rotation, deployment, product cutover, or provider cleanup.

## Canonical rule

When `NODE_ENV=production`:

- `DATABASE_SSL` must be explicitly enabled;
- configuration fails closed when database TLS is not enabled;
- no insecure database connection is accepted as a valid production configuration.

Outside production:

- existing explicit `DATABASE_SSL=false` behavior remains accepted;
- this slice does not impose a production-only requirement on development/test environments.

## Secret-boundary requirements

- Database credentials remain environment-provided; no credentials are committed.
- JWT private/public key material remains environment-provided; no key material is committed.
- Production configuration must fail closed on a missing mandatory security setting rather than silently selecting an insecure default.
- Test configuration must isolate security-sensitive environment variables from developer-local `.env` defaults so qualification is deterministic.

## Qualification evidence

The candidate branch adds focused configuration coverage for:

1. production fails closed when `DATABASE_SSL` is not enabled;
2. production accepts explicitly enabled database TLS;
3. non-production preserves explicit database TLS settings.

The canonical test suite on the candidate branch passed:

```text
tests: 416
pass: 416
fail: 0
cancelled: 0
skipped: 0
todo: 0
```

The qualification also includes the existing build and repository test surface.

## Test-isolation finding and correction

The first local run exposed environment leakage from the developer `.env`: the production-negative test inherited an existing `DATABASE_SSL` value and therefore did not actually exercise the fail-closed path.

The test was corrected to explicitly control `DATABASE_SSL` for each spawned configuration case. The production guard itself was not weakened.

The corrected suite then passed 416/416.

## Scope boundary

This contract does **not**:

- alter database schema;
- alter resource contracts;
- change authentication protocol;
- accept Supabase JWTs;
- change Connect or QuoteFlow production configuration;
- change DNS/routing;
- rotate production credentials;
- change provider ownership;
- authorize production cutover.

## Relationship to Issue #1

This closes the **construction qualification** of the production database TLS configuration boundary for PR #21.

Issue #1 remains open until every independent production-foundation acceptance criterion has its own evidence and release gate.

## Canonical evidence

- `src/config.ts`
- `src/config.test.ts`
- `package.json`
- PR #21 — enforce production database TLS boundary
- candidate HEAD `6525376f3666e95fba1bb857974fdbac7146dcf3`

