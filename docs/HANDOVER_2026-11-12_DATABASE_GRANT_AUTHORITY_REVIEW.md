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


---

## 2026-11-12 continuation — production runtime DML reconciliation and SECURITY DEFINER search_path audit

**Evidence:** read-only Render PostgreSQL 18 catalog queries plus source inspection on the open unified Actor Gateway integration PR branch `integration/capability-gateway-qualification-20261110`.  
**Production mutation:** none.

### Whole non-system routine inventory / SECURITY DEFINER search_path

The cross-schema routine query returned only the application schema `ghm` (78 routines; 63 SECURITY DEFINER). No routines were returned in `public` or another non-system schema.

All 63 production SECURITY DEFINER routines have an explicit function-level `search_path` setting (`proconfig`); none is missing a pinned function-level search_path. Every one is owned by `ghm_schema_owner`. The observed paths are schema-qualified and place `pg_temp` last where it is included. This closes the specific live production gap of an unpinned SECURITY DEFINER search_path for the current `ghm` inventory; it does not replace source-body review for dynamic SQL, unsafe object resolution, or function-level authorization.

No PUBLIC EXECUTE grants were found on any production SECURITY DEFINER routine in `ghm`. PUBLIC EXECUTE grants observed in the schema belong to ordinary non-SECURITY-DEFINER trigger/helper functions.

### Exact production runtime direct DML privileges

A new effective privilege check confirmed `ghm_runtime` and the current effective production administrator session `ghm_db_user` both resolve the same inherited runtime table privileges for these objects:

| Object | Runtime direct privilege(s) | Source callsite / current disposition |
|---|---|---|
| `ghm.business` | INSERT, SELECT | `src/resources/business-identity/repository.ts:createBusinessInTransaction` creates Business directly |
| `ghm.business_membership` | INSERT, SELECT | same method inserts initial owner membership |
| `ghm.opportunity` | INSERT, SELECT, UPDATE | `src/resources/opportunity/repository.ts` creates/updates opportunities directly; `src/resources/project/repository.ts:createProject` creates its linked Opportunity directly |
| `ghm.opportunity_capability_requirement` | DELETE, SELECT | DELETE grant has not yet been mapped to a live repository callsite; remains an explicit unresolved least-privilege item |
| `ghm.account_identity` | SELECT only | source `PostgresBusinessIdentityRepository.updateAccount` issues direct UPDATE, but production runtime has no UPDATE privilege |

The exact direct DML grants have no grant option. The other 35 relation ACL entries are SELECT-only; all 49 runtime sequence ACL entries are USAGE, with SELECT additionally present on a subset of sequences. The complete object list was captured in the preceding production inventory section and re-query before any change.

### Newly confirmed source/ACL mismatch: account profile UPDATE

`src/resources/business-identity/repository.ts` includes `PostgresBusinessIdentityRepository.updateAccount`, which executes:

`UPDATE ghm.account_identity SET full_name=..., phone=..., avatar_ref=... WHERE id=$1`

The live production ACL grants `ghm_runtime` only SELECT on `ghm.account_identity`; the effective `has_table_privilege(...,'UPDATE')` check is false for both `ghm_runtime` and `ghm_db_user`. Therefore this direct UPDATE cannot succeed under either the intended runtime login or the currently effective production role, absent some other execution context not evidenced by the inspected code. This is a source/production ACL contract defect or stale/unreachable path that must be resolved before the runtime credential cutover. Do not solve it by granting broad UPDATE on the whole account table; first trace the route/callers and define a narrow authenticated operation (likely a dedicated SECURITY DEFINER function or an appropriately scoped gateway operation) with tests and an exact ACL contract.

### Business and Opportunity direct DML implications

The existing Business creation flow is still direct Resource API DML for Business INSERT and owner-membership INSERT. The existing Opportunity repository performs direct Opportunity INSERT/UPDATE and the Project repository atomically creates a linked Opportunity + participant + Project with direct DML. These are currently represented in the live runtime ACL and are not replaced by the Business profile / registration / supplier / capability gateway routes.

This means those direct grants cannot be revoked as a side effect of the Actor Gateway work without first replacing the flows and their transaction semantics. In particular, Project + Opportunity atomicity must be preserved if that flow is moved to a gateway or a dedicated database function. No cutover migration for these direct DML grants is authorized by this finding.

The `opportunity_capability_requirement` DELETE grant has not been tied to a source callsite in this pass. It may be legacy residue, but do not revoke until every repository, route, maintenance job, trigger interaction and product workflow has been checked.

### Disposition

- **SECURITY DEFINER search_path:** production inventory passed the pinned-setting check (63/63).
- **PUBLIC EXECUTE on SECURITY DEFINER:** none found in production `ghm`.
- **Business create / owner membership direct DML:** mapped; remains a live direct-DML boundary.
- **Opportunity create/update and Project-linked Opportunity DML:** mapped; remains a live direct-DML boundary.
- **Account identity profile UPDATE:** confirmed source/ACL mismatch; needs caller tracing and a narrow replacement/contract correction.
- **Opportunity capability requirement DELETE:** unresolved; keep grant and investigate.
- **Production runtime direct DML scope:** not ready for blanket revocation.

### Next work

1. Trace the `updateAccount` route and test coverage; determine whether it is reachable and currently broken in production, then design the smallest authenticated SQL/gateway operation without broad account table UPDATE.
2. Find all `opportunity_capability_requirement` DELETE callsites and confirm whether the grant is required or obsolete.
3. Inspect Project, Opportunity and Business create/update route authorization and tests, then define the migration path for their direct DML while preserving atomic Project↔Opportunity semantics.
4. Continue exact function-by-function mapping of the remaining production `ghm_runtime` SECURITY DEFINER grants, especially storage metadata and the remaining legacy auth entry points.
5. Re-run the same read-only production catalog queries immediately before any future cutover; production remains on the older ACL state until an approved migration is applied after a fresh verified backup.

**No production role, grant, ownership, credential, secret, environment variable, migration, deployment, application data or service was changed.**


---

## 2026-11-12 continuation — account profile reachability and unexplained Opportunity DELETE grant

**Evidence:** source inspection on `integration/capability-gateway-qualification-20261110` and fresh read-only Render PostgreSQL 18 catalog queries against production `ghm_db`.  
**Mutation:** none.

### Account profile UPDATE: method exists, HTTP route does not

The earlier finding needs a reachability correction.

- `PostgresBusinessIdentityRepository.updateAccount` issues a direct UPDATE against `ghm.account_identity`.
- `BusinessIdentityServiceImpl.updateOwnProfile` delegates to that repository method.
- The inspected Resource API `src/http/app.ts` registers `GET /api/v1/profile` and calls `service.getOwnProfile`.
- No `PATCH /api/v1/profile`, `PUT /api/v1/profile`, `updateOwnProfile`, or `updateAccount` HTTP route/callsite was found in the inspected `src/http/app.ts`.
- The service method and repository method therefore appear currently unreachable through the inspected HTTP API. This is not evidence that a live production profile-update endpoint is broken; it is an unused/dead repository capability with an SQL statement that would fail under the current runtime ACL if called.

Production effective privileges were rechecked: `ghm_runtime` has SELECT but not UPDATE on `ghm.account_identity`. Do not grant table UPDATE to support an endpoint that is not currently registered. If profile editing becomes a product requirement, implement an explicit authenticated route and narrow database operation (or gateway operation) together with tests and a privilege contract. Until then, track this as dead/unreachable code and remove or isolate it in a separately qualified source change rather than silently expanding production privileges.

### Opportunity capability requirement DELETE: no current caller found in the inspected application surface

A production ACL/grantor query confirmed:

- Object: `ghm.opportunity_capability_requirement`
- Grantee: `ghm_runtime`
- Privileges: SELECT and DELETE
- Grantor: `ghm_schema_owner`
- Grant option: false

The full production `ghm` routine-body scan found no function whose `prosrc` references `opportunity_capability_requirement`. The table has one non-internal trigger, `opportunity_capability_requirement_updated_at`, invoking ordinary trigger function `ghm.touch_opportunity_capability_requirement()`; no trigger-based DELETE requirement was identified.

The inspected `src/resources/opportunity/repository.ts` reads this table to return capability requirements but contains no DELETE statement. The inspected Project repository also contained no delete path for this table. The source search performed in this pass did not find an application callsite for DELETE. The grant is therefore a strong candidate for legacy/stale privilege, but the review has not yet exhaustively covered every repository, background script, maintenance path, or product integration.

**Decision:** do not revoke it yet. Complete the full repository/background-job/SQL migration search and confirm no operational consumer; then remove the direct DELETE grant in a forward-only disposable-qualified migration, with an explicit negative privilege assertion and all relevant integration tests.

### Complete non-SELECT runtime object privilege snapshot

A fresh ACL query enumerated every direct `ghm_runtime` object privilege other than SELECT in production `ghm`. The only relation DML grants are:

| Relation | Direct privilege(s) | Current disposition |
|---|---|---|
| `business` | INSERT | Required by current direct Business creation path |
| `business_membership` | INSERT | Required by current direct owner-membership creation path |
| `opportunity` | INSERT, UPDATE | Required by current direct Opportunity and Project-linked Opportunity paths |
| `opportunity_capability_requirement` | DELETE | Unmapped; likely legacy, retain pending exhaustive caller check |

No relation UPDATE grant exists on `account_identity`. All 49 direct runtime sequence privileges are USAGE (some also SELECT); none has grant option. Every listed direct relation DML privilege is granted by `ghm_schema_owner` without grant option.

This narrows the direct DML review substantially: the four relation entries above account for the non-SELECT relation DML observed for `ghm_runtime`; the remaining relation grants are read-only. Sequence USAGE is not table-write authority and must be reviewed separately against insert paths/sequence usage.

### Updated disposition

- Account profile UPDATE: source method exists but route/caller absent from inspected HTTP app; no production grant should be added.
- Opportunity capability requirement DELETE: production grant verified, no current app repository or SECURITY DEFINER function caller found in inspected surfaces; remains unproven stale and must not yet be revoked.
- Business INSERT / membership INSERT: mapped to direct create flow; required until replaced.
- Opportunity INSERT / UPDATE: mapped to direct Opportunity and Project creation/update; required until replaced with transactionally equivalent operations.
- Production direct relation DML surface is now reduced to the four entries above; all other direct runtime relation privileges in the captured inventory are SELECT.

### Next work

1. Expand the DELETE caller search to all repository files, jobs, maintenance scripts, migrations, and connected application integration paths. If none exists, prepare a forward-only disposable qualification for revoking only `DELETE ON ghm.opportunity_capability_requirement`.
2. Review all INSERT/UPDATE callers and route authorization for Business, Opportunity and Project; preserve Project↔Opportunity atomicity.
3. Continue function-by-function source mapping for all 46 production runtime SECURITY DEFINER grants, keeping current production and target construction branch ACL states separate.
4. Continue storage metadata and legacy authentication boundary reconciliation.
5. No production changes until the current source/ACL plan is fully qualified and a fresh verified production backup exists.

**No production grants, roles, ownership, credentials, environment variables, migrations, deployment, service configuration or application data were changed.**


---

## 2026-11-12 continuation — registration cutover startup-allowlist mismatch and correction

**Work branch:** `construction/auth-issuer-isolation-20261112`.  
**Scope:** continue production-to-source grant-authority audit; preserve all prior evidence and do not merge or mutate production.

### Exact-head CI failure found and classified

The prior documentation head `85d74a31f4ba08b7876b4b3c392529619d60f003` ran CI `43297432850`:

- `web-quality`: passed.
- `quality`: failed at `Qualify isolated actor gateway database principal`, before storage, the main test suite and later disposable cutover jobs could run.
- The failing step's initial runtime exact EXECUTE allow-list assertion saw 43 SECURITY DEFINER signatures, while the code's expected pre-cutover state contained 41.
- The two extra actual signatures were:
  - `ghm.read_business_registration_identity(bigint,bigint)`
  - `ghm.update_business_registration_identity(bigint,bigint,text,text,text)`

This is explained by the manual-only registration identity revocation file `database/cutovers/20261111020000_revoke_legacy_registration_identity_runtime.sql`: the functions are intentionally still granted to `ghm_runtime` before that cutover is applied. The allow-list had incorrectly omitted them from every stage, even though the cutover is deliberately not part of automatic migrations. The runtime qualification asserts its baseline before applying that manual cutover, so its baseline must include both functions.

### Correction committed

Updated `src/db/runtime-database-privileges.ts` to model all eight independently reviewed combinations of the three manual cutovers:
- Campaign/directory-review (3 signatures)
- Authentication Issuer (14 signatures)
- Registration identity (2 signatures)

The exact expected counts are now:
- Baseline: 43
- Campaign only: 40
- Issuer only: 29
- Campaign + Issuer: 26
- Registration only: 41
- Campaign + Registration: 38
- Issuer + Registration: 27
- Campaign + Issuer + Registration: 24

Updated `src/db/runtime-database-privileges.test.ts` to assert all eight stages, reject unexpected/missing grants in every stage, and explicitly prove the two registration identity functions are accepted only before the registration cutover.

Commits:
- Allow-list implementation: `9550eb3f0f55bdb1602f797b96413216798c0861`
- Stage contract tests: `36eb11308966f8618000bb22e4d51b30da9f8ce2`

**Validation status:** these commits were pushed and the exact latest head's CI must be checked before claiming the correction passes. Do not treat the previous failing CI as a passing result or infer a pass from source changes.

### Storage finding correction / existing qualification confirmed

During this continuation, the dedicated `docs/HANDOVER_2026-11-12_STORAGE_METADATA_GATEWAY.md` was read before further storage work. It confirms that the storage database actor/provider boundary is already source-remediated and disposable-qualified; my immediately preceding conversational statement that this was a newly discovered unremediated storage flaw was incorrect and is superseded.

The existing construction branch already contains:
- Actor-signed v2 assertions for create, read and deletion-pending.
- Separate Resource API HMAC provider attestations for mark-available and mark-deleted, verified by PostgreSQL.
- Five replacement `gateway_storage_*` SECURITY DEFINER wrappers.
- Cross-business/member/disabled actor, context substitution, nonce replay, provider signature/expiry/context and lifecycle-state qualification.
- A localhost-only disposable rehearsal that revokes the five legacy storage functions from PUBLIC, runtime, migrator and Actor Gateway, proves direct calls denied and replacement wrapper grants preserved, then restores original ACLs exactly.
- A separate public metadata read guard requiring `status='available'` for the public Business Logo exception.

This storage work is not a new implementation task. The remaining storage gates are production grant cutover after backup/role/deployment gates, and a full deployed non-production Resource API ↔ Actor Gateway ↔ PostgreSQL ↔ external-provider journey against a dedicated non-production bucket. The existing `zaid-ghm-production` bucket must not be used for further mutation tests.

### Next actions

1. Check the latest exact-head CI for `36eb11308966f8618000bb22e4d51b30da9f8ce2` (or a newer head), inspect any failure logs and correct the actual issue.
2. Continue mapping production SECURITY DEFINER EXECUTE grants by source caller and compare production's live catalog with construction/disposable stages without conflating them.
3. Review the two legacy Connect external mapping/replay functions, including the migrator's explicitly granted mapping lookup, against current consumers.
4. Complete the full source/SQL/migration/job search for `opportunity_capability_requirement` DELETE before considering a forward-only revocation.
5. Preserve all manual cutover files as manual-only; do not apply them to production. Fresh verified production backup, supported Render role model, and approved service/network/rollback plan remain prerequisites.
6. Continue appending every material finding, correction, CI result and production mutation status to this handover and the corresponding specialist handover.

**Production state:** no production role, grant, credential, secret, environment variable, migration, service, deployment, storage bucket/object or application data was changed. No PR was merged. PayFast remains paused.


---

## Correction — `opportunity_capability_requirement` DELETE grant is intentional and required

The prior entry describing the production DELETE grant as an unmapped likely-stale privilege is superseded by a deeper source trace completed after inspecting the dedicated Opportunity Requirements domain.

### Actual caller found

`src/resources/opportunity-requirements/repository.ts` implements `PgOpportunityRequirementsRepository.replaceOpportunityRequirements`. Within one `withAuthorizedTransaction`, it:

1. Calls `assertOpportunityManager` for the authenticated creator or active owner/administrator of the owner Business.
2. Validates all requested Capability IDs are active and selectable.
3. Deletes the existing requirement set for that Opportunity:
   `DELETE FROM ghm.opportunity_capability_requirement WHERE opportunity_id = $1`.
4. Inserts the complete replacement set with server-derived `created_by`.
5. Returns the canonical ordered set.

The DELETE and all inserts share the same transaction, so a failure rolls the entire replacement back. The HTTP contract exposes complete replacement via `PUT /api/v1/opportunities/:opportunityId/requirements`; it does not expose arbitrary individual DELETE or arbitrary PATCH. The canonical domain contract `docs/architecture/OPPORTUNITY_CAPABILITY_REQUIREMENTS_CONTRACT.md` explicitly documents DELETE as a narrowly scoped runtime privilege required for atomic complete replacement.

### Migration and qualification corroboration

The original migration `database/migrations/20260914220000_create_opportunity_capability_requirements.sql` deliberately grants:
- SELECT on the child relation;
- column-scoped INSERT on the seven data/provenance columns;
- DELETE on that relation only;
- USAGE on its identity sequence.

It expressly excludes blanket UPDATE and ALL privileges. The runtime qualification script `scripts/qualify-opportunity-requirements-runtime.mjs` connects separately as `ghm_runtime` for the application behavior and as `ghm_migrator`/SET ROLE `ghm_schema_owner` for fixture cleanup. Its cleanup DELETE is performed by the schema-owner cleanup client, not evidence that runtime DELETE is used only by test cleanup. The actual repository replacement path is the production caller.

### Revised disposition

- `DELETE ON ghm.opportunity_capability_requirement` is **required**, not stale.
- It is narrowly scoped to the complete-replacement repository transaction and its manager authorization.
- Do not revoke it, do not create a revocation migration, and do not classify it as excess direct DML.
- The earlier suspicion was caused by examining the broader Opportunity repository rather than the separate `src/resources/opportunity-requirements/repository.ts` domain.

This confirms the four non-SELECT relation DML grants mapped in the prior inventory are all explained by live source behavior:
- Business INSERT — Business creation.
- Business membership INSERT — initial owner membership.
- Opportunity INSERT/UPDATE — Opportunity and Project-linked Opportunity create/update.
- Opportunity capability requirement DELETE — atomic complete replacement of Opportunity requirements.

This does not mean the overall Resource API direct-DML boundary is ideal or closed; it means the four grants must be retained until their respective replacement architecture is implemented and qualified. No privilege changes are proposed by this finding.

**No production role, grant, data, credential, environment, migration, deployment or service was changed.**


---

## 2026-11-12 continuation — second exact-head CI failure and allow-list comparison correction

### Campaign/directory-review qualification exposed a stage-composition mismatch

After the first correction added the two pre-cutover registration identity signatures, exact-head run `43301449333` completed:
- `web-quality`: passed.
- `quality`: failed in step `Qualify Campaign and directory-review signed actor gateway on disposable PostgreSQL`.
- The initial actor-gateway principal qualification, storage dual-proof, storage legacy grant rollback, Connect provisioning, Business registration migration, Opportunity marketplace, storage lifecycle and main test suite all passed before the Campaign qualification step.
- The failing Campaign qualification had applied its manual Campaign/directory-review cutover after the prior Actor Gateway qualification had already applied the registration identity cutover. The resulting runtime state was the Campaign + registration combination (38 signatures).

The failure was in startup allow-list comparison, not in the Campaign gateway database operation itself. The runtime startup allow-list implementation was using expected arrays returned by a multi-CTE SQL query. The actual catalog array contained the expected 38 signatures, but the staged comparison still failed. A direct offline comparison of the logged actual list against the source-derived Campaign + registration stage showed exact set equality. This localized the defect to the expected-state plumbing/normalization rather than an unexplained production grant.

### Corrective simplification

Reworked `src/db/runtime-database-privileges.ts`:
- The database query now returns only the actual executable SECURITY DEFINER signature inventory.
- All eight approved staged allow-lists are derived locally from the reviewed baseline and the three explicit cutover signature sets.
- PostgreSQL `regprocedure::text` formatting is normalized by removing whitespace after argument commas before comparison.
- On mismatch, the assertion now reports per-stage missing and unexpected signatures, not just the stage counts.
- The eight stage counts remain 43 / 40 / 29 / 26 / 41 / 38 / 27 / 24.

Updated `src/db/runtime-database-privileges.test.ts`:
- Tests all eight staged states.
- Tests both source signature formatting and PostgreSQL normalized formatting.
- Tests added and missing grants for every stage.
- Tests Campaign, issuer and registration cutover membership independently.

Commits:
- Local staged comparison implementation: `8fa604d40d35cbef84eca88e11770dd7400f24ad`.
- Normalized signature and stage regression tests: `a8b8ea7d1d8974d56d7d0fc18baae78d1b70a575`.

### Validation status

The corrected code/tests have been pushed. The new exact-head CI must complete before declaring the allow-list defect closed. The prior runs `43297432850`, `43301386903`, and `43301449333` remain failed historical evidence and must not be described as passes. Their specific failure modes have been recorded above; they do not indicate a production mutation or a storage dual-proof regression.

**Production remains untouched.** No production grants, roles, credentials, secrets, migrations, deployments, services, buckets, objects or data were changed. No PR was merged.


---

## 2026-11-12 continuation — runtime allow-list query simplification and CI test-contract correction

### Query/expected-stage separation

The previous run `43302247383` for source commit `8fa604d40d35cbef84eca88e11770dd7400f24ad` had:
- `web-quality`: passed.
- `quality`: failed in the unit test `startup inventory measures only SECURITY DEFINER EXECUTE privileges`.
- The assertion still expected the removed SQL CTE alias `expected_post_issuer`; the implementation had intentionally simplified the SQL query to return only actual executable functions and derive all eight expected stages locally.

Corrected the test to assert the actual SQL contract (`executable_functions`, schema `ghm`, SECURITY DEFINER filter and effective EXECUTE check), not the removed expected-stage CTE. Commit: `62c147f90392e5ffd9dca9c51a315696c332358e`.

The simplified implementation is retained:
- Query actual effective SECURITY DEFINER EXECUTE functions only.
- Derive all eight expected cutover combinations locally from the reviewed baseline.
- Normalize PostgreSQL `regprocedure::text` argument formatting before comparison.
- Emit per-stage missing/unexpected signatures on mismatch.

### Campaign-stage investigation evidence

The earlier Campaign qualification failure run `43301449333` showed an actual runtime state of 38 signatures. An offline exact set comparison against the reviewed source-derived stage confirmed it matched the Campaign + registration-identity cutover state exactly (38/38), with no missing or unexpected functions. This is the expected state because the preceding Actor Gateway qualification applies the registration identity manual cutover, then the Campaign qualification applies the Campaign/directory-review cutover. The corrected local-stage comparison implementation is intended to recognize that composition; the subsequent run `43302247383` stopped earlier at the stale test assertion before the Campaign qualification could be rerun. The next exact-head CI is the validation for this fix.

### Production mapping lookup ACL reconciliation

A fresh read-only production catalog query against Render `ghm_db` found:

| Function | Production direct EXECUTE grantees |
|---|---|
| `ghm.auth_lookup_account_external_mapping(text,text)` | `ghm_migrator`, `ghm_schema_owner` |
| `ghm.auth_lookup_business_external_mapping(text,text)` | `ghm_migrator`, `ghm_runtime`, `ghm_schema_owner` |

Both functions are owned by `ghm_schema_owner`, SECURITY DEFINER, read-only lookup functions with pinned search paths.

The current construction source contains migration `20261112170000_revoke_redundant_migrator_business_mapping_lookup.sql`, which removes the redundant `ghm_migrator` grant from `auth_lookup_business_external_mapping`. The source comment identifies the live Resource API caller in `src/http/commercial-internal-router.ts`; that route calls it as `ghm_runtime`. Production still shows the `ghm_migrator` grant, so the post-migration ACL state has not yet been established in production. No production migration was applied by this audit.

The separate `auth_lookup_account_external_mapping` function's `ghm_migrator` grant remains unmapped. Its body reads `ghm.account_external_mapping` by provider and external account ID. The inspected current Auth Foundation persistence, Connect identity adapter, QuoteFlow migration account/business provisioning, legacy identity provenance and reconciliation scripts did not contain a caller. This is not yet an exhaustive whole-repository proof of no caller. Keep the grant until all source, scripts, migrations and operational migration procedures have been searched; do not revoke based only on the focused search.

### Current validation state

- Latest corrected test commit: `62c147f90392e5ffd9dca9c51a315696c332358e`.
- Its exact-head CI result must be checked before any passing claim.
- Earlier failed runs and their causes remain historical evidence: `43301449333` Campaign-stage allow-list mismatch under the first implementation; `43302247383` stale unit-test expectation after SQL simplification.
- No production roles, grants, migrations, credentials, secrets, environment variables, services, deployments, buckets, objects or data were changed. No PR was merged.


---

## 2026-11-12 continuation — exact production runtime SECURITY DEFINER set compared with construction baseline

**Evidence:** read-only PostgreSQL 18 catalog query against Render `ghm-db` / `ghm_db`, compared to source `src/db/runtime-database-privileges.ts` on the construction branch.  
**Production mutation:** none.

### Exact set comparison

Fresh production query returned 46 SECURITY DEFINER functions executable by `ghm_runtime`. The reviewed construction/disposable pre-cutover baseline contains 43 functions.

The sets are materially different, not merely different in count:

**12 production-only signatures (not in the 43-signature construction baseline):**

1. `ghm.auth_bootstrap_external_identity(text,text,text,text)`
2. `ghm.auth_change_password(bigint,bigint,text,text,text,integer,integer,integer)`
3. `ghm.auth_disable_account(bigint)`
4. `ghm.auth_link_business_external_mapping(text,text,bigint)`
5. `ghm.auth_link_external_identity(text,text,bigint)`
6. `ghm.auth_provision_migration_account(text,text,text,text)`
7. `ghm.auth_read_account_email(bigint)`
8. `ghm.auth_read_connect_identity_authority(bigint)`
9. `ghm.auth_register_quoteflow_migration_reset_enrollment(bigint,text,text,text,text,text)`
10. `ghm.auth_revoke_all_sessions_for_account(bigint,text)`
11. `ghm.auth_revoke_session(bigint,text)`
12. `ghm.update_business_profile(bigint,bigint,jsonb)`

**9 construction-baseline signatures not executable by production `ghm_runtime`:**

1. `ghm.auth_redeem_recovery_with_count(bytea)`
2. `ghm.auth_rehash_password_if_unchanged(bigint,text,text,integer,integer,integer)`
3. `ghm.auth_reset_password_with_recovery(bytea,text,text,integer,integer,integer)`
4. `ghm.create_capability_draft(bigint,text,text,text,uuid,integer,text,integer)`
5. `ghm.get_public_business_hours(bigint)`
6. `ghm.get_public_trust_score(bigint)`
7. `ghm.list_public_trust_scores(text)`
8. `ghm.transition_capability_lifecycle(bigint,uuid,text,uuid,integer)`
9. `ghm.update_capability_draft(bigint,uuid,text,text,text,uuid,integer,text,integer)`

The two sets therefore differ by 21 signatures (12 production-only plus 9 baseline-only). Do not infer production is at the current migration state from the repository branch or disposable CI.

### Production-only functions with explicit source revocation migrations

The construction branch contains forward migrations that explicitly revoke runtime access to these production-only functions:

| Production-only function(s) | Source revocation |
|---|---|
| `auth_bootstrap_external_identity` | `20261111260000_revoke_runtime_external_identity_bootstrap.sql` |
| `auth_change_password`, `auth_disable_account`, `auth_revoke_session` | `20261111220000_revoke_unused_auth_runtime_entry_points.sql` |
| `auth_link_external_identity` | `20261111250000_revoke_runtime_external_identity_link.sql` |
| `auth_provision_migration_account` | `20261111240000_revoke_runtime_quoteflow_migration_provisioning.sql` |
| `auth_register_quoteflow_migration_reset_enrollment` | `20261112040000_revoke_runtime_quoteflow_reset_enrollment_registration.sql` |
| `update_business_profile` | `20261110270000_gateway_business_profile_update.sql` (revokes PUBLIC and `ghm_runtime`; grants the signed gateway wrapper to `ghm_actor_gateway`) |

All eight are still executable by production `ghm_runtime` in the live catalog snapshot, despite the corresponding revocation SQL existing in the construction branch. This is strong evidence that production has not reached the same migration/ACL state as the current branch. It is not authorization to run the migrations now; production migration/backup/rollback gates remain open.

### Four production-only functions still need a specific disposition

No exact revocation migration or active caller was established in this pass for:

- `auth_link_business_external_mapping(text,text,bigint)`
- `auth_read_account_email(bigint)`
- `auth_read_connect_identity_authority(bigint)`
- `auth_revoke_all_sessions_for_account(bigint,text)`

Their production definitions were inspected:
- `auth_read_account_email` reads an active credential's normalized login email.
- `auth_read_connect_identity_authority` returns Connect role, operator intent, system-admin flag and active founder-reviewer status.
- `auth_revoke_all_sessions_for_account` delegates to the internal all-session revoker.
- `auth_link_business_external_mapping` is a SECURITY DEFINER mapping-link operation.

Focused current-source checks across Auth Foundation persistence, Auth service/router, Connect identity/authorization adapters, QuoteFlow migration provisioning/reconciliation and the inspected current repository files found no direct callers for these four signatures. That search is not yet an exhaustive repository-wide/operational proof. Keep the grants unchanged until every current route, background job, script, migration and operator workflow is accounted for. The function bodies and ACLs are evidence for review, not an instruction to revoke.

### Nine baseline functions missing from production

The missing signatures include newer token-bound recovery/rehash functions, public read projections and Capability lifecycle operations. These are expected in the current construction migration set, and their absence from the production runtime EXECUTE set further confirms that the production ACL catalog is not equivalent to the construction baseline. Some functions are expected to be gateway-only or issuer-owned after their respective cutovers; a runtime absence alone does not prove the underlying function is absent or that the production route is healthy. Reconcile function existence, grants, owning service and route configuration individually before any migration.

### Migration tracking limitation

A read-only `information_schema.tables` query for base-table names containing `migration` or `ledger` returned no rows in the live production database. This focused query does not prove no migration tracking exists under a differently named object or external deployment system. The production migration state must therefore be established from the actual supported deployment/migration mechanism and catalog evidence, not by assuming a familiar ledger table.

### Revised production readiness disposition

- Production runtime SECURITY DEFINER allow-list: **not aligned** with the construction/disposable baseline (46 live vs 43 baseline; 12 extra / 9 missing).
- Eight production-only grants have explicit source revocation migrations but remain present in the live catalog.
- Four production-only grants still require caller/disposition investigation.
- Nine construction-baseline functions are not currently executable by production runtime; function existence and replacement call path must be checked.
- The current production `ghm_actor_gateway` effective SECURITY DEFINER EXECUTE count remains zero; no deployed dedicated Actor Gateway service was identified in the earlier Render service inventory.
- Production cutover remains blocked. Do not apply migrations, revoke grants, rotate credentials, change environment variables or deploy based on this set comparison alone.

### Next actions

1. Obtain an authoritative production migration/deployment history and determine why these forward revocations/additions are not reflected in the live ACL set.
2. Reconcile all 12 production-only signatures against every active caller and source migration, with special focus on the four without a specific disposition.
3. Reconcile the nine missing baseline functions for existence, ACL, replacement gateway/issuer ownership and production route behavior.
4. Compare production table/schema/sequence ACLs and default privileges to the intended source state, not only SECURITY DEFINER EXECUTE.
5. Complete fresh verified backup, Render SQL-created login cutover plan, service environment mapping, deployment/network and rollback gates before any production action.

**No production grants, roles, ownership, credentials, secrets, environment variables, migrations, services, deployments, buckets, objects or application data were changed. No PR was merged.**


---

## 2026-11-12 continuation — complete manual-cutover stage inventory and 13-function post-cutover state

### Exact CI failure classification

The run `43302670194` (source head `91ea5d30ff87e34e003cc69cccb0aa4f83b9fe3b`) passed `web-quality` and failed in `quality` during `qualify-auth-issuer-cutover.mjs`.

The failure occurred after the CI sequence had qualified/applied the Campaign, capability-governance, Business Capability, Saved Business, Business Hours, Trust Score and Business Logo manual cutovers, in addition to the earlier registration-identity cutover. The Resource API runtime had reached the fully cut-over state with 13 executable SECURITY DEFINER functions. The guard only modeled Campaign, Authentication Issuer and registration identity (24 functions after those three), so it rejected the legitimate combination with the other six gateway cutovers.

The diagnostic identified exactly eleven further removed signatures:
- Capability governance: `create_capability_draft`, `update_capability_draft`, `transition_capability_lifecycle`.
- Business Capability mutations: `replace_business_capability_assertions`, `transition_business_capability_verification`, `transition_business_capability_evidence`.
- Saved Business: `create_saved_business`, `delete_saved_business`.
- Business Hours: `replace_business_hours`.
- Trust Score: `calculate_business_trust_score`.
- Business Logo: `set_business_logo_object`.

This is an expected set of individually qualified manual revocations, not an unexplained privilege disappearance. The 13-function actual state is the baseline of 43 minus the 30 signatures removed by all nine manual cutover groups.

### Complete cutover model implemented

Updated `src/db/runtime-database-privileges.ts` to enumerate all nine independently qualified manual cutover groups:

1. Campaign/directory review — 3 functions.
2. Authentication Issuer — 14 functions.
3. Registration identity — 2 functions.
4. Capability governance — 3 functions.
5. Business Capability mutations — 3 functions.
6. Saved Business — 2 functions.
7. Business Hours — 1 function.
8. Trust Score — 1 function.
9. Business Logo — 1 function.

The groups contain 30 distinct signatures, all present in the 43-function baseline. The guard now derives and accepts only the exact (2^9=512) possible combinations of these reviewed revocations. It rejects any extra or missing function outside those combinations and reports per-stage missing/unexpected signatures. It does not add a wildcard, prefix match or permissive fallback.

The all-nine-cutover state is exactly 13 functions. It retains:
- the two separately reviewed Resource API lookup functions (`auth_lookup_business_external_mapping`, `auth_lookup_external_identity`);
- Connect assertion replay consumption;
- the approved public read projections for Business Hours, Trust Score and Capability eligibility;
- the public Business Logo projection;
- the five legacy storage metadata functions, because storage's current grant-revocation rehearsal restores its ACL and there is not yet a separate production cutover file in `database/cutovers/`.

The five legacy storage grants are not silently treated as revoked. Their separate storage dual-proof and disposable grant-revocation/rollback qualification remains recorded in the storage handover.

Updated `src/db/runtime-database-privileges.test.ts` to:
- assert all nine group sizes and 512 combinations;
- accept source and PostgreSQL-normalized signature formatting;
- prove the exact 13-function all-cutover state;
- reject one unexpected and one missing function in every combination;
- retain focused issuer, registration and Campaign cutover assertions.

Commits:
- Complete cutover stage implementation: `fbcf63870782ca0e2bb2794784fadf4c28dbd3f3`.
- 512-combination regression tests: `5729ac712f9dc9fac9abb47f38291b147e5ea159`.

### Validation status

The new implementation and tests have been pushed. Exact-head CI for `5729ac712f9dc9fac9abb47f38291b147e5ea159` must complete before claiming the cutover stage guard passes. Run `43302670194` remains failed historical evidence and is now explained by the incomplete three-group model.

No production role, grant, credential, environment variable, migration, service, deployment, storage object or data was changed. No PR was merged.


---

## Correction — production migration ledger exists but is not readable through the Render default query identity

The earlier note that the information_schema search returned no migration/ledger table is superseded by a broader read-only `pg_class` catalog query.

### Verified relation

Production contains `ghm.ghm_schema_migrations`:
- Owner: `ghm_schema_owner`.
- Relation kind: ordinary table.
- Columns: `version varchar(64)`, `name varchar(255)`, `checksum varchar(64)`, `applied_at timestamptz`.

The earlier `information_schema.tables` query returned no rows because the current Render query identity did not have visibility/access to the owner-controlled migration table; it was not evidence that the ledger did not exist.

### Access boundary

A read-only `SELECT to_jsonb(m) FROM ghm.ghm_schema_migrations m` using the available Render default query identity failed with SQLSTATE `42501 permission denied for table ghm_schema_migrations`.

No role escalation was attempted. The default Render query connection is not the dedicated `ghm_migrator` identity and cannot be treated as authorized to read the owner-only ledger. No migration rows, versions, checksums or applied timestamps have therefore been retrieved.

### Revised disposition

- The production migration ledger **exists**.
- Its contents and latest applied version/checksum remain **unverified** through the current read-only connection.
- The next safe evidence route is a controlled read using the supported `ghm_migrator` connection (or an approved owner-mediated export) that returns only migration metadata, without exposing credentials or changing data.
- Reconcile the ledger rows with the 12 production-only and 9 baseline-only runtime function differences before deciding whether migrations are unapplied, checksums diverged, or manual cutovers are pending.

No role, membership, grant, ledger row, migration, credential, environment variable, service or production data was changed.


---

## 2026-11-12 continuation — deployed-main auth callers and legacy authority revocation gap

### Actual production service release state

A fresh Render service/deploy inventory confirmed the production web service:
- Service: `ghm-internal-runtime`, ID `srv-damupsek1f9s73eq8kkg`.
- Branch: `main`.
- Auto-deploy: OFF.
- Latest live deployment: `dep-dbpmv8jrjlhs73abkli0`.
- Deployed commit: `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf` (10 November 2026).
- No separate production Actor Gateway or Authentication Issuer web service appeared in the current Render service inventory.

This is the live code context for the production grants. Do not apply the new branch's revocation migrations/cutovers while this older main deployment remains active.

### Deployed-main callsites confirmed

Source inspection at the exact deployed commit `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf` found active callers in `src/auth/foundation/persistence.ts` for:
- `auth_revoke_session` — `revokeSession`.
- `auth_revoke_all_sessions_for_account` — `revokeAllSessionsForAccount` and password-recovery reset.
- `auth_change_password` — password change.
- `auth_disable_account` — account disable.
- `auth_bootstrap_external_identity` — Connect identity bootstrap.
- `auth_link_external_identity` — external identity linking.
- `auth_link_business_external_mapping` — Connect Business mapping creation.

The deployed `src/resources/business-identity/repository.ts` also calls `ghm.update_business_profile` directly. The newer construction branch routes Business profile writes through the signed gateway client and its forward migration revokes direct runtime execution.

These live callsites explain why the corresponding production grants still exist and why the forward revocations cannot be applied before the new application/service routing is deployed and verified. The migration files are not safe to apply independently against the current main deployment.

### Legacy account authority functions — three additional cutover revocations added

The production-only function set also contained three SECURITY DEFINER functions not present in the construction baseline and not yet explicitly revoked by the Auth Issuer cutover:

- `ghm.auth_read_account_email(bigint)` — returns an active account's login email for a caller-supplied account ID.
- `ghm.auth_read_connect_identity_authority(bigint)` — returns Connect role, operator intent, system-admin and founder-reviewer authority for a caller-supplied account ID.
- `ghm.auth_revoke_all_sessions_for_account(bigint,text)` — revokes all sessions for a caller-supplied account ID.

The deployed-main persistence layer actively uses the last function; the two read functions had no caller in the inspected deployed-main Auth Foundation, Auth HTTP, Connect identity/authorization or Resource API source files. They remain production grants regardless of whether a current caller is found.

The construction branch no longer contains direct application callers for these three wrappers. The Auth Issuer uses its narrowly scoped lifecycle functions and owner-executed internal revocation helper; arbitrary account-ID reads and the legacy all-session wrapper are not part of its approved allow-list.

Updated manual cutover `database/cutovers/20261112010000_authentication_issuer_privilege_cutover.sql` with a conditional `DO` block that revokes all privileges on these signatures from PUBLIC, `ghm_runtime`, `ghm_migrator`, `ghm_actor_gateway`, `ghm_auth_issuer` and `ghm_payment_provider` if the historical function exists. Conditional revocation is required because these legacy functions are present in the live production catalog but are not created by the current disposable migration chain.

Updated the rollback comments to state explicitly that the three legacy account-ID authority functions are not restored. The rollback remains forward-safety-oriented: it restores the documented issuer runtime allow-list, not historical arbitrary-account administration/read grants.

Extended `scripts/qualify-auth-issuer-cutover.mjs` to:
1. Create disposable-only legacy function fixtures with broad grants to PUBLIC and every application principal.
2. Reapply the guarded issuer cutover.
3. Assert runtime, migrator, gateway, issuer and payment-provider access is denied.
4. Include direct denial calls for all three legacy functions.
5. Prove issuer rollback does not restore these privileges.
6. Drop only the disposable fixtures after the assertions.

Commits:
- Conditional legacy authority revocations: `1a7bcf625400d262c9a3fda7f3a327d9dff8d708`.
- Rollback scope documentation: `a914e248180540179ffdf046af0a71d3e168d7f7`.
- Disposable legacy-function qualification: `50367880520ba02a8c2b5c5357e182741aa69c17`.

### Corrected disposition of the 12 production-only functions

- `auth_link_business_external_mapping` was already explicitly revoked by the issuer cutover; it is not an unassigned function.
- `auth_read_account_email`, `auth_read_connect_identity_authority` and `auth_revoke_all_sessions_for_account` are now explicitly included in the conditional issuer cutover and disposable qualification.
- The other production-only signatures have their corresponding forward migration/cutover dispositions recorded in the preceding section.
- The current production application still calls several of these functions. Their grants must remain until the new Auth Issuer / Actor Gateway application deployment and routing are live and verified; then the coordinated migration/cutover can be applied.

### Validation status

The complete nine-cutover / 512-stage runtime allow-list implementation at `5729ac712f9dc9fac9abb47f38291b147e5ea159` passed both CI jobs (`quality` and `web-quality`; all 63 quality steps passed). The later three-function legacy authority cutover change at `50367880520ba02a8c2b5c5357e182741aa69c17` requires its own exact-head CI result before this added cutover coverage is considered qualified.

**Production state unchanged:** no role, grant, migration, credential, environment variable, Render service, deployment, bucket, object or application data was changed. No PR was merged.


---

## 2026-11-12 continuation — legacy authority fixture qualification correction

### First legacy-wrapper qualification attempt

Exact-head run `43305177474` for implementation commit `50367880520ba02a8c2b5c5357e182741aa69c17`:
- `web-quality`: passed.
- `quality`: passed the build, all migrations, whole-database SECURITY DEFINER inventory, Actor Gateway/Auth Issuer principal qualification, storage dual-proof and grant rollback, Connect provisioning, Business registration, Opportunity marketplace, main test suite, Campaign/directory-review, Capability governance and all Business Capability/Saved Business/Hours/Trust Score/Business Logo gateway cutovers, Business profile, commercial settlement, migration audit policy, runtime boundary and exact pre-issuer ACL checks.
- The final Auth Issuer cutover qualification failed at the new disposable fixture setup because `ghm.auth_revoke_all_sessions_for_account(bigint,text)` already exists in the current disposable migration chain (it simply is not part of the runtime's 43-function executable baseline).

### Correction

Updated `scripts/qualify-auth-issuer-cutover.mjs` in commit `2a5a976cca58f4148a75035d9933cb9764a47eef`:
- Reuse an existing disposable legacy function without replacing its body.
- Create a fixture only when the signature is absent.
- In either case, grant the historical broad application/PUBLIC privileges to simulate the legacy production ACL, then reapply the manual issuer cutover.
- Verify the cutover removes access and the rollback does not restore it.
- Drop only fixtures created by this qualification script; preserve existing migration-created function definitions.

This keeps the test isolated, avoids overwriting a migration-owned function and still exercises the conditional cutover revocations.

### Current validation

Exact-head CI for `2a5a976cca58f4148a75035d9933cb9764a47eef` is in progress. Do not claim the new legacy-wrapper qualification passes until both jobs finish.


---

## 2026-11-12 continuation — legacy auth authority revocation rehearsal reached rollback verification

### Second fixture qualification run

Exact-head run `43305676298` for `2a5a976cca58f4148a75035d9933cb9764a47eef`:
- `web-quality`: passed.
- `quality`: passed build, migrations, SECURITY DEFINER inventory, all 512 runtime cutover stage tests, storage dual-proof/rollback, Connect provisioning, Business registration, Opportunity marketplace, main test suite, Campaign/directory-review, Capability governance, Business Capability, Saved Business, Business Hours, Trust Score, Business Logo, Business profile, commercial settlement, migration audit, runtime boundary, exact pre-issuer grants and guarded issuer cutover.
- The final issuer lifecycle qualification exercised the new legacy wrappers. The expected permission-denied calls for `auth_read_account_email`, `auth_read_connect_identity_authority` and `auth_revoke_all_sessions_for_account` were observed.
- It then failed only in the post-rollback ACL verification query: that query used the `ghm_migrator` connection without `SET ROLE ghm_schema_owner`; the migrator has no direct schema USAGE, so PostgreSQL correctly returned permission denied for schema `ghm`. This is a test-query execution-context error, not a failed revocation or a production issue.

### Correction

Commit `6b1d3c4f180d0570a6836bfdb0e97f9a044c86c6` changes the post-rollback privilege verification to use a dedicated migrator client with `SET ROLE ghm_schema_owner`, then `RESET ROLE` and release. It does not widen any grants or change the migration cutover. Exact-head CI is required to confirm the corrected verification.

### Migration ledger access clarification

A follow-up read-only role-capability query confirmed:
- `ghm_db_user` has no direct SELECT and no SET path to `ghm_schema_owner` for `ghm.ghm_schema_migrations`.
- `ghm_migrator` has no direct SELECT on the ledger, but does have the SET path to `ghm_schema_owner` needed by the supported migration process.
- The current Render default query identity therefore cannot read the ledger; a controlled migrator connection that performs `SET ROLE ghm_schema_owner` is the correct read-only route.

No production role, grant, migration, credential, environment variable, service, deployment, ledger row or data was changed.


---

## 2026-11-12 continuation — Opportunity requirements DELETE caller confirmed; column-level ACL audit gap corrected

**Evidence:** complete recursive repository tree/source inspection at construction branch head `02d340e960d6e40ffcdfbbd65cc44ed8340f58e7`, read-only Render PostgreSQL 18 catalog queries, and a new disposable-only inventory implementation.  
**Production mutation:** none.

### Correction: Opportunity requirements DELETE is required, not stale

The prior suspicion that `DELETE ON ghm.opportunity_capability_requirement` might be an orphaned grant is withdrawn.

The complete source path is:

- `src/http/opportunity-requirements-router.ts` registers authenticated `PUT /api/v1/opportunities/:opportunityId/requirements`.
- The route validates the replacement payload and calls `OpportunityRequirementsService.replaceOpportunityRequirements`.
- `src/resources/opportunity-requirements/service.ts` delegates to the repository.
- `src/resources/opportunity-requirements/repository.ts` calls `assertOpportunityManager`, verifies each capability is active/selectable, deletes the current rows for that Opportunity, inserts the replacement set and reads it back, all inside `withAuthorizedTransaction`.
- The repository tests explicitly assert the DELETE and INSERT SQL.
- Migration `20260914220000_create_opportunity_capability_requirements.sql` explicitly grants the runtime the required DELETE plus column-level INSERT, and comments that DELETE is limited to this child table because replacement semantics require removing the existing requirement set.

This is an active, authorized replacement workflow. Production DELETE is required for the currently deployed Resource API path. **Do not revoke it** unless this operation is first moved to a new database/gateway boundary with equivalent authorization and transaction semantics and its old runtime permission is cut over in a separately qualified migration.

### Important correction to earlier production inventory: table-level ACL queries omitted column ACLs

The earlier statement that the only direct runtime relation DML was the four table-level entries (`business`, `business_membership`, `opportunity`, and the requirements DELETE) was incomplete. The earlier query inspected `pg_class.relacl` but did not enumerate `pg_attribute.attacl`. PostgreSQL column-level INSERT/UPDATE grants are independent ACL entries and must be counted.

A fresh read-only query against production `ghm_db` / `ghm` enumerated all direct column ACLs:

| Privilege | Direct runtime column ACL entries | Affected tables |
|---|---:|---:|
| INSERT | 156 | 21 |
| UPDATE | 60 | 12 |
| SELECT | 7 | 1 |

All captured column grants were issued by `ghm_schema_owner` and have no grant option.

Important examples include:

- `account_identity`: UPDATE limited to `avatar_ref`, `business_operator_intent`, `connect_role`, `full_name`, `phone`, `updated_at`. This corrects the earlier table-level-only observation: the profile update repository method has column-level privileges, though its route/caller was not found in the inspected HTTP app.
- `business`: UPDATE limited to `rating`, `review_count`, `updated_at`.
- `opportunity_capability_requirement`: INSERT limited to `capability_id`, `created_by`, `description`, `importance`, `minimum_proficiency_level`, `opportunity_id`, `sort_order`; separate table-level DELETE grant supports the replacement workflow.
- `project`: nine INSERT columns and ten UPDATE columns.
- Other column-scoped DML occurs on Business Capability/evidence/category/offering, engagement events, commercial event/payment/subscription/trial, Customer, Enquiry, Notification, Opportunity participant, Project Quote, Quote/line item, Review and Support Request/message.

The complete result set was retrieved from the production catalog in this pass. The compact aggregate above is not a substitute for the full per-column inventory in the updated audit artifact.

### Durable audit tooling correction

The existing read-only whole-database SECURITY DEFINER authority inventory `scripts/audit-security-definer-authority.mjs` previously covered routine ACLs, memberships, roles, schemas, database ACLs and function default ACLs, but omitted `pg_attribute.attacl`. It could therefore miss direct column-scoped DML grants in the disposable report.

Added:
- A per-column direct ACL inventory with grantee, grantor, privilege and grant option.
- Effective per-role column privilege flags for SELECT, INSERT, UPDATE and REFERENCES.
- Relation owner/kind, schema, column number/name and stable ordering.
- Report field `column_privileges`.
- Source-contract regression assertions for `pg_attribute`, `attacl`, `aclexplode(a.attacl)`, effective `has_column_privilege` checks and report inclusion.

Commits:
- `6a0872b501bcdb42407ab3fb28415e4424212262` — inventory implementation.
- `86d5b0de599f19d54c528c1c5086df2f04d01ba6` — regression test.

This script remains restricted to local `ghm_disposable_test`; it was not pointed at Render. Production column ACLs were inspected separately with read-only SQL.

### Exact-head CI status

After the audit tooling change, the construction branch head is `86d5b0de599f19d54c528c1c5086df2f04d01ba6`.

- CI run `43308731060` for implementation commit `6a0872b501bcdb42407ab3fb28415e4424212262` was in progress at the time of this handover update.
- CI run `43308735232` for exact head `86d5b0de599f19d54c528c1c5086df2f04d01ba6` was queued.
- Prior exact-head CI on `02d340e960d6e40ffcdfbbd65cc44ed8340f58e7` passed both `quality` and `web-quality`; this does not qualify the new column inventory change.

Do not claim the column inventory implementation is qualified until exact-head `quality` and `web-quality` both pass.

### Updated dispositions

- Opportunity requirements DELETE: **required by active PUT replacement route; retain**.
- Opportunity requirements column INSERT: **required by the same replacement route; retain**.
- Account identity profile column UPDATE: live DB grant exists; inspected HTTP app still has no matching update route/caller, so this is a source reachability question, not a missing production privilege.
- The prior "only four direct DML relations" statement is superseded and must not be repeated. Production runtime has extensive column-level DML on 21 tables for INSERT and 12 tables for UPDATE; reconcile these grants table/column/caller by caller.
- Whole-database authority audit now includes column ACLs; the report is still an inventory requiring human review, not an automatic permission approval or a production mutation script.

### Next work

1. Reconcile the 156 INSERT and 60 UPDATE column ACL entries against repository callsites, HTTP routes, background jobs and SQL wrappers. Distinguish intentional direct runtime paths from gateway-cutover targets.
2. Confirm exact-head CI on `86d5b0de599f19d54c528c1c5086df2f04d01ba6`.
3. Reconcile relation-level ACLs, column-level ACLs and effective privileges together; do not infer one from the other.
4. Continue SECURITY DEFINER caller/actor authority mapping and compare the production inventory with the intended service-specific allow-lists.
5. Keep all production changes gated on fresh independently verified backup, role/service readiness and separately approved deployment/cutover.

**No production roles, grants, memberships, object ownership, credentials, secrets, Render environment, migrations, deployments, services or application data were changed.**


---

## 2026-11-12 continuation — first source-to-route reconciliation of production column DML

**Source inspected:** construction branch `f205e924e4dc74af75b6c0fafa8b114b2e6ab611`.  
**Production ACL evidence:** the separate read-only Render snapshot recorded immediately above (156 INSERT / 21 tables; 60 UPDATE / 12 tables; 7 SELECT / 1 table).  
**Production mutation:** none.

### Scope and interpretation

Inspected the Resource API repository implementations and their registered HTTP routes for the column-DML domains identified in the production inventory. This is a source-callsite mapping pass, not yet a column-by-column ACL approval. The construction branch is not deployed: the live Render service remains on the older `main` deployment recorded above. Do not infer that every construction-branch route, gateway delegation or authorization behavior is already live in production.

### Confirmed source callsite map

| Data domain / relation | Repository operation and direct DML observed | Registered application entry point | First-pass disposition |
|---|---|---|---|
| Business / Business Membership | `business-identity/repository.ts:createBusinessInTransaction` inserts the Business and its initial active owner membership in the same authorized transaction. Review submission also updates only Business aggregate columns `rating`, `review_count`, `updated_at`. | `POST /api/v1/businesses`; review create route also updates the aggregate. | Business and initial membership INSERT are live create-flow dependencies. Business aggregate UPDATE is a separate review-derived write. Retain until each path has a qualified replacement. |
| Account Identity | `business-identity/repository.ts:updateAccount` issues a column-limited UPDATE for `full_name`, `phone`, `avatar_ref`, `updated_at`. | No profile-update route is registered in the inspected `app.ts`; only profile GET is present. | The method appears unreachable from the current HTTP surface. Do not treat these UPDATE grants as required by a live route or broaden them. Resolve as dead/unreachable code or add a deliberate authenticated feature in a separate change. The production column ACL also includes other identity fields; their exact consumers need separate tracing. |
| Business Capability | `business-capability/repository.ts:createBusinessCapability` directly inserts a Business Capability after tenant owner/administrator and active/selectable Capability checks. The replace and verification operations call SECURITY DEFINER functions or use the optional signed gateway client. | `POST /api/v1/business-capabilities` (single assertion create); `PUT /api/v1/business-capabilities` (replace); `PATCH /api/v1/business-capabilities/:businessCapabilityId/verification`. | Single-create INSERT remains direct in this source. Replace/verification are staged gateway/function paths and must not be conflated with the direct INSERT grant. Verify the exact production column set against the deployed-main source before cutover. |
| Business Capability Evidence | `business-capability-evidence/repository.ts:create` directly inserts evidence after deriving Business ID from the active assertion and requiring active owner/administrator membership. Review calls `transition_business_capability_evidence`, not direct UPDATE. | `POST /api/v1/business-capability-evidence`; `PATCH /api/v1/business-capability-evidence/:evidenceId/review`. | Evidence INSERT is a direct Resource API path in the inspected source; review transition is function-mediated. Do not classify review as a direct table UPDATE. |
| Business Category Assignment | `business-category/repository.ts:assignBusinessCategory` inserts assignments; `setPrimaryBusinessCategory` updates `is_primary` on the old and selected rows in one authorized tenant transaction. | `POST /api/v1/businesses/:businessId/categories`; `PATCH /api/v1/businesses/:businessId/categories/:categoryId/primary`. | INSERT and UPDATE map to explicit owner/administrator category-management workflows. |
| Business Offering | `business-offering/repository.ts:createBusinessOffering` inserts; `updateBusinessOffering` dynamically updates only an explicit allow-list of offering fields after locking the row and checking tenant owner/administrator membership. | `POST /api/v1/business-offerings`; `PATCH /api/v1/business-offerings/:offeringId`. | INSERT/UPDATE map to explicit Business Offering management. Keep the column allow-list and tenant check as part of any future gateway replacement. |
| Commercial trial / subscription / payment attempt / event | `commercial/repository.ts` creates trial, subscription, payment-attempt and event records during commercial payment preparation. | `POST /api/v1/internal/commercial/payment-prepare`; the route rejects browser-originated requests and verifies a fresh Connect service assertion and active integration before invoking the service. | This is an internal service-to-service path, not a normal user route. Preserve the Connect assertion/replay and idempotency boundaries. PayFast activation remains paused; this audit does not enable payment processing. |
| Customer | `customer/repository.ts` inserts Customers for the authenticated account and updates status with an account ownership predicate (or admin path). | `POST /api/v1/customers`; `PATCH /api/v1/customers/:customerId`. | INSERT/UPDATE map to explicit customer create/archive/restore routes with account scoping. |
| Enquiry / Opportunity Participant | `enquiry/repository.ts` creates an Opportunity, creator/owner/recipient participants and the Enquiry in one transaction; status update writes the Enquiry. `opportunity-participant/repository.ts` also inserts participants for its dedicated create operation. | `POST /api/v1/enquiries`; `PATCH /api/v1/enquiries/received/:enquiryId/status`; `POST /api/v1/opportunity-participants`. | These are multi-row workflow writes. Preserve transaction atomicity and participant provenance if moved behind a gateway. |
| Opportunity Capability Requirement | `opportunity-requirements/repository.ts:replaceOpportunityRequirements` deletes the existing set and inserts the replacement set in one authorized transaction after manager and selectable-Capability checks. | `PUT /api/v1/opportunities/:opportunityId/requirements`. | DELETE and the seven column INSERT grants are intentional and required. Retain; do not revoke. |
| Opportunity / Project | `opportunity/repository.ts` directly creates, updates and transitions Opportunities. `project/repository.ts:createProject` atomically inserts a linked Opportunity, creator participant and Project; Project update is separately scoped to its account and allowed state. | Opportunity POST/PATCH/transition routes; `POST /api/v1/projects` and `PATCH /api/v1/projects/:projectId`. | Direct DML is required by current source paths. Any gateway migration must preserve Project↔Opportunity↔participant atomicity and existing ownership/creator checks. |
| Project Quote | `project-quote/repository.ts` inserts and updates quotes, including acceptance/rejection transitions. | `POST /api/v1/project-quotes`, `PATCH /api/v1/project-quotes/:quoteId`, and customer accept/reject POST routes. | Direct DML maps to business quote submission and customer decision workflows. Preserve row locking and transition predicates. |
| Quote / Quote Line Item | `quote/repository.ts` inserts a Quote and its line items in the create transaction; updates Quote status/reminder fields and notes. | `POST /api/v1/quotes`; `PATCH /api/v1/quotes/:quoteId`. | INSERT/UPDATE map to quote create and edit/status workflows; line-item creation must remain atomic with the parent Quote. |
| Notification | `notification/repository.ts` inserts notifications and updates read state/read timestamp for one user or all unread notifications for that user. | `POST /api/v1/notifications`; `PATCH /api/v1/notifications/:notificationId`; `POST /api/v1/notifications/read-all`. | Read-state updates are user-scoped. Notification creation has multiple internal producers; enumerate producer callsites before attempting to narrow its INSERT authority. |
| Review / Business aggregate | `review/repository.ts` inserts Reviews, updates Business rating aggregates and has a separate admin moderation update. | `POST /api/v1/reviews`; `PATCH /api/v1/reviews/:reviewId/moderation`. | Review creation and admin moderation are distinct authority paths. The Business aggregate UPDATE is derived from review writes; retain its narrow columns only while this implementation remains. |
| Support Request / Message | `support-request/repository.ts` inserts requests and initial customer messages; admin status updates write resolution/closed fields; replies insert messages and may reopen/advance request status. | `POST /api/v1/support-requests`; admin `PATCH /api/v1/support-requests/:requestId/status`; `POST /api/v1/support-requests/:requestId/messages`. | Direct DML maps to customer/business support creation and replies plus admin-only status management. Keep ownership checks, row locking and role restrictions in any replacement. |

### Important source/authority distinctions

1. `withAuthorizedTransaction` and application middleware provide application authorization but do not, by themselves, bind a caller-supplied actor ID to a database-verifiable session identity. Direct runtime DML that accepts actor/provenance values therefore still needs adversarial database-boundary review; a successful route-level authorization check is not sufficient evidence against direct SQL impersonation.
2. The current source has mixed states: some domains are direct DML, some use SECURITY DEFINER operations, and some use an optional signed Actor Gateway client with production fail-closed configuration. A relation/column grant must be assessed against the exact SQL statement and actual deployed caller, not merely the domain name.
3. The production aggregate counts do not disclose the complete table/column/privilege matrix in this handover. The exact 156 INSERT and 60 UPDATE ACL entries must be reconciled individually against the retrieved production artifact/query output before any privilege is removed or declared unnecessary.
4. No direct DML callsite was found in the inspected `relationships-outcomes/repository.ts`; do not attribute the engagement-event grant to it without further evidence. Engagement-event producer/consumer paths and any non-resource scripts remain an explicit search item.
5. The 7 column-level SELECT entries on one table are outside this DML tranche and require their own purpose review.

### Next reconciliation tranche

1. Retrieve and preserve the complete production column ACL result (table, column, privilege, grantor, grantee, grant option) as an auditable handover artifact; the aggregate alone is insufficient for final sign-off.
2. For every exact ACL row, map the written column list to the SQL statement, then to the repository method, service, HTTP or internal route, and authorization predicate. Mark columns with no matching source write as unresolved, not automatically stale.
3. Compare the same callsites at deployed production commit `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf` with construction branch `f205e924e4dc74af75b6c0fafa8b114b2e6ab611`; record every changed route, gateway delegation and direct SQL statement separately.
4. Inspect notification producers, review aggregate updates, commercial internal service callers, and every engagement-event producer outside the initially inspected resource repositories.
5. Continue with the remaining production SECURITY DEFINER caller/actor-binding review and reconcile the 46-function live production set independently of the column ACL work.

**Disposition:** first source-callsite tranche mapped; column-by-column approval remains OPEN. No production grant, role, migration, credential, environment, service, deployment, traffic, bucket, object or application data was changed. No PR was merged. PayFast remains paused.


---

## 2026-11-12 continuation — deployed-source comparison and notification/commercial caller clarification

**Comparison refs:** deployed production source commit `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`; construction branch commit `2c7c055077024e9870eca8940a04eeff1a2388c5`.  
**Method:** compared Git blob SHAs for individual source files at both refs. A matching blob SHA establishes byte-identical source for that file at those two commits.  
**Production mutation:** none.

### Verified identical repository implementations at both refs

The following files have matching production and construction blob SHAs:

| File | Production/construction blob SHA | Result |
|---|---|---|
| `src/resources/notification/repository.ts` | `1e1706c6dab2b4a7f691b59a09117ab9ec84e964` | Identical |
| `src/resources/commercial/repository.ts` | `b40b01a8a8edaf43536586504aeae206a5ca7e07` | Identical |
| `src/resources/review/repository.ts` | `5b9db44c2b1e9d2071e96cbdd1c0dcff99d8aa92` | Identical |
| `src/resources/business-capability/repository.ts` | `2df0329738d242c426276dc8be06a37715bcc4c4` | Identical |
| `src/resources/business-capability-evidence/repository.ts` | `595aa727dfa4cc8f8f2b1ef3c830464bf47517e3` | Identical |
| `src/resources/business-category/repository.ts` | `200f08530f7a987c7907dc6b85740db6b798f9e3` | Identical |
| `src/resources/business-offering/repository.ts` | `b9e712c2733183ad855f38db9ea6a721a7acdf33` | Identical |

This is a scoped comparison of these seven files only, not proof that all 21 production INSERT tables or all 12 UPDATE tables have identical callers.

### Material difference: Business Identity

`src/resources/business-identity/repository.ts` differs between deployed production and construction.

- **Deployed production:** implements the Business profile update path using a constrained allow-list and direct UPDATE against `ghm.business`.
- **Construction:** the `updateBusiness()` repository method intentionally throws `Business profile must be updated through the authenticated actor gateway`.
- **Construction HTTP surface:** `PATCH /api/v1/businesses/:businessId` remains registered in `src/http/app.ts`. The feature route remains, while the direct repository operation has been replaced with an explicit gateway-required failure.
- **Construction also contains:** `updateAccount()`, which directly updates `ghm.account_identity`; the inspected application registration exposes no corresponding account-profile PATCH route. This remains an unresolved/dead-code candidate, not an approved revocation.

**Correction to the prior source map:** the production Business profile UPDATE is a live route dependency. Do not describe its grants as unexplained or unused. The construction branch's gateway-required repository behavior is the intended replacement boundary, but the Actor Gateway route, SQL wrapper, and exact field-to-column mapping must be verified before this transition can be accepted. Confirm that gateway failure is closed and does not silently fall back to direct Resource API DML.

### Notification INSERT/UPDATE caller clarification

The production and construction `notification/repository.ts` files are byte-identical.

- INSERT columns are exactly `user_id, type, title, body, metadata`; generated/default columns are not explicitly supplied.
- UPDATE columns are exactly `is_read, read_at`, with a row predicate binding notification ID and `context.userId`; bulk read-all is also restricted to `context.userId` and unread rows.
- `NotificationServiceImpl.createNotification()` restricts non-admin recipients to the authenticated account. The `lead` notification type has an additional identity-mapping restriction.
- `src/http/app.ts` constructs the default `PostgresNotificationRepository`/service and registers `registerNotificationRoutes`. The registered INSERT entry point is authenticated `POST /api/v1/notifications`, with the registered create operation and resource-access check.
- The inspected application wiring did not establish separate internal producer routes. The earlier phrase “multiple internal producers” is therefore **not yet substantiated**. Do not rely on it to justify broad INSERT authority. A full-repository callsite search is still needed before concluding there are no other instantiations or injected producers.

### Commercial event distinction

The production and construction `commercial/repository.ts` files are byte-identical. The inspected payment preparation path writes `ghm.commercial_event` with business, subscription, event type, actor account, source, idempotency key, JSON payload and occurrence time. The HTTP entry point is `POST /api/v1/internal/commercial/payment-prepare`, which verifies a Connect service assertion, replay freshness, active integration and external identity/business mapping before calling the commercial service.

This is specifically `commercial_event`; it does not resolve the separately mentioned engagement-event ACL. Do not conflate those relations. PayFast activation remains paused and no payment was initiated.

### Updated disposition and next actions

1. Production Business profile UPDATE is confirmed live and direct at deployed commit; construction has an explicit gateway-required replacement. Verify the gateway endpoint/wrapper and field parity before any privilege decision.
2. Account Identity direct UPDATE in construction has no matching registered account-profile route in the inspected app wiring. Trace the complete call graph and decide whether it is dead code or a missing intended feature.
3. Notification INSERT has one verified registered authenticated route in app wiring; separate internal producers have not been established. Complete repository-wide caller search before narrowing grants.
4. Commercial event DML is a verified internal Connect-assertion path; keep separate from engagement-event ACL findings.
5. Continue the per-file production/construction comparison for the remaining repositories and route/service wiring. The seven identical blobs above are a partial comparison, not a global equivalence claim.

**Status:** production-vs-construction comparison has identified one important gateway transition and clarified three caller assumptions. Column-by-column ACL approval remains OPEN. No production grants, roles, migrations, credentials, environment variables, Render services, deployments, traffic or application data were changed. No PR was merged. PayFast remains paused.


---

## 2026-11-12 continuation — Business profile Actor Gateway end-to-end source qualification

**Source ref:** `9f56a6d0207506c3b1c942aab82c85ff7c8e7269`.  
**Production comparison ref:** `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`.  
**Production mutation:** none; no database was connected or modified.

### 1. Resource API route and fail-closed behavior

The construction branch's `PATCH /api/v1/businesses/:businessId` route no longer invokes the direct Business profile repository UPDATE.

- The route parses and validates the profile patch.
- `isSupplier` is accepted only as a single-field operation and sent to the separate Supplier Classification Gateway.
- All other supported profile fields require `businessProfileGatewayClient`.
- If the client is absent, the route returns HTTP 503; it does not call `service.updateBusiness()` as a fallback.
- The route forwards the original bearer token to the gateway, then reads the managed Business after the gateway write succeeds.
- Gateway errors are mapped to explicit 4xx responses or 503. The client test confirms a gateway 404 is propagated as a `BusinessProfileGatewayError`, not followed by a direct SQL fallback.

The repository implementation independently reinforces this: construction `PostgresBusinessIdentityRepository.updateBusiness()` throws `Business profile must be updated through the authenticated actor gateway`. This is a second fail-closed guard if another caller attempts to use the legacy method.

Gateway client construction is conditional on `config.actorGatewayUrl`. Missing URL therefore leaves the profile client undefined and the PATCH route returns 503. The inspected route does not have a legacy write fallback.

### 2. Actor Gateway endpoint and identity derivation

The Actor Gateway:

- Authenticates the bearer token with the configured ES256 access JWT verifier in middleware.
- Derives `accountId` from the verified token's `sub`; the route does not accept an actor ID from the request body.
- Exposes `PATCH /v1/businesses/:businessId/profile`.
- Validates positive Business ID and a non-empty object patch with a field allow-list.
- Returns 503 if `businessProfileReader` is not configured.
- Calls `updateBusinessProfile(verifiedAccountId, businessId, patch)`.
- Maps authorization/not-found SQL states to 404, validation SQL states to 400, and unexpected database failures to 503.

The production Actor Gateway server constructs `PostgresBusinessProfileReader` with its own `GHM_ACTOR_GATEWAY_DATABASE_URL` pool and required 32-byte `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET`. Startup also checks the database session identity and database privileges before listening. The normal Resource API does not perform the profile UPDATE using its own DB pool.

### 3. Signed assertion and database enforcement

The gateway reader creates a one-use HMAC assertion using the verified JWT actor ID, operation `business.profile.update`, timestamp, nonce, and exact JSON context `{businessId, patch}`.

The reader calls the seven-argument SQL wrapper:
`ghm.gateway_update_business_profile(actor, issued_at, nonce, context, signature, business_id, patch)`.

The final request-context migration `20261111060000_bind_gateway_assertions_to_request_context.sql`:

- Replaces the older assertion verifier with v2 context-bound HMAC.
- Requires `session_user = 'ghm_actor_gateway'`.
- Restricts assertion operation to the explicit allow-list including `business.profile.update`.
- Enforces a 60-second timestamp window, 32-byte secret, full 32-byte MAC comparison, active account and one-use nonce.
- Checks the signed context equals the actual wrapper arguments: `jsonb_build_object('businessId', p_business, 'patch', p_patch)`.
- Calls the underlying `ghm.update_business_profile(actor, business, patch)` only after assertion verification.

The underlying profile function independently requires an active Business membership with role `owner` or `administrator`, validates the patch and updates only its explicit allow-list. The gateway wrapper rejects `isSupplier`/ `is_supplier` and delegates that capability to its separate dedicated operation.

The final migration revokes PUBLIC, `ghm_runtime` and `ghm_migrator` execution on the gateway wrapper and grants execution to `ghm_actor_gateway`. The earlier gateway migration also revoked `ghm_runtime` execution on the legacy `ghm.update_business_profile(bigint,bigint,jsonb)` function. The wrapper is SECURITY DEFINER, owned by `ghm_schema_owner`, with pinned `pg_catalog,ghm` search path.

### 4. Field contract and identified consistency issue

The Actor Gateway endpoint allow-list includes:
`name, slug, description, phone, email, category, province, city, physicalAddress, whatsapp, website, yearsInBusiness, latitude, longitude, avatarLetter, avatarColor`.

The database function validates these keys (including the conditional `category` column check), plus the separate supplier classification key which the gateway wrapper explicitly refuses.

The Resource API's `parseUpdateBusinessInput()` allow-list currently omits `category`, although the Actor Gateway endpoint and database function accept it. This is not an authorization bypass, but it is a contract mismatch: a caller through the Resource API cannot update `category` even though a direct Actor Gateway caller can. Keep this explicit as a compatibility decision; do not silently broaden it during privilege qualification.

The Resource API parser additionally enforces paired latitude/longitude, type/range constraints, and a maximum of 100 years in business. The database function independently validates coordinate bounds/pairing and allows years through 500. Actor Gateway endpoint relies on database validation for these deeper field constraints. Because the Resource API route is the intended public entry point, its stricter validation applies there; direct Actor Gateway callers must still satisfy database validation. Confirm whether the 100-versus-500 limit is intentional before claiming full API/DB validation parity.

### 5. Test evidence and remaining gaps

Present tests found:
- `src/http/business-profile-gateway-client.test.ts`: bearer forwarding, exact URL/body, gateway denial propagation without fallback, HTTPS-only remote gateway origin.
- `src/db/actor-gateway-business-profile-assertion-migration-contract.test.ts`: signed operation binding, assertion age/replay-related migration markers, full MAC-byte comparison and wrapper grants/revokes.

Qualification gaps:
- No dedicated `business-profile-reader.test.ts` was present in the repository tree at this ref.
- No focused Actor Gateway HTTP route test for the Business profile endpoint was present in `src/actor-gateway/app.test.ts`.
- The SQL migration contract test is largely regex/contract based; it does not execute adversarial database cases for forged actor, wrong context, replay, inactive actor, non-member, member-not-owner/admin, or unsupported fields.
- No disposable PostgreSQL execution evidence for this exact profile wrapper was retrieved in this pass.
- No production proof that the required gateway service, dedicated DB principal, secrets and migration are currently deployed. The construction branch source is not proof of live production state.

### 6. Decision

**Source-level design:** the Business profile write path is correctly routed through the isolated Actor Gateway in the construction branch. JWT identity is independently verified by the gateway; the database independently requires the dedicated gateway session and signed operation/context assertion; the underlying function enforces active owner/administrator membership. Resource API and repository fail closed with no direct-DML fallback.

**Production/cutover decision:** NOT QUALIFIED for production cutover yet. The above is source inspection only. Existing production direct UPDATE privileges must not be revoked based on this review until (a) the construction branch has passed exact-head CI, (b) disposable PostgreSQL adversarial qualification covers the enumerated cases, (c) production gateway deployment/configuration and dedicated principal are independently confirmed, and (d) the full production column ACL rows are mapped to the deployed migration/function contracts.

**Next actions:** add focused reader and HTTP route tests; add disposable PostgreSQL adversarial coverage for signed actor/context/nonce and membership authority; resolve/document `category` and years-limit contract differences; compare all Business profile ACL columns against the underlying function's actual UPDATE list and current production migration state.

No production role/grant/migration/credential/environment/service/deployment/traffic/data changes. No merge. PayFast remains paused.


---

## 2026-11-12 continuation — PR/branch reconciliation and close-out of duplicate Business Profile gaps

The previous gap list was checked against the actual PRs and construction branch. Several items were already implemented; the handover now records them as existing evidence rather than outstanding work.

### Existing PR evidence reconciled

| PR / branch | Existing implementation or evidence | CI / disposition |
|---|---|---|
| #237 `fix/business-profile-compat-contract-20261108` | Business Profile SQL compatibility migration, legacy presentation-field handling and disposable PostgreSQL qualification script. | Open draft PR; do not merge independently without its dependent gateway stack. |
| #271 `security/business-profile-actor-gateway-20261110` | Resource API gateway client; route forwards bearer token; fails closed when gateway absent; Actor Gateway profile endpoint; verified token subject; actor gateway reader; HTTP and Actor Gateway tests. | PR commit `879b22a5a6a03033ff20cd44d258a58101dddec8` quality check passed (2026-11-10). |
| #272 `integration/capability-gateway-qualification-20261110` | Integrated Business Profile signed wrapper, v2 context binding, request-context migration, disposable PostgreSQL profile qualification, CI step and package script. | Exact PR head `382c8880a89ccc0bf51b2b5daa4d9671f825cf8a` quality and web-quality passed (2026-11-12). |
| #274 `docs/render-actor-gateway-role-separation-handover-20261112` | Records Render support's role separation recommendation and unresolved Dashboard-managed role membership authority issue. | Open documentation PR; no production role changes. |

Related earlier gateway work #263–#267 is also present in the PR history: registration identity read/write and actor gateway self-identity/principal guard. These are separate completed/merged milestones, not new Business Profile test gaps.

### Exact construction-head CI evidence before the additional test tranche

Commit `f047cca4234fffdb6581e92e23413636ec980c5a` passed both `quality` and `web-quality` in run `43312771439`. The quality job ran the existing disposable PostgreSQL step `Qualify Business profile gateway and compatibility contract on disposable PostgreSQL` successfully (step 52), as well as the full TypeScript test suite (step 41).

### Corrections to earlier gap statements

1. **Actor Gateway HTTP route test:** already exists in `src/actor-gateway/app.test.ts` for verified token subject, valid patch forwarding, and missing bearer token rejection.
2. **Resource API HTTP route tests:** already exist in `src/http/app.test.ts` for gateway forwarding and fail-closed 503 when gateway is absent. The client tests also cover gateway denial propagation without fallback.
3. **PostgreSQL adversarial qualification:** already exists in `scripts/qualify-business-profile-contract-postgres.mjs` and is executed in CI. It tests runtime direct-RPC denial, gateway-wrapper denial for runtime, forged HMAC, altered patch context, target substitution, expired assertion, wrong operation, nonce replay, unsupported supplier classification, conflicting aliases, coordinate pairing, and member-role denial. The script also checks separate runtime, migrator and Actor Gateway session identities.
4. The SQL assertion verifier checks active `account_identity.account_status='active'`; however, the profile-specific PostgreSQL script did not have a dedicated disabled-account fixture/assertion. The broader assertion framework's active-account requirement is not a substitute for an explicit profile-wrapper disabled-account regression.
5. **No dedicated reader unit test** existed in the integrated branch. This was a genuine gap and is now added.
6. **Category and years validation:** the Resource API parser deliberately exposes a narrower public contract than the underlying compatibility SQL function. SQL accepts `category` and up to 500 years; Resource API excludes `category` and caps `yearsInBusiness` at 100. The gateway's public endpoint also accepts `category` and relies on SQL validation for numeric bounds. This is a contract inconsistency to preserve/document and resolve deliberately, not a reason to broaden the public Resource API automatically.

### New implementation added to current construction branch

Added `src/actor-gateway/business-profile-reader.test.ts` with:
- Exact wrapper SQL and parameter-order assertion.
- Verified HMAC payload binding to actor, operation, target Business ID and exact patch.
- Commit on success.
- Rollback and client release on database denial.
- Rejection of non-canonical or non-32-byte assertion secrets.

Added the new reader test to the `npm test` command in `package.json`.

Extended `scripts/qualify-business-profile-contract-postgres.mjs`:
- Creates a disposable account with lifecycle status `disabled`.
- Attempts a validly signed Business Profile update as that disabled account.
- Requires the database to reject it with `Active actor account required`.
- Cleans up the disabled fixture with the existing disposable test rows.

These changes are on the construction branch, commits:
- `22a2b8ee0d19e1d68cbb58b228e764a6458f67fb` — reader tests.
- `a2b2a58ceae55f5f4bb4bf1bd35ed9fa836a2eca` — test runner includes reader tests.
- `e72ce42b9cd44f5bab3468b8e485784b997b3c19` — disabled-account PostgreSQL regression.

CI for the new commits was still running at the time of this handover update; do not report it passed until the exact final head's `quality` job confirms it. The earlier `f047cca` CI pass does not cover these new edits.

### Updated Business Profile decision

The Business Profile source architecture and most adversarial cases were already implemented in PRs #237, #271 and #272. The only new code added in this pass is the dedicated reader unit test and explicit disabled-account database regression. No duplicate HTTP suite or duplicate PostgreSQL qualification script was created.

Still unresolved before any production permission revocation:
- Confirm exact deployed migration/function state; construction branch/PR CI is not production evidence.
- Map every production Business profile column ACL row to the exact SQL UPDATE list.
- Decide whether the Resource API contract should expose `category` and whether the gateway's direct category acceptance is intentional.
- Decide whether 100 years is a public API policy while 500 remains a database compatibility ceiling.
- Resolve Render principal/role-membership administration and independently verified production backup prerequisites.

**No production role, grant, migration, credential, secret, Render service, deployment, traffic or application data was changed. No PR merged. PayFast remains paused.**


---

## 2026-11-12 continuation — wider open-PR reconciliation and CI fixture corrections

### 1. Additional open PRs reviewed against current construction branch

| PR | Finding | Current construction relationship |
|---|---|---|
| #269 Capability Governance Actor Gateway | Four gateway SQL wrappers and separate capability-governance reader; dedicated capability qualification includes admin/non-admin, runtime-vs-gateway principal separation, direct DML denial and lifecycle/invariant checks. | Gateway SQL migration `20261110250000_add_gateway_capability_governance.sql` is byte-identical on the construction branch. Reader source differs from PR head, so it must be reviewed at construction HEAD, not copied from PR branch. |
| #270 Supplier Classification Actor Gateway | Dedicated gateway write wrapper, reader, Resource API gateway client, route and disposable PostgreSQL qualification; legacy runtime RPC revoked by migration. | Cutover migration `20261110260000_gateway_supplier_classification_cutover.sql` is byte-identical on construction. Reader and qualification script differ from PR head; integrated construction versions are authoritative for continued audit. |
| #268 Capability Catalogue cross-row invariants | SQL trigger/migration and disposable PostgreSQL invariant qualification. | Remains a dependency in the stacked capability-governance branch chain; do not cherry-pick or independently merge out of order. |
| #250 Capability Catalogue governance API | Admin governance API, repository/service/router tests and disposable PostgreSQL qualification. | Base of #268/#269 stack; preserve merge ordering. |
| #243 Marketplace Supplier classification | Supplier classification domain and wider Marketplace stack. | Base dependency for #270 and #244; no independent merge while its dependent security stack is being reconciled. |
| #244 Business Engagement and Analytics | Identifies the previously unresolved `business_engagement_event` table. Migration grants runtime INSERT only on `business_id, account_id, event_type, event_context, source` and SELECT on `id, business_id, account_id, event_type, event_context, source, created_at`; sequence USAGE/SELECT is separately granted. | PR #244 is open and stacked on #243. Its migration and repository files are absent from the current construction branch and therefore are not proof of a deployed production caller or current production grant. |

### 2. Engagement-event caller now identified (but not yet production ACL evidence)

PR #244 implements:
- Authenticated `POST /api/v1/business-engagement-events`.
- Actor/account ID comes from verified `AuthContext.userId`; caller cannot supply actor ID.
- `PostgresBusinessEngagementRepository.record()` uses an authorized transaction and writes the five explicitly granted columns.
- Only active, verified and approved Business records are eligible.
- Active members of the target Business are excluded from self-engagement.
- Per-account 60-events/minute limit is enforced transactionally using advisory lock + count.
- PR #244 disposable PostgreSQL qualification tests authenticated event insert, self-engagement denial, rate limit and analytics entitlement fail-closed behavior.

**Critical provenance boundary:** PR #244 is an open stacked PR and its migration/source are not present in construction HEAD. Do not use it to explain any production `business_engagement_event` privilege unless a separate deployed migration or production catalog observation establishes that table/grant. It does, however, resolve the source caller for the proposed PR #244 grant.

### 3. Existing integrated test coverage retained

Do not recreate:
- Capability governance wrapper qualification.
- Supplier Classification gateway wrapper qualification.
- Business Profile gateway HTTP tests and PostgreSQL adversarial suite.
- Registration identity and Actor Gateway identity tests.
- Storage provider attestation qualification.

The current construction branch contains the capability and supplier-classification gateway SQL migrations from #269/#270. Their corresponding readers differ from their PR head blobs; the construction copies are the versions to audit.

### 4. CI failure investigation and correction

The first new Business Profile reader test run exposed a real test assertion bug:
- `JSON.parse(String(values[6]))` creates a new object, but the test used `assert.equal` (reference equality).
- Changed to `assert.deepEqual` (structural equality). Commit: `a3144988c9c42135a420f70aab71117490a76f7c`.

The first disabled-account disposable PostgreSQL fixture also tried to UPDATE `account_identity.account_status` directly as `ghm_migrator`, which is intentionally denied because account lifecycle columns are mutated only through `auth_*` SECURITY DEFINER functions.
- Changed fixture setup to call the established `ghm.auth_disable_account($1)` lifecycle function through the runtime principal.
- Commit: `160d20014ba60b28b0334361e08c949e02b6e18a`.

The failed earlier runs (`43313824504`, `43313832844`, `43313919003`) are not qualification passes. At this update, exact-head CI for `160d20014ba60b28b0334361e08c949e02b6e18a` is still in progress (run `43314318722`). Wait for both `quality` and `web-quality` to complete before reporting pass.

### 5. PR/branch merge policy

No PR was merged or closed. The current construction branch remains the integration/qualification branch. Stacked dependencies remain:
- #237 → #271 → #272 (Business Profile compatibility + gateway qualification).
- #243 → #270 and #244 (Marketplace supplier classification and engagement/analytics).
- #250 → #268 → #269 (Capability catalogue invariants and Actor Gateway governance).

PR #274 remains the Render role-separation handover. It documents the unresolved Render-managed membership/admin-option authority issue; do not attempt a production revoke or role mutation from this audit.

**Production boundary:** no production grants/roles, SQL migrations, credentials, secrets, environment variables, Render services, deployments, traffic or application data changed. No PR merge. PayFast remains paused.


### Follow-up correction to disabled-account fixture authority

The first correction changed the fixture from direct UPDATE to `ghm.auth_disable_account($1)`, but a log review showed the current construction ACL intentionally revokes that function from `ghm_runtime`. Therefore the fixture must not call it through the runtime principal.

Final fixture setup now calls the existing `ghm.auth_disable_account($1)` SECURITY DEFINER lifecycle function using the disposable qualification connection after `SET ROLE ghm_schema_owner` under the dedicated `ghm_migrator` login. This preserves the invariant that account lifecycle changes occur only through the governed auth function, without reintroducing runtime EXECUTE or direct table UPDATE.

Final correction commit: `12e75e8a142150c8ebb3dac1f1e0cda3ff871941`. Exact-head workflow run `43314592392` is still running at the time of this update. The prior fixture attempts are failed runs and are superseded; only the final exact-head CI result may qualify this change.


---

## 2026-11-12 continuation — registration identity cutover source and remaining PR dispositions

### 1. Registration identity: PR #264 checkpoint is superseded by construction source

PR #264 (`docs/gateway-registration-identity-checkpoint-20261110`) is a documentation-only checkpoint based on the earlier state after PR #263. Its patch says the Resource API still uses the legacy registration-identity read and that a fail-closed gateway client is the next step.

That is now stale relative to construction HEAD `20660992490318eb9e8aafe40afd4db2401a1822`. Verified construction source:

- `src/http/business-registration-identity-gateway-client.ts` provides the HTTP client.
- `src/http/business-registration-identity-router.ts` routes both read and update through the gateway when configured and returns 503 rather than using legacy service methods when `gatewayRequired` is true.
- `src/http/app.ts` constructs the client from `config.actorGatewayUrl` and registers the route with `gatewayRequired = config.isProduction || explicit test override`. Production therefore fails closed if the gateway is not configured.
- `src/actor-gateway/app.ts` exposes GET and PUT registration-identity routes; actor identity comes from verified token middleware.
- `src/actor-gateway/business-registration-identity-reader.ts` signs operation-specific v2 assertions binding actor, Business ID and update fields.
- Migrations `20261110230000_add_gateway_business_registration_identity_read.sql`, `20261110233000_add_gateway_business_registration_identity_write.sql`, `20261111050000_bind_registration_and_self_identity_to_signed_gateway_actor.sql`, and `20261111060000_bind_gateway_assertions_to_request_context.sql` provide the SQL wrappers and signed request-context enforcement.
- The manual cutover `database/cutovers/20261111020000_revoke_legacy_registration_identity_runtime.sql` is a separate artifact and is **not evidence it has been applied to production**.

Disposition: registration identity GET/PUT source migration is present on construction branch; production deployment, configuration, and manual legacy-grant cutover remain separate gates. Do not merge stale PR #264 solely to import its historical checkpoint; its facts have been superseded by this handover and the current construction implementation. No PR was closed.

### 2. Remaining open PR dispositions

| PR | Disposition for this security qualification |
|---|---|
| #264 registration identity checkpoint | Documentation-only, superseded by construction source described above. Retain historical record; no code gap remains on construction for the gateway client/routes. Production cutover remains unproven. |
| #201 QuoteFlow legal acceptance | Outside current security cutover. Legal documents and legal publication remain paused by owner direction until systems are stable. Do not merge, publish legal content, or enable acceptance workflow in this tranche. |
| #233 PayFast timezone handling | Outside current security cutover. PayFast sandbox access is unavailable and payment activation remains frozen. Do not activate payment processing or treat this PR as payment qualification. |
| #274 Render role separation handover | Keep as an open operational blocker record. Render support recommended SQL-created login(s) outside the Dashboard-managed credential list for normal app execution; production membership/admin-option authority still needs resolution. No role mutation here. |
| #237/#271/#272 Business Profile stack | Preserve stacked dependency and exact-head construction implementation. No independent merge. |
| #243/#270 and #243/#244 Marketplace stack | Preserve dependency order. PR #244 is still only proposed source for engagement-event DML, not proof of deployed production grant. |
| #250/#268/#269 Capability Governance stack | Preserve dependency order. No independent merge. |

### 3. Exact-head CI verification after fixture correction

The disabled-account fixture's previous failed runs are superseded by the final fixture commit `12e75e8a142150c8ebb3dac1f1e0cda3ff871941`. Exact-head run `43314592392` completed successfully:
- `quality` — success.
- `web-quality` — success.

The latest construction branch HEAD is the subsequent handover-only commit `20660992490318eb9e8aafe40afd4db2401a1822`. Its exact-head run `43314669620` also completed successfully:
- `quality` — success.
- `web-quality` — success.

Thus the new Business Profile reader unit tests and disabled-account PostgreSQL adversarial fixture are included in a passing quality run. The disabled fixture is created through `ghm.auth_disable_account($1)` on the disposable qualification connection after setting `ghm_schema_owner`; this does not grant runtime execution or direct lifecycle-column DML. The PostgreSQL qualification step passed in the exact code-head run.

### 4. Remaining security qualification boundary

The existing PR/branch review confirms that much of the security work already exists; avoid recreating it. The remaining material gaps are not missing generic test suites:

1. Retrieve the complete, row-level production column ACL snapshot (all 156 INSERT, 60 UPDATE and 7 SELECT entries) with grantor/grantee/column/grant-option fields. The current handover preserves counts and examples but not the full row matrix as an independently retrievable artifact.
2. Reconcile every exact production column ACL row to the deployed production source commit, not just construction source. The existing table-level caller map and partial seven-file blob comparison are not sufficient to sign off all rows.
3. Complete production-versus-construction mapping for all 21 INSERT and 12 UPDATE tables, including each exact written column list, repository method, service, route/internal producer and authorization predicate.
4. Trace the account-identity profile update method and all production columns separately; current inspected app has no registered profile-update route, while deployed production ACLs include column UPDATE.
5. Finish the full repository-wide notification producer search before relying on the single registered POST route as the only INSERT producer.
6. Confirm production Actor Gateway deployment, environment variables, isolated database principal and migration state independently. Construction CI is not deployment evidence.
7. Resolve Render's Dashboard-managed role membership/admin-option issue and fresh backup evidence before planning production principal cutover.

**No production ACL, role, membership, migration, credential, secret, environment variable, Render service, deployment, traffic, bucket, object or application data was changed. No PR merged or closed. PayFast and legal publication remain paused.**


---

## 2026-11-12 continuation — expanded production/deployed repository blob comparison

**Production source ref:** `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`.  
**Construction source ref:** `20660992490318eb9e8aafe40afd4db2401a1822`.  
**Method:** fetched each exact repository file at both commits and compared Git blob SHA. Matching hashes establish byte-identical repository SQL implementations at these two refs. This does not establish that every route, environment setting or production database migration is identical.

### Result: 15 of 16 reviewed resource repositories are byte-identical

| Resource repository | Result |
|---|---|
| `business-capability/repository.ts` | Identical |
| `business-capability-evidence/repository.ts` | Identical |
| `business-category/repository.ts` | Identical |
| `business-offering/repository.ts` | Identical |
| `customer/repository.ts` | Identical |
| `enquiry/repository.ts` | Identical |
| `opportunity-participant/repository.ts` | Identical |
| `opportunity/repository.ts` | Identical |
| `project/repository.ts` | Identical |
| `project-quote/repository.ts` | Identical |
| `quote/repository.ts` | Identical |
| `notification/repository.ts` | Identical |
| `review/repository.ts` | Identical |
| `support-request/repository.ts` | Identical |
| `commercial/repository.ts` | Identical |
| `business-identity/repository.ts` | **Different** |

The 15 matching files include the SQL-producing repositories for the majority of the already mapped production column DML domains. Their deployed repository statements therefore match the construction source at these exact refs. The existing source-to-route and authorization map remains applicable for those repository implementations, subject to the separate route wiring and deployed schema/ACL checks.

### Sole repository difference: Business Identity

The only differing file in this 16-file sample is `src/resources/business-identity/repository.ts`.

- Production source contains the direct Business profile UPDATE path.
- Construction source replaces that direct repository operation with a fail-closed error requiring the authenticated Actor Gateway.
- Construction's registered PATCH route forwards bearer authentication to the gateway; when the gateway is missing or fails, it does not fall back to direct Resource API DML.
- Construction's separate `updateAccount()` direct UPDATE of `account_identity` remains in the repository, but the inspected application wiring has no registered account-profile update route. Keep this method/ACL mapping unresolved until the full call graph and exact production column grants are inspected.

This is a real, intentional source delta. Do not describe the production Business profile write as already gateway-routed: the deployed production ref is the direct-write implementation. Do not revoke its production UPDATE grants until the gateway replacement is deployed, verified and the corresponding migration is applied under a separately approved cutover.

### Scope limitation — not yet a full ACL reconciliation

This comparison covers 16 repository files selected from the known production column DML caller map. It does not itself contain the exact 156 INSERT / 60 UPDATE / 7 SELECT ACL rows, and it does not prove the entire 21-table/12-table ACL matrix is exhausted. Remaining steps:
1. Retrieve the complete row-level production column ACL query result; the 39 KB SECURITY DEFINER workflow artifact is a different inventory and must not be mistaken for the DML ACL matrix.
2. Map each exact ACL row and column list to its SQL statement in the matching repository, including any direct statements outside the selected 16 repositories.
3. Compare application route/service wiring at both refs for each mapped write, rather than treating repository blob identity as route identity.
4. Resolve the account identity profile-update method and all six production account identity UPDATE columns.
5. Finish repository-wide search for additional notification producers and engagement-event writers.

### CI and branch checkpoint

The Business Profile disabled-account regression and reader unit tests passed on exact code head `12e75e8a142150c8ebb3dac1f1e0cda3ff871941`, run `43314592392` (quality + web-quality). The next exact construction head `20660992490318eb9e8aafe40afd4db2401a1822` also passed both jobs, run `43314669620`.

This handover continuation is committed as `c4a1cb2efcfa35e4639de0d98d55f4f818c85111`; its own exact-head CI run `43315369602` was in progress when this note was authored. Do not report that documentation-head run as passed until both jobs finish.

**No production grants, roles, memberships, migrations, credentials, secrets, environment variables, Render services, deployments, traffic, storage objects or application data changed. No PR was merged or closed. PayFast and legal publication remain paused.**


---

## 2026-11-12 22:03 UTC — live production column ACL snapshot recovered

### 1. Provenance and query context

The missing production ACL matrix has now been retrieved directly from the live Render PostgreSQL instance:

- Render database: `ghm-db`, database `ghm_db`, PostgreSQL 18.6.
- Render Postgres resource ID: `dpg-dag0sdtbedkc7389vi2g-a`.
- Snapshot time: `2026-11-12T22:03:18.829831Z`.
- Query connection: `session_user = ghm_app_user`; `current_user = ghm_db_user`.
- Query was executed through Render's read-only SQL transaction.
- Catalog source: `pg_attribute.attacl`, expanded with `aclexplode`, including table, column, privilege, grantor, grantee and grant-option status.

The snapshot reproduces the previously reported counts exactly. Every row is granted to `ghm_runtime`, by `ghm_schema_owner`, with no grant option.

| Privilege | Column grants | Tables | Grantees | Grant-option rows |
|---|---:|---:|---:|---:|
| INSERT | 156 | 21 | 1 | 0 |
| UPDATE | 60 | 12 | 1 | 0 |
| SELECT | 7 | 1 | 1 | 0 |
| **Total** | **223** | | | **0** |

This is the actual production column ACL matrix, not the SECURITY DEFINER inventory.

### 2. Complete INSERT column matrix — 156 grants

| Production table | Exact INSERT columns |
|---|---|
| `business_capability` | `business_id, capability_id, created_by, description, effective_from, effective_until, proficiency_level, source_reference` |
| `business_capability_evidence` | `business_capability_id, description, evidence_type, evidence_url, expires_on, issued_on, issuer_name, reference_number, submitted_by, title, visibility` |
| `business_category_assignment` | `business_id, category_id, created_by, is_primary` |
| `business_engagement_event` | `business_id, account_id, event_context, event_type, source` |
| `business_offering` | `business_id, created_by, currency_code, description, name, offering_type, price_amount, price_unit, slug, sort_order` |
| `commercial_event` | `actor_account_id, business_id, event_type, idempotency_key, occurred_at, payload, source, subscription_id` |
| `commercial_payment_attempt` | `amount_minor_units, attempt_status, billing_interval, business_id, currency_id, expires_at, idempotency_key, initiated_by, price_id, subscription_id` |
| `commercial_subscription` | `business_id, current_period_end, current_period_start, lifecycle_status, plan_version_id, price_id, trial_id` |
| `commercial_trial` | `activated_at, activated_by, business_id, expires_at, lifecycle_status, plan_version_id` |
| `customer` | `account_id, email, name, phone` |
| `enquiry` | `budget_max, budget_min, business_id, city, customer_email, customer_id, customer_name, customer_phone, description, opportunity_id, project, source, urgency` |
| `notification` | `body, metadata, title, type, user_id` |
| `opportunity_capability_requirement` | `capability_id, created_by, description, importance, minimum_proficiency_level, opportunity_id, sort_order` |
| `opportunity_participant` | `account_id, business_id, created_by, opportunity_id, participation_role, participation_status` |
| `project` | `account_id, budget_max, budget_min, category, city, description, province, title, urgency` |
| `project_quote` | `amount, business_id, description, duration_days, labour_max, labour_min, materials_max, materials_min, project_id, total_max, total_min` |
| `quote` | `account_id, amount, customer_email, customer_id, customer_name, customer_phone, description, follow_up_date` |
| `quote_line_item` | `catalog_item_id, description, quantity, quote_id, unit_price` |
| `review` | `body, business_id, moderated_at, moderated_by, moderation_reason, moderation_status, rating, reviewer_id, reviewer_name, title` |
| `support_request` | `account_id, business_id, category, description, subject` |
| `support_request_message` | `account_id, body, sender_kind, support_request_id` |

### 3. Complete UPDATE column matrix — 60 grants

| Production table | Exact UPDATE columns |
|---|---|
| `account_identity` | `avatar_ref, business_operator_intent, connect_role, full_name, phone, updated_at` |
| `business` | `rating, review_count, updated_at` |
| `business_category_assignment` | `is_primary` |
| `business_offering` | `currency_code, description, is_active, name, offering_type, price_amount, price_unit, slug, sort_order` |
| `customer` | `status, updated_at` |
| `enquiry` | `status` |
| `notification` | `is_read, read_at` |
| `project` | `budget_max, budget_min, category, city, description, province, status, title, updated_at, urgency` |
| `project_quote` | `amount, description, duration_days, labour_max, labour_min, materials_max, materials_min, status, total_max, total_min, updated_at` |
| `quote` | `notes, reminder_date, reminder_id, status, updated_at` |
| `review` | `moderated_at, moderated_by, moderation_reason, moderation_status, updated_at` |
| `support_request` | `closed_at, resolution_summary, resolved_at, status, updated_at` |

### 4. Complete SELECT column matrix — 7 grants

| Production table | Exact SELECT columns |
|---|---|
| `business_engagement_event` | `account_id, business_id, created_at, event_context, event_type, id, source` |

### 5. New production-vs-source discrepancy: Business Engagement

The live production catalog contains `ghm.business_engagement_event`:

- Owner: `ghm_schema_owner`.
- Exact columns: `id, business_id, account_id, event_type, event_context, source, created_at`.
- Its production INSERT and SELECT column ACLs exactly match the grants in PR #244's migration `20261110020000_create_business_engagement_analytics.sql`.
- PR #244's source defines the authenticated `POST /api/v1/business-engagement-events` route, uses `AuthContext.userId` as the account ID, excludes active Business members, requires an active/verified/approved Business, and applies a transactionally serialized 60-events/minute limit.
- PR #244 remains open and stacked on #243.
- Neither the migration nor the engagement resource/router files exist in production source tree ref `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`.

This changes the earlier conclusion: there **is** a real production table and a real production runtime column ACL for engagement events. It is no longer accurate to say the grant is merely proposed or absent from production.

The database object and grants closely match PR #244's migration, but the exact migration-ledger row could not be read through the available production query identity: SELECT on `ghm.ghm_schema_migrations` returned SQLSTATE 42501. Therefore the migration's precise ledger provenance and the live HTTP route's deployment status remain unverified. Do not assume the route is deployed merely because its database object exists. Resolve this as a production schema/source provenance discrepancy, not by creating a duplicate table or reapplying the migration.

### 6. Newly highlighted account-identity UPDATE scope

The live production ACL contains six account-identity UPDATE columns:
`full_name, phone, avatar_ref, updated_at, connect_role, business_operator_intent`.

The earlier handover's narrower profile-field summary was incomplete. In particular, `connect_role` and `business_operator_intent` need explicit callsite and lifecycle-authority mapping. Do not infer they are safe profile fields or revoke them based only on their names.

### 7. Immediate next source reconciliation

With the full production matrix now preserved, continue by mapping the exact live column groups to deployed repository SQL, service/route wiring and authorization:
1. Resolve `account_identity` six-column UPDATE, including `connect_role` and `business_operator_intent`.
2. Resolve `business.rating/review_count` UPDATE to the exact review aggregation trigger/function or application caller.
3. Confirm Business Offering, category assignment, capability and evidence write routes against their exact granted columns.
4. Reconcile the 21 INSERT table groups and 12 UPDATE table groups against the production source tree, including route wiring and any triggers.
5. Resolve Business Engagement's production object/ACL versus source/ledger discrepancy.
6. Check table-level ACLs, sequence ACLs and inherited membership separately; this snapshot is specifically the column ACL matrix.

**No production mutation was performed.** The only production interaction was catalog inspection and read-only queries. No grant, role, membership, migration, secret, environment variable, Render service, deployment, traffic, or application data was changed. No PR was merged or closed. PayFast and legal publication remain paused.


## 2026-11-12 22:10 UTC — production column ACL to deployed repository caller mapping

Production source ref remains `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`. The following mappings were checked against the exact repository SQL and service code at that ref.

### 1. Directly reconciled domains

| Production table / ACL | Deployed source caller | Authorization / invariant | Finding |
|---|---|---|---|
| `business_capability` INSERT (8 columns) | `PostgresBusinessCapabilityRepository.createBusinessCapability` | Tenant transaction; owner/administrator membership; capability must be active and selectable. | Exact eight written columns match ACL. |
| `business_capability_evidence` INSERT (11 columns) | `PostgresBusinessCapabilityEvidenceRepository.create` | Reads active Business Capability assertion; resolves tenant; owner/administrator required. | Exact eleven written columns match ACL. Evidence status transitions use `ghm.transition_business_capability_evidence` rather than direct UPDATE. |
| `business_category_assignment` INSERT (4 columns), UPDATE `is_primary` | `assignBusinessCategory`, `setPrimaryBusinessCategory` | Tenant transaction; owner/administrator; category must be selectable; target assignment row locked before primary change. | INSERT and both UPDATE statements match exact column grants. |
| `business_offering` INSERT (10 columns), UPDATE (9 columns) | `createBusinessOffering`, `updateBusinessOffering` | Active tenant membership; owner/administrator; update allow-list maps to exact SQL column names. | Exact INSERT/UPDATE column sets match ACL. |
| `review` INSERT (10 columns), UPDATE moderation fields (5 columns) | `createReview`, `moderateReview` | Create requires active/verified/approved Business and excludes Business owner; moderation route is admin-only and only pending rows transition. | INSERT and moderation UPDATE fields match the ACL. |
| `business.rating, business.review_count, business.updated_at` UPDATE | `refreshBusinessReviewAggregate` in review repository | Called after moderation approval; aggregate counts/averages only approved reviews. | All three granted columns are explicitly updated by the deployed review aggregate caller. |
| `account_identity` UPDATE `full_name, phone, avatar_ref, updated_at` | `PostgresBusinessIdentityRepository.updateAccount` | Authenticated transaction, target account is `context.userId`; route/service exposes own-profile update. | Four columns match this method's SQL. |
| `business` profile update | Production Business Identity repository calls `ghm.update_business_profile(actor, tenant_business, patch)`. | Tenant transaction; owner/administrator; strict profile-field allow-list; SECURITY DEFINER function performs governed update. | This is not a direct UPDATE covered by the three Business column grants; it is a separate privileged function path. |
| `business_engagement_event` INSERT (5 columns), SELECT (7 columns) | PR #244's `PostgresBusinessEngagementRepository.record`; not present in production source ref. | PR code uses authenticated actor, approved/active Business, member self-engagement exclusion and transactional rate limit. | Live object/grants exist, but deployed route/repository is absent from production source ref; deployment/ledger provenance remains unresolved. |

### 2. Account identity: excess/unmapped UPDATE columns

The production account profile repository writes only:
`full_name, phone, avatar_ref, updated_at`.

The live production ACL additionally grants UPDATE on:
- `connect_role`
- `business_operator_intent`

Neither column appears in the inspected production Business Identity repository UPDATE statement or its profile service mapping. A repository-wide code-search query for those exact identifiers returned no source matches, but that search result alone is not sufficient to prove no dynamic SQL, older mounted route, trigger or out-of-tree producer exists.

Disposition: mark these two column grants **unmapped pending exhaustive source/route/trigger search**. Do not revoke them in production from this evidence alone. Trace their grant-origin migration, all routes and triggers, and confirm production deployment/source commit before deciding.

### 3. Review aggregate execution nuance

The review aggregate update is issued by the Resource API repository inside the authorized review transaction after a review moderation transition results in an approved review. It is not a database trigger. The query explicitly updates `rating`, `review_count` and `updated_at`; these three column ACLs are therefore accounted for by a live deployed caller.

### 4. Capability evidence and verification authority nuance

Evidence creation is direct INSERT with exact column set. Evidence verification itself is not a direct UPDATE: repository calls the SECURITY DEFINER transition function. Capability assertion verification similarly uses `ghm.transition_business_capability_verification`; the direct capability INSERT grant is used only for business owner/administrator assertion creation. This separation is intentional and should not be flattened into one direct-DML permission model.

### 5. Still outstanding after this pass

This pass has source-mapped the capability, evidence, category, offering, review aggregate, own-profile and Business profile domains. It has **not yet** completed all 21 INSERT and 12 UPDATE table mappings. Remaining domains requiring exact deployed route/source inspection include:
- `customer`, `enquiry`, `notification`;
- `opportunity_capability_requirement`, `opportunity_participant`;
- `project`, `project_quote`;
- `quote`, `quote_line_item`;
- `support_request`, `support_request_message`;
- `commercial_event`, `commercial_payment_attempt`, `commercial_subscription`, `commercial_trial`.

The complete ACL matrix is now preserved above; continue mapping the remaining groups without duplicating already proven routes or tests.

**Production safety:** only read-only Render catalog queries and GitHub source reads were performed. No production grants, roles, memberships, schema, data, secrets, configuration, Render services, deployment or traffic changed. No PR merged/closed. PayFast and legal publication remain paused.


## 2026-11-12 22:15 UTC — remaining production INSERT/UPDATE caller mapping

The following deployed-source mappings were verified against repository SQL at production ref `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`. They explain the production column groups without assuming any new permissions.

| Table / ACL group | Deployed SQL caller | Key authorization / constraints |
|---|---|---|
| `customer` INSERT `account_id,name,phone,email` | `PostgresCustomerRepository.createCustomer` | Authorized transaction; caller account ID is `context.userId`. |
| `customer` UPDATE `status,updated_at` | `setStatus` via archive/restore | Authorized transaction; admin or row predicate `account_id = context.userId`. |
| `enquiry` INSERT (13 columns) | `PostgresEnquiryRepository.createEnquiry` | Requires eligible marketplace Business; atomically creates Opportunity, creator/owner/recipient participants and Enquiry in one authorized transaction. Exact Enquiry columns match ACL. |
| `enquiry` UPDATE `status` | `updateReceivedEnquiryStatus` | Requires active Business owner through received-enquiry lookup before status update. |
| `opportunity_participant` INSERT (6 columns) | Opportunity create, Project create, Enquiry create, and participant repository | Exact six-column tuple `opportunity_id, account_id, business_id, participation_role, participation_status, created_by`; caller-specific participant/manager checks. |
| `opportunity_capability_requirement` INSERT (7 columns) + DELETE | `PostgresOpportunityRequirementsRepository.replaceRequirements` | Opportunity manager check; validates active/selectable capabilities; replacement is one authorized transaction. DELETE is required by this live replacement path and is not an unexplained legacy grant. |
| `project` INSERT (9 columns) | `PostgresProjectRepository.createProject` | Creates linked Opportunity and creator participant atomically; project owner is authenticated `context.userId`. |
| `project` UPDATE (10 columns) | `updateOwnedProject`, `transitionOpenProjectToInProgress` | Owner predicate `account_id=context.userId`; ordinary edits restricted to open Projects; transition helper only performs open → in_progress as part of accepted Project Quote. |
| `project_quote` INSERT (11 columns) | `PostgresProjectQuoteRepository.create/submit` path | Active Business owner; target Project and Business eligibility validated. |
| `project_quote` UPDATE (11 columns) | Update submission and accept/reject methods | Active Business owner for submission; Project owner/creator authority for accept/reject; row/status predicates and one transaction. Fields match the full granted UPDATE set. |
| `quote` INSERT (8 columns) and `quote_line_item` INSERT (5 columns) | `PostgresQuoteRepository.createQuote` | Customer must belong to caller and be active; quote and line items created in one authorized transaction. |
| `quote` UPDATE (5 columns) | `setQuoteStatus`, `setQuoteNotes` | Admin or row predicate `account_id=context.userId`; exact granted status/reminder/notes/timestamp fields. |
| `notification` INSERT (5 columns) | `PostgresNotificationRepository.createNotification` | Recipient must exist; non-admin lead notification cannot target a different account; route checks registered operation and resource permission. |
| `notification` UPDATE (2 columns) | mark one/all read methods | Strictly scoped to `user_id=context.userId`; only `is_read` and `read_at`. |
| `support_request` INSERT (5 columns) + `support_request_message` INSERT (4 columns) | `createSupportRequest`, customer/admin reply methods | Customer/business role for request/reply; optional Business membership check; request owner check for customer; admin role for staff actions. |
| `support_request` UPDATE (5 columns) | Admin status transition and customer/admin reply reopening | Admin-only status operation; replies lock request and update status/closure fields under the relevant requester/admin identity. |
| `commercial_trial` INSERT (6 columns), `commercial_subscription` INSERT (7 columns), `commercial_event` INSERT (8 columns) | `activateTrial` | Business management access; active plan/version and trial eligibility checked; trial, subscription and audit event inserted together. |
| `commercial_payment_attempt` INSERT (10 columns), `commercial_event` INSERT (8 columns) | payment preparation flow | Business management access, eligible price and idempotency; creates pending checkout attempt plus event. PayFast activation remains frozen; do not invoke this flow or interpret source presence as provider qualification. |

### Additional conclusions from this pass

- The Opportunity Requirements DELETE privilege is accounted for by an explicit replacement implementation. Retain it unless that application operation is redesigned and qualified.
- Project create writes Opportunity and Opportunity Participant rows as well as Project; these are separate SQL statements in the same transaction. Their table-level/column-level privilege contracts must be considered separately from the Project column ACL.
- The Commercial source has trial activation and pending payment-preparation paths. Their existence is not approval to enable PayFast. Provider activation and ITN processing remain paused pending sandbox access and the separately frozen payment qualification.
- Notification's registered POST route is a real generic producer, but a full repository-wide producer/trigger inventory is still required before declaring it the only notification writer.
- The production source contains no `business-engagement` resource/router; PR #244 is still the matching source for the live engagement table/ACL, so deployment/ledger provenance remains open.
- The only account-identity direct UPDATE caller found in the deployed Business Identity repository writes `full_name, phone, avatar_ref, updated_at`. The extra `connect_role` and `business_operator_intent` ACL columns remain unmapped and require migration/trigger/source provenance review.

### Status after this pass

The known 21 INSERT table groups and 12 UPDATE table groups now have source-level candidate callers mapped, with the following unresolved exceptions/qualifications explicitly retained:
1. `business_engagement_event`: live production object/grants but missing from deployed source snapshot and migration ledger inaccessible under read-only query principal.
2. `account_identity.connect_role` and `business_operator_intent`: no direct UPDATE caller found in deployed Business Identity repository; require exhaustive producer and grant-origin review.
3. Business profile writes use the SECURITY DEFINER `ghm.update_business_profile` path in production; construction has moved this to Actor Gateway and must not be treated as already deployed.
4. Route wiring, table-level grants, sequence grants, trigger effects and migration application state still require separate reconciliation for each table.

This is a source-callsite reconciliation, not permission approval. No production grants are proposed for removal until every caller and non-HTTP producer is accounted for and the replacement is deployed/qualified.

**No production changes were made.** Only read-only catalog queries and GitHub source inspection occurred. No production grant, role, membership, migration, credential, secret, Render setting, deployment, route, traffic, or application data changed. No PR merged/closed. PayFast and legal publication remain paused.


## 2026-11-12 22:20 UTC — production table-level ACL, sequence ACL and role-membership audit

### 1. Table-level DML grants discovered outside the column matrix

The direct table ACL snapshot for `ghm_runtime` (grantor `ghm_schema_owner`, no grant options) contains:

| Object | Table-level privilege | Disposition |
|---|---|---|
| `business` | INSERT | Used by Business creation, whose columns extend beyond the column-ACL profile fields. |
| `business_membership` | INSERT | Used by atomic Business + owner membership creation. |
| `opportunity` | INSERT, UPDATE | Used by Opportunity/Project/Enquiry creation and lifecycle/edit operations; exact callers must continue to be considered with full table-level authority, not only column grants. |
| `opportunity_capability_requirement` | DELETE | Used by the authorized replacement operation documented above. |

There are also direct table-level SELECT grants on 38 relations and SELECT on the `project_public` view. The relation list is:
`account_external_identity, account_identity, authentication_session, business, business_capability, business_category, business_category_assignment, business_hours, business_membership, business_offering, campaign, capability, commercial_payment_attempt, commercial_plan, commercial_plan_entitlement, commercial_plan_price, commercial_plan_version, connect_integration, country, currency, customer, enquiry, notification, opportunity, opportunity_capability_requirement, opportunity_participant, opportunity_type, project, project_quote, quote, quote_line_item, review, saved_business, support_request, support_request_message, trust_score`.

The column-level grants supplement these table-level grants. Do not infer that the 156 INSERT/60 UPDATE rows alone describe the effective DML boundary.

### 2. Sequence ACL snapshot

The runtime has direct USAGE on 39 sequences and SELECT on 10 sequences; all are granted by `ghm_schema_owner` without grant option.

The 39 USAGE sequence grants are:
`account_external_identity_id_seq, account_external_mapping_id_seq, account_identity_id_seq, authentication_session_id_seq, business_capability_evidence_id_seq, business_capability_id_seq, business_category_assignment_id_seq, business_directory_review_event_id_seq, business_engagement_event_id_seq, business_external_mapping_id_seq, business_hours_id_seq, business_id_seq, business_membership_id_seq, campaign_id_seq, commercial_event_id_seq, commercial_payment_attempt_id_seq, commercial_subscription_id_seq, commercial_trial_id_seq, customer_id_seq, enquiry_id_seq, notification_id_seq, opportunity_capability_requirement_id_seq, opportunity_id_seq, opportunity_participant_id_seq, opportunity_type_id_seq, password_recovery_credential_id_seq, project_id_seq, project_quote_id_seq, quote_id_seq, quote_line_item_id_seq, quoteflow_migration_business_provisioning_audit_id_seq, quoteflow_migration_reset_enrollment_id_seq, refresh_credential_id_seq, review_id_seq, saved_business_id_seq, storage_object_id_seq, support_request_id_seq, support_request_message_id_seq, trust_score_id_seq`.

The 10 sequences that additionally have SELECT are:
`account_identity_id_seq, business_category_assignment_id_seq, business_engagement_event_id_seq, business_id_seq, business_membership_id_seq, enquiry_id_seq, opportunity_id_seq, opportunity_type_id_seq, project_id_seq, review_id_seq`.

A dependency join between sequences and owning tables shows 16 of the USAGE-granted sequences have no matching direct table-level INSERT or column-level INSERT ACL for their owning table:
`account_external_identity_id_seq, account_external_mapping_id_seq, account_identity_id_seq, authentication_session_id_seq, business_directory_review_event_id_seq, business_external_mapping_id_seq, business_hours_id_seq, campaign_id_seq, opportunity_type_id_seq, password_recovery_credential_id_seq, quoteflow_migration_business_provisioning_audit_id_seq, quoteflow_migration_reset_enrollment_id_seq, refresh_credential_id_seq, saved_business_id_seq, storage_object_id_seq, trust_score_id_seq`.

This is a **candidate sequence overgrant list**, not an approved revoke list. Some sequences may be used by SECURITY DEFINER functions, triggers, or identity operations that do not require runtime table INSERT. Resolve each sequence to its exact source/function/trigger and deployed migration before proposing a revoke. The 23 remaining sequences do correspond to direct table-level or column-level INSERT authority.

### 3. Critical production role-membership and role-attribute finding

The live catalog returned the following role attributes:

| Role | LOGIN | CREATEDB | CREATEROLE | INHERIT | Other relevant |
|---|---:|---:|---:|---:|---|
| `ghm_app_user` | yes | no | no | yes | Can SET ROLE to `ghm_db_user` through membership. |
| `ghm_db_user` | yes | **yes** | **yes** | yes | Has admin-option memberships to multiple protected roles. |
| `ghm_runtime` | yes | no | no | no | Intended Resource API role. |
| `ghm_actor_gateway` | yes | no | no | no | Intended isolated gateway role. |
| `ghm_migrator` | yes | no | no | no | Migration login. |
| `ghm_payment_provider` | yes | no | no | no | Payment provider login; PayFast remains paused. |
| `ghm_schema_owner` | no | no | no | no | Non-login schema owner. |

The `pg_auth_members` snapshot further shows:

- `ghm_app_user` is a member of `ghm_db_user` with `inherit_option=true` and `set_option=true`.
- `ghm_db_user` has `admin_option=true` membership rows for `ghm_actor_gateway`, `ghm_migrator`, `ghm_payment_provider`, `ghm_schema_owner`, and `ghm_runtime` (the runtime membership also has a separate inherit-enabled row).
- The memberships to gateway, migrator, payment provider and schema owner are not SET-enabled, but the admin option gives `ghm_db_user` authority to administer those memberships.
- `ghm_db_user` is LOGIN, CREATEDB and CREATEROLE.

This confirms the outstanding Render principal separation issue is not merely a theoretical grantor display. The application credential `ghm_app_user` can SET ROLE to `ghm_db_user`; that role has database/role creation attributes and admin-option membership authority over protected execution/migration/ownership principals.

The production query session itself reported `session_user=ghm_app_user` and `current_user=ghm_db_user`. This is consistent with the app credential operating through the Dashboard-managed role and is not the intended final isolated principal model.

**Do not attempt to fix this by revoking memberships, altering role attributes, rotating credentials, or changing Render service configuration in this qualification pass.** The previous Render support recommendation remains: normal app execution should move to SQL-created login(s) outside the Dashboard-managed credential list, with a planned principal cutover. The support escalation and provider/bootstrap authority issue must be resolved through the separately approved operational path.

### 4. Query provenance

All findings above came from read-only Render catalog queries against `ghm_db` at PostgreSQL 18.6 on `2026-11-12`. The application identity query returned `session_user=ghm_app_user`, `current_user=ghm_db_user`. No application row data was read.

### 5. Priority changes to remaining audit plan

1. Treat role membership/attributes and `ghm_db_user` as the critical production isolation blocker.
2. Reconcile the 16 candidate sequence grants; do not revoke based on absence of direct INSERT alone.
3. Keep table-level INSERT/UPDATE/DELETE grants distinct from column-level ACLs in the final effective-privilege report.
4. Continue the full table-level SELECT inventory and exact runtime read-source mapping separately.
5. Keep production Business Profile Actor Gateway migration/deployment and Business Engagement provenance as separate cutover gates.

**No production mutation occurred.** No role attribute, membership, grant, sequence, migration, credential, secret, Render setting, service, deployment, application route, traffic, or application data changed. No PR was merged or closed. PayFast and legal publication remain paused.


### 6. Sequence candidate provenance checked against deployed migrations

The source/migration check confirms several sequence USAGE grants are explicitly attached to SECURITY DEFINER function-only write paths:

| Sequence | Deployed writer | Function security model | Runtime sequence USAGE assessment |
|---|---|---|---|
| `business_hours_id_seq` | `ghm.replace_business_hours` | SECURITY DEFINER, owned by `ghm_schema_owner`; Resource API calls function. | Candidate redundant for runtime. |
| `saved_business_id_seq` | `ghm.create_saved_business` | SECURITY DEFINER, owned by `ghm_schema_owner`; Resource API calls function. | Candidate redundant for runtime. |
| `trust_score_id_seq` | `ghm.calculate_business_trust_score` | SECURITY DEFINER, owned by `ghm_schema_owner`; Resource API calls function. | Candidate redundant for runtime. |
| `campaign_id_seq` | `ghm.create_campaign` | SECURITY DEFINER, owned by `ghm_schema_owner`; Resource API calls function. | Candidate redundant for runtime. |
| `business_directory_review_event_id_seq` | `ghm.submit_business_directory_review` and `ghm.review_business_directory_listing` | SECURITY DEFINER functions owned by `ghm_schema_owner`; they also insert notification rows. | Candidate redundant for runtime. |
| `business_external_mapping_id_seq` | Business external mapping gateway/function path | Table has no direct runtime INSERT grant; gateway path is SECURITY DEFINER. | Candidate redundant for runtime; complete wrapper dependency check still required. |
| `account_identity_id_seq`, `account_external_identity_id_seq`, `account_external_mapping_id_seq` | Authentication and identity functions | Current auth/identity writes are function-owned, not direct runtime table INSERT. | Candidate redundant for runtime; verify every deployed auth function overload. |
| `authentication_session_id_seq`, `refresh_credential_id_seq`, `password_recovery_credential_id_seq` | Authentication session/refresh/recovery functions | Dedicated auth lifecycle functions, separate from direct Resource API table INSERT. | Candidate redundant for runtime; verify exact surviving function set. |
| `storage_object_id_seq` | Storage metadata gateway wrappers | SECURITY DEFINER storage functions own metadata writes. | Candidate redundant for runtime. |
| `opportunity_type_id_seq` | Reference/catalogue data | No runtime table INSERT path identified; catalogue rows are migration-owned. | Candidate redundant for runtime. |

For the first five entries, exact deployed migration source confirms the functions are SECURITY DEFINER and owned by `ghm_schema_owner`, yet the migration also grants sequence USAGE directly to `ghm_runtime`. The function owner, not the invoking runtime role, performs the sequence operation. This is strong evidence of unnecessary runtime sequence authority, but still not an authorization to revoke until every function/trigger path and live deployed migration is confirmed.

The following candidate sequence grants still need explicit owner/function/trigger provenance before classification:
Remaining unmapped candidates are `quoteflow_migration_business_provisioning_audit_id_seq` and `quoteflow_migration_reset_enrollment_id_seq`. The authentication-family sequences are mapped to auth lifecycle paths at a high level, but each surviving production function overload and any trigger dependency still needs exact verification. The directory-review sequence is written by the SECURITY DEFINER directory-review functions shown above; it is not in the unresolved sequence list.

**Important:** sequence USAGE/SELECT revocation is not included in any change. The final cutover must be a separate reviewed migration with disposable qualification and rollback plan.


---

## 2026-11-12 22:20 UTC — Render support decision merged; production connection cutover remains outstanding

### 1. Render support handover is now in mainline

The docs-only support handover PR #274 was marked ready and squash-merged after its exact-head checks passed:

- PR: https://github.com/zaidhqdev-sys/GHM/pull/274
- Head: `987d1399d1e576a4d794e4e9d1d01814daea27aa`
- Merge commit: `744b91f030d5cfc9257685677aaff148cf1f9f43`
- Both `quality` and `web-quality` passed; Cloudflare Pages preview also passed.
- Merged document: `docs/security/RENDER_ACTOR_GATEWAY_ROLE_SEPARATION_HANDOVER_2026-11-12.md`.

The authoritative support recommendation is now documented in mainline: retain the Render Dashboard-managed default administrator for controlled administration; normal Resource API execution should connect directly as the already-existing SQL-created `ghm_runtime` login. Do not create an extra login in the runtime role, and do not rotate/delete the Dashboard administrator as a prerequisite.

### 2. Current live production role facts reconfirmed read-only

A new production catalog query on 12 November returned:
- `session_user=ghm_app_user`
- `current_user=ghm_db_user`
- `ghm_runtime` is LOGIN/NOINHERIT and has no elevated role attributes.
- `ghm_db_user` is LOGIN/INHERIT/CREATEDB/CREATEROLE and has the expected trusted administrator memberships.
- `ghm_db_user` is a member of `ghm_runtime` with SET enabled, while the runtime login itself is not a member of another role.
- `ghm_actor_gateway`, `ghm_migrator`, and `ghm_payment_provider` are LOGIN/NOINHERIT with no elevated role attributes.
- `ghm_db_user` is the trusted administrator member of these service roles; its protected-role membership options remain ADMIN=true, INHERIT=false, SET=false for gateway/migrator/provider/schema-owner in the inspected rows.

This supports the refined trust model recorded in PR #274: the administrator membership is trusted administrative authority; the service principal must have no untrusted memberships. The runtime application itself must authenticate directly as `ghm_runtime`, not as `ghm_app_user` with effective `ghm_db_user`.

### 3. Construction source has the refined principal checks, but production mainline does not

Verified in construction branch HEAD `e2ae77080e254b9dcbbe33ffb0b9d8debf1fb33f`:
- Resource API startup checks `session_user=current_user=ghm_runtime`, LOGIN/NOINHERIT, no elevated role attributes, database CONNECT without CREATE, schema USAGE without CREATE, and no untrusted memberships. The trusted `ghm_db_user` membership is explicitly excluded from the untrusted-membership check.
- Actor Gateway startup checks `session_user=current_user=ghm_actor_gateway`, role attributes and the same trusted-administrator-only inbound membership rule.
- Authentication Issuer startup checks `session_user=current_user=ghm_auth_issuer`, role attributes and the same membership rule, plus its separate database privilege contract.
- Tests reject Dashboard app/effective role identities, schema-owner substitution and untrusted role memberships.

The exact-head construction CI run `43317737320` on `e2ae77080e254b9dcbbe33ffb0b9d8debf1fb33f` has now completed successfully: `quality` and `web-quality` passed, as did the Cloudflare Pages preview check.

### 4. Production service is still on old mainline configuration

The actual Render service `GHM-Internal-Runtime` was inspected read-only:
- Service ID: `srv-damupsek1f9s73eq8kkg`
- Branch: `main`
- Auto deploy: OFF.
- Health check: `/healthz`.
- Region: Frankfurt.
- Render plan: Free.
- URL: `https://ghm-internal-runtime.onrender.com`.

Mainline at the new merge commit `744b91f...` still has the older `src/config.ts` requiring `DATABASE_URL`, and `src/server.ts` only performs `SELECT 1` before listening; it does not run the new runtime principal assertion. In contrast, construction requires `GHM_RUNTIME_DATABASE_URL` in production and verifies the exact runtime login before listening.

Therefore the production runtime cutover is **not done**. The merge of PR #274 only merges the support handover; it does not change service configuration, credentials, branch, database roles or deployment.

### 5. PR #272 disposition

PR #272 remains open and unmerged. It contains the broad unified Actor Gateway integration stack, including the runtime principal contract and manual legacy privilege cutovers. Its latest exact-head checks on `382c8880a89ccc0bf51b2b5daa4d9671f825cf8a` passed `quality`, `web-quality`, and Cloudflare Pages preview. GitHub reports the PR branch as non-mergeable/dirty against main, and it is a large stacked integration (672 commits / 164 files); it must not be merged blindly or treated as a small isolated patch.

The integrated branch also has no separately deployed production Actor Gateway or Authentication Issuer service. Current Render inventory includes the existing GHM Internal Runtime and historical sandbox/qualification services, but no production gateway/issuer services. Do not create new paid services or repurpose sandbox services under current cost constraints. The unified gateway hosting/network decision remains an explicit release gate.

### 6. Safe next actions

1. Reconcile the construction branch's 672-commit integration history and its component PRs (#268–#272, plus #243/#244 where relevant) into a coherent, mainline-based, mergeable series. Do not merge the stack as-is.
2. Preserve the production Resource API service's existing auto-deploy OFF state.
3. Before any deployment, complete a source-to-runtime compatibility review of the Resource API and ensure its environment variable contract, startup principal assertion, TLS/network assumptions and health checks match the intended `ghm_runtime` login.
4. Resolve how the separate Actor Gateway and Authentication Issuer are hosted without adding paid services or reviving sandbox infrastructure.
5. Obtain a fresh verified production backup and exact rollback plan before any production privilege cutover.
6. Do not change Render credentials, environment variables, role memberships, grants, service branch, auto-deploy, deployments or database objects during this qualification.

**No production mutation occurred in this checkpoint.** The only production interaction was read-only role catalog inspection and Render service metadata retrieval. PR #274 was a documentation-only merge. No production credential, role, grant, membership, migration, secret, environment variable, service configuration, deployment, application data or traffic was changed. PayFast and legal publication remain paused.


### 7. Render's actual latest deployed commit independently confirmed

Render deployment history for `GHM-Internal-Runtime` was checked after the service metadata review. Its latest live deployment is:
- Deploy ID: `dep-dbpmv8jrjlhs73abkli0`
- Commit: `c7cf1ebaf4db5912983bfa45bd42747c0854cfaf`
- Deploy finished: `2026-11-10T19:26:11.350836Z`
- Status: `live`
- Trigger: manual.

This independently confirms the production service is still running the old `c7cf1eb` source snapshot. The role-boundary implementation on the construction/integration branch is not deployed. Auto deploy remains OFF; no deployment was triggered.

The production source ref and current Render deployment ref are therefore the same exact commit for the purposes of this qualification. Do not infer that mainline documentation merges update the service: the Render service is pinned to branch `main`, but auto deploy is OFF and the deployed commit remains `c7cf1eb`.

### 8. PR/branch advancement decision

- PR #274: docs-only, exact-head `quality` and `web-quality` passed; marked ready and squash-merged to main as `744b91f`. This is complete.
- PR #272: latest integration head `382c888` passed `quality`, `web-quality` and Cloudflare Pages, but GitHub reports `mergeable=false` / `mergeable_state=dirty`; it is a 672-commit, 164-file stacked integration. Do not merge as-is.
- PRs #268, #269, #270 and #271 remain draft component/stack PRs. Their code is represented in the integrated #272 candidate, but must be reconciled against the new mainline and each dependency before any merge. Do not independently merge a child branch while its base is another unmerged draft stack.
- PR #243/#244 remain draft marketplace/analytics work with their own stacked dependencies and production parity/entitlement questions. They are not prerequisites for the Resource API credential-only principal correction and should not be bundled into it.
- The construction branch exact-head run `43317737320` on `e2ae770` completed successfully (`quality`, `web-quality`, Cloudflare Pages). The handover-only commit in this file still needs its own exact-head CI after this append.

The next engineering move should be a small mainline-based Resource API runtime-principal integration (or an explicitly bounded branch rebuilt on current main), not an attempt to merge the entire #272 stack. Keep Actor Gateway and Authentication Issuer hosting/deployment as separate release gates. Preserve Render auto deploy OFF and do not deploy.


## 2026-11-12 22:24 UTC — focused Resource API principal integration opened as PR #275

A clean branch was created from the then-current mainline commit `744b91f030d5cfc9257685677aaff148cf1f9f43`, rather than trying to merge the 672-commit #272 stack.

- Branch: `security/resource-api-runtime-principal-20261112`
- PR: https://github.com/zaidhqdev-sys/GHM/pull/275
- Initial head: `4d4a0624ba8df999bea0167762b467e1bfc9421f`
- Base: `main` at `744b91f...`
- Draft PR, open and unmerged.

### Code changes

1. Production Resource API configuration now requires `GHM_RUNTIME_DATABASE_URL`; generic `DATABASE_URL` is retained only as a non-production fallback.
2. Resource API startup now reads the live database identity and fails before listening unless:
   - `session_user=current_user=ghm_runtime`;
   - role is LOGIN/NOINHERIT and has no elevated role attributes;
   - database CONNECT and `ghm` schema USAGE are present;
   - database CREATE and schema CREATE are absent;
   - no untrusted role memberships exist.
3. The trusted `ghm_db_user` administrator membership is explicitly excluded from the untrusted-membership check, matching the Render support decision and observed live role graph. The application must still connect directly as `ghm_runtime`.
4. Added focused principal tests, added them to the main `npm test` command, and documented the environment variable in `.env.example`.
5. Config tests now prove production rejects a missing `GHM_RUNTIME_DATABASE_URL`, and accepts the dedicated URL only when TLS is enabled.

### Validation and safety

At time of this handover update, exact-head GitHub Actions run `43319364059` is in progress on `4d4a062...`; `quality`, `web-quality` and Cloudflare Pages checks were running. Do not claim validation passed until the run completes successfully.

No production credentials or environment variables were set. The Render service remains on `main`, auto-deploy OFF, and live deployment `c7cf1eb`. The PR intentionally fails closed if deployed without `GHM_RUNTIME_DATABASE_URL`; do not deploy until the existing SQL-created `ghm_runtime` credential is provisioned via the controlled secret-management path and connection identity is verified.

No production role, membership, grant, migration, database data, service branch, auto-deploy setting, deployment or traffic changed. PR #274 is the only PR merged in this continuation and it was docs-only. PayFast and legal publication remain paused.


### 2026-11-12 22:25 UTC — first PR #275 CI failure corrected

The first exact-head run `43319364059` on `4d4a062...` found one test-isolation issue, not a runtime implementation failure:
- The config test intended to prove a missing `GHM_RUNTIME_DATABASE_URL` is rejected.
- The CI test environment can provide a disposable `GHM_RUNTIME_DATABASE_URL`, so the test did not explicitly clear that inherited variable.
- Updated the test to set `GHM_RUNTIME_DATABASE_URL: undefined` for the missing-variable case and to assert the selected production URL equals the dedicated runtime URL.

Correction commit: `df4453869d3cac8ba73d774877e0fbd9530732b2`.
New exact-head CI run: `43319557839`; `web-quality` and Cloudflare Pages have passed, while `quality` was still running at the time of this note. Await its final result before declaring PR #275 qualified.


## 2026-11-12 22:29 UTC — Resource API runtime principal PR merged

PR #275 was marked ready after review of the exact diff and successful exact-head checks, then squash-merged:

- PR: https://github.com/zaidhqdev-sys/GHM/pull/275
- Exact head: `df4453869d3cac8ba73d774877e0fbd9530732b2`
- Exact-head CI run `43319557839`: `quality` and `web-quality` passed; Cloudflare Pages also passed.
- Merge commit: `ad4fea43f2eb7bf959042b9db77a9f86e6bb531b`
- Mainline base parent: `744b91f030d5cfc9257685677aaff148cf1f9f43`.

The merged Resource API now requires production `GHM_RUNTIME_DATABASE_URL` and performs the `ghm_runtime` least-privilege identity check before opening its HTTP listener. The test suite includes the runtime principal tests.

The merge is code-only and is not a deployment. Immediately after merge, the new mainline commit's three checks (`quality`, `web-quality`, Cloudflare Pages) were in progress; verify their final exact-commit result before calling mainline post-merge validation complete.

Render remains on `main` with auto-deploy OFF and live deployment `c7cf1eb`; no environment variable or credential was changed. Because `GHM_RUNTIME_DATABASE_URL` has not been provisioned in Render, do not manually deploy this mainline until the existing `ghm_runtime` connection string is safely configured and verified. The current deployment is unaffected.

PR #272 remains unmerged and its base is stale. The capability/Actor Gateway child PRs #268–#271 are stacked on unmerged parent branches. Their code must be reconciled into a mainline-based series rather than merging the aggregate stack. PR #243/#244 supplier classification and analytics form a separate feature stack. PR #264 is an open docs checkpoint whose base is also stale; inspect its content and relevance before deciding whether to close or rebase it.

No production role, grant, membership, secret, environment variable, deployment, traffic, database data or application configuration was changed in this checkpoint.


## 2026-11-12 22:40 UTC — mainline Resource API merge verified; Actor Gateway support-contract correction and issuer gap logged

### Mainline post-merge validation

PR #275 is merged as `ad4fea43f2eb7bf959042b9db77a9f86e6bb531b`. Exact mainline checks for that merge commit have all passed:
- `quality` — success
- `web-quality` — success
- Cloudflare Pages — success

Render remains unchanged: `GHM-Internal-Runtime` is on `main`, auto-deploy OFF, live deploy `c7cf1eb`. The merge did not deploy the new Resource API code.

### PR #272 source audit: two production-role-contract corrections

The Actor Gateway integration branch originally had two incompatible assumptions:
1. The Actor Gateway startup check and qualification script rejected every role membership involving `ghm_actor_gateway`.
2. The additive migration `20261110210000_add_actor_gateway_principal_guard.sql` also rejected every role membership involving that login.

That contradicts the current Render-supported role graph, which includes only the controlled `ghm_db_user` administrative membership to the protected service role with `ADMIN=true`, `INHERIT=false`, and `SET=false`. The service login itself must not be a member of any other role.

The integration branch now aligns all three layers:
- startup principal query and TypeScript verifier;
- initial database migration guard;
- disposable PostgreSQL qualification script and unit/migration-contract tests.

The check now also verifies database CONNECT, no database CREATE, schema USAGE, and no schema CREATE. The migration already grants `USAGE ON SCHEMA ghm` to `ghm_actor_gateway`; the startup check now verifies it is actually effective.

Latest correction commits at time of writing:
- `0972978714459b67f5a09f8ecae11eb91bc8c247` — Actor Gateway verifier
- `7bd68b2fbd0cf88ceae6a81080d10e2405eebd07` — unit tests
- `da7ed9dd9fe02c68f4c2a1a6b35efec6d12b0547` — startup identity query
- `86533870d514918f50e353b06ab8edec8ee399f5` — disposable qualification
- `9351c031ab70730374ceb0701c0db784f311f5f9` — migration guard
- `b613237b4987413fe0d974ade6dca9d4df567c30` — migration contract test
- `0a72f18470d21017d875a8bc56fb4d6ecc471f39` — test runner registration

Exact-head CI run `43321773929` was still running at this checkpoint. Do not call the branch green until the full run completes successfully.

### PR/branch state after refreshing stale bases

- PR #272 was retargeted to the current mainline SHA `ad4fea43...`; GitHub reports it dirty/non-mergeable. Do not merge the 164-file integration stack as-is.
- PR #250 was refreshed against current mainline and is also dirty/non-mergeable. PR #268 and #269 remain stacked behind it; #270 and #271 depend on supplier-classification and Business-profile parent branches.
- The PR #272 diff overlaps the new Resource API principal work from PR #275. The current mainline Resource API principal files must be preserved during any future integration; do not overwrite them with the older versions on #272.
- The supplier/analytics stack (#243/#244) and profile compatibility stack (#237/#271) remain separate workstreams. No stale child PR should be merged independently of its parent.

### Critical remaining ADR-001 gap: no isolated Authentication Issuer

The #272 branch has a public-key-only JWT verifier in Actor Gateway, but the ordinary Resource API still loads the ES256 private signing key:
- `src/auth/foundation/access-jwt.ts` implements signing.
- `src/auth/ghm-auth-service.ts` constructs `createAccessJwtService(loadEs256Keys())`.
- `src/auth/ghm-bearer.ts` also loads `loadEs256Keys()` in the Resource API.
- `src/http/auth-router.ts` still handles register/login/refresh/logout through the ordinary API process and its own persistence pool.
- Password recovery/reset and QuoteFlow migration-reset operations also use the Resource API's AuthPersistence boundary.
- No `src/auth-issuer/` process, dedicated issuer HTTP interface, or `ghm_auth_issuer` role provisioning/migration exists in the #272 tree.

Therefore a compromised Resource API process can mint a valid JWT with a chosen account subject; Actor Gateway would accept that token and produce the database HMAC assertion. The gateway cannot independently authenticate an actor until private signing and credential/session operations are isolated behind a separately credentialed Authentication Issuer. PR #272 is not a complete implementation of ADR-001.

This is a hard security/release gate, not a documentation-only omission. The next issuer work requires a service boundary, dedicated DB principal/privilege contract, service-to-service/client routing, private-key custody, auth route migration, recovery and QuoteFlow reset compatibility, and an operational hosting decision. Do not simply remove the Resource API private key before the issuer path is deployed and verified.

### Safety boundary

No production migration, cutover, grant, role membership, credential, Render environment variable, service branch, auto-deploy, deployment, application data or traffic changed. No PR #272, #250, #268–#271, #243/#244 or #237 merge occurred. PayFast and legal publication remain paused.


## 2026-11-12 22:49 UTC — unified Actor Gateway branch rebased and validated; remaining boundaries identified

PR #272 has now been reconstructed on top of current mainline `ad4fea43f2eb7bf959042b9db77a9f86e6bb531b` without carrying the old divergent history:
- Current head before this documentation-only append: `6712ac4e8c1ab04beb38bfcc110dfda08bf6529e`.
- 4 commits ahead, 0 behind; GitHub mergeability clean.
- Exact-head Actions run `43322730693` passed `quality`, `web-quality` and Cloudflare Pages.
- The branch preserves the merged PR #275 runtime identity checks and current Render support documentation.
- PR #272 remains draft, open, unmerged and undeployed.

The disposable PostgreSQL run passed with the Render-shaped gateway membership: the only inbound membership permitted is `ghm_db_user` with ADMIN true, INHERIT false and SET false. The migration guard, Actor Gateway startup verifier and qualification script now agree on that rule. The gateway itself cannot be a member of another role; database CONNECT and schema USAGE are required; database/schema CREATE are rejected.

The branch contains the code from capability governance (#250), catalogue invariants (#268), capability gateway (#269), supplier classification (#243/#270) and Business profile gateway (#237/#271), with the older Business profile contract migration superseded by the later `20261110265000_reconcile_business_profile_legacy_contract.sql`. The component PRs remain stacked and should not be merged independently of the unified branch.

Two remaining gaps were verified:
1. **Authentication Issuer:** Resource API still loads the ES256 private key, signs tokens and owns login/refresh/logout/recovery/QuoteFlow migration-reset routes. No `src/auth-issuer/` process or `ghm_auth_issuer` role contract exists. A compromised Resource API can mint a chosen-subject JWT that Actor Gateway will accept. The issuer must be isolated before ADR-001 is complete.
2. **Business Engagement / Analytics (#244):** This separate feature stack is not included in #272. Its current engagement repository performs a direct runtime INSERT into `ghm.business_engagement_event` with request-derived business/account attribution. The account ID comes from Resource API auth context, not an independently verified database actor. Keep PR #244 draft/unmerged until an issuer-verified Actor Gateway write/read path binds the actor and tenant and disposable PostgreSQL proves direct runtime spoofing is denied.

No production changes occurred. The existing production service remains on `main`, auto-deploy OFF, live deploy `c7cf1eb`. No role/grant/membership, credentials, secrets, migrations, cutovers, deployment, data or traffic changed. PayFast and legal publication remain paused.


### PR stack cleanup

After verifying the current-mainline integration tree contains the component changes, the following stacked PRs were closed as superseded by the consolidated draft PR #272:
- #237 — old Business profile compatibility contract; its 20261108140000 migration is superseded by the later 20261110265000 migration in #272.
- #250 — capability catalogue governance.
- #268 — capability catalogue cross-row invariants.
- #269 — capability governance Actor Gateway.
- #270 — supplier classification Actor Gateway.
- #271 — Business profile Actor Gateway.

Their branches were not deleted; their relevant code remains preserved in #272. PR #243 remains open because #244 is stacked on its supplier-classification base. PR #244 remains draft and unmerged: its Business Engagement / Analytics writes still use the Resource API runtime path and require issuer-verified Actor Gateway actor binding. PR #264 is an older documentation checkpoint with a stale base and has not been merged. PayFast #233 and legal acceptance #201 remain parked.


---

### 2026-11-14 — refreshed production role authority and migration-ledger access path

Fresh read-only catalog evidence from Render 'ghm-db' / 'ghm_db' confirms:

1. 'ghm.ghm_schema_migrations' exists, is owned by 'ghm_schema_owner', and has NULL relation ACL. 'ghm_app_user'/'ghm_db_user' and 'ghm_migrator' cannot SELECT it directly; 'ghm_migrator' also has no direct 'ghm' schema USAGE. This is consistent with the least-privilege migration-runner design, not proof that the ledger is absent.
2. 'src/db/migrate.ts' is the intended read/apply authority path: it connects with 'GHM_MIGRATOR_DATABASE_URL', asserts 'session_user=current_user=ghm_migrator', verifies the exact SET-only membership to 'ghm_schema_owner', executes 'SET ROLE ghm_schema_owner', then reads 'version, checksum' from the resolved ledger table. It also applies pending migrations, so the normal command is NOT a read-only audit command and must not be run against production to inspect the ledger.
3. The current read-only Render query identity remains 'session_user=ghm_app_user', 'current_user=ghm_db_user'. The query connector accepts a single prepared statement; a combined 'SET LOCAL ROLE; SELECT' was rejected with 42601 before execution. No role change or database mutation occurred.
4. Current direct membership rows include five PostgreSQL-granted ADMIN OPTION memberships from 'ghm_db_user' to 'ghm_actor_gateway', 'ghm_migrator', 'ghm_payment_provider', 'ghm_runtime', and 'ghm_schema_owner' (all INHERIT=false, SET=false). A separate 'ghm_db_user'-granted membership gives 'ghm_db_user' → 'ghm_runtime' INHERIT/SET true without ADMIN OPTION. 'ghm_migrator' → 'ghm_schema_owner' is INHERIT=false, SET=true, ADMIN=false. 'ghm_app_user' → 'ghm_db_user' is INHERIT/SET true, ADMIN=false.
5. 'ghm_db_user' remains LOGIN/INHERIT with CREATEDB and CREATEROLE; 'ghm_app_user' inherits its authority. These exact paths and duplicate runtime grants need to be considered together in any future role cutover. No membership, role attribute, grant, ownership, schema, migration or data was changed.
6. Render Postgres metadata: PostgreSQL 18, available, Frankfurt, plan '0.1c-256mb', 1 GB disk, no HA, no connection pool, and external allowlist '0.0.0.0/0'. This is not proof of a fresh backup or successful restore. The existing 4 November backup remains stale per prior handover; backup/restore is still a hard gate.

**Disposition:** migration ledger access must be obtained through a dedicated read-only audit mode that preserves the migrator identity and owner role, not by granting SELECT to runtime or the Render default user. The existing migration runner is mutating and must not be invoked in production for this purpose. Implement/qualify a non-mutating ledger-audit command against disposable PostgreSQL first; only then decide whether a controlled production audit invocation is safe and available. Until then the production migration head/checksums remain unknown.


### Correction — existing non-mutating ledger audit command, 2026-11-14

The repository already contains the required non-mutating ledger audit: 'npm run audit:migrations' -> 'scripts/forensic-migration-reconciliation.mjs'. It starts a READ ONLY transaction, validates the 'ghm_migrator' session, SET ROLEs to 'ghm_schema_owner', reads ledger version/name/checksum/applied_at, and compares the live ledger against repository and production provenance/pending allowlists. It does not apply SQL. Do not add a duplicate tool or use 'npm run migrate' for audit. The outstanding blocker is an authorized production invocation path with the existing migrator credential; Render currently exposes only 'ghm-internal-runtime' as the production GHM web service, and service metadata does not establish that the migrator URL is configured. Do not add it to the app service or expose its value as a shortcut. Production ledger head/checksums remain unknown until the existing audit is safely run.


### 2026-11-14 source-to-production SECURITY DEFINER reconciliation checkpoint

The security qualification handover now contains the exact four-function comparison and must be treated as the detailed source of truth. Summary for this grant-authority handover:

- The repository contains '20261112090000_pin_security_definer_search_path.sql', which normalizes every GHM SECURITY DEFINER function to 'pg_catalog, ghm, pg_temp' after asserting schema-owner ownership. Production catalog remains split 53 ('pg_catalog, ghm'), 5 canonical, 3 ('ghm, pg_temp'), and 1 ('ghm, pg_catalog'). Until the read-only production migration ledger is available, this is a catalog/source discrepancy, not proof that the migration is pending.
- Four noncanonical signatures were inspected in production. Founder bootstrap and account creation bodies match their source migrations; Connect identity-authority function provenance is unresolved; Business Hours replacement matches its base migration and retains the legacy runtime grant until its explicit manual cutover.
- Business Hours manual cutover remains prohibited until Actor Gateway deployment/qualification, role identity verification and fresh independently verified backup exist. No cutover or permission change occurred.
- Do not repeat the four-function definition fetch or aggregate search-path count. Continue with the unresolved identity-authority provenance and the remaining 53/other function source comparison, then obtain ledger evidence through the existing read-only audit path.


### 2026-11-14 follow-up — later SECURITY DEFINER migration declarations

The security qualification handover now records the bounded 2026-11-12 migration-source review. In brief: migrations 20261112020000, 20261112030000 and 20261112080000 create SECURITY DEFINER routines with 'pg_catalog, ghm' before the 20261112090000 all-functions normalization migration; later 20261112140000 and 20261112150000 use the canonical 'pg_catalog, ghm, pg_temp'. The live 53/5/3/1 distribution cannot be explained by declarations alone. The production read-only migration ledger is required to determine whether normalization is absent or later DDL drifted. Do not repeat this source-file review unless new migration commits are introduced.
