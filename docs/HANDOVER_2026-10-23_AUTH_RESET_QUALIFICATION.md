# Handover — GHM auth persistence and QuoteFlow reset qualification (2026-10-23)

## Resume here first

- Repository: [zaidhqdev-sys/GHM](https://github.com/zaidhqdev-sys/GHM)
- Active draft PR: [#183 — share persistence across reset and session qualification](https://github.com/zaidhqdev-sys/GHM/pull/183)
- Working branch: `fix/shared-auth-persistence-qualification`
- Base branch: `integration/ghm-identity-merge-candidate-20261018`
- Base candidate commit: `e5462b05e8b2b9cbc7a445c8464590a4f6d32a53`
- Last observed PR head: `5394bd1704c1b2ddd221b4d2075cce7415aa0e51` (handover documentation commit)
- PR is open, draft, and not merged. No reviews were present at the last check.
- Latest CI at last check: [run #39869380123 / run number 1472](https://github.com/zaidhqdev-sys/GHM/actions/runs/39869380123), still in progress. Earlier code head `dd5d79dad5b51845c99bdd6c25078cb358eb293c` passed [run #39868903311 / run number 1470](https://github.com/zaidhqdev-sys/GHM/actions/runs/39868903311). Re-check CI on the current head before stating latest branch is green.

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
3. Do a bounded read-only review of every relevant `SECURITY DEFINER` function and HTTP caller; record evidence and questions for an independent reviewer. Do not declare independent review complete just because of self-review.
4. Continue updating this handover plus `GHM_CURRENT_STATE.md` and the remaining-work register after material changes and before ending a session.
5. Keep the dedicated DB gate open until access is resolved through an approved path; do not attempt infra workarounds or use another database as substitute evidence.
