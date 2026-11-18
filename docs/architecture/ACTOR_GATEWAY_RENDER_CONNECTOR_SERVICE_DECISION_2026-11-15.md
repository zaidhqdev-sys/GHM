# Actor Gateway — Render connector service decision (2026-11-15)

**Status:** Architecture verified; deployment blocked by the no-additional-cost constraint  
**Scope:** Render host for the Cloudflare Tunnel connector to production `ghm-db`  
**No infrastructure changes:** No Render service, Cloudflare resource, tunnel, VPC Service, Hyperdrive binding, secret, database setting, role, grant, or deployment was created or changed.

## Decision

The technically correct Render service type for a dedicated `cloudflared` connector is a **Background Worker**, not a Web Service and not a Private Service.

The connector does not need to receive inbound Render network traffic. `cloudflared` establishes and maintains outbound connections to Cloudflare. It then forwards the approved Cloudflare-side TCP route to the Render PostgreSQL internal hostname and port 5432. The worker itself only needs outbound connectivity to the Render private network and Cloudflare.

This corrects the earlier oversimplification that a Background Worker is unsuitable because it cannot receive inbound traffic. That restriction does not prevent an outbound-initiated Cloudflare Tunnel from forwarding traffic to a local/private TCP destination.

## Current Render cost and service-type facts

- Render's current pricing page lists the smallest continuously running Background Worker/Private Service compute plan as **0.5 CPU / 512 MB, $7 USD per month**.
- Render's Free-instance documentation says Background Workers and Private Services do not support Free instances. Free compute is available for Web Services, selected datastores and static sites, with significant limitations.
- A Free Web Service is not an acceptable substitute: it spins down after 15 minutes without inbound HTTP/WebSocket traffic, can restart at any time, has ephemeral storage, and Render explicitly says Free instances are not for production.
- A Private Service is intended for a process that must accept inbound private-network traffic. The tunnel connector does not need that; a Background Worker has the smaller required network surface.
- Render documents that Background Workers can initiate outbound connections to PostgreSQL and other private-network services in the same region/workspace, subject to environment isolation and networking rules.

Sources checked 2026-11-15:
- https://render.com/docs/service-types
- https://render.com/docs/background-workers
- https://render.com/docs/private-network
- https://render.com/docs/free
- https://render.com/pricing

## Account-specific inventory recheck

Read-only Render account inventory on 2026-11-15 confirmed:
- Production environment has `GHM-Internal-Runtime`, `zaid-ai-workforce`, and paid `ghm-db`, all in Frankfurt.
- Both existing compute services are Free Web Services. Neither is a dedicated connector host.
- Other visible services are legacy sandbox/qualification resources and are excluded.
- No dedicated Actor Gateway connector Worker exists.
- Do not co-host the tunnel in GHM-Internal-Runtime or repurpose AI Workforce. Do not revive or repurpose sandbox services.

## Approved target topology (design only)

```
Cloudflare Actor Gateway Worker
  -> Hyperdrive
  -> Workers VPC TCP Service (PostgreSQL / TCP 5432)
  -> Cloudflare Tunnel (outbound-initiated)
  -> dedicated Render Background Worker running cloudflared
  -> Render private-network hostname for ghm-db:5432
  -> ghm_db
```

The connector must be dedicated to this purpose, in Frankfurt and in the same eligible Render private-network environment as `ghm-db`. The tunnel route must expose only the intended PostgreSQL host and port. Database TLS must remain fully verified (`verify_full`); no public database ingress or TLS weakening.

## Cost gate and action

The technically appropriate connector requires a paid always-on Render Background Worker. The smallest listed compute tier is $7 USD/month before any applicable taxes/other usage. The user's current constraint is no additional paid infrastructure until the business earns revenue.

**Therefore do not create the Background Worker now.** Do not substitute a Free Web Service, periodic Cron Job, keepalive schedule, laptop, phone, GHM-Internal-Runtime, AI Workforce, or sandbox service. Those options do not meet the agreed availability/isolation constraints.

No paid service has been created and no cost has been incurred by this decision. Revisit creation only when the user explicitly authorizes the recurring compute cost or an already-paid, owner-approved always-on host becomes available.

## Implementation checklist when the cost gate is cleared

1. Reconcile current GHM PRs, branches and handovers again; do not duplicate Actor Gateway implementation.
2. Create one dedicated Render Background Worker from a dedicated, reviewed connector image/repository in Frankfurt. No public HTTP port is needed.
3. Provide only the tunnel credential to the connector process; do not expose it to the GHM API process. Scope the tunnel route to the Render Postgres internal hostname and TCP 5432 only.
4. Confirm the worker's private-network environment can reach the exact `ghm-db` internal hostname and that the Cloudflare Tunnel remains connected across restarts/redeploys.
5. Configure the Cloudflare Workers VPC TCP Service and Hyperdrive only after the connector path is proven with non-production credentials and a disposable qualification database.
6. Keep production role remediation, fresh backup verification, and Amanda/Render support resolution as independent mandatory gates. A working tunnel does not resolve database role authority.
7. Only after all gates pass, separately authorize Worker deployment, secret provisioning, setting `GHM_ACTOR_GATEWAY_URL`, and controlled production smoke tests.

## Related records

- `docs/architecture/ACTOR_GATEWAY_NO_COST_TOPOLOGY_ASSESSMENT_2026-11-15.md`
- `docs/security/RENDER_ACTOR_GATEWAY_ROLE_SEPARATION_HANDOVER_2026-11-12.md`
- `docs/HANDOVER_2026-11-11_ACTOR_GATEWAY_PRODUCTION_READINESS.md`
- Amanda's Render support guidance remains authoritative for the separate database credential/role remediation: retain the Dashboard-managed administrator credential and move ordinary application execution to qualified SQL-created login role(s). Do not improvise grants or copy support's illustrative SQL into production.


## Superseding correction — direct Render Actor Gateway Web Service

**Follow-up date:** 2026-11-15  
**Supersedes:** The earlier recommendation in this document to use a Background Worker running `cloudflared` as the Actor Gateway connector.

A reinspection of merged GHM source found that the repository already contains a standalone Node Actor Gateway HTTP server. The production Actor Gateway should be deployed as a **dedicated Render Web Service**, not a Background Worker and not a tunnel connector.

### Why the architecture changes

- `src/actor-gateway/server.ts` is a complete Node HTTP service. It binds to Render's `PORT`, exposes `/healthz`, validates the authenticated PostgreSQL identity and the exact function/privilege allowlist at startup, and wires the typed Actor Gateway readers.
- `package.json` already defines `start:actor-gateway` as `node dist/actor-gateway/server.js`.
- `GHM_ACTOR_GATEWAY_URL` is explicitly validated as a credential-free HTTPS origin. Existing GHM clients append their typed API paths. A Render Web Service's HTTPS origin fits this contract without adding a tunnel or changing client URL semantics.
- The dedicated service can use Render's internal PostgreSQL connection string for `ghm-db` in Frankfurt, with `DATABASE_SSL_MODE=internal`. This keeps database traffic on Render private networking; no Cloudflare Tunnel, Hyperdrive, Workers VPC or public PostgreSQL ingress is needed for this Node service architecture.
- The Worker implementation in `workers/actor-gateway` is a separate Cloudflare deployment option. It is not required to host the already-implemented Node gateway and should not be provisioned in parallel.

### Proposed Render Web Service configuration (not created)

| Setting | Value |
|---|---|
| Service name | `ghm-actor-gateway` |
| Repository | `zaidhqdev-sys/GHM` |
| Branch | `main` |
| Region | Frankfurt |
| Environment | Production (same Render environment as `ghm-db`) |
| Runtime | Node |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm run start:actor-gateway` |
| Health check | `/healthz` |
| Plan | Always-on paid Web Service; smallest paid tier, not Free |
| Auto-deploy | OFF initially; manual controlled deploy only |

Use the Render-generated HTTPS service origin as `GHM_ACTOR_GATEWAY_URL` only after gateway deployment and smoke qualification. The URL must be an origin only, with no path, credentials, query or fragment.

### Why a Free Web Service is not an acceptable substitute

The Resource API's existing gateway HTTP clients have a 5-second request timeout. Render Free Web Services spin down after 15 minutes without inbound HTTP/WebSocket traffic and may take substantially longer than five seconds to wake. The gateway's own database connection timeout is also 5 seconds. A sleeping Free gateway therefore causes ordinary API calls to time out before the gateway is ready. It is not a reliable production security boundary.

A paid always-on Web Service incurs recurring compute cost. The user's standing constraint is no additional paid infrastructure until the business earns revenue. Therefore the service is **not created now** and no cost is incurred. This is the actual deployment blocker; a Background Worker is not the right service type for an HTTP gateway.

### Production gates independently rechecked

A fresh read-only query against Render `ghm-db` / `ghm_db` on 2026-11-15 returned:
- `session_user=ghm_app_user`, `current_user=ghm_db_user` for the Render query tool's managed connection.
- `ghm_actor_gateway` exists as LOGIN, NOINHERIT, with SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS all false.
- Its only incoming membership is the trusted `ghm_db_user` ADMIN OPTION membership with INHERIT=false and SET=false; the gateway role has no outgoing memberships.
- `ghm_db_user` remains CREATEROLE/CREATEDB and has ADMIN OPTION over protected service roles. This is the known Amanda/Render role-separation issue; do not improvise role changes.
- **Zero** `ghm.gateway_*` or `ghm.assert_actor_gateway*` functions are currently installed in production. The gateway's required production database functions and grants are therefore not ready.
- The exact production migration audit most recently supplied by the user reported 137 repository migrations, 105 live ledger rows, 42 pending migrations and a pending-allowlist mismatch. This must be reconciled and rerun before any production migration decision; do not assume the older seven-pending snapshot is current.

PR/branch reconciliation:
- Unified Actor Gateway integration PR #272 is merged (merge commit `4463bbb989f9d1173596f5371663b3e9e7afc0a9`).
- Isolated Authentication Issuer PR #276 is merged (merge commit `1d78d2b992acf92f1359b396f3ccc759c1ff6bd6`).
- Worker hardening PR #277 is merged (merge commit `fd629ea4148a69a0600d8424ed37580b83a59058`).
- PR #284 remains open and draft; exact-head commit `4c5710f50bc61a611e07f5ef904d319019bf1782` passed CI run `43752492009`. It qualifies replay and timestamp rejection in disposable PostgreSQL and local Worker smoke tests; it is not production deployment evidence.

### Required secrets/configuration — names only, never values in Git or handover

- `GHM_ACTOR_GATEWAY_DATABASE_URL`: SQL-created `ghm_actor_gateway` login, Render internal host, database `ghm_db`; do not use the Dashboard-managed administrator URL.
- `DATABASE_SSL_MODE=internal` for Render private-network Postgres connection.
- `GHM_JWT_ES256_PUBLIC_KEY_PEM` and `GHM_JWT_ES256_KID`; optional previous public key/KID only as a matched pair.
- `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET`, provisioned through the reviewed database secret workflow and never exposed to the ordinary Resource API.
- Do not provide the ES256 private key, token pepper, issuer database URL, migrator URL, or ordinary runtime URL to the Actor Gateway.

The exact production DB login credential and assertion secret have not been provisioned or verified for this service. Do not assume that existence of the role means a usable service credential exists.

### Correct rollout sequence

1. Reconcile the 42-pending production migration audit against current main and correct the allowlist mismatch; repeat the live read-only audit.
2. Complete the read-only role/object/ACL checks and Amanda/Render support remediation plan; retain the Dashboard-managed administrator for controlled administration and preserve the SQL-created `ghm_runtime` and `ghm_migrator` identities.
3. Verify a fresh production backup/recovery point before any DDL, role, grant, secret-table or deployment cutover.
4. Qualify the exact pending gateway migration chain and startup ACL contract on disposable PostgreSQL; do not run it on production yet.
5. When the recurring Web Service cost is explicitly affordable/authorized, create the dedicated Frankfurt Render Web Service with auto-deploy OFF and the settings above.
6. Provision only the dedicated gateway login URL and approved gateway secrets through controlled secret entry; verify `session_user=current_user=ghm_actor_gateway`, startup role checks, function allowlist and `/healthz`.
7. Verify protected endpoints with a real short-lived GHM access token and adversarial denial tests. Confirm API client timeouts, cold/restart behavior, TLS and logs.
8. Only after all gates pass, separately authorize the production migration execution, service deploy, setting `GHM_ACTOR_GATEWAY_URL` on `GHM-Internal-Runtime`, and controlled production smoke/cutover.

**No Render service, Cloudflare resource, database role, grant, migration, secret, environment variable, deployment, or production data was changed during this follow-up.**


## 18 November 2026 — superseding no-new-Render-compute correction

The earlier dedicated Render Background Worker recommendation is superseded **for the direct Cloudflare Hyperdrive-to-Render-external-Postgres route only**.

Cloudflare Hyperdrive supports an existing PostgreSQL database via its external hostname/connection string. Render explicitly supports external PostgreSQL connections from systems outside Render. This means a dedicated Render cloudflared process, Tunnel, Workers VPC TCP Service and Hyperdrive VPC route are not mandatory for this topology:

Cloudflare Actor Gateway Worker → Hyperdrive → Render ghm-db external PostgreSQL endpoint → ghm_db.

This removes the additional $7/month Render connector-worker dependency. Hyperdrive is included in Workers Free with a published allowance of 100,000 database statements per day. This does not establish the user's account-specific remaining quota or Worker request limits.

**Mandatory transport rule:** production Hyperdrive must use PostgreSQL sslmode=verify-full and the correct Frankfurt-specific Render PostgreSQL CA certificate uploaded to Cloudflare. Cloudflare documents that verify-full checks both CA trust and hostname SAN/CN. The default require mode is encrypted and WebPKI validated, but it is not the chosen strict configuration for this production route. Do not lower TLS verification or assume Render's CA certificate without evidence.

The Render external database allowlist was observed as 0.0.0.0/0. This is an existing broad public ingress setting; it is not authorization to broaden it further. Do not change the allowlist as part of this work. Use only the dedicated ghm_actor_gateway database login and retain its exact function allowlist/startup checks.

This correction does not remove the production DB migration, role-administration, backup/recovery, secret-custody or authenticated route-readiness gates. Current live catalogue inspection still finds no ghm_actor_gateway schema USAGE and no gateway/assertion functions. The Worker config still has an all-zero Hyperdrive ID, workers_dev=false and no production HTTPS route. The Worker also lacks some commercial reader wiring present in the Node gateway server. Therefore this is a viable no-new-Render-compute hosting path, **not a claim that production is connected or ready to cut over**.

The dedicated Render connector worker remains a valid alternative only if direct external Hyperdrive connectivity or strict CA validation cannot be established. Do not build both topologies in parallel.

No Cloudflare or Render resource, secret, database role, grant, migration, allowlist, route or deployment was changed by this reassessment.


### Hyperdrive cache and connection-limit settings

The Actor Gateway must use a cache-disabled Hyperdrive configuration. Hyperdrive enables eligible read caching by default and does not invalidate cached reads after writes. This is not acceptable for actor identity, tenant membership, permissions, auth/session state or immediate read-after-write operations. Use the Wrangler/dashboard cache-disabled setting at Hyperdrive creation; do not rely on SQL function volatility or query parsing as a cache-control mechanism.

The Cloudflare Free Hyperdrive tier permits up to 20 origin connections per configuration. Start with a conservative origin connection limit of 5 for the existing small Render PostgreSQL instance and verify actual active connections before any wider traffic cutover.
