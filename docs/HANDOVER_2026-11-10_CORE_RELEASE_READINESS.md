# GHM core release-readiness handover — 2026-11-10

**Status:** ACTIVE WORKING HANDOVER — security foundation and non-deferred release work  
**Repository:** `zaidhqdev-sys/GHM`  
**Documentation branch:** `docs/ghm-core-release-handover-20261110`  
**Base:** `main` at `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`  
**Runtime:** `GHM-Internal-Runtime`  
**Runtime service:** `srv-damupsek1f9s73eq8kkg`  
**Runtime deployment:** `dep-dbpmv8jrjlhs73abkli0`  
**Deployment commit:** `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`

## 1. Founder direction recorded — 2026-11-10

The following scope decisions are explicit and govern the current work sequence:

1. **PayFast is paused completely** until PayFast restores its sandbox and the team has working sandbox access to perform end-to-end testing. The owner contacted PayFast on 2026-11-10 and was told their sandbox had been down for two days and that they were working on it. Do not spend current work time on PayFast implementation, integration testing, activation, callbacks, credentials, provider configuration, or rollout. Preserve existing PayFast code and records; do not delete or disable existing code. Re-enter the work queue only after sandbox access is confirmed.
2. **Approved legal-document / legal-acceptance work is deferred.** Do not draft, approve, implement, merge, deploy, or activate legal-document acceptance flows in this workstream. Revisit once the systems are running smoothly and the owner explicitly resumes that work. PR #201 remains parked/draft.
3. Continue with the rest of GHM core, platform security, database compatibility, Business identity/profile, supplier classification, capability governance, engagement/analytics, runtime quality, operational readiness, and handover/documentation work, subject to the technical gates below.

These are scope controls, not statements that PayFast or legal work is technically complete.

## 2. Verified baseline

### Source and local checkouts

- `main` is at `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`.
- The `C:\GHM-main` worktree is on `main`, aligned with `origin/main`, and has one preserved untracked migration backup:
  `database/migrations/20261026120000_scope_storage_metadata_lookup.sql.before-ledger-recovery.bak`.
- The `C:\GHM` worktree is at the same SHA but detached. Its remaining untracked file is `.ghm-quoteflow-readonly-preflight.mjs`.
- The obsolete `.env.backup-before-sandbox-cleanup` file was deleted from `C:\GHM` after confirming the active `.env` exists. The active `.env` was not read, printed, copied, or changed.
- Preserve both remaining untracked files unless their owners explicitly approve cleanup.

### Runtime

- Render service `GHM-Internal-Runtime` is live on the exact main merge commit above.
- `GET https://ghm-internal-runtime.onrender.com/healthz` returned `HTTP/1.1 200 OK` and `{"status":"ok"}` on 2026-11-10 at 19:29 UTC.
- Render auto-deploy is disabled (`autoDeploy=no`, trigger `off`). Merges do not imply deployment; deploy an explicitly approved merge SHA manually and verify the resulting deployment SHA and health endpoint.
- This is a health/runtime check only. It is not evidence that pending production database migrations, grants, secrets, payment flows, or product cutovers are complete.

### Production database boundary

The 2026-11-08 handover's read-only role-graph finding remains relevant: the observed `ghm_app_user` → `ghm_db_user` SET-capable membership and `ghm_db_user`'s elevated role memberships require owner/security review and a least-privilege remediation plan. No role changes, grants/revokes, production migration, or manual SQL application are authorized by this handover.

## 3. Highest-priority platform blocker: shared actor-authentication boundary

### Confirmed source-level finding

The current GHM bearer flow verifies ES256 access tokens in the Node process, resolves `sub` to an active account, and creates an application context. `withAuthorizedTransaction` then uses the ordinary shared pooled database connection. PostgreSQL sees the shared runtime principal, not an independently authenticated end-user actor.

Several `SECURITY DEFINER` functions accept caller-supplied account/actor IDs and grant execution to `ghm_runtime`. A caller holding the runtime credential can directly invoke those functions and supply another active account ID. Route middleware and application `AuthContext` do not protect direct SQL execution.

The current auth service also loads the ES256 private signing key in the ordinary application process and exposes an account-ID signing operation. Therefore, simply adding a database gateway that verifies current bearer JWTs is not sufficient if the ordinary API process can mint a valid JWT for an arbitrary `sub`. The auth database function set also includes session/refresh/recovery/identity operations granted to the ordinary runtime role; these privileges must be inventoried and isolated as part of the trust-chain design, not overlooked.

This is a source-level privilege-boundary finding. It is not evidence that a production account has been impersonated or that production secrets were inspected.

### Required trust-chain sequence

Treat this as one shared platform prerequisite, not separate per-feature workarounds:

1. Inventory all actor-sensitive `SECURITY DEFINER` functions, direct table grants, role inheritance, callers, and auth-session operations on current `main` and affected PR heads.
2. Decide and document the GHM-owned isolated token-issuer design. Preserve the existing approved GHM authentication/session contract: ES256, `iss=ghm-auth`, `aud=ghm-api`, `kid`, 15-minute access-token lifetime, opaque rotating refresh credentials, and the existing natural-expiry behavior for already-issued access tokens after logout/revocation. Do not silently add `sid` or per-request online session validation; that is a separate policy decision.
3. Ensure the ordinary resource API cannot mint arbitrary-subject tokens, access issuer-only credentials, or call a generic remote signing operation with arbitrary claims. The isolated issuer must derive identity from its own verified credential/session flow.
4. Design the separately authenticated database actor boundary/gateway. The ordinary `ghm_runtime` role must not be able to establish or forge actor context. A caller-set GUC, temp table, normal function argument, application context, or API-supplied account ID is not acceptable proof.
5. Protected database operations derive the actor from a database-verifiable, transaction-bound context, then check current account status and current tenant membership/role at operation time.
6. Add reusable adversarial disposable-PostgreSQL tests using the actual runtime login: two active owners/admins, separate businesses, forged cross-actor reads and writes, missing/expired/wrong-purpose/replayed proof, revoked/disabled actors, rollback/exception/cancellation, and pooled connection reuse. Prove both denial and legitimate operation success.
7. Only after the issuer/gateway design and qualification are accepted should affected RPCs be migrated and their direct `ghm_runtime` grants changed. Any production role/grant/credential action remains separately authorized.

The draft proposal is PR [#251](https://github.com/zaidhqdev-sys/GHM/pull/251), with implementation-level findings recorded in the review history of PR [#236](https://github.com/zaidhqdev-sys/GHM/pull/236). The proposal is architecture material, not an approved implementation or production authorization.

### Affected PRs

- [#236](https://github.com/zaidhqdev-sys/GHM/pull/236): Business identity/directory/platform workflows; registration-identity read/write RPCs have the direct actor-ID spoofing issue.
- [#237](https://github.com/zaidhqdev-sys/GHM/pull/237): Business profile SQL compatibility; keep draft until compatibility and shared actor-boundary requirements are qualified.
- [#243](https://github.com/zaidhqdev-sys/GHM/pull/243): supplier classification; caller-supplied actor ID in a privileged RPC is not independently bound.
- [#244](https://github.com/zaidhqdev-sys/GHM/pull/244): engagement/analytics; stacked on #243 and requires its security/compatibility gates plus entitlement and product-semantic decisions.
- [#250](https://github.com/zaidhqdev-sys/GHM/pull/250): capability catalogue governance; multiple privileged functions accept caller-supplied admin actor IDs.
- [#251](https://github.com/zaidhqdev-sys/GHM/pull/251): shared actor-auth proposal; remains draft until architecture review. Its latest green CI is documentation validation, not proof that the design is implemented or qualified.

## 4. Other non-deferred engineering work

### PR #236 — migration and active database compatibility

Owner clarification already recorded in the PR: Business IDs 248 and 774 are intentional test accounts, were deliberately made inactive/hidden, and their rows/history must be preserved. Do not reactivate them. This resolves the identity-disposition question only; it does not waive review of exact migration predicates, idempotency, recovery, or the separate actor-authentication gate.

Before #236 can be treated as merge/deploy ready:
- review every changed migration against the active GHM schema/ledger and the exact current mainline history;
- inspect the exact predicates and rollback/recovery behavior, especially `20261109210000_deactivate_unrecognized_public_directory_records.sql`;
- use read-only active-database evidence only where necessary and through the approved access path; never use the retired sandbox or disposable CI DB as evidence of active DB state;
- close registration-identity direct-RPC actor spoofing with the shared boundary;
- review founder-review authority, storage cleanup, commercial/read-model changes, and migration ordering;
- keep production migration, data mutation, grants, deployment and cutover separately gated.

### PR #237 — Business profile compatibility

Continue the production-like compatibility analysis and exact schema/function/grant review. Do not merge the draft merely because historical CI passed. Apply the shared actor-boundary design consistently.

### PRs #243 and #250 — supplier and capability governance

Continue implementation and qualification on isolated branches after the shared design is decided. Tests must exercise direct RPC calls under the real `ghm_runtime` login with a forged *different active owner/admin* identity; route-level tests alone are insufficient. Also qualify database-enforced catalogue invariants for #250.

### PR #244 — analytics/engagement

Keep stacked behind #243. After #243's security and compatibility gates close, rebase onto the approved integration head and resolve the entitlement catalogue and semantics (Enquiries as leads; accepted Project Quotes as projects won) before enablement. Access must fail closed while the entitlement is absent.

### PR #233 — PayFast payment-date timezone

Park entirely with the other PayFast work until sandbox access is restored. No testing, provider activation, credentials, callback work, or merge/deploy activity for PayFast in the meantime.

### PR #201 — QuoteFlow legal acceptance

Park entirely until the owner resumes approved legal-document work after core systems are operating smoothly. Do not treat legal acceptance as a current release prerequisite.

## 5. Merge and deployment policy

- Green CI is necessary but not sufficient. Review exact PR head SHA, merge-base/base branch, all checks, unresolved review threads, security/compatibility gates, and explicit scope before each merge.
- Keep PRs #236, #237, #243, #244, #250 and #251 unmerged while their stated gates remain open. Keep #233 and #201 parked per owner direction.
- Merge approved, non-deferred, independently qualified work one PR at a time. Do not merge a stacked PR before its dependency is approved and integrated.
- Render auto-deploy remains disabled. Do not enable it as a convenience or deploy a documentation-only change.
- For an approved runtime change: merge, record exact merge SHA, manually deploy that SHA, verify Render reports that exact SHA live, then run `curl.exe -i https://ghm-internal-runtime.onrender.com/healthz`. Healthz success is not a substitute for feature-specific smoke tests or migration qualification.
- No production database migrations, SQL writes, data changes, role/grant changes, secret changes, payment activation, or product cutovers are authorized by this handover.

## 6. Next execution sequence

1. Complete the shared actor/auth privilege inventory and decision ADR on an isolated branch; reconcile the proposal's competing trust-chain options and record the chosen owner-approved boundary.
2. Implement the isolated issuer and its tests without changing production credentials or grants.
3. Implement the database gateway/transaction actor context and shared adversarial qualification suite on disposable PostgreSQL.
4. Migrate one representative low-risk actor-sensitive RPC, review the diff and threat model, then migrate the affected feature RPCs consistently.
5. Complete #236/#237 migration and Business profile compatibility reviews against the active database evidence and disposable qualification.
6. Finish #243/#250, then rebase/qualify #244.
7. Continue other non-deferred GHM core work, operational hardening, and documentation reconciliation.
8. Reassess release candidates one by one; production database changes and deployments remain separate approvals.

## 7. Session checkpoint

At this checkpoint, no PR has been merged as part of this work, no code/migration has been changed, no production database has been queried or modified, no credentials or grants have been changed, and no Render deployment/setting has been changed. This branch is documentation-only and records the owner scope decisions and technical handover for the next implementation session.


## 8. Release queue checkpoint — 2026-11-10 19:52 UTC

- PR #253 (core release-readiness handover) merged into main as `8bb3a764275703d26be93385854290d5672995e3`; exact-head quality, web-quality and Cloudflare Pages passed.
- PR #254 (actor-auth surface inventory) merged into main as `c5238f3d45d05009e2b28d5fa38ebd8ee61a0a33`; exact-head quality, web-quality and Cloudflare Pages passed. The inventory is `docs/security/GHM_ACTOR_AUTH_SURFACE_INVENTORY_2026-11-10.md`.
- PR #236 was closed as superseded, not merged. Comparing its head with current main showed only the two historical handover documents remained different; substantive implementation/migration files were already in main. The residual docs included a false statement that Render auto-deploy was enabled, contrary to the verified live service configuration. The current handover supersedes those stale docs.
- Actor-auth inventory expands the shared gate to include #244's direct engagement-event INSERT attribution surface, not only SECURITY DEFINER functions. It also lists ordinary-runtime auth/session mutation grants that must be isolated with the issuer signing boundary.
- Current main after these documentation merges: `c5238f3d45d05009e2b28d5fa38ebd8ee61a0a33`.
- No production migration/query/write, DB role/grant change, secret change, service provisioning, payment activation, Render setting change, or runtime deployment occurred.


## 9. ADR-001 approval and first isolated implementation — 2026-11-10 20:03 UTC

The owner approved the isolated issuer + separately credentialed typed database gateway direction on 2026-11-10. The approved ADR and implementation/qualification plan are in PR #256, merged as `d40fd88d34e4d6f8242b5b6e1485c2498a1fd7b9`:
- `docs/architecture/ADR-001-isolated-auth-issuer-and-db-actor-gateway.md`
- `docs/architecture/ADR-001_IMPLEMENTATION_AND_QUALIFICATION_PLAN.md`

Approval is limited to isolated implementation and disposable qualification. It does not authorize production service provisioning, credentials, environment changes, database grants/migrations/data changes, or deployments. The exact DB transaction-context proof mechanism remains an implementation spike; caller-writable GUCs, temp tables and plain account-ID arguments are explicitly rejected.

The first code slice is PR #257, public-only ES256 access-token verification. It adds a verifier and public-only key loader that can validate the current GHM token contract without loading a private key, enforces the 900-second maximum token lifetime and future-issued bound, and adds tests. This does not yet remove private signing material from the existing resource API or implement the issuer/gateway services. Exact-head CI is pending at this checkpoint.

PR #251 remains draft/reference material; ADR-001 supersedes its undecided topology language. PayFast and legal-acceptance work remain paused/deferred per owner direction. No production DB access/mutation, grant, credential, service provisioning, Render configuration or runtime deployment occurred.


## 10. Public-only verifier and database gateway principal qualification — 2026-11-10 20:16 UTC

### Merged implementation slices

- PR #257 merged as `e49beff5d87e708906c2077219c839dc7ee9914a`. New `createAccessJwtVerifier` and `loadEs256VerificationKeys` allow a service to verify ES256 access tokens using public key material only. The signer now emits the intended `iat` claim because the previous `noTimestamp: true` option removed it. The verifier accepts legacy tokens without `iat` only if their expiry remains within the 900-second lifetime plus 60-second clock skew. Exact-head quality, web-quality and Cloudflare Pages passed.
- PR #259 merged as `a2da35a6c8f2ffc8e0c8b48728b36c8bc3c7b940`. It adds the additive SECURITY DEFINER helper `ghm.assert_actor_gateway(bigint)`, a restricted gateway login check and disposable PostgreSQL qualification. Exact-head quality, web-quality and Cloudflare Pages passed, including the full disposable migration chain, new principal qualification, full test suite, migration audit and runtime boundary checks.

### Selected database principal model

For the first gateway implementation, the database trusts one isolated actor-assertion service principal: `ghm_actor_gateway`. It must be LOGIN NOINHERIT, non-superuser, non-privileged, and have no role memberships. The helper uses `session_user` (not `current_user`, which changes inside SECURITY DEFINER) to verify the actual login. Only the gateway role can execute it; the ordinary `ghm_runtime` role cannot execute it, assume the gateway role, or read account/auth tables directly. The gateway verifies the ES256 JWT independently, derives actor ID from `sub`, and supplies it to typed protected operations. A gateway compromise is an actor-assertion compromise; keep the gateway isolated and tightly audited.

This deliberately avoids caller-writable GUCs, temp tables and custom SQL crypto. The new migration is additive and is not yet called by feature RPCs. It does not revoke existing runtime privileges. The gateway role is provisioned out-of-band before migration application; the migration refuses to proceed if it is absent or unsafe. CI creates only a disposable test role and database.

### Next implementation gate

Build the separate gateway service with public-only key loading and a closed typed operation registry. Route one representative low-risk read operation through it. Update the corresponding DB function to call `ghm.assert_actor_gateway`, then prove legitimate success and spoof denial using actual disposable `ghm_runtime` and `ghm_actor_gateway` logins. Extend consistently to registration identity, Business profile, supplier classification, capability governance and engagement-event attribution. Do not revoke production runtime privileges, provision production role/credentials, or deploy until all callers are migrated and the full adversarial suite passes.

No production database access/mutation, grant, credential, Render service, environment setting or deployment occurred in these implementation slices.


## 11. First actor-gateway vertical slice — 2026-11-10 20:23 UTC

PR #261 merged as `1250ec141b540d59eecd80eb2e6a57e02b2bc633`. It adds a separate Actor Gateway server entrypoint using public-only ES256 key material and the dedicated `GHM_ACTOR_GATEWAY_DATABASE_URL`; a typed `GET /v1/actor/me` route; a Postgres reader that runs `ghm.gateway_get_actor_identity(bigint)` in a transaction; and a SECURITY DEFINER function that calls `ghm.assert_actor_gateway` and returns only the verified actor's own active identity. The route derives actor ID exclusively from the independently verified JWT `sub`, accepts no caller-selected account ID and exposes no generic SQL/RPC endpoint.

Exact-head quality, web-quality and Cloudflare Pages passed. The quality job included the full disposable migration chain, distinct runtime/gateway/migrator role qualification, typed self-read database qualification, gateway HTTP tests (missing/invalid token, verified-sub binding, denied actor, DB outage, process health), full suite, migration audit and runtime boundary verification.

This is the first vertical slice, not full actor-auth cutover. The ordinary resource API still holds its existing signing capability and current `ghm_runtime` grants remain in place. The helper is wired only into the new self-read function; registration identity, Business profile, supplier, capability and engagement-event functions still need to be migrated. No production Render service, environment variable, role, credential, grant, database migration or deployment was changed.

Next: migrate one existing actor-sensitive feature read through the gateway; update the underlying DB function to call `assert_actor_gateway`; add adversarial cross-actor tests using the actual disposable logins; then extend consistently across all inventoried operations. Only after all callers are migrated and qualification passes should production privilege transition be planned and separately approved.


## 13. Resource API → Actor Gateway registration read integration (PR #265) — 2026-11-10

PR #265 adds an HTTPS-only typed HTTP client from the resource API to the Actor Gateway's `GET /v1/businesses/:businessId/registration-identity`. If `GHM_ACTOR_GATEWAY_URL` is set, the existing Business registration identity GET forwards the original Authorization bearer token. Existing resource API authentication and operation authorization still run first; the gateway independently verifies the ES256 token and checks actor status and business membership again.

Gateway denial/not-found is mapped to 404 and gateway/network/invalid-response errors to 503. Critically, gateway mode never falls back to the legacy DB repository. If the optional URL is unset, existing behavior remains, enabling a controlled rollout. The client enforces HTTPS outside localhost and validates the typed response. Tests cover bearer pass-through, no legacy call/fallback, gateway failure, malformed/mismatched payload, HTTPS and config validation.

At this handover update PR #265 is open and exact-head CI is pending. No production gateway URL, Render service, credential, role, grant, migration execution or deployment has been changed. Keep production URL unset until a separate gateway service has been provisioned with gateway-only database credentials and public ES256 keys and end-to-end qualification is complete. Do not revoke the legacy runtime read grant before successful API-to-gateway deployment and verification.

Next: pass exact-head CI, extend disposable PostgreSQL qualification through the HTTP boundary, then prepare a separately approved Render gateway service and deployment plan. The registration update/write RPC and remaining feature RPCs are not yet migrated.
