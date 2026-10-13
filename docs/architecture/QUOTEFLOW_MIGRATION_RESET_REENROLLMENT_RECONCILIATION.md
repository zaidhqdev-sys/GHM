# QuoteFlow Migration Reset / Re-enrollment Documentation Reconciliation

**Status: DOCUMENTATION RECONCILED — RESET, ENROLLMENT, AND SESSION-ISSUANCE CONSTRUCTION QUALIFIED; NON-PRODUCTION CEREMONY QUALIFICATION PENDING FOR BOTH FOUNDER-OWNED ACCOUNTS**

## Scope

This reconciliation records the implementation, qualification artifact, test evidence, and remaining gates for the QuoteFlow founder-account migration reset/re-enrollment slice. The two known QuoteFlow accounts are both founder-owned, and each source identity must be handled independently.

The purpose is to keep the architecture record, implementation boundary, qualification script, and merge decision on the same state. It does not authorize production migration or QuoteFlow cutover.

## Canonical flow

The current construction flow is:

`credentialless migrated account → RESET_REQUIRED → recovery credential → atomic password reset → session revocation → fresh GHM authentication`

The reset operation is owned by GHM. Supabase remains migration provenance/source evidence only.

## Repository evidence

The construction branch contains:

- `src/auth/password-reset.ts` — service boundary for the atomic reset operation;
- `src/auth/foundation/persistence.ts` — one transaction covering recovery redemption, Argon2id password establishment, and session revocation;
- `src/http/auth-router.ts` — dedicated reset HTTP boundary;
- `src/http/app.ts` — concrete reset-service wiring;
- `scripts/qualify-quoteflow-migration-reset-reenrollment-db.mjs` — non-production DB qualification;
- `docs/architecture/QUOTEFLOW_MIGRATION_RESET_REENROLLMENT_CEREMONY.md` — canonical ceremony architecture and gates;
- `src/migrations/quoteflow-migration-reset-enrollment.ts` — migration-approved enrollment lookup service;
- `scripts/qualify-quoteflow-migration-reset-enrollment-db.mjs` — non-production enrollment qualification;
- `docs/architecture/QUOTEFLOW_MIGRATION_RESET_ENROLLMENT_LOOKUP_BOUNDARY.md` — canonical enrollment boundary decision and qualification.

## Evidence state

### Completed

- [x] Atomic reset implementation exists.
- [x] Focused reset tests pass: 2/2.
- [x] Full repository test suite passes: 518/518.
- [x] Local Auth token-pepper bootstrap blocker resolved for the test session.
- [x] Runtime/migrator separation is represented in the DB qualification artifact.
- [x] Synthetic-account, recovery single-use/expiry, session revocation, provenance preservation, and rollback checks are represented in the DB qualification artifact.
- [x] No production delivery, migration, Supabase runtime cutover, or payment change is included.
- [x] First DB qualification execution reached the real recovery-credential insert and exposed a timestamp-ordering failure: the database recorded `expires_at` approximately 75ms before its independently generated `created_at`.
- [x] Recovery issuance was corrected to derive the expiry timestamp from the database transaction clock before invoking the canonical recovery function; the database check constraint remains unchanged.
- [x] Dedicated migration enrollment state and SECURITY DEFINER registration/lookup capabilities are implemented.
- [x] Enrollment qualification passed: synthetic credentialless migration account, exact retry idempotency, normalized email lookup, unknown lookup non-disclosure, provider boundary, runtime DML sealing, and generic recovery credential-bearing scope.
- [x] Focused enrollment service test passed.

### Remaining qualification

- [x] Run the DB-backed QuoteFlow reset/re-enrollment qualification against the governed construction database.
- [x] Record the DB qualification result and run ID `c5244bf7-0542-4e60-86fc-9f8ce9f52f39` in this reconciliation.
- [x] Reconcile the enrollment boundary architecture with the actual DB qualification result.
- [ ] Complete migration-specific HTTP recovery request/delivery qualification.
- [ ] Complete post-reset GHM session qualification.
The checklist above is retained as qualification history. Merge/CI requirements apply to the original construction PR; they are not evidence that the complete ceremony is qualified. The current gate is the integrated non-production DB + HTTP ceremony evidence described above.

## Important boundary

The qualification artifacts now separately prove the atomic reset operation and the canonical migration-email/reset-enrollment lookup boundary. They do not yet prove the complete user-facing migration ceremony.

Therefore:

- `RESET_REQUIRED` remains a migration state, not an authenticated session;
- no production recovery delivery is authorized;
- no production user migration is authorized;
- no Supabase password hash or token is imported;
- no QuoteFlow runtime authentication cutover is authorized.

## Merge gate

PR merge requires:

1. full-suite evidence remains green;
2. DB-backed reset and enrollment qualification passes;
3. this reconciliation is updated to the resulting evidence state;
4. the architecture ceremony and enrollment-boundary documents match that evidence;
5. no closed founder gate is reopened or implied.

## Decision

The reset operation and enrollment lookup boundary have separate DB-backed construction qualification. The migration-specific HTTP request/completion path has since been constructed, so HTTP integration is no longer the implementation gap. The complete non-production DB + HTTP ceremony qualification remains open for anti-enumeration, single-use recovery, rollback, session revocation, and post-reset-session invariants for each of the two founder-owned accounts.

Qualification evidence: `c5244bf7-0542-4e60-86fc-9f8ce9f52f39` — PASS. Checks covered synthetic credentialless migration account, Argon2id password establishment, existing session revocation, legacy external identity preservation, recovery single-use, transaction rollback, expired recovery rejection, and runtime secret-table DML sealing.

That statement described the earlier reset/enrollment construction slice and is superseded by the 2026-10-04 ceremony reconciliation below. The migration-specific request/completion path has since been constructed, but the complete non-production DB + HTTP ceremony qualification remains open for anti-enumeration, single-use recovery, rollback, session revocation, and post-reset-session invariants. Production delivery, production migration, and QuoteFlow runtime cutover remain founder-gated.


## 2026-10-04 ceremony construction reconciliation

The migration-specific ceremony now has a dedicated request and completion path. Request resolves only the qualified migration enrollment and passes its approved email to the existing protected delivery port. Completion is a dedicated SECURITY DEFINER transaction that consumes the recovery credential, verifies the active canonical account and unchanged Supabase mapping, establishes the Argon2id credential under the approved enrollment email, revokes existing sessions, and marks the enrollment completed. HTTP then performs canonical GHM login only after successful completion.

Construction remains non-production. The remaining gate is the non-production DB + HTTP qualification of the complete ceremony and its anti-enumeration, single-use, rollback, session-revocation, and post-reset-session invariants.
