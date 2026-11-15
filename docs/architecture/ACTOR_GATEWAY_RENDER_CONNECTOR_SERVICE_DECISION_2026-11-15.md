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
