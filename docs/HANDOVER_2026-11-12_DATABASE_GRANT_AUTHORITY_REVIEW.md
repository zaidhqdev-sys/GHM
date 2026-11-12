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

The overall quality job still has subsequent qualification steps in progress at this checkpoint; do not call the complete exact-head CI run passed until both quality and web-quality finish successfully.

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
