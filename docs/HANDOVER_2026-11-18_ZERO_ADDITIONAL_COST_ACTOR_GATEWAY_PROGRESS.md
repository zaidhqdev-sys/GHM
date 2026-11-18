# Actor Gateway — zero-additional-cost continuation handover

**Date:** 2026-11-18  
**Repository:** `zaidhqdev-sys/GHM`  
**Branch reviewed:** `feat/actor-gateway-hyperdrive-direct-render-20261118`  
**Branch HEAD:** `2507181ed677bb3b0948348f1231392f468d5be2`  
**Base:** `main` at `b73839b27ac90446650f921d3e8ce1b5de041f04`  
**Status:** DESIGN / SOURCE REVIEW ONLY — no production connection established  
**Cost constraint:** absolutely no new paid infrastructure, paid upgrades, usage-based paid dependency, or resource that requires paid infrastructure to operate.

## 1. Owner constraint — binding

The owner explicitly reconfirmed on 2026-11-18: do not create paid infrastructure or anything that depends on paid infrastructure.

This excludes:
- any new Render Web Service, Background Worker, Private Service, database, plan upgrade, schedule or other paid resource;
- Cloudflare Workers Paid plan or any paid Workers feature;
- Cloudflare Containers, paid VPC/tunnel arrangement, paid add-on or usage path that requires an upgrade;
- any other provider/service whose operation requires a paid tier or incurs a new recurring/usage charge.

Do not create resources, enable billing, switch plans, raise spending limits, configure paid fallbacks, or assume an account's current plan. If a free-tier quota is exceeded and the operation would require upgrading to continue, it must fail closed and remain unavailable. Do not auto-upgrade.

The existing Render `ghm-db` is already a paid production dependency. It is explicitly grandfathered as existing infrastructure; no additional Render resource or increase in its plan is authorized. Any design must not introduce additional Render cost or require a new paid connector host.

## 2. Current architecture reconciliation

The repository contains conflicting historical architecture decisions:
- Main's architecture decision selects a dedicated always-on Render Node Web Service for the already-existing Node Actor Gateway server. It explicitly says this costs extra and must not be created under the no-additional-cost constraint.
- The reviewed Hyperdrive branch adds a superseding 2026-11-18 section proposing Cloudflare Worker → Hyperdrive → Render external PostgreSQL endpoint. That removes the proposed additional Render connector service but is not yet proven to work with the actual production database endpoint and TLS chain.
- The older Cloudflare Tunnel / Render Background Worker / Workers VPC topology requires a paid Render worker and is prohibited.
- Do not run the Node Render gateway and Cloudflare Worker as parallel production hosts. The direct Hyperdrive Worker remains only a no-new-Render-cost candidate, subject to the stricter no-paid-dependency rule.

The preferred investigation candidate is therefore:
`existing Cloudflare Workers Free capability (only if already available without upgrade) → Hyperdrive Free allowance → existing Render ghm-db external PostgreSQL endpoint`.

This is not approval to provision it. It must be verified that the account can use it without a paid plan, paid add-on, paid route, or billing change. If not, stop and retain the disconnected state.

## 3. Pricing and quota facts checked 2026-11-18

Current official Cloudflare documentation says:
- Hyperdrive is included in Workers Free and Workers Paid.
- Workers Free includes 100,000 Hyperdrive database statements per day; statements include reads, writes and schema statements.
- Workers Free has a separate 100,000 Worker requests/day limit and a 10 ms CPU time limit per invocation.
- The Workers Paid plan is a separate plan with a $5/month minimum according to Cloudflare's published pricing.
- When free limits are exceeded, operations fail; no upgrade is necessary or permitted to continue.

Sources:
- https://developers.cloudflare.com/hyperdrive/platform/pricing/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/

These are published plan limits, not confirmation of this account's current subscription, remaining quota, or eligibility. No account billing or plan details were changed or inspected. Do not assume a Free plan is active. Do not switch to Paid. Do not create a configuration until the account plan and no-charge terms are confirmed.

## 4. Render production inventory and live database findings

Read-only inspection used the owner-confirmed ZAID Technologies workspace.

Existing production database:
- Service: `ghm-db`
- Database: `ghm_db`
- PostgreSQL 18.6
- Region: Frankfurt
- Existing plan: `0.1c-256mb`
- Status: available
- Existing IP allowlist observed: `0.0.0.0/0`
- No connection pool configured.

No change was made to the allowlist, database, plan, credentials, or settings. The broad existing allowlist is not a recommendation to widen ingress further.

The Render metadata API did not return the external hostname or certificate/CA material in the inspected response. Do not guess either value or retrieve/display credential-bearing connection URLs in chat. The external hostname and the exact Frankfurt CA/hostname match remain unverified.

Live read-only catalogue inspection previously returned:
- database `ghm_db`, PostgreSQL 18.6;
- connector session `session_user=ghm_app_user`, effective `current_user=ghm_db_user`;
- `ghm_actor_gateway` login exists and has CONNECT;
- `ghm` schema USAGE is absent for `ghm_actor_gateway`;
- zero `ghm.gateway_*` and zero `ghm.assert_actor_gateway*` functions;
- bounded membership: member `ghm_db_user`, granted role `ghm_actor_gateway`, grantor `postgres`, ADMIN OPTION=true, INHERIT=false, SET=false;
- the connector cannot SELECT `ghm.ghm_schema_migrations`.

This is not a gateway-ready database. Do not change grants, role memberships, ownership, or run migrations as a workaround.

## 5. Hyperdrive Worker source review

Branch comparison against main confirmed 8 commits ahead, 0 behind. Four files differ from main:
- `docs/HANDOVER_2026-11-16_ACTOR_GATEWAY_HOSTING_AND_CREDENTIALS.md`
- `docs/architecture/ACTOR_GATEWAY_RENDER_CONNECTOR_SERVICE_DECISION_2026-11-15.md`
- `workers/actor-gateway/index.ts`
- `workers/actor-gateway/worker-contract.test.mjs`

Source inspection confirmed:
- Cloudflare Node HTTP adapter is used.
- Worker requires a Hyperdrive binding and the isolated capability assertion secret.
- Startup checks database identity and the exact gateway ACL before opening the HTTP listener.
- Startup failures fail closed and initialization can retry after failure.
- Account-scoped edge rate limit is configured at 120 per 60 seconds.
- JSON request size is bounded to 16 KiB.
- Public ES256 verification material is used; private issuer key, token pepper and issuer DB URL are not passed into the Worker.
- The three commercial readers have been wired into the Worker.
- Payment preparation and commercial launch remain explicitly disabled.
- Wrangler configuration has `workers_dev=false`, `preview_urls=false`, and an all-zero Hyperdrive ID placeholder.
- No production HTTPS route exists.
- The Wrangler file contains no Containers, Durable Objects, Queues or placement product configuration.

A static inspection of the checked-in Worker source and contract assertions was performed during this continuation. This is **not** a TypeScript build, executed test, Wrangler dry-run, CI result, deployed Worker, or database connection test. No tests were executed in this continuation.

The zero Hyperdrive ID must not be replaced with a guessed value. Do not enable workers.dev, add a route, configure secrets, or deploy.

## 6. Remaining technical blockers

1. Confirm the existing Cloudflare account is eligible to use Workers Free and Hyperdrive Free without a plan switch, paid add-on, or paid fallback. No billing or account changes.
2. Obtain the actual Render external hostname and matching Frankfurt CA through supported safe dashboard/connection details. Do not expose passwords or full connection URLs.
3. Validate strict PostgreSQL TLS hostname and CA verification (`verify-full`) without weakening TLS.
4. Confirm Hyperdrive supports the required custom CA and connection-string settings in the exact intended free-tier configuration.
5. Resolve the production administrator-authorized migration ledger and role/ownership audit. Current Render connector cannot read the ledger.
6. Verify a fresh recoverable production backup/recovery point.
7. Derive the first safe contiguous migration prefix from the authoritative live ledger, exact repository migration set and route/cutover dependencies. PR #298 remains a separate draft with an empty execution manifest; its pending inventory is not permission to execute.
8. Reconcile complete Worker route parity against the Node gateway and Resource API client call graph.
9. Qualify the Worker build, tests and Wrangler dry-run on the branch using only existing CI/disposable infrastructure, and inspect the exact-head result.
10. Only after all preceding gates, decide whether a no-charge Cloudflare configuration can be created. If there is any risk of plan upgrade or billing, do not create it.

## 7. Explicit prohibitions

- No Render service, worker, private service, database, schedule or plan upgrade.
- No Cloudflare Workers Paid plan, paid add-on, paid VPC/tunnel or other billable resource.
- No new paid infrastructure or usage dependency.
- No billing setting, spending limit, plan or subscription change.
- No production migration, DDL, grants, revokes, role/membership/ownership changes.
- No production database allowlist changes.
- No secrets, passwords, private keys or credential-bearing connection URLs in Git, logs or chat.
- No Worker route, secret, Hyperdrive binding, deployment or Resource API cutover.
- No PayFast/payment activation or launch authorization.
- No reuse of sandbox/qualification services or databases.

## 8. Change record for this continuation

- Read-only Render workspace/database metadata inspection.
- Read-only live PostgreSQL catalogue/privilege checks in the preceding inspection.
- Read-only GitHub branch, source, handover and architecture review.
- Official Cloudflare pricing/limits documentation checked.
- No source implementation changed.
- No CI/test/build run.
- No Cloudflare or Render resource created or modified.
- No secret, environment variable, database role, grant, migration, route, deployment, plan or billing change.
- No new cost incurred.

## 9. Next action

Continue with local/repository-only validation and safe retrieval of the Render external hostname/CA instructions. Preserve the zero-additional-cost constraint as an unconditional stop condition. The objective remains a verified authenticated connection to the existing `ghm_db`; if that cannot be achieved without paid infrastructure, report the exact blocker rather than creating a paid workaround.
