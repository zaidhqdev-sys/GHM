# Handover — 2026-11-17 Authentication and Actor Gateway hosting cost review

## Owner direction

The operating constraint is minimum recurring cost until ZAID Technologies products are live and earning revenue. The only previously approved additional hosting allowance is USD 7/month for the Actor Gateway. No second paid service is approved. No service may be created or upgraded without the owner's explicit approval.

## Authentication Issuer — hosting decision

The separate Authentication Issuer deployment target is withdrawn. Do not create, provision, subscribe to, or budget a separate Render service for it.

This does **not** mean deleting GHM authentication. The repository currently has:
- `src/auth-issuer/server.ts`, a standalone HTTP process that owns registration, login, token issuance, and password-recovery routes;
- `src/http/auth-router.ts`, the actual HTTP route implementation;
- `src/http/app.ts`, which already supports registering those auth routes inside the ordinary GHM API app;
- `src/server.ts`, which currently calls `createApp({ authRoutesEnabled: false })`, keeping auth routes out of the existing API process.

The standalone issuer currently uses a distinct `ghm_auth_issuer` database login and startup ACL checks. The correct cost-reduction implementation is to retire the separate process/deployment and mount the existing auth routes in an already-approved GHM service while retaining the dedicated database principal and its least-privilege checks. Do not simply delete auth routes, token issuance, password recovery, or the database protections. Do not silently switch the auth persistence to the broad `ghm_runtime` database identity.

Implementation must:
1. Reuse the existing `GHM-Internal-Runtime` service; no additional hosting.
2. Keep authentication persistence on the restricted `ghm_auth_issuer` database identity, using a separate pool/credential from the ordinary runtime pool.
3. Preserve auth issuer database identity and privilege startup checks before the API reports ready.
4. Register the existing auth routes in the existing GHM API application and retain its configured CORS, proxy, rate-limit, error and readiness behavior.
5. Remove the standalone `start:auth-issuer` deployment entry point and standalone server/app wrapper only after the embedded path and regression tests pass.
6. Keep existing authentication route contracts and product client URLs unchanged.
7. Update CI and handover to prove the embedded cutover; do not alter production secrets, roles, grants, migrations, Render settings or deployments as part of code qualification.

The repository's auth issuer CI qualification is a code/DB-role test, not evidence that a second Render service is required. The Render inventory reviewed on 2026-11-16 showed no deployed Authentication Issuer service. No issuer hosting charge has been incurred according to the reviewed inventory.

## Actor Gateway — necessity and cost review

The Actor Gateway is not the same thing as authentication. It is a privileged database access boundary used by the ordinary GHM API for actor-sensitive operations.

Source review confirmed:
- The ordinary API starts with its restricted `ghm_runtime` database identity.
- Sensitive API operations call dedicated Actor Gateway HTTP clients and pass the user's access token; the gateway verifies the token and derives the actor identity itself.
- The gateway connects using the separate `ghm_actor_gateway` login and checks its database identity, role memberships and privileges at startup.
- Pending database migrations introduce signed-assertion gateway functions and revoke unsafe/unused direct runtime entry points. The earliest pending supplier-classification and capability-governance functions accept caller-supplied actor IDs, so the signed-assertion cutover and revocations must be reviewed as one contiguous migration dependency chain.
- The current ordinary API process is deliberately not allowed to assume the gateway's actor identity or database authority.

**Conclusion:** the gateway's security function is justified by the current database authorization design; it is not an arbitrary authentication feature. However, the separate USD 7/month Render service is a hosting choice, not a fact established by the code alone. Before spending it, compare:
- dedicated always-on gateway process (strongest process/secret isolation; USD 7/month previously approved);
- gateway module and separate restricted DB pool inside the existing GHM runtime (no new hosting cost, but loses process isolation because the ordinary API process can access the gateway credential/secret);
- any already-paid, already-approved hosting option that can provide an always-on isolated process without a new recurring charge.

Do not describe co-hosting as equivalent security. It preserves a separate database login and code path but weakens the process boundary. Do not select it or the paid option until the trade-off is explicitly recorded. Do not use the Free sleeping service for the gateway where the existing five-second client/database timeouts require an always-on endpoint. Do not repurpose `zaid-ai-workforce` without a separate, evidence-based fit review.

## Current operational state

- No Authentication Issuer Render service was present in the reviewed Render inventory.
- No Actor Gateway Render service was present in the reviewed Render inventory.
- `GHM-Internal-Runtime` is the existing Free Web Service; `ghm-db` is the existing paid PostgreSQL service.
- No new service, plan, subscription, secret, environment variable, deployment, database role, grant, migration, or production data was changed by this review.
- PR #297 remains draft/open/unmerged and its production migration batch manifest remains empty. No production migrations are authorized by this review.

## Immediate implementation order

1. Implement embedded Authentication Issuer routes in the existing GHM Internal Runtime, retaining the restricted auth DB principal and startup ACL checks. Remove only the standalone hosted process/deployment requirement.
2. In parallel, complete a bounded Actor Gateway co-hosting-vs-dedicated isolation comparison against the actual Render service constraints and the signed-assertion migration chain. State the security loss and monthly cost plainly.
3. Keep the current USD 7/month Actor Gateway allowance unspent until that comparison identifies the lowest-cost acceptable deployment.
4. Keep production migrations and deployments stopped until their existing backup, ledger, identity and contiguous-prefix gates are satisfied.

This review is a repository/source and previously recorded Render inventory assessment. It is not a production deployment, production ACL change, or live service test.
