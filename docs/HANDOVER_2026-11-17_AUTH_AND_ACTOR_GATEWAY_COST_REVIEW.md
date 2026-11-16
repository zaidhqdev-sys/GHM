# Handover — 2026-11-17 Authentication and Actor Gateway hosting cost review

## Owner direction

The operating constraint is minimum recurring cost until ZAID Technologies products are live and earning revenue. The only previously approved additional hosting allowance is USD 7/month for the Actor Gateway. No second paid service is approved. No service may be created or upgraded without the owner's explicit approval.

## Authentication Issuer — hosting decision

The separate Authentication Issuer deployment target is withdrawn. Do not create, provision, subscribe to, or budget a separate Render service for it.

This does **not** mean deleting GHM authentication. The repository currently has:
- `src/auth-issuer/server.ts`, a standalone HTTP process that owns registration, login, token issuance, and password-recovery routes;
- `src/http/auth-router.ts`, the actual HTTP route implementation;
- `src/http/app.ts`, which already supports registering those auth routes inside the ordinary GHM API app;
- `src/server.ts`, which currently calls `createApp({ authRoutesEnabled: false })`, keeping auth routes out of the existing API process.

The standalone issuer currently uses a distinct `ghm_auth_issuer` database login and startup ACL checks. The correct cost-reduction implementation is to retire the separate process/deployment and mount the existing auth routes in an already-approved GHM service while retaining the dedicated database principal and its least-privilege checks. Do not simply delete auth routes, token issuance, password recovery, or the database protections. Do not silently switch the auth persistence to the broad `ghm_runtime` database identity.

Implementation must:
1. Reuse the existing `GHM-Internal-Runtime` service; no additional hosting.
2. Keep authentication persistence on the restricted `ghm_auth_issuer` database identity, using a separate pool/credential from the ordinary runtime pool.
3. Preserve auth issuer database identity and privilege startup checks before the API reports ready.
4. Register the existing auth routes in the existing GHM API application and retain its configured CORS, proxy, rate-limit, error and readiness behavior.
5. Remove the standalone `start:auth-issuer` deployment entry point and standalone server/app wrapper only after the embedded path and regression tests pass.
6. Keep existing authentication route contracts and product client URLs unchanged.
7. Update CI and handover to prove the embedded cutover; do not alter production secrets, roles, grants, migrations, Render settings or deployments as part of code qualification.

The repository's auth issuer CI qualification is a code/DB-role test, not evidence that a second Render service is required. The Render inventory reviewed on 2026-11-16 showed no deployed Authentication Issuer service. No issuer hosting charge has been incurred according to the reviewed inventory.

## Actor Gateway — necessity and cost review

The Actor Gateway is not the same thing as authentication. It is a privileged database access boundary used by the ordinary GHM API for actor-sensitive operations.

Source review confirmed:
- The ordinary API starts with its restricted `ghm_runtime` database identity.
- Sensitive API operations call dedicated Actor Gateway HTTP clients and pass the user's access token; the gateway verifies the token and derives the actor identity itself.
- The gateway connects using the separate `ghm_actor_gateway` login and checks its database identity, role memberships and privileges at startup.
- Pending database migrations introduce signed-assertion gateway functions and revoke unsafe/unused direct runtime entry points. The earliest pending supplier-classification and capability-governance functions accept caller-supplied actor IDs, so the signed-assertion cutover and revocations must be reviewed as one contiguous migration dependency chain.
- The current ordinary API process is deliberately not allowed to assume the gateway's actor identity or database authority.

**Conclusion:** the gateway's security function is justified by the current database authorization design; it is not an arbitrary authentication feature. However, the separate USD 7/month Render service is a hosting choice, not a fact established by the code alone. Before spending it, compare:
- dedicated always-on gateway process (strongest process/secret isolation; USD 7/month previously approved);
- gateway module and separate restricted DB pool inside the existing GHM runtime (no new hosting cost, but loses process isolation because the ordinary API process can access the gateway credential/secret);
- any already-paid, already-approved hosting option that can provide an always-on isolated process without a new recurring charge.

Do not describe co-hosting as equivalent security. It preserves a separate database login and code path but weakens the process boundary. Do not select it or the paid option until the trade-off is explicitly recorded. Do not use the Free sleeping service for the gateway where the existing five-second client/database timeouts require an always-on endpoint. Do not repurpose `zaid-ai-workforce` without a separate, evidence-based fit review.

## Current operational state

- No Authentication Issuer Render service was present in the reviewed Render inventory.
- No Actor Gateway Render service was present in the reviewed Render inventory.
- `GHM-Internal-Runtime` is the existing Free Web Service; `ghm-db` is the existing paid PostgreSQL service.
- No new service, plan, subscription, secret, environment variable, deployment, database role, grant, migration, or production data was changed by this review.
- PR #297 remains draft/open/unmerged and its production migration batch manifest remains empty. No production migrations are authorized by this review.

## Immediate implementation order

1. Implement embedded Authentication Issuer routes in the existing GHM Internal Runtime, retaining the restricted auth DB principal and startup ACL checks. Remove only the standalone hosted process/deployment requirement.
2. In parallel, complete a bounded Actor Gateway co-hosting-vs-dedicated isolation comparison against the actual Render service constraints and the signed-assertion migration chain. State the security loss and monthly cost plainly.
3. Keep the current USD 7/month Actor Gateway allowance unspent until that comparison identifies the lowest-cost acceptable deployment.
4. Keep production migrations and deployments stopped until their existing backup, ledger, identity and contiguous-prefix gates are satisfied.

This review is a repository/source and previously recorded Render inventory assessment. It is not a production deployment, production ACL change, or live service test.


## Implementation update — embedded authentication work (2026-11-17)

Branch `feature/explicit-production-migration-batches` now contains an initial code change:
- `src/server.ts` mounts the existing auth routes in the existing GHM Internal Runtime.
- Authentication uses a separate PostgreSQL pool and the existing `GHM_AUTH_ISSUER_DATABASE_URL` / SSL mode, retaining the `ghm_auth_issuer` identity and existing startup identity/privilege assertions.
- The ordinary runtime database pool remains separate and continues its existing identity/privilege checks.
- Auth lifecycle routes use the existing GHM runtime app's CORS, proxy, security headers and HTTP server.
- The standalone `start:auth-issuer` package command was removed.
- The auth route registration comment now describes the embedded runtime and separate DB principal.

Commits:
- `257bc03da35b6167695134956c4eee423fd4935f` — embed auth routes and separate auth DB pool in existing runtime.
- `c64072c58c39e6955073b7e4424f3ce4922ef6a2` — remove standalone auth issuer start command.
- `ed4309803b5df9b843112d57cf2b928f566951cf` — clarify embedded auth boundary.

CI run `43977343017` was queued for head `ed4309803b5df9b843112d57cf2b928f566951cf` at handover update time. No pass is claimed until its result is checked.

### Security trade-off that must remain explicit

The embedded runtime now loads the ES256 private signing key in the same OS process as the ordinary Resource API. This removes the standalone issuer's process isolation for that key, even though the auth database connection and least-privilege principal remain separate. The ordinary runtime process therefore has a larger credential/secret blast radius than it did with a separate issuer process.

This code change is not authorized for production deployment merely because it is committed. Before deployment, assess whether this key-isolation loss is acceptable for the zero-new-service cost target. If not, keep the standalone issuer isolated and do not pretend that removing its monthly hosting cost is security-neutral. No production Render environment variables, secrets, service settings or deployment have been changed.

### Actor Gateway cost decision

The current source still routes numerous actor-sensitive operations through gateway clients and requires `GHM_ACTOR_GATEWAY_URL` in production for storage-related workflows. A gateway process co-hosted in the Resource API would hold both the ordinary runtime DB credential and the privileged gateway DB credential in one process, materially weakening the process boundary. It may save the USD 7/month service cost, but it is not equivalent security. Do not implement co-hosting or provision the dedicated service until this trade-off is presented and agreed with the owner.


## Owner decision — temporary launch-phase security trade-off (2026-11-17)

The owner explicitly accepts the reduced process isolation from embedding authentication in the existing GHM Internal Runtime for the current launch/revenue phase. This is a conscious temporary risk acceptance to avoid an additional paid hosting service while ZAID Technologies products are not yet generating revenue.

Conditions:
- Keep the dedicated `ghm_auth_issuer` database login and separate PostgreSQL pool. Do not merge auth persistence into the broad runtime DB identity.
- Keep startup identity, role-membership and privilege assertions; fail startup/readiness if they do not pass.
- Keep existing authentication, token validation, password hashing, password-reset and rate-limit behavior. Do not relax these controls as part of the hosting change.
- Keep the ES256 signing key secret in the existing approved runtime environment; never commit it, log it, expose it to clients or include it in diagnostics.
- Record the process-isolation reduction as temporary and revisit it when product revenue can fund stronger isolation.
- This acceptance applies to embedded Authentication Issuer only. It is not blanket approval to weaken Actor Gateway controls, expose privileged database credentials, add services, or incur recurring costs.
- No production deployment is authorized by this decision alone; code qualification and the existing production rollout gates still apply.

Launch priority reaffirmed: stabilize GHM, bring Zaid Connect and QuoteFlow to market, remove remaining Supabase dependencies, and prioritize revenue. Additional architecture hardening should be proportionate to immediate launch risk and revisited as revenue allows.


## CI qualification update — 2026-11-17

The latest PR head `c08087d538367c3177a58bc3527e6b69bd463bc0` completed GitHub Actions run `43978486010` (run #5217) successfully:
- `quality`: success
- `web-quality`: success

This run includes the embedded authentication startup code and the owner-accepted temporary process-isolation trade-off recorded above. This is CI qualification only; it does not establish production environment readiness or authorize deployment.

## Standalone issuer cleanup boundary

The production start command `start:auth-issuer` has been removed and the existing GHM runtime now mounts the auth routes. The remaining `src/auth-issuer/app.ts` is a testable Express app factory and `src/auth-issuer/app.test.ts` exercises its standalone app behavior; the database principal/privilege/SSL modules under that directory are actively imported by the embedded runtime. Do not delete those shared database security modules. The standalone server entry file is no longer referenced by the package start command. Retire obsolete standalone-only app/test files only as a separate cleanup after equivalent embedded-runtime tests cover their behavior; avoid broad deletion that removes useful security qualification.


## Actor Gateway migration-chain review — 2026-11-17

A source-level review of the exact pending migration files found one concrete ACL gap that must be resolved before any production batch is selected:

- `20261110160000_add_admin_capability_catalogue_governance.sql` creates `ghm.create_capability_draft`, `ghm.update_capability_draft` and `ghm.transition_capability_lifecycle` as SECURITY DEFINER functions and grants EXECUTE to `ghm_runtime`.
- `20261111020000_bind_capability_gateway_actor_to_signed_assertion.sql` adds signed-assertion gateway wrappers and removes the earlier unsigned gateway overloads, but does not revoke the original direct EXECUTE grants from `ghm_runtime` on those three underlying functions.
- Unlike the supplier-classification path, whose cutover migration explicitly revokes `ghm_runtime` from the original `ghm.update_business_supplier_classification` function, the capability-governance chain has no corresponding runtime revocation in the reviewed pending inventory.
- The signed gateway wrappers call the underlying capability functions under their SECURITY DEFINER owner, so the runtime grant appears unnecessary for the gateway path. Before adding a corrective migration, verify all current GHM runtime call sites and confirm the client uses only the signed Actor Gateway operations.

This is a source-level finding, not a live production privilege observation. Production currently has not applied this pending chain according to the last recorded inventory, and the live administrator-authorized ledger read remains a separate gate. Do not manually revoke privileges in production. The corrective action, if call-site review confirms no direct runtime dependency, is a new ordered migration that revokes PUBLIC and `ghm_runtime` EXECUTE on the three legacy direct capability functions, followed by disposable-PostgreSQL qualification and inventory/manifest reconciliation.

Other reviewed points:
- `20261110210000_add_actor_gateway_principal_guard.sql` checks the restricted login and bounded `ghm_db_user` membership, grants schema USAGE, and grants only the initial assertion helper to the gateway login.
- The initial `ghm.assert_actor_gateway(bigint)` helper only checks that the session is the gateway login and that the supplied account is active; by itself it does not cryptographically bind the actor ID.
- The capability signed-assertion migration adds a separate HMAC-protected, one-use, 60-second assertion verifier and grants its typed gateway functions only to `ghm_actor_gateway`.
- The supplier signed-assertion migration extends the operation allowlist and wraps supplier writes with the HMAC assertion. The later legacy-helper revocation removes EXECUTE on the original unsigned helper from application roles.
- The gateway server has fail-closed startup checks for the expected login, role attributes, memberships, schema privileges and approved function privileges. This is code readiness only; it does not provision the production database.

### Hosting decision remains unchanged

No Actor Gateway Render service has been created. No hosting option is being selected by this review. The existing dedicated always-on Render service remains the isolated option at the previously discussed USD 7/month; co-hosting would put both runtime and gateway credentials/secrets in one process and is not an equivalent security boundary. The user's approval of embedded Authentication Issuer applies only to authentication, not Actor Gateway co-hosting. No spend or deployment is authorized by this review.

### Next bounded actions

1. Verify all runtime capability-governance call sites against the signed gateway client.
2. If no direct runtime dependency exists, add the missing revocation migration and update the pending inventory.
3. Qualify the exact migration chain on disposable PostgreSQL, including negative tests proving `ghm_runtime` cannot execute the three legacy functions while `ghm_actor_gateway` can execute only the signed gateway operations.
4. Refresh production backup and obtain the supported administrator ledger/ACL report before any production migration planning.
5. Only after those gates pass, return to the hosting choice and use the already-approved USD 7/month allowance if the dedicated service remains the lowest-cost acceptable isolated option.


## Follow-up: capability governance call-site trace and correction — 2026-11-17

The preceding note correctly identified that the three legacy capability SECURITY DEFINER functions retain their original `ghm_runtime` EXECUTE grants after the signed gateway wrappers are introduced. The proposed corrective action in that note needs an important correction: the repository already contains a deliberately separate, qualified **manual post-deployment cutover**, not a missing ordinary migration.

Evidence reviewed at branch head `f6e62e5606178d4536a656d03dc5cd8952d282f3`:

- `src/http/app.ts` constructs `HttpCapabilityGovernanceGatewayClient` from `GHM_ACTOR_GATEWAY_URL` and registers the capability catalogue routes with that gateway client.
- `src/http/capability-catalogue-router.ts` sends list/create/update/transition admin operations through the gateway client using the incoming bearer token. If the gateway client is absent, these admin operations return HTTP 503; they do not fall back to direct `CapabilityService` writes. The direct service remains in use for public catalogue reads.
- `src/http/capability-governance-gateway-client.ts` maps all four admin operations to the Actor Gateway HTTP API.
- `database/cutovers/20261111010000_revoke_legacy_capability_governance_runtime.sql` explicitly revokes the legacy functions from PUBLIC, `ghm_runtime`, `ghm_migrator`, and `ghm_actor_gateway`. Its header says manual cutover only and requires Actor Gateway deployment, `GHM_ACTOR_GATEWAY_URL` configuration, and end-to-end route verification first.
- `scripts/qualify-capability-governance-cutover-postgres.mjs` applies that cutover only to the explicitly named disposable local PostgreSQL database, then checks that runtime and gateway logins cannot directly execute the legacy functions while signed gateway wrappers continue to work. It checks list, create, update, transition and resulting runtime ACLs.

Therefore:
- Do **not** add this revocation as an ordinary production migration or apply it before gateway hosting and end-to-end route verification. Doing so would intentionally break the legacy runtime capability RPC path before the gateway is live.
- The existing manual cutover SQL is the intended operational boundary. Run its disposable qualification as part of release readiness; after the dedicated Actor Gateway is deployed and the production route is verified, execute the documented manual cutover through the supported administrator process and capture the resulting ACL evidence.
- The prior recommendation to add a new ordered migration is withdrawn. The actual remaining dependency is deployment sequencing and a supported production administrator cutover, not absence of revocation SQL.

No source code or production state was changed by this follow-up. No Render service was created and no spend occurred.
