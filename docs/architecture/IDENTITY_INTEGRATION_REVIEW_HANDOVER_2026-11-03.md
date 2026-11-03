# Identity Integration Review Handover — 2026-11-03

Repository: zaidhqdev-sys/GHM
Candidate branch: integration/ghm-identity-merge-candidate-20261018
Reviewed head: 8739b0bf24ef2619f63a14d06a1db3f64138330c
PR #142: https://github.com/zaidhqdev-sys/GHM/pull/142 (open, draft)
CI #1839: https://github.com/zaidhqdev-sys/GHM/actions/runs/41730855382 (passed on the exact head).

## Safety

Do not merge PR #142 wholesale. It is a broad divergent integration candidate, not a release bundle. Do not run shared Render qualification, production migrations, production writes, grants, deployment, provider activation, or cutover without fresh explicit authorization. Preserve the untracked local .ghm-quoteflow-readonly-preflight.mjs; do not remove or commit it. No source or environment changes were made during this review.

## CI evidence

CI #1839 passed build, all migrations against disposable PostgreSQL, Business Identity and QuoteFlow migration qualification, DB-backed tests, migration audit policy tests, and runtime boundary verification. This is disposable-CI evidence only, not shared Render or production qualification.

## Read-only security findings

### Database and migration boundary
- QuoteFlow provisioning is a SECURITY DEFINER function owned/executable by ghm_schema_owner, not ghm_runtime.
- Qualification connects as migrator, explicitly switches to ghm_schema_owner, and verifies runtime cannot execute provisioning or directly write mapping/audit tables.
- Provisioning validates active Business-role ownership and source/provider inputs; uses transaction-scoped advisory locks and uniqueness constraints; handles idempotent retries; records mapping/audit provenance. Qualification checks concurrency and rollback.
- Cleanup is scoped to synthetic run fixtures and transactional; process/network interruption can still leave residue.
- Business Registration Identity is private self-declared data, not independent verification or public projection. RLS is enabled; direct PUBLIC/runtime privileges are revoked. Read/update SECURITY DEFINER functions pin search_path, are owned by ghm_schema_owner, and check active Business plus active owner/administrator membership.
- Repository uses withTenantTransaction, checks owner/administrator membership, and supplies context.userId rather than caller-provided account identity.
- No confirmed privilege-escalation blocker found in inspected SQL/grants.

### HTTP wiring and privacy
- Inspected src/http/app.ts, src/http/business-registration-identity-router.ts, src/auth/authorization.ts, src/auth/http.ts, registration identity repository, public Business contract/repository, and relevant route tests.
- Registration-identity handlers derive account identity from authenticated req.authContext, not request body/query.
- Update parser is allow-listed and rejects caller-supplied businessId. Business ID comes from URL, is parsed as positive safe integer, then checked through tenant repository.
- Repository and SQL independently enforce active owner/administrator membership.
- Public Business contract and SQL projection omit registration_number and legal_name; private fields are returned only by the dedicated authenticated registration-identity endpoint.
- app.ts wires registration identity routes, but no QuoteFlow migration provisioning service/HTTP route was found in the inspected app composition.
- No confirmed account-ID substitution, public registration-data leak, or HTTP exposure of migration-only provisioning found.

## Conclusion and limitations

No confirmed blocker found in the inspected database and HTTP paths. This is a limited source-level review at the exact head above, not a full security approval or complete audit of every route/configuration, and does not establish deployed runtime behavior.

Remaining trust boundaries:
1. Authentication middleware/session issuance and reset/recovery lifecycle: prove AuthContext.userId originates only from a validated GHM session/token and remains correctly bound through reset, recovery, and lazy session issuance.
2. Role/resource registry and resource-operation authorization: verify registration-identity operation mapping and upstream middleware cannot be bypassed or broadened.
3. Continue broader route/service review only after those focused checks.

## Resume point

Next: read-only review of identity/authentication lifecycle, focusing on reset, recovery, and lazy session issuance. Trace token/session validation through middleware to req.authContext, then check account binding, invalidation, and re-enrollment behavior.

Related notes:
- docs/architecture/GHM_AUTHENTICATION_SESSION_CONTRACT.md
- docs/architecture/CONNECT_GHM_MIGRATION_HANDOVER_2026-10-13.md
- docs/operations/handover-production-db-and-render-2026-10-24.md

No production or shared Render operations were performed. Keep secrets and full connection URLs out of handover notes.


## Authentication / session lifecycle review (continued 2026-11-03)

Reviewed at the same immutable candidate head `8739b0bf24ef2619f63a14d06a1db3f64138330c`:
- `src/auth/resource-auth.ts`, `src/auth/ghm-bearer.ts`, `src/auth/ghm-auth-context.ts`, `src/auth/foundation/access-jwt.ts`
- `src/auth/ghm-auth-service.ts`, `src/auth/foundation/persistence.ts`
- `src/auth/password-recovery.ts`, `src/auth/password-reset.ts`
- `src/migrations/quoteflow-migration-reset-recovery.ts`, `src/migrations/quoteflow-migration-reset-completion.ts`
- `src/http/auth-router.ts`, relevant auth/resource/reset tests
- `src/http/app.ts`
- `database/migrations/20260921130000_create_auth_runtime_functions.sql`
- `database/migrations/20261004181000_add_quoteflow_migration_reset_enrollment_lookup.sql`
- `database/migrations/20261004190000_add_quoteflow_migration_reset_completion.sql`

### Confirmed positive boundaries
- Resource auth accepts only a Bearer token, verifies ES256 with pinned algorithm, issuer, audience, key ID and expiry, then loads the account's current active status/role/admin flag from `ghm.account_identity`. JWT role/userId claims are not authorization authority. `AuthContext.userId` is constructed from the verified JWT subject's account ID and current DB state; missing/disabled accounts fail closed with 401.
- The access JWT subject is constrained to a positive decimal safe-integer account ID. Access token TTL is 15 minutes.
- Password recovery issues opaque random tokens, persists only a peppered HMAC hash, and sends the raw token only through the delivery port. Unknown/inactive accounts do not receive a recovery message; the HTTP response does not include the token.
- Standard password reset redeems the opaque recovery credential and changes password/revokes sessions inside a transaction. A failed password update rolls back the token redemption and revocation with the transaction.
- QuoteFlow reset lookup binds the approved normalized email to an active enrollment and matching Supabase external identity. Completion is a single SECURITY DEFINER transaction: locks eligible enrollment/account/recovery rows, rechecks source identity and active account, consumes the unexpired token, sets password using the approved enrollment email, revokes all existing sessions, and marks enrollment completed.
- QuoteFlow reset completion endpoint does not trust a caller-supplied account ID or email. It completes by opaque token + password, then logs in using the approved email returned by the DB transaction. Session issuance occurs after completion commits; a login/session issuance failure returns sanitized 500 (reset remains completed, so user may need normal login).
- App composition creates one `PostgresAuthPersistence` for reset and QuoteFlow recovery/completion services. The lazily initialized `GhmAuthService` separately creates its own default persistence instance, but both use the same configured database/persistence implementation; do not describe these as the same object instance.
- Existing tests cover token claim tampering/role-claim rejection, invalid issuer/audience/algorithm/kid/expiry, disabled account rejection, recovery anti-enumeration/token non-disclosure, migration reset anti-enumeration, and completion-before-login ordering.

### Residual design limitation to track (not confirmed blocker)
- The ES256 access JWT currently carries `sub`, `iss`, `aud`, `iat`, `exp`, and `kid`, but no session identifier. Resource bearer authentication verifies the token and active account state only; it does not call `auth_validate_session` or check a session ID. Logout, refresh replay, password recovery, and QuoteFlow reset revoke persisted session/refresh families, but already-issued access JWTs can remain accepted until their 15-minute expiry (unless the account is disabled). This may be an intentional short-lived access-token trade-off, but it is not immediate access-token revocation. Confirm this behavior is an accepted contract; if immediate revocation is required, design a session-bound JWT/session-state check as a separately scoped change.
- Do not assume session inactivity/absolute-expiry checks are applied to each API request: they are enforced in refresh rotation and `auth_validate_session`, not in the current resource bearer middleware.

### Review status / next step
No confirmed account-identity substitution or reset-token bypass was found in the inspected source paths. This remains source review, not runtime/deployment qualification. Next inspect role/resource authorization registry and the full auth route wiring/configuration (including origin/cookie policy and delivery configuration), then continue route-level coverage. Keep the review read-only. No code, database, shared Render, or production changes were made in this continuation.
