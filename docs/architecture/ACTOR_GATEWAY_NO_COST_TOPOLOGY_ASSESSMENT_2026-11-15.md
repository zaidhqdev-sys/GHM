# GHM Actor Gateway — no-additional-cost production topology assessment

**Date:** 2026-11-15  
**Status:** Repository-only architecture assessment; no production changes authorized  
**Decision:** No production-ready no-cost topology is currently qualified. Keep gateway rollout blocked.

## Executive decision

Cloudflare Workers VPC plus Hyperdrive is a technically supported way to connect a Cloudflare Worker to a private PostgreSQL database through a Cloudflare Tunnel. Workers VPC is currently documented as free during beta across Workers plans.

However, a Cloudflare Tunnel must run continuously in a network that can reach the database. A fresh account-wide Render inventory found two web services in the Production environment and Frankfurt region: GHM-Internal-Runtime and zaid-ai-workforce. Both are Free web services. Render's same-region private networking can permit services to initiate connections to data stores, but neither service is an approved persistent connector host: GHM-Internal-Runtime is the ordinary GHM API, while zaid-ai-workforce is a separate application workload. Render documents that Free web services spin down after 15 minutes without inbound HTTP/WebSocket traffic, take about a minute to wake, may restart at any time, and are explicitly not intended for production. The current ADR also requires process, credential, network and deployment isolation to be demonstrably equivalent if the issuer/gateway are co-located in isolated processes.

Running cloudflared in either existing Free production web service is therefore not an approved production topology. In GHM-Internal-Runtime it would introduce shared-host/process-management and availability risks; in zaid-ai-workforce it would additionally repurpose an unrelated application service. Neither option has demonstrated the ADR's equivalent-isolation requirement. No new Render service, paid plan, database, or schedule is permitted.

**Do not create the Cloudflare Tunnel, VPC Service, Hyperdrive binding, secrets, or production route as part of this assessment.** This is design/documentation only.

## Verified current state

- Render database: ghm-db, database ghm_db, PostgreSQL 18, Frankfurt, paid plan 0.1c-256mb, status available.
- Render database IP allowlist currently contains 0.0.0.0/0 ("everywhere"). This is a verified broad external allowlist, not evidence that direct public exposure is desirable or approved. Do not broaden or alter it. A private-tunnel design should target the database's Render internal hostname from a tunnel host in the same Render region.
- Render GHM-Internal-Runtime: Frankfurt, Production environment, Free web-service plan, branch main, auto-deploy OFF, health check /healthz. It remains the ordinary GHM API and is currently failing deployment; do not co-host the tunnel here.
- Render zaid-ai-workforce: Frankfurt, same Production environment, Free web-service plan, Node runtime, separate `zaidhqdev-sys/ai-workforce` repository and `runtime` root directory, deployed. It is an unrelated application workload and must not be repurposed as the GHM connector.
- The account-wide Render inventory also exposed historical sandbox services (`ghm-payfast-sandbox-runtime`, `ghm-payfast-callback-sandbox`, `ghm-identity-qualification`) in a separate environment; exclude them. The sandbox database `ghm-payfast-sandbox-db` is suspended/expired. A separate paid `ghm-identity-qualification-20261018` database is not production and must not be repurposed. No dedicated Actor Gateway service or background worker exists in the Production environment.
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
| Existing GHM-Internal-Runtime Free web service as cloudflared host | No new service charge | Free service sleeps after 15 minutes idle, cold-starts, may restart; sidecar shares ordinary API host and deployment lifecycle | Not production-qualified; do not repurpose |
| Existing zaid-ai-workforce Free web service as cloudflared host | No new service charge | Free service sleeps/restarts; unrelated application workload and deployment lifecycle | Not production-qualified; do not repurpose |
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

The fact that either application currently uses a Free service does not qualify adding a critical database tunnel to that service. The AI Workforce service is not a spare host simply because it is deployed in the same Render environment.

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


## 2026-11-15 follow-up — Cloudflare dashboard and full Render inventory

### Cloudflare account inventory (user-inspected dashboard)

- Workers & Pages shows the existing Pages project `ghm`, linked to `zaidhqdev-sys/GHM`, with Pages domain `ghm-cu1.pages.dev`. This is a Pages project, not the Actor Gateway Worker. No `ghm-actor-gateway` Worker is present in the inspected inventory.
- The account's Workers subdomain is `zaidhqdev.workers.dev`. The previously discussed `https://ghm-actor-gateway.zaidhqdev.workers.dev` remains only a proposed name; it is not deployed, verified, or valid for `GHM_ACTOR_GATEWAY_URL`.
- Workers VPC (Beta) is visible in the account dashboard.
- Workers VPC Services page reports no VPC Services.
- Workers VPC Networks page shows the Cloudflare Mesh network (`cf1:network`). The Mesh page says there are no nodes yet; its “4 items, 3 online” summary is not evidence of an enrolled connector node.
- Cloudflare Tunnels inventory reports 0 / 1,000 and no existing tunnels.
- Hyperdrive reports no configurations and 0 / 100,000 queries.
- No Cloudflare resource was created or changed during this inspection.

### Render account-wide inventory (read-only API inspection)

- The Production project page showed three resources: `zaid-ai-workforce` (deployed Node web service, Frankfurt), `GHM-Internal-Runtime` (Node web service, failed deploy, Frankfurt), and `ghm-db` (PostgreSQL 18, Frankfurt).
- The account-wide service API confirmed both Production web services are Free plans. `zaid-ai-workforce` is a separate repository/application; it is not a spare connector host. `GHM-Internal-Runtime` is also Free and remains the ordinary GHM API.
- The account-wide inventory exposed additional sandbox services and qualification databases in separate environments. They are explicitly excluded from this design; the PayFast sandbox remains paused, the sandbox database is suspended/expired, and the paid identity-qualification database is not a production host.
- The production database inventory confirms `ghm-db` / `ghm_db`, PostgreSQL 18, Frankfurt, paid 0.1c-256mb plan, status available. Its existing IP allowlist was observed as `0.0.0.0/0`; this is not authorization to change it or rely on public ingress.

### Updated decision

Cloudflare's required product features are visible and Workers VPC is available, but the account has no deployed Actor Gateway Worker, no Tunnel, no VPC Service, no Hyperdrive configuration, and no Mesh nodes. Render has no suitable existing always-on, isolated, no-additional-cost connector host. Both existing Production web services are Free and are not approved for repurposing; all sandbox and qualification services are excluded.

The no-go decision is unchanged. Do not create Cloudflare resources, set `GHM_ACTOR_GATEWAY_URL`, add secrets, modify database ingress, deploy a tunnel sidecar, alter Render services, or change production DB roles/grants/migrations. Amanda's Render support guidance, the unresolved production role-administration issue, and a fresh independently verified production backup remain separate hard gates.


## 2026-11-15 follow-up — Actor Gateway source and deployment qualification

### Existing branch and PR reconciliation

- Re-read the repository branch inventory and pull-request history before considering source changes.
- PR #278, `fix: align Actor Gateway role guard with trusted Render administrator`, is merged (merge commit `e78422560b35be3d8fdc3d08387b6c3f47ce5883`; head `8141e1e24652933a0e7d6313c9f25a14918f214a`). It preserves the documented Render-managed `ghm_db_user` membership in `ghm_actor_gateway` only as ADMIN OPTION=true, INHERIT=false, SET=false, while rejecting gateway-login memberships and other members. Its PR description records a prior read-only production catalog observation matching that relationship; this historical evidence is not a substitute for a fresh production check before rollout.
- The branch `fix/actor-gateway-trusted-admin-membership` remains in the branch inventory as the merged PR head; it is not outstanding implementation work. Do not recreate it.
- The only currently open Actor Gateway-related PR found is #264, a documentation checkpoint. Open PRs #243 and #244 are Connect supplier-classification and analytics work, not Actor Gateway deployment work. No open Actor Gateway implementation/deployment PR was identified.
- Existing construction branches for isolated issuer work were noted but not changed. No new branch or PR was created.

### Worker source/configuration findings

- Worker entry point: `workers/actor-gateway/index.ts`. It uses Cloudflare's Node HTTP adapter, creates the typed gateway app, and initializes only after checking the Hyperdrive connection, JWT verification material, capability assertion secret, database principal and database privileges.
- Required Worker-side values in source are: Hyperdrive binding `HYPERDRIVE`; public ES256 verification key PEM and key ID (plus optional previous public key/key ID); and `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET`. The Worker source does not load the ES256 private signing key, token pepper, issuer DB URL, or ordinary API credentials.
- The Worker has a 16 KiB JSON request-body limit, immediate 413 handling for oversized bodies, per-actor rate limiting configured at 120 requests per 60 seconds, and fails closed with HTTP 503 if startup checks fail. The Worker health route is not evidence of successful authenticated business operations by itself.
- Current `workers/actor-gateway/wrangler.jsonc`: Worker name `ghm-actor-gateway`; `workers_dev=false`; `preview_urls=false`; observability disabled; Hyperdrive binding name `HYPERDRIVE` but its ID is all zeroes (placeholder); local connection string targets a disposable local test database. There is no production VPC binding, no custom route/domain, and no deployed `workers.dev` hostname.
- `workers/actor-gateway/worker-contract.test.mjs` statically checks the adapter, required bindings/secrets, public-key-only verification material, startup ACL order, fail-closed behaviour, disabled public routes, and body-limit handling.
- `package.json` defines `typecheck:worker:actor-gateway` and `test:worker:actor-gateway`. The CI workflow includes a Wrangler deploy dry-run (bundle only, no deployment) and a local Wrangler runtime smoke test against disposable PostgreSQL/Hyperdrive configuration, including `/healthz`, invalid JSON rejection, and immediate oversized-body rejection. These are repository/CI qualification paths, not proof of a deployed Cloudflare Worker or production DB connectivity.
- No dedicated Actor Gateway deployment workflow was found in `.github/workflows`; the existing workflow performs build/bundle/test qualification only.

### Result and next qualification boundary

- The Worker implementation and its local CI harness already exist. The immediate code/configuration gap is not a missing Worker implementation: it is the intentionally unprovisioned production Hyperdrive/VPC binding, tunnel path, secrets, and HTTPS Worker route.
- Do not replace the zero Hyperdrive ID with a guessed value, enable `workers_dev`, add a custom route, provision secrets, or deploy as a local workaround.
- No source code, Worker configuration, production DB, Render service, environment variable, Cloudflare resource, secret, route, deployment, migration, grant, or role was changed during this source/configuration inspection.
- The current main head after the handover update is `3026460b8f379f0ad6ab08a338b3f6c84cf616cf`. The source/configuration review is documentation-only. Continue with non-production source/test inspection only while the connector-host, backup, and production role-model gates remain unresolved.


## 2026-11-15 follow-up — signed assertion replay and timestamp qualification

### Existing coverage reviewed

- Reconciled main, Actor Gateway-related branches, and open PRs before making changes. No duplicate Actor Gateway implementation PR existed. Existing construction/qualification branches were left untouched.
- The disposable PostgreSQL Actor Gateway principal qualification already checks distinct `ghm_runtime`, `ghm_actor_gateway`, and `ghm_migrator` identities; least-privilege login attributes; the bounded Render administrator membership; exact function/relation ACLs; no direct account/authentication-table access; signed self-identity and registration reads/writes; forged signatures; context/business transplantation; altered payloads; disabled-account denials; legacy RPC revocation; and role-assumption denials.
- Existing migration contract tests already pinned one-use nonce storage/replay rejection, signed request-context equality, constant-time signature comparison, 60-second assertion validity, nonce retention, and context size bounds. The gap was that the main disposable principal qualification did not explicitly exercise a valid assertion replay and the expired/future timestamp rejection paths end-to-end against PostgreSQL.
- Existing Worker app tests cover missing/invalid bearer tokens, verified actor derivation, database failure, registration and other gateway routes, and account-scoped rate limiting. Worker static contract tests and the CI local Wrangler smoke test separately cover adapter/startup order, disabled public routes, `/healthz`, malformed JSON and oversized-body handling.

### PR #284 — qualification-only change

- Created draft PR #284: `test: qualify Actor Gateway assertion replay and timestamp boundaries`.
- Branch: `test/actor-gateway-assertion-replay-boundaries-20261115`.
- Final exact head: `4c5710f50bc61a611e07f5ef904d319019bf1782`.
- Added explicit disposable-PostgreSQL checks that reuse the same signed nonce and require replay denial, and that signed assertions 61+ seconds in the past/future are rejected. The future fixture uses a 65-second offset because the database compares integer-rounded epoch seconds; a 61-second offset proved boundary-sensitive under CI timing.
- Extended the migration contract test to pin the database's absolute 60-second timestamp acceptance window.
- CI initially caught two editing errors before qualification: a malformed helper replacement (syntax check) and then a too-tight future timestamp fixture (integer epoch rounding). Both were corrected. Do not treat those failed attempts as passing evidence.
- Final exact-head GitHub Actions run `43752492009`: `quality` PASS, `web-quality` PASS, and Cloudflare Pages check PASS. The quality job's disposable PostgreSQL Actor Gateway principal qualification passed, including the new replay, expired and future-dated assertion cases. The local Cloudflare Workers smoke test also passed. All remaining migration, database-boundary, test-suite, gateway cutover and issuer qualification steps in that CI run passed.
- PR #284 remains OPEN and DRAFT, mergeable/clean at the last read. It has not been merged. Do not merge it automatically; retain the draft pending the normal owner review/merge decision.

### Safety and production boundary

- CI used its isolated PostgreSQL 18 disposable service and local Wrangler runtime. It did not connect to production `ghm_db`.
- No production DB role/grant/migration/data, Render service or environment variable, Cloudflare resource, Worker route, Hyperdrive configuration, Tunnel, secret, or deployment was changed by this qualification.
- The Pages check is a CI status for the existing Pages integration; it is not evidence that the Actor Gateway Worker was deployed.
- Production rollout remains blocked by the missing suitable isolated always-on connector host, missing VPC Service/Tunnel/Hyperdrive provisioning, unresolved Amanda/Render role-administration remediation, and lack of a fresh independently verified production backup/recovery point.


## 2026-11-15 follow-up — Render compute inventory and connector-host decision

### Inventory rechecked against the connected Render workspace

- The production environment contains:
  - `GHM-Internal-Runtime`: Node web service, Frankfurt, Free plan, auto-deploy OFF.
  - `zaid-ai-workforce`: Node web service, Frankfurt, Free plan, separate repository.
  - `ghm-db`: PostgreSQL 18 primary, Frankfurt, paid plan, database `ghm_db`.
- The Render API also returned the separate legacy/sandbox environment:
  - `ghm-payfast-sandbox-runtime`: Free web service, auto-deploy OFF.
  - `ghm-payfast-callback-sandbox`: Free web service, auto-deploy OFF.
  - `ghm-identity-qualification`: Free web service, on its qualification branch.
  - `ghm-payfast-sandbox-db`: suspended by billing.
- A separate PostgreSQL 18 database named `ghm-identity-qualification-20261018` is still reported as available on a Basic 256 MB plan. It is a database, not a compute host, and is not approved for reuse.
- The three production services shown in the user's Render dashboard are consistent with the production environment inventory. The additional services above belong to the separate legacy/sandbox environment; their presence in the account-wide API listing does not make them production resources or approved candidates.
- All listed web services are Free. The only production compute services are GHM-Internal-Runtime and the separate AI Workforce application. Neither is an isolated, always-on connector host. GHM-Internal-Runtime is the production API itself; co-hosting a tunnel there would couple the private DB connector lifecycle to the API process and Free-instance sleep/restart behaviour. AI Workforce is a separate application/repository and is not approved to become a database-network bridge.
- The sandbox/qualification services and database must not be repurposed. PayFast remains paused. No existing service in this inventory qualifies as the required isolated, continuously running tunnel host.

### Decision

- **No eligible existing tunnel host was found.** Cloudflare's existing Mesh network has no connected nodes; its VPC Networks page only showed the Cloudflare Mesh network, and its VPC Services page was empty. Hyperdrive has no configurations and Tunnels reports zero configured tunnels.
- Do not add `cloudflared` to GHM-Internal-Runtime or AI Workforce, do not revive/reuse sandbox resources, and do not use the qualification database as a workaround.
- No new Render service, plan upgrade, database, schedule, tunnel, VPC Service, Hyperdrive configuration, Worker, secret, route, environment variable, deploy, database change, or role/grant change was made.
- This leaves the connector-host prerequisite unresolved under the current no-additional-cost constraint. The safe next step is a design-only review of whether the Cloudflare Workers VPC TCP Service can be connected to the Render Postgres endpoint through a separately operated host already under the user's control. A personal workstation can be used for a temporary lab proof only while online; it is not an acceptable production connector because availability depends on the workstation remaining powered on and connected.

### Cross-checks and handover continuity

- Rechecked current main at `7564011219208cbae582cc26965f304200bb711f`, open PR inventory, and Actor Gateway-related branches before this assessment.
- PR #284 remains open/draft at `4c5710f50bc61a611e07f5ef904d319019bf1782`; no merge or branch changes were made.
- Existing role-separation handover continues to preserve Amanda/Render support guidance, unresolved production role-administration remediation, and the missing fresh verified production backup/recovery point. These remain independent production gates.
- This update records account-wide Render inventory findings without copying any environment-variable values or secrets.


## 2026-11-23 reassessment — direct public Hyperdrive as a no-host candidate

The earlier statement that no direct public Hyperdrive path had a verified source range is superseded. Current Cloudflare documentation explicitly states that Hyperdrive connects to database origins from Cloudflare's published IP ranges and supports a database firewall allow-list containing those ranges. Cloudflare documents three supported patterns: public ingress from all IPs, public ingress restricted to Hyperdrive's Cloudflare ranges, or private ingress through a Cloudflare Tunnel. Hyperdrive is included on Workers Free with a documented limit of 100,000 database queries/day. Sources reviewed: Cloudflare Hyperdrive firewall/networking and pricing documentation; Cloudflare's published IP ranges; Render PostgreSQL external-connection and inbound-IP-rule documentation.

### Candidate B — Hyperdrive direct to Render external PostgreSQL endpoint

`Cloudflare Actor Gateway Worker → Hyperdrive → Render ghm-db external PostgreSQL hostname:5432`

- No `cloudflared` host, Render compute service, Workers VPC Tunnel, VPC Service, or Cloudflare Mesh node is required for this public-endpoint pattern.
- Hyperdrive's outbound source is the Cloudflare shared IP range set, rather than a dedicated per-Worker/per-account egress IP. The currently published Cloudflare list contains 15 IPv4 CIDRs and 7 IPv6 CIDRs. The IP ranges are shared with other Cloudflare products/customers; they are not a tenant-specific trust boundary.
- Render supports PostgreSQL external access restricted by CIDR allow-list. The current live `ghm-db` allow-list was re-read on 23 Nov and remains exactly `0.0.0.0/0` ("everywhere"). This candidate would only be considered if the allow-list could be narrowed to the complete, maintained Hyperdrive source ranges without losing required owner/administration access. Do not change the current list as part of this assessment.
- Render external PostgreSQL connections require TLS 1.2+ and reject `sslmode=disable`. Hyperdrive always uses TLS; its default PostgreSQL `require` mode validates certificates against WebPKI. Hyperdrive also supports `verify-ca` and `verify-full` with a configured CA. Prefer `verify-full` if the Render certificate chain/hostname can be validated using an appropriate CA bundle; do not weaken TLS verification to make a connection succeed.
- The Hyperdrive database credential must be the dedicated `ghm_actor_gateway` login, never the Render-managed administrator, `ghm_app_user`, `ghm_db_user`, `ghm_runtime`, or `ghm_migrator`. The Worker must continue using the existing typed signed-assertion interface and exact function allow-list; Hyperdrive is only the transport/pool and must not introduce arbitrary SQL execution.
- Cloudflare's shared IP ranges are large and shared. An allow-list of those ranges limits network ingress compared with `0.0.0.0/0`, but does not prove that the source is this account's Worker. Database credentials, TLS, role/function ACLs, signed assertions, replay controls and Worker route controls remain mandatory. The public PostgreSQL endpoint remains internet-routable, so this is a security trade-off against the private Tunnel/VPC path, not an equivalent private-network boundary.
- Render's current public Postgres API exposes `ipAllowList` as an array of CIDR entries, but the reviewed API reference does not state an entry-count maximum or explicitly confirm IPv6 support for Postgres allow-list entries. Therefore the 15 IPv4 + 7 IPv6 range set's acceptance by this exact database remains unverified. Do not assume support or send an update request. Obtain a written Render support answer or an isolated non-production validation before proposing a production allow-list replacement.
- Cloudflare Hyperdrive's account configuration, current plan/quota, actual external hostname and certificate chain were not independently inspected in this pass. The earlier Cloudflare dashboard inventory showed no Hyperdrive configurations, VPC Services or Tunnels; no Cloudflare connector is available in this workspace to refresh that inventory. The exact Hyperdrive Worker deployment route remains unprovisioned.

### Decision and validation order

**Promote direct Hyperdrive to the preferred no-additional-host candidate for design qualification, not to an approved production topology.** It avoids the unavailable always-on tunnel host and appears compatible with the existing no-new-paid-compute constraint, subject to the account's actual Cloudflare plan/quota. It does not close the production gates.

Before any production setting or credential change, the following must be established read-only or with vendor support:

1. Confirm Render accepts all required Cloudflare Hyperdrive CIDRs for this PostgreSQL instance, including the IPv4/IPv6 handling and any entry-count limits; confirm how to preserve required owner-controlled administration access without restoring `0.0.0.0/0`.
2. Confirm the exact Render external hostname and obtain/validate the Render TLS certificate chain. Confirm Hyperdrive can use TLS with hostname verification (`verify-full`) or document the strongest supported WebPKI mode if Render's CA cannot be separately configured.
3. Confirm Cloudflare Workers/Hyperdrive plan and daily query quota are sufficient without a paid upgrade; confirm the account's actual Worker/Hyperdrive resources and deployment permissions.
4. Validate the Hyperdrive connection using a non-production database only if an already-authorized disposable database exists. Do not revive the suspended sandbox or repurpose the paid qualification database. If no permitted test database exists, keep the technical connection proof outstanding rather than testing against production.
5. Separately resolve the production backup/recovery, Amanda/Render role-administration, exact production role membership, function ACL, migration ledger and deployment ordering gates. A successful network connection does not authorize migrations, role changes or legacy revocations.

### No-change record

This reassessment changes documentation only. No Render IP allow-list, database, role, grant, credential, environment variable, service, deployment, Cloudflare account resource, Hyperdrive configuration, VPC Service, Tunnel, Worker route, DNS record or production traffic was changed. The previous private Tunnel/VPC candidate remains the stronger isolation design if a qualified always-on host becomes available; Candidate B is a constrained alternative to avoid a new host, not a claim that the host prerequisite has been solved for private networking.

## 2026-11-23 qualification follow-up — Render IPv4-only ingress and Hyperdrive TLS

A fresh review of current vendor documentation narrows the direct-public Hyperdrive candidate further:

- Cloudflare confirms Hyperdrive connects to origins from Cloudflare's shared published IP ranges, and those ranges must be allow-listed when the database firewall is restricted. Cloudflare publishes both IPv4 and IPv6 ranges. The source ranges are shared with other Cloudflare products/customers; they do not identify this specific Worker or Cloudflare account. Reference: https://developers.cloudflare.com/hyperdrive/configuration/firewall-and-networking-configuration/ and https://developers.cloudflare.com/ips/.
- Render's current Inbound IP Rules documentation explicitly supports **IPv4 CIDR ranges only**. Therefore the earlier proposed 15 IPv4 + 7 IPv6 allow-list is not directly implementable as written on Render Postgres. Do not attempt to add IPv6 entries. Whether Cloudflare Hyperdrive's direct-origin connection can be constrained to IPv4 source ranges only, and whether Render sees only those IPv4 egress sources for this origin, is not established by the reviewed documentation. This is now a specific vendor-compatibility question, not merely an unknown CIDR entry limit. Reference: https://render.com/docs/inbound-ip-rules.
- Render's Postgres external endpoint requires TLS 1.2+ and rejects plaintext (sslmode=disable). Cloudflare Hyperdrive supports PostgreSQL require, verify-ca, and verify-full; verify-full additionally validates the database hostname against the certificate SAN/CN and requires the appropriate CA certificate to be uploaded. Thus strong hostname verification is technically supported by Hyperdrive, but the correct Render-issued CA chain for this database/region and hostname match still need to be obtained and independently validated. References: https://render.com/docs/postgresql-creating-connecting and https://developers.cloudflare.com/hyperdrive/configuration/tls-ssl-certificates-for-hyperdrive/.
- Cloudflare Workers Free includes Hyperdrive with 100,000 database statements/day; the Free origin connection limit is 20 per configuration. These are documented plan limits, not evidence of current account quota or application capacity. References: https://developers.cloudflare.com/hyperdrive/platform/pricing/ and https://developers.cloudflare.com/api/resources/hyperdrive/.
- Render's current external-access rules apply to the public Postgres endpoint only; same-region Render services use the internal URL and bypass this external allow-list. This does not provide a path for a Cloudflare Worker, which remains an external caller. Reference: https://render.com/tutorials/postgres-on-render/connection-strings.

### Updated decision

Direct Hyperdrive remains a design candidate, but **is not currently qualified for production**. The first gating question is whether a safe IPv4-only Render allow-list can fully and reliably admit Hyperdrive's direct-origin egress without relying on undocumented IPv4-only behavior. The second is whether Render's actual certificate chain can be configured for Hyperdrive verify-full.

Required next evidence:
1. Obtain a written Render answer confirming Postgres inbound rules are IPv4-only for this database and whether there is any supported way to permit a dual-stack upstream such as Hyperdrive without broadening to 0.0.0.0/0.
2. Obtain Cloudflare confirmation whether Hyperdrive direct public-origin connections can be guaranteed to use only its published IPv4 ranges for this origin, or whether its IPv6 egress can be disabled/avoided. Do not infer this from the existence of published IPv4 ranges.
3. Obtain the Render external hostname and region-specific CA bundle/certificate chain, then verify hostname and trust compatibility for verify-full without connecting Hyperdrive to production.
4. Confirm the actual Cloudflare account plan, remaining daily query quota, and the workload's compatibility with Hyperdrive's 20-origin-connection Free limit and documented PostgreSQL driver/protocol restrictions.
5. If the above cannot be established without production mutation or a new paid/disposable database, retain the current no-go and use the private Tunnel/VPC architecture only if an already-approved continuously available host becomes available.

No Render IP allow-list, TLS setting, database, credential, Cloudflare configuration, Worker, route, secret, production traffic, service, deployment or migration was changed by this review. PR #305 remains the active migration-gate workstream; this topology document is an architecture handover, not a change to migration authority.

## 2026-11-23 follow-up — Hyperdrive egress constraints and no-cost decision

Reviewed current Cloudflare Hyperdrive firewall/FAQ documentation, Workers VPC documentation, Workers Gateway dedicated-egress documentation, pricing/limits, and Render inbound IP rules.

- Hyperdrive's documented origin egress uses Cloudflare's shared IP ranges. The ranges are shared with other Cloudflare products and Hyperdrive configurations; they are not dedicated to this account or Worker. Hyperdrive's firewall guide says to allow-list those ranges when restricting the origin firewall. References: https://developers.cloudflare.com/hyperdrive/configuration/firewall-and-networking-configuration/ and https://developers.cloudflare.com/hyperdrive/reference/faq/.
- Render Postgres inbound rules accept IPv4 CIDRs only. Cloudflare publishes dual-stack IP ranges. The Hyperdrive documentation reviewed does not document a per-configuration IPv4-only egress switch or a guarantee that its connection to an arbitrary dual-stack hostname will use IPv4 only. Therefore a safe IPv4-only allow-list cannot yet be proven complete for Hyperdrive. Do not infer that the IPv4 subset is sufficient. Reference: https://render.com/docs/inbound-ip-rules.
- Cloudflare documents dedicated egress IPs through Gateway as an add-on to Zero Trust Enterprise plans. The cited documentation applies to traffic proxied by Gateway (including `cf1:network` bindings); it does not establish that Hyperdrive's managed database-origin connections can be routed through that mechanism. This is not a no-cost workaround and is not a qualified Hyperdrive solution. Reference: https://developers.cloudflare.com/workers-vpc/configuration/vpc-networks/.
- Hyperdrive Free includes 100,000 database statements/day; paid Workers has unlimited Hyperdrive queries. The API documents a soft origin connection maximum of 20 on Free accounts and 100 on paid accounts. These limits are not a substitute for confirming account usage and workload needs. References: https://developers.cloudflare.com/hyperdrive/platform/pricing/ and https://developers.cloudflare.com/api/resources/hyperdrive/.
- Hyperdrive supports PostgreSQL `verify-full` when supplied the region-appropriate CA certificate; hostname SAN matching is required. This remains a technically viable TLS mode, but no Render CA bundle has been obtained or tested. Reference: https://developers.cloudflare.com/hyperdrive/configuration/tls-ssl-certificates-for-hyperdrive/.
- Cloudflare Workers VPC is the documented private-network path for a private database, but its setup requires a Cloudflare Tunnel instance in the private network. It does not remove the always-on connector-host prerequisite in this architecture. References: https://developers.cloudflare.com/hyperdrive/configuration/firewall-and-networking-configuration/ and https://developers.cloudflare.com/hyperdrive/configuration/connect-to-private-database-vpc/.

### Decision

**Direct-public Hyperdrive is not qualified under the current no-cost and network constraints.** Render accepts only IPv4 inbound rules; Hyperdrive documents shared Cloudflare IP ranges but no IPv4-only guarantee. Dedicated egress is an Enterprise add-on and is not proven to apply to Hyperdrive origin traffic. The private VPC/Tunnel path still needs an always-on connector host. Do not change Render's existing `0.0.0.0/0` rule or create any Cloudflare resource to experiment against production.

### Next useful action

Ask Render and Cloudflare support the narrow interoperability questions below using existing support channels, without creating a new paid plan or resource:
1. Can Render confirm the exact public Postgres endpoint is IPv4-only (A records only) and whether an inbound IPv4-only allow-list is sufficient for all external connections to that endpoint?
2. Can Cloudflare confirm whether Hyperdrive resolves/connects to an IPv4-only origin using IPv4 source addresses exclusively, and whether that behavior is guaranteed/supported rather than incidental?
3. Can Cloudflare confirm whether Gateway dedicated egress IPs can apply to Hyperdrive-managed origin connections? If not, mark this route incompatible with Render's IPv4-only allow-list under the no-cost constraint.

Until those answers exist, retain the no-go. No database, allow-list, TLS setting, credential, Worker, Hyperdrive/VPC resource, route, DNS, deployment, production traffic, service or paid plan was changed.
## 2026-11-23 follow-up — vendor documentation closes the egress design question

Reviewed current official Cloudflare Hyperdrive FAQ, Hyperdrive connection lifecycle, Workers VPC private-database setup, Workers VPC public egress, Render inbound IP rules, and Render Postgres connection documentation.

### Findings

1. Cloudflare's Hyperdrive FAQ states that Hyperdrive connects to databases using Cloudflare IP address ranges shared by all Hyperdrive configurations and other Cloudflare products. Those ranges are suitable only if the database firewall can safely admit the complete applicable source set. The docs do not offer a Hyperdrive per-origin IPv4-only egress control or a dedicated per-configuration source IP. Reference: https://developers.cloudflare.com/hyperdrive/reference/faq/.
2. Render Postgres inbound IP rules explicitly support IPv4 CIDR ranges only. The current Render documentation does not provide an IPv6 allow-list option. Reference: https://render.com/docs/inbound-ip-rules.
3. Cloudflare Workers VPC's `cf1:network` binding routes supported Worker traffic through Gateway, but the documentation describes calls made through the binding (for example `fetch()`); it does not say Hyperdrive's managed database-origin sockets can be routed through that binding. Dedicated egress IPs are an Enterprise add-on for traffic Gateway proxies. Do not assume this applies to Hyperdrive origin connections. Reference: https://developers.cloudflare.com/workers-vpc/configuration/vpc-networks/.
4. Cloudflare's documented private-database Hyperdrive path uses Workers VPC + a TCP VPC Service + a Cloudflare Tunnel, and explicitly requires `cloudflared` to be running in the private network that can reach the database. This retains the always-on connector-host requirement and is not feasible under the currently stated no-new-host/no-new-cost constraints. Reference: https://developers.cloudflare.com/hyperdrive/configuration/connect-to-private-database-vpc/.
5. Render's external Postgres endpoint requires TLS (`sslmode=require`, TLS 1.2+) and uses Render-managed certificates. Cloudflare Hyperdrive supports stronger verification modes when a compatible CA is supplied, but this does not solve the source-IP incompatibility. Reference: https://render.com/docs/postgresql-creating-connecting and https://developers.cloudflare.com/hyperdrive/configuration/tls-ssl-certificates-for-hyperdrive/.

### Decision — no-go, no further technical experiment

Direct public Hyperdrive is not compatible with the current evidence and constraints: Render's database firewall accepts IPv4 CIDRs only, while Hyperdrive documents shared Cloudflare egress ranges and does not document a supported IPv4-only origin-egress guarantee. Routing through Gateway dedicated egress is not documented for Hyperdrive's managed sockets and is Enterprise-only. The private VPC path requires a continuously running `cloudflared` host. No production experiment, temporary broad allow-list, TLS weakening, paid plan, or new connector host is justified.

### Support escalation boundary

The only remaining way to reopen direct Hyperdrive is a written vendor answer that changes one of these facts. The exact support questions are:
- Render: confirm whether the `ghm-db` external Postgres endpoint can be safely restricted to IPv4 source CIDRs while remaining reachable from Hyperdrive, and whether Render offers any supported IPv6 or Cloudflare-specific allow-list mechanism for managed Postgres.
- Cloudflare: confirm whether Hyperdrive-managed origin connections can be guaranteed to originate exclusively from its published IPv4 ranges for an IPv4-only Render Postgres endpoint, and whether that guarantee is officially supported.
- Cloudflare: confirm whether Workers Gateway dedicated egress IPs apply to Hyperdrive-managed database-origin connections (not ordinary Worker `fetch()` calls).

No support case has been submitted from this session: no support-ticket creation/action is available in the connected tools, and no existing case ID was present in the reviewed handover. Do not claim that vendors were contacted or that they answered. Reuse existing Render/Cloudflare support channels if the owner elects to send these questions; no paid support upgrade is implied.

No Render IP allow-list, Postgres setting, TLS configuration, credential, Cloudflare account setting, Worker, Hyperdrive/VPC resource, DNS, production traffic, service, deployment, migration, or paid plan was changed. PR #305 remains the active migration-gate workstream; this architecture decision does not alter migration authority.
## 2026-11-23 follow-up — existing Cloudflare Worker/Pages and Render resources reconciled

Rechecked the current PR #305 branch/head, the current open GHM PR inventory, and the merged Actor Gateway/Auth Issuer/Worker PRs #272, #276 and #277 before making this decision.

- PR #272 (Actor Gateway foundation) merged 14 November. Its PR record explicitly says no production gateway service exists, a private Render service requires paid compute, and the Resource API must not be treated as an isolated issuer/gateway host. The production Resource API remains on the older `c7cf1eb` deployment.
- PR #276 (isolated Authentication Issuer) merged 15 November and contains the isolated issuer application and dedicated DB principal/ACL checks. Its qualification record explicitly says the Workers Free Argon2id feasibility test failed the existing GHM password-hashing CPU budget. Do not weaken Argon2id or purchase paid Workers/Render compute.
- PR #277 (Actor Gateway Worker hardening) merged 15 November. It proves Worker bundle and local Workerd + disposable Hyperdrive behavior, but its own production boundary says no Cloudflare resource or route was provisioned and that disposable qualification does not prove live Cloudflare-to-Render Hyperdrive connectivity, production TLS/ACL identity, or production traffic behavior. Successful Pages PR previews are not a production Worker deployment.
- The existing Render `ghm-actor-gateway` service is a Free service with failed deployments; the last observed startup failure is the live database privilege assertion. It is not a successful production host and does not satisfy the isolated/private hosting and live-availability gates.
- The current Hyperdrive route remains unqualified for Render because Render's inbound Postgres rules are IPv4-only while Hyperdrive documents shared Cloudflare egress without a supported per-origin IPv4-only guarantee. The private VPC alternative still requires an always-on `cloudflared` connector host.

### No-cost hosting decision

**No currently evidenced, compliant production hosting path exists within the owner's stated constraints.** The merged Worker is source/preview-qualified, not provisioned for production; the Auth Issuer cannot meet the Argon2id CPU budget on Workers Free; direct Hyperdrive egress cannot be safely allow-listed on Render from current documentation; private VPC needs an always-on connector; and a private Render service requires paid compute. The existing Resource API must not be used to co-host these isolated security boundaries.

Do not create another service, Worker, Hyperdrive configuration, tunnel host, paid plan, keepalive schedule, or database. Do not weaken Argon2id, TLS verification, Gateway ACL checks, or service isolation. Do not deploy the Resource API or execute dependent revocations on the assumption that the missing services are live.

### Next decision boundary

Stop further speculative hosting implementation. The only evidence that can change this no-go is either (a) an already-owned/available compliant always-on compute/network resource that satisfies the existing isolation and Argon2id requirements without new spend, or (b) a written vendor-supported no-cost topology that resolves both Hyperdrive egress and Worker CPU constraints. Otherwise the production Gateway/Auth Issuer release remains held. PR #305 stays draft, its production execution manifest remains `[]`, and no production batch is authorized.

No Cloudflare resource, Worker, Pages production route, Hyperdrive configuration, Render service/setting, DB role/ACL, credential, secret, deployment, migration, DNS, traffic or paid resource was changed.