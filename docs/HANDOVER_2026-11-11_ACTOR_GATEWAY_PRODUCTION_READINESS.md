# Handover — Actor Gateway production readiness (2026-11-11)

## Scope and status

This handover records the production-readiness review of GHM Actor Gateway PR #272 and the PostgreSQL privilege issue found during read-only inspection.

- Repository: `zaidhqdev-sys/GHM`
- PR: [#272 — Unified Actor Gateway](https://github.com/zaidhqdev-sys/GHM/pull/272)
- Branch: `integration/capability-gateway-qualification-20261110`
- Reviewed head: `f4b1a5a9a19387c7ab27b40b7f8b09296fc91229`
- At review: PR remained open and unmerged.
- CI on that exact head: `quality` and `web-quality` passed ([run 42946064325](https://github.com/zaidhqdev-sys/GHM/actions/runs/42946064325)).
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

The production migration `20261110210000_add_actor_gateway_principal_guard.sql` currently rejects any membership involving `ghm_actor_gateway`. **Keep this guard strict; do not weaken it to accommodate the production-created role.** CI currently creates the gateway role as a superuser/admin and does not reproduce the Render CREATEROLE creation path. Qualification should cover both creation paths.

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

The PR's `src/config.ts` reads the API database connection from `DATABASE_URL`; it does not explicitly require `GHM_RUNTIME_DATABASE_URL` or validate the database session identity at startup. The actual deployed environment value was not visible in this review, so do not assume the live API is connected as `ghm_runtime` or any other particular role.

Before rollout:
- Make the API use an explicitly named restricted runtime connection in production (or otherwise explicitly configure and verify the expected login).
- Add a startup/qualification check for the expected `session_user` and effective role; fail closed on mismatch.
- Verify the Actor Gateway uses its dedicated login and cannot SET ROLE to migrator/schema-owner/runtime or administer memberships.
- Verify the runtime login cannot grant itself membership, create roles, or assume gateway/migrator/schema-owner roles.

## Other qualification notes

- `pgcrypto` is available as a trusted extension on PostgreSQL 18 but is not currently installed. `ghm_schema_owner` has database CREATE privilege, so extension installation is not by itself a blocker.
- The HMAC secret/nonce tables are not yet present in production. The CI qualification provisions only a disposable test secret; this is not production secret provisioning.
- HMAC key custody must be independent between the gateway secret store and protected database secret table. Never put key material in Git, chat, SQL history, or logs.
- The API's use of generic `DATABASE_URL` remains an identity-enforcement gap until corrected and verified.
- Gateway configuration currently accepts HTTPS origins while the server is created with `http.createServer()`. Confirm Render private-network addressing/protocol and implement a strict internal endpoint configuration before service deployment; do not treat external TLS mode with `rejectUnauthorized:false` as authenticated server identity.
- Render workspace inspection found no dedicated Actor Gateway service. `GHM-Internal-Runtime` is a public web service on `main`, not a private Actor Gateway service; do not repurpose it. A separate private Frankfurt gateway service is the intended architecture, with auto-deploy disabled until qualified.
- Existing legacy capability SECURITY DEFINER grants and other legacy access paths must remain in place until the new path is deployed and end-to-end proven. The manual cutover file is not part of the migration directory and must not be run prematurely.
- CI on the reviewed head passed, but its role-creation fixture does not reproduce the production Render CREATEROLE path. Add coverage for both the automatic-membership case (expected rejection) and a separately authorized clean role-creation case (expected qualification).

## Next steps (blocked on role-model resolution)

1. Await Render human support response; ask specifically for the supported administrative correction path described above.
2. In parallel, prepare code/CI changes for explicit runtime DB URL and startup session identity enforcement, plus role-creation-path qualification. Do not deploy or apply production migrations while the production privilege model remains unresolved.
3. Agree a safe, staged role migration with a restricted runtime login and a separately controlled schema-owner/migrator path. Test replacement credentials before switching the live service.
4. Re-run CI and exact-head review after code changes.
5. Only after the role model and network path are qualified, provision the dedicated private gateway service, secrets, and schema changes under explicit change authorization.
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

Latest code/documentation head at handover update: PR #272 branch `integration/capability-gateway-qualification-20261110`; latest CI run is triggered by the new commits and must be checked against its exact head. No production environment, database, roles, grants, secrets, migrations, or services were changed. PR remains open and unmerged.
