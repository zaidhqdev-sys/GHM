# GHM Actor Gateway — no-additional-cost production topology assessment

**Date:** 2026-11-15  
**Status:** Repository-only architecture assessment; no production changes authorized  
**Decision:** No production-ready no-cost topology is currently qualified. Keep gateway rollout blocked.

## Executive decision

Cloudflare Workers VPC plus Hyperdrive is a technically supported way to connect a Cloudflare Worker to a private PostgreSQL database through a Cloudflare Tunnel. Workers VPC is currently documented as free during beta across Workers plans.

However, a Cloudflare Tunnel must run continuously in a network that can reach the database. The only existing Render service in the production environment that can reach the database is GHM-Internal-Runtime, and Render currently reports it as a Free web service. Render documents that Free web services spin down after 15 minutes without inbound HTTP/WebSocket traffic, take about a minute to wake, may restart at any time, and are explicitly not intended for production. The current ADR also requires process, credential, network and deployment isolation to be demonstrably equivalent if the issuer/gateway are co-located in isolated processes.

Running cloudflared as a sidecar process in the same Free GHM runtime is therefore only a lab/qualification candidate, not an approved production topology. It introduces shared-host/process-management and availability risks and has not demonstrated the ADR's equivalent-isolation requirement. No new Render service, paid plan, database, or schedule is permitted.

**Do not create the Cloudflare Tunnel, VPC Service, Hyperdrive binding, secrets, or production route as part of this assessment.** This is design/documentation only.

## Verified current state

- Render database: ghm-db, database ghm_db, PostgreSQL 18, Frankfurt, paid plan 0.1c-256mb, status available.
- Render database IP allowlist currently contains 0.0.0.0/0 ("everywhere"). This is a verified broad external allowlist, not evidence that direct public exposure is desirable or approved. Do not broaden or alter it. A private-tunnel design should target the database's Render internal hostname from a tunnel host in the same Render region.
- Render GHM-Internal-Runtime: srv-damupsek1f9s73eq8kkg, Frankfurt, Free web-service plan, branch main, auto-deploy OFF, health check /healthz, URL https://ghm-internal-runtime.onrender.com. Build Command is npm ci --include=dev && npm run build; Start Command remains npm start.
- Render service inventory contains no dedicated Actor Gateway service. Historical sandbox/qualification services are not eligible targets and must not be repurposed.
- Current live GHM deployment remains the previous c7cf1ebaf4db5912983bfa45bd42747c0854cfaf; the post-PR #283 deployment built successfully but failed startup because GHM_ACTOR_GATEWAY_URL is required when production storage is enabled. The new endpoint is not live.
- Actor Gateway source exists in workers/actor-gateway. wrangler.jsonc still has workers_dev=false, a zero placeholder Hyperdrive ID, no VPC binding, and no production route/domain. No Actor Gateway production deployment workflow was found.
- PR #272 was merged to main on 2026-11-14 (head 81b0a90f762772ca745fbca122f9848968d4f234). That merges code only; it does not provision the gateway, secrets, network path, DB privileges, or production cutover.
- Amanda's Render guidance remains controlling: keep the Dashboard-managed default credential for administration; normal application execution should use SQL-created login(s) outside the Dashboard-managed credential list. Preserve separate ghm_runtime and ghm_migrator identities and the SET-only schema-owner path. Do not improvise grants.

## Candidate topology

Cloudflare Actor Gateway Worker → Hyperdrive → Workers VPC TCP Service → Cloudflare Tunnel/cloudflared → Render private network → ghm_db.

1. The Worker runs in Cloudflare and holds only its public-key JWT verifier material, the gateway assertion HMAC secret, and a Hyperdrive configuration using the dedicated gateway database login.
2. Hyperdrive connects through a TCP Workers VPC Service (PostgreSQL, port 5432) rather than a public database origin.
3. A Cloudflare Tunnel is initiated outbound from a host in the same private network/region as Render PostgreSQL and routes only to the approved database host/port.
4. The gateway uses only the dedicated Actor Gateway login. The ordinary GHM API does not receive the gateway HMAC secret or gateway DB password.
5. The database's signed assertion verification, one-use nonce/replay protection, typed function allowlist, and least-privilege grants remain authoritative. No direct arbitrary SQL interface is exposed to the Worker.

This is the topology Cloudflare documents for private PostgreSQL via Workers VPC, Hyperdrive, VPC Service and Cloudflare Tunnel. It is not yet deployed or validated in this account.

## Host placement assessment

| Host option | Cost | Isolation / availability | Decision |
|---|---:|---|---|
| New Render private/background service | Additional paid compute | Better service isolation and always-on operation | Not permitted under current cost constraint |
| Existing GHM-Internal-Runtime Free web service as cloudflared host | No new service charge | Free service sleeps after 15 minutes idle, cold-starts, may restart; sidecar shares service host and deployment lifecycle | Lab-only candidate; not production-qualified |
| Existing sandbox or qualification services | No new spend in theory | Wrong environment/DB; sandbox is suspended/expired and qualification services are not production | Prohibited |
| Owner workstation / home network | No new hosting fee | Not continuously available; not a production database network host | Not suitable |
| Direct public Hyperdrive connection to Render DB | Potentially no new service fee | Requires public DB ingress and a trustworthy narrow source allowlist; no verified fixed Cloudflare egress source is established here | Not selected |
| Cloudflare Workers VPC beta + tunnel on another existing always-on private-network host | Cloudflare VPC currently free in beta | Could satisfy network boundary if host, role, TLS, secrets and isolation are verified | No such eligible host is currently evidenced |

## Why the existing Free runtime is not approved as the tunnel host

Render's Free web service limits are material to a production security boundary:

- It spins down after 15 minutes without inbound HTTP/WebSocket traffic and can take about one minute to start again.
- It may restart at any time and has no persistent disk.
- Render explicitly says not to use Free instances for production applications.
- It cannot receive private-network traffic (although it can initiate private-network requests to data stores and paid services in the same region).

A cloudflared process could in principle initiate the tunnel outbound and reach a Render private database hostname. But hosting it in the same Free service as the ordinary API does not currently prove the ADR's process/credential/network/deployment isolation. The API and tunnel would share a service lifecycle and deployment. The tunnel token must not become available to the API process. A design would need to demonstrate process identity separation, secret injection isolation, minimal tunnel routing to only the database host/5432, startup ordering/readiness, restart recovery, memory/CPU headroom, and correct shutdown behavior. No such implementation or test currently exists.

The fact that the API itself currently uses a Free service does not automatically qualify adding a second critical security component to the same Free instance.

## Database and identity gates remain independent

Even a working network path does not resolve the database role model:

1. Render support's Amanda recommendation must be applied through a supported, staged credential plan; Dashboard-managed credentials remain for administration, SQL-created logins for service execution.
2. The current production ghm_actor_gateway role and membership state must be checked against the exact startup guard and final migration before any secret or service provisioning.
3. The older 11-Nov readiness handover says the Actor Gateway has no role memberships in either direction. The current Worker startup SQL has a more specific rule: it rejects the gateway being a member of another role, and when other roles are members of the gateway it permits only the ghm_db_user ADMIN OPTION membership with SET and INHERIT both false. Reconcile this documentation/source distinction with the final migration and actual production role catalog before treating any role state as valid.
4. The HMAC assertion secret must be independent between the Cloudflare Worker secret store and protected database secret table. The Worker must not receive the ES256 private key, token pepper, or issuer DB URL.
5. Database TLS must be enabled and fully verified. Cloudflare's Workers VPC VPC Service defaults to verify_full; do not weaken certificate verification to disabled.
6. The missing fresh verified production backup remains a hard stop before any database role, privilege, migration or deployment change. The 4-Nov archive is stale for the 10-Nov role changes and is not a current rollback point.
7. The manual legacy grant cutover remains unapplied. Do not revoke legacy grants until the new gateway is deployed and end-to-end proven, the role model is corrected, and a fresh backup/recovery path is verified.

## Rejected shortcuts

- Do not point GHM_ACTOR_GATEWAY_URL at the ordinary GHM API, a Cloudflare Pages PR preview, a sandbox service, or an invented Worker URL.
- Do not set a placeholder Hyperdrive ID or use the test local connection string in production.
- Do not expose PostgreSQL to the public internet merely to make Hyperdrive connect.
- Do not relax TLS verification, HMAC checks, nonce/replay protection, typed operation allowlists, or startup role checks.
- Do not put gateway secrets in Git, the ordinary API environment, SQL history, logs, or chat.
- Do not add Render paid compute, a new database, a new service, or a new schedule.
- Do not deploy or mutate production as part of this design assessment.

## Qualification plan if a suitable existing host is later identified

1. Inventory only existing, owner-approved always-on hosts in the same Frankfurt private network. Do not create resources.
2. Confirm the host can run cloudflared continuously and reach the Render Postgres internal hostname on TCP 5432 without public ingress.
3. Prove process and secret isolation against the ordinary API process. If the host is the same Render service, this must meet the explicit ADR equivalence test; otherwise reject it.
4. Create a disposable/non-production Cloudflare Tunnel, VPC Service and Hyperdrive configuration using a disposable database and disposable credentials only. Validate TLS with verify_full, connectivity, retries, timeout behavior and failure handling.
5. Run the existing Actor Gateway worker contract and adversarial tests over the real VPC/Hyperdrive path. Prove the API cannot access gateway secrets or database credentials.
6. Review tunnel route scope, Worker binding scope, database role privileges, logs/observability, rate limiting, rotation and incident response.
7. Only after separate authorization, fresh production backup verification and Render role-model resolution, prepare a production rollout and staged cutover plan. None of those production gates are currently cleared.

## References

- Cloudflare Workers VPC overview: https://developers.cloudflare.com/workers-vpc/
- Cloudflare Workers VPC getting started: https://developers.cloudflare.com/workers-vpc/get-started/
- Cloudflare Hyperdrive private database via Workers VPC: https://developers.cloudflare.com/hyperdrive/configuration/connect-to-private-database-vpc/
- Render Free instance limitations: https://render.com/docs/free
- GHM ADR-001: docs/architecture/ADR-001-isolated-auth-issuer-and-db-actor-gateway.md
- GHM Actor Gateway production readiness handover: docs/HANDOVER_2026-11-11_ACTOR_GATEWAY_PRODUCTION_READINESS.md
- GHM Render / Actor Gateway role-separation handover: docs/security/RENDER_ACTOR_GATEWAY_ROLE_SEPARATION_HANDOVER_2026-11-12.md

## Authorization boundary

This document records repository and dashboard inventory only. No Cloudflare resources, tunnels, VPC services, Hyperdrive configurations, secrets, DNS routes, Render services, database settings, roles, grants, migrations, deployments, or product cutovers were created or changed.


## 2026-11-15 follow-up — vendor documentation and guard-source reconciliation

### Cloudflare connectivity and cost facts

- Cloudflare Workers VPC documentation (last updated 29-Oct-2026) explicitly says it is in beta and free across all Workers plans during beta. It supports TCP VPC Services for PostgreSQL through Hyperdrive.
- Cloudflare's private-database guide (last updated 30-Apr-2026) explicitly requires a running `cloudflared` tunnel in the private network where the database is reachable. It recommends a TCP VPC Service with `--app-protocol postgresql`, then a Hyperdrive configuration using the service ID. VPC Services default to TLS `verify_full`; do not lower this to `verify_ca` or `disabled` without certificate evidence and review.
- Hyperdrive Free limits currently document 10 database configurations per account and approximately 20 origin DB connections per configuration. These are service limits, not proof of the user's Cloudflare account entitlement or remaining quota.
- Cloudflare documentation: Workers VPC overview https://developers.cloudflare.com/workers-vpc/ ; get started https://developers.cloudflare.com/workers-vpc/get-started/ ; private DB via VPC https://developers.cloudflare.com/hyperdrive/configuration/connect-to-private-database-vpc/ ; Hyperdrive limits https://developers.cloudflare.com/hyperdrive/platform/limits/.
- Render's private-network documentation confirms Free web services can initiate private-network requests to data stores and paid services in the same region, but cannot receive private-network traffic. This means a tunnel agent in the Frankfurt Free runtime can technically initiate the outbound path to the Frankfurt Render Postgres internal hostname. It does not make that host production-suitable.
- Render's Free docs explicitly state not to use Free instances for production, describe 15-minute idle spin-down, possible restarts, ephemeral filesystem, 750 free instance-hours/month, and possible suspension for uncommonly high service-initiated public traffic. A persistent outbound tunnel does not itself establish a reliable inbound keepalive or availability guarantee. A periodic keepalive would be an operational workaround, not a production availability design, and is not authorized under the user's no-extra-schedule constraint.
- Render references: https://render.com/docs/free ; https://render.com/docs/private-network ; https://render.com/docs/faq. Render's FAQ also recommends separate services rather than combining multiple apps in one service for security and performance isolation.

### Exact source-level role guard

- Re-read current `main` source for `database/migrations/20261110210000_add_actor_gateway_principal_guard.sql` and `workers/actor-gateway/index.ts`. Both implement the same membership rule: reject any membership where `ghm_actor_gateway` is the member; when `ghm_actor_gateway` is the granted role, permit only `ghm_db_user` as the member with ADMIN OPTION=true, INHERIT=false, SET=false; reject all other member roles and option combinations.
- The older 11-Nov readiness text saying the current guard rejects every membership involving `ghm_actor_gateway` is stale relative to the current migration and Worker startup code. The source-level rule does not inspect `pg_auth_members.grantor`; do not infer that a postgres grantor is itself accepted/rejected beyond the explicit checks above.
- This source rule is not approval of the production role model. The wider `ghm_db_user` CREATEROLE/ADMIN OPTION exposure recorded in the readiness handover remains a separate serious blocker. In particular, the intended trusted-administrator role cannot be treated as an effective security boundary while it is also the application effective role with role-administration authority. Render support's Amanda-guided remediation and a fresh verified backup remain prerequisites.
- PR #272 was independently rechecked through GitHub: merged 14-Nov-2026, head `81b0a90f762772ca745fbca122f9848968d4f234`. Its merge does not resolve production DB privileges, host availability, tunnel deployment, or secret custody.

### Decision

No newly discovered vendor feature changes the no-go result. Cloudflare networking is free during beta, but a continuously available and sufficiently isolated tunnel host is still missing. The only existing candidate is explicitly not for production. Do not use keepalive pings to disguise that limitation, combine security boundaries without proving ADR-001 equivalence, or weaken the guard. The production endpoint and Connect cutover remain blocked.
