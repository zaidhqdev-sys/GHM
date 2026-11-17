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


## Production migration inventory audit implementation — 2026-11-17

Implemented a separate read-only production inventory audit mode on PR #297.

### New command

`npm run audit:migrations:production-inventory`

This invokes `scripts/forensic-migration-reconciliation.mjs --production-inventory` and reads the committed `config/production-pending-migration-inventory.json` (48 version/name entries). It does not use or modify the historical seven-entry `config/pending-migrations.production.json` allowlist.

### Safety and comparison behavior

- Requires `GHM_MIGRATOR_DATABASE_URL` and `DATABASE_SSL=true`; strips connection-string SSL overrides and enforces `rejectUnauthorized: true`.
- Begins `BEGIN READ ONLY`; verifies the connection is `session_user=current_user=ghm_migrator` in `ghm_db`; uses `SET LOCAL ROLE ghm_schema_owner`; verifies the effective and session identities and database again.
- Reads the complete live ledger and retains existing repository checksum, supported legacy CRLF, approved historical provenance, name mismatch, retained-history, orphaned exception and unrecognized extra checks.
- Compares the exact actual pending version/name set against the 48-entry inventory. The comparison fails closed on omitted migrations, stale inventory entries, version/name substitutions, malformed entries and duplicate versions.
- Reports structured comparison details and `PASS_WITH_PENDING` only when the complete exact inventory matches and all existing forensic checks pass.
- Always rolls back the read-only transaction. No SQL mutation or migration execution is introduced.
- The old `audit:migrations` and `audit:migrations:predeploy` commands and seven-entry allowlist semantics remain unchanged.
- The production migration batch manifest remains empty.

### Qualification added

- Unit coverage for exact set match, omission, stale entry, name substitution, duplicate/malformed entries, read-only transaction, role switch and rollback contract.
- Assert the committed production inventory remains exactly 48 unique, ordered version/name records.
- The migration audit policy test file is now run by the main `npm test` command.

### Current limitation / next action

This is source implementation only until exact-head CI passes. The local `C:\\GHM\\.env` and `GHM_MIGRATOR_DATABASE_URL` are not accessible through GitHub/Render connectors. Do not claim a live production audit has run. Once CI passes, run the new command from the synchronized local PR checkout and share only its JSON output, with no connection details or secrets. It is read-only and does not run `npm run migrate`.

No production query, DDL, migration, role/ACL change, Render setting, service, deployment, secret, or cost was incurred by this implementation.


### Implementation review follow-up

A source review caught and corrected an over-escaped digit expression in the new inventory validator before qualification. The validator now uses the intended 14-digit version pattern. The committed 48-entry inventory was also checked for count and unique ordered records, and a regression test was added.

The exact current head is `8c360addd23cc81d176fdd7212e7979ede2d27cb`. The GitHub Actions lookup currently returns no PR-triggered workflow run for this commit. Therefore the source changes are **not yet CI-qualified**. Do not treat the audit command as ready for production use until exact-head CI runs and passes. No local execution against production has occurred.


## CI #5238 failure diagnosis and correction — 2026-11-17

The owner supplied job IDs `133709806458` and `133709185509` and reported the Business registration constraint exception as the fatal CI failure. The actual GitHub Actions step summary for run `43984558088` / CI #5238 establishes:

- `web-quality`: success.
- `quality`: failed only at step 48, `Test suite`.
- Step 43, `Qualify Business registration forward migration against existing table`, completed with **success**.
- The registration-number constraint exception at the end of the qualification log is the deliberate negative test: the script replaces the named constraint with `CHECK (true)`, reruns the migration, and requires the migration to reject it. This proves the guard is working; it is not the failed step.
- The permission-denied, membership, forced mapping failure, recovery-invalid and duplicate-login messages are emitted by negative authorization / failure-path tests and are not individually reported as the failed workflow step.

The actual failed assertion in step 48 was test 22 in `scripts/migration-audit-checksum.test.mjs`: the committed 48-entry inventory format test used an over-escaped regex `/^\\\\d{14}$/`, so valid 14-digit migration versions did not match. The production inventory comparison tests 18–21 passed. The forward-migration database qualification step 43 also passed.

Corrected the test assertion to use `/^[0-9]{14}$/` in commit `e7ed0d50878cb28d7548e0f9e8e0917e53df1924`. No migration SQL, table constraint, fixture, database privilege, or runtime behavior was changed in response to this CI failure.

A new exact-head CI #5239 was triggered on `e7ed0d50878cb28d7548e0f9e8e0917e53df1924`. At handover update time, `web-quality` passed and `quality` remained in progress. Await exact-head result before declaring qualification complete.

No production database operation, migration, DDL, deployment, Render setting, service creation, or cost was incurred.


## Exact-head CI #5240 passed — 2026-11-17

Commit `3682a26639c287e013ec267b877822f52fa7cb9d` completed workflow run `43985742306` (CI #5240):
- `quality`: success.
- `web-quality`: success.

The corrected committed 48-entry inventory format assertion now passes. This exact head also qualifies the new `npm run audit:migrations:production-inventory` command and its unit/contract tests within the full quality job. The Business registration forward migration qualification also passes in the quality workflow; the earlier incompatible-constraint exception was the deliberate negative test, not a failing migration.

The new audit is now **CI-qualified**, but has not yet been run against the live production database. The next required operation is the local read-only command from the synchronized PR checkout, using the existing `GHM_MIGRATOR_DATABASE_URL` in `C:\\GHM\\.env`. Share only JSON output. No production migration or DDL is authorized by this result.


## Local checkout mismatch — production inventory audit command not found — 2026-11-17

The owner ran `npm run audit:migrations:production-inventory` from `C:\\GHM` and npm reported a missing script. This is a local checkout synchronization issue, not a missing PR implementation.

Verified directly at the current PR #297 head before responding:
- PR branch: `feature/explicit-production-migration-batches`.
- PR head at inspection: `4277c232f43f264ee4d15283561ec89374d449da`.
- `package.json` contains `"audit:migrations:production-inventory": "node scripts/forensic-migration-reconciliation.mjs --production-inventory"`.
- The referenced script supports `--production-inventory` and the exact 48-entry comparator is present.

Do not substitute `audit:migrations:predeploy`; it remains the historical seven-entry policy. Do not run migrations.

Before changing the local checkout, inspect `git status --short --branch`, current branch and `git rev-parse HEAD`. Preserve any uncommitted work. Once the working tree is confirmed clean (or work is safely preserved), fetch origin and switch/update to the PR branch, then verify the local package script with `npm run` / `node -p "require('./package.json').scripts['audit:migrations:production-inventory']"`. Only then run the read-only audit. No production database operation or cost was incurred.


## Live production migration inventory audit — 2026-11-17

The owner ran `npm run audit:migrations:production-inventory` locally from `C:\\GHM` after switching to PR #297 branch `feature/explicit-production-migration-batches` at commit `31415dc14b88e7f9598d2bc70933f001b9406f57`. The required values were confirmed present in local `.env` without exposing credentials: `GHM_MIGRATOR_DATABASE_URL` present, `DATABASE_SSL=true`, target defaults to `ghm_db`.

The live audit returned **`PASS_WITH_PENDING`**. The output supplied in the handover conversation confirms:
- The 48-entry committed production pending inventory matched the actual live pending version/name set (`pending_allowlist_mismatch_count: 0`).
- `unexplained_mismatches` is empty.
- `name_mismatches` is empty.
- `unrecognized_extra` is empty.
- Ten extra live ledger entries are classified as `VERIFIED_RETAINED_HISTORY` with matching registered names/checksums and documented provenance.
- The historical exception audit includes entries classified `HISTORICAL_PROVENANCE_RETAINED` and several `REDUNDANT` entries. Redundant exceptions are cleanup candidates, not unexplained ledger mismatches; do not remove them during production rollout preparation without a separate provenance review.

Interpretation: this is the first successful **live production** reconciliation of the exact pending inventory against `ghm_db` using the dedicated migrator identity and the script's read-only transaction. `PASS_WITH_PENDING` means the production state matches the committed inventory and all checked forensic categories pass while the listed migrations remain unapplied. It is not a migration execution approval or a completed-migration verdict.

No migration, DDL, grant, role change, production data write, Render change, deployment, service creation or recurring cost was incurred by this audit. The production migration batch manifest remains empty. Do not run `npm run migrate` or populate the manifest as a side effect of this result.

### Next required review

1. Preserve the full local JSON output as audit evidence, including the leading authority and migration count summary, without storing credentials.
2. Review the exact ordered 48-migration dependency chain and the production Actor Gateway API/ACL prerequisites against the now-confirmed live baseline.
3. Keep the known post-deployment manual capability-governance cutover sequencing intact; do not revoke legacy runtime EXECUTE before the gateway is deployed and end-to-end routes are verified.
4. Refresh and verify the Render logical backup immediately before any approved production DDL/ACL changes; the November 14 archive remains the existing validated recovery artifact, not a fresh November 17 backup.
5. Only after the migration chain, backup and gateway readiness gates are satisfied, prepare a separately reviewed exact production batch. The live audit itself authorizes no production change.



## Full 48-migration dependency and Actor Gateway startup review — 2026-11-17

Reviewed all 48 SQL files in `config/production-pending-migration-inventory.json` at PR #297 source head `de94af13b0bce09bd262b0232a96625f5c0e488a`. This was source inspection only; no production SQL was executed.

### Exact startup contract

- The production pending inventory contains **48** ordered migrations, from `20261110010000_add_business_supplier_classification` through `20261116190000_add_commercial_consent_payment_prepare_gateway`.
- `src/actor-gateway/database-privileges.ts` defines an exact **39-signature** Actor Gateway executable-function allow-list. The only tolerated alternative is omission of the three Campaign Directory Review functions before that feature's cutover; the rest of the allow-list remains exact.
- Startup also requires database CONNECT, no database CREATE, schema `ghm` USAGE but no CREATE, zero direct table/sequence privileges, zero PUBLIC or `ghm_runtime` gateway-function execution, safe global/schema default function ACLs, all SECURITY DEFINER routines owned by `ghm_schema_owner` with `pg_catalog, ghm, pg_temp` pinned search path, and no extra non-owner/non-gateway function grantees.
- `src/actor-gateway/server.ts` constructs the readers for actor identity, registration identity, capability governance/mutations, supplier classification, Business profile, saved Businesses, Business hours, trust scores, Business logos, storage metadata, Connect provisioning, Campaign Directory Review, commercial approval authority, commercial document approval and commercial consent/payment preparation. It runs the exact identity/ACL checks before opening the HTTP listener.

**Deployment consequence:** a partially installed gateway migration prefix is not sufficient to start the current Actor Gateway service. The exact allow-list includes the later commercial functions as well as the core signed gateway operations. The gateway must remain undeployed/unstarted until the complete required schema/function chain and secrets are present. Do not weaken the startup allow-list to make an incomplete production schema appear ready.

### Migration phases and security boundaries

The 48 ordered entries fall into these dependency groups (the committed inventory remains the exact authority for order):

1. **Foundation and legacy runtime paths** — supplier classification; onboarding progress; relationship/outcome read models; storage deletion-pending lifecycle; capability governance. The supplier and capability SECURITY DEFINER functions initially accept supplied actor IDs and grant the legacy runtime role; they must be assessed with their later signed gateway replacements/revocations, not exposed as an isolated first batch.
2. **Gateway principal and initial feature wrappers** — restricted gateway principal guard; self/registration identity wrappers; capability invariants and gateway operations; supplier and Business-profile cutovers. Supplier and Business-profile direct runtime EXECUTE are revoked in their respective cutover migrations. Capability's legacy direct RPC remains a separate documented post-deployment manual cutover; do not revoke it before gateway deployment and end-to-end route verification.
3. **Unified signed-actor chain** — HMAC assertion secret/nonce tables; signed capability, supplier, Business-profile, registration and self-identity wrappers; request-context binding; signed Business Capability mutation operations. The database checks operation, actor, issue time, context, signature and one-use nonce; the gateway signs the verified JWT subject.
4. **Business feature gateways and projections** — saved Business operations; Business hours write/read; trust-score operations/projections; Business Logo binding. These operations are granted to the gateway login, not the ordinary runtime login.
5. **Authentication and legacy privilege tightening** — revoke direct runtime external-identity table access and unused auth entry points; token-bound recovery revocation/reset; conditional password rehash; QuoteFlow migration entry-point revocations; revoke PUBLIC default function EXECUTE; revoke the obsolete unsigned actor-gateway overload.
6. **Connect, search-path and storage proof chain** — signed Connect Business provisioning; normalize SECURITY DEFINER ownership/search paths; signed storage metadata operations; separate provider-workflow attestation; revoke redundant migrator mapping lookup. Provider-confirmed storage lifecycle transitions require both user-actor proof and separate Resource API provider attestation.
7. **Commercial consent and founder authority** — provider-code generalization; immutable document/consent evidence; scoped founder approval authority; founder-only authority grant/revoke and document approval transitions; consent-bound payment preparation.

The chain is not a collection of independently deployable SQL snippets. Earlier runtime grants and wrappers are deliberately replaced/revoked by later ordered steps or by documented post-deployment manual cutovers. Do not reorder, skip or cherry-pick migrations.

### Secret provisioning — production gap identified

Two separate protected verifier secrets are required and neither is seeded by its migration:

- **Actor assertions:** `20261111020000` creates `ghm.actor_gateway_capability_assertion_secret` and the nonce table, but does not insert the production key. The gateway process requires `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET`; the database verifier must hold the matching 32-byte key. `scripts/qualify-actor-gateway-principal.mjs` inserts a test key only into `ghm_disposable_test`. No dedicated production provisioning script/runbook was found in the reviewed repository.
- **Storage provider attestations:** `20261112150000` creates `ghm.storage_provider_workflow_attestation_secret` and its nonce table, but does not seed the key. The existing `scripts/provision-storage-provider-attestation-secret.mjs` is explicitly restricted to localhost disposable qualification databases and requires the test-only mutation opt-in; it must not be used against production. The Resource API requires `GHM_STORAGE_PROVIDER_WORKFLOW_ATTESTATION_SECRET` when production storage is enabled. This key is separate from the Actor Gateway actor-assertion key and must not be placed in the Actor Gateway service.

Before production gateway readiness, add and qualify a controlled production secret-provisioning procedure that verifies `ghm_migrator` → `SET LOCAL ROLE ghm_schema_owner`, exact database identity, strict TLS, no secret logging, insert-only first provisioning and explicit rotation semantics. Generate distinct random 32-byte keys; never reuse CI/test keys. Do not create, log, or provision production keys as part of this source review.

### Commercial and legal-approval boundary

- The commercial approval-authority migration explicitly seeds **no authority** and grants no runtime/gateway/PUBLIC access to the authority tables. The founder-only gateway operations derive the actor from the canonical `founder_system_admin_bootstrap_state`, require an active system-admin account and a matching active canonical founder credential, and do not accept a caller-supplied approver. A grant event is required before a document approval event; revocation is serialized against approval. This is a real founder-only control, not a fabricated approver or employee.
- The SQL currently pins the canonical founder login email in the founder assertion functions. Before enabling this path in production, perform a read-only check that the production founder bootstrap singleton and active credential actually resolve to the owner's intended account. The disposable fixture's email is not production evidence. No authority grant or legal-document approval is created by these migrations.
- Payment preparation is gated by `GHM_COMMERCIAL_PAYMENT_PREPARATION_ENABLED` and `GHM_COMMERCIAL_LAUNCH_AUTHORIZED`, both false unless explicitly set to `true`. The current installed provider adapter set in the gateway reader contains PayFast only. The SQL function records consent and a pending payment attempt; its contract explicitly does not initiate checkout or activate a subscription. Given the current PayFast pause, keep both flags disabled and do not use this migration to activate payments.

### Batch runner and current execution posture

- The disposable PostgreSQL qualification covers plan-only/no SQL writes, empty-manifest refusal, stale-inventory refusal, skipped-prefix refusal, exact contiguous-prefix execution, atomic rollback on a failing migration, sequential batches and repeat-run no-op.
- The production runner requires the exact pending inventory to match the live ledger and an explicit `GHM_MIGRATION_BATCH_ID`; inventory alone never authorizes execution. A selected batch must be an exact contiguous prefix. Plan-only mode rolls back and reports the selected prefix without applying SQL.
- The production manifest remains `{ "batches": [] }`. No first batch has been selected. Do not populate it until batch boundaries, legacy runtime continuity, all manual cutover dependencies, secret provisioning, gateway hosting and recovery evidence are reconciled.
- The live production audit remains `PASS_WITH_PENDING` with zero pending-inventory mismatch, unexplained checksum mismatch, name mismatch or unrecognized extra. It confirms the baseline only; it does not authorize a batch.

### Next bounded work

1. Trace the remaining runtime routes and manual cutover dependencies against the now-reviewed migration order; explicitly identify which endpoints would return 503 or lose a legacy path before the gateway is live.
2. Add a controlled, test-qualified production secret-provisioning procedure for both verifier secrets, with no production execution or secret generation in this phase.
3. Verify the production founder bootstrap singleton/credential read-only before any commercial approval feature is enabled.
4. Complete the dedicated Actor Gateway service readiness plan within the previously approved US$7/month ceiling; no service is currently created and no spend is authorized by this source review.
5. Only then prepare a small, exact contiguous batch plan and plan-only output. Refresh/verify the Render logical backup immediately before any approved production DDL/ACL operation.

No production migration, DDL, data write, role/grant change, secret generation/provisioning, Render service/environment/deployment change, payment activation, legal approval, or recurring cost occurred during this review. PR #297 remains open/unmerged and the production batch manifest remains empty.



## Database verifier secret provisioning implementation — 2026-11-17

Implemented a single fail-closed provisioning utility for the two independent verifier secrets:

- `scripts/provision-database-verifier-secret.mjs`
- `scripts/lib/database-verifier-secret-provisioning.mjs`
- `scripts/database-verifier-secret-provisioning.test.mjs`
- npm command: `npm run qualify:database-verifier-secret-provisioning`

### Safeguards implemented

- Requires the dedicated `GHM_MIGRATOR_DATABASE_URL`; no `DATABASE_URL` fallback.
- Requires URL user `ghm_migrator`, explicit database name and exact session/current identity checks.
- Requires transaction-local `SET LOCAL ROLE ghm_schema_owner` and verifies session user remains migrator while current user becomes schema owner.
- Production target is restricted to `ghm_db`, requires `DATABASE_SSL=true` with certificate verification (`rejectUnauthorized: true`), an exact expected-host match via `GHM_SECRET_PROVISIONING_EXPECTED_HOST`, and explicit confirmation `PROVISION ghm_db actor` or `PROVISION ghm_db storage`.
- Disposable target is restricted to an explicitly named local qualification DB and an explicit test-only mutation opt-in.
- Selects one of two fixed table names; no caller-supplied SQL identifiers.
- Requires caller-supplied canonical base64 for exactly 32 bytes; the utility does not generate or print secrets.
- Uses INSERT ... ON CONFLICT DO NOTHING and fails if a row already exists. It never updates, rotates or overwrites an existing verifier key.
- Transaction rollback on identity/insert errors. Output reports only metadata and explicitly states secret values are not logged.
- Actor assertion and storage-provider attestation secrets remain separate; storage attestation key belongs to Resource API, never Actor Gateway.

### Qualification and execution status

The Node test suite covers local-only disposable targeting, exact production DB/host/confirmation/TLS requirements, separate secret/table selection, malformed or absent keys, role identity checks, insert-only behavior and rollback. It has been added as `npm run qualify:database-verifier-secret-provisioning`.

Source implementation commits:
- `eec26358772c66fda7cc474416d7fb3d7a9bbc24` provisioning module
- `c09a0f7cec42cd3a695277f389b47e06e664e24d` CLI
- `7567205d9094c4a9ace57f249afd2df4ae243ab3` initial tests
- `3e8b0ac8fbbf927da8ae009418f3a3703cdbe250` npm qualification command
- `dfef11da0da52cbcbe59c47b4af47bd7000394b0` exact production host guard
- `93c94cc4803a5b84370a1c27968eeabd6a414298` host guard qualification

No CI run was reported for the latest implementation commit at handover time; local test execution has not yet been performed in the user's checkout. Therefore this is **implemented, not yet qualified**.

### Strict next steps

1. Fetch latest PR #297 branch head and run `npm run qualify:database-verifier-secret-provisioning`; then run `npm test` / CI as appropriate.
2. Fix any test/type/CI failures before using the utility.
3. Do not set production target, production confirmation, or production secrets in the local `.env` for qualification. Use only a disposable test DB first.
4. Production host value must be taken from the verified Render `ghm-db` connection hostname, not guessed.
5. Production secret generation, provisioning, key rotation, or any production DB mutation remains unperformed and requires a separate explicit owner decision. The tool intentionally has no rotation mode.


## Verifier provisioning qualification result — 2026-11-17 00:40Z

User ran `npm run qualify:database-verifier-secret-provisioning` locally on exact commit `25ef71db996149c02d75b28ce90f3369c5174489`.

- Result: **9 tests passed, 0 failed**.
- The prior failure was only an assertion regex that expected `expected host`, while the implementation emitted `expected database host`. Corrected the assertion in commit `25ef71db996149c02d75b28ce90f3369c5174489`.
- Covered local-only disposable target, actor/storage secret separation, production DB + exact host + confirmation + TLS checks, invalid user/URL/secret rejection, verified migrator/schema-owner identity, insert-only/no-overwrite, and rollback on role identity mismatch.
- Exact-head GitHub CI run `43989397992` (run #5257) was **in progress** at the time of this handover update.
- This is local automated qualification only. No production secret has been generated, supplied, provisioned, rotated, or changed. No production DB mutation occurred.

Next: wait for exact-head CI #5257; then run the repository's full `npm test` locally on the same exact PR head and resolve any failures. Keep production provisioning blocked until all qualification and review steps are complete and the owner explicitly authorizes the separate production mutation.


## Windows-safe full test suite runner — 2026-11-17

User's local `npm test` initially stopped before build/tests because Windows rejected the oversized expanded Node `--test` command line (`The command line is too long`). This was an OS process-argument limit, not a test assertion or compile failure.

Implemented on PR #297:
- `config/full-test-suite.json`: exact 170 compiled test paths extracted from the existing `npm test` command; verified no concatenated/malformed paths around the quote/notification tests.
- `scripts/run-full-test-suite.mjs`: runs the same file manifest in batches of 32 using Node `spawnSync`, preserving `scripts/test-env.cjs` preloading and stopping on first failed batch.
- `package.json`: `npm test` now builds, invokes the batch runner, then preserves the original post-test qualification steps (QuoteFlow migration-account provisioning check, security-definer authority tests, Actor Gateway worker typecheck/tests, migration checksum tests).

Commits:
- `b0f1ec5253a665a20e21b3c38c3982a89bfccd24` initial manifest/runner/package change
- `590f8693b4564398ee6bd174d27a5a88e0c58678` corrected npm test invocation to remove the original preload prefix before runner

No test execution is yet confirmed with the new runner. Next: fetch exact latest branch head and run `npm test`. Treat any failure as a real build/test/qualification result and diagnose by failing batch. Production remains untouched.


## Full-suite batch 1 findings and safe test isolation — 2026-11-17

Windows-safe runner successfully built TypeScript and began batch 1/6 (32 files). It reported 187 tests: 184 passed, 3 failed.

Findings:
1. Two config tests (`partial storage provider configuration fails closed`, `partial storage TTL configuration fails closed`) inherited real storage settings from the developer's `.env` through `dotenv/config`, so the supposedly partial configurations were not partial.
2. Connect replay persistence test automatically attempted live PostgreSQL whenever distinct runtime/migrator URLs existed in `.env`; it failed authentication for `ghm_runtime`. This was not evidence of a production DB change. No writes succeeded; the test did not reach its intended cleanup/qualification assertions. However, the test design was unsafe because ordinary `npm test` could silently attempt a live database connection.

Fixes committed:
- `3c440fb39aa5f01d6007ac655fe1392006297b2f`: config test helper explicitly clears inherited storage provider/credential/TTL variables unless each test overrides them.
- `57c8034e415668ef00445bad89578b3c0742d107`: live Connect replay PostgreSQL test now skips unless `GHM_RUN_LIVE_DATABASE_TESTS=true` is explicitly set. Comment and skip reason restrict this to an explicitly approved disposable/local database qualification. Ordinary `npm test` will not connect to a database for this test.

Do not set `GHM_RUN_LIVE_DATABASE_TESTS=true` against production or the Render production DB. The user has not authorized live production qualification. Next: fetch latest PR head and rerun `npm test`; review every batch and post-suite qualification separately. No production migrations or production database writes were authorized.


## Ordinary test safety correction — 2026-11-17 00:52Z

The user ran `npm test` on exact checkout `45c5d1c908e304c5fcf135f4e040fcaa8f23813b`.

- Build and the full six-batch test runner completed; the final batch reported 48 passed, 0 failed. Earlier output from the same run included two storage configuration failures and a live Connect replay PostgreSQL authentication failure for `ghm_runtime` (SQLSTATE 28P01).
- The post-suite standalone `qualify-quoteflow-migration-account-provisioning-db.mjs` also attempted a database connection and failed authentication for `ghm_runtime`.
- Inspection showed this standalone qualification was automatically enabled by database URLs loaded from local `.env`. The user's attempted process-level empty environment values did not suppress dotenv loading because dotenv populates empty/missing values from the file. No credentials were printed. PostgreSQL rejected authentication before a session was established; no database writes from this failed connection are evidenced.
- Corrected the qualification to require explicit `GHM_RUN_LIVE_DATABASE_TESTS=true` before it reads database URLs or creates any clients. Otherwise it exits with a clear SKIP. This is committed as `afa63424b354f94e51611243471e9814b1a1fcce` on PR #297.
- This change aligns the standalone qualification with the already-established opt-in behavior of the Connect replay persistence test. Ordinary `npm test` should not silently connect to a live database.
- The previous `npm test` run is **not a pass**. The storage config test failures still require validation on the latest head; the DB qualification is now explicitly opt-in and must be separately run only against a disposable/local database when deliberately authorized.
- No database password, `.env` file, production role/grant, migration, production data, Render setting or deployment was changed.

Next: fetch latest PR #297 head, confirm the standalone qualification prints SKIP with the default opt-out, then rerun `npm test` on that same checkout. Do not set `GHM_RUN_LIVE_DATABASE_TESTS=true` for ordinary tests or against production.

## Ordinary test suite clean on opt-in qualification fix — 2026-11-17 00:55Z

User ran the complete `npm test` on PR #297 checkout `221953fe6fbd8d1c73e67836c8c11e92e731ccad`.

Observed output:
- Build and all six compiled batches completed. Counts: 184, 321, 175, 120, 120, 48; all passed (968 compiled tests total).
- QuoteFlow migration account provisioning live DB qualification printed the expected default `SKIP (set GHM_RUN_LIVE_DATABASE_TESTS=true to opt in)`.
- Migration security-definer inventory: 4/4 passed.
- Actor Gateway worker TypeScript check passed; worker contract tests 8/8 passed.
- Migration audit/checksum tests: 22/22 passed.
- No failures are shown in the complete output supplied by the user.
- This is a successful ordinary local test run. Live database qualifications were skipped, so this does not prove live PostgreSQL behavior or production migration readiness.
- PR #297 remains open/unmerged. CI run #5273 (workflow run ID `43991244289`) was observed in progress on exact head `221953fe6fbd8d1c73e67836c8c11e92e731ccad`; do not report CI as passed until its conclusion is confirmed.
- Production inventory audit, production↔repository migration reconciliation, and disposable PostgreSQL qualification remain separate required gates. Production migration manifest remains empty; no production migrations/deploys authorized.


## Live production migration inventory audit — 2026-11-17 01:03Z

The user ran `npm run audit:migrations:production-inventory` against the production target `ghm_db` and supplied the audit output.

Result: **`PASS_WITH_PENDING`**.

Confirmed from the supplied output:
- Pending migration inventory matches the committed 48-entry ordered inventory: `pending_allowlist_mismatch_count: 0`.
- `unexplained_mismatches: []`.
- `name_mismatches: []`.
- `unrecognized_extra: []`.
- All 10 ledger-only rows are listed under `approved_retained_historical`; the corresponding retained-history audit entries are `VERIFIED_RETAINED_HISTORY`.
- Historical exception audit entries are classified as retained provenance or redundant; no orphaned/invalid retained-history finding is reported in the supplied audit.
- The 48 pending migration records include the complete chain through `20261116190000_add_commercial_consent_payment_prepare_gateway`.

This is a read-only inventory reconciliation at the time of the user's run. It is not migration authorization, a current backup validation, an Actor Gateway deployment, or proof of production ACL readiness. The production batch manifest remains empty. No production migration, DDL, ACL, secret, data, Render setting, deployment, payment, or consent state was changed by the audit.

### Exact-head qualification and current PR state

- PR #297 head remains `4f952814ecb12140404e8fe05ab68eb31c8e69f7`.
- GitHub Actions run #5274 (`43991517637`) completed successfully on that exact head.
- PR #297 remains draft, open and unmerged.
- The user's ordinary local `npm test` result recorded above passed 968 compiled tests plus the listed worker, security-definer and migration checksum qualifications; live DB qualifications were skipped by default.

### Next bounded work

1. Complete the route-by-route dependency map for the first production prefix, distinguishing operations that remain available on legacy `ghm_runtime` paths from operations that return 503 until Actor Gateway is deployed.
2. Keep the capability-governance direct-runtime revocation as the documented manual post-deployment cutover; do not fold it into the migration prefix or execute it before gateway end-to-end verification.
3. Finish controlled secret provisioning review and founder-bootstrap read-only evidence planning. Do not generate or provision production secrets, and do not read or expose secret values.
4. Keep the Actor Gateway hosting decision explicit: dedicated always-on Render service is the isolated option at the previously approved USD 7/month ceiling; no service or spend has been authorized or created by this audit.
5. Only after runtime continuity, all gateway function dependencies, production ACL/secret readiness, hosting, and a fresh backup are evidenced should an exact contiguous batch be selected and plan-only output reviewed.

No production migration execution is authorized by this audit.


## Runtime continuity map — source review 2026-11-17 02:42Z

Reviewed the PR #297 branch source for the first pending business supplier classification and capability governance migrations, plus the GHM HTTP route wiring and Actor Gateway startup contract.

### Confirmed route behavior

| GHM route / operation | Current implementation path | If Actor Gateway is unavailable |
|---|---|---|
| `PATCH /api/v1/businesses/:businessId` with only `isSupplier` | `HttpSupplierClassificationGatewayClient` → `PUT /v1/businesses/:businessId/supplier-classification` → signed assertion SQL function | Returns 503 if no client URL; gateway/network/SQL failures are mapped to service unavailable |
| `PATCH /api/v1/businesses/:businessId` with ordinary profile fields | `HttpBusinessProfileGatewayClient` → `PATCH /v1/businesses/:businessId/profile` | Returns 503 if no client URL; there is no direct repository fallback in this route |
| `GET /api/v1/admin/capabilities` | `HttpCapabilityGovernanceGatewayClient.list` → `GET /v1/admin/capabilities` | Returns 503 if gateway client is absent or request fails |
| `POST /api/v1/admin/capabilities/drafts` | Gateway create-draft endpoint | Returns 503 if gateway client is absent or request fails |
| `PATCH /api/v1/admin/capabilities/:capabilityId/draft` | Gateway update-draft endpoint | Returns 503 if gateway client is absent or request fails |
| `POST /api/v1/admin/capabilities/:capabilityId/transition` | Gateway transition endpoint | Returns 503 if gateway client is absent or request fails |
| `GET /api/v1/capabilities` | Existing `CapabilityService` / `PgCapabilityRepository` read path | Does not use the capability governance gateway client; remains a separate legacy read path |

Source facts:
- `src/config.ts` treats `GHM_ACTOR_GATEWAY_URL` as optional. It validates the URL if present; it does not require it at GHM runtime startup.
- `src/http/app.ts` constructs supplier/profile and capability governance gateway clients only when `config.actorGatewayUrl` is present.
- `src/http/app.ts` routes the business profile update endpoint through the profile gateway for ordinary profile updates, and through supplier gateway for supplier-only updates. Neither path falls back to direct mutation.
- `src/http/capability-catalogue-router.ts` explicitly returns 503 when its gateway client is absent for all admin governance operations; the ordinary selectable catalogue read remains separate.
- `src/actor-gateway/server.ts` requires `GHM_ACTOR_GATEWAY_DATABASE_URL`, ES256 verification key configuration and `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET`; it checks the dedicated DB identity and exact database privilege allowlist before listening.
- The gateway's supplier and capability readers issue signed request assertions and call the corresponding `ghm.gateway_*` SQL functions; they do not use caller-supplied actor IDs as authorization.

### Operational conclusion

The code deliberately fails closed. If `GHM_ACTOR_GATEWAY_URL` is unset, supplier updates, ordinary business-profile updates, and admin capability governance mutations/reads are unavailable (503), while the ordinary selectable capability read remains on its separate legacy path. If a URL is set but the gateway service or its database/function prerequisites are not ready, these gateway-dependent routes still fail closed.

This is a concrete product-continuity dependency, not a reason to restore direct runtime SQL access. Before the relevant revocation migrations are applied, legacy direct SQL permissions may still exist in the database, but the application routes already prefer the gateway and do not automatically fall back. The manual capability-governance runtime revocation must remain after successful gateway deployment and end-to-end verification.

### Next implementation gate

The next safe action is to establish the deployment readiness checklist and verify required environment-variable *presence only* (never values) across the existing GHM runtime and the proposed gateway service. Required gateway configuration includes the dedicated DB URL, ES256 public verification key set, capability assertion secret, HTTPS base URL in GHM runtime, and the matching database functions/ACLs. Do not create a paid Render service or provision secrets as part of this documentation review. No production migrations or deployments were run.
