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


## Actor Gateway qualification and deployment-readiness pass — 2026-11-17

### Exact-head CI evidence

The current PR #297 head `766ce84b6a9188fb91117033ca33b75de6f62207` completed GitHub Actions CI run `43980566967` (run #5220) successfully.

- `quality`: passed.
- `web-quality`: passed.
- The quality job executed the disposable PostgreSQL step **“Qualify capability legacy RPC cutover and gateway-only access”** successfully (job step 53), in addition to applying all repository migrations to disposable PostgreSQL, Actor Gateway principal qualification, the gateway worker smoke test, all other gateway cutover qualifications, and the full test suite.
- This is exact-head CI evidence for the repository's disposable test environment. It is not production database ACL evidence and does not authorize production DDL or cutover.

### Dedicated Render Actor Gateway service contract rechecked

The existing selected host remains one dedicated, always-on Render Web Service in Frankfurt. The existing code contract is:
- Build: `npm ci --include=dev && npm run build`.
- Start: `npm run start:actor-gateway`.
- Health: `GET /healthz`.
- Auto-deploy: OFF; manual controlled deploy.
- Database: private/internal Render PostgreSQL URL, connecting as `ghm_actor_gateway`.
- Runtime client target: set `GHM_ACTOR_GATEWAY_URL` on GHM-Internal-Runtime only after the gateway's HTTPS origin and authenticated routes have been verified.

The gateway server fails startup unless these environment values are supplied:
- `GHM_ACTOR_GATEWAY_DATABASE_URL`
- `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET` (canonical base64 for exactly 32 bytes, consistent with the gateway reader constructors)
- `GHM_JWT_ES256_PUBLIC_KEY_PEM`
- `GHM_JWT_ES256_KID`
- `DATABASE_SSL_MODE=internal` for the same-region private Render database connection (or explicitly `external` only if the external database route is deliberately used).
- Render supplies `PORT`; the server defaults to 10000 only when absent.

Optional previous JWT verification key values must be supplied as a pair:
- `GHM_JWT_ES256_PREVIOUS_PUBLIC_KEY_PEM`
- `GHM_JWT_ES256_PREVIOUS_KID`

The gateway uses public JWT verification material only; it must not receive the ES256 private signing key. The assertion secret is separate from JWT verification material and must never be placed in source, logs, chat, or handover. Do not paste secrets into PowerShell command history; enter them directly in the Render secret fields.

At startup, the server checks `session_user=current_user=ghm_actor_gateway`, login/noinherit and all restricted role attributes/membership options, then checks the exact approved database function allowlist, schema/relation privileges, PUBLIC/runtime function access, SECURITY DEFINER ownership/search_path, and grant-option boundaries. A missing or extra function causes startup failure. This means the production migration chain must install the complete reviewed API and exact ACL before service startup can succeed; installing only the first gateway principal guard is insufficient.

### Current gates and disposition

1. **Code qualification:** exact-head CI passed, including the capability manual-cutover qualification.
2. **Production migration/ACL:** still outstanding. The last recorded production catalogue showed no gateway functions and no schema USAGE for the gateway login. That is historical evidence; obtain a fresh administrator-authorized report before planning execution.
3. **Production backup:** November 14 Render logical export has passed local PostgreSQL 18.6 restore validation. Obtain a fresh export/restore point before any production DDL or grants.
4. **Administrator ledger access:** still outstanding. The Dashboard Default credential was confirmed not to have SELECT on the migration ledger. Use the supported Render administrator route or administrator-assisted report; do not elevate app roles to work around it.
5. **Hosting:** no `ghm-actor-gateway` Render service exists. The previously approved maximum incremental hosting allocation remains USD 7/month for this one dedicated service only. It has not been spent. No second service or provider is approved.
6. **Deployment and application cutover:** not performed. No gateway secret, DB credential reset, Render environment variable, service, deployment, production migration, or manual cutover was changed.

### Next bounded sequence

- Obtain the supported production administrator ledger and ACL report and verify the live gateway principal, ownership and membership state.
- Refresh the production backup and retain the existing verified November 14 restore artifact.
- Select and qualify the smallest contiguous production migration prefix that installs the complete gateway API and all signed assertion dependencies; keep the production batch manifest empty until exact inventory/ledger evidence supports that selection.
- When the production migration/backup gates pass, provision the already-approved dedicated Render service, with auto-deploy OFF, and supply the secrets directly in its settings.
- Verify startup ACL assertions, `/healthz`, JWT-authenticated operation tests, negative authorization cases, and restart behavior.
- Only then configure `GHM_ACTOR_GATEWAY_URL` on GHM-Internal-Runtime, deploy that runtime manually, verify real capability routes, and execute the documented manual legacy-function cutover through the supported administrator process.

No production state, Render service, credential, secret, environment variable, migration, grant, deployment or payment setting was changed by this readiness review. No recurring cost was incurred.


## Live production Actor Gateway ACL preflight — 2026-11-17

A fresh read-only query was run against the existing Render production Postgres resource `ghm-db` (ID `dpg-dag0sdtbedkc7389vi2g-a`, database `ghm_db`). No write statements were issued.

### Connection identity and privilege boundary

- The Render read-only query connection reported `session_user=ghm_app_user`, `current_user=ghm_db_user`. This is the Render connector's effective database identity, not the Actor Gateway login and not the GHM runtime's direct connection.
- `ghm_actor_gateway` exists as LOGIN / NOINHERIT, with SUPERUSER, CREATEDB, CREATEROLE, REPLICATION and BYPASSRLS all false.
- The only membership into `ghm_actor_gateway` is `ghm_db_user` with ADMIN OPTION=true, INHERIT=false, SET=false. The gateway role has no outgoing memberships. This matches the intended bounded membership rule.
- The trusted `ghm_db_user` itself has CREATEDB and CREATEROLE and administrative memberships; do not confuse this trusted Render database-administration identity with the restricted application login `ghm_app_user` or with `ghm_actor_gateway`. No role attributes or memberships were changed.
- Gateway CONNECT is true and database CREATE is false.
- Gateway schema `ghm` USAGE is **false**, CREATE is false.
- Gateway direct relation privileges count is zero.
- The production catalogue query for `ghm.gateway_*` and `ghm.assert_actor_gateway*` returned **zero rows**. The 14 functions for which the gateway role currently resolves EXECUTE are unrelated existing `touch_*` / enforcement functions inherited through default PUBLIC function execution; they are not the required gateway API and do not satisfy the gateway startup allowlist.
- Therefore the production Actor Gateway database API is not installed and the gateway service would fail its startup privilege checks today.

### Ledger access remains blocked

An explicit read-only query of `ghm.ghm_schema_migrations` returned PostgreSQL `42501 permission denied for table ghm_schema_migrations`. The connector's effective `ghm_db_user` identity cannot provide the required live migration ledger. Do not grant ledger SELECT to the runtime or gateway to work around this. Obtain the supported Render administrator ledger export/report or use the documented owner-supported admin process.

### Render resource inventory refreshed

The current workspace inventory confirms:
- Existing production `GHM-Internal-Runtime`: Free Web Service, Frankfurt, auto-deploy OFF.
- Existing production database `ghm-db`: Postgres 18, Frankfurt, plan `0.1c-256mb`, available.
- No `ghm-actor-gateway` service exists.
- The identity qualification and PayFast sandbox services/databases are excluded from production target scope and must not be repurposed.
- `zaid-ai-workforce` is a separate application and is not a gateway host.

### Immediate conclusion

The production database is not ready for Actor Gateway deployment: required gateway schema USAGE and API function allowlist are absent, and the live migration ledger cannot be read through the available connector identity. The correct next move is administrator-led ledger/ACL evidence and a fresh backup, not service creation or manual grants.

The owner has previously approved a maximum incremental hosting allowance of USD 7/month for one dedicated, always-on Actor Gateway service. This approval is a spending ceiling, not an instruction to provision before the database and backup gates pass. No cost has been incurred and no service has been created.

No production writes, migrations, grants, revocations, role changes, secrets, environment variables, service changes or deployments were performed during this preflight.


## Handover reconciliation — prior ledger-access and backup status correction (2026-11-17)

The 2026-11-16/17 assistant updates incorrectly described the production migration ledger as requiring a new Render administrator report. The canonical role-separation handover already documents and verifies the supported path; do not repeat the support escalation or try the Render read-only connector for ledger contents.

### Correct production ledger access path — already verified

Source of truth: `docs/security/RENDER_ACTOR_GATEWAY_ROLE_SEPARATION_HANDOVER_2026-11-12.md`, especially its 2026-11-14 continuations.

- Use the existing local `C:\\GHM\\.env` value `GHM_MIGRATOR_DATABASE_URL` without displaying or copying it.
- The connection uses the SQL-created `ghm_migrator` login, with `DATABASE_SSL=true` and strict certificate verification.
- Begin `BEGIN READ ONLY`; verify `session_user=current_user=ghm_migrator` and `current_database()=ghm_db`.
- Run `SET LOCAL ROLE ghm_schema_owner`; verify `session_user=ghm_migrator`, `current_user=ghm_schema_owner`, and `transaction_read_only=on`.
- Read `version,name,checksum,applied_at` from `ghm.ghm_schema_migrations`, then ROLLBACK.
- This exact path was successfully verified on 2026-11-14, and the full production forensic reconciliation was run through it. The Render query connector's `ghm_db_user` permission denial is expected and does not mean the supported migrator path is unavailable.
- Do not grant ledger SELECT to `ghm_db_user`, `ghm_runtime`, or `ghm_actor_gateway`; do not change role memberships or use the Dashboard Default connection as a substitute.

A previous local `GHM_MIGRATOR_DATABASE_URL` attempt timed out before PostgreSQL authentication, but that observation was superseded by the successful 2026-11-14 identity, SET LOCAL ROLE and ledger-read tests. Do not treat the old timeout as a current blocker.

### Audit state and current PR inventory

- The latest full recorded live ledger baseline is 105 rows through `20261109210000`, obtained using the verified migrator path. The November 14 Render logical export has since been restored successfully into local PostgreSQL 18.6 and independently confirmed to contain the same 105-row ledger boundary.
- PR #297's current pending inventory contains 48 ordered repository migrations against that 105-row baseline; the separate production batch manifest remains intentionally empty.
- The legacy `config/pending-migrations.production.json` seven-entry allowlist is historical audit policy and is not the new 48-entry execution inventory. Do not expand it just to force the older audit command to pass. Do not treat either inventory as permission to execute.
- Immediately before any production batch decision, rerun the read-only forensic reconciliation using the existing `GHM_MIGRATOR_DATABASE_URL` from the local `C:\\GHM\\.env` against the exact reviewed PR/main tree. Compare the full live version/name/checksum rows to the 48-entry inventory, retained-history registry and checksum policy. Do not run `npm run migrate`.

### Backup status — existing recovery evidence, not missing

- The November 14 Render-generated logical export at `C:\\Users\\zaidh\\Downloads\\2026-11-14T14_26Z.dir.tar.gz` (SHA-256 `2341471A3D0890A1B0E26D356BE7FB121385FDD3A33B8340658CB290CBC749F4`) was restored successfully to local PostgreSQL 18.6 database `ghm_restore_20261116` at `127.0.0.1:5433`.
- Restore exited 0; post-restore checks confirmed 105 ledger rows through `20261109210000`, 59 `ghm` tables and 5 `public` tables. This is **local logical restore validated**, not a Render PITR test and not coverage of writes after the November 14 export.
- Therefore the backup is not simply “missing” and the local restore does not need to be repeated. A **fresh on-demand Render logical export** is still required immediately before production DDL/ACL/role changes, because the November 14 artifact is now stale for a November 17 change window. Render's Postgres connector exposes metadata and read-only SQL only; it has no export/backup operation. Do not claim a fresh backup exists until the owner downloads and verifies the new artifact.
- Preserve the November 14 archive and restored database; do not overwrite or drop either.

### Render inventory and cost decision

- The current Render resource inventory was refreshed: production `ghm-db` is available; `GHM-Internal-Runtime` remains the existing Free Frankfurt Web Service with auto-deploy OFF; no `ghm-actor-gateway` service exists.
- The owner has explicitly approved a maximum incremental allowance of **US$7/month for one dedicated, always-on Frankfurt Actor Gateway Web Service**. This is not a blanket allowance for any other service or resource.
- Do not create the gateway until the current live migration inventory, fresh backup, complete gateway migration/ACL dependencies and credential/secret readiness are verified. The service remains a dedicated Node Web Service; the old Cloudflare Tunnel/Hyperdrive connector topology is superseded and must not be reopened.

### Exact-head qualification

PR #297 head `a8635422b51efdbd7c975556b699465aca285cbd` completed CI run `43982113002` (run #5222) successfully:
- `quality`: success, including disposable PostgreSQL application of all migrations, migration batch-runner qualification, Actor Gateway principal qualification, signed assertion and cutover qualifications, capability legacy RPC cutover, full test suite and runtime boundary checks.
- `web-quality`: success.

This is repository/disposable-database qualification only. It does not refresh the live ledger, create a production backup, install production gateway functions, deploy a service, or authorize a production batch.

### Correct next actions

1. Use the already-configured local migrator URL in `C:\\GHM\\.env` and rerun the read-only production forensic reconciliation against the exact current reviewed tree. Keep secrets hidden and capture only the JSON audit result.
2. Compare the live ledger's exact missing migration set to PR #297's 48-entry inventory; investigate any difference rather than editing the inventory to make it pass.
3. Finish the contiguous gateway migration prefix/dependency map and the production ACL/startup allowlist comparison. Keep `config/production-migration-batches.json` empty until a separate exact batch is reviewed.
4. Immediately before any production DDL, create and verify a fresh Render logical export and preserve the existing November 14 recovery artifact.
5. Only after those gates pass, use the previously approved USD 7/month allowance for the dedicated gateway, manually deploy, verify authenticated routes and then perform the documented post-deployment manual cutovers.

No production query, DDL, migration, role/grant change, secret, Render setting, service, deployment or recurring cost was changed by this handover reconciliation.


## Audit command compatibility correction — 2026-11-17

The previous chat instruction to run `npm run audit:migrations` against the new 48-entry production pending inventory was premature. I inspected the exact script at the current PR head.

- `audit:migrations` invokes `scripts/forensic-migration-reconciliation.mjs` without `--allow-pending`, so any pending migrations make its verdict `INVESTIGATE`.
- `audit:migrations:predeploy` adds `--allow-pending`, but the script reads the older `config/pending-migrations.production.json` seven-entry legacy allowlist. It does not read the new `config/production-pending-migration-inventory.json` 48-entry inventory.
- Therefore neither existing command currently performs the exact 48-entry live reconciliation requested in this handover. Do not tell the owner to run either as if it were the correct final audit; the predeploy command would report a pending-allowlist mismatch if all 48 are live-pending.
- The old seven-entry allowlist is historical audit policy and must not be expanded to 48 to force a pass.

Next implementation task: add a distinct, explicitly named read-only production reconciliation mode that reads `config/production-pending-migration-inventory.json`, verifies exact live missing version/name pairs against all 48 entries, retains all existing checksum/name/retained-history/provenance checks, verifies `ghm_migrator` then `SET LOCAL ROLE ghm_schema_owner` inside `BEGIN READ ONLY`, and always rolls back. Keep existing `audit:migrations` and `audit:migrations:predeploy` semantics unchanged for the legacy audit policy. Add unit/contract coverage for exact inventory match, stale/missing/extra inventory entries, checksum mismatch, role identity failure and rollback. Do not print the connection string or any secret. After CI passes, run the new command locally against the existing `GHM_MIGRATOR_DATABASE_URL` in `C:\\GHM\\.env` and capture only its JSON output.

This correction changes no source code, production state, manifest, migration, credential, service or cost. The production batch manifest remains empty.
