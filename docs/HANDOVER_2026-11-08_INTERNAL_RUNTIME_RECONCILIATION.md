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


## 21. Native Windows PostgreSQL 18 PayFast qualification — 2026-11-08 15:12 UTC

This is the live-session continuation of the native Windows qualification path documented in `docs/payfast-local-qualification.md`. The following facts are based on the operator's PowerShell output supplied in the 2026-11-08 session; no local machine was accessed directly by this documentation update.

### Local PostgreSQL instance identification and authentication recovery

- The machine has two separate PostgreSQL clusters:
  - PostgreSQL 17 on port `5432` (PID previously observed as `6696`).
  - PostgreSQL 18 on port `5433`, data directory `C:\\Program Files\\PostgreSQL\\18\\data` (PID previously observed as `32144`).
- The qualification database is on PostgreSQL 18 / port `5433`. All qualification commands must specify `-h 127.0.0.1 -p 5433`; omitting the port defaults to PostgreSQL 17 and is the cause of the earlier wrong-instance password attempt.
- The operator verified that the original `pg_hba.conf` and `$env:TEMP\\pg_hba.conf.postgres18.original` backup have matching SHA256 hashes. The full expected hash recorded in the operator transcript is `0C8DC6E6E57399790417A6E13A8E1B5E27AA19708A2122148FBFE3BDCECD42`.
- A temporary, narrowly scoped `host postgres postgres 127.0.0.1/32 trust` rule was prepended, PostgreSQL 18 was restarted, and `pg_isready -h 127.0.0.1 -p 5433` reported `accepting connections`.
- The first interactive `\\password postgres` attempt reported `Passwords didn't match`; the operator repeated the command and exited normally after the second attempt. The password itself was not shared and must never be recorded here.
- The original HBA backup was copied back over the active file. The post-restore SHA256 matched the original hash, PostgreSQL 18 was restarted, and a password-authenticated `psql` query succeeded, reporting PostgreSQL 18.6, port 5433, user `postgres`.
- **Current confirmed state:** temporary trust rule removed by restoring the original HBA file; password authentication works against PostgreSQL 18 / 5433. Do not repeat password recovery or edit `pg_hba.conf` unless a new, evidenced failure requires it.
- PostgreSQL 17 / 5432 was not intentionally changed. No Render, production database, deployment, or hosted environment was touched.

### Qualification database inventory and schema inspection

Read-only inventory on PostgreSQL 18 returned:

| Database | Size |
|---|---:|
| `ghm_payfast_qualification` | 13 MB |
| `postgres` | 8,014 kB |

A read-only query against `ghm_payfast_qualification` / schema `ghm` returned 56 user tables. The output showed:
- `ghm.ghm_schema_migrations`: estimated 92 rows.
- `ghm.country`: estimated 1 row.
- `ghm.currency`: estimated 1 row.
- `ghm.opportunity_type`: estimated 11 rows.
- All other listed tables: estimated 0 rows.

These are `pg_stat_user_tables.n_live_tup` estimates, not exact counts. The database is therefore not accurately described as entirely empty: it has the application table structure, a migration ledger estimate of 92, and small reference-data estimates. The full schema/data completeness and migration checksum state have **not** yet been verified. Table sizes in the operator output are mostly 16–144 kB, with `ghm.business` 112 kB; database total is 13 MB.

The first inspection SQL attempt failed because it referenced nonexistent column `tablename` on `pg_stat_user_tables`. This was a harmless read-only query error. The corrected query used `relname AS tablename` and `pg_total_relation_size(relid)`, and succeeded. The operator pasted the successful output twice; this is one logical inspection result, not two separate database changes.

### Immediate next actions

1. Continue using only PostgreSQL 18 / `127.0.0.1:5433` for this qualification database.
2. Inspect the qualification migration ledger rows, versions and checksums, and compare them with the exact checked-out repository migration set using the repository's approved forensic reconciliation tooling. First confirm the current checkout/ref and ensure the audit is pointed only at `ghm_payfast_qualification`.
3. Inspect actual exact row counts for the four non-empty estimated tables and identify required seeded/reference data versus qualification fixtures. Do not assume statistics are exact.
4. Verify the qualification role graph (`ghm_schema_owner`, `ghm_migrator`, `ghm_runtime`, `ghm_payment_provider`), ownership, grants and connection target before running any application qualification commands.
5. Only after ledger, role and target checks pass, run the documented build/migration/qualification sequence from `docs/payfast-local-qualification.md`, using distinct local role URLs and explicit expected database/host guards.
6. Do not drop/recreate the existing 13 MB database or rerun migrations blindly. Preserve it until its contents and migration state are understood.

### Safety boundary reaffirmed

- Local target: PostgreSQL 18, port 5433, database `ghm_payfast_qualification`.
- Separate local instance: PostgreSQL 17, port 5432; leave untouched.
- No Render service, production database, production migration, payment callback, deployment, environment variable, role grant, or hosted credential was changed in this checkpoint.
- Never paste database passwords, connection URLs containing passwords, or provider secrets into chat or documentation.


## 22. Native Windows PostgreSQL 18 forensic pre-audit checkpoint — 2026-11-08 15:53 UTC

The operator ran the requested read-only inspection against 127.0.0.1:5433/ghm_payfast_qualification as postgres, with ON_ERROR_STOP=1. The command completed successfully.

### Exact observations

- Identity/target: current_database() = ghm_payfast_qualification, port 5433, user postgres.
- Exact ledger query returned 92 rows. The newest recorded row is version 20261104130000, name isolate_payfast_settlement_identity, applied at 2026-11-04 15:20:57.629981+02. The full rowset was supplied in the session transcript; this count is exact, unlike the earlier pg_stat_user_tables.n_live_tup estimate.
- Exact reference-data counts: ghm.country = 1, ghm.currency = 1, ghm.opportunity_type = 11.
- All four qualification roles exist. ghm_schema_owner is NOLOGIN and INHERIT; ghm_migrator, ghm_runtime, and ghm_payment_provider are LOGIN, non-superuser, and have no CREATEDB/CREATEROLE capability. The three login roles are NOINHERIT.
- The only relevant role membership returned is ghm_schema_owner granted to ghm_migrator, with admin_option=false, inherit_option=false, set_option=true. This is consistent with the forensic audit's explicit SET ROLE ghm_schema_owner transition. No membership path from runtime or payment-provider to schema owner was returned.
- No schema, data, ledger, role, grant, password, or configuration change was made by this inspection.

### Interpretation and next gate

The database has a populated 92-row ledger and a structurally appropriate migrator-to-owner SET ROLE path. This does not yet prove repository checksum reconciliation, provenance exception validity, complete object ownership/grants, or PayFast qualification. The next action is to run npm run audit:migrations in read-only mode with GHM_MIGRATION_AUDIT_DATABASE=ghm_payfast_qualification and a verified local GHM_MIGRATOR_DATABASE_URL targeting only port 5433. Do not run npm run migrate, seed, reset, or qualification scripts until that audit and the remaining target/ownership checks are reviewed.

PostgreSQL 17 on port 5432 remains outside scope. Render, production, deployment, hosted credentials, and PayFast live/sandbox services remain untouched.

## Migration-audit execution blocked by missing local npm dependencies — 2026-11-08 15:56 UTC

The operator correctly configured and independently verified the audit connection target (host 127.0.0.1, port 5433, database ghm_payfast_qualification, user ghm_migrator). `npm run audit:migrations` did not connect to PostgreSQL: Node.js v24.18.0 exited during module resolution with `ERR_MODULE_NOT_FOUND` for package `dotenv`, imported by `scripts/forensic-migration-reconciliation.mjs`. Repository `package.json` declares `dotenv` as a production dependency (`^16.4.5`) and `package-lock.json` (lockfileVersion 3) is committed. This is a local dependency-installation issue, not an audit verdict or database failure. Next action: run `npm ci` in the repository root, verify `node -e "console.log(require.resolve('dotenv'))"`, then rerun the audit with the already-verified environment variables. `npm ci` may replace local `node_modules`; it does not run migrations or alter PostgreSQL. No DB changes occurred during the failed invocation. Preserve all prior safety boundaries: no migrate/seed/reset, PostgreSQL 17 port 5432 untouched, no hosted or production changes.


## Local npm dependency installation recovered — 2026-11-08 15:58 UTC

The operator ran `npm ci` successfully in the repository root: 166 packages added, 167 audited, zero vulnerabilities reported. npm warned that the `argon2@0.41.1` install script (`node-gyp-build`) is not approved under the current allowScripts policy and therefore was not run. This is not currently a blocker for the forensic migration audit, which needs `dotenv` and `pg`; do not approve additional install scripts unless a later operation demonstrably requires them. Next: verify `require.resolve('dotenv')`, then rerun the read-only audit using the existing verified local PostgreSQL 18 connection environment. `npm ci` changed local dependency installation only; no database operation was run. All production/hosted and PostgreSQL 17 safety boundaries remain unchanged.


## Forensic audit reached PostgreSQL; local migrator authentication rejected — 2026-11-08 15:59 UTC

After successful `npm ci`, `require.resolve('dotenv')` succeeded and `npm run audit:migrations` advanced to opening its PostgreSQL connection. PostgreSQL rejected authentication for `ghm_migrator` with SQLSTATE 28P01 (password authentication failed). The audit did not reach ledger/checksum reconciliation and produced no PASS/INVESTIGATE verdict. This is an authentication prerequisite, not evidence of schema/checksum failure. Next controlled recovery: as local PostgreSQL 18 administrator on 127.0.0.1:5433 only, reset the local `ghm_migrator` password using psql's `\password ghm_migrator` (avoid exposing the password), then re-enter it securely into the local connection URL and verify authentication before rerunning the read-only audit. Do not alter pg_hba.conf for this; do not touch PostgreSQL 17/5432, hosted services, or production. No migration, seed, or reset was run.


## PostgreSQL 18 local forensic migration audit — 2026-11-08 16:02 UTC

The local `npm run audit:migrations` completed against `ghm_payfast_qualification` on PostgreSQL 18 / port 5433. Authority check PASSED: session/current user began as `ghm_migrator`, the expected database matched, `ghm_migrator` could `SET ROLE ghm_schema_owner`, and the post-switch identity was `current_user=ghm_schema_owner`, `session_user=ghm_migrator`. Audit ran in `BEGIN READ ONLY`. Final verdict: `INVESTIGATE` (not PASS).

Counts: repository migrations 90; live ledger rows 92; canonical matches 80; supported legacy CRLF matches 0; missing repository migrations 8; unexplained checksum mismatches 2; name mismatches 0; extra ledger rows 10; approved retained historical rows 8; unrecognized extras 2; orphaned exceptions 0; redundant provenance exceptions 7; invalid retained-history entries 2.

Eight repository migrations absent from the live ledger: `20261105190000_extend_business_directory_location_contact`; `20261105213000_create_business_capability_evidence`; `20261105220000_replace_business_capability_assertions`; `20261105230000_create_founder_directory_review`; `20261106090000_business_logo_storage_binding`; `20261106200000_link_project_to_opportunity`; `20261107211500_reconcile_business_profile_and_founder_authority`; `20261108140000_reconcile_business_profile_contract`.

Two unexplained checksum mismatches: `20261104120000_bind_commercial_payment_attempt_provider` (repository canonical `3f284b7afb1bc83c42331b0346e2853f448948ad9a2f9e92c162c303fb92d3d8`; live ledger `da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff`) and `20261104130000_isolate_payfast_settlement_identity` (repository canonical `230657b714cc8bfa23e69be9a0c8ff0a4d110b3a7435047e33683a77f3863a22`; live ledger `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f`). Neither has a registered historical checksum. Ten extras include eight verified retained historical rows and two unrecognized rows: `20261020130000_create_quoteflow_migration_business_provisioning` (live checksum differs from registered retained checksum `a453171e...`) and `20261031100000_restrict_identity_authority_reader` (no registered retained-history record). Retained-history audit also flags `20261019210000` as `REPOSITORY_MIGRATION_PRESENT`, so its retention record needs reconciliation. Seven old provenance exception records are redundant because their hashes now match repository bytes; defer cleanup until blockers are understood.

Next action is strictly read-only provenance analysis: establish the local checkout branch/HEAD/worktree state and compute canonical/legacy checksums for all eight missing files plus the two mismatched files; compare local files with known GitHub source branches/history. Do not edit manifests, rewrite ledger checksums, apply pending migrations, run seeds, or reset/recreate the database until the evidence explains every mismatch and extra. No production/hosted database or PostgreSQL 17/5432 was touched; no DDL/data mutation occurred.


## Migration file hash and Git-history reconciliation checkpoint — 2026-11-08 16:13 UTC

The operator confirmed all ten audited migration files exist in the local checkout and supplied full raw SHA-256 hashes. The first two files' raw hashes exactly equal the audit script's computed legacy-CRLF repository hashes:
- `20261104120000_bind_commercial_payment_attempt_provider.sql`: `a7e40f38d3a0cdd59175a7342dc726c5d6f625a51949e9793fa33fd67ab69912`.
- `20261104130000_isolate_payfast_settlement_identity.sql`: `fe2efc4e74667a982d75849fc9e41276bdbd3d9f8b83368166d8afd9914c8260`.

Important distinction: this explains the raw-file-vs-canonical line-ending difference, but it does NOT reconcile either file to its live ledger checksum. The two ledger values remain different (`da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff` and `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f` respectively); they remain genuine ledger provenance discrepancies until the exact applied SQL bytes are identified.

The other eight full raw hashes (for the eight migrations absent from the ledger) were recorded by the operator: `20261105190000` = `f26d93e7955dc212ca370a09894bc15420d7708ef0f28a3edd6de3014721a5f0`; `20261105213000` = `afc5dc4d889cf317aab84c747538b29e9f059a4e2ceece2bc3c125131e7f9813`; `20261105220000` = `d38364b188dad024620089dd83165832ba63aa84fb5237061642ea71e7e3d6c0`; `20261105230000` = `f57fbdd169a666a32d3f8b6a4cddfffca814742d60505019c37a2c78fc6f461b`; `20261106090000` = `f912e53ae8bee108f4b1c9ba138c77e90f576b27e2899c9f4d9d33c8a8abcb43`; `20261106200000` = `bf060b4c28c3c1521ead05dfa51ec4de8b9221f8533a03ff05cb5e0007952fba`; `20261107211500` = `36598ad87e381ee9b2651a0fbe6740ac99f6912a91bcb32780328e3a202b3501`; `20261108140000` = `72cde5b257d86e4698b2d07e5a238288efc540ba85660da8af1a4547cece79aa`.

Read-only `git log --all --follow` confirms all ten files are in local Git history. Notable introducing/modifying commits include: both PayFast migrations together at `e7a51d7` (2026-11-06); directory location/contact migration history `1557c24`, `38e1539`, `0b3362d`, `5f24acc`; capability evidence `452f3df`; capability assertion replacement `724dba9`; founder review lifecycle `39ced6f` plus subsequent fixes; logo binding `49dd7da`; Project-Opportunity link `28e5ca5`; business/founder authority reconciliation `1fe1db1`; business profile contract reconciliation history `cc18518`, `4a071de`, `3c51c66`, `2e452f3`. The local checkout remains branch `fix/business-profile-compat-contract-20261108`, HEAD `d9151d936fa3edcde1bb5a5c050811a37db27166`, clean; do not switch branches during this investigation.

Next read-only step: inspect the exact SQL blobs at relevant introducing and follow-up commits, including the full history for the two PayFast migrations and the missing eight; then compare those versions with ledger checksums and the live catalog. File existence and current raw hashes do not prove application. The audit verdict remains INVESTIGATE. Do not run migrations, edit ledger rows or exception manifests, seed/reset/recreate the DB, or touch PostgreSQL 17/5432, hosted DBs, Render, or production.


## Local PayFast ledger checksum identity verification — 2026-11-08 20:01 UTC

The operator successfully queried the two PayFast migration ledger rows through the local PostgreSQL 18 qualification connection using a read-only transaction and explicit `SET LOCAL ROLE ghm_schema_owner`. The identity check returned `current_user=ghm_schema_owner`, `session_user=ghm_migrator`, and `current_database=ghm_payfast_qualification`. Both rows were read successfully; transaction ended with ROLLBACK.

| Version | Name | Exact live ledger checksum | applied_at (local +02) |
|---|---|---|---|
| 20261104120000 | bind_commercial_payment_attempt_provider | `da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff` | 2026-11-04 15:20:57.625187+02 |
| 20261104130000 | isolate_payfast_settlement_identity | `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f` | 2026-11-04 15:20:57.629981+02 |

This confirms the exact live values previously surfaced by the forensic audit and verifies that the read-only role-switch path can read the protected ledger. The current repository canonical and legacy-CRLF hashes still do not match either live value. Historical SQL shown from commit `e7a51d7` establishes intended function/role boundaries but is not proof of the exact bytes applied. Continue read-only Git blob/provenance analysis; do not alter the ledger or exception manifests and do not run migrations. PostgreSQL 17/5432, hosted databases, Render and production remain untouched.


## PayFast ledger checksum provenance — historical Git blob comparison (2026-11-08 22:05 UTC)

The operator traced the two mismatched migration files with read-only `git log --all --follow --name-status` and then SHA-256 hashed each relevant historical Git blob. This corrects the earlier investigation script's assumption that the current filename existed at every historical commit.

### Rename/path history

- `20261104120000_bind_commercial_payment_attempt_provider.sql` was renamed from `database/migrations/20261007120000_create_commercial_payment_result_boundary.sql` in commit `e7a51d71e1de0dc5bf811851c67110e641603edd` (2026-11-06). Its earlier versions were present at `edd136aea256f7b1d92b610f114d75a4d8856611`, `52fe2152c0856328d4c3088800301adabd6e9430`, `5537573939789e89dda786450a833df61829e5f5`, and `7196f94342a294dc39b0d45a255118fd28095169`.
- `20261104130000_isolate_payfast_settlement_identity.sql` was added as a new file in `e7a51d71e1de0dc5bf811851c67110e641603edd`; the traced history shows no earlier path.

### Historical blob SHA-256 results

For `20261104120000`, the raw and LF-normalized SHA-256 values were identical for each Git blob (all were LF content):
- `e7a51d71e1de`, renamed/current path, 8,949 bytes: `3f284b7afb1bc83c42331b0346e2853f448948ad9a2f9e92c162c303fb92d3d8`.
- `edd136aea256`, prior path, 8,369 bytes: `778817028e5377744140b6cec31fccc6fbb84bcf9c47e20c4997b8056ba608b9`.
- `52fe2152c085`, prior path, 8,408 bytes: `e57d66004dcf64b9e838ded7b955030584ea1eb0f3a56fa94c9a2098c7b5f1c6`.
- `553757393978`, prior path, 8,408 bytes: `890bb8eaf5f0d309dfd4e1408b144c37f0943e942f440db7546d65bcb6668c8c`.
- `7196f94342a2`, prior path, 8,308 bytes: `f2225eb4df397569724ecb1f13b6bb97278373989d1ce3e2de788074591cc1bc`.

For `20261104130000`:
- `e7a51d71e1de`, 3,534 bytes: raw and LF-normalized SHA-256 `230657b714cc8bfa23e69be9a0c8ff0a4d110b3a7435047e33683a77f3863a22`.

**None of the five traced versions of the first migration or the one traced version of the second matches its live ledger checksum**, either raw or LF-normalized:
- First live ledger checksum: `da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff`.
- Second live ledger checksum: `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f`.

This rules out a simple CRLF normalization explanation and rules out the specific Git blobs enumerated above as the exact checksum source. It does **not** prove no other historical object, external migration artifact, generated SQL, or deployment-time source existed. The audit remains **INVESTIGATE**. Next provenance step: search all reachable Git objects/history for either exact live SHA-256 and locate any archived/deployed migration artifact or deployment log that identifies the exact applied SQL bytes. Do not alter the migration ledger, exception manifests, migration files, database schema, or rerun either migration. All investigation to this point was read-only; no hosted/production DB, Render service, or PostgreSQL 17/5432 was touched.

## Reachable Git SQL-object checksum search — no matches (2026-11-08 22:07 UTC)

A read-only Node script enumerated all reachable Git objects from `git rev-list --objects --all`, selected every object referenced by a `.sql` path, and hashed each unique blob using both raw SHA-256 and CRLF/CR-to-LF normalized SHA-256. It inspected **132 unique SQL blob objects**. Neither target live ledger checksum appeared in any blob in either form:
- `20261104120000`: `da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff`.
- `20261104130000`: `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f`.

This extends the earlier filename-following history comparison: not only do the six specifically traced historical blobs differ, but neither live checksum is reproducible from any of the 132 reachable SQL blobs in this local checkout. Scope limitation: this does not cover unreachable Git objects, remote branches/tags absent from the checkout, external/generated migration artifacts, CI/deployment artifacts, operator workspaces, or database-side records beyond the ledger checksum itself. Do not claim the original applied SQL has been identified.

Disposition remains **INVESTIGATE / NO-GO for migration execution or ledger repair**. Next evidence source should be independent deployment/application provenance: migration runner logs, archived build/release artifacts, CI artifacts, backups/archives of the migration source, or operator records identifying the exact SQL applied at 2026-11-04 15:20:57 +02. Compare candidate artifact bytes against both ledger checksums before any remediation decision. Keep migrations, schema, ledger, and exception manifests unchanged. The scan was read-only; no database, hosted service, deployment, or PostgreSQL 17/5432 changes occurred.


## PayFast checksum provenance — CI checkout blob comparison (2026-11-08 22:15 UTC)

The operator fetched and verified GitHub Actions checkout commit `a1a046d17d04854bfc8259efaa02100b1ae09304` from workflow run [41836364443](https://github.com/zaidhqdev-sys/GHM/actions/runs/41836364443), branch `security/payfast-callback-isolation-20261104`. The commit is now present in the local Git object database; no branch switch or working-tree change was required. The run log confirms `npm run migrate` against its disposable GitHub Actions PostgreSQL service, but does not print migration checksum values. The local qualification ledger timestamps are approximately six minutes after that CI migration step began; timing alone is correlation, not proof that this CI run populated the local qualification DB.

The exact SQL blobs at the CI checkout were hashed locally:

| Ledger version | CI checkout path | Bytes | Raw and LF-normalized SHA-256 | Live ledger SHA-256 | Result |
|---|---|---:|---|---|---|
| `20261104120000` | `database/migrations/20261007120000_create_commercial_payment_result_boundary.sql` | 8,369 | `778817028e5377744140b6cec31fccc6fbb84bcf9c47e20c4997b8056ba608b9` | `da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff` | No match |
| `20261104130000` | `database/migrations/20261104130000_isolate_payfast_settlement_identity.sql` | 3,499 | `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f` | `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f` | Exact match |

The first CI blob's hash equals the earlier `edd136a` historical blob hash, but not the live ledger checksum. The second CI blob is an exact byte-level checksum match to the live ledger row. This establishes a source-blob match for the second migration in the CI checkout; it does not, by itself, establish which database received that run or prove the CI job caused the local qualification ledger row. The workflow used a disposable CI PostgreSQL service, and its logs do not expose the computed checksum or a connection to the local machine.

Updated disposition: the second migration's checksum source is identified in this CI checkout, while the first migration remains unexplained. The overall audit remains **INVESTIGATE** because the first mismatch and other audit findings remain open. Next evidence should focus on the first migration's exact applied bytes and the provenance/connection context of the local ledger. No migration, ledger, schema, exception-manifest, hosted DB, Render, production, or PostgreSQL 17/5432 changes were made; the local comparison was read-only apart from fetching Git objects.


## PayFast checksum provenance — exact versioned SQL sources identified (2026-11-08 22:20 UTC)

**Correction to the 22:05–22:15 investigation notes:** both live PayFast ledger checksums are now matched to exact SQL files at CI/PR implementation commit `a1a046d17d04854bfc8259efaa02100b1ae09304` (PR #206, [CI run 41836364443](https://github.com/zaidhqdev-sys/GHM/actions/runs/41836364443)). The earlier first-migration comparison queried the *old* `20261007120000_create_commercial_payment_result_boundary.sql` path, not the versioned `20261104120000_bind_commercial_payment_attempt_provider.sql` file corresponding to the live ledger row. Both paths existed in the same commit and are distinct files/migrations.

Exact SHA-256 computed from the UTF-8/LF source text at commit `a1a046d`:

| Ledger version | Exact versioned file path | Git blob SHA-1 | Characters | SHA-256 | Live ledger SHA-256 | Result |
|---|---|---|---:|---|---|---|
| `20261104120000` | `database/migrations/20261104120000_bind_commercial_payment_attempt_provider.sql` | `d78677cd88e7a3a9d0ebc66ecf6df2a7d5f34d10` | 8,950 | `da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff` | `da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff` | Exact match |
| `20261104130000` | `database/migrations/20261104130000_isolate_payfast_settlement_identity.sql` | `25c38258e4d91e9364d11b76585ac9936667b756` | 3,499 | `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f` | `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f` | Exact match |

The old-path file `database/migrations/20261007120000_create_commercial_payment_result_boundary.sql` at the same commit is 8,369 characters and hashes to `778817028e5377744140b6cec31fccc6fbb84bcf9c47e20c4997b8056ba608b9`. It is not the file named by live ledger version `20261104120000`; its non-match is not evidence of a checksum mismatch for that ledger row.

The migration runner at commit `a1a046d` derives the ledger version from the 14-digit filename prefix and computes the checksum from the original source text via `migrationSqlChecksum` (LF/CRLF normalization). Thus the two exact versioned paths above map to the two live ledger versions and reproduce both stored checksums. This identifies exact matching historical SQL bytes for both rows.

PR #206's recorded local qualification update states that `npm run migrate` completed on native Windows PostgreSQL 18 at `127.0.0.1:5433/ghm_payfast_qualification`, with 92 migrations recorded; this is maintainer-reported PR evidence, not a retained raw terminal log. The local ledger's `applied_at` times are 2026-11-04 13:20:57 UTC. CI run 41836364443 used its own disposable GitHub Actions PostgreSQL service and must not be described as the source of the local DB state. The PR record and exact versioned SQL hashes are consistent with the local qualification history, but do not prove the CI service populated the local DB.

**Scope correction:** the earlier 132-blob scan used `git rev-list --objects --all`; the separately fetched commit had been placed in `FETCH_HEAD`, which is not necessarily included by `--all`. Therefore that scan did not establish absence from the fetched PR commit. Its narrower conclusion—no matches among the refs it actually enumerated—stands, but it must not be used to claim the exact versioned files were absent from the PR history.

The two PayFast source checksums are now **explained by exact historical repository files**. The forensic audit overall remains **INVESTIGATE**, not PASS: the eight missing repository migrations, two unrecognized extra ledger rows, and retained-history validation findings remain open. The current audit may continue to report these historical checksums as unexplained relative to current repository bytes until the historical provenance policy/manifest is reviewed; do not change the exception manifest or ledger as part of this evidence step. No migration, database/schema/ledger change, seed/reset, hosted/production/Render change, or PostgreSQL 17/5432 operation was performed.

## 11. Local PostgreSQL 18 migration provenance follow-up — 2026-11-08 22:31 UTC

The owner supplied the local Git-history search results for `20261031100000_restrict_identity_authority_reader`; both `git log --all --format="%H %s" -- "*20261031100000*"` and `git rev-list --all --objects | Select-String "20261031100000|restrict_identity_authority_reader"` returned no matches. A GitHub REST path-history query for `database/migrations/20261031100000_restrict_identity_authority_reader.sql` also returned an empty commit list. This establishes that no matching path is present in the inspected reachable local refs or GitHub path history; it does not exclude an unmerged/local-only, unreachable, generated, or externally archived source. The live ledger checksum remains `a6692f473f05647aa8b829a1b9263f69376f2e647b124a013543d8ec7d9186bf`; no source bytes have been identified. Keep this row an unrecognized extra; do not invent a retained-history record.

The same follow-up inspected commit `e6b396399f41cd6bc6d87044ab99fd32e99cd46e`, which introduced the currently present `20261019210000_create_business_registration_identity.sql` file on 2026-11-05. Its diff adds the 180-line table/function/RLS/grant implementation. The retained-history registry, however, identifies the applied historical source as blob `7681736389b13c82a81f7a6419826204ef584676` with live checksum `4115cd79560e7ac7f11cae52734970a5ab9f0ba5100c34ceb2df5fe467327324`. The owner's local `Get-FileHash` output for the current file begins `C8C69A2380BD1D8C98EDEC54DE63B827459AB62A267515DD5ADA54...`, so it is not the registered/live SHA-256. The `REPOSITORY_MIGRATION_PRESENT` finding is therefore valid: the present same-version path is not byte-identical to the retained applied source. Preserve the file and registry pending a deliberate history/reclassification decision.

Commit `5229b37700f2e21ac4caf2d4c5547bb929ab2de8` titled “fix(db): restore applied QuoteFlow migration bytes” changes two SQL literals in the QuoteFlow migration from `unverified` to `pending` (business verification status and corresponding function comment). This confirms the intended two-line restoration in that commit's diff, but does not by itself prove the complete file SHA-256 equals the live ledger checksum `3c09cc7ecb8f566f0d359832ad91cc7b644570220236713c02a0763a0521345b`. The retained-history registry checksum remains `a453171e85f6717476258c6d2d59a39b663be89826316036e6b9891cadfb13e`, which differs from live. Keep this retained-history record invalid until exact full-file bytes and checksum are verified.

Overall local audit remains **INVESTIGATE**. No DB, ledger, migration, registry, exception manifest, hosted resource, or deployment was changed. Continue read-only provenance tracing; PostgreSQL 17/5432 remains untouched.

## 12. QuoteFlow applied-byte provenance resolved — 2026-11-08 22:35 UTC

A complete historical source match has now been found for live ledger version `20261020130000_create_quoteflow_migration_business_provisioning`. The parent of commit `5229b37700f2e21ac4caf2d4c5547bb929ab2de8` is `7fb1bbe07fc64ede652ae589ab72bdc96f23d906` (2026-10-26 20:30:50 UTC). At that parent commit, the migration file's Git blob is `21731433c2a998fff8d86d628d3589f8768dd618`; independently computed SHA-256 of the complete 9,066-character SQL is `3c09cc7ecb8f566f0d359832ad91cc7b644570220236713c02a0763a0521345b`, an exact match to the local live ledger checksum. This identifies the exact source bytes represented by the ledger row.

The subsequent commit `5229b37700f2e21ac4caf2d4c5547bb929ab2de8` changes the two occurrences of `unverified` to `pending`. Its file blob is `620efa57ac35d494f1aa506f26a7ad810c821d9a`, with SHA-256 `a453171e85f6717476258c6d2d59a39b663be89826316036e6b9891cadfb13e9`. That is the checksum currently recorded in `config/retained-historical-migrations.json`, but it does **not** match the live ledger. The registry's current statement that this is the original applied checksum is contradicted by the exact parent-version match above.

The additive follow-up migration `20261020140000_reconcile_quoteflow_provisioning_verification_status.sql`, present at parent `7fb1bbe...`, explicitly says the original migration was already applied and that the existing `business_verification_status_check` accepts `unverified`, not `pending`. Its replacement function still creates the Business with `verification_status='unverified'`. This is consistent with the `20261020130000` live source being the `unverified` version. Therefore commit `5229b37` did not restore the bytes in the live ledger; it changed the historical file away from the exact applied source while the registry adopted that changed checksum.

**Disposition:** QuoteFlow source provenance is now identified, but retained-history metadata remains invalid and must not be silently edited as part of this read-only investigation. Keep the database, migration file, and registry unchanged pending an explicit reviewed provenance correction. The audit remains **INVESTIGATE** until the retained-history policy/record is reconciled and the other blockers are resolved. No database, migration, registry, exception manifest, hosted resource, or deployment was changed.

## 13. Identity-authority migration source located and checksum matched — 2026-11-08 22:37 UTC

The previously unexplained live ledger row `20261031100000_restrict_identity_authority_reader` is now matched to exact SQL bytes. The source exists on branch `reconciliation/ghm-identity-mainline-restored-20261031` at path `database/migrations/20261031100000_restrict_identity_authority_reader.sql`, Git blob `e34dd0700885b182c79b1f09f2af5d94281849c2`, 482 characters. SHA-256 independently computed from the fetched SQL is `a6692f473f05647aa8b829a1b9263f69376f2e647b124a013543d8ec7d9186bf`, exactly matching the live ledger. Its introducing commit is `d166df2df9fe4a3e00da50935f118ef5322d05ae` (2026-10-31 22:56:50 UTC), parent `6b67d4c5be110fd178e7980e0718586dfc12e744`; commit title: “Add reviewed identity-authority restriction”. The six-line migration revokes `EXECUTE` on `ghm.auth_read_connect_identity_authority(bigint)` from `ghm_runtime` and comments that the function is reserved pending a reviewed runtime caller and account-scope enforcement.

Correction to the 22:31 note: no path history was found on main/default branch or in the owner's local reachable refs, but the migration does exist on the named restored reconciliation branch. Thus source provenance is established; the audit's unrecognized-extra classification persists only because the retained-history registry has no corresponding record, not because SQL source bytes are unknown. Do not edit registry/exception manifest during this forensic pass.

The separate `20261019210000` same-version file remains a different issue: its current file was introduced on 2026-11-05 by `e6b396399f41cd6bc6d87044ab99fd32e99cd46e` (blob `c1c3e4d9b4148376109177cf3106aa3519e15df6`, 180 lines), whereas registry/live applied source is historical blob `7681736389b13c82a81f7a6419826204ef584676` / SHA-256 `4115cd79560e7ac7f11cae52734970a5ab9f0ba5100c34ceb2df5fe467327324`. Path history on main shows only the 2026-11-05 addition. Preserve the current migration and registry pending separate reviewed disposition.

Overall audit remains **INVESTIGATE**. QuoteFlow `20261020130000` applied source is independently matched to parent commit `7fb1bbe...` with live SHA-256 `3c09cc7...`, while current retained-history metadata incorrectly records later `pending` bytes (`a453171e...`). No DB, migration, registry, exception manifest, hosted resource, or deployment was changed.

## 14. Business-registration version collision is a migration-runner blocker — 2026-11-08 22:42 UTC

Further history inspection clarifies `20261019210000`. Commit `01eae6c7a0fe939873ffbfe714d8268fb730488d` (2026-10-19 21:55:12 UTC) modified the same path and added two `AND b.is_active = true` guards to the read/update authorization checks; its parent is `5944e594813a1c13c90ca2df0be5b4d808565c32`. The path was subsequently re-added on main by commit `e6b396399f41cd6bc6d87044ab99fd32e99cd46e` on 2026-11-05, with current Git blob `c1c3e4d9b4148376109177cf3106aa3519e15df6` and local `Get-FileHash` prefix `C8C69A...`. The live ledger and retained-history record remain the historical applied checksum `4115cd79560e7ac7f11cae52734970a5ab9f0ba5100c34ceb2df5fe467327324`, source blob recorded as `7681736389b13c82a81f7a6419826204ef584676`. Therefore the current same-version file is not the applied bytes; it represents a later SQL revision reusing the already-applied 14-digit version.

Critical operational implication: `config/historical-migration-provenance-exceptions.json` on main has no `20261019210000` entry. `src/db/migrate.ts` refuses an existing ledger version whose checksum differs from the repository file unless that exact live checksum is explicitly present in the exception manifest. Given the observed local ledger checksum and current main migration file, running `npm run migrate` against this database would fail at this version with `Migration checksum mismatch` (rather than safely applying a new migration). Do not run it as a diagnostic. The correct design is to give the new SQL revision a new unused migration version and leave the historical applied version represented only by retained provenance, or adopt another explicitly reviewed migration-history repair. Do not alter the existing file/version/manifest in this forensic pass.

The retained-history classifier intentionally marks any repository file at the same version as `REPOSITORY_MIGRATION_PRESENT`; this is a real version collision, not merely a benign provenance discrepancy. Audit remains **INVESTIGATE**. No DB, migration, manifest, or hosted resource was changed.

## 15. Clarification of migration audit `missing_count` — 2026-11-08 22:44 UTC

Correction to prior handover shorthand: the forensic script's `missing` array means **repository migration files whose versions do not exist in the live database ledger** (pending/unapplied repository migrations). It does not mean migration files are missing from the repository. The eight versions listed in the local audit are repository-present and ledger-absent. Seven of those files are present on main: `20261105190000_extend_business_directory_location_contact`, `20261105213000_create_business_capability_evidence`, `20261105220000_replace_business_capability_assertions`, `20261105230000_create_founder_directory_review`, `20261106090000_business_logo_storage_binding`, `20261106200000_link_project_to_opportunity`, and `20261107211500_reconcile_business_profile_and_founder_authority`. The eighth, `20261108140000_reconcile_business_profile_contract`, exists on `fix/business-profile-compat-contract-20261108` but is not present on main. Several of the SQL files explicitly state construction-only/no production migration or cutover authorization; their presence and ledger-absent status do not authorize execution. Treat this metric as eight pending repository migrations, not eight missing source files. This correction does not change the audit verdict or permit migration execution. The independent `20261019210000` same-version checksum collision still blocks the current migration runner on the observed local database; its runner transaction would roll back on error. No database or migration source was changed.

## 16. Migration provenance remediation implementation staged — 2026-11-09

A draft code PR is now open for review: [PR #239 — Reconcile historical migration provenance and business identity version collision](https://github.com/zaidhqdev-sys/GHM/pull/239), branch `fix/migration-provenance-reconciliation-20261109`.

Changes on the draft branch:
- Retires the later Business registration SQL body from the already-applied historical version `20261019210000`, leaving its exact applied checksum in retained-history metadata.
- Reintroduces the table contract and active-Business authorization functions in new forward migration `20261108150000_reconcile_business_registration_identity_authorization.sql`. It uses `CREATE TABLE IF NOT EXISTS`, validates the expected seven columns/types and four declaration constraints for an existing table, verifies RLS, restores owner/revokes, and replaces the read/update functions.
- Updates the static migration contract test to point at the new version.
- Corrects QuoteFlow `20261020130000` retained checksum to live-applied `3c09cc7...` and source blob `21731433...`; adds identity-authority `20261031100000` checksum `a6692f47...` with exact commit/blob provenance.
- Does not alter `config/historical-migration-provenance-exceptions.json`.

PR #239 is draft and must not be merged or applied yet. At this checkpoint Cloudflare Pages check passed and GitHub Actions `quality` was still running on head `e1e53bbc02603d075bdf9406e29dc6e83c9c104e` (after the documentation status update). Required evidence still outstanding: exact-head CI success, disposable PostgreSQL 18 empty-install qualification, seeded historical-table qualification including data/owner/RLS/ACL preservation, and a fresh read-only audit of the local qualification database. The complete pending migration set also requires release-readiness review.

No database or ledger was changed; no migration command was run; no production/Render resource or deployment was touched. This implementation is repository-only and remains a draft for review.

## 17. Migration provenance PR #239 exact-head qualification — 2026-11-09

The implementation PR has now passed its full exact-head GitHub Actions quality run before a subsequent documentation-only appendix commit:
- Qualifying implementation head: `77dca310ad4945b28ef919805a3a47797043e2de`.
- GitHub Actions quality run #2222 (`42532985591`): **success**.
- Cloudflare Pages check on that head: **success** (preview build only).
- Build and full disposable PostgreSQL 18 migration application passed.
- Added CI qualification resets both registration identity functions to the exact historical pre-active-Business definitions from commit parent `5944e594813a1c13c90ca2df0be5b4d808565c32`, then executes the new forward migration with the table already present. It asserts both functions contain `b.is_active = true`, RLS enabled, owner `ghm_schema_owner`, runtime direct table SELECT denied, and runtime function execution granted. The transaction is rolled back after the assertions.
- CI log: `PASS: historical functions were upgraded on the pre-existing table; authorization, RLS, owner, and ACL checks passed; transaction rolled back.`
- Full test suite, commercial payment qualification, migration audit policy tests, and runtime boundary verification all passed.

PR #239 remains draft and unmerged. The later appendix-only update on the PR branch triggers another CI run; confirm that exact final head's checks before any readiness change. The owner-local read-only audit still has to be rerun after branch checkout, and the complete pending migration set needs review. No database/ledger or hosted resource was changed; no migration was run against the owner's local or production database.

## 18. PR #239 final-head CI recheck — 2026-11-09

The documentation-only appendix commit on the migration remediation PR has also passed exact-head CI:
- PR #239 final head: `8ba633bbf690cddbc6d3a2b281a36fcf32c6d7ab`.
- GitHub Actions quality run #2223 (`42533143356`): success.
- Cloudflare Pages check: success (preview build only).
- The qualifying implementation code head remains `77dca310ad4945b28ef919805a3a47797043e2de`; its full CI run #2222 also passed, including disposable PostgreSQL 18 fresh migration, historical function fixture upgrade on an existing table, full test suite, commercial-payment DB qualification, migration audit policy tests, and runtime boundary verification.
- CI log from the historical-table upgrade step: `PASS: historical functions were upgraded on the pre-existing table; authorization, RLS, owner, and ACL checks passed; transaction rolled back.`

PR #239 remains draft and unmerged. The only outstanding validation not covered by CI is a fresh read-only audit against the owner's qualified local database after checking out the branch, plus owner review of all pending migrations. No local/production database, ledger, Render service, or deployment was touched.

## 19. Pending migration source review blockers — 2026-11-09

Review of the eight post-2026-11-04 pending migrations found concrete release blockers; source review only, not runtime exploitation proof:
- `20261105190000_extend_business_directory_location_contact.sql` validates `avatar_letter`, `avatar_color`, and `years_in_business` patch keys but omits all three from the final `UPDATE ghm.business SET`, so those accepted fields are not persisted. Because this migration may have been applied elsewhere, do not silently rewrite it; determine environment application status and use a forward correction if needed.
- `20261105213000_create_business_capability_evidence.sql` grants table-wide direct `SELECT` to `ghm_runtime` while defining a `visibility` field, but this migration does not enable RLS or define tenant/visibility-filtered read access. Define intended visibility and Business membership policy, then replace broad read access with tested bounded access.
- `20261105230000_create_founder_directory_review.sql` intentionally leaves the founder reviewer allowlist empty; a separately approved reviewer mapping is still required before the workflow can operate.
- Logo storage binding is touched by both `20261106090000` and `20261107211500`; qualify fresh and partially reconciled states in timestamp order.
- `20261106200000` adds nullable Project→Opportunity linkage; verify app transaction behavior and legacy paths.

The remediation proposal on PR #239 now records these findings. PR remains draft. Do not merge or run migrations until these blockers are addressed, full tests pass, the local read-only audit is rerun, and the pending migration set is reviewed. No owner-local/production database or ledger was changed.

## 20. Profile patch forward fix and evidence-read review refinement — 2026-11-09

The release review identified that migration `20261105190000` accepted/validated `avatar_letter`, `avatar_color`, and `years_in_business` but omitted their assignments from the `UPDATE`. A forward-only correction is now staged in PR #239 as `20261109100000_persist_business_profile_presentation_fields.sql`; the earlier migration remains unchanged. The profile migration contract test now asserts all three assignments in the forward migration.

The capability evidence finding is refined: normal application reads are tenant-scoped because `listForBusiness` calls `withTenantTransaction` (active Business membership checked by `resolveTenantContext`) and filters on the requested Business ID. Therefore the source review does **not** establish cross-tenant exposure through the normal route. Defense-in-depth/product-contract gaps remain: `ghm_runtime` has table-wide SQL SELECT, table RLS is not enabled, and the `visibility` field is not used by the current list query or a public/authenticated discovery path. Define intended visibility behavior and decide on DB-level isolation before broadening reads.

Project creation source review confirmed Opportunity, participant, and Project inserts occur in one authorized transaction. Founder reviewer allowlist remains intentionally empty pending separately approved mapping. PR #239 remains draft; the new forward profile migration and test require exact-head CI/PG18 validation, and local read-only audit remains outstanding. No persistent database was touched.

## 21. PR #239 updated exact-head qualification — 2026-11-09

Current PR head `00a4e4239db6c9a0f6181ef7efa7300f1091d980` passed GitHub Actions quality run #2224 (`42533697225`) and Cloudflare Pages preview check. Quality steps passed: build; complete migration application on disposable PostgreSQL 18; historical Business registration function upgrade on an existing table with active-Business, RLS, owner, and ACL assertions; full test suite including the new avatar/tenure forward-migration contract; commercial payment settlement qualification; migration audit policy tests; runtime boundary verification. Cloudflare check is preview-only, not production deployment.

The profile-field persistence gap is addressed in new forward migration `20261109100000_persist_business_profile_presentation_fields.sql`; earlier migration bytes are unchanged. Capability evidence note was refined: normal application listing verifies active Business membership and filters by Business ID, so there is no demonstrated cross-tenant exposure through the normal route; broad runtime SQL SELECT/no RLS and unused visibility semantics remain defense-in-depth/product-contract gaps. Project create path was confirmed to insert Opportunity, participant, and Project in one authorized transaction.

PR #239 remains draft. Outstanding: owner's local read-only migration audit against this branch and human review of the full pending migration set. No persistent database/ledger or hosted resource was changed.

## 22. Owner-local read-only audit and PayFast checksum registration — 2026-11-09

Owner checked out PR #239 head `00a4e4239db6c9a0f6181ef7efa7300f1091d980` and ran `npm run audit:migrations` against `ghm_payfast_qualification`. Authority passed: expected database, read-only transaction, `session_user=ghm_migrator`, and post-`SET ROLE` `current_user=ghm_schema_owner`. Results before the PayFast registry follow-up: repository 90, ledger 92, canonical matches 79, missing repository migrations 9, unexplained mismatches 2 (the two PayFast versions), extra ledger rows 11, verified retained-history rows 11, unrecognized extras 0, invalid retained history 0, name mismatches 0, verdict INVESTIGATE. The nine missing rows are pending repository migrations, including the newly staged forward profile correction; they are not evidence of ledger loss.

The two remaining checksum mismatches were independently matched to exact SQL source bytes at commit `a1a046d17d04854bfc8259efaa02100b1ae09304`: `20261104120000` SHA-256 `da74451edd20fc331f9c13e26812f3ea1becf8bd0dffe5a62434f90478dca3ff`, and `20261104130000` SHA-256 `b7e1ace82904436845586ec09b813fe8d84e19ac2a743d1714937871b5e4f10f`. PR #239 now registers those exact values in `config/historical-migration-provenance-exceptions.json` and adds a regression test pinning both entries. This is explicit per-version provenance, not a wildcard/relaxed checksum bypass. Exact-head CI and a second local read-only audit are required to confirm the resulting classification; until then overall verdict remains INVESTIGATE.

No database mutation or migration execution occurred.
