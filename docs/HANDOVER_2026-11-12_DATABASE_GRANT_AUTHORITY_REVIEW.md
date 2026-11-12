# Handover — GHM Database Grant-Authority Review

**Date:** 2026-11-12  
**Repository:** `zaidhqdev-sys/GHM`  
**Construction branch:** `construction/auth-issuer-isolation-20261112`  
**Audited source HEAD:** `297380ec13ea9cc701992a1ea5e70dc050ef0e3d`  
**Exact-head CI:** [43243100086](https://github.com/zaidhqdev-sys/GHM/actions/runs/43243100086) — `quality`, `web-quality`, and Cloudflare branch preview passed.

## Purpose and continuation rule

Continue the existing whole-database SECURITY DEFINER grant-authority review. This is not a new audit and does not supersede the storage implementation/qualification evidence in [HANDOVER_2026-11-12_STORAGE_METADATA_GATEWAY.md](./HANDOVER_2026-11-12_STORAGE_METADATA_GATEWAY.md).

Do not merge the construction branch or PR #272. Do not change production roles, grants, migrations, secrets, deployments, provider resources, application data, or traffic. Keep all qualification work on disposable PostgreSQL 18 unless a separately approved gate explicitly authorizes otherwise.

## Latest inventory artifact — exact-head evidence

Artifact `security-definer-authority-inventory`, ID `13956720917`, was retrieved from exact-head CI run `43243100086` and independently parsed.

- ZIP SHA-256: `c5f0434f015425100783a4b60fd45a05ed8062d320eb526856fbb252605fa85c`
- JSON SHA-256: `edef837704e4ad194b6eb86b8c6aa180febd64d6538d13304819c3f246efc1cc`
- Captured: `2026-11-12T15:01:07.307Z`
- Target: `ghm_disposable_test`, PostgreSQL `18.6`
- Identity: `session_user=current_user=ghm_migrator`
- Mutation: `false`

Inventory results:

- 103 SECURITY DEFINER routines.
- All 103 are in schema `ghm`, owned by `ghm_schema_owner`, use trusted `sql`/`plpgsql`, and have exactly `search_path=pg_catalog, ghm, pg_temp`.
- Zero PUBLIC EXECUTE grants.
- 75 unique routine findings with non-owner EXECUTE grants; these are review entries, not 75 confirmed vulnerabilities.
- 76 direct non-owner EXECUTE grant entries: runtime 43, Actor Gateway 30, payment provider 2, migrator 1. The difference between 75 routines and 76 grants is `ghm.auth_lookup_business_external_mapping(text,text)`, which is granted to both runtime and migrator.
- No SECURITY DEFINER extension membership was found.
- The only application-role membership is `ghm_migrator → ghm_schema_owner`, `INHERIT=false`, `SET=true`, `ADMIN OPTION=false`.
- Application logins are NOINHERIT, non-superuser, and have no CREATEDB, CREATEROLE, replication or BYPASSRLS attributes.
- `ghm` schema CREATE/USAGE belongs to the schema owner; runtime, Actor Gateway and payment provider have USAGE without CREATE. Migrator has no direct `ghm` schema USAGE. No PUBLIC privilege exists on `ghm`.

This is a disposable pre-cutover snapshot, not evidence of production catalog state. The issuer cutover rehearsal restores the original ACL state, so `ghm_auth_issuer` has no `ghm` schema USAGE or direct function grants in this artifact. The isolated issuer's ten-function allow-list is verified separately in source and disposable cutover qualification.

## Role-by-role grant reconciliation

### Actor Gateway — 30 grants

The inventory's 30 direct grants exactly match the 30 signatures in `src/actor-gateway/database-privileges.ts`: the 29 signed/typed gateway operations plus `assert_actor_gateway_capability`.

The startup verifier checks the exact executable function set, no direct GHM relation/sequence privileges, schema USAGE without CREATE, no PUBLIC execution, no runtime execution of gateway functions, pinned SECURITY DEFINER ownership/search paths, and safe function default ACLs. The exact-head PostgreSQL 18 qualification passed.

**Disposition:** reconciled for this disposable baseline. Keep the allow-list synchronized with each new operation and migration.

### Authentication Issuer — ten-function code allow-list; no grants in baseline

`src/auth-issuer/database-privileges.ts` defines the exact ten-function issuer allow-list and expects the Resource API runtime to retain only two auth mapping lookups after issuer cutover. The current inventory is deliberately pre-cutover and therefore shows no issuer schema/function grants.

**Disposition:** source and disposable cutover/rollback qualification remain separate from production rollout. Do not interpret the zero issuer grants in this baseline as a failed qualification or as a production state.

### Payment Provider — two grants

The two grants are:

- `ghm.commercial_get_payfast_attempt(bigint)`
- `ghm.commercial_apply_payfast_payment_result(...)`

The apply wrapper locks the payment attempt, requires provider `payfast` and currency `ZAR`, then delegates to the canonical settlement function.

**Disposition:** narrowly scoped to the PayFast provider role. PayFast remains paused pending sandbox access; do not provision or enable payment processing as part of this audit.

### Migrator — one grant requiring cleanup review

The only direct grant is `ghm.auth_lookup_business_external_mapping(text,text)`, shared with runtime. Its migration explicitly grants EXECUTE to both `ghm_runtime` and `ghm_migrator`.

The inventory shows that `ghm_migrator` has no direct `ghm` schema USAGE. It can SET ROLE to `ghm_schema_owner` for migration work, at which point the schema owner already has function execution. No migration-runner call site has yet been established for this lookup.

**Disposition:** likely redundant direct grant, not a demonstrated privilege escalation. Confirm all call sites and the migration runner contract before removing it. Do not rewrite the historical migration; if cleanup is justified, use a forward-only migration and disposable qualification.

### Resource API runtime — 43 grants

The 43 direct grants divide into:

- 14 authentication lifecycle/enrollment functions covered by the separate manual Authentication Issuer cutover;
- 2 retained read-only external identity/business mapping lookups;
- 3 capability catalogue governance functions;
- 2 Business registration identity functions;
- 3 Business Capability mutation functions;
- 2 Saved Business favourite functions;
- 1 Business Hours function;
- 1 Trust Score function;
- 1 Business Logo binding function;
- 5 legacy non-public storage metadata functions plus the separate constrained public-logo lookup;
- 2 Campaign mutation functions;
- 1 Business directory-review owner-presentation read;
- 1 Connect service-assertion replay-consumption function;
- the remaining constrained public/directory read functions recorded in the inventory and prior full security handover.

The planned manual issuer/gateway cutovers account for 27 of the 43 runtime grants. They must remain unapplied until the relevant service/client is deployed and end-to-end qualified, the Render role model is resolved, a fresh independently verified production backup exists, and the deployment/rollback window is approved.

## New findings from the remaining runtime review

### 1. Campaign create/update — caller-supplied actor ID is not database-bound

The following active SECURITY DEFINER functions remain directly executable by `ghm_runtime`:

- `ghm.create_campaign(bigint,bigint,text)`
- `ghm.update_campaign(bigint,bigint,text,text)`

Both functions validate active owner/administrator membership using caller-supplied `p_account_id`. They do not independently bind that account ID to the authenticated actor or reject a disabled account independently of the membership row.

The active Resource API repository calls these functions inside `withAuthorizedTransaction`, but `src/db/authorized-transaction.ts` only validates the in-process AuthContext and opens a transaction; it does not establish a database-verifiable actor identity. The direct runtime database caller can therefore supply another owner's account ID.

The current Campaign qualification checks membership/role behavior and direct table DML denial, but does not contain an adversarial direct-runtime actor-ID substitution test.

**Status: OPEN database actor-binding finding.** Do not treat the membership predicate as sufficient database actor authentication.

### 2. Directory-review presentation — caller-supplied actor ID is not database-bound

`ghm.get_business_directory_review_presentation(bigint,bigint)` remains directly executable by `ghm_runtime`. It returns owner-facing review status and last-review reason after checking active owner/administrator membership for supplied `p_account_id`; the account ID is not bound to the database session actor.

The owner presentation HTTP route remains active. The Founder submission, queue and decision routes are disabled, but the current route and migration-contract tests explicitly preserve this owner presentation read and its legacy runtime grant.

**Status: OPEN database actor-binding/read-isolation finding.** Preserve the owner presentation feature, but move it behind a signed Actor Gateway operation before revoking the legacy runtime grant.

### 3. Runtime startup has no exact function EXECUTE allow-list

`src/db/runtime-principal.ts` and `src/db/runtime-startup-acl-contract.test.ts` verify runtime login identity, role attributes, role memberships, database CONNECT/CREATE and schema USAGE/CREATE. They do not compare the runtime's actual executable GHM function set against a reviewed allow-list.

Actor Gateway and Authentication Issuer do perform exact executable-function allow-list checks. The Resource API runtime currently has no equivalent startup drift detector for its 43 direct grants.

**Status: OPEN control-hardening gap.** Define and qualify an explicit runtime function allow-list for the pre-cutover and post-cutover states, or an equivalently fail-closed staged policy. Do not accidentally lock out required operations during a manual cutover.

## Remaining review and implementation sequence

1. Finish signature-by-signature review of all 43 runtime grants, including call sites, actor binding, tenant scope, lifecycle and operation necessity.
2. Design and implement signed Actor Gateway wrappers/routes/readers/Resource API clients for Campaign create, Campaign update and directory-review presentation.
3. Add adversarial PostgreSQL 18 tests proving direct `ghm_runtime` invocation cannot substitute another active owner/admin ID or use a disabled actor; prove signed gateway calls succeed and cross-business access is denied.
4. Add a manual-only three-function legacy grant cutover and a disposable revoke/rollback rehearsal. Keep the owner presentation route available through the gateway.
5. Add a runtime function EXECUTE allow-list and exact disposable qualification, accounting for the 43-function pre-cutover state and the smaller state after manual cutovers.
6. Confirm whether the migrator mapping lookup grant has any legitimate caller; remove it only through a forward-only, qualified migration if redundant.
7. Re-run the full 103-routine inventory, inspect the artifact and checksum, run issuer/Actor Gateway/runtime qualifications and exact-head CI, then reconcile the current-state and security handovers.

## Production and repository safety

At the audited HEAD:

- No production database roles, grants, migrations, data, secrets or provider credentials were changed.
- No Render service/environment or production deployment was changed.
- No production storage bucket was mutated.
- No PR was merged.
- PR #272 remains separate from this construction branch.
- The existing fresh-backup, Render role-administration, deployment/network/TLS/rollback, external non-production R2, and founder-approval gates remain open.

**Current conclusion:** the storage metadata actor/provider boundary is source-remediated and disposable-qualified. The whole-database inventory is complete for the audited GHM schema snapshot, but the application grant-authority review is **not closed**. Campaign and directory-review presentation require database actor binding, runtime function-grant drift detection is missing, and the migrator's explicit mapping lookup grant needs a necessity check.


---

## Continuation addendum — Campaign and directory-review actor binding

**Updated:** 2026-11-12  
**Implementation branch:** `construction/auth-issuer-isolation-20261112`  
**Implementation HEAD at this checkpoint:** `1bd6ba2ab7fea7ae62585d0de8060d34e1e8c9ee`

The two actor-binding findings recorded above have now been source-remediated. The original finding descriptions remain as historical evidence; their current status is superseded by this addendum.

### Database migration and operation boundaries

Forward migration:

`database/migrations/20261112160000_add_signed_campaign_directory_review_actor_gateway.sql`

It adds three SECURITY DEFINER wrappers:

- `ghm.gateway_create_campaign(...)` — signed operation `campaign.create`.
- `ghm.gateway_update_campaign(...)` — signed operation `campaign.update`.
- `ghm.gateway_get_business_directory_review_presentation(...)` — signed operation `directory_review.presentation.read`.

Each wrapper:
- Verifies the full signed request context against the actual SQL arguments.
- Calls `ghm.assert_actor_gateway_capability` and derives the actor from the verified, one-use assertion.
- Passes only that verified actor into the legacy business operation.
- Is owned by `ghm_schema_owner`, has pinned `pg_catalog, ghm, pg_temp` search path, and is executable by `ghm_actor_gateway` only among application principals.

The migration extends the shared operation allow-list using a guarded `pg_get_functiondef` rewrite. It revokes the three legacy runtime grants for Campaign create, Campaign update and directory-review presentation. The owner-facing review presentation remains available through the gateway; Founder submission, queue and decision routes remain disabled.

### Resource API and Actor Gateway integration

- Added `PostgresCampaignDirectoryReviewGatewayReader` and the three authenticated Actor Gateway routes.
- Added `HttpCampaignDirectoryReviewGatewayClient` and delegated Resource API Campaign create/update and owner directory-review presentation to it when configured.
- Production Resource API fails closed if the gateway is required but unavailable.
- The verified ES256 bearer is carried in a non-enumerable, non-writable `AuthContext.actorGatewayBearerToken` property. It is not serialized or included in ordinary context enumeration. Actor Gateway independently verifies the bearer and creates the signed database assertion; Resource API does not receive the assertion signing key.
- Actor Gateway database startup allow-list now accepts exactly two staged states: its existing 30-function pre-migration set or the 33-function post-migration set. Missing new wrappers therefore do not prevent the gateway service from being staged before the migration.

### Runtime function-grant drift detection

Added `src/db/runtime-database-privileges.ts` and a pre-listen Resource API check.

- Disposable PostgreSQL 18.6 baseline: 43 SECURITY DEFINER functions executable by `ghm_runtime`.
- After this Campaign/review migration: 40.
- The SQL normalizes expected signatures through PostgreSQL `to_regprocedure` and inventories actual executable SECURITY DEFINER functions from the live catalog.
- Only those two exact states are accepted in non-production qualification.
- **Production enforcement is deliberately gated** behind `GHM_RUNTIME_FUNCTION_ALLOWLIST_ENFORCED=true`. The 43/40 sets are derived from disposable PostgreSQL evidence, not an independently verified production catalog. Do not set the production flag until the production ACL inventory has been captured and reconciled.

### Qualification evidence

New tests and script:

- `src/actor-gateway/campaign-directory-review-app.test.ts`
- `src/resources/campaign-directory-review-gateway-repository.test.ts`
- `src/db/campaign-directory-review-actor-gateway-migration-contract.test.ts`
- `src/db/runtime-database-privileges.test.ts`
- `scripts/qualify-campaign-directory-review-gateway-postgres.mjs`

CI run [43254532210](https://github.com/zaidhqdev-sys/GHM/actions/runs/43254532210), exact HEAD `1bd6ba2ab7fea7ae62585d0de8060d34e1e8c9ee`, has passed:

- TypeScript build.
- Full disposable PostgreSQL migration application.
- Actor Gateway principal and staged ACL qualification, including the runtime function allow-list check.
- Test suite.
- Campaign and directory-review PostgreSQL qualification.

The new PostgreSQL qualification proves:
- Legacy Campaign and directory-review functions are not executable by `ghm_runtime`.
- Runtime cannot execute the new Actor Gateway wrappers.
- Signed gateway Campaign creation/update and owner presentation reads succeed.
- Creator provenance is bound to the signed actor.
- Cross-business Campaign update and review presentation reads are denied.
- Actor-ID substitution is denied for Campaign create, Campaign update and directory-review presentation.
- Campaign request-target substitution and assertion replay are denied.
- Disabled actors cannot read directory-review presentation.

Both exact-head CI jobs have now passed for implementation HEAD 1bd6ba2ab7fea7ae62585d0de8060d34e1e8c9ee: quality and web-quality, run [43254532210](https://github.com/zaidhqdev-sys/GHM/actions/runs/43254532210). The latest follow-on commits are documentation-only; their own exact-head run is tracked separately.

### Deployment sequencing and safety

This is a manual production cutover, not an instruction to deploy now.

1. Reconcile the actual production runtime and Actor Gateway catalogs and obtain the required independently verified backup.
2. Stage the Actor Gateway build; its startup allow-list accepts the existing 30-function state.
3. Coordinate the Resource API / Actor Gateway deployment and migration window. The migration revokes legacy runtime grants, so old Resource API instances cannot continue using the old direct functions. Do not permit mixed-version traffic through this transition.
4. Apply the migration only after gateway service, URL, secrets, network and rollback readiness are verified.
5. Restart Actor Gateway to verify the 33-function post-migration ACL.
6. Deploy/enable Resource API gateway delegation and run live end-to-end qualification before reopening affected operations.

No production database, Render service, secret, provider bucket, deployment, traffic, role or grant has been changed. No PR has been merged. PR #272 remains separate. PayFast remains paused. Existing backup, Render role-administration, non-production R2, deployment/network/TLS/rollback and founder-approval blockers remain open.

**Current finding status:** Campaign create/update and owner directory-review presentation are now routed through signed Actor Gateway database wrappers in source and have passed disposable PostgreSQL qualification. The broader 43-function review, production ACL reconciliation and production cutover remain open.


---

## 2026-11-12 — continuation after Render support confirmation: connection inventory

### Render support resolution

Render support representative Amanda confirmed in the 12 November support conversation that normal application execution should use SQL-created login role(s) outside the Render Dashboard-managed credential list. Dashboard-managed default credentials should remain for controlled database administration. Render confirmed that SQL-created roles are not managed/displayed by the Dashboard and their credentials must be supplied to connecting services through service environment variables.

This resolves the support-guidance question. It does not mean the production change has happened.

The original trigger remains explicit: `ghm_actor_gateway` was deliberately created and assigned as part of the security architecture. The production creator/admin relationship left `ghm_db_user` with ADMIN OPTION membership over it; attempts to revoke the postgres-granted membership did not remove it. The goal is to keep normal application execution unable to administer or undermine the Actor Gateway role. The production inspection at the time showed `SET=false` and `INHERIT=false` for that membership; do not claim that a successful gateway-role escalation was observed.

### Active branch and mainline relationship

- Active construction branch: `construction/auth-issuer-isolation-20261112`.
- Checkpoint before this continuation: `5a871485604df83b89f2fd16dac64a08ff2e668c`.
- This branch contains the newer Authentication Issuer, Actor Gateway, storage metadata gateway, manual issuer cutover/rollback qualification, and database grant-authority work.
- It is not mainline and has no PR attached at this checkpoint.
- PR #272 remains a separate, older integration branch; it is open/unmerged and must not be treated as the current implementation branch.
- The current construction branch comparison against main reported 1,442 commits ahead and 4 behind (diverged). This is a dated Git comparison, not merge readiness. Do not merge, rebase, or stack PR #272 without reconciling the full dependency graph and exact-head CI.

### Gate 1 — source-level database connection consumer inventory

| Consumer | Connection variable / principal | Source finding |
|---|---|---|
| Resource API | `GHM_RUNTIME_DATABASE_URL` → `ghm_runtime` | Production config requires the explicit runtime URL; non-production retains `DATABASE_URL` fallback. Startup checks login/effective identity, role flags, memberships, database CONNECT/CREATE, schema USAGE/CREATE and (when enforced) SECURITY DEFINER function allow-list. |
| Authentication Issuer | `GHM_AUTH_ISSUER_DATABASE_URL` → `ghm_auth_issuer` | Separate process/pool, dedicated principal and signing-key/refresh-pepper custody. Startup checks role identity and an exact ten-function allow-list, direct relation privileges, schema privileges and default function ACLs. |
| Actor Gateway | `GHM_ACTOR_GATEWAY_DATABASE_URL` → `ghm_actor_gateway` | Separate process/pool and dedicated principal. Startup checks identity, role flags, memberships, direct relation privileges, schema privileges and an exact typed-operation function allow-list. |
| Migration runner | `GHM_MIGRATOR_DATABASE_URL` → `ghm_migrator` | Separate pool. Verifies explicit target host/database and migrator identity, then performs `SET ROLE ghm_schema_owner`; migrator has a narrowly scoped SET-only owner path. |
| PayFast callback | `PAYFAST_CALLBACK_DATABASE_URL` → `ghm_payment_provider` | Separate callback process/pool with startup identity check. PayFast remains paused; this is recorded for dependency completeness only and is not to be activated or tested as part of this work. |
| Resource API feature repositories / storage | Shared Resource API `ghm_runtime` pool | These are not separate database logins. Storage's provider credentials are separate object-storage secrets, not another PostgreSQL principal. Storage metadata actor operations now use the Actor Gateway; the five-function storage grant revocation is a manual cutover only and has not been applied to production. |
| Local CI / disposable qualification | Separate test URLs for runtime, issuer, gateway, payment provider and migrator | CI creates disposable PostgreSQL 18 principals. CI success is not evidence that Render production credentials/environment have been changed. |

### Authentication issuer composition finding

The active construction branch includes `src/auth-issuer/server.ts` and the dedicated `GHM_AUTH_ISSUER_DATABASE_URL` connection. The Resource API server composes `createApp({ authRoutesEnabled: false })`, while the issuer process composes the authentication service and persistence with its own pool. This is source-level implementation evidence, not a deployed issuer or live routing cutover.

The existing external client route/proxy contract still has to be preserved across GHM web, Connect and QuoteFlow. Recovery-token delivery is not configured; request routes fail closed with 503. Do not add a paid email provider without approval.

### Qualification harness and environment documentation correction

The read-only `qualify:legacy-role-dependency` harness was stale: it required `DATABASE_URL` and expected the production config to require that generic variable, even though the active Resource API production config requires `GHM_RUNTIME_DATABASE_URL`. The harness now:
- requires the migrator URL;
- requires either the production runtime URL or the non-production fallback to be present for the measured run;
- asserts that production config explicitly requires `GHM_RUNTIME_DATABASE_URL`;
- asserts that the generic `DATABASE_URL` fallback remains non-production-only;
- reports the correct runtime credential mapping.

The root `.env.example` now documents `GHM_RUNTIME_DATABASE_URL` as the production Resource API URL and `DATABASE_URL` as a non-production fallback. No secret values were added.

### Exact-head CI failure found and corrected

The previous construction head `5a871485604df83b89f2fd16dac64a08ff2e668c` had Actions run [43257659768](https://github.com/zaidhqdev-sys/GHM/actions/runs/43257659768):
- `web-quality`: passed.
- `quality`: failed at the Campaign/directory-review signed gateway disposable PostgreSQL qualification.

The failure was not a production database issue. The manual Campaign gateway cutover SQL contained an invalid anonymous DO delimiter (`DO $`), producing PostgreSQL syntax error 42601 when the disposable qualification applied the cutover. The cutover was corrected to use the matching named delimiter `$campaign_allowlist$` for both opening and closing tags.

The follow-on commits also corrected the stale legacy-role qualification harness and `.env.example` runtime variable description. The new branch head after these corrections is `b164be2811ab3f69b9fd7ddd168ede5b7e6d0ac7`. Exact-head CI run [43287305460](https://github.com/zaidhqdev-sys/GHM/actions/runs/43287305460) was in progress when this handover update was prepared. Do not claim the correction is qualified until both `quality` and `web-quality` complete successfully on that exact head.

### Remaining Gate 1 evidence limitations and Gate 2 next work

Source-level connection consumers have been identified, but the following remain unverified:
- Actual current Render environment-variable names and which service consumes each connection URL. Do not retrieve, print, or record secret values.
- Actual live `session_user` / `current_user` for each deployed service after any future credential cutover.
- Whether the dedicated issuer and Actor Gateway have been deployed/configured in Render; repository source is not proof of live service state.
- Current live production grants, object ownership, default ACLs and effective privileges under the production roles. Disposable inventory is not a substitute.
- Whether all service deployment start commands and routing configuration match the repository entrypoints. No Render Blueprint/deployment manifest is present in the repository tree.

Gate 2 must reconcile the full production role graph, direct and transitive memberships, ADMIN/SET/INHERIT options, role settings, database/schema/object ACLs, SECURITY DEFINER function grants, default ACLs, object ownership and all service call paths. Use read-only production catalog evidence only. Keep the existing production backup and Render role-administration blockers in force.

### Transport/TLS issue to preserve

The Resource API and migration runner use `DATABASE_SSL=true` with `rejectUnauthorized:false`; the external gateway and issuer modes also currently permit TLS without certificate identity verification. This encrypts transport but does not authenticate the PostgreSQL server certificate. Do not describe it as fully verified TLS. The deployment topology must select and verify internal versus external connectivity, TLS mode, trusted network boundaries and certificate validation before production rollout.

### Production and operational safety

- No production database roles, memberships, grants, role settings, secrets, environment variables, migrations, deployments, Render services, traffic, or data were changed by this continuation.
- No production cutover or rollback SQL was run.
- No paid infrastructure was created.
- PayFast remains paused.
- The 4 November backup is stale for post-10 November changes; no fresh independently verified backup is established here.
- Do not rotate/delete the Dashboard-managed default user or create the SQL replacement login until the administrator recovery route, role design, object/legacy ownership dependencies, exact service consumers and fresh backup are verified.

### Runtime login design clarification — use the existing SQL-created `ghm_runtime` principal

Render's example `CREATE ROLE ghm_app_user LOGIN ... IN ROLE ghm_runtime` is illustrative, not the right command to copy into this GHM implementation without changing its principal contract.

The active Resource API production configuration requires `GHM_RUNTIME_DATABASE_URL`. Its startup verifier requires `session_user=current_user='ghm_runtime'`, LOGIN/NOINHERIT, no elevated role attributes, and no role memberships in either direction. Therefore a new login such as `ghm_app_user` that is a member of `ghm_runtime` would not satisfy the current verifier: the authenticated/effective identity would be `ghm_app_user`, and it would have a role membership. Do not silently weaken that verifier.

The preferred current design is to use the already-existing SQL-created `ghm_runtime` LOGIN role directly as the Resource API connection identity, provided a fresh read-only privilege/ownership audit confirms its effective permissions and the controlled credential provisioning/reset procedure is qualified. `ghm_runtime` is distinct from the Dashboard-managed `ghm_app_user`; it is the intended application login in the current source and CI role model. The Dashboard-managed `ghm_app_user` remains an administrative-credential transition concern and must not be used by the Resource API.

Only revisit a separate SQL-created application login if there is a deliberate architecture change to support a separate login role plus a privilege role, including explicit changes to startup identity verification, role membership checks, CI, handovers and all consumers. That is not the current implementation contract.

Do not create or alter any production login or membership as part of this clarification.
### Render credential transition refinement — retain Dashboard default administrator

After reconciling Amanda's guidance with the live/source principal contract, the preferred transition does **not** require replacing or deleting the current Dashboard-managed default credential.

Keep the existing Dashboard-managed default user as the controlled database administrator, as Amanda recommended. GHM already has the SQL-created `ghm_runtime` LOGIN role, and the Resource API production configuration/startup verifier requires a direct `session_user=current_user=ghm_runtime` connection with no role memberships. Configure the Resource API with that existing login through `GHM_RUNTIME_DATABASE_URL` after its password/privileges and the service cutover are qualified.

Do not create `ghm_app_user IN ROLE ghm_runtime` as a default solution: that login would not satisfy the current runtime startup identity/no-membership contract. Do not rotate/delete the current Dashboard-managed default user or create a replacement Dashboard administrator merely to achieve runtime separation. Amanda's optional point-2 sequence applies only if we deliberately choose to remove the Dashboard-managed default user; that is not needed for the current design.

Revised safe sequence: (1) retain Dashboard default for administration; (2) read-only qualify existing `ghm_runtime` attributes, memberships, ACLs, ownership and dependencies; (3) use a controlled administrator session to establish/rotate only the `ghm_runtime` credential if needed; (4) configure `GHM_RUNTIME_DATABASE_URL` on Resource API only; (5) verify live `session_user=current_user=ghm_runtime` and startup checks; (6) retain separate Auth Issuer, Actor Gateway and Migrator identities. No production change is authorized by this refinement.
---

## 2026-11-12 continuation — Render catalog verification and administrator membership contract

### Current Render production role graph (fresh read-only query)

Queried the production Render PostgreSQL instance `ghm-db` / `ghm_db` again using read-only catalog SQL. No production changes were made.

Observed connection identity:

```
current_database = ghm_db
session_user     = ghm_app_user
current_user     = ghm_db_user
```

Observed role attributes:

- `ghm_db_user`: LOGIN, INHERIT, CREATEDB, CREATEROLE, non-superuser, no replication, no BYPASSRLS.
- `ghm_app_user`: LOGIN, INHERIT, non-superuser, no CREATEDB/CREATEROLE/replication/BYPASSRLS.
- `ghm_runtime`: LOGIN, NOINHERIT, non-superuser, no elevated attributes.
- `ghm_actor_gateway`: LOGIN, NOINHERIT, non-superuser, no elevated attributes.
- `ghm_migrator`: LOGIN, NOINHERIT, non-superuser, no elevated attributes.
- `ghm_payment_provider`: LOGIN, NOINHERIT, non-superuser, no elevated attributes.
- `ghm_schema_owner`: NOLOGIN, NOINHERIT, non-superuser, no elevated attributes.
- `ghm_auth_issuer`: **not present** in the current production role catalog; its creation/provisioning has not occurred.

Observed relevant memberships:

- `ghm_db_user` is a member of `ghm_actor_gateway` with `ADMIN OPTION=true`, `SET=false`, `INHERIT=false`, grantor `postgres`.
- `ghm_db_user` is a member of `ghm_runtime` with the original postgres-granted `ADMIN OPTION=true`, `SET=false`, `INHERIT=false` membership and a second membership granted by `ghm_db_user` with `SET=true`, `INHERIT=true`.
- `ghm_db_user` is also a member of `ghm_migrator`, `ghm_payment_provider`, and `ghm_schema_owner` with `ADMIN OPTION=true`, `SET=false`, `INHERIT=false` postgres-granted memberships.
- `ghm_migrator` is a member of `ghm_schema_owner` with `ADMIN OPTION=false`, `SET=true`, `INHERIT=false`.
- `ghm_app_user` has a role-level setting `role=ghm_db_user` and a SET/INHERIT membership in `ghm_db_user`.

Read-only `pg_has_role` checks confirmed:

- `ghm_db_user` can SET ROLE `ghm_runtime`.
- `ghm_db_user` currently cannot SET ROLE `ghm_actor_gateway` (`SET=false`), despite having ADMIN OPTION membership.
- `ghm_runtime` cannot SET ROLE `ghm_actor_gateway` and has no membership in Actor Gateway, Migrator or Schema Owner.

Therefore the production problem is the administrative default connection being used as the effective application identity, not evidence that `ghm_runtime` can currently assume Actor Gateway. The intended transition is to keep the Dashboard-managed default administrator for controlled administration and use the existing SQL-created `ghm_runtime` login directly for the Resource API.

### Why the previous startup membership checks were incompatible with Render

The earlier runtime, Actor Gateway and Authentication Issuer startup checks rejected any membership in either direction. That would reject the production roles because Render/PostgreSQL creates a trusted membership from the administrator (`ghm_db_user`) back to SQL-created service roles. It would prevent the current `ghm_runtime` and `ghm_actor_gateway` identities from passing startup in the real Render environment even though those service logins themselves are not members of other roles.

Corrected the service identity contract to `no_untrusted_role_memberships`:

- The service login itself must not be a member of any other role (`pg_auth_members.member = service_role` is rejected).
- The only role permitted to be a member of the service login role is the trusted Render database administrator `ghm_db_user`.
- Any other member of the service role causes startup rejection.
- The service's own elevated attributes remain rejected, and its exact function/direct-object privilege checks remain unchanged.

Applied this contract to Resource API runtime, Actor Gateway and Authentication Issuer startup checks, principal tests, startup SQL contract tests and principal qualification scripts. The manual Authentication Issuer privilege cutover now uses the same administrator-only membership exception; it will reject any member other than `ghm_db_user` and any membership where the service role itself is a member of another role.

The migrator boundary is intentionally different: `ghm_migrator` must have exactly one direct membership, the SET-only/non-inheritable `ghm_schema_owner` path. Added checks that only `ghm_db_user` may be a member of `ghm_migrator`, and only `ghm_db_user` and `ghm_migrator` may be members of `ghm_schema_owner`.

Fresh production catalog counts match this stricter migrator contract:

```
migrator_direct_membership_count       = 1
migrator_untrusted_member_count        = 0
schema_owner_direct_membership_count   = 0
schema_owner_untrusted_member_count    = 0
```

### Render service inventory (read-only)

Fresh Render service listing shows:

- `ghm-internal-runtime` is the only current production GHM web service. It is on `main`, has auto-deploy OFF, and currently starts with `npm start`.
- No separately deployed production Authentication Issuer service is present.
- No separately deployed production Actor Gateway service is present.
- `ghm-identity-qualification` remains an older qualification service; do not treat it as production target.
- `ghm-payfast-sandbox-runtime` and `ghm-payfast-callback-sandbox` remain legacy sandbox services; PayFast remains paused and is excluded from this work.

Repository source separation is therefore not yet a deployed service topology. The Actor Gateway and Authentication Issuer service creation/deployment, private routing, credentials, and service-level health verification remain cutover blockers. No Render service or environment variable was changed.

### Runtime function EXECUTE allow-list staged-state gap closed in source

The Resource API runtime function verifier previously accepted only the 43-function pre-cutover state and 40-function post-Campaign/review state. A fresh disposable PostgreSQL inventory showed that the already-applied registration-identity gateway migrations also revoke two legacy registration functions from `ghm_runtime`; those two signatures must never be re-accepted in a later runtime state. The Authentication Issuer cutover removes fourteen runtime authentication lifecycle functions, leaving only the two separately reviewed external identity/business mapping lookups. The old verifier would reject the valid post-issuer state once production enforcement was enabled.

Added four exact reviewed states:

- 41 functions: post-registration gateway migrations, pre-Campaign/review and pre-issuer.
- 38 functions: post-registration gateway migrations plus Campaign/review cutover.
- 27 functions: post-registration gateway migrations plus issuer cutover only.
- 24 functions: combined registration, Campaign/review and issuer cutovers.

Added unit tests for all four states and adversarial added/missing grants. The disposable Authentication Issuer cutover qualification now invokes the actual Resource API runtime startup allow-list verifier after the earlier Campaign/review cutover, proving the combined 26-function state.

### Campaign manual cutover transaction defect and correction

The Campaign/review manual cutover artifact had accidentally duplicated its transaction body. It contained an internal `COMMIT;DO $$` between the first and second copy. The qualification harness had also used an over-escaped transaction-stripping regular expression, so the nested transaction wrapper remained. This committed the outer `SET LOCAL ROLE ghm_schema_owner` transaction before the second DO block, causing the subsequent block to execute as `ghm_migrator` and fail with `permission denied for schema ghm`.

Corrected the artifact to one transaction with one operator guard, one idempotent operation-allow-list extension, one set of wrapper definitions/grants/revokes and one final COMMIT. Corrected the qualification regex to strip the outer BEGIN/COMMIT wrappers correctly and added an explicit assertion that the manual cutover runs as `session_user=ghm_migrator`, `current_user=ghm_schema_owner`, with schema USAGE and CREATE.

### Current exact-head CI checkpoint

- Earlier failures are preserved as evidence: run `43257659768` exposed the malformed DO delimiter; later run `43289350381` exposed the duplicate transaction/COMMIT issue; run `43291439716` exposed stale principal qualification expecting the old `no_role_memberships` field.
- The corresponding source, script, SQL and test corrections are now on `construction/auth-issuer-isolation-20261112`.
- Exact current checkpoint at this handover append: commit `d2a619c3bfd037b7e165ccceb6a01e204de91ec7`; run `43291959904` has `web-quality` passed and `quality` still in progress.
- Do not claim exact-head CI passed until the `quality` job and the combined issuer/runtime cutover qualification complete successfully on the latest branch HEAD.

### Production safety

No production role, membership, grant, role setting, credential, environment variable, service, migration, deployment, traffic or data was changed. The Render queries were read-only. The Dashboard administrator remains the current default; the Resource API is not yet cut over to `GHM_RUNTIME_DATABASE_URL`. No fresh independently verified production backup has been established in this continuation. PayFast remains paused.

---

## 2026-11-12 continuation — Render support confirmation and fresh production role verification

**Continuation:** after Amanda's final Render support confirmation at 18:46 UTC, the source-level connection inventory and production role graph were rechecked. All database queries in this addendum were read-only. No production changes were made.

### Render support decision is now confirmed

Amanda explicitly recommended moving normal application execution to SQL-created login role(s) outside the Dashboard-managed credential list. The Dashboard-managed default credential should remain for controlled administration.

The original reason for this support discussion remains the deliberately created `ghm_actor_gateway` role and the subsequent attempt to resolve/revoke its creator/admin membership. Render's explanation is that PostgreSQL 16+ automatically grants the creating CREATEROLE role ADMIN OPTION membership in roles it creates; the grant is recorded as coming from `postgres`, and Render cannot revoke it for us. Amanda confirmed that SQL-created application/service logins are the supported route.

The implementation decision is refined to use the **existing SQL-created `ghm_runtime` LOGIN directly** for Resource API execution. Do not create `ghm_app_user IN ROLE ghm_runtime` as a default solution. Keep the current Dashboard-managed default credential for administration; do not rotate/delete it just to achieve runtime separation.

### Fresh read-only production membership verification

A new catalog query against Render `ghm-db` / `ghm_db` reconfirmed these relevant memberships:

| Granted role | Member role | Grantor | ADMIN | INHERIT | SET |
|---|---|---|---:|---:|---:|
| `ghm_actor_gateway` | `ghm_db_user` | `postgres` | true | false | false |
| `ghm_migrator` | `ghm_db_user` | `postgres` | true | false | false |
| `ghm_runtime` | `ghm_db_user` | `ghm_db_user` | false | true | true |
| `ghm_runtime` | `ghm_db_user` | `postgres` | true | false | false |
| `ghm_schema_owner` | `ghm_db_user` | `postgres` | true | false | false |
| `ghm_schema_owner` | `ghm_migrator` | `ghm_db_user` | false | false | true |

Fresh `pg_has_role` checks reconfirmed:

- `ghm_runtime` cannot SET ROLE `ghm_db_user`, `ghm_schema_owner`, `ghm_migrator`, or `ghm_actor_gateway`.
- `ghm_actor_gateway` cannot SET ROLE `ghm_db_user`, `ghm_schema_owner`, or `ghm_migrator`.
- `ghm_db_user` can SET ROLE `ghm_runtime` due to its explicit SET-enabled membership. This is an administrator-to-runtime path, not a runtime-to-administrator path.
- `ghm_db_user` currently cannot SET ROLE `ghm_actor_gateway`; the automatic ADMIN OPTION membership currently has SET=false and INHERIT=false.

This is consistent with the intended distinction: the trusted administrator can manage/assume service roles, while the service logins themselves must not be members of administrator, migrator, schema-owner or other privileged roles. Do not misstate the ADMIN OPTION membership as proof that a successful Actor Gateway escalation has occurred.

### Resource API / Actor Gateway / Issuer / Migrator connection inventory

The current construction branch source uses distinct connections:

| Consumer | Environment variable | Required login | Live production status |
|---|---|---|---|
| Resource API | `GHM_RUNTIME_DATABASE_URL` | `ghm_runtime` | Not yet cut over; Render service environment was not changed |
| Authentication Issuer | `GHM_AUTH_ISSUER_DATABASE_URL` | `ghm_auth_issuer` | Role absent from production catalog; no deployed issuer service |
| Actor Gateway | `GHM_ACTOR_GATEWAY_DATABASE_URL` | `ghm_actor_gateway` | Role exists; no deployed dedicated gateway service |
| Migration runner | `GHM_MIGRATOR_DATABASE_URL` | `ghm_migrator` | Separate source/configured migration identity; production execution remains gated |
| PayFast callback | `PAYFAST_CALLBACK_DATABASE_URL` | `ghm_payment_provider` | Legacy sandbox service only; PayFast remains paused and excluded |

Resource API production config requires `GHM_RUNTIME_DATABASE_URL`; generic `DATABASE_URL` is a non-production fallback only. The migration runner requires `GHM_MIGRATOR_DATABASE_URL` and enters `ghm_schema_owner` through its narrowly scoped SET-only membership. Auth Issuer and Actor Gateway each have separate pools and startup identity/privilege checks.

Fresh Render service listing confirmed that `ghm-internal-runtime` is the only production GHM web service, on `main`, with auto-deploy OFF. No dedicated production Auth Issuer or Actor Gateway service exists. The older identity qualification and PayFast sandbox services are not production targets.

The Render service metadata action did not expose the service's environment-variable names. No secret values were requested, displayed or recorded. Therefore the live value/presence of `GHM_RUNTIME_DATABASE_URL` and all other service environment variables remains unverified. Repository source/config is not evidence that the deployed service has adopted those variables.

### Runtime role membership guard compatibility

The current construction branch has corrected the earlier over-broad `no_role_memberships` check to `no_untrusted_role_memberships` for Resource API, Actor Gateway and Auth Issuer. The accepted service-role membership model is:

- The service login itself must not be a member of any other role.
- The only role permitted to be a member of a service login role is the trusted Render administrator `ghm_db_user`.
- Any other member of the service login role is rejected.
- Elevated attributes, database/schema privileges, direct relation privileges and exact function allow-lists remain independently checked.
- Migrator has its own stricter contract: exactly the schema-owner SET-only path; only `ghm_db_user` may be a member of `ghm_migrator`; only `ghm_db_user` and `ghm_migrator` may be members of `ghm_schema_owner`.

This is the Render-compatible distinction required by Amanda's explanation. Do not revert to rejecting every membership in both directions; that would reject the administrator's trusted automatic membership in SQL-created service roles.

### CI checkpoint and current source reconciliation

The previously recorded Actions run `43291959904` completed with:
- `web-quality`: passed.
- `quality`: failed in `qualify:campaign-directory-review-gateway` at the Resource API runtime function EXECUTE allow-list check.

The failure log showed the qualification harness expecting the older 43/40 runtime function states, while the current inspected source `src/db/runtime-database-privileges.ts` now defines the corrected 41/38/27/24 states that account for the two registration-identity grants already revoked by the earlier gateway migrations. The failed run is therefore evidence of a stale qualification state at that run's source head; it is **not** a passing qualification of the current source. The current corrected source still requires exact-head CI and disposable PostgreSQL requalification. Do not claim it passes until that run completes.

### Gate 1 disposition

**Source-level connection inventory: COMPLETE.** All five service/migration connection consumers and their intended principals are identified.

**Live Render environment-variable mapping: NOT VERIFIED.** Do not read, print or record secret values. Before any future cutover, verify only the presence/name mapping through an approved safe mechanism and then verify actual `session_user=current_user` at service startup.

**Production role graph: READ-ONLY RECONFIRMED.** The role graph and membership options above match the intended separation design, but no role, membership or credential change is authorized.

### Next work

1. Verify exact current construction-branch HEAD and rerun/inspect CI against that exact SHA, including the corrected 41/38/27/24 runtime function states.
2. Finish the whole-database direct EXECUTE grant-by-grant purpose/call-site review, including the remaining runtime storage and Connect replay grants.
3. Resolve the migrator's extra direct mapping lookup grant by tracing every caller; do not revoke it without evidence and forward-only disposable qualification.
4. Complete production object ownership, database/schema/table/sequence/function ACL, default ACL and legacy-object reconciliation from fresh read-only catalog evidence.
5. Obtain a fresh independently verified production backup before any production role/privilege/migration/deployment action. The 4 November backup remains stale.
6. Keep the Dashboard administrator, current production credentials, roles, grants, service configuration, migrations and deployment unchanged until all gates are complete.

**No production role, membership, grant, credential, environment variable, migration, service, deployment, traffic or data was changed in this continuation. PayFast remains paused.**


---

## 2026-11-12 continuation — production database/object ACL and SECURITY DEFINER snapshot

**Evidence source:** fresh read-only catalog queries against Render `ghm-db` / `ghm_db` / PostgreSQL 18.  
**Mutation:** none. All queries were read-only.  
**Important:** this is a snapshot of the live production catalog, which currently reflects an older schema/security state than the unmerged `construction/auth-issuer-isolation-20261112` branch. Do not assume construction migrations or cutovers are present in production.

### Database and schema ownership / ACL

- Database `ghm_db` is owned by `ghm_schema_owner`.
- Database ACL observed: PUBLIC has TEMP and CONNECT; `ghm_schema_owner` has CREATE/TEMP/CONNECT; `ghm_runtime` has CONNECT only.
- Schema `ghm` is owned by `ghm_schema_owner`; `ghm_runtime` and `ghm_payment_provider` have USAGE only; no CREATE grant to either was observed.
- Schema `public` is owned by `ghm_db_user`; PUBLIC has USAGE only; `ghm_db_user` has USAGE/CREATE.
- No additional non-system application schema was returned by the schema ACL query.

### Object ownership

The production relation inventory (indexes included in their own relkind count) showed:

| Schema | Object kind | Owner | Count |
|---|---|---|---:|
| `ghm` | sequences | `ghm_schema_owner` | 48 |
| `ghm` | indexes | `ghm_schema_owner` | 214 |
| `ghm` | tables | `ghm_schema_owner` | 59 |
| `ghm` | views | `ghm_schema_owner` | 1 |
| `public` | sequences | `ghm_db_user` | 5 |
| `public` | indexes | `ghm_db_user` | 10 |
| `public` | tables | `ghm_db_user` | 5 |

The 5 legacy public tables and their ownership remain a separate legacy-object/data-disposition gate; this snapshot does not authorize moving or dropping them.

### Production Resource API direct object privileges

The current production `ghm_runtime` role has direct ACL entries on 39 `ghm` relations and 49 sequences. The relation grants include:

- Direct SELECT on authentication-sensitive tables including `account_identity`, `account_external_identity`, and `authentication_session`.
- Direct INSERT on `business` and `business_membership`.
- Direct INSERT/UPDATE on `opportunity`.
- Direct DELETE on `opportunity_capability_requirement`.
- SELECT on the other business, commercial, campaign, customer, enquiry, notification, project, quote, review, saved-business, support and trust relations listed in the live query.
- Sequence grants are predominantly USAGE; selected sequences also expose SELECT.

This is a production snapshot, not a claim that these grants match the current construction branch. In particular, the current construction branch's issuer/storage cutover plans must not be assumed applied to this catalog. The exact per-object ACL list was captured during the read-only query; re-query before any future cutover and compare it with the latest source/allow-list.

### Production SECURITY DEFINER inventory and direct EXECUTE counts

The live production `ghm` schema returned 78 routines, all owned by `ghm_schema_owner`; 63 are SECURITY DEFINER.

Effective callable SECURITY DEFINER counts by role at this snapshot:

| Role | SECURITY DEFINER routines executable |
|---|---:|
| `ghm_runtime` | 46 |
| `ghm_actor_gateway` | 0 |
| `ghm_migrator` | 2 |
| `ghm_payment_provider` | 2 |
| `ghm_db_user` | 46 |

The 46 runtime SECURITY DEFINER routines include legacy authentication lifecycle/identity link functions, direct Business registration identity functions, Campaign and directory-review functions, storage metadata functions, Business Capability/Hours/Trust/Logo operations and other operations. The live signatures/grantees were enumerated from `pg_proc` and `aclexplode`; do not substitute the disposable 41/38/27/24 allow-list or the construction branch's future gateway operation set for this production state.

No PUBLIC EXECUTE grants were found on SECURITY DEFINER routines in `ghm`. The PUBLIC EXECUTE entries found in the schema belonged to ordinary non-SECURITY-DEFINER trigger/helper functions, not SECURITY DEFINER routines. This does not replace a full cross-schema whole-database inventory.

### Production default privileges

The only relevant default ACL row returned for `ghm_schema_owner`, `ghm_db_user` or `ghm_migrator` was:

- owner `ghm_schema_owner`, schema `ghm`, object type sequence: USAGE to `ghm_runtime`.

No function default ACL row for PUBLIC or runtime was returned in this query. Recheck all default ACLs and the effective privileges they produce as part of the final pre-cutover capture.

### Material differences from construction branch

The live production catalog is not yet at the construction branch's intended state:

- Production has no `ghm_auth_issuer` role; the construction branch expects a dedicated `ghm_auth_issuer` login.
- Production `ghm_actor_gateway` exists but currently has no SECURITY DEFINER EXECUTE grants (effective count 0); construction branch gateway expects a 30-operation allow-list in its disposable pre/post staged states.
- Production `ghm_runtime` can execute 46 SECURITY DEFINER routines and has broad direct relation/sequence ACLs. Construction branch CI inventory is a separate disposable database and its current runtime allow-list states are 41/38/27/24; these counts are not production evidence.
- Production still has direct runtime execution on legacy auth, registration, Campaign/review and storage functions that the construction branch plans to revoke manually or through separately staged cutovers.
- Production Actor Gateway role is not a deployed gateway service. The current Render service inventory contains only `ghm-internal-runtime` as the production GHM web service.

**Disposition:** production role/object/function ACL reconciliation remains OPEN. The live inventory is now more concrete, but every one of the 46 runtime SECURITY DEFINER grants and 39 relation/49 sequence grants still needs signature/object-level call-site and necessity reconciliation against the intended deployment state. Do not apply any construction cutover based on CI-only evidence.

### Next read-only reconciliation work

1. Export a complete per-signature production EXECUTE matrix for every application role, including ACL grantor, grant option and PUBLIC entries, and reconcile each entry with its current production caller.
2. Trace the 46 runtime SECURITY DEFINER routines to current Resource API/legacy service call sites and distinguish required current production grants from target gateway/issuer cutovers.
3. Reconcile all 39 relation and 49 sequence runtime grants against repository source, including the direct auth table SELECTs and direct Business/Opportunity DML.
4. Inspect all table/sequence ownership, foreign keys, views, triggers, function owners, search_path settings, extensions, languages and default privileges across all non-system schemas.
5. Preserve the five legacy `public` tables/rows until their existing disposition/recovery gate is satisfied.
6. Obtain a fresh independently verified production backup before any privilege or schema cutover. The 4 November backup remains stale.

**No production roles, memberships, grants, ownership, credentials, secrets, migrations, Render environment, services, deployment, traffic or data were changed.**
