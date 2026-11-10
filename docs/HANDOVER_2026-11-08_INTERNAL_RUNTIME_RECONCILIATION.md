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
- Earlier PR head `ad6950b125bc4a06c2a5675a10c6a642991a4b17`: GitHub Actions quality check #42482817525 and Cloudflare Pages check both completed successfully. That head was superseded by the completed-work ledger update.
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


### Publication update — 2026-11-08 13:02 UTC

- Added Section 14, “Retrospective activity ledger”, covering the work completed before the handover gap was discovered and a resume checklist to prevent duplicate work.
- Updated `docs/GHM_CURRENT_STATE.md` to index the completed-work ledger.
- Latest PR #234 head: `6b640c285cdc1bde3617eebe17c30a2a9639c851`.
- Latest Cloudflare Pages check for that head was still building at the time of inspection. Refresh exact-head checks before considering the documentation PR ready.
- GitHub PR metadata reported `mergeable=false` at this inspection; the reason was not established. Do not merge or try to resolve it by rebasing/rewriting without reviewing the exact diff and base status.


## 15. Follow-on qualification checkpoint — 2026-11-08 13:07 UTC

This section records additional work performed after the completed-work ledger was added. It supersedes earlier statements that PR #232's disposable PostgreSQL migration qualification was still outstanding.

### PR #232 — disposable PostgreSQL migration qualification is now verified

- PR #232 remains open, non-draft, mergeable, based on the exact current production source checkpoint `0e2c7c2181d457265a671a6f857140dd17faee97`.
- Exact head remains `c71ea86d72958ca8fa489100955ee36f3823ff45`.
- Exact-head GitHub Actions quality run #2135 (`42415152336`) passed.
- Inspected the workflow definition at that exact head. It provisions a fresh PostgreSQL 18 service database, creates isolated `ghm_schema_owner`, `ghm_migrator`, `ghm_runtime` and `ghm_payment_provider` roles, runs `npm run build`, then executes `npm run migrate` under the migration connection before running the full test suite and additional database/runtime qualifications.
- Inspected the completed job steps: “Apply all migrations to disposable PostgreSQL” and “Test suite” both succeeded. This run checked out the PR head, so the proposed `20261107211500_reconcile_business_profile_and_founder_authority.sql` was part of the migration set applied in the disposable database.
- This is materially stronger than the source-only contract test and satisfies the PR's disposable PostgreSQL migration qualification gate. It does **not** prove production schema/ledger alignment or authorize production migration.

### Production schema catalog — read-only recheck

A new read-only catalog query against production `ghm-db` (`ghm_db`) returned only the existing `ghm.ghm_schema_migrations` ledger object (owned by `ghm_schema_owner`) from the requested object set. It returned no matching rows for:
- `ghm.business.latitude`
- `ghm.business.longitude`
- `ghm.business.logo_storage_object_id`
- `ghm.directory_listing_founder_reviewer`
- `ghm.is_directory_listing_founder_reviewer(bigint)`

This corroborates that the reconciliation objects targeted by PR #232 are currently absent in the production catalog. The query was read-only. It did not inspect migration-ledger rows because the previously recorded permission denial remains in force.

### PR #232 disposition and remaining production gates

- The PR's disposable PostgreSQL qualification is now **PASS**; do not repeat it unless the PR head or migration changes.
- The production catalog absence is confirmed, but the protected migration ledger contents/checksums and full pending migration set remain unverified.
- The historical PayFast role graph concern, approved migration-owner execution path, production backup/restore evidence and explicit production change approval remain separate safety gates.
- No PR was merged, no production migration run, no Render deployment triggered, no grant changed, and no reviewer identity seeded in this checkpoint.
- Do not describe PR #232 as production-applied. Do not merge or apply it solely because disposable CI passed; follow the repository's approval policy and obtain the required production change authorization.

### PR #234 documentation status

- Latest head at this checkpoint: `0d2ef375d25e17a84566d9d1c5dfe9ee1b828c81`.
- GitHub compare against `main` reports 11 commits ahead, zero behind; the PR is reported mergeable with clean merge state.
- Its Cloudflare Pages check was still in progress at the last check. A GitHub workflow-run endpoint returned 404, so do not infer that check passed from the absence of a failure.


## 16. Further production precondition and deployment checkpoint — 2026-11-08 13:10 UTC

### PR #232 migration dependencies checked against production catalog

A follow-up read-only catalog query confirmed the migration's referenced base relations and key types exist:

- `ghm.business` exists; `ghm.business.id` is bigint.
- `ghm.storage_object` exists; `ghm.storage_object.id` is bigint, matching the proposed `logo_storage_object_id bigint` foreign key.
- `ghm.account_identity` exists; `ghm.account_identity.id` is bigint, matching the proposed reviewer table foreign keys.
- Existing Business and storage-object constraints were returned by PostgreSQL and catalogued; the three target Business columns and founder-reviewer table/function remain absent as recorded in Section 15.

This reduces uncertainty about the migration's base-table/FK prerequisites. It does not prove all migration preconditions or ledger history; full production execution remains gated by migration-owner access and ledger reconciliation.

### Migration runner authority — why production execution is still blocked

Reviewed `src/db/migrate.ts` and `scripts/forensic-migration-reconciliation.mjs` on current `main`:

- The migration runner requires `GHM_MIGRATOR_DATABASE_URL`, then executes `SET ROLE ghm_schema_owner`.
- It explicitly verifies `current_user = ghm_schema_owner`, `session_user = ghm_migrator`, and the approved database name before proceeding.
- It takes an advisory transaction lock, reads every applied migration version/checksum, checks checksum compatibility, and applies every pending repository migration in timestamp order within a transaction.
- The forensic audit independently requires a read-only transaction, verifies the same migrator/schema-owner authority chain, and compares the full repository migration set against the production ledger, including missing, extra, checksum/name mismatches, and registered historical exceptions.

The Render query connector's production session was `ghm_db_user` and could not read the owner-protected ledger. It is not the supported migration execution identity. Do not attempt `npm run migrate`, hand-run the new SQL, grant extra ledger permissions, or bypass the role checks from the application identity. Obtain the approved `ghm_migrator`/schema-owner path and complete the forensic audit first. The full pending migration set may contain more than PR #232's migration; never assume running this one file is sufficient.

### Internal runtime — current pointer reconfirmed

Fresh Render read at 13:10 UTC reconfirmed:

- `GHM-Internal-Runtime` remains on branch `main`, auto-deploy `no/off`, service not suspended.
- Latest live deployment remains `dep-dbnp1nou01pc73dbrki0` at `0e2c7c2181d457265a671a6f857140dd17faee97`.
- No new deploy has appeared after the November 7 deployment. The older same-SHA manual deploy remains deactivated.
- No deploy was triggered by this checkpoint.

### Documentation PR #234 current checks

- Latest head: `b2eeb1e475b2b0fc54d85e133517d8c530a2a432`.
- GitHub reports mergeable; Cloudflare Pages check passed.
- Exact-head GitHub Actions quality check #42483424044 was still in progress at the last inspection.
- PR #234 remains open and unmerged. It is documentation-only and does not alter the runtime or production database.


## 17. PayFast timestamp semantics check — 2026-11-08 13:12 UTC

Checked PayFast's official developer documentation while reviewing draft PR #233:

- The official ITN documentation lists the transaction-notification fields and sample payload, but does not define a timezone or UTC interpretation for the `payment_date` field: https://developers.payfast.co.za/docs/itn-instant-transaction-notification/
- The separate PayFast API documentation specifies an optional offset/default GMT+2 for its API request `timestamp` field: https://developers.payfast.co.za/api. This is a different field and protocol; it is not evidence of the timezone convention for ITN `payment_date`.
- Therefore the official documentation inspected does **not** confirm that timezone-less ITN `payment_date` values should be interpreted as UTC. It also does not confirm that they should be interpreted as GMT+2.
- PR #233's deterministic UTC behavior may be technically deterministic, but its provider compatibility assumption remains unverified. Keep PR #233 draft and do not enable live processing based on this search. Obtain written PayFast support confirmation or a provider-generated ITN sample with a known transaction instant before deciding the interpretation.


## 18. PR #232 merged — 2026-11-08 13:11 UTC

<badge>Source change merged; production migration/deployment NOT performed</badge>

The user explicitly authorized merging PR #232 into `main` only, with Render auto-deploy left disabled and no production migration or deployment.

- Pre-merge revalidation: PR #232 open, non-draft, mergeable/clean; base exactly `0e2c7c2181d457265a671a6f857140dd17faee97`; head exactly `c71ea86d72958ca8fa489100955ee36f3823ff45`.
- Exact-head quality check #2135 passed, including disposable PostgreSQL 18 migration application and full test suite. Cloudflare Pages check passed.
- Merge completed using GitHub merge commit strategy, with expected head SHA guard.
- Merge commit: `69bb0c832273c49552fe6f6f97d2e56e21c60222`.
- New GHM main SHA: `69bb0c832273c49552fe6f6f97d2e56e21c60222`.
- PR #232 is closed/merged.
- Immediate Render deploy inventory check confirms `GHM-Internal-Runtime` is **still live on the previous SHA** `0e2c7c2181d457265a671a6f857140dd17faee97`, deployment `dep-dbnp1nou01pc73dbrki0`. No deployment for the merge commit exists. Auto-deploy remains disabled.
- No production SQL was executed, no database state changed, no reviewer identities were seeded, no feature flags or Render settings were changed.

**Interpretation:** the reconciliation migration is now part of source `main`, but it has not been applied to production. The runtime is intentionally still at the prior SHA. Do not call this migration deployed/applied or treat the schema as reconciled. Before a production rollout, first obtain the supported `ghm_migrator` → `ghm_schema_owner` path, run the forensic migration audit over the complete repository migration set, review all pending migrations/checksums and exceptions, and obtain explicit production migration/deployment approval. Then preserve the user's one-release-at-a-time verification policy. Do not enable auto-deploy.


## 19. Post-merge mainline and handover PR reconciliation — 2026-11-08 13:14 UTC

### Mainline CI after PR #232

Fresh exact-commit checks for main `69bb0c832273c49552fe6f6f97d2e56e21c60222` completed successfully:
- GitHub Actions `quality`: success (run `42483776948`).
- Cloudflare Pages: success (run `128741176233`).

This confirms source CI for the merged mainline commit. It does not constitute a production deployment or migration.

### Documentation PR #234 is stale and must not be merged as-is

After PR #232 merged, compared PR #234's head `f4edc220c3e2a8de7d8fcb0bd3e72f284c13aeb1` with new main:
- PR #234 base SHA is still the old `0e2c7c2` checkpoint.
- GitHub compare reports 19 commits ahead and 4 behind, diverged, merge base `0e2c7c2`.
- Although its current head checks passed (Cloudflare Pages and quality), the branch was built before PR #232 merged and is no longer an appropriate merge candidate.
- Do not rebase/merge this old documentation branch or replay its commits. A fresh documentation branch has been created directly from new main `69bb0c8` to carry forward the integrated record without the stale divergence. The original PR #234 remains open for historical traceability; it is superseded by the fresh documentation PR.

### New mainline-based handover branch

- Branch: `docs/handover-2026-11-08-mainline-reconciled`.
- Starting point: exact current main `69bb0c832273c49552fe6f6f97d2e56e21c60222`.
- This is documentation-only. It carries the handover and current-state index onto the new mainline base and appends this checkpoint.
- It does not modify application code, migrations, runtime settings or production data.

## 20. Production role graph — fresh read-only privilege recheck — 2026-11-08 13:14 UTC

A read-only PostgreSQL catalog query was run against production `ghm-db` / `ghm_db`. No role grants, passwords, settings or database rows were changed.

### Observed role attributes

- `ghm_db_user`: LOGIN, CREATEDB, CREATEROLE, not superuser, INHERIT true.
- `ghm_app_user`: LOGIN, no CREATEDB/CREATEROLE, member of `ghm_db_user` with INHERIT true and SET ROLE allowed.
- `ghm_migrator`: LOGIN, INHERIT false; CONNECT to `ghm_db` is effective.
- `ghm_schema_owner`: NOLOGIN; CONNECT to `ghm_db` is effective.
- `ghm_payment_provider`: LOGIN, INHERIT false.

### Observed membership edges

- `ghm_app_user` is a member of `ghm_db_user` (SET allowed; INHERIT true).
- `ghm_db_user` has ADMIN OPTION memberships granted by `postgres` for `ghm_migrator`, `ghm_payment_provider`, `ghm_schema_owner`, and `ghm_runtime`; these edges have SET false and INHERIT false.
- `ghm_migrator` is a member of `ghm_schema_owner` with SET allowed, INHERIT false, and no ADMIN OPTION.
- `ghm_db_user` is also member of `ghm_runtime` (SET allowed/INHERIT true on one edge, plus a separate ADMIN OPTION edge).

### Security implication and gate

The app login's SET-capable membership in `ghm_db_user`, combined with `ghm_db_user`'s CREATEDB/CREATEROLE attributes and ADMIN OPTION on privileged role memberships, is a material privilege-boundary concern. The fact that the app login does not itself show CREATEDB/CREATEROLE does not make this safe: it can assume the member role, and the intermediary role can administer several sensitive role memberships. The role graph requires owner/security review and a least-privilege remediation plan before production migration or payment-provider activation. Do not attempt role revocation or alteration through the Render query tool; the prior grantor mismatch and protected ownership are unresolved.

The role catalog also confirms that the intended migration role path exists structurally: `ghm_migrator` can SET ROLE `ghm_schema_owner` and has database CONNECT. This does **not** prove that the approved `GHM_MIGRATOR_DATABASE_URL` credential is configured or available, that the migration ledger is reconciled, or that the role graph is approved. Do not fetch, print, copy or expose secrets. Obtain the owner-approved execution path and complete the forensic read-only ledger audit before considering migration.

### Current decision

- No production migration.
- No manual SQL application.
- No grants/revokes or role changes.
- No callback/payment activation.
- No Render deploy or auto-deploy change.
- Keep the production migration gate BLOCKED until the role graph is reviewed/remediated, the full ledger audit passes under the intended migration identity, and explicit owner approval is recorded.


## 21. Deployment decision and migration-runbook reconciliation — 2026-11-08 13:20 UTC

### Does documentation merge `458f3d7` need to be deployed?

**No. Do not deploy `458f3d7` to `GHM-Internal-Runtime`.**

- `458f3d7019c5732b22316c906307a69fd5a34a66` is the documentation-only merge of PR #235.
- It changes the handover and current-state documentation; it is not an application/runtime release.
- The permanent handover is already present in GitHub `main`; deploying it is unnecessary to preserve the record.
- Keep `GHM-Internal-Runtime` on its currently approved live deployment until a separately reviewed application release is selected and explicitly authorized. Keep Render auto-deploy disabled.
- No deployment was triggered in response to the user's "proceed" instruction. This instruction did not authorize a runtime deployment; the question was whether the user needed to deploy the docs commit, and the correct answer is no.

### Important distinction discovered in the PostgreSQL role-separation runbook

Reviewed current `main` versions of:
- `docs/architecture/POSTGRES_ROLE_SEPARATION_RUNBOOK.md`
- `docs/architecture/GHM_LEGACY_ROLE_REMEDIATION_AUDIT.md`
- `scripts/forensic-migration-reconciliation.mjs`
- `scripts/audit-legacy-role-remediation.mjs`

The runbook is explicitly a **construction record**. It says the dedicated `ghm_migrator` → `ghm_schema_owner` path and forensic ledger reconciliation were qualified on the construction PostgreSQL database, and explicitly states production Supabase was unchanged. It also says bootstrap cleanup remains open and the legacy `ghm_app_user` → `ghm_db_user` authority path remains.

This historic construction qualification must not be mistaken for qualification of the current Render `ghm-db` target. It does not establish that the production/internal Render database has the approved `GHM_MIGRATOR_DATABASE_URL`, the same verified role graph, or a reconciled live migration ledger.

The forensic script itself is deliberately read-only: it opens `BEGIN READ ONLY`, verifies `current_user=ghm_migrator`, `session_user=ghm_migrator`, expected database `ghm_db`, then performs `SET ROLE ghm_schema_owner` and compares every repository migration against the live ledger plus retained-history and checksum exceptions. Its verdict is false if authority, missing migrations, unrecognized extras, name/checksum mismatches, orphaned exceptions or invalid retained history are found. It is an audit, not a migration executor.

The legacy-role audit script is also explicitly non-mutating. It inventories role attributes, direct/transitive membership, object ownership and privileges, and emits `DO_NOT_MUTATE_LEGACY_ROLES_FROM_THIS_AUDIT`. Its documented remediation prerequisites include proving runtime/migration/recovery dependencies, preserving legacy users, inventorying ownership, approving a canonical least-privilege target, and only then planning a separately authorized mutation slice.

### Reconciled production role finding

The fresh read-only Render catalog query in Section 20 is consistent with the runbook's documented unresolved bootstrap memberships and legacy path. It is a real authority concern, but not an invitation to revoke anything. The runbook explains why `ghm_db_user` cannot clean up bootstrap memberships granted by `postgres`; an independent provider/bootstrap authority path is needed. Do not improvise revokes through the current query connector.

### Next safe sequence

1. Keep `458f3d7` in GitHub only; no deployment required.
2. Confirm the intended migration credential path exists for the actual Render `ghm-db` resource without exposing secret values. Do not infer it from the construction runbook or role existence alone.
3. Obtain owner/provider confirmation of the correct authority path and review the legacy-role remediation plan. No role mutation is authorized.
4. Run the repository's read-only forensic reconciliation script against the actual Render `ghm-db` using the approved migration identity, with expected database `ghm_db`. Capture identity, ledger counts, exact/legacy checksum matches, retained history, exceptions, missing/extra migrations and final verdict. Do not proceed if any unexplained mismatch exists.
5. Separately prove which runtime identity the deployed service actually uses and whether it depends on the legacy role path. Do not infer runtime identity from the query connector's login.
6. Only after these gates, prepare a complete pending-migration review and request explicit authorization for a production migration. Migration, deployment and role remediation are separate approvals.

**No action in this section changed Render, PostgreSQL, GitHub application code, secrets, feature flags, or the live runtime.**


## 22. Fresh Render production read-only audit checkpoint — 2026-11-08 13:23 UTC

### Render service and deploy boundary rechecked

Fresh Render service metadata for `GHM-Internal-Runtime` confirms:
- Service `srv-damupsek1f9s73eq8kkg`, branch `main`.
- `autoDeploy=no`, `autoDeployTrigger=off`.
- Build `npm ci && npm run build`; start `npm start`; health path `/healthz`.
- Latest deployment remains `dep-dbnp1nou01pc73dbrki0`, live on `0e2c7c2181d457265a671a6f857140dd17faee97`, created 2026-11-07 20:58:08 UTC and finished 20:58:31 UTC.
- No deployment of documentation commits `458f3d7` or the docs follow-up was triggered.

### Actual Render `ghm-db` query identity

A fresh read-only query against Render Postgres resource `dpg-dag0sdtbedkc7389vi2g-a` (`ghm_db`) returned:
- `session_user = ghm_app_user`
- `current_user = ghm_db_user`
- `transaction_read_only = on`

This is important: the connector's query session is not running as `ghm_migrator`. It has assumed `ghm_db_user` from the application login. This is not the approved dedicated migration identity and cannot be used to claim a forensic migration audit.

### Live migration-ledger access

Catalog inspection of `ghm.ghm_schema_migrations` confirms:
- Owner: `ghm_schema_owner`.
- Current query role `ghm_db_user` does not have SELECT privilege (`has_table_privilege(..., 'SELECT') = false`).

The actual migration ledger therefore remains unreadable through the current Render read-only query connection. The prior permission-denied result is consistent with the ownership and ACL catalog evidence. No attempt was made to bypass the boundary or alter grants.

### Fresh role membership edges

Read-only `pg_auth_members` inspection reconfirmed:
- `ghm_app_user` → `ghm_db_user`: SET true, INHERIT true, ADMIN false; grantor `postgres`.
- `ghm_db_user` → `ghm_migrator`: SET false, INHERIT false, ADMIN true; grantor `postgres`.
- `ghm_db_user` → `ghm_schema_owner`: SET false, INHERIT false, ADMIN true; grantor `postgres`.
- `ghm_db_user` → `ghm_payment_provider`: SET false, INHERIT false, ADMIN true; grantor `postgres`.
- `ghm_db_user` → `ghm_runtime`: one SET/INHERIT-capable edge granted by `ghm_db_user`, plus a separate ADMIN edge granted by `postgres`.
- `ghm_migrator` → `ghm_schema_owner`: SET true, INHERIT false, ADMIN false; grantor `ghm_db_user`.

This shows the intended `ghm_migrator` → `ghm_schema_owner` SET path exists in the catalog, but the query connection cannot become `ghm_migrator`: its `ghm_db_user` membership has SET=false. The role path's existence is not proof of credential availability or approval.

### Precise remaining blocker

The Render connector exposes a read-only query operation under its configured database login, but no supported operation to retrieve the service's environment-variable names/values or execute the repository Node audit script under a separate migration connection. Do not attempt to retrieve or expose secret values.

Therefore the next evidence must come from the owner-approved migration execution context:
1. Confirm privately in Render that `GHM_MIGRATOR_DATABASE_URL` is configured for the intended approved execution context (do not paste or reveal its value).
2. Run `scripts/forensic-migration-reconciliation.mjs` in that context with `GHM_MIGRATION_AUDIT_DATABASE=ghm_db`, ensuring its output proves `current_user=ghm_migrator`, `session_user=ghm_migrator`, then `SET ROLE ghm_schema_owner`.
3. Capture the script's full PASS/INVESTIGATE verdict and every migration count/mismatch category. It performs a READ ONLY transaction and rollback; it does not apply migrations.
4. Separately verify the deployed runtime's actual DB identity and dependency path.
5. Escalate the bootstrap memberships granted by `postgres` to the database provider/owner for a separately approved remediation plan. Do not revoke or alter them using `ghm_db_user`.

No production database mutation, deployment, environment update, role/grant change or secret access occurred in this checkpoint.


### Owner-run Render ghm-db forensic migration reconciliation — 2026-11-08 13:29 UTC

**Execution record (completed):** The owner ran the repository's read-only forensic reconciliation script from a fresh temporary clone, without touching the existing `C:\\GHM-main` checkout.

- Temporary clone: `C:\\Users\\zaidh\\AppData\\Local\\Temp\\GHM-migration-audit-61e0a61b314e411d89ddb39d8b6e33d2` (owner-provided terminal output).
- Clone command targeted `zaidhqdev-sys/GHM`, branch `main`; exact audited source SHA: `458f3d7019c5732b22316c906307a69fd5a34a66`.
- `npm ci` completed: 166 packages added; npm reported 0 vulnerabilities. npm emitted an `allow-scripts` warning that the `argon2@0.41.1` install script had not been approved; no approval command was run as part of this audit.
- Owner supplied `GHM_MIGRATOR_DATABASE_URL` through PowerShell's hidden SecureString prompt. The URL/credential is intentionally not recorded. The script targeted `ghm_db` with `DATABASE_SSL=true`.
- Script: `scripts/forensic-migration-reconciliation.mjs`. It completed its read-only transaction and returned exit code **2**, verdict **INVESTIGATE**. This is a completed audit, not a PASS and not permission to migrate.

**Database authority gate — PASS:**
- Expected database `ghm_db`; actual `current_database=ghm_db`.
- `session_user=ghm_migrator`, `current_user=ghm_migrator` before role switch.
- `can_set_schema_owner=true`; after `SET ROLE`, `current_user=ghm_schema_owner`, while `session_user` remains `ghm_migrator`.
- `read_only_transaction=true`. Script rolls back; no migration, DDL, ledger write, role/grant change, or application data mutation was performed.

**Migration reconciliation results:**

| Measure | Result |
|---|---:|
| Repository migrations | 89 |
| Live ledger entries | 89 |
| Canonical checksum matches | 9 |
| Supported legacy-CRLF checksum matches | 62 |
| Approved historical checksum matches | 9 |
| Repository migrations missing from live ledger | 9 |
| Extra live ledger entries | 9 |
| Unexplained checksum mismatches | 0 |
| Name mismatches | 0 |
| Unrecognized extra ledger entries | 0 |
| Approved retained historical entries | 9 |
| Orphaned historical exceptions | 0 |
| Redundant historical exceptions | 7 |
| Invalid retained-history records | 1 |

The nine missing repository migrations are versions `20261104120000` (`bind_commercial_payment_attempt_provider`), `20261104130000` (`isolate_payfast_settlement_identity`), `20261105190000` (`extend_business_directory_location_contact`), `20261105213000` (`create_business_capability_evidence`), `20261105220000` (`replace_business_capability_assertions`), `20261105230000` (`create_founder_directory_review`), `20261106090000` (`business_logo_storage_binding`), `20261106200000` (`link_project_to_opportunity`), and `20261107211500` (`reconcile_business_profile_and_founder_authority`). The nine extra ledger entries are retained historical versions `20261016100000`, `20261016120000`, `20261016170000`, `20261016180000`, `20261016190000`, `20261018210000`, `20261019190000`, `20261020130000`, and `20261020140000`; the script recognized all nine as approved retained history, but one retained-history audit record is invalid and must be investigated.

The nine approved historical checksum matches are `20260911030000`, `20260911210000`, `20260911211500`, `20260912030000`, `20260914120000`, `20260914130000`, `20260914220000`, `20260915193000`, and `20261005211000`. Seven historical exceptions are redundant because their registered hashes already match current repository bytes; do not delete or rewrite exception records without a separately reviewed reconciliation.

**Interpretation / required next work:** The approved migration URL is now demonstrated to connect to the actual Render `ghm_db` as `ghm_migrator` and assume `ghm_schema_owner` successfully. This closes the prior uncertainty about whether the dedicated migration execution path exists and works. It does **not** close the ledger reconciliation: 9 source migrations are not recorded as applied, and the audit reports 1 invalid retained-history record. Do not infer that those nine migrations should simply be applied; first investigate whether they are genuinely unapplied, represented by equivalent historical schema state, or otherwise require a formally reviewed ledger/source reconciliation. Inspect the exact retained-history audit entry for version `20261019210000` (reported as `REPOSITORY_MIGRATION_PRESENT`), determine why the aggregate `invalid_retained_history_count` is 1, and reconcile the 7 redundant exception registrations in a reviewed source change if appropriate. The single invalid retained-history classification is now traced to a stale registry entry, not an unexplained live-ledger checksum: `config/retained-historical-migrations.json` still registers version `20261019210000` (`create_business_registration_identity`) as retained history, but that migration file is present in the audited repository at `database/migrations/20261019210000_create_business_registration_identity.sql`. The classifier deliberately emits `REPOSITORY_MIGRATION_PRESENT` whenever a retained-history registry entry has a corresponding repository migration, so `invalid_retained_history_count=1` is explained by this stale/overlapping registry classification. The version is therefore not one of the 9 extra live ledger rows; it is in the repository set and was not reported as missing or as an unexplained checksum mismatch. The correct follow-up is to review and likely remove/reclassify that retained-history registry entry in a separate reviewed documentation/config change, preserving the historical provenance elsewhere if still needed—not to alter the live ledger. Preserve the complete raw audit output in the operator's secure local evidence; only this sanitized summary is committed.

**Execution boundary:** No secret value, database URL, token, or password was printed into the handover. No migration was executed. No role/grant or environment change was made. No Render deployment, restart, or auto-deploy change occurred. Render auto-deploy remains intentionally disabled. The temporary clone is separate from `C:\\GHM-main`; it is not a deployment checkout. Do not delete it until the owner has finished retaining any desired local audit artifacts.


### Read-only production schema comparison for the nine missing migrations — 2026-11-08 (after 13:31 UTC)

Following the owner-run migrator reconciliation, the operator compared the intended objects in all nine missing source migrations with the actual Render `ghm_db` catalog using the Render Postgres read-only query connector. These are catalog observations, not a schema mutation. The catalog comparison did **not** read or modify the migration ledger; the earlier dedicated migrator audit is the source for ledger counts.

| Missing source migration | Live catalog observation | Assessment |
|---|---|---|
| `20261104120000_bind_commercial_payment_attempt_provider` | `ghm.commercial_payment_attempt.provider_code` and its check constraint are absent. The generic `ghm.commercial_apply_payment_result(...)` function already exists with the source signature and is owned by `ghm_schema_owner`, with EXECUTE granted to `ghm_runtime`. | Partial/out-of-order object state. The function exists while the column it references is absent; do not assume it works or replay this migration blindly. |
| `20261104130000_isolate_payfast_settlement_identity` | `ghm_payment_provider` exists and is LOGIN-capable. However `commercial_get_payfast_attempt` and `commercial_apply_payfast_payment_result` are absent. The generic settlement function remains executable by `ghm_runtime`. | Provider isolation is not installed. This confirms the PayFast privilege boundary remains incomplete; do not enable callbacks or settle payments. |
| `20261105190000_extend_business_directory_location_contact` | `ghm.business` already has `province`, `city`, `physical_address`, `whatsapp`, `website`, `avatar_letter`, `avatar_color`, and `years_in_business`. It lacks `latitude` and `longitude`. Existing constraint names/definitions differ (e.g. avatar color is constrained to a hex color; years-in-business permits up to 500 rather than source max 100). `update_business_profile(bigint,bigint,jsonb)` exists but its current allowlist/body is an older variant (camelCase keys such as `physicalAddress`, `isSupplier`, `yearsInBusiness`; it does not implement the source migration's full patch contract). | Partial schema overlap, not equivalent application of this migration. Reconcile the actual profile API/constraints deliberately; migration as written would fail on duplicate columns and must not be replayed unchanged. |
| `20261105213000_create_business_capability_evidence` | Parent `ghm.business_capability` exists, but `ghm.business_capability_evidence` and `transition_business_capability_evidence` are absent. | Evidence feature objects are genuinely absent from the observed catalog. |
| `20261105220000_replace_business_capability_assertions` | `ghm.replace_business_capability_assertions(bigint,bigint,jsonb)` is absent. | Function is genuinely absent from the observed catalog. |
| `20261105230000_create_founder_directory_review` | The source review columns on `ghm.business`, `ghm.business_directory_review_event`, and the review submit/list/decision/presentation functions are absent. A separate `ghm.connect_founder_directory_reviewer` table exists, but it has a different shape and lifecycle; it is not the source migration's `directory_listing_founder_reviewer` authority table and cannot be treated as a substitute. | Founder directory review workflow is not installed. Existing Connect reviewer mapping is a distinct concept. |
| `20261106090000_business_logo_storage_binding` | `ghm.storage_object` exists, but `ghm.business.logo_storage_object_id`, `business_logo_storage_object_unique`, `set_business_logo_object`, and `storage_get_public_business_logo` are absent. | Storage foundation exists; Business logo binding is absent. |
| `20261106200000_link_project_to_opportunity` | `ghm.project.opportunity_id`, `project_opportunity_fk`, and `project_opportunity_unique` are absent. | Project-to-Opportunity link is absent in the observed schema. |
| `20261107211500_reconcile_business_profile_and_founder_authority` | `latitude`, `longitude`, `logo_storage_object_id`, its related constraints/index, `directory_listing_founder_reviewer`, and `is_directory_listing_founder_reviewer(bigint)` are absent. Existing Connect reviewer table remains distinct. | Its idempotent additions address only part of the profile gap; it does not replace the missing profile-function reconciliation or the full directory review workflow. |

**Cross-cutting finding:** the live schema is a mixed state, not simply “all nine absent.” There is older Business directory/profile state and a generic payment-result function in place, alongside genuinely absent provider isolation, capability evidence/replacement, founder directory review, logo binding, and Project–Opportunity linkage. The nine missing ledger versions therefore need a migration-by-migration disposition: (1) verify whether any existing objects came from earlier applied source or manual construction; (2) compare function definitions, grants, constraints, indexes, and dependent application code; (3) author explicit forward-only reconciliation migrations where appropriate; and (4) only then prepare a reviewed, ordered migration plan with backup/restore and authorization. Do not stamp ledger rows, delete historical rows, replay non-idempotent migrations, or apply the nine as a batch.

**PayFast-specific safety note:** production catalog shows `ghm_payment_provider` is a LOGIN role, but the dedicated PayFast read/apply functions are absent and `ghm_runtime` still has EXECUTE on the generic payment-result function. The source isolation migration would revoke that generic runtime grant and create the restricted PayFast entry points. This is a confirmed outstanding security gap, not a reason to apply that migration without its complete reviewed prerequisite and privilege plan.

**No changes:** these queries were read-only. No data rows were inspected or changed, no migration or ledger entry was written, no role/grant/ACL changed, no deployment/restart/environment change occurred, and Render auto-deploy remains intentionally disabled.


### Follow-up permission/catalog checks — 2026-11-08

Additional read-only catalog checks confirm:
- `ghm_payment_provider` is LOGIN-capable. Its membership edge from `ghm_db_user` is `SET=false`, `INHERIT=false`, `ADMIN=true`; this is not itself proof that provider settlement permissions are safely provisioned.
- `ghm_runtime` has a SET/INHERIT-capable membership edge from `ghm_db_user` and a separate ADMIN edge from `ghm_db_user` (`SET=false`, `INHERIT=false`, `ADMIN=true`). The pre-existing privileged role graph remains a separate least-privilege remediation concern.
- `ghm_migrator` has a SET-capable, non-inheriting membership in `ghm_schema_owner`, consistent with the successful audited `SET ROLE ghm_schema_owner` path.
- The existing `ghm.commercial_apply_payment_result` function is owned by `ghm_schema_owner`, and its ACL grants EXECUTE to `ghm_runtime`; effective privilege check returned `runtime_execute=true`, `provider_execute=false`. The PayFast-specific functions are absent. This independently confirms the intended provider isolation migration has not been installed and ordinary runtime still has the generic payment settlement entry point.
- The source migration's provider wrapper would revoke the runtime grant from the generic function and add the PayFast-only entry points; this is security-sensitive and must be part of an approved, ordered change with role/grant owner participation, not applied in isolation.
- A read-only catalog query found no non-internal triggers on the inspected Business, Business Capability, payment attempt, or Project tables other than the existing payment-attempt updated-at trigger. This is only an observation about those inspected tables, not a full dependency proof.

One attempted privilege probe using literal role name `PUBLIC` returned a PostgreSQL error because PUBLIC is a pseudo-role, not a catalog role; the query was corrected to use effective checks for the two actual login roles. No state changed.

PR #236 remains open and unmerged. A workflow-run lookup for its then-current head `72250a9786dd2d3259a92091402a2a0d9b5b5cac` returned no PR-triggered workflow runs; do not interpret this as a passing CI result. No merge or deployment was performed.


### Forward-only reconciliation plan and data preflight — 2026-11-08

This is the proposed engineering sequence based on the source migrations and live catalog evidence. It is a plan only; it is not migration authorization.

#### Read-only data preflight (completed)

A read-only aggregate query against `ghm.business` and `ghm.project` returned:

- Business rows: **16**.
- Business `years_in_business > 100`: **0**.
- Existing non-null `avatar_color` values not matching six-digit hex: **0**.
- Existing non-null WhatsApp values shorter than 7 chars: **0**.
- Existing non-null website values shorter than 8 chars: **0**.
- Existing non-null province/city/address values that are empty after trim: **0** for each.
- Project rows: **0**.

An initial combined aggregate query also attempted to count `ghm.storage_object` rows, but the read-only connector identity was denied SELECT on that table; the entire query failed and yielded no counts. The query was rerun without that table and succeeded. This is an observed permission boundary; do not try to bypass it or grant access. No row-level values were retrieved.

The aggregate checks show no current rows violating the noted Business field shape checks, but they do not prove that tightening constraints is behaviorally safe for future writes or that other fields/functions are equivalent. No count was possible for storage objects, payment rows, or other restricted relations through this connector.

#### Proposed execution order (each step is a separate reviewed/authorized slice)

**Gate 0 — baseline and recovery package.** Before any DDL: capture a fresh provider-supported backup/PITR point and test/confirm restore procedure; retain the complete raw forensic audit locally; capture current schema definitions, function bodies, grants/default ACLs, role memberships, migration ledger and checksums using the approved migrator identity; verify app runtime and callback services' exact deployed revisions/configuration; confirm a maintenance/traffic plan. The migration audit's read-only identity proof is now positive, but backup/restore readiness and deployment compatibility remain unverified.

**Gate 1 — reconcile Business profile, not replay the historical migration.** Do not run `20261105190000_extend_business_directory_location_contact.sql` unchanged: most columns already exist, and the older `update_business_profile(bigint,bigint,jsonb)` differs from the source patch contract. Design a new forward-only migration from the measured live baseline that adds only missing `latitude`/`longitude`, applies pair/range checks after explicit preflight, reconciles existing constraints without silently weakening them, and replaces `update_business_profile` only after reviewing its complete current body, all callers, key naming conventions, owner authorization checks, and ACL. Preserve current behavior not explicitly superseded. The aggregate preflight found 16 business rows and no observed violations of the checked current field constraints, but a full semantic and caller test is still required.

**Gate 2 — payment provider binding and PayFast isolation as one controlled security slice.** First design the `provider_code` column/check and update of `commercial_apply_payment_result`; then in the same controlled release boundary remove ordinary runtime EXECUTE and install only provider-scoped `commercial_get_payfast_attempt` and `commercial_apply_payfast_payment_result`. The live generic function currently has EXECUTE for `ghm_runtime`, provider-specific functions are absent, and the provider role exists as LOGIN. Before this slice: confirm the provider credential is provisioned privately, callback process connects as exactly `ghm_payment_provider`, no app runtime code calls the generic settlement function, and integration tests cover ZAR-only, provider match, idempotency, replay/hash conflict, event status, failed/pending/succeeded outcomes, and privilege-denial from runtime. The existing generic function must not be left exposed to runtime after cutover. No callback traffic or PayFast settlement until end-to-end qualification and explicit approval.

**Gate 3 — capability evidence and replacement.** Apply a reviewed forward-only creation of `business_capability_evidence` and transition function, then the assertion replacement function only after validating expected capability assertion semantics, status transitions, audit/event behavior, ownership, RLS, and exact EXECUTE grants. The parent `business_capability` table exists; evidence table and both observed functions do not. Test unauthorized business accounts, authorized owner/admin, malformed JSON, duplicate/replayed transitions, and audit completeness.

**Gate 4 — founder directory review authority and workflow.** Build the actual `directory_listing_founder_reviewer` authority table and review-event/workflow functions; do not repurpose `connect_founder_directory_reviewer`, which is a distinct mapping. Establish the approved process for seeding reviewer identities (migration creates no reviewer identities), founder/admin authorization, RLS and grants, review state transitions, audit immutability, and public directory visibility. Test non-reviewer denial and reviewer decisions before any production listing state is affected.

**Gate 5 — Business logo storage binding.** Confirm storage-object ownership/tenant/resource/status invariants and private provider/storage semantics with the object owner; connector SELECT on `ghm.storage_object` is currently denied, so use an authorized audited path rather than broadening read access. Add the Business FK/index and set/public-logo functions only after confirming existing storage rows, uniqueness, deletion behavior, and object lifecycle. Test cross-business object rejection, unavailable/private object rejection, owner/admin authorization, and public visibility only for active, verified, approved businesses.

**Gate 6 — Project–Opportunity link.** The live `ghm.project` table lacks `opportunity_id`, and the current table has 0 rows. Before adding the FK and partial unique index, verify canonical Opportunity identity/type/status rules and the application transaction that creates Project and Opportunity atomically. Test rollback on either insert failure, uniqueness, FK restrict behavior, and no orphan Opportunity/Project. Because the table is currently empty, there is no existing row backfill, but application behavior and concurrent writes still require qualification.

**Gate 7 — final business/founder authority reconciliation.** Treat `20261107211500_reconcile_business_profile_and_founder_authority.sql` as a partial idempotent source reference only. Its latitude/longitude/logo and founder-authority additions overlap the proposed earlier slices. Do not run it as-is after those slices; create a new forward-only reconciliation migration if any residual catalog differences remain. Confirm no duplicate constraints/indexes/functions or competing authority tables.

#### Per-slice release/verification discipline

For each approved slice, prepare a source migration and tests in a dedicated PR; review exact SQL and source checksum; run it against a production-like restored clone first; capture pre/post catalog and privilege snapshots; apply only that single migration using `GHM_MIGRATOR_DATABASE_URL` and explicit `SET ROLE ghm_schema_owner`; immediately verify ledger checksum, expected schema/function definitions, owner/ACL/RLS, positive and negative runtime/provider probes, and application health. Stop on any discrepancy. Do not proceed to the next slice until evidence is recorded and the owner approves. Do not stamp a migration ledger entry without its corresponding reviewed schema change.

**Rollback/recovery:** Prefer forward corrective migrations for committed schema changes. A transaction rollback is only available before commit and does not reverse external callback side effects. Before any payment privilege cutover, keep callback traffic disabled and have provider-side retry/idempotency and restore plan confirmed. For schema changes involving columns/functions/constraints, capture definitions and test restore on a clone; do not drop data or reverse ownership as an ad hoc rollback. The exact rollback for each slice must be reviewed before execution.

**Current blockers:** no explicit authorization to mutate production; backup/restore evidence not yet supplied; current Business function body/callers not fully reviewed; provider credential/process identity and callback E2E not qualified; storage-object inventory inaccessible through the current read-only connector; capability and directory review semantics/tests need review; deployment compatibility and production release plan not qualified. All nine missing ledger versions remain **not authorized to apply**. Render auto-deploy remains disabled; the live runtime is not to be deployed as part of these documentation/planning steps.


### Detailed current Business profile function review — 2026-11-08

The live `ghm.update_business_profile(bigint,bigint,jsonb)` definition was fetched directly from PostgreSQL via `pg_get_functiondef` in a read-only query. It is SECURITY DEFINER with fixed `search_path = pg_catalog, ghm`. It requires positive account/business IDs, a non-empty JSON object, rejects unknown keys, and checks an active owner/administrator membership before updating the Business. It currently accepts the camelCase/legacy contract:

`name`, `slug`, `description`, `phone`, `email`, `category`, `province`, `city`, `physicalAddress`, `whatsapp`, `website`, `isSupplier`, `yearsInBusiness`.

It also writes `is_supplier` and `category`; source migration `20261105190000` instead proposes snake_case `physical_address`, adds latitude/longitude and avatar fields, and does not include the existing category/isSupplier patch fields. Replacing it naively would be a breaking API contract even if the DDL succeeded. The live function validates years-in-business up to 500, while the source migration constraint limits stored values to 100; the aggregate preflight observed no existing values above 100 but that does not justify silently narrowing the API contract. The live province limit is 100 while the source migration constraint uses 120. The existing avatar_color check is stricter (hex) than the source's generic 1–32 character check. These differences must be resolved explicitly with API callers and product requirements before authoring a replacement. Preserve the active membership authorization check and SECURITY DEFINER fixed search_path.

The source migration's replacement function also needs full caller/contract review: decide whether to support both camelCase and snake_case keys during a compatibility window, preserve `category`/`isSupplier`, and define the supported years limit consistently. No function replacement or DDL was performed.

### Query access boundary encountered

The first data aggregate attempted a SELECT count from `ghm.storage_object` and was rejected with PostgreSQL SQLSTATE 42501. It was rerun against permitted `ghm.business` and `ghm.project` only. No grants, role switches, or privilege bypass were attempted. Storage-object inventory remains a required preflight using an approved owner-authorized evidence path.


## 27. Active GHM runtime and database — owner correction (2026-11-10 04:20 UTC)

The owner clarified the current environment boundary:

- **Active path:** GHM-Internal-Runtime and the active GHM database.
- **Retired sandbox path:** ghm-identity-qualification, ghm-payfast-sandbox-runtime, and ghm-payfast-callback-sandbox all belonged to the sandbox environment. The sandbox database is suspended/expired and is not in use.
- Do not treat any of those sandbox services or the sandbox database as current production dependencies, migration targets, or release prerequisites.

A fresh Render service listing at 2026-11-10 04:20 UTC showed GHM-Internal-Runtime attached to branch `main`, with auto-deploy set to `yes` and trigger `checksPass` (After CI Checks Pass). The service record was updated at 04:20:10 UTC. The owner states that they changed this setting. No Render setting change or deployment was performed as part of this review.

This section supersedes earlier statements in this handover that described Internal Runtime auto-deploy as disabled or presented the sandbox services as operational dependencies. Earlier observations remain historical snapshots of the environment at their recorded timestamps; they are not current configuration.

**Release boundary unchanged:** this clarification does not authorize a deployment, production database migration, role/grant change, payment-provider activation, PayFast callback activation, or commercial cutover. Those actions still require their own explicit authorization and technical gates.


## Actor-authentication boundary checkpoint — 2026-11-10 05:46 UTC

This section records the shared database actor-binding work so a resumed session does not repeat the investigation.

### Canonical design proposal

- GHM PR #251: https://github.com/zaidhqdev-sys/GHM/pull/251
- Branch: `docs/ghm-database-actor-boundary-proposal-20261110`
- Latest head: `9a950e9cd0eab0bf19c042c050bfe34b98dfde86`
- File: `docs/architecture/GHM_DATABASE_ACTOR_AUTHENTICATION_BOUNDARY_PROPOSAL_2026-11-10.md`
- PR remains open, draft, unmerged. It is a documentation-only proposal, not an approved architecture or implementation authorization.
- Exact-head GitHub Actions CI run #2367 (ID `42764071752`) passed. Both `quality` and `web-quality` jobs completed successfully, including build, full test suite, disposable PostgreSQL migrations/qualifications, migration audit policy tests, and runtime-boundary verification. This generic CI does not qualify the proposed gateway or clear downstream actor-binding gates.
- Earlier exact-head CI #2366 passed on predecessor `d8e51ec923d4d837f5144c5778d04f1788869a4e`; superseded by #2367.

### Confirmed trust gap and proposal content

- Existing ES256 bearer JWT verification and account resolution happen in the Node application. The ordinary pooled database connection uses shared `ghm_runtime`; actor-sensitive SECURITY DEFINER functions accept caller-supplied account IDs.
- The proposal prefers a separately credentialed authenticated database gateway that validates the original bearer token itself, resolves canonical GHM identity, checks current status, opens a distinct DB session, and establishes protected transaction-bound actor context.
- The ordinary API runtime must not mint trusted actor assertions or hold the signing key. A service-authenticated API connection plus API-supplied account ID is not actor proof.
- Proposal now explicitly documents gateway compromise as a trusted-computing-base risk; token replay/revocation; authenticated transport and token redaction; typed allow-listed parameterized operations (no arbitrary SQL); separation from schema/migration ownership; effective privilege review including inherited/PUBLIC grants; and fail-closed behavior without fallback to caller-supplied actor IDs.
- Caller-set GUC/temp table/application AuthContext are not trusted actor proof. The database-context-table candidate remains unselected pending PostgreSQL semantics and lifecycle proof. ES256 verification inside PostgreSQL is not assumed; extension/algorithm availability would need evidence.
- No production roles/grants/credentials/secrets, extensions, database, migrations, deployment, payment, or commercial settings were changed.

### Dependent PR disposition — do not repeat comments; review existing threads

The following exact-head PRs remain open/unmerged and blocked by the shared actor-binding requirement, despite earlier exact-head CI passes:
- #236 head `6feb03117530209a849be6025579cc0c2e13e92b` (ready for review, not draft): registration identity SECURITY DEFINER RPCs trust supplied `p_account_id`; no two-active-owner forged-ID runtime qualification.
- #237 head `c52c8bff830e00f0b6223532124da7aeaed5a9f1` (draft): business profile RPC's negative test uses nonexistent ID, not another active owner.
- #243 head `1246ed74a81b3fc607e6f65f3cd8036bc081ab1b` (draft): supplier classification RPC's qualification lacks forged different-active-owner ID case.
- #244 head `f418407bface1146e4cf0147424fb91bff81328a` (draft, GitHub mergeable=false): analytics grants permit direct runtime event access without DB actor binding; direct cross-business reads/writes and event actor spoofing are not covered by the app-level tests.
- #250 head `feb720eb8f2283bb6ae7325a51c4b88e57b28da7` (draft): capability governance direct RPC qualification lacks forged different-active-admin case.
Existing detailed review comments are already present on these PRs. Do not post duplicate comments; read their latest threads before any further review.

### Exact resume instructions

1. Check current main, PR #251 head/CI and dependent PR heads/status; do not rely on these historical pointers without refresh.
2. Continue design review on #251 only if it adds a concrete, non-duplicative trust-boundary decision. Keep draft pending architecture review.
3. Before implementation, choose gateway ownership/protocol, separate DB role and credential custody, non-forgeable transaction context, revocation/replay/idempotency semantics, operational fail-closed behavior, and audit/incident ownership.
4. Build shared disposable-PostgreSQL adversarial tests using the actual `ghm_runtime` login, two active actors/businesses, forged actor IDs, direct table grants, GUC/temp/SET ROLE/pool reuse, revoked/disabled actors, and positive gateway-mediated operations. Apply to all five dependent PRs.
5. Do not merge dependent PRs or change production DB roles/grants, secrets, extensions, migrations, or deployments without separate explicit authorization.
