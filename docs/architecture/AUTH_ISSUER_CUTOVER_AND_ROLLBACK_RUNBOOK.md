# Authentication Issuer cutover and rollback runbook

- **Status:** Design and disposable qualification only
- **Date:** 2026-11-12
- **Owner approval:** No production cutover, service provisioning, production secret change, or production grant change is authorized by this document.
- **Related ADR:** [ADR-001 — isolated authentication issuer and database actor gateway](ADR-001-isolated-auth-issuer-and-db-actor-gateway.md)

## Current deployment boundary

The issuer implementation is on `construction/auth-issuer-isolation-20261112`, based directly on `integration/capability-gateway-qualification-20261110`. The Actor Gateway is guarded by an exact 25-function signed/typed-operation allow-list; migration `20261112070000_revoke_legacy_unsigned_actor_gateway_overloads.sql` removes the surviving unused unsigned identity helper from application roles; nine older overloads were already dropped by prior migrations. It is not deployed. PR #272 is the upstream Actor Gateway integration and remains open/unmerged. The issuer construction branch is substantially ahead of that integration base. Do not use historical ahead/behind counts as merge readiness; compare the live heads and reconcile the complete integration dependency before any merge. Keep the dependency explicit; do not merge or deploy the issuer branch independently of its upstream architecture.

The live GHM Internal Runtime remains on `main`, with auto-deploy disabled. Production continues to use its existing authentication arrangement. No production issuer principal, service, secrets, grants, migration, or routing has been created or changed.

## Preconditions — all are blocking

1. **Fresh verified backup:** Create a current production backup and independently verify its restore before any production migration or privilege cutover. The previously available 4 November backup is not an acceptable recovery point for later production role work. Do not assume a newer backup exists.
2. **Database role model:** Resolve the outstanding production PostgreSQL role/ownership and membership issues with Render support. Do not work around them by broadening privileges.
3. **Non-production target:** Provide an isolated disposable PostgreSQL target that is not production, not the paid `ghm-db`, and not the expired PayFast sandbox database. Render Free Postgres is temporary (1 GB / 30 days) and no available free database was found in the workspace inventory. Do not create paid resources.
4. **Default function ACLs:** Apply migrations `20261112050000_revoke_public_default_function_execution.sql`, `20261112070000_revoke_legacy_unsigned_actor_gateway_overloads.sql`, and `20261112080000_signed_connect_business_provisioning_gateway.sql` before cutover. Together they remove PostgreSQL's default PUBLIC EXECUTE grant for future schema-owner functions and revoke the obsolete unsigned Actor Gateway helper. The signed Connect Business provisioning operation now runs through the Actor Gateway (`20261112080000_signed_connect_business_provisioning_gateway.sql`). The issuer cutover revokes direct EXECUTE on `auth_link_business_external_mapping` from `ghm_runtime` and other application logins; the helper is invoked only inside the signed gateway's authorized transaction. Disposable qualification creates and drops a probe function to verify PUBLIC, runtime and issuer receive no implicit EXECUTE. Each intended application function must receive an explicit per-role grant.
5. **Service/network topology:** QuoteFlow's native mobile app calls the configured issuer URL directly from outside Render, so a private-only issuer is unreachable; it needs a reviewed public HTTPS ingress or a separately approved public gateway. Connect's native browser bearer flow also calls the issuer origin directly and requires exact CORS allow-listing; its optional browser-cookie flow instead uses the same-origin Vercel BFF. Verify the actual issuer ingress and database network path independently. Render Free web services do not provide private-network connectivity; do not claim private isolation without a verified network path. Public issuer ingress does not imply that the database should be public. Public HTTPS plus public database exposure is not an implicit fallback.
6. **Database transport:** Choose a verified TLS/network mode. Current `external` mode encrypts but uses `rejectUnauthorized: false`, so it does not authenticate the database server certificate. Current `internal` mode disables TLS and is acceptable only on a verified same-region private path. Neither mode is approved for production by this document.
7. **Secrets and token continuity:** Define issuer-only database credentials, ES256 signing-key custody, public verification-key overlap, and refresh-token pepper continuity. Never copy secrets into source, logs, PR comments, or this runbook.
8. **Client compatibility:** Verify GHM web, ZAID Connect, and QuoteFlow against the exact issuer URL and unchanged token contract. Preserve Connect native bearer endpoints and its separate same-origin browser proxy. Browser-cookie auth remains disabled unless separately approved. Preserve QuoteFlow Gate A disabled by default. Note that current main retains Supabase Auth, but open PR #25 removes Supabase Auth and has no fallback while Gate A is disabled; do not merge/release that PR stack until the issuer is live and Gate A is explicitly approved.
9. **Recovery delivery:** No password-recovery email delivery adapter is wired into the issuer. Generic password-recovery requests and QuoteFlow migration-reset requests intentionally return 503 until an approved delivery adapter is configured. Do not claim end-to-end recovery readiness. QuoteFlow migration-reset completion is wired and separately tested.
10. **Exact-head qualification:** Run the full build, test suite, disposable migration chain, issuer-principal baseline, manual cutover, issuer lifecycle/runtime denials, and rollback qualification on the exact candidate commit. A prior green SHA is not evidence for a later documentation or code head.
11. **Separate approvals:** Obtain explicit approval for production service provisioning, secret provisioning, routing, database grants/migrations, and cutover. CI success does not authorize any of these actions.

## Deployment sequence (future, not authorized)

1. Pin the exact candidate commits for the upstream Actor Gateway and issuer work. Reconcile all affected GHM documentation before opening/integrating release PRs.
2. Deploy the isolated issuer only into a reviewed non-production environment with its own least-privilege `ghm_auth_issuer` login. Verify startup identity checks and `/readyz` against its database.
3. Keep Resource API auth routes available during initial issuer smoke testing. Do not revoke `ghm_runtime` authentication function privileges yet.
4. Configure and test GHM web, Connect and QuoteFlow issuer URLs independently. Exercise registration, login, refresh rotation, logout, existing token verification, and each supported recovery/migration-reset route. Keep browser-cookie mode off unless separately approved.
5. Confirm the issuer's exact ten-function allow-list, zero direct GHM table/view/sequence privileges, no GHM schema CREATE, safe future-function defaults, and no inherited role memberships. The issuer startup enforces the exact database login/effective role, role flags and zero role memberships, then queries and enforces ACLs before opening its HTTP listener. It fails closed if the exact issuer function allow-list differs, direct relation privileges exist, schema CREATE exists, future function defaults are unsafe, or the Resource API runtime's auth-function set differs from the exact two-function allow-list: external person-identity lookup and external business-mapping lookup. Connect Business mapping creation is no longer a Resource API runtime privilege; it is performed by the signed Actor Gateway provisioning operation. Confirm `ghm_runtime` can no longer execute issuer-only lifecycle functions only after the cutover step.
6. Verify recovery delivery is genuinely configured before advertising password recovery. The current source has no delivery adapter; a 503 is expected and fail-closed.
7. Verify key overlap and pepper continuity: the Resource API must verify issuer-signed access tokens during the full access-token overlap window, and the rollback-compatible Resource API must be able to validate existing refresh credentials using the same compatible pepper.
8. Obtain separate approval, then apply `database/cutovers/20261112010000_authentication_issuer_privilege_cutover.sql` in a single session authenticated as `ghm_migrator` after `SET ROLE ghm_schema_owner`. The SQL independently asserts `session_user=ghm_migrator` and `current_user=ghm_schema_owner`; direct superuser execution and execution through another login fail closed. This file is manual-only and must never be added to the automatic migration chain.
9. Immediately re-run the exact principal/function/relation privilege assertions and end-to-end tests. Confirm production routing points to the issuer before considering the Resource API auth path retired.
10. Monitor login, refresh, logout, reset and issuer readiness. Keep the rollback artifact, verified backup, exact grant script, and operator sequence available.

## Database cutover effect

The manual cutover:
- Requires `ghm_auth_issuer` to be LOGIN / NOINHERIT with no elevated role flags or role memberships.
- Removes issuer direct table, sequence and function grants, then grants only the reviewed authentication function allow-list.
- Explicitly removes GHM schema CREATE from the issuer.
- Future schema-owner functions do not inherit PUBLIC EXECUTE after migration `20261112050000`; new application functions require explicit grants.
- Revokes the Resource API runtime's legacy credential/session lifecycle functions.
- Keeps only external person-identity lookup and external business-mapping lookup available to `ghm_runtime`. Direct execution of `auth_link_business_external_mapping` is revoked from application logins; signed Connect Business provisioning invokes the internal helper through the Actor Gateway's SECURITY DEFINER operation.
- Keeps business external mapping separate from authentication issuer authority.
- Keeps QuoteFlow reset enrollment registration as a migrator/operator action, not an issuer or ordinary runtime action.

The issuer allow-list is qualified by `scripts/qualify-auth-issuer-cutover.mjs`. It is intentionally narrower than the complete set of historical auth functions.

## Rollback sequence — coordinated, not automatic

**Never run the SQL rollback while the issuer is still receiving traffic.** The SQL file alone does not restore application functionality.

1. Stop or route all client traffic away from the issuer and stop issuer processes.
2. Restore the pinned, previously qualified Resource API artifact that includes the legacy auth routes and compatible signing behavior. Do not assume the current `main` artifact is suitable without checking its exact SHA and env contract.
3. Restore only the required Resource API secrets through the secret manager: compatible signing key material, verification key set and refresh-token pepper. Do not print or commit secret values. Verify the old API can validate issuer-issued access tokens through their remaining lifetime and existing refresh credentials.
4. Restore client issuer origins/proxy upstreams to the verified prior configuration. Keep Connect browser-cookie mode disabled unless its prior state explicitly differed and a separate approval exists.
5. Apply `database/cutovers/20261112020000_authentication_issuer_privilege_rollback.sql` in a single session authenticated as `ghm_migrator` after `SET ROLE ghm_schema_owner`; the SQL independently verifies both identities.
6. Verify issuer auth-function execution is zero, the documented pre-issuer `ghm_runtime` auth allow-list is restored, and no direct table/sequence grants were added.
7. Exercise registration, login, refresh rotation, logout and password reset with non-production test accounts before restoring production traffic.
8. Keep the issuer disabled and preserve evidence/logs until the cause is understood. Do not drop its role or database objects as part of an incident rollback.

The rollback SQL restores only the documented pre-issuer-cutover Resource API auth function grants. It deliberately does **not** restore migration/operator privileges removed by earlier migrations, including QuoteFlow reset enrollment registration, QuoteFlow account provisioning, external identity link/bootstrap, or account-ID session administration. It does not change data, remove roles, restore secrets, deploy binaries, or alter client routing.

## Rollback qualification

The rollback SQL is exercised only against the disposable PostgreSQL target by `scripts/qualify-auth-issuer-cutover.mjs`. Qualification checks:
- The issuer cannot execute any auth function after rollback.
- The documented legacy Resource API auth-function allow-list is restored.
- Migration-only QuoteFlow reset enrollment registration and direct provider-business mapping helper execution remain unavailable to the runtime; signed Connect Business provisioning is separately qualified through the Actor Gateway.
- No direct table or sequence privilege is granted as a shortcut.

This is a database ACL rollback test, not a production rollback rehearsal. A full service/client/secret rollback rehearsal remains outstanding.

## Recovery delivery status

The issuer server wires:
- Native registration/login/refresh/logout.
- Password reset completion using the token-bound database function.
- QuoteFlow migration-reset completion, followed by standard login/session issuance.

The issuer server does **not** wire:
- Generic password-recovery token delivery.
- QuoteFlow migration-reset recovery token delivery.

Both request routes return 503 while no delivery adapter is configured. This is intentional fail-closed behavior; it is a go-live blocker for those flows, not a successful recovery qualification. Do not introduce a paid email provider or new service without separate founder approval.

## Explicit non-actions

This runbook authorizes no production action. Do not:
- Apply either manual cutover file to production.
- Create or repurpose Render services/databases.
- Change production database roles, grants, secrets, network allow-lists or routing.
- Enable Connect browser-cookie auth or QuoteFlow Gate A.
- Resume PayFast work while its sandbox is unavailable.
- Resume legal-document work that remains parked.
- Merge PR #272 or this dependent construction branch before exact-head CI, documentation reconciliation and release approval.

## Exact database principal matrix — disposable qualification (2026-11-12)

The following principal boundaries are enforced by application startup or the migration runner and exercised by disposable PostgreSQL 18 CI. This is not evidence that production Render currently matches; production inspection remains mandatory.

| Principal | Database / schema boundary | Role and object authority |
|---|---|---|
| `ghm_runtime` (Resource API) | Database CONNECT; no database CREATE. GHM schema USAGE; no schema CREATE. | LOGIN / NOINHERIT, no memberships or elevated role flags. Retains application-specific relation/function privileges. Exact auth-function set: two lookup functions only. |
| `ghm_auth_issuer` | Database CONNECT; no database CREATE. GHM schema USAGE; no schema CREATE. | LOGIN / NOINHERIT, no memberships/elevated flags, zero direct relation privileges, exact ten-function allow-list, safe future-function defaults. |
| `ghm_actor_gateway` | Database CONNECT; no database CREATE. GHM schema USAGE; no schema CREATE. | LOGIN / NOINHERIT, no memberships/elevated flags, zero direct relation privileges, exact 25 signed/typed function allow-list, no PUBLIC or Resource API execution of gateway functions. |
| `ghm_migrator` | Database CONNECT only; no database CREATE, no GHM schema USAGE/CREATE, no direct GHM relation or sequence privileges. | LOGIN / NOINHERIT, no elevated flags, exactly one direct membership to schema owner with ADMIN FALSE / INHERIT FALSE / SET TRUE. |
| `ghm_schema_owner` | Owns GHM schema and objects; has controlled database/schema DDL authority required by migrations. | NOLOGIN, no elevated role flags, no direct role memberships. Authority is entered only by the dedicated migrator using the exact SET-only membership. |

Exact-head disposable CI evidence: run `43161326835` at `2b2014afff8dc605ab427a15256a41f89c70adab` passed quality, web-quality, Cloudflare Pages, build, migrations, full suite, Connect Business provisioning, Actor Gateway cutovers, issuer cutover/lifecycle/runtime denials and database-only rollback. Runtime, issuer and Actor Gateway startup verifiers now assert database CONNECT without CREATE; runtime additionally requires GHM schema USAGE without CREATE.

Before production migration/cutover, independently inspect live Render role attributes, memberships, membership options, database privileges, schema privileges, object ACLs and ownership against this matrix. Do not infer live compliance from disposable CI. No production changes or paid services were made.

## Manual SQL operator identity guard — 2026-11-12

Both manual issuer SQL scripts now fail closed unless the connection identity is exactly `session_user=ghm_migrator` and the active execution identity is exactly `current_user=ghm_schema_owner`. This prevents a direct superuser/operator invocation from bypassing the controlled migrator path and makes the execution contract self-enforcing in the SQL artifact, not merely a property of the CI harness.

The disposable CI applies the cutover through the same restricted migrator login and SET-only membership used by the migration runner. A migration-contract test covers both cutover and rollback guards. Exact-head CI is required after this change; no production operation was performed.
