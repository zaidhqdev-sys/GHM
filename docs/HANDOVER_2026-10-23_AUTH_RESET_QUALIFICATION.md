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
