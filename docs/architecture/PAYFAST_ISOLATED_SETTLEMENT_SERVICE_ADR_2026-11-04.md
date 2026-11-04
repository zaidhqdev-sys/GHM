# PayFast Isolated Settlement Service — Architecture Decision Record

**Status:** Implemented in draft PR #206; operational rollout and payment cutover remain unauthorized  
**Date:** 2026-11-04  
**Related:** PR #206, `security/payfast-callback-isolation-20261104` (includes/supersedes provider-binding slice #205)

## Decision

Run PayFast ITN handling in a separately deployed callback process with a dedicated PostgreSQL login. Do not run ITN settlement in the general GHM API process and do not expose the provider database credential to that process.

This is a deliberate security boundary, not merely a second connection pool in one Node process.

## Evidence from the current implementation (PR #206)

- `src/server.ts` starts the single general API process and imports `src/http/app.ts`.
- `src/db/pool.ts` creates the general pool from `DATABASE_URL`.
- `src/config.ts` loads the general API configuration, including PayFast merchant configuration.
- `src/http/commercial-internal-router.ts` currently registers both the Connect checkout route and the public PayFast ITN route.
- `src/resources/commercial/payfast-http.ts` currently combines checkout and ITN handling in `PayfastHttpBoundary`. ITN handling reads the attempt through the supplied pool, validates signature/source IP/merchant/amount, calls PayFast server confirmation, then invokes the provider boundary.
- `src/resources/commercial/provider-boundary.ts` currently calls generic `ghm.commercial_apply_payment_result`.
- The generic settlement function is SECURITY DEFINER and currently grants EXECUTE to shared `ghm_runtime`.
- The general API's `DATABASE_URL` is the only configured DB URL. A second pool in the same process would not isolate the credential from arbitrary code in that process.

## Target topology

```text
Connect / ordinary clients
        |
        v
General GHM API process
  DATABASE_URL -> ghm_runtime
  - prepare payment attempts
  - create PayFast checkout
  - no ITN settlement route
  - no provider DB credential
  - no settlement function EXECUTE
        |
        | PayFast hosted checkout
        v
      PayFast
        |
        | signed ITN callback
        v
Dedicated PayFast callback process
  PAYFAST_CALLBACK_DATABASE_URL -> ghm_payment_provider
  - only public PayFast ITN ingress
  - bounded URL-encoded parser
  - source-IP allow-list / proxy trust explicitly configured
  - signature, merchant, amount, payment status checks
  - PayFast server confirmation
  - calls one PayFast-specific SQL function
        |
        v
PostgreSQL SECURITY DEFINER function
  - fixed provider identity = 'payfast'
  - validates stored attempt.provider_code
  - locks attempt and subscription
  - preserves event idempotency / payload-hash conflict semantics
  - performs settlement atomically
```

## Database identity and function design

### Roles

- `ghm_schema_owner`: owns schema objects and SECURITY DEFINER functions; NOLOGIN.
- `ghm_runtime`: ordinary API login; must not execute either generic or PayFast settlement functions and must not have direct DML on settlement tables.
- `ghm_payment_provider`: dedicated callback LOGIN, provisioned out-of-band by the database/infrastructure owner. Grant only database CONNECT, schema USAGE, and EXECUTE on the two narrowly scoped PayFast attempt-read and settlement functions. No direct SELECT/INSERT/UPDATE/DELETE on commercial tables.
- Do not embed passwords, connection strings, or role credentials in SQL migrations, Git, workflow logs, or the general API environment.

The dedicated LOGIN role and its credential are a cluster-level infrastructure prerequisite, not something to fake with a schema-owner migration. Migration should fail clearly if the required LOGIN role is absent. The actual credential and rotation are provisioned outside GitHub and outside application migrations.

### Function

Introduce `ghm.commercial_apply_payfast_payment_result(...)` with no provider-code parameter. The function fixes provider to `payfast` internally and performs the complete atomic settlement. It should own the settlement logic rather than making the provider role EXECUTE the generic multi-provider function.

- SECURITY DEFINER, owned by `ghm_schema_owner`.
- Fixed `search_path = pg_catalog, ghm`.
- Validate all input lengths, formats and statuses.
- Lock the attempt and subscription; require stored `provider_code = 'payfast'`.
- Preserve duplicate event idempotency and payload-hash mismatch rejection.
- Keep event creation, transaction insertion, subscription/attempt updates and founding allocation in one transaction.
- Revoke EXECUTE from PUBLIC and `ghm_runtime`; grant only to `ghm_payment_provider`.
- Revoke EXECUTE on the existing generic function from `ghm_runtime`. Retain generic function only for an explicitly designed future provider dispatcher, not for ordinary runtime callers.

Do not create a wrapper that merely exposes the generic function's provider parameter to the provider login. The provider-specific function must not permit a caller to select another provider.

## Application process split

1. Extract ITN parsing/verification into a callback-specific module with injected PayFast config and provider settlement interface; remove module-level dependency on general `config`.
2. Keep checkout generation in the general API. Checkout reads attempt/provider and uses the existing general runtime identity; it never settles.
3. Remove `POST /api/v1/commercial/payfast/itn` registration from the general API router.
4. Add a separate entry point (for example `src/payfast-callback-server.ts`) that creates its own Express app and Pool exclusively from `PAYFAST_CALLBACK_DATABASE_URL`. It must not import `src/config.ts`, `src/db/pool.ts`, `src/http/app.ts`, or the general API bootstrap.
5. The callback process should not need merchant checkout credentials or account/business management dependencies; it needs only callback verification configuration and the dedicated DB credential.
6. Add its own health/readiness endpoints. Readiness should verify DB connectivity without exposing connection details. Graceful shutdown must close HTTP server and its pool.
7. Deploy as a distinct service with independent environment, network policy, scaling, logs, and credential rotation. Infrastructure deployment is a later explicitly authorized phase; no service is created by this ADR.

## Callback verification requirements

- Reject malformed, oversized, duplicate/ambiguous, or unexpected ITN fields.
- Parse form data with a strict size limit and reject arrays/objects rather than silently selecting the first value.
- Validate source IP against PayFast's current published ranges using a controlled, periodically refreshed configuration. Do not trust arbitrary forwarded headers; configure trusted proxy hops explicitly.
- Validate signature, merchant ID, payment attempt ID, currency/amount, payment status, provider transaction reference, and the optional documented `payment_date` field when present.
- Call PayFast server confirmation against the correct sandbox/live endpoint and require exact `VALID`.
- Only after all checks pass may the callback call the provider-specific SQL function.
- Never log full callback payloads, signatures, passphrases, merchant keys, DB URLs or payment personal data. Log correlation IDs and sanitized error categories.
- Return the documented acknowledgement only after the settlement transaction commits. Provider retries must be safe and idempotent.

## Required qualification matrix

### Identity / privilege
- `ghm_runtime` cannot EXECUTE generic or PayFast settlement functions.
- `ghm_payment_provider` can EXECUTE only the PayFast-specific settlement function.
- `ghm_payment_provider` cannot directly read or mutate payment attempts, provider events, payment transactions, subscriptions, commercial events or founding allocations.
- A general API connection cannot settle even if application code supplies `providerCode: 'payfast'`.
- A missing dedicated role must fail migration/preflight clearly; no fallback to `ghm_runtime`.

### Callback behavior
- valid sandbox and live-mode fixtures with mocked PayFast server confirmation.
- invalid source IP, signature, merchant, amount, currency, attempt ID, status and server confirmation never reach SQL.
- mismatched/null provider attempts fail closed.
- duplicate identical event is idempotent; same event ID with different payload hash conflicts.
- concurrent duplicate callbacks settle once and return a safe repeat outcome.
- timeout/retry behavior does not acknowledge before commit.
- malformed/oversized request and spoofed forwarded headers are rejected.
- callback service starts without general API-only secrets and fails closed if dedicated DB URL/config is absent.

### Operations
- separate service deployment, ingress allow-list/proxy configuration, DB network access, secret storage, rotation, alerting and rollback plan documented.
- no live provider activation or production cutover until explicit approval and supervised qualification.

## Historical attempt reconciliation

The provider-binding migration intentionally leaves historical attempts NULL. Before rollout, perform an explicitly approved read-only inventory and classify by status, age, expiry and reliable provider evidence. Backfill only with trustworthy evidence. Unknown pending attempts must not be silently assigned PayFast; define a separately approved quarantine/expiry procedure. Keep NOT NULL deferred until every retained row has a defensible provider assignment or is safely handled.

## Phased delivery

1. **Code and CI — implemented in draft PR #206:** provider binding, isolated callback entry point, provider-specific SQL wrapper, role grants/revokes, and disposable three-identity qualification. PR #205 is superseded and must not be merged independently.
2. **Review and qualification:** review the full PR #206 diff and rerun/inspect CI on the final head. Current recorded CI qualification is disposable-environment evidence only; it is not shared Render or production qualification.
3. **Infrastructure plan:** document separate callback service, provider credential provisioning/rotation, network access, proxy topology, monitoring and rollback. Require fresh explicit authorization before creating roles, secrets, services, network rules or deployments.
4. **Historical data plan:** perform read-only inventory only after explicit target authorization; no backfill without separately approved evidence and change plan.
5. **Cutover:** separately authorized, supervised sandbox then production plan; never implied by code approval.

## Explicit non-goals

This ADR records the code architecture implemented in draft PR #206. It does not authorize creation of a shared/production DB login or credential, secret, service, Render resource, network rule, provider activation, migration against shared/production DB, historical backfill, or cutover. PR #206 must remain draft until review is complete; PR #205 is superseded and must not be merged independently.
