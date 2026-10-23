# Handover — GHM auth persistence and QuoteFlow reset qualification (2026-10-23)

## Resume here first

- Repository: [zaidhqdev-sys/GHM](https://github.com/zaidhqdev-sys/GHM)
- Active draft PR: [#183 — share persistence across reset and session qualification](https://github.com/zaidhqdev-sys/GHM/pull/183)
- Working branch: `fix/shared-auth-persistence-qualification`
- Base branch: `integration/ghm-identity-merge-candidate-20261018`
- Base candidate commit: `e5462b05e8b2b9cbc7a445c8464590a4f6d32a53`
- PR head advances with handover updates; inspect [PR #183](https://github.com/zaidhqdev-sys/GHM/pull/183) for the live SHA before resuming. The code/test changes are in the commits before the handover-only updates.
- PR is open, draft, and not merged. No reviews were present at the last check.
- CI [run #39870377111 / run number 1483](https://github.com/zaidhqdev-sys/GHM/actions/runs/39870377111) passed on PR head `37bcd4924be473aab388745bcf0a3806bf7e8ebe`: build, disposable migrations, business identity/QuoteFlow qualification, database-backed test suite, migration-audit policy tests, and runtime-boundary verification. This was the latest live head at time of check; re-check after documentation changes.

## What changed on PR #183

1. `src/http/app.ts`: optional `authPersistence?: AuthPersistence` injection on `createApp`; one selected persistence instance is passed to the auth router and used to build default reset services.
2. `src/http/auth-router.ts`: lazy `createGhmAuthService` construction receives the same injected persistence. This fixes the discovered wiring gap where reset completion could use the runtime-pool-backed persistence but post-reset login/session issuance could silently create a default persistence instance.
3. `scripts/qualify-business-identity-runtime.mjs`: business identity qualification server explicitly injects `PostgresAuthPersistence(runtimePool)` and a bearer authenticator backed by `PostgresAccountAuthStateStore(runtimePool)`.
4. `src/http/app.test.ts`: regression test asserts that post-reset login receives the app-injected persistence.
5. `scripts/qualify-quoteflow-migration-reset-http.mjs`: new disposable-PostgreSQL HTTP qualification, included in `npm run qualify:business-identity-runtime`. Checks runtime/migrator identities and guarded target, anti-enumerating unknown/eligible recovery responses, delivery, real reset completion, fresh session issuance, fresh bearer token accepted at protected profile route, previous session revoked, and token replay rejected. Existing DB qualification covers expiry and rollback.
6. `scripts/qualify-quoteflow-migration-reset-ceremony-db.mjs`: aligns synthetic approved email casing with normalized login email so expected completion behavior is explicit.
7. Handover/status register updated in `docs/GHM_CURRENT_STATE.md` and `docs/GHM_REMAINING_WORK_REGISTER_2026-10-05.md`.

## Current release gates

- **Governed dedicated Render non-production DB qualification is still blocked**: DB `ghm_identity_qualification_20261018`, ID `dpg-dba0tu3rjlhs738fs2sg-a`, has no DB IP allowlist entry and cannot be reached by the hosted query tool. No successful SQL was executed against it. Do not alter Render/DB allowlists; user has stated the Render Free public-IP rule cannot be changed. Do not substitute the shared PayFast sandbox DB as qualification evidence.
- Independent review of the migration chain and `SECURITY DEFINER` runtime trust boundaries remains open.
- GHM-native identity/session and selected-business HTTP flow in approved non-production remains open.
- QuoteFlow reset/re-enrollment ceremony on the governed target remains open, including expiry, replay, rollback, revocation, and fresh session.
- Cross-client QuoteFlow parser/runtime contract and data/storage-scope migration remain open.
- Zaid Connect browser E2E and workflows remain open.
- Candidate PR #142 remains draft; do not merge/promote either PR until review and gates are evidenced.

## Safety constraints / user-owned state

- Do not touch production database, production deployment, secrets/environment variables, provider activation, cutover, or Render/DB network rules without explicit authorization.
- Do not run migration audit `npm run audit:migrations` until its non-production target is explicitly configured and verified; its default target is `ghm_db`.
- Preserve the user's local uncommitted change in `scripts/qualify-business-identity-runtime.mjs` on their local checkout. The change was observed locally on HEAD `4b020476300585bd9552d1c6bd7eb25f5a2690aa` and must not be reset, overwritten, committed, or pushed without permission. This remote PR independently implements the runtime-pool auth wiring.
- No production migration, deployment, secret/config change, provider activation, or cutover has occurred.

## Immediate next actions

1. Check workflow run #39869380123 for current head `5394bd1704c1b2ddd221b4d2075cce7415aa0e51`; inspect logs if it fails.
2. Inspect any new PR review comments and fix proven code-level gaps while keeping the PR draft.
3. Do a bounded read-only review of every relevant `SECURITY DEFINER` function and HTTP caller; record evidence and questions for an independent reviewer. Do not declare independent review complete just because of self-review. Specific review question: migration `20261016100000_add_connect_identity_authority_contract.sql` defines `ghm.auth_read_connect_identity_authority(p_account_id bigint)` as `SECURITY DEFINER` and grants execution to `ghm_runtime`; it accepts an account ID parameter and returns role, operator intent, system-admin, and founder-reviewer flags. I found no callsite in the two inspected Connect adapters (`identity-adapter.ts` and `authorization-binding.ts`), but that is not exhaustive proof of no callsites. Trace all callers and determine whether the function is necessary and whether callers bind the ID to verified request identity; treat this as an independent-review question, not a confirmed vulnerability.
4. Continue updating this handover plus `GHM_CURRENT_STATE.md` and the remaining-work register after material changes and before ending a session.
5. Keep the dedicated DB gate open until access is resolved through an approved path; do not attempt infra workarounds or use another database as substitute evidence.


## Bounded SECURITY DEFINER follow-up — 2026-10-23

Reviewed migration `20261016100000_add_connect_identity_authority_contract.sql` and the `src/integrations/connect/identity-adapter.ts` and `src/integrations/connect/authorization-binding.ts` files. The function `ghm.auth_read_connect_identity_authority(p_account_id bigint)` is `STABLE SECURITY DEFINER`, owned by `ghm_schema_owner`, with `PUBLIC` execution revoked and execution granted to `ghm_runtime`. It uses `SET search_path = ghm, pg_temp` and returns Connect role, business-operator intent, system-admin status, and active founder-directory-reviewer status for the supplied account ID. The two inspected Connect adapter files do not call it; this bounded check is not proof that no other caller exists.

**Independent review question (not a confirmed vulnerability):** determine whether this function is needed by any runtime caller and whether caller-supplied account IDs are always derived from verified identity context. Because the runtime role can execute it for an arbitrary ID, assess whether cross-account authority-flag disclosure is acceptable under the intended trust boundary. Review the entire migration chain and all callers before changing or removing the function.


## Additional read-only SQL boundary checks — 2026-10-23

Inspected the definitions and grants for the QuoteFlow reset completion function, storage persistence functions, and the core auth runtime-function migration. The reset completion function is `SECURITY DEFINER`, owned by `ghm_schema_owner`, sets `search_path = pg_catalog, ghm, pg_temp`, revokes PUBLIC execution, and grants runtime execution; its body validates the token/password inputs, locks and validates enrollment/account/recovery state, updates password, revokes sessions, and completes enrollment in one transaction. Storage migration defines explicit object-state transition functions and a subsequent hardening migration changes them to SECURITY DEFINER, fixes search_path to `pg_catalog, ghm`, revokes PUBLIC execution, and grants execution to runtime. Core auth functions generally use `search_path = pg_catalog, ghm`, owner `ghm_schema_owner`, revoke PUBLIC execution, and grant selected operations to `ghm_runtime`.

This is a bounded source inspection, not an independent security audit. Continue tracing every caller and reviewing argument-to-authenticated-context binding, especially for functions that accept account/session/object IDs. No proven defect was established by this pass; keep independent review as a release gate.


## Auth runtime function caller review — 2026-10-23

Read-only inspection of `src/auth/foundation/persistence.ts`, `src/auth/ghm-auth-service.ts`, `src/http/auth-router.ts`, and migration `20260921130000_create_auth_runtime_functions.sql` shows the persistence class wraps selected SECURITY DEFINER functions, including session validation/revocation and password operations. The SQL grants `ghm_runtime` execution on `auth_change_password(account_id, keep_session_id, ...)` and `auth_disable_account(account_id)`; both accept numeric IDs. The auth-service/router excerpts inspected did not reveal a user-facing route for these operations, and the router itself exposes register/login/refresh/recovery/reset flows. The persistence interface includes `changePassword` and `disableAccount`, but this pass did not exhaustively trace every caller across the repository.

**Review requirement:** search all callers of `changePassword`, `disableAccount`, `auth_change_password`, and `auth_disable_account`; if callable from any runtime path, verify account ID and keep-session ID are derived from verified bearer/session context and not client-controlled request fields. Since the DB role itself cannot identify the authenticated HTTP principal, this trust boundary must be enforced by the application or by a safer database API. No vulnerability is confirmed by this bounded review.


## Auth function review continuation — 2026-10-23

CI run #1483 passed on PR head `37bcd4924be473aab388745bcf0a3806bf7e8ebe`. A closer read of migration `20260921130000_create_auth_runtime_functions.sql` shows `auth_change_password(account_id, keep_session_id, ...)` updates the password for the supplied account and revokes all other sessions except the supplied session ID; `auth_disable_account(account_id)` disables the supplied account and revokes its sessions. Both are SECURITY DEFINER with fixed `pg_catalog, ghm` search path, owner `ghm_schema_owner`, PUBLIC execute revoked, and execute granted to `ghm_runtime`. These functions do not themselves authenticate an HTTP principal; the application trust boundary must protect their IDs. The persistence interface exposes both methods, but the inspected auth router has no corresponding password-change/disable route. Repository-wide callsite search through the available GitHub search endpoint returned no indexed results, so do not treat that as proof of no callers. The correct next step is exhaustive local/repo-wide callsite search plus independent review; do not change grants or delete APIs until callers and product intent are confirmed.


## Latest checkpoint — 2026-10-23

CI run #1486 passed on the PR head that included the latest handover updates. The full available source scan has not yet been completed: GitHub's repository search endpoint returned no indexed results for the password-change/disable symbols, and batched file retrieval hit the tool's call limit before all 67 relevant TypeScript files could be scanned. Therefore, no claim of exhaustive caller absence is justified. Next: use a local clone/repository-wide grep or another complete source-search method to trace `changePassword`, `disableAccount`, `auth_change_password`, `auth_disable_account`, and `auth_read_connect_identity_authority`; document exact callers and test that account/session IDs originate from authenticated context. Do not alter SQL grants or remove functions based on incomplete search evidence.


## CI checkpoint — 2026-10-23 23:20 UTC

CI run [#39871050327 / run 1489](https://github.com/zaidhqdev-sys/GHM/actions/runs/39871050327) passed on PR head `97f947045859a928577fefbc5206271201f66ae1`. PR #183 remains draft. The PR summary describes shared `AuthPersistence` injection into `createApp`/auth routes, binding qualification auth to the guarded runtime pool, and disposable-PostgreSQL HTTP coverage for anti-enumerating recovery, reset completion, fresh bearer validation, old-session revocation, and token replay. CI is not a substitute for the blocked governed Render DB qualification.

Caller tracing remains incomplete. The inspected persistence layer is the only positive code hit found so far for `auth_change_password` and `auth_disable_account`; router excerpts contain no public password-change or account-disable route. This is not an exhaustive result: the 174-file source tree scan was only partially completed due tool call limits. Do not infer absence of other callers. Continue targeted search in the remaining source/resource/migration files or obtain a local clone, then verify identity binding and document concrete callsites. Do not change grants based on incomplete search.

## Current PR head CI confirmation — 2026-10-23

Confirmed CI [run #39871558529 / run 1492](https://github.com/zaidhqdev-sys/GHM/actions/runs/39871558529) completed successfully on PR #183 head `b90b74881b81105221db5389bea49e434a9b9ac4`, which includes the current handover updates. The PR remains draft. This green run covers CI's configured checks but does not close the isolated Render database qualification or independent security-review gates.

Caller-tracing status is unchanged: available GitHub code search returned no indexed results for `auth_read_connect_identity_authority`, and the full non-test TypeScript scan could not be completed within tool call limits. No conclusion of “no callers” is justified. Next work should use a complete local clone/repository-wide search or a reliable source-indexing route and trace exact callsites before changing any SECURITY DEFINER grants.


## CI rerun after handover update — 2026-10-23

Confirmed CI [run #39871757166 / run 1493](https://github.com/zaidhqdev-sys/GHM/actions/runs/39871757166) completed successfully on PR #183 head `934714faf795671e3281cb8494c8bd4b72c06388`. The PR remains draft. This verifies the then-current handover commit. Subsequent edits will require their own CI result.

I attempted a complete GitHub-blob scan of source TypeScript and SQL migrations for `changePassword`, `disableAccount`, `auth_change_password`, `auth_disable_account`, and `auth_read_connect_identity_authority`, but the orchestration tool enforced a maximum tool-call count before the scan completed. Treat the caller trace as incomplete; no conclusion of absent callers or clean security boundary follows. The next practical step is a local clone/grep or a smaller, explicitly bounded set of blob batches, then verify every actual caller and tests. No code/security grants were changed during this attempt.


## Latest checkpoint — 2026-10-23 23:30 UTC

Confirmed CI run [#39871983637 / run 1494](https://github.com/zaidhqdev-sys/GHM/actions/runs/39871983637) succeeded on PR head `daf9f184093726b19cbdf288bdf7cee70f845f2a`; job `quality` completed successfully, including migration audit policy tests and runtime-boundary verification. PR #183 remains draft.

Targeted source review: `src/auth/foundation/persistence.ts` defines and calls `auth_change_password` and `auth_disable_account`, accepting account/session IDs; no matching public route appeared in the inspected `src/http/auth-router.ts`. The SQL migration grants `ghm_runtime` EXECUTE on these SECURITY DEFINER functions, so trusted caller context remains important. The `auth_read_connect_identity_authority` function is defined in its migration but did not appear in the inspected persistence class; GitHub code search reported zero results with `incomplete_results: true`, which is inconclusive. A complete source caller trace is still outstanding; do not infer no callers or change grants based on this bounded scan. Dedicated Render DB qualification and independent security review remain open.

## Caller-trace refinement — 2026-10-23

CI [run #39872258508 / run 1497](https://github.com/zaidhqdev-sys/GHM/actions/runs/39872258508) passed on the current PR head `57028b92c435f643ea63c0c8e6ea3ba4676ec606` (quality job successful).

A targeted read of `src/auth/foundation/persistence.ts` confirms the `AuthPersistence` interface exposes `changePassword(accountId, keepSessionId, ...)` and `disableAccount(accountId)`; the PostgreSQL implementation calls `ghm.auth_change_password` and `ghm.auth_disable_account`. In the inspected `src/http/auth-router.ts`, there are no routes that call these methods. The SQL functions are SECURITY DEFINER and executable by `ghm_runtime`, so the remaining question is whether another application module calls the persistence methods directly or whether these wrappers/functions are currently unused. Separately, `auth_read_connect_identity_authority(p_account_id)` is defined/granted in migration `20261016100000_add_connect_identity_authority_contract.sql`, but no wrapper was found in the inspected persistence file. This is bounded evidence, not a complete repository-wide proof. Keep caller trace and independent review open; no permissions or application code changed.

## CI checkpoint — 2026-10-23 23:35 UTC

Verified CI [run #39872544366 / run 1500](https://github.com/zaidhqdev-sys/GHM/actions/runs/39872544366) passed on PR head `bc0ba1b1d0f53ecbdbd4d0127b791d4237b31533`; quality job successful including disposable PostgreSQL qualification, DB-backed test suite, migration audit policy, and runtime-boundary verification.

Repeated GitHub code searches for `changePassword`, `disableAccount`, `auth_change_password`, `auth_disable_account`, and `auth_read_connect_identity_authority` returned no indexed results. This search mechanism is not authoritative and does not prove absence of callers. Targeted file inspection confirms `src/auth/foundation/persistence.ts` contains wrappers for the first two SQL functions; the inspected `src/http/auth-router.ts` has no matching public routes. The identity-authority function is defined and granted to `ghm_runtime` in migration `20261016100000_add_connect_identity_authority_contract.sql`, but no wrapper was found in the inspected persistence class. Full source-wide caller trace and independent security review remain open. Do not change grants without a complete trace and reviewer sign-off.

These documentation commits will create a newer head than the green CI commit above; recheck CI on the final updated head. Dedicated governed Render DB qualification remains blocked by its existing access restriction; no infrastructure or permissions were changed.

## CI confirmation — 2026-10-23 23:38 UTC

CI [run #39872823317 / run 1503](https://github.com/zaidhqdev-sys/GHM/actions/runs/39872823317) completed successfully on code/documentation head `903d35446dbffbb2e2975cc60b46fb1c211816f2`. All quality steps passed: build, disposable PostgreSQL migrations, business identity + QuoteFlow reset HTTP qualification, DB-backed tests, migration-audit policy, and runtime-boundary verification.

Targeted verification also reconfirmed that the qualification script injects app auth persistence and that app tests assert the lazy auth service receives that injected persistence. This addresses the previously identified split-persistence wiring concern in the PR's disposable-DB HTTP qualification. Remaining gates: full source-wide caller trace for the password-change/account-disable/identity-authority SECURITY DEFINER functions, independent security review, and governed isolated Render DB qualification. The GitHub code search mechanism remains inconclusive; do not infer absence of callers or alter grants without complete evidence. These handover edits will create a new head, so CI must be checked again after commit.


## Current-head CI verified — 2026-10-23

Verified CI [run #39873076795 / run 1506](https://github.com/zaidhqdev-sys/GHM/actions/runs/39873076795) passed on PR head `712d989a46693ea296df23a077bc6862317215b0`. The `quality` job succeeded, including disposable PostgreSQL migration qualification, business identity and QuoteFlow reset HTTP qualification, database-backed test suite, migration audit policy, and runtime-boundary verification.

Source review status: this does not close the full caller trace. The source tree has 174 non-test TypeScript files; a complete read/search of every file was not achieved with the current repository tools. Existing targeted reads show persistence wrappers for `changePassword` and `disableAccount`, no corresponding route in the inspected auth router, and a runtime-granted `auth_read_connect_identity_authority` SQL function without a wrapper in the inspected persistence class. Do not treat this as exhaustive evidence of no other callers. Next: get a local/reliable repository-wide search, then review concrete callsites and grants independently. No SQL grants, production configuration, or Render networking were changed.

Dedicated governed Render DB qualification remains open because the DB access restriction prevents the available query tool from reaching it; do not substitute the shared sandbox or change allowlists without explicit authorization. PR #183 remains draft.


## CI #1509 and SECURITY DEFINER trust-boundary detail — 2026-10-23

CI [run #39873371352 / run 1509](https://github.com/zaidhqdev-sys/GHM/actions/runs/39873371352) completed successfully on PR head `7d97d2a511993707678e342007ab59f405ada0ef`; all quality steps passed, including build, all migrations on disposable PostgreSQL, business identity + QuoteFlow reset HTTP qualification, DB-backed tests, migration audit policy, and runtime boundary verification.

A closer read of migration `20260921130000_create_auth_runtime_functions.sql` shows `ghm.auth_change_password(p_account_id, p_keep_session_id, ...)` and `ghm.auth_disable_account(p_account_id)` are SECURITY DEFINER, owned by `ghm_schema_owner`, PUBLIC execute revoked, but EXECUTE granted to `ghm_runtime`. Their SQL bodies trust the supplied account/session IDs; they do not independently derive the acting account from a verified request/session. The TypeScript persistence wrappers likewise accept accountId and keepSessionId as parameters. No public password-change/disable route was found in the inspected auth router. This is a concrete trust-boundary review item: determine whether these functions are intentionally callable by the trusted app runtime, whether any service invokes the wrappers, and whether the runtime role should retain execute grants. Do not revoke/change grants until a complete caller trace and independent review establish the intended contract.

The identity-authority function in `20261016100000_add_connect_identity_authority_contract.sql` similarly takes arbitrary `p_account_id`, is SECURITY DEFINER, and is executable by `ghm_runtime`; no wrapper was found in the inspected persistence class. This is not by itself proof of a vulnerability, but its account-ID provenance and necessity need review. The complete scan of 174 non-test TypeScript files remains outstanding due tool limits. Dedicated governed Render DB qualification remains blocked by the existing access restriction; no production, database grants, or Render networking were changed.


## Current-head CI and expanded caller review — 2026-10-23

CI [run #39873797461 / run 1512](https://github.com/zaidhqdev-sys/GHM/actions/runs/39873797461) passed on head `db6f1d9d224b0427957d8081f04be3cd9163fbed`. Build, disposable PostgreSQL migrations, business identity + QuoteFlow reset HTTP qualification, DB-backed tests, migration audit policy, and runtime-boundary verification all passed.

Expanded targeted reads across auth context, auth service, Connect identity/authorization adapters, HTTP routers, and QuoteFlow reset completion did not find direct TypeScript calls to `changePassword`, `disableAccount`, or a wrapper for `auth_read_connect_identity_authority` in the files inspected. Connect's authorization-binding adapter derives the end-user context from an account mapping and current account-auth state; this is a separate verified pattern, not evidence that all SQL function callers have been traced. A complete scan of the 174 non-test TypeScript files and all migrations is still outstanding. Keep the SECURITY DEFINER review open and do not modify grants until the full call graph and intended runtime trust model are reviewed.

The three handover documents have been updated. This produces a newer docs commit, so check CI on that newer head before claiming the latest head is green. Dedicated governed Render DB qualification remains blocked by existing access controls. No production, Render networking, secrets, or SQL grants were changed.


## Checkpoint — 2026-10-23 23:51 UTC

Verified CI [run #39874206024 / #1515](https://github.com/zaidhqdev-sys/GHM/actions/runs/39874206024) passed on PR head `5eff3eaff0d72695a644e0ac4814b7824e2df1c3`; all quality steps passed: build, disposable PostgreSQL migrations, business identity + QuoteFlow reset HTTP qualification, database-backed tests, migration-audit policy, runtime-boundary verification.

Current code read confirms `src/http/auth-router.ts` lazily constructs `createGhmAuthService(dependencies.authPersistence)`, so the shared persistence injection point is present. `src/auth/foundation/persistence.ts` exposes `changePassword(accountId, keepSessionId, ...)` and `disableAccount(accountId)`, which call SECURITY DEFINER functions. Migration `20260921130000_create_auth_runtime_functions.sql` revokes PUBLIC execute and grants `ghm_runtime` execute on both. The identity-authority function is likewise SECURITY DEFINER and runtime-executable. No public route for password change/disable was found in the inspected auth router; no wrapper for the identity-authority function was found in the inspected persistence file. This remains a bounded review, not proof of no other callsites. Do not change grants without a full callsite/role trust review.

The three docs are being updated now, producing a new head that will require a fresh CI check. Remaining gates: full repository-wide caller trace, independent SECURITY DEFINER review, dedicated governed Render DB qualification. No database grants, production, or Render settings changed.

## CI current-head checkpoint — 2026-10-23

Verified CI [run #39874483294 / #1518](https://github.com/zaidhqdev-sys/GHM/actions/runs/39874483294) passed on PR head `bfe740630d514bedb331dff7672cbe1a3b4e57ef`. The quality job completed successfully: build, all migrations on disposable PostgreSQL, business identity and QuoteFlow reset HTTP qualification, DB-backed test suite, migration-audit policy, and runtime-boundary verification.

No code or privilege changes were made in this checkpoint. The complete source-wide callsite trace for `auth_change_password`, `auth_disable_account`, and `auth_read_connect_identity_authority` remains open; prior targeted file inspections are not proof of no callers. Independent review of SECURITY DEFINER grants/trust boundaries and dedicated governed Render DB qualification also remain open. This documentation update creates a newer commit and requires a new CI check for that head. PR #183 stays draft; production, Render settings, and secrets remain unchanged.


## CI #1521 confirmed green — 2026-10-24

Verified current head `288c5971db99534c0f41e48ba3fa2deebe0de919` has successful [CI run #1521](https://github.com/zaidhqdev-sys/GHM/actions/runs/39874751091). The quality job completed all steps successfully: build, disposable PostgreSQL migration application, business identity and QuoteFlow reset qualification, required database-backed test suite, migration audit policy, and runtime-boundary verification.

Attempted to obtain a local checkout for a complete source/migration grep, but this environment cannot resolve github.com; the repository API's code search returns no results and its index status is unavailable. Therefore a true exhaustive source-wide callsite trace cannot be claimed from this session. Bounded direct reads still show persistence wrappers for `auth_change_password` and `auth_disable_account`, no public route in the inspected auth router, and no wrapper for `auth_read_connect_identity_authority` in the inspected persistence class. The SQL functions accept caller-supplied account/session identifiers and are executable by `ghm_runtime`; keep this as an independent-review gate. Do not alter grants until full callsites and intended runtime trust model are established.

This doc update creates a newer head and therefore needs a fresh CI check. PR #183 remains draft. Dedicated governed Render DB qualification remains blocked by existing access restrictions. No SQL grants, production, Render configuration, or secrets changed.


## Caller-trace continuation — 2026-10-23 00:11Z

Reviewed against PR #183 head `a74873ef11be01b35a3bca7ccbac02c73e2af823`. The PR head's recursive Git tree is readable through the repository API (668 tracked text/source files were enumerated; 457 source-like files had extensions in the initial inventory). Targeted GitHub code searches for `auth_change_password`, `auth_disable_account`, and `auth_read_connect_identity_authority` returned no results; the repository code-search index remains unavailable/inconclusive. A broad blob-by-blob scan was attempted but exceeded the available tool-call limit before it could return results. Therefore, this session has **not** completed a repository-wide callsite trace.

Direct source evidence reconfirmed:

- `src/auth/foundation/persistence.ts` defines `changePassword(accountId, keepSessionId, ...)` and calls `ghm.auth_change_password(...)`; it defines `disableAccount(accountId)` and calls `ghm.auth_disable_account($1)`.
- `src/http/auth-router.ts` was inspected for this trace. Its visible password recovery/reset and login/session routes do not establish a public route for these two persistence methods. This is a file-level observation only, not proof there are no callers elsewhere.
- `database/migrations/20260916100000_add_connect_identity_authority_contract.sql` defines `ghm.auth_read_connect_identity_authority(p_account_id bigint)` as `SECURITY DEFINER`, owned by `ghm_schema_owner`, revokes PUBLIC privileges, and grants EXECUTE to `ghm_runtime`. The function reads identity-authority fields for the supplied account ID; the function signature itself has no actor/session argument. No wrapper was found in the inspected persistence class.
- `database/migrations/20260921130000_create_auth_runtime_functions.sql` contains the auth runtime mutation boundary and its SECURITY DEFINER function/grant declarations. The persistence wrappers supply account/session IDs as arguments. Whether all granted operations are reachable only through trusted application code is still unproven.

These observations identify a concrete review question, **not a confirmed exploit**: establish every source and SQL caller, how caller identity is authenticated/bound, whether any route/job can supply arbitrary account/session IDs, and whether each runtime EXECUTE grant is necessary. Do not alter grants until the callsite map and independent security review are complete.

The current-head tree and targeted source reads were read-only. No code behavior, grants, database state, production, Render configuration/networking, secrets, provider activation, or cutover was changed. PR #183 remains draft. CI #1524 was green on the prior head `a74873ef11be01b35a3bca7ccbac02c73e2af823`; documentation commits made after that head require a fresh CI result. Remaining gates: (1) exhaustive source/migration caller trace, (2) independent SECURITY DEFINER/grant review, and (3) dedicated governed non-production Render DB qualification when authorized access is available.


## SQL body semantics — targeted follow-up, 2026-10-23 00:11Z

Read the relevant SQL bodies in `database/migrations/20260921130000_create_auth_runtime_functions.sql` (lines around the password-change and account-disable definitions), plus application wiring and the persistence integration test. This sharpens the review question:

- `auth_change_password(p_account_id, p_keep_session_id, ...)` delegates to `auth_set_password(p_account_id, ...)`, then revokes all sessions for the supplied account except the supplied keep-session ID. The body does not itself establish that the caller is authenticated as that account, or that `p_keep_session_id` belongs to `p_account_id`.
- `auth_disable_account(p_account_id)` updates the supplied account to disabled and revokes its sessions. The body does not itself bind the supplied account ID to an authenticated actor or a separate governed administrator authority.
- `auth_read_connect_identity_authority(p_account_id)` returns identity/authority attributes for the supplied account ID and has no actor/session argument. This may be acceptable behind a trusted server-side boundary, but that boundary and every caller must be demonstrated.
- `src/http/app.ts` creates one `authPersistence` and injects it into password-reset and QuoteFlow reset services and the auth router. `src/auth/ghm-auth-service.ts` uses the persistence interface for normal registration/login/session flows; the inspected service source contains no use of the password-change or account-disable methods. `src/auth/foundation/persistence.test.ts` does directly exercise `disableAccount` as an integration-test caller; that is test evidence, not an application route.

The SQL functions are deliberately privileged mutation/read boundaries, so a trusted runtime may be the intended caller. The unresolved issue is whether that trust is adequately enforced at every callsite and whether each runtime grant is necessary. This targeted inspection still does not replace an exhaustive repository-wide source/migration caller map or independent review. No grant change is recommended from this evidence alone.


## Repository-wide source/migration caller trace — 2026-10-23 continuation

Completed a content scan of the tracked executable-source/migration files at base commit `843718e34b4ac9ade906c1158327286c859c9a56`: all 305 `.ts/.tsx` files (including tests), 77 `.js/.mjs/.cjs/.mts/.cts` files, and 88 `.sql` migrations. Exact-name and wrapper-method matches were reviewed. This supersedes the earlier statement that no identity-authority wrapper/caller had been found; the earlier statement was based on the auth persistence class only.

### Caller map

| Function/method | Definition and references found | Trust-boundary result |
|---|---|---|
| `ghm.auth_change_password(...)` / `changePassword(...)` | SQL definition/grant in `20260921130000_create_auth_runtime_functions.sql`; wrapper in `src/auth/foundation/persistence.ts`; no application invocation found in non-test TS/TSX, JS/MJS, or other SQL migrations. Test files contain interface mocks, not a production call. | Currently appears unused by production application code while EXECUTE remains granted to `ghm_runtime`. Function accepts account and keep-session IDs and does not bind them to an actor itself. Independent reviewer should confirm no external/operational caller is part of the intended contract before considering a grant change. |
| `ghm.auth_disable_account(...)` / `disableAccount(...)` | SQL definition/grant in the same migration; wrapper in `src/auth/foundation/persistence.ts`; no application invocation found in non-test TS/TSX, JS/MJS, or other SQL migrations. A persistence integration test calls the method; other tests provide mocks. | Currently appears unused by production application code while EXECUTE remains granted to `ghm_runtime`. Function accepts an account ID and does not bind it to an actor/admin authority itself. Independent reviewer should confirm no external/operational caller before any grant change. |
| `ghm.auth_read_connect_identity_authority(bigint)` | SQL definition/grant in `20261016100000_add_connect_identity_authority_contract.sql`; exactly two application SQL callsites in `src/resources/business-identity/repository.ts`: `ACCOUNT_SELECT` and `updateAccount(... RETURNING ...)`. No other source or migration references found. | Both calls are made through repository methods using `context.userId` as the account ID. `getAccount` uses `withAuthorizedTransaction(context, ...)`; `updateAccount` first calls `requireAccount(client, context)`, then performs the update with `WHERE id = context.userId`, inside `withAuthorizedTransaction`. The HTTP `GET/PATCH /api/v1/profile` routes require `resourceAuthMiddleware` and registered profile access; `GET /api/v1/identity` uses the same service identity context under verified resource auth. `resource-auth.ts` derives AuthContext after GHM ES256 bearer verification and DB-backed account-state loading. This is a coherent caller-side identity binding for the observed paths, but the runtime SQL grant still means a trusted runtime process can invoke the function with arbitrary IDs if it bypasses this repository boundary. |

### Review conclusion / next gate

The source-level trace now supports a stronger bounded conclusion: the identity-authority read is used only from the Business Identity repository and its current observed callsites bind the account ID to the verified AuthContext; the password-change and account-disable wrappers have no production source caller in the scanned repository. This is not proof that there are no out-of-repository operational callers or direct SQL use. Do not change grants solely from this trace: obtain an independent security review of whether the two unused mutation grants should be removed in a new reviewed migration, and whether the identity-authority read grant is appropriately constrained by the trusted runtime boundary. Preserve PUBLIC revokes and avoid production/runtime DB mutation during review.

This scan was read-only. No code behavior, grants, database state, production, Render configuration/networking, secrets, provider activation, or cutover changed. Documentation commits after the prior green CI head need fresh CI verification; PR #183 remains draft. Dedicated governed non-production Render DB qualification remains blocked by existing access restrictions.


## CI checkpoint — 2026-10-23 00:23 UTC

Verified GitHub Actions CI run **#1531** (run ID `39877622657`) on commit `518c4541b8af589ad101777a12d6b189ce764293`: the `quality` job passed. Confirmed successful steps include isolated least-privilege DB role creation, ephemeral ES256 key generation, build, all migrations on disposable PostgreSQL, Business Identity/QuoteFlow migration qualification, required DB-backed test suite, migration audit policy tests, and runtime boundary verification. [Run #1531](https://github.com/zaidhqdev-sys/GHM/actions/runs/39877622657).

This verifies the caller-trace documentation head before this CI checkpoint was appended; the documentation commit(s) that record this checkpoint require their own CI result. PR #183 remains draft. No independent security review is recorded yet; request an authorized maintainer to assign/perform that review. Do not self-certify this as independent review or change SQL grants before it.


## Follow-up checkpoint — CI #1534 and review status (2026-10-23 00:26 UTC)

CI **#1534** (run ID `39877952670`) completed successfully on commit `9f5a10b3b34374046953147e6209c7c3ee47ad8f`. The `quality` job passed all steps: isolated least-privilege database roles, ephemeral ES256 keys, build, all migrations on disposable PostgreSQL, Business Identity/QuoteFlow migration qualification, database-backed tests, migration audit policy tests, and runtime boundary verification. [CI #1534](https://github.com/zaidhqdev-sys/GHM/actions/runs/39877952670).

Checked PR #183 reviews and discussion after the security-review request: no submitted pull-request reviews are present, and no independent reviewer response/assignment is recorded. The request remains open; do not represent the review as completed. The next docs commit will require its own CI check. No grant changes made. PR remains draft and governed non-production DB qualification remains blocked by access restrictions.


## CI #1537 completion — 2026-10-23 00:28 UTC

Verified CI run **#1537** (run ID `39878195086`) completed successfully on latest handover head `3686ba65d70dceaaeaa6a08216e0934f721223d2`. The `quality` job passed. [CI #1537](https://github.com/zaidhqdev-sys/GHM/actions/runs/39878195086).

Rechecked PR #183 review records: no submitted pull-request review exists. The independent review request remains outstanding, and no reviewer identity has been assumed. Next work remains (1) obtain an authorized independent reviewer, (2) keep grants unchanged pending that review, and (3) resume governed non-production DB qualification only when access is authorized. This note creates a newer docs commit, so CI must be rechecked on its resulting head. PR #183 remains draft.


## CI #1540 completion — 2026-10-23 00:31 UTC

Verified CI run **#1540** (run ID `39878374504`) passed on commit `4f3219fb56b2b502d93ed4e59a036f45bec28015`. All quality-job steps succeeded, including isolated least-privilege DB roles, ephemeral ES256 keys, build, applying all migrations to disposable PostgreSQL, Business Identity/QuoteFlow migration qualification, required DB-backed test suite, migration audit policy tests, runtime-boundary verification, and container cleanup. [CI #1540](https://github.com/zaidhqdev-sys/GHM/actions/runs/39878374504).

The three documents are now being updated to record this checkpoint; that new documentation head requires fresh CI. PR #183 remains draft. No independent security review is recorded; the request in the PR discussion remains open. No grants, production systems, Render networking/configuration, secrets, provider activation, or cutover changed. Governed non-production DB qualification remains blocked by existing access restrictions.
