# Handover — Internal Runtime Reconciliation (2026-11-08)

**Record timestamp:** 2026-11-08 12:48–13:00 UTC (reconstructed retrospectively)  
**Repository baseline inspected:** `main` at `0e2c7c2181d457265a671a6f857140dd17faee97`  
**Purpose:** Restore the missing operational record for the 2026-11-07 runtime deployment and the 2026-11-08 follow-up. This is an evidence-based reconstruction, not a claim that a contemporaneous handover was maintained.

## 1. Non-negotiable operating rules

- `GHM-Internal-Runtime` (`srv-damupsek1f9s73eq8kkg`) is the sole deployment target for this runtime rollout.
- Render auto-deploy for that service must remain **disabled** (`autoDeploy=no`, trigger `off`). It is intentional. Never enable it.
- `ghm-payfast-sandbox-runtime` is a separate service and is not a deployment target or readiness indicator. The service itself was listed as not suspended (branch `main`, auto-deploy enabled); its associated free-tier PayFast sandbox database `ghm-payfast-sandbox-db` is suspended by billing and past its recorded expiry. Do not use either as the internal-runtime target/readiness indicator.
- No cherry-picking, no rewriting/updating the user's local checkout, no bulk deploys.
- Any future release rollout must be one coherent release at a time, with the exact candidate identified, deployed only after authorization, and verified before proceeding to the next release.
- Do not treat a successful build/startup as proof of full application health, migration completion, or production readiness.

## 2. Current source and runtime pointers

### GitHub

- Repository: `zaidhqdev-sys/GHM`
- `main`: `0e2c7c2181d457265a671a6f857140dd17faee97`
- Commit message: dependency security baseline refresh from PR #212; Node engine aligned with AWS SDK requirement.
- Parent: `b7883862dfa175e8ee4ba8b12fda00ce3c71d644`.
- The immediately preceding production checkpoint recorded by Render was `d6d35194bfa05c9395acc8622ed620d48222d318`.
- The comparison from that checkpoint to current `main` is a large accumulated change set (previous inspection reported 201 commits ahead). The November 7 deployment therefore advanced the service to the consolidated `main` tip; it was **not** a sequence of individually deployed and verified releases.
- A separate local baseline previously supplied by the owner was `1f23d88b23a2f54c9d77742b4f47c980b3823e65`. Nine commits were identified between that local baseline and current `main`; this is not the full gap from the deployed `d6d3519` checkpoint. Do not infer that the nine-commit list is the complete rollout history.

### Render — sole internal runtime

- Service: `GHM-Internal-Runtime`
- Service ID: `srv-damupsek1f9s73eq8kkg`
- URL: https://ghm-internal-runtime.onrender.com
- Branch: `main`
- Build: `npm ci && npm run build`
- Start: `npm start` (`node dist/server.js`)
- Health-check path configured: `/healthz`
- Region: Frankfurt; one instance; Free plan.
- Auto-deploy: **off** (`autoDeploy=no`, `autoDeployTrigger=off`) on the latest read-only service inspection.

### Latest observed deployment

| Item | Value |
|---|---|
| Deploy ID | `dep-dbnp1nou01pc73dbrki0` |
| Status | `live` / deploy event succeeded |
| Commit | `0e2c7c2181d457265a671a6f857140dd17faee97` |
| Started | 2026-11-07 20:58:10 UTC |
| Finished | 2026-11-07 20:58:31 UTC |
| Trigger | `service_updated`; event records environment updated |
| Previous deploy | `dep-dbnorgu7bikc73d51ie0`, same commit, manual, later deactivated |

The Render event record shows the latest deploy completed successfully. Logs show `npm start`, `node dist/server.js`, and “GHM Core Engine listening on port 10000”. This proves process startup and listener initialization at that time; it does **not** prove every route is healthy or that all expected database migrations are applied.

## 3. Deployment sequence discrepancy — important

Render history shows several manual deployments on November 7 before the final service-updated deployment:

- `21a64d8` / PR #208 merge at 20:24 UTC
- `80de663` / PR #210 merge at 20:27 UTC
- `d6d3519` / PR #212 merge at 20:29 UTC
- `0e2c7c2` / current `main` at 20:44 UTC (manual deployment), then again at 20:58 UTC (service-updated deployment)

The service history therefore confirms manual deploys of successive mainline tips in that window, but not a controlled per-PR release qualification/verification record for every intervening commit. The final live pointer is `0e2c7c2`. This is a factual record, not an endorsement of that rollout method. It does not satisfy the owner's stated future requirement for one coherent release at a time with verification between releases.

**Do not attempt to replay the older commits now.** That would roll the live service backward and may create source/schema incompatibility. First establish the actual database migration state through the approved owner-controlled audit path, then define a forward-only recovery/release plan.

## 4. Runtime observability — evidence and limits

### Observed application errors

The Render app log query for `GHM-Internal-Runtime` from 2026-11-07 20:50 UTC through 2026-11-08 12:45 UTC returned seven application error entries between 20:59:13 and 21:02:35 UTC on November 7. Each was emitted as:

```json
{"event":"http_request_failed","error":{"name":"error"}}
```

The error logger does not expose a useful message, stack, route, request ID, or underlying database/provider cause. The available evidence is insufficient to identify root cause. Do not speculate that these errors are caused by the dependency refresh, the schema issue, database permissions, or any particular endpoint.

A request-log query for November 8 00:00–12:45 UTC returned no request log entries. This is an absence of returned records, not proof that no requests occurred or that the service was healthy. No useful request metrics were available in the preceding inspection.

### Health verification

- Render marks the latest deployment live and the process logged that it was listening.
- The configured `/healthz` endpoint has not been independently confirmed by a successful external probe in this evidence set.
- Previous direct endpoint retrieval attempts were inaccessible from the inspection environment. An inaccessible probe is not evidence of an application outage.
- Therefore status is **process started; full HTTP/application health unverified**.

### Follow-up required

- Improve structured error logging in a separately reviewed code change: include safe error message/class, stack where appropriate, route template, request/correlation ID and safe causal metadata; never log secrets, credentials, tokens, or payment data.
- Re-run an approved external health/route smoke test and record exact time, URL/path, HTTP status, and response classification.
- Diagnose the seven observed errors using correlated application/provider/database evidence before proposing a fix. Do not patch based on the redacted log line alone.

## 5. Open pull requests relevant to this checkpoint

### PR #232 — production Business profile / founder authority schema reconciliation

- URL: https://github.com/zaidhqdev-sys/GHM/pull/232
- Branch: `fix/production-schema-reconciliation-profile-authority`
- Head: `c71ea86d72958ca8fa489100955ee36f3823ff45`
- Base: `main` at `0e2c7c2`
- Status at inspection: open, not merged, non-draft.
- CI run #2135 was reported successful; Cloudflare Pages preview succeeded at https://fix-production-schema-reconc.ghm-cu1.pages.dev.
- Proposed migration: `20261107211500_reconcile_business_profile_and_founder_authority.sql`.
- Scope described by PR: add missing nullable Business projection fields (`latitude`, `longitude`, `logo_storage_object_id`), add absent constraints/index idempotently, restore private founder-reviewer allowlist table and exact lookup function. Reviewer allowlist remains empty; no identities are seeded and no verification status is changed.
- PR explicitly says no production DB change or deployment is included; disposable PostgreSQL qualification is required before any production application.
- The PR description associates this with two reported HTTP 500s. That is the PR's stated rationale; it does not prove these schema differences caused the seven generic runtime errors above.
- **Do not merge, deploy, or apply this migration based only on CI/preview success.** First verify exact production schema and migration ledger with approved authority, complete disposable-Postgres qualification, review the diff and obtain explicit owner approval.

### PR #233 — deterministic PayFast ITN payment-date parsing

- URL: https://github.com/zaidhqdev-sys/GHM/pull/233
- Branch: `fix/payfast-payment-date-timezone-20261108`
- Head: `ea028a20967b686e90ea0fbe451a8e4b9dee57ef`
- Base: `main` at `0e2c7c2`
- Status at inspection: open, draft, not merged.
- CI run #2136 was reported successful; Cloudflare Pages preview succeeded at https://fix-payfast-payment-date-tim.ghm-cu1.pages.dev.
- Change treats timezone-less PayFast `payment_date` as UTC and preserves explicit offsets.
- PR description says local build/test was not yet run and asks for confirmation of provider timestamp convention before live payment processing.
- **Keep draft.** Do not treat preview or CI as provider-convention confirmation or authorization for payment processing/callback rollout.

## 6. Database inventory and production evidence

### Render database resources

| Resource | Database | Resource ID | State at inspection | Role in this work |
|---|---|---|---|---|
| `ghm-db` | `ghm_db` | `dpg-dag0sdtbedkc7389vi2g-a` | available | Production/internal DB |
| `ghm-payfast-sandbox-db` | `ghm_payfast_sandbox_db` | `dpg-db4416vlk1mc73eocug0-a` | suspended; billing suspender; expiry recorded 2026-11-08 01:17:15 UTC | Separate expired sandbox DB; not a deployment target/readiness signal |
| `ghm-identity-qualification-20261018` | `ghm_identity_qualification_20261018` | `dpg-dba0tu3rjlhs738fs2sg-a` | available | Separate qualification resource; not production |

### Production read-only observations from prior inspection

- `current_database() = ghm_db`.
- Query connection reported `current_user = ghm_db_user`.
- Migration ledger relation exists as `ghm.ghm_schema_migrations`; `public.ghm_schema_migrations` does not exist.
- `ghm_schema_owner` exists as NOLOGIN; `ghm_payment_provider` and `ghm_migrator` roles exist.
- SELECT on `ghm.ghm_schema_migrations` was denied to the inspection identity. Catalog evidence identifies `ghm_schema_owner` as owner; no broad grants were changed.
- The connector could not assume `ghm_schema_owner` in its read-only query session. Exact production migration ledger rows/checksums and applied migration count are therefore **unverified**.
- Runtime startup's initial `SELECT 1` only proves the startup connection succeeded at that time. It does not prove migration completion or application-level readiness.

### PayFast role / sandbox context

The November 5 operator handover records unresolved least-privilege/role-administration concerns, including the `ghm_db_user` privilege graph and an unsuccessful revocation attempt due to grantor mismatch. Treat that handover as a mandatory gate; do not infer readiness merely because `ghm_payment_provider` exists.

The separate PayFast sandbox DB is now suspended/expired according to current Render inventory. Do not query it, revive it, migrate it, point services at it, or use it as a deployment signal without a distinct owner-approved recovery decision. This does not change the status of the separate identity qualification DB.

No production migration, DDL, role/grant change, credential read, database write, payment write, or service environment change was performed during this reconstruction.

## 7. Explicitly unchanged during this reconstruction

- No merge or PR state change.
- No deploy, rollback, restart, or Render configuration change.
- No enabling of auto-deploy; it remains disabled.
- No migration, DDL, ledger write, database role/grant change, or payment write.
- No secrets or environment-variable values read.
- No local checkout change, cherry-pick, or bulk deployment.
- No change to the PayFast sandbox service or expired sandbox database.

## 8. Next actions and release gates

1. **Preserve this record and keep it current.** Update this handover after every material repo, PR, qualification, DB, Render, deployment, or verification action. Record UTC timestamp, exact ref/SHA/resource, action, outcome, evidence link/output, and what was deliberately not changed.
2. Use the owner-approved, read-only production migration audit path with an identity authorized to assume `ghm_schema_owner`. Do not broaden connector permissions or guess migration state. Capture exact ledger rows/checksums and reconcile all migrations against current `main`.
3. Separately reconcile production schema against PR #232's proposed contract using approved read-only inspection. Qualify its migration on disposable PostgreSQL and review the exact head before any owner decision.
4. Keep PR #233 draft until PayFast's documented timestamp convention is confirmed from authoritative provider documentation/evidence and local build/test plus exact-head CI are complete.
5. Diagnose the November 7 generic HTTP errors using correlated logs and a verified route/health probe. Improve logging in a separately reviewed code change.
6. Only after database/schema/role/backup/restore/network/observability gates are evidenced, prepare a forward-only release sequence. Each coherent release requires explicit authorization, one deployment to `GHM-Internal-Runtime`, and recorded verification before the next. Auto-deploy stays off.
7. Do not use the expired PayFast sandbox runtime/DB as a target or readiness signal. Keep PayFast production callback activation and settlement changes under their separate NO-GO/owner-approval gates.

## 9. Evidence sources consulted

- GitHub `main` commit metadata and compare from `d6d3519` to `main`.
- GitHub PR #232 and #233 metadata and commit lists.
- Render read-only service configuration, deploy history, service events, app logs and request logs for `srv-damupsek1f9s73eq8kkg`.
- Render read-only PostgreSQL resource inventory.
- Existing repository handovers: `docs/HANDOVER_2026-11-06_DEPENDENCY_SECURITY_REFRESH.md`, `docs/operations/payfast-production-role-provisioning-session-handover-2026-11-05.md`, and `docs/operations/handover-production-db-and-render-2026-10-24.md`.
- Existing current-state index, remaining-work register, and runtime reconciliation gate.

**Confidence discipline:** Facts explicitly labeled “observed” come from the source queries above or previously recorded operator evidence. PR descriptions are attributed to the PR, not treated as proof of production state. Any item labeled unverified remains a gate, not an assumption.



## 10. Connect HttpOnly browser-auth qualification — integrated handover context

The owner supplied the prior-session handover titled “GHM ↔ Connect HttpOnly Browser-Auth Qualification” (handover date 2026-11-08; monitoring period 2026-11-06 through 2026-11-08; last monitoring checkpoint approximately 09:45 SAST / 07:45 UTC). This is a separate but related workstream and must remain visible in the operational handover. The supplied report's repository, CI, Vercel and environment observations are **historical snapshots from that session**, not live checks made during this reconstruction.

### Status to carry forward

**NOT YET QUALIFIED**

- GHM browser-auth implementation PR #217 is merged; recorded merge SHA: 96575838319cc319e328443289bee379c9947ac2. The report records exact-head CI #42136280518 passed.
- Connect HttpOnly browser-auth BFF/proxy PR #57 is merged; recorded merge SHA: 929bb12ef15ceb17099d8a650bbe403a0fdb3b9a. The report records exact-head CI #42137215055 passed.
- Additional Connect capability PRs #65 and #66 are merged, but their separate feature flags do not activate browser-auth.
- The supplied report records GHM main checkpoint 0e2c7c2181d457265a671a6f857140dd17faee97 and Connect main checkpoint 1e92f85cdd99dea2070ede58a875cec45d5f2047. Those are historical pointers from the supplied handover, not revalidated Connect state.
- Existing native bearer-token authentication remains the active/default transport. Browser-auth must remain disabled until all isolated non-production qualification gates pass.

### Qualification gates — all remain open unless freshly evidenced

1. **Isolated GHM runtime:** owner must identify and approve the isolated non-production Render workspace/service. The supplied report explicitly says the intended workspace was not selected and live Render environment settings were not verified in that monitoring run. Do not guess or repurpose production.
2. **GHM browser-auth configuration:** configure only on the approved isolated runtime after approval: GHM_WEB_AUTH_ALLOWED_ORIGINS = exact approved Connect Preview origin(s); GHM_WEB_AUTH_COOKIE_PATH = /api/ghm; GHM_WEB_AUTH_COOKIE_MAX_AGE_SECONDS = reviewed value in the code's bounded range (60–2,592,000 seconds). Missing/invalid settings must continue to fail closed (503). No values were changed by this handover work.
3. **Connect Preview branch configuration:** on the dedicated qualification branch only, set CONNECT_WEB_ORIGIN to the exact approved Preview origin and GHM_INTERNAL_RUNTIME_URL to the isolated GHM runtime URL. The supplied prior-session report found these only on obsolete branch construction/ghm-identity-adapter-only-20261016, not on the auth branch, docs branch, or main. Treat that as historical and recheck before acting; do not copy obsolete settings.
4. **Preview-only feature flag:** VITE_GHM_WEB_AUTH_ENABLED=true only for the dedicated isolated qualification Preview build, and only after gates 1–3 pass. Never enable globally or on production.
5. **Actual Preview identity:** verify the exact merged Connect commit, current deployment ID, generated canonical Preview alias and upstream target. The supplied report's old Preview was READY but built from ff211017f5f1ce3d97ccea83179ebae91fc5bdd1, not merged PR #57 head 5024565c3151a52100ef9ae941a1bb7d19324077; therefore it did not qualify the merged implementation. The prior alias check returned 403. These observations need fresh verification.
6. **Live browser E2E:** execute the full lifecycle against the approved isolated runtime and exact Preview alias: register, login, access-token-only response (no refresh token in JSON), HttpOnly/Secure/SameSite/Path cookie attributes, refresh rotation, replay rejection, logout/server-side revocation and cookie clearing, Origin denial, bearer forwarding, and proof refresh-cookie is not forwarded to ordinary governed APIs. Include real HTTPS behavior and inspect actual browser responses/cookies. Mock/source tests alone are insufficient.
7. **Evidence and disposition:** capture exact repo SHAs, workflow runs, Render service/deploy IDs, Vercel deployment ID/alias, safe redacted HTTP/browser evidence and per-test outcomes. Do not call the integration qualified until every required test passes. If any gate fails, keep native bearer auth active and browser-auth disabled.

### Security and contract references

- GHM cookie contract: [GHM_BROWSER_AUTH_COOKIE_CONTRACT_2026-10-28.md](architecture/GHM_BROWSER_AUTH_COOKIE_CONTRACT_2026-10-28.md). This contract records browser endpoints under /api/v1/auth/web/*, exact Origin allowlisting, host-only HttpOnly cookie, Secure in production, SameSite=Lax, /api/ghm path, bounded explicit lifetime, rotation/revocation, no refresh token in JSON/storage, and no change to native bearer routes.
- GHM browser-auth implementation: [PR #217](https://github.com/zaidhqdev-sys/GHM/pull/217).
- Connect proxy implementation: [PR #57](https://github.com/zaidhqdev-sys/zaid-connect/pull/57).
- Connect migration handover referenced by the supplied report: [GHM_BACKEND_MIGRATION_HANDOVER_2026-10-13.md](https://github.com/zaidhqdev-sys/zaid-connect/blob/main/docs/06_Implementation/GHM_BACKEND_MIGRATION_HANDOVER_2026-10-13.md).

### Operational separation — do not conflate runtimes

The isolated browser-auth qualification runtime is a distinct, owner-approved non-production target that has not yet been identified in the supplied report. It is **not automatically** GHM-Internal-Runtime, and it is not ghm-payfast-sandbox-runtime. The current internal-runtime deployment findings in Sections 2–9 describe the service used for the internal runtime rollout; they do not establish that this service is approved or configured for browser-auth qualification. Do not point Connect Preview at it or enable browser-auth there without explicit owner authorization and a separately approved qualification plan. The PayFast sandbox runtime/database remains unrelated and must not be repurposed.

### Current-session actions and no-change boundary

The owner-provided prior-session report is now incorporated into this handover. This documentation reconciliation did not select a workspace, inspect or change Connect/Vercel settings, create a Preview, set any environment variable, enable a feature flag, send browser-auth requests, activate browser-auth, or perform E2E tests. All qualification gates remain open. No production action or cutover is authorized.



## 12. Fresh read-only monitoring checkpoint — 2026-11-08 12:56 UTC

This section supersedes historical statements where it records a fresh observation. It does not change any qualification or release authorization.

### Repository mainlines and exact-main CI

- GHM `main` remains `0e2c7c2181d457265a671a6f857140dd17faee97`.
  - Exact-main GitHub Actions quality check passed: [run #42412396674](https://github.com/zaidhqdev-sys/GHM/actions/runs/42412396674), head SHA `0e2c7c2`.
  - Cloudflare Pages main check completed successfully; this is a Pages build/preview check, not a Render runtime health test.
- Connect `main` remains `1e92f85cdd99dea2070ede58a875cec45d5f2047`.
  - Exact-main quality check passed: [run #42410073826](https://github.com/zaidhqdev-sys/zaid-connect/actions/runs/42410073826), exact head SHA `1e92f85`.
  - Latest Vercel production deployment is READY: `dpl_7Z7UZpoy4uDvjGhr3bnwL4wUJ1s9`, source commit `1e92f85`, URL `zaid-connect-kd5l0ikk3-zaid-technologies.vercel.app`. This verifies deployment status and source identity, not browser-auth qualification.
- **Correction to the previous handover's CI labels:** GHM run #42412230730 was triggered for PR #231's release branch head `aacd15a`, not exact GHM main. Connect run #42409999838 was triggered for feature branch head `e054be0`, not exact Connect main. The exact-main runs are #42412396674 and #42410073826 respectively.

### Browser-auth implementation and live Preview evidence

- GHM PR #217 remains merged at `96575838319cc319e328443289bee379c9947ac2`; its exact implementation-head CI #42136280518 passed on `9f90155`.
- Connect PR #57 remains merged at `929bb12ef15ceb17099d8a650bbe403a0fdb3b9a`; its exact implementation-head CI #42137215055 passed on `5024565`.
- The current Connect production deployment is on main, but its default feature gate remains off unless explicitly enabled. No browser-auth activation or cutover was performed.
- The only matching browser-auth branch Preview deployment found in the 100 most recent Vercel deployment records was `dpl_Gpn21dsc6pr7RohTajxJzyqpM3uo`, READY at alias `zaid-connect-git-feat-connect-http-onl-544a9b-zaid-technologies.vercel.app`, built from stale commit `ff211017f5f1ce3d97ccea83179ebae91fc5bdd1`. It does **not** match merged PR #57 head `5024565c3151a52100ef9ae941a1bb7d19324077`; it cannot qualify that implementation. No deployment for the merged PR #57 head was found in that query.
- Vercel project environment metadata was inspected without decrypting values. `CONNECT_WEB_ORIGIN` and `GHM_INTERNAL_RUNTIME_URL` are present only as Preview-scoped variables on obsolete branch `construction/ghm-identity-adapter-only-20261016`. No variables are present for the dedicated auth branch `feat/connect-http-only-browser-auth-proxy-20261106`. `VITE_GHM_WEB_AUTH_ENABLED` is absent from the listed project environment metadata. Production entries returned were Supabase config only. No values were decrypted or disclosed.
- The old Preview's previous 403 alias result remains historical; no successful live alias/browser E2E check was obtained in this checkpoint. The Vercel project has SSO protection enabled for deployments except custom domains; this can affect Preview access and must be included in the approved access plan.
- Browser-auth qualification remains **NOT YET QUALIFIED**. Native bearer auth remains default/active. No GHM browser-auth settings, Connect Preview variables, Vite feature flag, or runtime endpoint were changed.

### Render runtime candidate discovery — not an approval

Fresh Render inventory in the ZAID Technologies workspace returned these relevant resources:

| Service/resource | Fresh observation | Disposition |
|---|---|---|
| `GHM-Internal-Runtime` | `main`; auto-deploy `no/off`; URL `https://ghm-internal-runtime.onrender.com` | Sole internal-runtime rollout target; keep auto-deploy disabled |
| `ghm-identity-qualification` | Branch `integration/ghm-identity-merge-candidate-20261018`; auto-deploy `yes/checksPass`; latest live deploy `dep-dblk9pvb9u1s73bkaaag` from `ee91f42503e064571d57e87ed0d5cd1e9d5badd5` on Nov 4; no health-check path configured | A separate qualification candidate exists, but it has **not** been owner-approved as the browser-auth runtime. Do not select or change it by inference |
| `ghm-identity-qualification-20261018` DB | Available, separate qualification database | Not production; do not assume its service/DB pairing is approved for browser-auth |
| `ghm-payfast-sandbox-runtime` | Branch `main`; service not suspended; auto-deploy `yes/commit` | Separate PayFast sandbox service; not a target/readiness signal |
| `ghm-payfast-sandbox-db` | Suspended by billing; recorded expiry `2026-11-08T01:17:15Z` | Do not query, revive, or use for this qualification |

The obsolete Vercel Preview branch variables point `GHM_INTERNAL_RUNTIME_URL` at `https://ghm-identity-qualification.onrender.com`. This explains which old sandbox endpoint was configured on that obsolete branch; it does **not** constitute current owner approval. The Render inspection did not expose environment variable names/values for the candidate service, and no service settings were changed. The existing `ghm-identity-qualification` service has auto-deploy enabled on its candidate branch; do not repurpose or change it without explicit approval.

### PR and handover checks

- GHM PR #232 remains open, non-draft, mergeable; exact-head CI #2135 passed on `c71ea86`. No migration or production application authorized.
- GHM PR #233 remains open and draft; exact-head CI #2136 passed on `ea028a2`, but the PR body still records local build/test not run and PayFast timestamp semantics awaiting provider confirmation. Keep draft.
- GHM PR #234 (this handover) remains open and unmerged. Its current head at this checkpoint is `133a5515d5b2f2174eadd6435e08e60eb1ad6987`; exact-head quality run #42482443120 passed and Cloudflare Pages preview succeeded at [the handover branch preview](https://docs-handover-2026-11-08-run.ghm-cu1.pages.dev). These checks qualify the documentation change only, not any runtime.
- GHM PR #221 remains open and is based on stale main checkpoint `c1dc451`; do not assume its cleanup instructions reflect current refs without refresh.
- Connect PR #59 remains open, based on stale main checkpoint `c140aca`; its modified handover is historical and needs reconciliation before being treated as current.
- Connect PR #33 remains a separate draft PayFast sandbox bridge with its own explicit blockers; it is not browser-auth qualification.

### No-change confirmation

All checks in this section were read-only. No PR was merged, no branch deleted, no Render/Vercel setting or environment variable changed, no feature flag enabled, no deployment/restart triggered, no DB queried for writes, no migration run, no credential decrypted, and no browser-auth request or E2E flow executed. The user's local checkout was not accessed or modified.

## 13. Publication and review trail

- Retrospective handover branch: `docs/handover-2026-11-08-runtime-reconciliation`, based on GHM `main` `0e2c7c2181d457265a671a6f857140dd17faee97`.
- Documentation PR: [#234](https://github.com/zaidhqdev-sys/GHM/pull/234), open and unmerged at this checkpoint.
- Exact PR head `133a5515d5b2f2174eadd6435e08e60eb1ad6987`: GitHub Actions quality check #42482443120 and Cloudflare Pages check both completed successfully.
- The integrated Connect browser-auth section was added after the owner supplied the previous-session handover; Section 12 now records fresh read-only cross-repository/Render/Vercel monitoring.
- This record is retrospective. Future monitoring sessions must append dated evidence as each material action occurs; do not rewrite history or label unverified gates as passed.


## 14. Retrospective activity ledger — work completed before the handover gap was discovered

This section reconstructs the work performed in the current chat before the owner identified that the handover had not been kept current. It is deliberately an activity ledger, not a claim that every underlying feature is production-qualified. It combines the available conversation record, repository/PR history and read-only connector observations. Where an exact command transcript or contemporaneous timestamp is unavailable, the item is described at the level supported by the evidence.

### A. Internal runtime rollout and deployment investigation

The following work was already performed and should **not be repeated from scratch**:

1. Identified and reaffirmed `GHM-Internal-Runtime` (`srv-damupsek1f9s73eq8kkg`) as the sole target for the internal runtime rollout. Re-read its Render configuration: main branch, build `npm ci && npm run build`, start `npm start`, health path `/healthz`, Frankfurt, one instance, and auto-deploy disabled. The owner explicitly requires auto-deploy to stay disabled.
2. Inspected Render deployment history and service events for November 7. Recorded the successive mainline deploy pointers `21a64d8` (PR #208), `80de663` (PR #210), `d6d3519` (PR #212), then `0e2c7c2` manually and again through the service-updated event. The current live deploy is `dep-dbnp1nou01pc73dbrki0` at `0e2c7c2181d457265a671a6f857140dd17faee97`; the earlier same-SHA manual deploy was `dep-dbnorgu7bikc73d51ie0`. The history does not contain proof of a per-PR verification gate between every deployment.
3. Compared the prior recorded live checkpoint `d6d35194bfa05c9395acc8622ed620d48222d318` to current main and identified an accumulated 201-commit difference. Separately reconciled the owner's supplied local baseline `1f23d88b23a2f54c9d77742b4f47c980b3823e65` to main as nine tail commits. Explicitly recorded that the nine-commit list is not the full 201-commit delta.
4. Identified the nine commits after the supplied local baseline: `520f698` dependency advisories; `2cfdbce` authorized Opportunity create API; `bdf76f9` Business summary in Project Quote reads; `28e5ca5` atomic customer Project + linked Opportunity; `0465c89` paginated customer Project list; `42eb752` public Project marketplace search; `e7a51d7` PayFast settlement identity isolation; `b788386` authenticated Opportunity marketplace reads; `0e2c7c2` dependency baseline refresh. This is a reconciliation reference only, not an instruction to cherry-pick or replay commits.
5. Reviewed startup evidence. Render logs showed `npm start`, `node dist/server.js`, and “GHM Core Engine listening on port 10000”. Correctly limited the conclusion to successful process/listener startup and a startup DB `SELECT 1`; did not claim all routes healthy or migrations complete.
6. Reviewed application logs and request logs for the internal runtime. Recorded seven generic `http_request_failed` entries between 20:59 and 21:02 UTC on November 7, each with only `error.name = error`; the logger suppresses the underlying message/stack/route. The subsequent request-log query returned no entries, which was not treated as proof of no traffic or health. External `/healthz`/ `/readyz` confirmation remained unavailable; no outage conclusion was inferred.
7. Preserved the user's explicit correction that the PayFast sandbox service is separate. Later fresh inventory distinguished the service (not suspended, auto-deploy enabled) from its associated expired/suspended PayFast sandbox DB. Neither is the internal-runtime deployment target or readiness signal.

### B. GitHub release, PR and code-history work already reviewed

1. Reviewed merged dependency-security PR #231 and its relationship to the earlier #222 construction work. PR #231 merged as `0e2c7c2`; it is a package/dependency refresh, not a reason to replay the full accumulated history.
2. Reviewed merged PR #230 (authenticated paginated Opportunity marketplace read APIs; commit `b788386`) and the earlier merged PRs #228 (atomic Project + Opportunity creation), #229 (PayFast settlement identity reconciliation) and #231. These are already on main; do not recreate or cherry-pick their changes.
3. Reviewed open PR #232 (Business profile/founder authority schema reconciliation): exact head `c71ea86d72958ca8fa489100955ee36f3823ff45`, CI #2135 passed and Cloudflare preview succeeded. Its migration remains proposed only; no production migration/deploy or reviewer identity seed was performed. Disposable PostgreSQL qualification and exact production schema/ledger review remain gates.
4. Reviewed open draft PR #233 (PayFast ITN timezone-deterministic payment-date parsing): exact head `ea028a20967b686e90ea0fbe451a8e4b9dee57ef`, CI #2136 passed and Cloudflare preview succeeded. Its authoring notes still require local build/test and authoritative confirmation of the provider's timezone-less timestamp convention. Keep it draft; do not enable payment processing based on CI.
5. Reviewed existing documentation/reconciliation PR #221 and its stale base divergence. It is not a substitute for this dated handover; refresh against current main before relying on it.
6. Reviewed prior PayFast production and role-provisioning handovers. The recorded production NO-GO gates remain applicable: least-privilege role graph, provider-role administration, migration ledger and full pending set, backup/restore, network plan, callback cutover approval. Do not repeat role provisioning or attempt privilege changes.

### C. Production database inspection already completed

1. Queried Render database inventory read-only and distinguished production `ghm-db`, the separate identity qualification database, and the expired PayFast sandbox database.
2. Queried the production database read-only. Confirmed database `ghm_db`, effective query identity `ghm_db_user`, schema-qualified migration ledger `ghm.ghm_schema_migrations`, absence of `public.ghm_schema_migrations`, and presence of roles `ghm_schema_owner`, `ghm_payment_provider`, and `ghm_migrator`.
3. Attempted only the permitted ledger SELECT. PostgreSQL denied access to the protected table; catalog evidence showed owner `ghm_schema_owner`. The read-only connector could not assume that role in its single-statement session. No grants or memberships were changed and no privilege workaround was attempted.
4. Established that startup `SELECT 1` is not evidence that all migrations are applied. The exact production migration ledger rows/checksums and applied count remain unverified until an owner-approved migration-owner audit path is available.
5. Recorded the November 5 PayFast role graph concerns from the existing handover. No attempt was made to repeat the failed revocation or change production role attributes/grants.

### D. Existing handover and architecture material reviewed

The current chat reviewed or used the following committed references as context: `docs/HANDOVER_2026-11-06_DEPENDENCY_SECURITY_REFRESH.md`, `docs/HANDOVER_2026-11-04_PAYFAST_PRODUCTION.md`, `docs/operations/payfast-production-role-provisioning-session-handover-2026-11-05.md`, `docs/operations/handover-production-db-and-render-2026-10-24.md`, `docs/GHM_CURRENT_STATE.md`, `docs/GHM_REMAINING_WORK_REGISTER_2026-10-05.md`, and `docs/architecture/RUNTIME_RECONCILIATION_GATE.md`. Some older files contain historical Render auto-deploy settings; the fresh November 8 service inspection supersedes those for the current service setting. Do not reread all history as if no review had occurred; use the specific unresolved gates below and refresh only evidence that can have changed.

### E. Browser-auth qualification handover received and integrated

The owner supplied a complete previous-session handover for GHM ↔ Connect HttpOnly Browser-Auth Qualification. Its merged implementation history, qualification gates, native bearer-auth default, Preview mismatch and no-change rules are incorporated in Section 10. Fresh cross-repository/Vercel/Render checks are recorded in Section 12. This is an independent workstream from the internal-runtime release.

### F. Work completed in this repair pass

1. Created the retrospective integrated handover on branch `docs/handover-2026-11-08-runtime-reconciliation`.
2. Added the browser-auth prior-session report and updated the GHM current-state index.
3. Rechecked both repositories' main SHAs and exact-main CI; corrected misattributed workflow run numbers.
4. Rechecked Connect Vercel deployment history and branch-scoped environment metadata without decrypting values; identified the stale browser-auth Preview SHA and obsolete-branch-only variables.
5. Rechecked Render workspace resources and distinguished the unapproved identity qualification candidate from the approved internal runtime and PayFast sandbox.
6. Refreshed the handover and PR description with the monitoring findings. Latest PR #234 head at this checkpoint is `ad6950b125bc4a06c2a5675a10c6a642991a4b17`; its quality check #42482817525 and Cloudflare Pages preview both passed. This validates the documentation PR head only.

### G. Resume checklist — do not repeat completed investigations

Start from this list and refresh only items that can change:

- [ ] Check whether PR #234 has been reviewed/merged since this checkpoint; do not merge it without the owner's explicit direction.
- [ ] If PR #234 is still open, use its current branch/head and this handover; do not recreate a second handover PR.
- [ ] For internal runtime, inspect only new Render deploys/events/logs since `dep-dbnp1nou01pc73dbrki0`, and verify current auto-deploy remains off. Do not replay older deployments or repeat the full 201-commit comparison unless main/live SHA changed.
- [ ] Obtain owner-approved access for the protected production migration ledger; until then, do not repeat the denied SELECT or change grants.
- [ ] For PR #232, complete only the outstanding exact-schema/ledger comparison and disposable PostgreSQL qualification; do not re-author its already proposed migration.
- [ ] For PR #233, obtain authoritative PayFast timestamp semantics and complete its stated local validation; do not treat prior CI/preview as sufficient.
- [ ] For browser-auth, first obtain explicit approval of the isolated runtime and canonical Preview target. Do not copy obsolete branch variables, repurpose `ghm-identity-qualification`, create a new Preview or enable the flag until authorized.
- [ ] Once authorized, deploy the merged Connect PR #57 commit to the dedicated Preview and run the outstanding live browser E2E matrix. The existing stale Preview and source tests do not satisfy this.
- [ ] Keep PayFast production settlement/callback NO-GO gates separate from browser-auth and internal-runtime work.

### H. Completeness and provenance limitation

This reconstruction uses the messages and repository/tool evidence retained in the current chat context. It cannot recover any chat messages or external actions not present in that context. It records what can be substantiated and deliberately avoids inventing missing command transcripts, user approvals, live tests, or deployment verifications. If the owner identifies a specific omitted activity, append it as a dated correction rather than rewriting this record as if it had been contemporaneous.
