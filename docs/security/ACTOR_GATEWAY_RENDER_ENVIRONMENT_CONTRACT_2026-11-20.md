# Actor Gateway Render Environment Contract — 20 November 2026

**Disposition:** SOURCE CONTRACT VERIFIED; PRODUCTION PROVISIONING AND DEPLOYMENT BLOCKED  
**Hosting decision:** one dedicated Render Node Web Service, Free plan initially, later upgrade the same service in place  
**Service form:** owner-filled, unsubmitted; do not submit or deploy as part of this review  
**Target database:** existing Render `ghm-db` / `ghm_db`, Frankfurt, PostgreSQL 18  
**No new paid resource or production change authorized**

## 1. Exact Node service contract

Verified against current `main`:

| Setting | Required value / behaviour |
|---|---|
| Service type | Render Web Service (Node HTTP server), not Background Worker, Cloudflare Worker or Resource API reuse |
| Repository | `zaidhqdev-sys/GHM` |
| Branch | `main` for the current integrated Actor Gateway source; keep auto-deploy OFF |
| Region | Frankfurt, same region as `ghm-db` |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm run start:actor-gateway` |
| Package start script | `node dist/actor-gateway/server.js` |
| Health check | `/healthz` |
| Port | Render supplies `PORT`; source defaults to 10000 if absent |
| Runtime | Node.js >=20 per package.json |
| Scaling | One service only; when justified, upgrade this same service in place. Do not create a second paid service. |

The earlier Render build attempt failed because development type packages were omitted by the build environment. The corrected build command above retains dev dependencies for TypeScript compilation. A later candidate build succeeded, but its application process failed closed because the Resource API required a real Gateway URL while production storage was enabled.

## 2. Actor Gateway environment contract

The Node process reads the following values before it can listen:

| Variable | Requirement | Current evidence |
|---|---|---|
| `NODE_ENV` | Set to `production` so production database SSL mode is mandatory | Form screenshot values were masked; exact value not independently verified |
| `DATABASE_SSL_MODE` | Explicit `internal` for the same-region Render internal PostgreSQL URL; `external` is not the selected production path | Owner previously confirmed use of the internal DB URL; mode value itself remains unverified |
| `GHM_ACTOR_GATEWAY_DATABASE_URL` | Required; dedicated SQL-created `ghm_actor_gateway` login to `ghm_db`, using Render's internal hostname | Owner confirmed on 18 Nov that this was staged in the unsubmitted form, with username changed to `ghm_actor_gateway`; password validity and effective URL were not inspected |
| `GHM_JWT_ES256_PUBLIC_KEY_PEM` | Required public verification key in PKCS#8 PUBLIC KEY PEM form | Masked form value; provenance and correctness not verified |
| `GHM_JWT_ES256_KID` | Required active key identifier; printable ASCII, 1–64 chars | Masked form value; correctness not verified |
| `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET` | Required canonical base64 encoding of exactly 32 bytes | Masked form value; entropy, length and provenance not verified |
| `PORT` | Supplied by Render; source defaults to 10000 | Platform-managed |

Optional key rotation inputs:
- `GHM_JWT_ES256_PREVIOUS_PUBLIC_KEY_PEM`
- `GHM_JWT_ES256_PREVIOUS_KID`

They must either both be absent or both be present, valid, and use a KID different from the active KID. Do not add them unless a real overlapping key rotation is in progress.

The Actor Gateway loads **public JWT verification material only**. It does not need or receive `GHM_JWT_ES256_PRIVATE_KEY_PEM`; the private signing key must remain outside this service.

Optional commercial switches:
- `GHM_COMMERCIAL_PAYMENT_PREPARATION_ENABLED`
- `GHM_COMMERCIAL_LAUNCH_AUTHORIZED`
- `GHM_COMMERCIAL_PAYMENT_PROVIDER`

Keep the two authorization switches unset/false. PayFast remains paused. These optional flags are not prerequisites for the free-directory Gateway and must not be enabled as part of this work.

## 3. Resource API variables are a separate boundary

Do not copy Actor Gateway database credentials or its assertion secret into the Resource API.

| Variable | Consumer | Requirement / evidence |
|---|---|---|
| `GHM_RUNTIME_DATABASE_URL` | GHM-Internal-Runtime | Dedicated `ghm_runtime` login; current source requires it in production. Exact live value was not inspected. |
| `DATABASE_SSL` | GHM-Internal-Runtime | Must be `true` in production. |
| `GHM_ACTOR_GATEWAY_URL` | GHM-Internal-Runtime | Credential-free HTTPS origin only, no path/query/fragment. Cannot be populated with a real service origin until the Gateway service exists, is deployed and passes smoke qualification. |
| `GHM_STORAGE_PROVIDER_WORKFLOW_ATTESTATION_SECRET` | GHM-Internal-Runtime | Separate provider-workflow signer, canonical base64 for exactly 32 bytes when production storage is enabled. Never substitute the Gateway capability assertion secret. |

Storage-provider configuration is a separate Resource API concern. When storage is configured, its storage provider fields must be complete and the Gateway URL plus provider-workflow attestation secret are required. The 15 Nov failed deploy log proves that the candidate process had no usable Gateway URL at that time; it does not establish today's exact secret values.

## 4. What is and is not provisioned

### Confirmed
- The Render workspace has no `ghm-actor-gateway` service.
- The owner has an unsubmitted service form for the single intended Gateway.
- The owner confirmed that the form's DB URL was staged using the existing `ghm-db` internal URL with username changed to `ghm_actor_gateway`.
- The production PostgreSQL role `ghm_actor_gateway` exists as a restricted LOGIN / NOINHERIT role in the last recorded catalogue evidence.
- The selected service lifecycle is one Free Web Service initially, then an in-place plan upgrade of that same service if/when affordable.

### Not verified / not provisioned for service use
- The staged database URL's password and connection validity.
- The form's `NODE_ENV`, `DATABASE_SSL_MODE`, public key, KID and assertion secret values; the form masked values and the assistant did not inspect it.
- A valid deployed Gateway HTTPS origin.
- Production `ghm` schema USAGE and the exact Gateway function EXECUTE allowlist.
- The signed-assertion database API and all required function signatures in the live database.
- A fresh verified recoverable production backup and the exact live migration ledger/checksum reconciliation.
- Provider-authorized resolution of the Render PostgreSQL bootstrap/migrator authority issue.

The last recorded production catalogue evidence says `ghm_actor_gateway` lacks `ghm` schema USAGE and no Gateway functions were installed. The Actor Gateway's startup performs identity and exact privilege assertions before listening. A correctly filled form cannot make the service ready while those database prerequisites are absent.

## 5. Free-plan cold-start contract

The owner explicitly selected Free for this one service. This decision supersedes older handover statements that the service must initially be paid. The same service is to be upgraded in place later; do not create a second service.

Current Resource API Gateway clients use a 5,000 ms AbortController timeout. The Gateway PostgreSQL pool also has a 5,000 ms connection timeout. Render Free may sleep after inactivity and take longer than five seconds to wake.

Source review found no automatic retry in the inspected Gateway HTTP clients. Do not add blanket retries for mutations:
- A timed-out client cannot know whether the Gateway completed and committed the database operation before the response was lost.
- The signed Gateway reader creates a fresh nonce/assertion for each mutation invocation; replaying a new request is not automatically equivalent to replaying the original request.
- The Business Capability create route has no general request idempotency key in the inspected contract.
- A retry can therefore create an ambiguous duplicate or state transition, even if database uniqueness/state guards reject some repeats.

No timeout increase or retry change is approved by this source review. Before early-access traffic relies on the Free Gateway, qualify actual cold-start latency, caller timeout budgets and operation-specific idempotency. If the existing five-second contract remains, treat a sleeping Gateway as an availability failure and preserve fail-closed 503/timeout behaviour. Do not weaken authorization or route back to direct runtime SQL.

## 6. Business Capability create branch boundary

PR #300 (`feat/signed-business-capability-create`) is still a separate draft and is not merged into `main`. Its CI #5449 is reported passed in the PR description, including disposable PostgreSQL 18 qualification. The new `POST /v1/business-capabilities` Gateway route, Resource API client wiring, signed create function and manual-only privilege cutover are on that PR branch.

The current `main` Actor Gateway service source must not be described as containing that PR #300 create route until the PR is deliberately integrated. Do not deploy the PR branch as a shortcut around the production migration, backup, role/ACL and exact-head qualification gates. PR #300 remains separate from PR #298.

## 7. Safe deployment sequence — plan only

No step below is authorized for execution by this document.

1. Refresh and reconcile the exact production migration ledger/checksums through the supported administrator route; verify a fresh recoverable backup.
2. Resolve PostgreSQL bootstrap/migrator authority and provision the Gateway schema/function ACLs only through the reviewed migration chain. Do not manually grant privileges or run individual production migrations.
3. Qualify the exact `ghm_actor_gateway` login, membership shape, `session_user=current_user`, schema USAGE, function allowlist, ownership and signed assertion functions.
4. Resolve PR #300 integration deliberately if Business Capability create is part of the required first route set. Keep it draft until exact-head CI and migration ordering are reviewed.
5. Owner may then submit the already-filled single-service Render form under the previously selected Free plan; no second service. Enter/verify secrets only in Render's secret fields, never Git, chat or logs. Keep auto-deploy OFF.
6. Verify the Gateway's production startup assertions and `/healthz`, authenticated positive/negative routes, database restart/reconnect, logs and measured Free cold-start behaviour.
7. Only after Gateway qualification, configure its exact observed HTTPS origin as `GHM_ACTOR_GATEWAY_URL` and the distinct storage provider attestation secret on GHM-Internal-Runtime. Correct the build command to `npm ci --include=dev && npm run build`; deploy Resource API manually only after all production runtime identity and ACL gates pass.
8. Verify each Resource API route uses the intended Gateway and returns fail-closed responses when Gateway is unavailable. Do not revoke legacy privileges until the route-specific post-deployment migration preconditions pass.
9. Keep PayFast activation and all commercial authorization switches disabled.

## 8. Final disposition

The required environment variable **names and code contracts are now enumerated**, but their secret values and production database prerequisites are not verified. The owner-confirmed DB URL is staged in the unsubmitted form only; it is not a proven working credential. No Gateway URL exists because no Gateway service exists.

Therefore no deployment-ready configuration can be certified yet. Keep the form unsubmitted, keep auto-deploy OFF, do not change Render, do not change production SQL/roles/ACLs, keep the production migration batch manifest `[]`, keep PR #298 and #300 draft/unmerged, and keep PayFast paused. No additional paid resource is required or authorized.


## Owner correction — masked Render secrets are populated (20 November 2026)

The owner clarified after sharing the unsubmitted Render service-creation form that the masked values are deliberately populated; they are not empty.

- `GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET` is populated and intentionally concealed in the Render UI.
- `GHM_JWT_ES256_PUBLIC_KEY_PEM` is populated; the owner copied it from the existing GHM-Internal-Runtime environment.
- `GHM_JWT_ES256_KID` is populated; the owner copied it from the existing GHM-Internal-Runtime environment.
- The owner intentionally keeps secret values masked. Never ask them to disclose these values in chat, Git, logs, or handovers.
- The service remains uncreated and undeployed; the form remains unsubmitted and auto-deploy remains OFF.

This corrects the earlier wording in this document that treated masked values as potentially empty or described their presence as unknown. Presence and owner-reported provenance are established. Cryptographic validity, exact byte/PEM formatting, KID-to-key correspondence, assertion-secret encoding/length, and successful runtime verification have not been independently tested; do not describe those as verified.

The owner has already completed the environment-variable entry step. Do not repeat that task or ask them to re-enter/copy the same values. Continue with the next genuinely unfinished implementation/qualification item using existing evidence. No secret was read, revealed, changed, regenerated, or copied by the assistant.
