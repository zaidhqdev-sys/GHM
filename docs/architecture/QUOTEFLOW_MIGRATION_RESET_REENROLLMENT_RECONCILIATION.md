# QuoteFlow Migration Reset / Re-enrollment Documentation Reconciliation

**Status: DOCUMENTATION RECONCILED — DB QUALIFICATION PASSED**

## Scope

This reconciliation records the implementation, qualification artifact, test evidence, and remaining gates for the single-user QuoteFlow migration reset/re-enrollment slice.

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
- `docs/architecture/QUOTEFLOW_MIGRATION_RESET_REENROLLMENT_CEREMONY.md` — canonical ceremony architecture and gates.

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

### Pending execution

- [x] Run the DB-backed QuoteFlow reset/re-enrollment qualification against the governed construction database.
- [x] Record the DB qualification result and run ID `c5244bf7-0542-4e60-86fc-9f8ce9f52f39` in this reconciliation.
- [x] Reconcile the ceremony checkboxes with the actual DB qualification result.
- [ ] Merge only after the final PR diff and remaining founder gates are explicitly reviewed.

## Important boundary

The current qualification artifact intentionally proves the reset operation and its database invariants. It does not yet prove the complete user-facing migration ceremony.

In particular, the credentialless migrated account does not currently have a canonical migration-email/reset-enrollment lookup boundary. That boundary must not be silently invented as part of this slice.

Therefore:

- `RESET_REQUIRED` remains a migration state, not an authenticated session;
- no production recovery delivery is authorized;
- no production user migration is authorized;
- no Supabase password hash or token is imported;
- no QuoteFlow runtime authentication cutover is authorized.

## Merge gate

PR merge requires:

1. full-suite evidence remains green;
2. DB-backed reset qualification passes;
3. this reconciliation is updated to the resulting evidence state;
4. the architecture ceremony document matches that evidence;
5. no closed founder gate is reopened or implied.

## Decision

The implementation is **DB-qualified** and ready for final PR review. The qualification passed after recovery expiry was derived from the database transaction clock; the database ordering constraint remains unchanged.

Qualification evidence: `c5244bf7-0542-4e60-86fc-9f8ce9f52f39` — PASS. Checks covered synthetic credentialless migration account, Argon2id password establishment, existing session revocation, legacy external identity preservation, recovery single-use, transaction rollback, expired recovery rejection, and runtime secret-table DML sealing.

The remaining decision is final PR review/merge only. Production delivery, production migration, and QuoteFlow runtime cutover remain founder-gated.
