# GHM Actor Gateway Hosting and Credential Handover — 2026-11-16

**Review date:** 2026-11-16  
**Repository:** `zaidhqdev-sys/GHM`  
**Reviewed main head:** `61cd1121a1fb30e3b28c250b7b6812707f1c9109`  
**Production database:** Render `ghm-db` / `ghm_db`, PostgreSQL 18, Frankfurt  
**Status:** BLOCKED — production gateway principal exists but its database API is not installed; hosting path requires an additional always-on service cost that is not currently approved.  
**Scope:** Source/handover review and read-only production catalogue checks. No production mutation.

## 1. Architecture decision — superseding the Cloudflare Hyperdrive direction

The latest architecture decision is in `docs/architecture/ACTOR_GATEWAY_RENDER_CONNECTOR_SERVICE_DECISION_2026-11-15.md`.

The production target is the existing Node Actor Gateway HTTP server deployed as a **dedicated Render Web Service**:

- Repository: `zaidhqdev-sys/GHM`, branch `main`.
- Service name proposed: `ghm-actor-gateway`.
- Region: Frankfurt, same Render environment as `ghm-db`.
- Build: `npm ci --include=dev && npm run build`.
- Start: `npm run start:actor-gateway`.
- Health path: `/healthz`.
- Auto-deploy: OFF initially; controlled manual deployment.
- Database path: Render internal PostgreSQL hostname and SQL-created restricted gateway login.

This is the correct hosting fit because the repository already has `src/actor-gateway/server.ts`, the `start:actor-gateway` script, the typed HTTP routes, database startup identity/ACL checks, and the existing `GHM_ACTOR_GATEWAY_URL` client contract.

**Cloudflare Worker + Hyperdrive is not the selected production host.** It is a separate implementation and should not be provisioned in parallel. The earlier Hyperdrive/public PostgreSQL approach is superseded by the dedicated Render Node service decision. Do not create Cloudflare VPC, Tunnel, Hyperdrive, routes, or secrets for this rollout.

The dedicated Render Web Service must be always-on. A Free service is not a production substitute: its sleep/wake behavior is incompatible with the existing five-second gateway client/database timeouts and reliable security-boundary availability.

The smallest always-on Render Web Service incurs additional recurring compute cost. Under the user's standing no-additional-paid-infrastructure constraint, **do not create it or incur the cost now**. No existing service is approved as a substitute:
- GHM-Internal-Runtime is the production API itself and is not an independently isolated gateway host.
- `zaid-ai-workforce` is a separate application and is not approved as a DB bridge or gateway host.
- Sandbox/qualification services are not production resources and must not be repurposed.

This is a real hosting/cost decision gate, not a missing configuration value.

## 2. Amanda's Render advice — applied to the gateway correctly

The November 12 Render support guidance remains authoritative:

1. Retain the Render Dashboard-managed default database user as the administrator.
2. Create application login credentials through PostgreSQL SQL, not by trying to repurpose the Dashboard-created `ghm_app_user`.
3. Dashboard-created `ghm_app_user` has a Render-managed role relationship that cannot simply be removed as an ordinary application setting.
4. SQL-created application credentials are not managed through the Render Dashboard credential list; place them only in the consuming service's secret/environment configuration.
5. Preserve the distinct runtime and migrator principals; do not copy Amanda's illustrative `IN ROLE ghm_runtime` example onto the Actor Gateway.

For Actor Gateway this means the existing `ghm_actor_gateway` login is the intended SQL-managed application identity. Do not recreate it, make it a member of `ghm_runtime`, or grant it broad table privileges. Credential administration and gateway ACL provisioning are separate operations.

## 3. Production read-only evidence captured 2026-11-16

The connected Render PostgreSQL query tool's managed session was previously observed as:
- `session_user=ghm_app_user`
- `current_user=ghm_db_user`

A read-only attempt to query `ghm.ghm_schema_migrations` was denied with PostgreSQL `permission denied for table ghm_schema_migrations`. A schema-discovery query confirmed the ledger table name is `ghm.ghm_schema_migrations`, but did not disclose ledger contents.

Do not attempt to bypass this restriction by granting the application login extra rights, changing role memberships, or guessing at SET ROLE behavior. The production migration ledger remains unrefreshed by this connector session; use the supported administrator route Amanda described for an authoritative ledger read.

The read-only Actor Gateway ACL checks recorded:
- `ghm_actor_gateway` exists as LOGIN / NOINHERIT.
- Database CONNECT = true; database CREATE = false.
- Schema `ghm` USAGE = false.
- Schema CREATE = false.
- No direct table/relation privileges were found.
- No gateway-specific executable functions were found.
- A follow-up catalogue query for `ghm.gateway_*` and `ghm.assert_actor_gateway*` returned zero rows.

Therefore the role is **not yet provisioned for application use**. Do not configure a service with this credential or declare the gateway ready.

The bounded membership rule in migration `20261110210000_add_actor_gateway_principal_guard.sql` is intentional: `ghm_db_user` may be a member of `ghm_actor_gateway` only with ADMIN OPTION=true, INHERIT=false and SET=false; the gateway login itself must have no outgoing memberships. Preserve this exact rule. Do not misstate it as "no membership in either direction."

## 4. Migration dependency and production safety

The production migration handover dated November 15 records 42 pending migrations and an allowlist mismatch from the latest user-supplied full audit. The queue includes the Actor Gateway installation chain and multiple independent production cutovers/revocations. The migration runner does not currently provide a qualified safe batch/through-version boundary.

The November 16 catalogue check found no gateway functions, which is consistent with the gateway migrations not yet being installed. However, the migration ledger contents could not be read through the managed Render query connection. Do not assert exact applied/pending status from that denied query.

Do not:
- Replace the seven-item allowlist with all 42 pending entries.
- Run the production migration command.
- Apply individual gateway grants/functions manually to work around the migration chain.
- Rotate or reset the gateway password before the administrator/credential handoff and service secret destination are ready.
- Provision the assertion secret before its reviewed migration/table workflow is installed.
- Revoke the existing bounded administrator membership or improvise Render role changes.

The production backup/recovery point also remains unverified; the latest known archive in prior handover was November 4, before later role changes.

## 5. Correct next sequence

1. **Amanda / Render administrator route:** obtain an administrator-authorized read of the production migration ledger and the role/ownership catalogue. Record the exact connection identity used, without placing credentials in chat or Git.
2. **Credential model:** confirm the existing SQL-managed `ghm_actor_gateway` login is the service identity; determine whether a usable password is already set without disclosing it. If a controlled reset is required, do it only through the administrator session and place the value directly into the eventual Render service secret field.
3. **Production backup gate:** establish and verify a fresh recoverable backup before any production DDL, grants, role changes, or secret-table provisioning.
4. **Migration gate:** reconcile the exact live ledger against current main; qualify a staged, ordered migration plan. Apply no production migration until the runner and all cutover dependencies are explicitly qualified.
5. **Hosting/cost gate:** when the additional always-on service cost is affordable/approved, create the dedicated Frankfurt Render Web Service with auto-deploy OFF and the settings in section 1.
6. **Provisioning/qualification:** after migrations and backup gates pass, provision only the exact schema USAGE and approved gateway function EXECUTE grants through the reviewed migration chain; qualify startup identity and ACL checks using `session_user=current_user=ghm_actor_gateway`.
7. **Secrets and runtime:** set the database URL and approved public JWT verification material / assertion secret in the dedicated service's secret configuration; never place values in Git, logs, PowerShell history, or handover.
8. **Deployment and cutover:** deploy the service manually, verify `/healthz`, authenticated typed operations, negative authorization cases and restart behavior; then set the exact observed HTTPS origin as `GHM_ACTOR_GATEWAY_URL` on GHM-Internal-Runtime. Deploy GHM manually and run end-to-end checks.

## 6. Change record

This handover is documentation-only. The Render queries were read-only. No production database role, membership, grant, migration, password, secret, environment variable, Render service, Cloudflare resource, deployment, or application data was changed. No new recurring cost was incurred.

**Current blocker:** the gateway's dedicated always-on Render service requires additional recurring spend, and the production DB migration/backup/administrator gates remain unresolved. The selected architecture is now explicit; do not reopen the Cloudflare Hyperdrive route as a parallel implementation.
