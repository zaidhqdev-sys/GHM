# PayFast Isolated Settlement Service — Architecture Decision Record

**Status:** Merged into the integration candidate branch via PR #206; hosted rollout and payment cutover remain unauthorized  
**Date:** 2026-11-04  
**Related:** PR #206, `security/payfast-callback-isolation-20261104` (includes/supersedes provider-binding slice #205)

## Decision

Run PayFast ITN handling in a separately deployed callback process with a dedicated PostgreSQL login. Do not run ITN settlement in the general GHM API process and do not expose the provider database credential to that process.

This is a deliberate security boundary, not merely a second connection pool in one Node process.

## Evidence from the current implementation (PR #206)

- `src/server.ts` starts the ordinary GHM API process and imports `src/http/app.ts`; its database pool is sourced from `DATABASE_URL` and uses the ordinary `ghm_runtime` identity.
- The ordinary API retains checkout preparation/creation but no longer registers the public PayFast ITN settlement route.
- `src/resources/commercial/payfast-http.ts` handles the ordinary checkout boundary; callback verification and settlement are isolated in `src/resources/commercial/payfast-callback.ts`.
- `src/payfast-callback-server.ts` is a separate process entry point. It creates its own pool from `PAYFAST_CALLBACK_DATABASE_URL`, requires the connected `session_user` and `current_user` to be `ghm_payment_provider`, and exposes only health/readiness plus the PayFast ITN route.
- The callback validates the bounded/allow-listed ITN payload, PayFast source address, signature, merchant, amount, status and server confirmation before invoking `ghm.commercial_apply_payfast_payment_result`.
- The migration revokes generic settlement EXECUTE from PUBLIC and `ghm_runtime`; the provider role receives only the PayFast-specific attempt-read and settlement functions. The PayFast-specific SECURITY DEFINER wrapper fixes provider identity to `payfast`, checks stored provider and ZAR currency, and invokes the generic settlement implementation internally as its owner. The provider login itself cannot execute the generic function or directly access settlement tables.
- The general API and callback are separate processes with separate database URLs; the provider URL is not loaded by the ordinary API bootstrap.

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

`ghm.commercial_apply_payfast_payment_result(...)` has no provider-code parameter. The SECURITY DEFINER wrapper fixes provider to `payfast`, validates the stored provider and ZAR currency, and invokes the existing generic settlement implementation internally under its owner. The provider login cannot EXECUTE the generic function. This preserves one settlement implementation without exposing the generic provider selector to the callback identity.

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

1. Extract ITN parsing/verification into a callback-specific module with injected PayFast config and provider settlement interface; remove module-level dependency on general `config`. **Implemented.**
2. Keep checkout generation in the general API. Checkout reads attempt/provider and uses the existing general runtime identity; it never settles. **Implemented.**
3. Remove `POST /api/v1/commercial/payfast/itn` registration from the general API router. **Implemented.**
4. Add a separate `src/payfast-callback-server.ts` entry point with its own Express app and Pool exclusively from `PAYFAST_CALLBACK_DATABASE_URL`. It does not import the general API bootstrap/config/pool. **Implemented.**
5. The callback process uses callback verification configuration (`PAYFAST_MERCHANT_ID`, optional passphrase, sandbox/live mode) and the dedicated DB credential; it does not load ordinary API credentials. **Implemented.**
6. Add health/readiness endpoints. Readiness and startup verify both database identities; graceful shutdown closes HTTP server and pool. **Implemented.**
7. Deploy as a distinct service with independent environment, network policy, scaling, logs, and credential rotation. **Not deployed.** This requires the sandbox-only deployment gates documented below.

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

1. **Code and CI — implemented and merged via PR #206:** provider binding, isolated callback entry point, provider-specific SQL wrapper, role grants/revokes, and disposable three-identity qualification. PR #205 is superseded and must not be merged independently.
2. **Review and qualification — complete for current source:** PR #206's final head passed CI run [#41844089287](https://github.com/zaidhqdev-sys/GHM/actions/runs/41844089287), including build, all disposable PostgreSQL 18 migrations, full DB-backed tests, three-identity settlement qualification, migration audit and runtime boundary verification. This is not shared Render or production qualification.
3. **Infrastructure assessment — read-only review completed:** Render workspace inspection found an existing sandbox general-API service and a separate sandbox database, but no callback service or provider DB login. The sandbox database expires 2026-11-08. The existing service runs `npm start` from `main` (not `start:payfast-callback`) and must not be repurposed. A callback deployment remains blocked until a provider login/credential is provisioned, the migration is applied to the intended non-production DB, a dedicated service is configured with secrets, and the actual Render ingress/proxy chain is validated. The available Render DB query operation is read-only; no DB writes or secret provisioning were performed.
4. **Historical data plan:** perform read-only inventory only after explicit target authorization; no backfill without separately approved evidence and change plan.
5. **Cutover:** separately authorized, supervised sandbox then production plan; never implied by code approval.

## Explicit non-goals

This ADR records the code architecture implemented in draft PR #206. It does not authorize creation of a shared/production DB login or credential, secret, service, Render resource, network rule, provider activation, migration against shared/production DB, historical backfill, or cutover. PR #206 must remain draft until review is complete; PR #205 is superseded and must not be merged independently.


## Qualification update — 2026-11-04 (local Windows PostgreSQL 18)

The current PR head `a1a046d17d04854bfc8259efaa02100b1ae09304` was additionally
qualified by the maintainer on a native local PostgreSQL 18 instance, separate
from the hosted sandbox:

- Target was explicitly `127.0.0.1:5433/ghm_payfast_qualification`; the
  PostgreSQL 17 cluster on port 5432 was not used.
- `npm run migrate` completed. Read-only inspection confirmed 92 migration
  records, including `20261104120000_bind_commercial_payment_attempt_provider`
  and `20261104130000_isolate_payfast_settlement_identity`.
- `npm run qualify:commercial-payment-result-runtime` passed the runtime and
  provider identity/privilege denials, provider-specific SQL binding,
  idempotency, terminal-attempt guard, dedicated settlement and rollback checks.
- A read-only post-run check returned zero remaining qualification accounts,
  businesses, plans and test transactions.
- `npm run qualify:payfast-runtime`: 19 tests passed, zero failed. Provider
  network calls are stubbed; no real PayFast endpoint or live credentials are
  used by this script.
- `npm run verify:runtime` passed.
- A negative target-guard check rejected a deliberately mismatched host before
  opening a database connection.

GitHub Actions CI run [#41836364443](https://github.com/zaidhqdev-sys/GHM/actions/runs/41836364443)
also passed on the exact current PR head. The quality job completed build,
disposable PostgreSQL migrations, Business Identity/QuoteFlow qualification,
the full DB-backed test suite, three-identity settlement qualification,
migration audit policy tests and runtime boundary verification.

This evidence strengthens local/disposable qualification only. It does not
establish hosted Render networking, callback process deployment, live PayFast
server confirmation, provider credential provisioning, historical attempt
reconciliation, or sandbox/production payment delivery. No hosted database,
Render resource, secret, notify URL or payment state was changed as part of
this local qualification.

The native Windows procedure is documented in
`docs/payfast-local-qualification.md`. The Docker Compose path remains an
alternative for users who have Docker; it is not a prerequisite.

## Current operational gates — unchanged

1. Confirm/retain the intended PayFast sandbox database before its recorded
   free-tier expiry on 2026-11-08; do not create a paid resource without an
   explicit cost decision.
2. Have the sandbox database owner provision the dedicated
   `ghm_payment_provider` LOGIN and credential out-of-band, then apply the
   reviewed migration to that explicitly designated sandbox database.
3. Keep `ghm-payfast-sandbox-runtime` as the ordinary API. A callback must be
   a distinct service running `npm run start:payfast-callback` with only its
   callback-specific secrets and database identity.
4. Verify private DB connectivity, inbound policy, actual Render proxy/edge
   behavior, forwarded-header sanitization, health/readiness and database
   `session_user`/`current_user` identity before any fixture notification.
5. Perform historical NULL-provider inventory read-only under separate
   authorization; any reconciliation/backfill requires its own evidence and
   change approval.
6. Any real PayFast sandbox notification, sandbox notify URL change, live
   activation or production cutover remains a separate supervised and
   explicitly authorized operation.

PR #206 was squash-merged into `integration/ghm-identity-merge-candidate-20261018`
at commit `d90b83bbf762e55321c1a985cb88051a496647e0`. PR #205 was closed as
superseded and was not merged independently.


## Production GHM runtime boundary clarification — 2026-11-04

The production GHM internal runtime on Render, connected to the production
`ghm` database, is distinct from the hosted PayFast sandbox runtime/database
referenced in the non-production rollout notes.

The existing production GHM API service must remain the ordinary API process.
Do not put callback-specific PayFast secrets, `PAYFAST_CALLBACK_DATABASE_URL`,
or the `ghm_payment_provider` credential on that service. The production
callback must be a separately deployed Render service running
`npm run start:payfast-callback`, with its own callback-only environment and
dedicated provider database login.

Production enablement is not yet authorized. It requires a reviewed and
explicitly approved production `ghm` migration plan, backup/rollback plan,
out-of-band provisioning and verification of the dedicated provider login,
approved migration execution, and deployment-specific verification of
database connectivity, ingress/proxy trust, readiness and effective database
identity. Production mode must be explicitly configured; do not silently
default production to sandbox. The exact callback environment-variable names
and Render service target are to be supplied only when those prerequisites
are satisfied and the production callback service is ready for configuration.

No production database, Render service, secret, notify URL or payment state
was changed by this clarification.


## Production PayFast environment startup guard — 2026-11-04

The callback now requires an explicit `PAYFAST_ENVIRONMENT` value of
`sandbox` or `live` whenever `NODE_ENV=production`. Only non-production
processes retain the sandbox default. A focused unit test covers absent,
blank, valid and invalid configuration. The change is committed on PR #206;
GitHub Actions CI run [#41842797532](https://github.com/zaidhqdev-sys/GHM/actions/runs/41842797532)
passed on exact PR head `39bbea397dac226fe65d8287bf43d1d2de56cbf0`, including
the `quality` and Cloudflare Pages checks. The maintainer also reported
successful native Windows qualification on the isolated PostgreSQL 18
non-production database. The corresponding inline review thread is resolved.
This is a startup configuration safeguard and qualification evidence, not
authorization to deploy or configure Render.


## Merge status — 2026-11-04

The implementation was merged into
`integration/ghm-identity-merge-candidate-20261018` through PR #206 at
[d90b83b](https://github.com/zaidhqdev-sys/GHM/commit/d90b83bbf762e55321c1a985cb88051a496647e0).
The final PR-head CI run [#41844089287](https://github.com/zaidhqdev-sys/GHM/actions/runs/41844089287)
passed. This records integration-branch code acceptance only; all hosted
sandbox and production rollout gates remain separate. In particular, do not
put callback credentials or `PAYFAST_CALLBACK_DATABASE_URL` on the existing
production GHM API runtime. Production callback handling requires a distinct
callback service and dedicated production provider database identity.
No Render service, production database, credential, notify URL or payment
state was changed by the merge.


## Production rollout preparation — 2026-11-04

A production runbook has been added at
`docs/operations/payfast-production-rollout-runbook.md`. It is a planning and
preflight document only; it does not authorize or execute a production change.

The repository's `main` branch has not yet received this integration-candidate
merge. Production release planning must include the normal source promotion and
release CI path before any production migration or callback deployment. Do
not treat the integration branch merge as a production release.

The two database migrations in this feature are
`20261104120000_bind_commercial_payment_attempt_provider` and
`20261104130000_isolate_payfast_settlement_identity`. The latter requires the
dedicated `ghm_payment_provider` LOGIN to exist before migration. The migration
runner applies every pending migration in its configured migration directory,
not only these two; therefore the production migration ledger and complete
pending set must be reviewed before execution.

Production migration is a coordinated payment-processing change: the new
provider binding intentionally leaves historical attempts NULL, and the
second migration revokes settlement execution from `ghm_runtime`. Existing
pending ITNs may retry, but no callback should be acknowledged until the new
isolated callback process is verified ready. The runbook requires an explicit
maintenance/cutover window and rollback based on managed backup/PITR rather
than an improvised destructive down-migration.

The callback service's own environment is separate from the ordinary API.
At the eventual configuration handover, callback-only variables will be
provided for the dedicated callback service only. No callback database URL or
provider credential belongs on the production GHM API service.


The production rollout planning runbook is now recorded at
`docs/operations/payfast-production-rollout-runbook.md`. It documents the
production `ghm` migration sequence and complete pending-migration review,
backup/PITR and rollback limits, provider LOGIN provisioning, historical
NULL-provider inventory, release promotion (the merge is not on `main`),
separate callback service/network verification and the exact point at which
callback-only Render variables will be handed over. It is explicitly planning
only; no production resources or settings were changed.
