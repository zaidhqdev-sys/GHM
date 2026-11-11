# Handover — full migration security inventory (2026-11-11)

## Scope and exact source

- Repository: `zaidhqdev-sys/GHM`
- Pull request: #272 — `integration/capability-gateway-qualification-20261110`
- Audited immutable PR head: `ee753ba8c6cb4a48c3ff1d46c1fe9fde6eaadbf2`
- Inventory: recursively enumerated the repository tree (923 entries), identified 115 files under `database/migrations/`, and performed a first-pass source scan across all 115 for function definitions, `SECURITY DEFINER`, runtime EXECUTE grants and direct runtime DML grants.
- This is a first-pass inventory, not a complete effective-privilege proof. Historical grants/revokes, default privileges, role memberships, dynamic SQL, all application call sites and the production catalog still need reconciliation.

## Confirmed implemented and qualified scope

The existing PR implements signed Actor Gateway operations for self identity, Business registration identity, Business profile, supplier classification, capability catalogue governance and the four Business Capability mutation/evidence operations. Its manual cutovers are disposable-PostgreSQL qualified but remain unapplied in production.

The current PR description records exact-head CI run #3013 on the earlier code/test head and #3013 on the latest code/test batch; current PR head is now `ee753ba8c6cb4a48c3ff1d46c1fe9fde6eaadbf2`. Do not assume a previous workflow run is exact-head qualification for this newer commit. Recheck workflows before any merge decision.

## New actor-binding candidates found outside the PR's existing gateway scope

These database functions remain defined as `SECURITY DEFINER` and historically grant EXECUTE to `ghm_runtime`. They accept account IDs as ordinary parameters and rely on membership checks rather than independently proving that the supplied account ID is the authenticated actor:

- `ghm.replace_business_hours(bigint,bigint,jsonb)` — `database/migrations/20260916223000_create_business_hours.sql`; checks active owner/administrator membership for the supplied account and Business.
- `ghm.create_saved_business(bigint,bigint)` and `ghm.delete_saved_business(bigint,bigint)` — `database/migrations/20260916230000_create_saved_business.sql`; creation accepts arbitrary account ID after checking Business eligibility; deletion scopes the row to the supplied account ID. The Resource API repository currently passes `context.userId` from its verified AuthContext, but direct runtime EXECUTE is not cryptographically actor-bound.
- `ghm.create_campaign(bigint,bigint,text)` and `ghm.update_campaign(bigint,bigint,text,text)` — `database/migrations/20260918180000_create_campaign.sql`; enforce owner/administrator membership for the supplied account ID, while the Resource API repository supplies `context.userId`.
- `ghm.calculate_business_trust_score(bigint,bigint)` — `database/migrations/20260916250000_extend_business_profile_trust_inputs.sql`; enforces owner/administrator membership for the supplied account ID; Resource API supplies `context.userId`.

These are not established production exploits. The current HTTP/resource paths authenticate and pass the verified context actor. The gap is that the database SECURITY DEFINER boundary trusts the caller-supplied actor parameter when the shared runtime credential executes the function directly. These operations are candidates for a subsequent signed gateway batch, or for an explicit documented decision that their current runtime trust model is acceptable.

## Direct table DML candidate

`ghm.account_onboarding_progress` grants `SELECT, INSERT, UPDATE` directly to `ghm_runtime` in `20261110100000_create_account_onboarding_progress.sql`. Its current router and repository derive `account_id` from verified `AuthContext.userId`; the table ACL itself does not enforce per-account ownership. Decide whether to move this to actor-bound database functions/gateway wrappers or retain the application-only tenant boundary with an explicit threat-model rationale and negative tests.

## Storage persistence review

`ghm.storage_mark_deletion_pending(bigint)` is SECURITY DEFINER and executable by `ghm_runtime`. Its body changes a pending/available object to `deletion_pending` based only on object ID. The current `StorageService.deleteObject` first loads the object through actor-scoped `storage_get_object(id, context.userId)` and calls `authorization.assertCanDelete` before invoking the metadata repository mutation. This is currently an internal persistence method, not a public HTTP route accepting arbitrary object IDs directly. Do not classify it as a confirmed gap until every caller and the threat model for direct runtime SQL invocation are reconciled. Consider making the persistence mutation callable only through a database assertion bound to the authorized caller or narrowing its execution principal.

## Authentication and service-internal SECURITY DEFINER inventory

The migration scan also found runtime-executable auth lifecycle functions with account/session IDs, including `auth_set_password`, `auth_create_session_with_refresh`, `auth_validate_session`, `auth_revoke_session`, `auth_revoke_all_sessions_for_account`, `auth_change_password`, `auth_disable_account`, `auth_issue_recovery`, and recovery redemption. Current TypeScript persistence methods are server-side service methods; `GhmAuthService` exposes register/login/refresh/logout, not account disable. Trace each public call path and its provenance before deciding whether these belong behind the Actor Gateway. Do not blindly revoke auth functions: registration, login, refresh, password recovery and password reset require carefully preserved service access.

Other function families seen in the first-pass scan include commercial payment settlement, QuoteFlow migration provisioning/reset enrollment, business registration, directory review, business capability verification/evidence, founder reviewer helpers, Connect integration lifecycle, and storage metadata. Several have later migrations or manual cutovers that supersede their historical grants. Effective privileges must be computed from the complete ordered migration/cutover history rather than treating every historical GRANT as still active.

## Current call-path evidence

- Saved Business repository passes `context.userId` to create/delete functions inside `withAuthorizedTransaction`.
- Business Hours repository uses `withTenantTransaction`, checks owner/administrator tenant role, then passes `context.userId`.
- Campaign repository passes `context.userId` inside `withAuthorizedTransaction`.
- Trust Score repository passes `context.userId` inside `withAuthorizedTransaction`.
- Onboarding repository uses `withAuthorizedTransaction` and derives account ID exclusively from `context.userId`.
- Storage deletion service retrieves metadata for the caller and checks `assertCanDelete` before marking deletion pending.

These application controls are useful and must be preserved, but do not by themselves make the database function independently actor-bound.

## Next work — do not repeat completed batches

1. Reconcile the effective final ACLs for each candidate function, including later migrations, manual cutovers, PUBLIC grants, role inheritance and default privileges.
2. Trace all call sites and tests for the candidate operations above, then select a small coherent signed Actor Gateway batch. Preserve existing request/response contracts.
3. Add negative disposable-PostgreSQL tests proving the runtime principal cannot invoke legacy actor-ID RPCs after cutover, and that the signed gateway can still complete each operation with verified actor provenance.
4. Decide the onboarding direct-DML boundary and storage cleanup mutation boundary with explicit evidence.
5. Update this handover and `docs/GHM_CURRENT_STATE.md` after each completed batch; do not claim the full repository audit is complete until every migration, effective ACL and app call path is reconciled.

## Safety / release state

- No production migration, role/grant change, secret provisioning, deployment or data mutation was performed during this audit.
- No manual cutover has been applied to production.
- No paid infrastructure was introduced.
- Do not merge PR #272 merely because earlier workflow runs passed; verify exact current-head CI and reconcile the documentation/source state first.
- Production cutover remains blocked on Render support's written role-model resolution and a fresh independently verified production backup. The last known Render backup is 4 November 2026; do not assume a newer backup exists.
- PayFast remains paused until its sandbox is available. Approved legal-document work remains parked.
