# Handover — Actor Gateway production readiness (2026-11-11)

## Scope and status

This handover records the production-readiness review of GHM Actor Gateway PR #272 and the PostgreSQL privilege issue found during read-only inspection.

- Repository: `zaidhqdev-sys/GHM`
- PR: [#272 — Unified Actor Gateway](https://github.com/zaidhqdev-sys/GHM/pull/272)
- Branch: `integration/capability-gateway-qualification-20261110`
- Last fully validated code head: `512017beb5e46d939e70278b482e5cc0f721e0b5`
- At review: PR remained open and unmerged.
- Latest fully validated code head: `2179984393ed01148420366b8665cd5cee7208a1`; both `quality` and `web-quality` passed ([run 43058907214](https://github.com/zaidhqdev-sys/GHM/actions/runs/43058907214)). This includes the fail-closed production registration routing, dedicated supplier-operation boundary test, and fixed-length HMAC comparisons across all four assertion migrations.
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

Relevant code/test commits: `4596cb5b80c5d1b7586f8c8507205cf3d7c1ad36`, `e3347845bf9827fdb6ac48ad33b451cd06f1b4c7`, `fe6ceb7ee1ac8b04c04ad3ac6304e66635e709f2`, and `185b439ecf51cf3ec70c947daf4379c8d3aab571`. The combined code changes passed both required CI jobs on code head `2179984393ed01148420366b8665cd5cee7208a1` in [run #43058907214](https://github.com/zaidhqdev-sys/GHM/actions/runs/43058907214). The later documentation reconciliation commit `4909c3d8e584b5bdd0d62203a44a4d714c06bd78` also passed both `quality` and `web-quality` in [run #43059337744](https://github.com/zaidhqdev-sys/GHM/actions/runs/43059337744).

These changes do not alter production state, migration history already applied, database roles, secrets, Render services, or product routing.

### HMAC comparison applied consistently across the ordered migration chain

The fixed-length 32-byte XOR/OR comparison is now present in all four migrations that define or extend `ghm.assert_actor_gateway_capability` (`20261111020000`, `20261111030000`, `20261111040000`, and final definition `20261111050000`). This avoids leaving an early-exit bytea comparison in an intermediate migration state if a later migration fails. Static migration-contract tests now enforce the fixed-length comparison for the capability, supplier, Business profile, and final registration/self-identity definitions. Commits: `9a297c23cff5432748e0483c675fbfcb18780751`, `6aaf0c25ff4fb3e04a1380ee0fad59c890fe1e3e`, `623be533c06a196fe72e0332a21dfccf1bb2130b`, `f91093c99a61ccc4b6b8efd11d434749ebd3cf5d`, `c4a4cee00ce001bb309a6cbaeeb71441ec50cba5`, and `2179984393ed01148420366b8665cd5cee7208a1`. The latest exact-head CI is still pending.


## 2026-11-11 — v2 request-context-bound Actor Gateway assertions

This section supersedes the earlier dated notes above that describe the database assertion as binding only the actor ID, operation, issue time and nonce. That was the previous design; it is no longer the current PR candidate.

The source review identified that an otherwise valid, unused one-use assertion could be presented with a different business ID, capability ID or payload because the HMAC did not include those arguments. The wrapper's own authorization checks still applied, but the signed proof was not tied to the exact request. This was corrected in forward-only migration `20261111060000_bind_gateway_assertions_to_request_context.sql` and the matching gateway readers:

- Assertions now use version `ghm-actor-gateway:v2` and sign actor ID, exact operation, issue time, nonce, and the UTF-8 bytes of a serialized request-context object.
- Each database wrapper recomputes the expected JSONB context from its actual SQL arguments and rejects a mismatch before performing the operation. This binds capability IDs and draft/transition fields, supplier business ID and boolean, Business profile business ID and full patch, registration business ID and all registration fields, and the empty context for self-identity/list operations.
- The database verifier enforces an explicit nine-operation allowlist, rejects a null operation, caps context size at 32 KiB, retains the 60-second validity window, checks the full 32-byte HMAC before branching, and retains one-use nonce replay protection.
- The gateway readers create the assertion context and pass it with the signature in the same database transaction. The serialized context is signed exactly as sent; PostgreSQL's JSONB comparison verifies semantic equality with the actual arguments.
- The Business profile database wrapper now rejects both `isSupplier` and `is_supplier`. Supplier classification can only use its dedicated signed operation, not the profile wrapper.
- Disposable qualifications now explicitly attempt capability argument substitution, registration target substitution, registration payload substitution, profile patch substitution, and supplier boolean substitution. Those mismatches must fail with SQLSTATE 42501 before the mutation.
- The actor-principal, capability catalogue, legacy capability cutover, supplier-classification and Business profile qualification scripts have all been updated to call the v2 signatures. The CI qualification does not retain old wrapper signatures as a compatibility escape hatch.

**Validation:** exact code head `5a846df7f8d107eb1c2c99654b11c344bd7ed06a` passed both `quality` and `web-quality` in [GitHub Actions run #43065388570](https://github.com/zaidhqdev-sys/GHM/actions/runs/43065388570). This run applied the complete migration chain to disposable PostgreSQL 18, built the project, passed the full test suite, gateway-principal qualification, capability catalogue qualification, disposable legacy cutover qualification, supplier classification qualification, Business profile qualification, commercial settlement qualification, migration audit and runtime boundary verification.

**Scope and remaining blockers:** this is repository code and disposable CI only. No production migration, HMAC secret provisioning, role/grant change, Render service/environment change, deployment, or manual legacy grant cutover has occurred. The live production role model remains blocked on Render's response. No verified 10 November backup exists; the 4 November recovery point is stale and must not be used as a rollback point for later work. No paid infrastructure is permitted until revenue can fund it. PR #272 remains open and unmerged.


## 2026-11-11 — nonce retention boundary and HMAC rotation review

A further review found that the nonce row expiry had been calculated as `issued_at + 60 seconds`, while the verifier accepts assertions within a 60-second clock-skew window. Near the end of that acceptance window, cleanup could therefore consider a nonce expired before the assertion itself was fully outside the accepted window. The nonce expiry is now calculated as `GREATEST(clock_timestamp(), to_timestamp(issued_at)) + interval '60 seconds'`, so the nonce remains stored for at least 60 seconds after first acceptance, including for assertions whose issue time is near the edge of the accepted past/future window.

- Applied the corrected retention expression in all four ordered migrations that define the v1 assertion verifier and in the final v2 request-context migration. This keeps intermediate migration states safe if a later migration fails.
- Added an index on `ghm.actor_gateway_capability_assertion_nonce(expires_at)` so expiry cleanup does not require a full table scan as request volume grows.
- Added migration-contract checks across all four earlier definitions and the final v2 definition.
- Extended the disposable actor-gateway qualification: it signs an assertion with an issue time 30 seconds in the past, executes it, and verifies the nonce remains stored for more than 58 seconds from the time of the check. This distinguishes the corrected retention from the old issue-time-based expiry.

**Validation:** current code head `7213dcc280da652d8913944136e3b312fb7e0638` passed both `quality` and `web-quality` in [GitHub Actions run #43067027027](https://github.com/zaidhqdev-sys/GHM/actions/runs/43067027027). The run applied the complete PostgreSQL 18 migration chain, passed the full test suite and all actor-gateway, capability, supplier, Business profile, registration, cutover and runtime-boundary qualifications.

### HMAC assertion-key rotation limitation

The current HMAC verifier uses one protected singleton secret row and one gateway environment secret; unlike the ES256 verifier, it has no key ID or previous-key overlap. A rotation is therefore currently a coordinated maintenance-window operation: stop the gateway, update the protected database secret and gateway environment secret as a matched pair, restart, then verify the signed path before restoring traffic. Do not rotate one side while the gateway is serving requests. Before production provisioning, the rotation and rollback procedure must be documented and the previous secret held in approved secure custody; alternatively, add key IDs and dual-key verification before production if no-downtime rotation is required. No production HMAC secret has been generated or provisioned, so this is a design gate, not a live outage.

No production migration, role/grant change, secret provisioning, Render service/environment change, deployment, or manual legacy cutover occurred. PR #272 remains open and unmerged. The production database privilege issue and missing fresh backup remain blockers; no paid infrastructure is permitted until revenue can fund it.


## 2026-11-11 — expanded request-context substitution qualification (CI pending)

The v2 database wrappers already compare signed request context with the actual SQL arguments. The disposable qualification scripts have now been extended to exercise additional independent target-substitution cases rather than relying only on the existing payload-substitution cases:

- Capability draft update: signed capability ID substituted with a different disposable capability ID; separately, signed update fields are changed after signing.
- Capability lifecycle transition: signed capability ID substituted with a different disposable capability ID; separately, the target lifecycle status is changed after signing.
- Supplier classification: signed Business ID substituted with a different ID.
- Business profile: signed Business ID substituted with a different ID.

The existing supplier boolean and Business profile patch substitution tests remain in place. The capability creation payload-substitution test also remains. Each new case expects the database wrapper to reject with `Actor assertion context mismatch` before the underlying operation. These are negative tests only; they do not change production data or authorize cutover.

**Validation status:** changes are committed to the PR branch, but exact-head CI has not yet been checked for this test expansion. Do not report these new cases as passing until the disposable PostgreSQL qualification and both CI jobs pass on the exact current head. The prior validated code head remains `7213dcc280da652d8913944136e3b312fb7e0638` (run #43067027027); later documentation-only head `a7fa07e396cdb6717bb013996f59fb70e815a06c` also passed both CI jobs (run #43067466817).

Production remains paused: Render's role-model response and a fresh verified production backup are still required. The 4 November backup is stale for the 10 November role work. No production migrations, role/grant changes, secrets, deployments, or paid infrastructure are authorized by this qualification work.


## 2026-11-11 — exact-head substitution qualification passed

The expanded request-context substitution qualification is now green on exact PR head `b7f3f2f2d8a9d18a023af86bf7a88f7e40016c6d`.

- GitHub Actions CI run #2862 / run ID `43071811499`: both `quality` and `web-quality` completed successfully.
- The `quality` job passed the full build, complete migration application to disposable PostgreSQL, full test suite, capability lifecycle and two-session assertion replacement qualification, capability catalogue governance qualification, capability legacy RPC cutover qualification, supplier classification and membership authorization qualification, Business profile gateway/compatibility qualification, payment settlement identity qualification, migration audit policy tests, and runtime boundary verification.
- `web-quality` passed the web application build and associated checks.
- The newly added capability update target/payload, capability lifecycle target/status, supplier Business-ID, and Business profile Business-ID substitution negative tests are included in the successful disposable PostgreSQL qualification steps. Existing capability-create payload, supplier boolean, and profile patch substitution cases remain covered.

**Result:** request-context substitution qualification is passed for the cases listed above. This is evidence for the tested database wrappers and test fixtures; it is not a blanket claim that every gateway operation, production topology, key-rotation process, or production database privilege is fully qualified.

PR #272 remains open, unmerged and mergeable at the time of this update. Production remains blocked on Render's supported role-model resolution and a fresh verified backup. The 4 November recovery point is stale for the 10 November role work. No production migrations, grants/role changes, secrets, deployments, or paid infrastructure were introduced by this work.


## 2026-11-11 — registration identity target-substitution coverage added (CI pending)

A further operation-by-operation review found that registration identity already had a read-target transplant test and an update-payload substitution test, but lacked the matching update-target transplant test. Added a disposable PostgreSQL negative case that signs a registration update for one fixture Business and substitutes a second fixture Business ID while preserving the signed payload. It expects SQLSTATE `42501`. This closes that specific qualification gap; exact-head CI is pending. No production state was touched.


## 2026-11-11 — registration update target-substitution qualification passed

Exact PR head `cd591533b5130b560c58ffefc268fe416bbfa59c` passed GitHub Actions run #2870 (`43074793542`): both `quality` and `web-quality` succeeded. The `quality` job completed the full build, complete disposable PostgreSQL migration chain, test suite, actor-gateway principal qualification, registration migration qualification, capability lifecycle/governance/cutover qualifications, supplier classification and Business profile qualifications, commercial settlement identity checks, migration policy tests, and runtime boundary verification.

The new actor-gateway principal qualification includes the Business registration update target-substitution case: an assertion signed for one fixture Business was presented with another fixture Business ID and rejected with SQLSTATE `42501`. The existing registration read target-transplant and update payload-substitution tests also ran in the same successful qualification. This is bounded disposable-database evidence for the exercised cases, not overall production readiness.

PR #272 remains open, unmerged and mergeable at this check. Render's supported production role-model resolution and a fresh verified backup remain mandatory blockers. No production migration, role/grant change, secret provisioning, Render service change, deployment or paid infrastructure was introduced.


## 2026-11-11 — Cloudflare Pages pull-request preview status

The Cloudflare Pages integration has reported a successful **pull-request preview deployment** for commit `29d95abb600fbaa341fd0e08c17dd7bbd2e91fd7`, preview URL: https://16db3a85.ghm-cu1.pages.dev. This is a PR preview, not evidence of a production-domain deployment or production traffic cutover. The preview is an externally hosted build generated by the repository's Cloudflare Pages integration; distinguish it from Render Actor Gateway service deployment and from a production release.

At this check, PR #272 remained open and unmerged. Exact-head GitHub Actions run #2873 (`43075067314`) was still in progress: `web-quality` had passed and `quality` was progressing through disposable PostgreSQL qualifications. No production migration, role/grant change, secret provisioning, Render service change, or paid infrastructure was introduced.


## 2026-11-11 — legacy Business registration RPC privilege gap and manual cutover added (CI pending)

A source-level privilege audit found that the original `ghm.read_business_registration_identity(bigint,bigint)` and `ghm.update_business_registration_identity(bigint,bigint,text,text,text)` SECURITY DEFINER functions still grant EXECUTE to `ghm_runtime`. The new HTTP routes correctly fail closed through the signed Actor Gateway in production, but that application routing alone does not remove the database-level bypass: a compromised runtime process could call the legacy functions directly and supply another account ID, subject to the function's own membership check against that supplied ID.

Added manual cutover `database/cutovers/20261111020000_revoke_legacy_registration_identity_runtime.sql`. It revokes direct legacy registration read/write execution from PUBLIC, `ghm_runtime`, `ghm_migrator`, and `ghm_actor_gateway`; the signed `ghm.gateway_read_business_registration_identity` and `ghm.gateway_update_business_registration_identity` SECURITY DEFINER wrappers remain executable by `ghm_actor_gateway` and invoke the underlying functions as `ghm_schema_owner`.

Extended `scripts/qualify-actor-gateway-principal.mjs` to apply this manual cutover only to the disposable PostgreSQL qualification database, prove that ordinary runtime direct read/write calls fail with SQLSTATE `42501`, prove signed gateway read/write still work, and verify effective function privileges. Extended the registration assertion migration-contract test to guard the manual cutover SQL and wrapper grants.

**Validation status:** this new cutover qualification has not yet run on exact-head CI. The cutover file is deliberately under `database/cutovers`, not `database/migrations`; it is not automatically applied. Do not apply it to production until the Actor Gateway is deployed, registration routes have passed end-to-end verification, the Render role model is resolved, and a fresh verified backup exists. No production privileges, roles, data, secrets, deployments or services were changed.


## 2026-11-11 — registration legacy RPC cutover qualification passed

Exact code/test head `9f69d17ef362cc01e45fe151609101893104747a` passed GitHub Actions run #2891 (`43076550978`): both `quality` and `web-quality` succeeded. The `quality` job passed the full build, complete disposable PostgreSQL migration chain, full test suite, Actor Gateway principal qualification, registration migration qualification, all capability lifecycle/governance/cutover qualifications, supplier classification, Business profile, commercial settlement identity, migration policy and runtime-boundary checks.

The Actor Gateway principal qualification applied the new manual registration cutover to the disposable database. It proved:
- `ghm_runtime` cannot directly execute legacy registration identity read or write functions (SQLSTATE `42501`).
- Signed Actor Gateway registration read and write wrappers continue to work after the revocation.
- Effective grants do not give `ghm_runtime` or `ghm_actor_gateway` direct execution of the underlying legacy functions, while the gateway role retains execute on the signed wrappers.
- The test suite checks the manual cutover file and final v2 wrapper grants.

The first qualification attempts exposed harness defects (missing Node imports, wrong pool variable, then over-escaped contract regex); these were corrected. The successful exact-head run is #2891, not the earlier failed attempts. Cloudflare Pages also reported a successful PR preview for this exact commit at https://7d9a60be.ghm-cu1.pages.dev; this is a preview only, not a production release.

PR #272 remains open, unmerged and mergeable. The manual registration cutover remains unapplied to production. Production remains blocked on Render's supported role-model resolution and a fresh verified backup. No production role/grant, secret, migration, service/environment or production deployment was changed.


## 2026-11-11 — follow-on legacy RPC actor-impersonation audit (open; no cutover)

A deeper review of application resource paths found legacy SECURITY DEFINER operations that still trust a caller-supplied account ID. These are not covered by the current Actor Gateway migration set and must not be described as protected by the signed v2 gateway assertion boundary.

### Confirmed high-priority gaps

1. `ghm.replace_business_capability_assertions(bigint,bigint,jsonb)` remains executable by `ghm_runtime`. It authorizes membership against its supplied `p_actor_id`, but the resource repository supplies `context.userId` from the API's verified token. A compromised runtime DB client can call the function directly with another active Business owner/administrator's account ID and attempt assertion replacement. The function correctly locks the Business and enforces owner/administrator membership; that does not authenticate the caller identity at the DB boundary.
2. `ghm.transition_business_capability_verification(bigint,text,text,bigint,text)` remains executable by `ghm_runtime`. It checks the supplied `p_verifier_id` has role `admin` and is not the assertion creator. The HTTP service checks the verified JWT context role before calling it, but a compromised runtime DB client can supply an admin account ID directly. The database function does not cryptographically bind the verifier ID to a verified actor.
3. `ghm.transition_business_capability_evidence(bigint,text,bigint,text)` remains executable by `ghm_runtime`. It similarly checks the supplied verifier ID's database role and self-verification restriction, but does not bind that ID to the authenticated request. The HTTP service checks admin role; direct runtime EXECUTE bypasses that service check.

### Scope and existing controls

- The HTTP routes currently use verified GHM auth middleware and service-level role checks. This is not equivalent to database-level caller identity when the runtime database credential itself is compromised.
- Assertion replacement SQL enforces active Business membership, owner/administrator role, Business row locking, active/selectable catalogue references, bounded input, and verification invalidation on material changes. The gap is actor authenticity at the SQL privilege boundary, not absence of tenant checks.
- Evidence verification SQL enforces admin role, forbids self-verification, validates transitions/reasons, serializes the parent assertion/evidence aggregate and prevents expired evidence verification. The gap is actor authenticity at the SQL privilege boundary.
- Evidence submission uses a direct runtime INSERT with `submitted_by=context.userId`; its repository performs Business membership/owner checks before insertion. Treat this as a separate write path to review for signed actor binding, not as already covered by the gateway.
- Founder directory-review operations are explicitly disabled by `20261109140000_close_evidence_and_founder_review_authority.sql`: reviewer predicate returns false and the runtime EXECUTE grants for submit/list/review are revoked. Keep this feature disabled; do not reopen it as part of this remediation.

### Required remediation before claiming full runtime DB isolation

- Add dedicated signed Actor Gateway operations for Business Capability assertion replacement and admin verification/evidence decisions. The gateway must derive actor identity from the verified GHM access token and sign exact business/assertion/evidence IDs, operation, decision, reason and payload context.
- Route the existing HTTP endpoints through the gateway client using the original bearer token; fail closed when gateway configuration is absent. Do not pass a caller-supplied actor ID from the API to the gateway.
- Add disposable PostgreSQL qualification proving direct `ghm_runtime` EXECUTE is denied after the manual cutover, signed gateway calls succeed, altered actor/target/payload/operation assertions fail, replay fails, non-admin review fails, non-owner Business replacement fails, and membership/Business authorization still holds.
- Add migration-contract tests for exact function signatures, revoke/grant ACLs, request-context equality and manual-cutover SQL.
- Add a manual-only cutover under `database/cutovers`; do not silently revoke runtime EXECUTE in an automatically applied migration while the current app routes still call the legacy functions.
- Separately decide whether evidence submission should also become a gateway operation; its current direct table INSERT and submitted_by binding require a distinct least-privilege design.

### Status and safety

This was the confirmed source-level finding at the time of the initial audit, not a production exploit finding. No evidence of unauthorized use was established. The statement that no cutover implementation existed is superseded by the implementation and exact-head disposable qualification recorded below. The manual privilege cutover remains unapplied in production. Render role-model resolution and a fresh verified production backup remain release blockers. No production state was changed.


## 2026-11-11 — Business Capability mutation gateway implementation and qualification

A focused implementation adds signed Actor Gateway operations for all four Business Capability mutation paths:
- `business.capability.replace`: binds Business ID and the complete assertion JSON array, then invokes the existing membership/owner/administrator-checked replacement function using the verified actor derived from the JWT.
- `business.capability.verify`: binds capability assertion ID, expected status, target status and reason; the gateway supplies the verified actor as the verifier ID. The underlying database function enforces administrator authority and expected-state transition rules.
- `business.capability.evidence.review`: binds evidence ID, decision and reason; the gateway supplies the verified actor as the verifier ID. The underlying database function enforces administrator authority and prohibits self-verification.
- `business.capability.evidence.submit`: binds the complete evidence payload; the database gateway wrapper independently resolves active Business membership and owner/administrator role and sets `submitted_by` from the verified actor.

Implementation files:
- Migration `20261111070000_add_signed_business_capability_mutations.sql` adds the signed wrappers and extends the v2 operation allowlist.
- `database/cutovers/20261111030000_revoke_legacy_business_capability_runtime_mutations.sql` is manual-only and revokes legacy assertion replacement, verification and evidence review RPCs plus table/column-level runtime INSERT and sequence privileges for evidence submission.
- Actor Gateway reader, authenticated routes and server wiring were added under `src/actor-gateway`.
- Resource API gateway client and fail-closed production routing were added to Business Capability replacement/verification and evidence submission/review paths.
- The gateway database wrappers return the complete evidence DTO, so the Actor Gateway database principal does not require direct evidence-table SELECT access.
- Migration contract tests check signed context binding and gateway-only EXECUTE grants for all four wrappers, including evidence submission.
- Actor Gateway app tests cover deriving the evidence submitter from the verified bearer-token actor and rejecting caller-supplied `submittedBy`.
- Resource API HTTP tests now cover bearer-token forwarding for replacement, verification, evidence submission and evidence review; gateway-unavailable fail-closed behavior; and role-specific denial of Business evidence review and administrator evidence submission.

### Exact-head qualification passed

Latest qualification head `ccb194905d320602c476e54808ce1985b901f39d` passed GitHub Actions run **#3013** (`43087190865`) on 11 November 2026. Both `quality` and `web-quality` passed. This head includes the final expanded role-boundary qualification described below.

The successful `quality` job included:
- TypeScript build and complete PostgreSQL migration application.
- Full automated test suite, including the newly enabled Business Capability evidence router tests and new gateway route tests.
- Disposable PostgreSQL qualification of all four signed mutation wrappers after applying the manual cutover.
- Direct runtime denial for the legacy replacement, verification and evidence-review functions.
- Direct runtime denial for all four new signed gateway wrapper functions, proven by actual runtime-role calls and the privilege matrix.
- Direct runtime denial for evidence table INSERT and evidence sequence access.
- Successful signed gateway replacement, administrator verification, evidence submission and administrator evidence review after cutover.
- HMAC/context tampering and replay rejection.
- Business membership/owner/admin authorization negative cases.
- Evidence submitter/verifier provenance and existing evidence DTO compatibility.
- Post-cutover role privilege checks.
- Migration audit policy tests and runtime boundary verification.

The qualification also exposed and corrected test-only defects during the work: the initial Business fixture did not satisfy the verified-state constraint; the replay test initially signed a different payload; the replacement assertion expected the wrong row count; and previously unexecuted evidence-router tests contained stale expectations about HTTPS validation and business-scoped listing. The tests now exercise the actual service validation boundary and the intended business-scoped read/admin-only moderation contract. A further review also added explicit HTTP role checks before gateway evidence submission/review, so these routes do not rely solely on database rejection.

The successful disposable qualification is evidence for the manual cutover design; it is not permission to apply that cutover to production.

### Remaining release gates

1. Obtain Render support's written confirmation of the production database role/ownership model and supported role-membership approach.
2. Obtain and verify a fresh production backup before any production migration or privilege change. The previously missing 10 November backup remains unresolved; do not assume it exists.
3. Review and approve the production cutover plan, exact target database, rollback strategy and deployment ordering before mutation.
4. Provision/verify the Actor Gateway assertion secret and runtime/gateway connection configuration only after the production role model and backup gates are cleared.
5. Keep PayFast out of this work until its sandbox is available again; no payment-provider testing is part of this qualification.
6. Keep approved legal-document work out of this technical cutover.

No production migration, privilege cutover, secret provisioning, deployment, role change or data mutation was performed. The new cutover is not applied. PR #272 remains open and unmerged. No paid infrastructure was introduced.


## 2026-11-12 — dependent issuer and Actor Gateway ACL follow-up

The current work has continued on dependent branch `construction/auth-issuer-isolation-20261112`, based on PR #272's `integration/capability-gateway-qualification-20261110`. Do not treat this as a new independent integration branch or merge PR #272 underneath it separately.

Current security corrections:
- Authentication Issuer startup now enforces the exact `ghm_auth_issuer` login/effective role, LOGIN/NOINHERIT, no elevated attributes and no role memberships before listener startup. It also enforces its exact ten-function allow-list, no direct relation privileges, schema USAGE without CREATE, and safe future-function defaults.
- Actor Gateway startup now enforces its exact 25-function signed/typed allow-list across the full `ghm` schema, no direct table/view/sequence privileges, schema USAGE without CREATE, no PUBLIC EXECUTE on gateway-executable functions, no runtime EXECUTE on gateway-specific functions, and safe future-function defaults.
- Nine historical pre-signed overloads were already dropped by earlier migrations. The remaining unused unsigned `ghm.assert_actor_gateway(bigint)` helper is now revoked from PUBLIC, runtime, migrator and gateway; current signed wrappers use `assert_actor_gateway_capability`.
- Runtime's exact `ghm.auth_*` allow-list is now two lookup functions: `auth_lookup_external_identity` and `auth_lookup_business_external_mapping`. The mapping mutation helper is schema-owner-only and called inside the new signed `gateway_provision_connect_business` operation.
- Future function default verification now treats PUBLIC, runtime, issuer, gateway, migrator and payment-provider grants as unsafe.
- The manual issuer cutover and database-only rollback remain disposable-only. The cutover revokes the old business-mapping helper from application roles; the rollback does not restore it or the unsigned Actor Gateway helper.

Current exact candidate head at the time of this note: `c877b67a39479ae2d7ac1f32b25f66363b6ba540`. Exact-head CI is still running/being corrected; do not claim the Actor Gateway principal qualification is green yet. The last actor-gateway diagnostic proved the 24-function effective ACL set, no direct relation access, no schema CREATE, no PUBLIC function execution, no runtime gateway-function execution, and safe future defaults. The failure after that diagnostic was a stale qualification assertion expecting the now-revoked unsigned helper to remain executable; the test was changed to require denial and the next exact-head run must confirm it.

Production remains unchanged. No production migrations, grants, role changes, secrets, deployments, service creation or routing changes occurred. PR #272 remains open/unmerged. Fresh independently verified backup and Render role/ownership resolution remain blocking production gates. No paid infrastructure was introduced.



### Superseding Connect Business provisioning closure — 2026-11-12

The earlier three-function runtime dependency and proposed-grant-preservation note is historical and superseded by the signed gateway implementation later added to this dependent branch.

Migration `20261112080000_signed_connect_business_provisioning_gateway.sql` introduces `business.connect.provision` and `gateway_provision_connect_business`. The SECURITY DEFINER operation validates the signed Actor Gateway assertion against the verified actor, operation, nonce, timestamp and canonical request context; requires an active business/admin actor; serializes concurrent provisioning by external Business ID; verifies active membership when resolving an existing mapping; and atomically creates the canonical GHM Business, owner membership and external mapping. It is owned by `ghm_schema_owner` and granted only to `ghm_actor_gateway`.

The internal `auth_link_business_external_mapping` helper is revoked from PUBLIC, `ghm_runtime`, `ghm_migrator`, `ghm_actor_gateway`, `ghm_auth_issuer` and `ghm_payment_provider`. It is invoked inside the signed gateway's SECURITY DEFINER transaction, not directly by the Resource API runtime. The manual issuer cutover includes the matching runtime/application revocation. The Resource API runtime's exact auth-function set is now two lookup functions. The issuer qualification script expects those two functions after cutover and rollback and denies direct mapping-link execution.

The SQL cutover's stale trailing comment and the issuer runbook have also been corrected. The initial qualification follow-up that temporarily added a three-function expectation was superseded before exact-head CI and must not be treated as current evidence.

The signed gateway migration contract test checks the operation name, SECURITY DEFINER ownership, gateway-only grant, atomic membership/mapping path and revocation of the internal helper. The full disposable gateway qualification and the updated issuer cutover/lifecycle/rollback suite must both pass on the same exact branch head before this integration is considered qualified.

Production remains unchanged. PR #272 and the dependent issuer branch remain open/unmerged. Fresh independently verified production backup, Render role/ownership resolution, reviewed network/TLS topology, recovery delivery and separate deployment/cutover approvals remain blocking gates. No paid infrastructure was introduced.


## 2026-11-12 security audit follow-up

This readiness handover remains the production-readiness record for PR #272 and its integration branch. The separate database-wide security inventory work is on `construction/auth-issuer-isolation-20261112`; it is not PR #272 and its CI must not be attributed to PR #272.

The construction branch's latest validated code/documentation head at the time of this update was `36fd0f63ec094a0603c3d3c272e04a456b2078a5`, with both `quality` and `web-quality` passing in Actions run `43222978930` (55/55 quality steps). The retrieved PostgreSQL 18.6 disposable inventory contained 97 SECURITY DEFINER routines, all in `ghm`, all owned by `ghm_schema_owner`, all with the exact pinned search path `pg_catalog, ghm, pg_temp`, all using trusted languages, and zero PUBLIC EXECUTE grants. After correctly excluding PostgreSQL superuser bypass, 70 direct application-role grants remain for explicit review: runtime 43, Actor Gateway 25, payment provider 2, migrator 1. Artifact SHA-256: `504617d724670704e673ed22f4841069d02a19aceeca2674e9b6de9cdb73e64d`.

A new unresolved source-level database boundary finding affects five non-public `ghm_runtime`-executable storage SECURITY DEFINER functions: pending-object creation, object metadata read, mark-available, mark-deletion-pending and mark-deleted. Their current application service performs tenant authorization and provider verification, but the SQL functions do not independently bind caller-supplied account/business/object IDs to a database-verifiable actor/provider assertion. Do not revoke their grants until a signed Actor Gateway storage-metadata path or another qualified least-privilege replacement is implemented. The public approved-business-logo lookup is separate and constrained. Saved Business remains favourites/bookmarks; its legacy direct RPCs are covered by a distinct signed gateway/manual cutover.

The production blockers in this handover remain unchanged: Render's production role-administration/CREATEROLE/ADMIN OPTION issue is unresolved, the required fresh current-state backup/recovery gate is not evidenced, the Actor Gateway service/network/cost decision remains unresolved under the no-paid-infrastructure constraint, and no production role/grant/migration/deployment or manual cutover is authorized. PR #272 remains open/unmerged and not mergeable at the last inspection; do not merge it or the construction branch as part of this audit. See the full security handover for the exact grant reconciliation and storage remediation requirements.
