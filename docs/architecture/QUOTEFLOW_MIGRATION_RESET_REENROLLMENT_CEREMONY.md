# QuoteFlow Existing-User Password Reset / Re-enrollment Ceremony

**Status: CONSTRUCTION QUALIFIED — RESET, ENROLLMENT, AND SESSION-ISSUANCE CEREMONY IMPLEMENTED; NON-PRODUCTION QUALIFICATION PENDING**

## Decision

Existing QuoteFlow users whose legacy Supabase password material cannot be safely imported into the GHM Argon2id credential contract must enter GHM through a verified password reset/re-enrollment ceremony.

The ceremony is a GHM-owned credential operation. It does not import Supabase password hashes, access tokens, refresh tokens, or Supabase sessions.

## Eligible account state

The ceremony applies only after migration evidence has resolved a legacy user to exactly one canonical GHM account.

The account must be:

- provisioned by the migration-owned account provisioning capability;
- linked to the exact legacy Supabase subject as opaque provenance;
- active;
- classified as `RESET_REQUIRED` because a verified legacy credential cannot be migrated.

No email-only account matching is permitted.

## Ceremony

1. Migration provisioning establishes the canonical GHM account without a password credential.
2. The migration record marks the account `RESET_REQUIRED`.
3. The user initiates the dedicated QuoteFlow migration reset-enrollment request boundary.
4. GHM normalizes the supplied migration-approved enrollment email and resolves only an eligible `RESET_REQUIRED` migration enrollment through the dedicated SECURITY DEFINER lookup capability.
5. The migration enrollment boundary proves the exact Supabase subject/account mapping, active account, and `reset_required` state; it does not perform email-only identity matching.
6. The existing protected recovery-token issuance/delivery boundary is then used only for the eligible migration account.
7. Recovery material is generated as an opaque one-time credential and stored only in protected form.
8. The raw recovery credential is handed only to the approved delivery boundary.
9. The HTTP boundary returns no recovery credential and uses anti-enumeration behavior.
10. The user presents the recovery credential through the dedicated reset operation.
11. GHM atomically redeems the recovery credential and establishes a new Argon2id password credential.
12. Existing sessions are revoked according to the password-recovery security policy.
13. The recovery credential becomes unusable after redemption or expiry.
14. Only after successful re-enrollment may canonical GHM Auth establish a new authenticated session.

## Security invariants

The ceremony must preserve these invariants:

- no plaintext password is persisted;
- no Supabase password hash is imported without an independent format/verification qualification;
- no Supabase access or refresh token is accepted as GHM authentication;
- recovery credentials are opaque and protected at rest;
- recovery credentials are single-use and expire;
- recovery credentials never appear in HTTP responses or logs;
- recovery requests remain rate-limited and anti-enumerating;
- reset cannot silently move an external identity to another GHM account;
- reset cannot create a Business or membership;
- reset cannot alter legacy provenance;
- session issuance occurs only after credential establishment succeeds.

## Existing GHM capability boundary

The repository already contains the foundational recovery delivery boundary and protected recovery-token persistence:

- `issueRecovery` creates a protected recovery credential;
- `redeemRecovery` consumes the protected credential;
- `setPassword` establishes an Argon2id credential;
- `revokeAllSessionsForAccount` provides session invalidation;
- the HTTP recovery request returns only `202 { "ok": true }`.

Those capabilities are not, by themselves, proof that the complete QuoteFlow migration re-enrollment ceremony is qualified.

## Migration-specific proof still required

Before this ceremony can be marked qualified, non-production qualification must prove:

1. a provisioned `RESET_REQUIRED` account can traverse the migration enrollment request through recovery issuance and delivery;
2. unknown/ineligible accounts do not disclose account existence;
3. a valid recovery credential can be redeemed exactly once;
4. expired recovery credentials are rejected;
5. a redeemed recovery credential cannot be reused;
6. the new password is stored only through the canonical Argon2id password path;
7. successful reset revokes the account's existing sessions;
8. a new GHM session can be established only after successful password establishment;
9. failed redemption/reset leaves the account credential state unchanged;
10. the legacy Supabase external-identity mapping remains unchanged;
11. no Business or membership is created or modified;
12. the complete operation uses synthetic non-production data only.

## Credential disposition

Until the above qualification exists:

- `RESET_REQUIRED` is a migration outcome, not an authenticated session;
- no automatic session is issued;
- no production recovery message is sent;
- no production user is migrated through this ceremony;
- no legacy password hash is imported.

## Delivery boundary

A delivery provider remains a separate capability decision.

This architecture does not authorize a paid email provider, SMS provider, or other external delivery integration. The existing injected delivery port is the canonical boundary.

Qualification may use a deterministic in-memory/test delivery sink.

## Cutover relationship

Password reset/re-enrollment qualification is required before a production QuoteFlow account migration can claim that migrated users can authenticate through GHM.

It does not authorize:

- QuoteFlow runtime authentication swap;
- production source export;
- production account migration;
- Supabase mutation;
- environment/routing changes;
- payment changes;
- Supabase package removal.

## Founder gates

The following remain closed:

- production source export;
- production migration;
- production recovery delivery;
- credential-provider integration;
- QuoteFlow GHM session-client rollout;
- legacy Supabase runtime removal.

## Qualification state

- [x] credentialless migration provisioning qualified
- [x] protected recovery-token issuance boundary exists
- [x] recovery-token redemption primitive exists
- [x] Argon2id password-setting primitive exists
- [x] recovery delivery anti-disclosure boundary exists
- [ ] complete migration-specific RESET_REQUIRED ceremony qualification
- [x] recovery credential single-use/expiry qualification for the synthetic migrated-account reset operation
- [x] session revocation qualification for the synthetic migrated-account reset operation
- [ ] post-reset GHM session qualification
- [x] atomic reset transaction boundary qualified at DB primitive level
- [ ] production delivery approval
- [ ] production migration approval

## Migration enrollment qualification slice

The implementation branch carries a non-production DB qualification script for the reset operation:

`scripts/qualify-quoteflow-migration-reset-reenrollment-db.mjs`

The separate enrollment-boundary qualification is:

`scripts/qualify-quoteflow-migration-reset-enrollment-db.mjs`

It uses the existing runtime/migrator separation and synthetic Supabase external-identity subjects. The qualification proves:

- the runtime role can execute the three required Auth SECURITY DEFINER functions without direct access to password/recovery secret tables;
- a synthetic credentialless migrated account can establish an Argon2id credential through the new atomic reset service;
- an existing session is revoked by successful recovery redemption;
- the exact legacy external-identity mapping is unchanged;
- the recovery credential cannot be reused;
- an expired recovery credential is rejected without creating a password;
- the underlying recovery redemption/password write rolls back together when the surrounding transaction fails.

The reset qualification proves the atomic reset operation and its database invariants. The enrollment qualification now separately proves the canonical migration-approved email lookup boundary and exact migration provenance binding. The complete user-facing ceremony remains pending because the enrollment lookup is not yet integrated into a migration-specific HTTP recovery request/delivery path and post-reset session qualification.

This distinction is intentional: the new lookup capability is qualified construction, not authorization for production delivery, production migration, or runtime cutover.

## Documentation reconciliation

The implementation, test, qualification, and remaining-gate state is reconciled in:

`docs/architecture/QUOTEFLOW_MIGRATION_RESET_REENROLLMENT_RECONCILIATION.md`

The reconciliation is part of the merge gate and must be updated from actual DB qualification evidence before merge.

This is a qualification artifact only. It does not authorize production migration, production recovery delivery, or QuoteFlow runtime cutover.


## Current construction

The complete migration-specific HTTP ceremony is now wired without changing generic recovery:

- `POST /api/v1/auth/quoteflow-migration-reset/request` uses the dedicated enrollment lookup and approved migration email delivery boundary and always returns the anti-enumeration success shape for unknown/ineligible enrollment.
- `POST /api/v1/auth/quoteflow-migration-reset/complete` accepts only the opaque recovery credential and new password; the database atomically validates the eligible migration enrollment, consumes the recovery credential, establishes the Argon2id password using the approved migration email, revokes existing sessions, and transitions the enrollment to `completed`.
- Only after that transaction returns successfully does HTTP invoke canonical GHM Auth login, which creates the fresh GHM session/token pair.

No production delivery, production migration, Supabase runtime cutover, payment change, or QuoteFlow runtime-auth swap is included.
