# Handover — Actor Gateway production readiness (2026-11-11)

## Scope and status

This handover records the production-readiness review of GHM Actor Gateway PR #272 and the PostgreSQL privilege issue found during read-only inspection.

- Repository: `zaidhqdev-sys/GHM`
- PR: [#272 — Unified Actor Gateway](https://github.com/zaidhqdev-sys/GHM/pull/272)
- Branch: `integration/capability-gateway-qualification-20261110`
- Last fully validated code head: `512017beb5e46d939e70278b482e5cc0f721e0b5`
- At review: PR remained open and unmerged.
- CI on that exact code head: `quality` and `web-quality` passed ([run 43056260763](https://github.com/zaidhqdev-sys/GHM/actions/runs/43056260763)). This includes the production-only fail-closed registration identity routing change and tests.
- No production migrations, deployments, service changes, or database privilege changes were performed as part of this review.

**Current disposition: production rollout remains paused.** Green CI is useful evidence but does not qualify the production database role model or deployment topology.

## Critical production database privilege finding

Read-only inspection of production database `ghm-db` (PostgreSQL 18, database `ghm_db`) identified a broader role-administration problem, not merely an isolated Actor Gateway role issue.

Observed role relationships and attributes:

- `ghm_app_user` has a membership in `ghm_db_user` with both INHERIT and SET enabled; the observed connection reported `session_user=ghm_app_user` and `current_user=ghm_db_user`.
- `ghm_db_user` has `CREATEROLE`.
- `ghm_db_user` has ADMIN OPTION memberships involving `ghm_schema_owner`, `ghm_migrator`, `ghm_runtime`, and `ghm_actor_gateway`.
- `ghm_db_user` also has a SET-enabled membership to `ghm_runtime`.

This means the effective application role can administer role memberships and grant itself additional SET/INHERIT membership to privileged roles. The current separation between application runtime, schema owner, migrator, and Actor Gateway is therefore not an effective privilege boundary. In particular, an application path able to operate as `ghm_db_user` must not be treated as a least-privilege runtime identity.

### PostgreSQL 18 automatic membership behavior

The user created the production role using a non-superuser role with CREATEROLE:

```sql
CREATE ROLE ghm_actor_gateway
  LOGIN
  NOINHERIT
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  NOBYPASSRLS;
```

PostgreSQL 18 automatically establishes an ADMIN OPTION membership from the role creator to a role created by that CREATEROLE role. In this case the membership grantor is `postgres`, with ADMIN true and SET/INHERIT false. The created role itself has the intended login/security flags, but the automatic membership is still present.

The user attempted to revoke this membership while connected as `session_user=ghm_app_user`, `current_user=ghm_db_user`. PostgreSQL warned that `ghm_db_user` had not granted that membership; the membership remained. This is consistent with the recorded grantor being `postgres`. Repeating the same REVOKE as the same effective role is not a remedy.

The ADMIN OPTION is consequential: it allows `ghm_db_user` to grant membership to other roles, including granting itself SET/INHERIT membership. Therefore, merely keeping the auto-created membership's SET and INHERIT flags false does not restore isolation.

The production migration `20261110210000_add_actor_gateway_principal_guard.sql` currently rejects any membership involving `ghm_actor_gateway`. **Keep this guard strict; do not weaken it to accommodate the production-created role.** CI now covers both role-creation paths: the clean superuser-created role and the PostgreSQL 18 delegated CREATEROLE path that leaves a postgres-granted ADMIN OPTION membership. The production migration guard remains strict.

## Why Render was contacted; current support status

Render has been contacted and the issue was escalated to a human support agent. As of this handover, **we are awaiting Render's response**. Render indicated that a response would arrive through the support chat/email; no parallel support channel is needed.

Reason for contacting Render:

1. The production role was created by a non-superuser CREATEROLE account. PostgreSQL 18 automatically created an ADMIN OPTION membership whose grantor is `postgres`.
2. The available application connection cannot revoke that membership because it did not grant it. The attempted REVOKE was rejected with a grantor/ownership warning.
3. The issue is wider than the new gateway role: the effective application role `ghm_db_user` has CREATEROLE and ADMIN OPTION authority involving schema-owner, migrator, runtime, and gateway roles. This undermines the intended least-privilege boundaries.
4. We need Render's supported, safe procedure for correcting/replacing this role administration model and provisioning a genuine restricted runtime login, without prematurely changing existing application credentials or disrupting the live service.

Render's initial AI response said that Render-created database users can be managed through the database Info > Credentials area, while users created directly with SQL are not managed in the dashboard and membership changes generally need to be made in PostgreSQL. That response did not resolve the PostgreSQL 18 automatic-membership/grantor issue or the broader CREATEROLE/ADMIN OPTION exposure. The matter was therefore escalated for human support.

### Required questions for Render support

- What supported Render-admin/superuser procedure can remove or safely neutralize the automatic `postgres`-granted ADMIN membership created by a CREATEROLE user?
- How should the existing `ghm_db_user` CREATEROLE and ADMIN OPTION privileges be removed or replaced safely?
- Can Render provision a dedicated application runtime login with no CREATEROLE, no ADMIN OPTION memberships, and only the minimum required object privileges?
- What is the recommended migration path that preserves current application connectivity until the replacement credentials have been tested?

Do not assume Render has agreed to perform any change until a human response confirms the supported procedure.

## Gateway role state observed

- `ghm_actor_gateway` exists as a LOGIN role.
- Verified flags: LOGIN true; NOINHERIT; NOSUPERUSER; NOCREATEDB; NOCREATEROLE; NOREPLICATION; NOBYPASSRLS.
- Its only observed membership is the automatic ADMIN OPTION membership described above.
- It has database CONNECT, but no `ghm` schema USAGE/CREATE and no owned objects.
- Password was reset using SCRAM-SHA-256 after an initial MD5 warning. No credential values are recorded here.
- The migration guard will reject the current membership state.

## Application connection identity gap

The PR now requires `GHM_RUNTIME_DATABASE_URL` in production and verifies `session_user=current_user=ghm_runtime` plus role attributes and membership absence at startup. The actual deployed Render environment has not been changed or verified, so this code-level enforcement is not evidence that the currently running service already uses that login.

Before rollout:
- Make the API use an explicitly named restricted runtime connection in production (or otherwise explicitly configure and verify the expected login).
- Add a startup/qualification check for the expected `session_user` and effective role; fail closed on mismatch.
- Verify the Actor Gateway uses its dedicated login and cannot SET ROLE to migrator/schema-owner/runtime or administer memberships.
- Verify the runtime login cannot grant itself membership, create roles, or assume gateway/migrator/schema-owner roles.

## Other qualification notes

- `pgcrypto` is available as a trusted extension on PostgreSQL 18 but is not currently installed. `ghm_schema_owner` has database CREATE privilege, so extension installation is not by itself a blocker.
- The HMAC secret/nonce tables are not yet present in production. The CI qualification provisions only a disposable test secret; this is not production secret provisioning.
- HMAC key custody must be independent between the gateway secret store and protected database secret table. Never put key material in Git, chat, SQL history, or logs.
- The API no longer relies on generic `DATABASE_URL` in production: it requires `GHM_RUNTIME_DATABASE_URL` and verifies the runtime login/effective role plus least-privilege attributes and absence of memberships at startup. The Actor Gateway now performs equivalent startup checks for `ghm_actor_gateway`.
- Gateway server uses `http.createServer()`, which is compatible with a public Render web-service URL because Render terminates inbound TLS and forwards HTTP to the process. Gateway URL validation is now centralized: remote endpoints must be credential-free HTTPS origins with no path/query/fragment; HTTP is accepted only for localhost development. All four API-to-gateway clients reject redirects. Render private-service internal addresses commonly require `http://` on a private hostname/port, which is deliberately not accepted yet. Do not weaken this check without a reviewed private-network trust design. Do not treat database external TLS mode with `rejectUnauthorized:false` as authenticated server identity.
- Render workspace inspection found no dedicated Actor Gateway service. `GHM-Internal-Runtime` is a public web service on `main`, not a private Actor Gateway service; do not repurpose it. Current Render documentation confirms Free web services can initiate but cannot receive private-network traffic, and Free compute is unavailable for private services. Free web services also spin down after 15 minutes idle and can take about a minute to wake; Render explicitly advises against using Free instances for production. A true private gateway therefore requires paid private-service compute. A public HTTPS web service is technically compatible with the existing gateway URL validation and JWT-protected routes, but it exposes a public endpoint and a Free instance has cold-start/availability limitations. Given the no-unnecessary-spend constraint, gateway hosting remains an unresolved cost/security decision; do not create or repurpose a service until this is reviewed. Official references: [Render private network](https://render.com/docs/private-network), [Render Free instances](https://render.com/docs/free), [Render private services](https://render.com/docs/private-services).
- Existing legacy capability SECURITY DEFINER grants and other legacy access paths must remain in place until the new path is deployed and end-to-end proven. The manual cutover file is not part of the migration directory and must not be run prematurely.
- CI now separately reproduces the PostgreSQL 18 delegated CREATEROLE path and verifies the automatic postgres-granted ADMIN OPTION membership persists after the creator-side REVOKE attempt. The clean superuser-created gateway role fixture remains separate; the production migration guard remains strict.

## Next steps (blocked on role-model resolution)

1. Await Render human support response; ask specifically for the supported administrative correction path described above.
2. Runtime identity enforcement and delegated PostgreSQL 18 role-creation qualification are implemented and covered by passing CI. Continue repository-only review and tests while Render support is pending; do not deploy or apply production migrations while the production privilege model remains unresolved.
3. Agree a safe, staged role migration with a restricted runtime login and a separately controlled schema-owner/migrator path. Test replacement credentials before switching the live service.
4. Re-run CI and exact-head review after code changes.
5. Only after the role model and fresh-backup protection are qualified, select a hosting/network design that meets security requirements without additional paid services. The current instruction is no paid Render services or upgrades until the products generate enough revenue to afford them. If the free-tier options cannot satisfy production security/availability, keep the gateway rollout blocked rather than lowering the requirements.
6. Keep the PR open/unmerged and do not run the legacy cutover until the new route is proven end-to-end and separately approved.

## Authorization / safety boundary

Read-only repository and Render inspection was authorized. This handover update is documentation-only. No production role changes, grants/revokes, secrets, migrations, deployments, service configuration changes, or PR merge were performed. Any such production action requires separate explicit authorization after the support response and a reviewed change plan.


## Pre-change backup finding — no 10 November recovery point verified

The user clarified that the expected backup should have been taken on **10 November 2026, before the production role assignment/change**. The targeted workstation search did not find a 10 November PostgreSQL dump/archive. The user confirmed that the only Render-managed backup available is dated **4 November 2026**.

A local archive was found at the user's workstation with basename `2026-11-04T20_42Zghm-db.dir.tar.gz`. Its filesystem timestamps are 4 November 2026 at 22:46 local time; size 71,488 bytes; SHA-256 begins `3F5DBD02E03FD20F0A593A57E51700D07DC8FEEA42A03B2BD2A38AF127...`. The tar listing was readable and contains a `ghm_db` directory with numbered `.dat` files. This confirms a readable 4 November archive candidate, **not** a verified 10 November backup and not yet a tested restore.

The 4 November recovery point predates subsequent work and must not be treated as a current rollback point. A restore could discard later data and is not authorized.

**Operational rule:** before any further production database role, privilege, migration, or deployment change, first obtain a fresh backup of the current production state through a supported Render process and verify its completion, timestamp, size, and recoverability/readability. Keep production changes frozen until that protection is established. Do not imply that a backup exists without direct evidence.


## Follow-up engineering work — 2026-11-11

While awaiting Render support, safe repository-only work continued on PR #272. The API runtime now requires `GHM_RUNTIME_DATABASE_URL` in production instead of silently accepting generic `DATABASE_URL`; non-production retains the existing fallback. Main API startup now queries `session_user` and `current_user` and refuses readiness unless both are `ghm_runtime`. Unit tests cover the required production variable and mismatched login/effective identities.

A CI qualification step was added to reproduce the PostgreSQL 18 delegated `CREATEROLE` path in the disposable PostgreSQL 18 service: a non-superuser creator creates a role, CI inspects the automatic membership/grantor/options, attempts the same creator-side REVOKE, and verifies that the postgres-granted membership remains. This is deliberately separate from the clean superuser-created gateway fixture. Exact-head CI must pass before this behavior is considered qualified.

Exact code-head validation: commit `7043985e8877ede841d12b8886aeb9b41ecce948`; GitHub Actions run [#43052954162](https://github.com/zaidhqdev-sys/GHM/actions/runs/43052954162) completed successfully with both `quality` and `web-quality` passing. This includes the delegated PostgreSQL 18 CREATEROLE membership reproduction, strict gateway origin validation, redirect rejection, verified-account rate limiting, the new unit tests, build, all migrations, full test suite, Actor Gateway principal qualification, capability/supplier/profile qualifications, commercial settlement identity qualification, migration audit policy tests, runtime boundary verification, web build/tests and dependency audit.

The main API production configuration now requires `GHM_RUNTIME_DATABASE_URL`; generic `DATABASE_URL` is only a non-production fallback. Main API startup verifies `session_user=current_user=ghm_runtime` and checks the runtime role has LOGIN, NOINHERIT, no SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS attributes, and no memberships in either direction. A mismatch prevents the server from listening/ becoming ready. The Actor Gateway now performs the equivalent startup check for `ghm_actor_gateway`: it also requires LOGIN/NOINHERIT, no elevated role attributes, and no role memberships in either direction; failure prevents the gateway from listening. Tests cover wrong login/effective role and elevated role attributes/memberships. Render's existing production environment has not been changed to set this variable; any future deployment of this code must be separately planned after the production role model and backup gate are resolved.

Both the main API and Actor Gateway startup now reject a runtime principal with any role membership or elevated role attribute. The PostgreSQL 18 CI fixture creates a non-superuser CREATEROLE role, has it create a login role, asserts the automatic postgres-granted ADMIN OPTION membership with SET/INHERIT false, attempts the creator-side REVOKE, and verifies the membership remains. The fixture is isolated to the disposable CI database and cleans up both roles.

PR #272 remains open, ready for review (not draft), and unmerged. The latest fully validated code head is `512017beb5e46d939e70278b482e5cc0f721e0b5`; both `quality` and `web-quality` passed on that code in run [#43056260763](https://github.com/zaidhqdev-sys/GHM/actions/runs/43056260763). Subsequent branch commits are documentation-only handover reconciliations, including explicit supersession notices on the 10 November capability, Actor Gateway integration and supplier-classification handovers. Their latest exact-head CI is tracked separately; do not infer a pass until both jobs finish. No production environment, database, roles, grants, secrets, migrations, or services were changed.


## Production registration identity fail-closed routing (2026-11-11)

A further main-API route audit found that Business registration identity still fell back to the legacy direct database service when `GHM_ACTOR_GATEWAY_URL` was absent. This was inconsistent with the intended production gateway boundary.

- Added an explicit `businessRegistrationIdentityGatewayRequired` dependency, defaulting to `config.isProduction` in the real application.
- In production, registration identity read and write routes now return 503 when the gateway client is not configured; they do not call the legacy repository service.
- Development/test behavior can still use the direct service fallback unless the gateway-required flag is set.
- Added a test covering both read and write paths and asserting the legacy service is not called when gateway configuration is missing.
- Code head `512017beb5e46d939e70278b482e5cc0f721e0b5` passed both CI jobs, including build, full tests and disposable PostgreSQL qualification ([run 43056260763](https://github.com/zaidhqdev-sys/GHM/actions/runs/43056260763)). The production requirement is enforced as `config.isProduction || dependencyFlag === true`; a false injected flag cannot turn the legacy fallback back on in production.

## Gateway authentication-path consolidation (2026-11-11)

- Centralized `/v1` bearer-token verification in the authenticated namespace middleware. All route handlers now reuse the verified `res.locals.actorAccountId` rather than independently verifying the same JWT again.
- This ensures the per-account limiter and route handlers use the exact same verified identity and avoids duplicate ES256 verification work.
- Added a test asserting one verification per request and that the reader receives the verified account ID.
- Initial CI exposed three stale capability-route calls after the helper signature changed; those were corrected. The final code head `3f9f41288c953bcc1796d63a4e7b3e6535935e14` passed both CI jobs, including build, full tests, disposable PostgreSQL migrations and gateway/business/capability qualifications.

## Additional gateway public-surface hardening (2026-11-11)

Repository-only changes on the current PR branch:
- `/v1` requests now require a valid ES256 access JWT before rate-limit accounting or JSON parsing.
- Verified requests are limited per signed GHM account ID (default 120 per 60 seconds); caller-supplied account IDs and proxy IP headers are not used as the key.
- `/healthz` remains process-only and outside the authenticated `/v1` namespace.
- JSON request bodies remain capped at 16 KiB and are parsed only after authentication/rate-limit middleware.
- API-to-gateway clients share strict origin validation (HTTPS remotely, localhost HTTP only; no embedded credentials, path, query or fragment) and set redirect: error so a gateway redirect cannot silently change the destination of a bearer-token request.
- Tests cover account isolation, 429 behavior, health-route independence, origin validation and redirect rejection.

Limitations:
- The rate limiter is in-memory and per process/instance; counters reset on restart and are not shared across instances. It is not a distributed quota or volumetric DDoS defense. Avoid claiming it protects anonymous JWT-verification traffic at the network edge.
- No Render service was created, repurposed, upgraded or deployed. No paid service or recurring cost was introduced.


## Evidence and change-control discipline

For future work, record each operational claim as verified, inferred, or unverified and identify the evidence and timestamp. A filename, remembered action, Render UI label, or an unsuccessful search is not proof of a completed backup or change. Never state that a backup exists, a production role is corrected, a secret is provisioned, or a deployment is live without checking the authoritative source. Before any production database role/privilege/migration/deployment change, verify a fresh recoverable backup first; if evidence is missing, stop the production change. Distinguish repository code/CI qualification from live production state. Do not spend money or create paid infrastructure; no paid service is permitted until revenue can fund it.

## Dedicated supplier-classification operation enforcement (2026-11-11)

A further route-boundary review found that the Actor Gateway Business profile PATCH allowlist also accepted `isSupplier`, even though supplier classification has its own dedicated route, operation-bound HMAC assertion (`supplier.classification.update`), and API client path. The database profile function retains legacy `isSupplier` compatibility, but the gateway HTTP profile route should not bypass the dedicated operation boundary.

- Removed `isSupplier` from the Actor Gateway profile route allowlist. Supplier classification must use `PUT /v1/businesses/:businessId/supplier-classification` and its dedicated assertion operation.
- Added a regression test that a profile PATCH containing only `isSupplier` returns 400 and does not reach the profile reader.
- Code commits: `4596cb5b80c5d1b7586f8c8507205cf3d7c1ad36` (route) and `e3347845bf9827fdb6ac48ad33b451cd06f1b4c7` (test). Exact-head CI is pending; do not treat this correction as validated until both `quality` and `web-quality` pass on the final head.
- This is repository-only. No production migration, deployment, secret, grant, or runtime setting changed.

## Gateway operation separation and HMAC comparison hardening (2026-11-11)

The continuing source review found two additional improvements and applied repository-only corrections:

1. The gateway Business profile PATCH route previously accepted `isSupplier` despite supplier classification having its own dedicated endpoint and signed operation. The profile allowlist now excludes `isSupplier`; a regression test verifies this returns 400 without invoking the profile reader. Supplier classification must use its dedicated endpoint and `supplier.classification.update` assertion.
2. The final migration definition of the shared HMAC assertion verifier previously compared the expected and supplied MACs using bytea equality. The final definition now XOR/OR accumulates all 32 byte differences before branching, avoiding an early-exit prefix comparison. A migration-contract test asserts the fixed-length comparison is retained. Earlier migration definitions are superseded by the final forward migration in the ordered chain; the final deployed definition is the one that matters.

Relevant code/test commits: `4596cb5b80c5d1b7586f8c8507205cf3d7c1ad36`, `e3347845bf9827fdb6ac48ad33b451cd06f1b4c7`, `fe6ceb7ee1ac8b04c04ad3ac6304e66635e709f2`, and `185b439ecf51cf3ec70c947daf4379c8d3aab571`. Exact-head CI is pending on the final branch head; do not treat these latest changes as validated until both required jobs pass.

These changes do not alter production state, migration history already applied, database roles, secrets, Render services, or product routing.
