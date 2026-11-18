# GHM Project detail/update API — 18 November 2026

## Purpose

Connect's authenticated Project service client already calls `GET /api/v1/projects/:projectId` and `PATCH /api/v1/projects/:projectId`. The GHM Project service and repository contracts already provide account-scoped `getOwnedProject` and `updateOwnedProject`, and the update input parser already exists in `src/http/app.ts`, but the HTTP routes were missing.

## Change

- Add authenticated Project detail GET and update PATCH routes.
- Require registered Project read/update operations.
- Restrict Project detail read and update to customer accounts; administrator and business roles are denied, matching the customer-owned Project repository contract.
- Derive the actor from the verified GHM auth context; no client-supplied account ID.
- Delegate ownership enforcement and persistence to the existing Project service/repository.
- Return 404 for an unowned/nonexistent Project; reject malformed IDs and invalid update payloads.
- Add HTTP integration tests for successful read/update, not-found, and business-role denial.

## Scope

No deletion endpoint is added. No database schema or migration, production data, deployment, payment provider, new service, or paid resource is involved. The branch is draft until CI and authorization tests pass.


## Role boundary correction

The existing Project repository scopes records to the authenticated account ID and does not implement administrator-wide ownership bypass. Therefore detail read and update routes are customer-only, matching the existing Project list route. The Project create route now also explicitly rejects non-customer roles. Business-role integration tests cover denial for GET, PATCH and POST.


## CI investigation — 18 November 2026

- The TypeScript build, Actor Gateway Worker dry-run bundle, GHM web build and all 26 web tests passed in run 44207713671.
- The migration step failed at `20261117020000_revoke_runtime_capability_governance.sql` while validating `ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text,text)`.
- The first attempted whitespace-normalization correction did not resolve the failure. The subsequent migration history review identified the actual mismatch: `20261112090000_pin_security_definer_search_path.sql` deliberately pins every GHM `SECURITY DEFINER` function to `search_path = pg_catalog, ghm, pg_temp`, and `20261112140000_add_signed_storage_metadata_actor_gateway.sql` explicitly preserves that three-entry path on the shared signed assertion verifier. The later cutover guard incorrectly required only `pg_catalog, ghm`, so it rejected the intended temporary-schema-safe configuration.
- Commit `e5bdfdb409a4607fbf3040be04ea9a0c7d9b928f` updates the guard to accept only the canonical pinned path `pg_catalog, ghm, pg_temp` after whitespace normalization. This preserves the security invariant: `pg_catalog` first, trusted `ghm` second, and `pg_temp` explicitly last. It does not permit arbitrary schemas or remove the owner, `SECURITY DEFINER`, ACL, or runtime-denial checks.
- This correction is awaiting CI qualification. The earlier metadata diagnostic commit remains in branch history but the final guard uses the generic failure message again.
- The same run's web audit reports five high-severity findings caused by the single picomatch ReDoS advisory GHSA-fc5q-39xc-vjpf across the Vite/Vitest dependency tree. The installed version is picomatch 4.0.7. The current advisory says versions through 4.0.7 are affected and does not publish a patched version. Do not force-downgrade Vite or suppress the audit; recheck for an upstream patched picomatch release before remediation.
- The GHM CI workflow currently applies the full migration set to disposable PostgreSQL before running later qualification steps. This is CI-only, not production, but it is the long-running step. No production database was touched.
- No migrations were applied to Render, no production data changed, and no services or paid resources were added.


## Latest API authorization hardening — 18 November 2026

- Project PATCH previously admitted the `admin` role even though the repository update operation remains strictly scoped to `context.userId`. That mismatch did not provide a valid administrator-wide update path and contradicted the customer-only Project contract.
- Commit `c4462abdec2aaa3746c21974f00a6202c49ce022` makes PATCH customer-only.
- Commit `ecc08472ebff8e2c280e0cd60e6cb448f4e3430d` adds an HTTP contract test proving both Project GET and PATCH reject an administrator context. This second commit is on the branch but has not yet received a dedicated CI run.
- No production API deployment or database change has occurred.


## Final migration guard finding — 18 November 2026

- The failure was caused by an inconsistency between the global SECURITY DEFINER path pinning migration (which requires `pg_catalog, ghm, pg_temp`) and the later capability cutover guard (which incorrectly required `pg_catalog, ghm`).
- The fix now validates the exact pinned three-schema path, with whitespace normalization only. It does not relax ownership, SECURITY DEFINER, gateway-only execution, or runtime denial requirements.
- Project PATCH now explicitly denies administrator roles as well as business roles, matching the account-owned Project service contract. A dedicated admin denial HTTP test was added.
- The branch has not been merged or deployed. All migration execution remains CI-only against disposable PostgreSQL.


## CI result and Project route test correction — 18 November 2026

- Run [44210945203](https://github.com/zaidhqdev-sys/GHM/actions/runs/44210945203) completed. All migrations applied successfully to disposable PostgreSQL. The isolated auth issuer baseline qualification, isolated Actor Gateway principal qualification, local Actor Gateway Worker smoke test, Argon2id interoperability qualification, storage provider attestation qualification, storage metadata grant/revocation qualification, signed Connect Business provisioning qualification, Business registration forward migration qualification, Opportunity marketplace SQL qualification, and storage lifecycle/tenant authorization qualification all passed.
- Correction to the earlier interim report: the isolated Actor Gateway principal did **not** fail. It passed. The 7 failures were all Project HTTP tests in `src/http/app.test.ts`; the tests used `business` auth contexts after the route contract had been changed to customer-only. Expected customer operations consequently returned 403 before reaching payload validation/service execution. The implementation's role guard behaved as designed; the test fixtures were stale.
- Commit `f697549eafa605033f1ec355886f939a7e34356e` updates the seven customer-operation fixtures/assertions to use customer contexts.
- Commit `72f4b82340c6862a8d7c11a8d7810550aff973f2` adds explicit HTTP denial coverage for both business and administrator roles across Project create, detail read and update, asserting the Project service is never called.
- The run's web dependency audit remains blocked by five high-severity findings in the existing picomatch/Vite dependency tree. No force downgrade or audit suppression has been applied.
- A new CI run is required for the latest two commits. No merge, deployment, production migration, payment activation, or paid infrastructure change has occurred.



## CI result and picomatch security audit follow-up — 18 November 2026

- Run [44213277321](https://github.com/zaidhqdev-sys/GHM/actions/runs/44213277321) completed. The `quality` job passed, including migration application to disposable PostgreSQL, Capability catalogue governance lifecycle qualification, legacy capability RPC cutover, gateway-only access checks, runtime boundary verification, the complete test suite, and the other listed database/security qualification steps.
- The `web-quality` job passed dependency installation, web build, and all 26 web tests. Its only failed step was `npm audit --audit-level=moderate`.
- The audit log identifies five high-severity findings, all arising from one advisory, GHSA-fc5q-39xc-vjpf / CVE-2026-112366, for picomatch ReDoS via single-branch repeated extglobs. The five entries are dependency-path repetitions, not five distinct package vulnerabilities.
- The current lockfile resolves one picomatch package at 4.0.7, marked development-only. It is reached through the Vite/Vitest toolchain (including fdir/tinyglobby). The finding is therefore in the build/test dependency tree, not the production React runtime dependency set. This does not make the audit finding irrelevant or justify suppressing it.
- The upstream proposals specifically addressing this CVE include picomatch PRs #237 and #238 for the 4.x line and #246 for the 2.x line. These are proposals, not an official published patched release. A more comprehensive proposed bounded-ambiguity guard is in upstream PR #261; it changes compatibility behavior for ambiguous/unproven repeated patterns and is not an approved upstream release. Do not copy it into GHM without independent review and regression validation.
- The advisory is marked unreviewed in the GitHub Advisory Database, and an upstream issue comment reports that a dispute has been submitted. The advisory remains present and npm audit still fails on it. Treat the scanner result as an active CI gate until the advisory is formally withdrawn or a verified remediation is available; do not infer that the report is false merely because it is disputed.
- Correction to the previous interim investigation: the earlier-mentioned upstream PRs #259/#262 are not the primary proposals for this specific CVE. The relevant focused proposals are #237/#238/#246; #261 is a later, broader mitigation proposal.
- No dependency override, package fork, audit exception, forced downgrade, or security-gate suppression has been introduced. No code change or additional CI run was made as part of this investigation.
- Next action: monitor the specific upstream CVE proposals/advisory status and evaluate a published fix when available. If a pre-release mitigation is considered, it must be reviewed against the affected matching semantics and adversarial regression corpus first. Keep PR #299 draft until the audit gate is legitimately resolved.
- No production database, production service, payment activation, new paid infrastructure, or deployment was touched.



## Dependency remediation review — 18 November 2026 (follow-up)

- Rechecked the upstream advisory and proposals against their current records. Correction to the prior handover entry: GitHub's advisory now reports `github_reviewed: true`, reviewed on 17 November 2026. The advisory is therefore not merely an unreviewed scanner assertion. It still lists picomatch through 4.0.7 as affected and has no patched version. The CVE remains published. A separate upstream comment says the CNA dispute/review is being pursued; that does not withdraw the GitHub advisory or clear npm audit.
- The GHM lockfile on this branch contains exactly one `node_modules/picomatch` entry, version 4.0.7, marked `dev: true`. The web package has no direct picomatch dependency; it is brought in by the Vite/Vitest build/test toolchain. This remains a development dependency exposure and a CI supply-chain gate, not evidence that picomatch is shipped in the React production bundle.
- Inspected upstream PR #237's exact `lib/parse.js` patch. It attempts a semantics-preserving collapse for a single branch containing a non-globstar star, including the advisory's `+(*)` and `+(*a)` forms. However, the reviewer notes that multi-branch forms such as `+(*a|*b)` remain outside its current coverage. Its capture-mode semantics and full regression behaviour still require independent execution before adoption.
- Inspected upstream PR #238's exact patch and review comments. Do **not** adopt it: its leading-quantifier test leaves the bare `+(*)` advisory case unhandled, and the proposed literalization changes the meaning of `+(*a)` (it no longer matches ordinary glob strings such as `xa`). This is a concrete semantic regression identified in the PR discussion.
- PR #261 is a much broader fail-closed ambiguity checker. It changes accepted-pattern behaviour by throwing on ambiguous/unproven repetitions, so it is not a drop-in dependency fix and is not approved for GHM without a separate compatibility design and extensive tests.
- The upstream PRs #237, #238 and #261 remain open as of this check; no maintainer-published patched npm release was identified. A private fork or forced git override would create an ongoing maintenance and provenance burden, and the current environment cannot generate and validate a correct npm lockfile for such a substitution.
- Decision: no package override, local patch, fork, audit waiver, or code change is safe to commit from remote-only inspection. The previous handover recommendation to wait for a verified release stands, with the added explicit rejection of PR #238's semantics-changing workaround. A future candidate must cover at least `+(*)`, `+(*a)`, `*(*)`, `*(*a)`, multi-branch repeated-star forms, capture mode, Windows/Bash/dot options, and bounded adversarial execution; it must also pass the complete web test/build/audit workflow before adoption.
- No additional CI run was started. PR #299 remains draft. No production database, deployment, payment activation, or paid infrastructure was touched.



## Upstream maintainer position and advisory-status reconciliation — 18 November 2026

- Inspected upstream picomatch PR #235 and its discussion. PR #235 is closed without merge. The picomatch maintainer explicitly disputes the CVE's characterization, stating that globs are regular expressions, the general star-height problem is not generally solvable, and users should not allow untrusted users to define patterns/regular expressions. A further commenter says a CNA dispute was submitted. This is material upstream context and supersedes any implication that a maintainer-approved patch is imminent.
- The advisory-status metadata is inconsistent across aggregators at this time: the GitHub Advisory search result labels GHSA-fc5q-39xc-vjpf "Unreviewed", while OSV's imported GitHub advisory metadata reports `github_reviewed: true` with a review timestamp of 17 November 2026. NVD still lists the CVE and affected versions through 4.0.7. Do not state categorically that the advisory is either withdrawn or definitively reviewed; it remains present and is still returned by npm audit.
- Upstream PR #237 and #238 are still proposals; PR #238 has a concrete reviewer-identified correctness gap: it fails to cover the bare `+(*)` case and literalizes `+(*a)`, changing glob semantics. PR #261 is a broader fail-closed proposal. PR #235's proposed mitigation was closed without merge after maintainer dispute. None is an approved upstream release.
- The GHM web lockfile marks its sole picomatch 4.0.7 package as development-only. That reduces direct production-runtime exposure, but does not eliminate build/test supply-chain exposure or justify silently removing the finding from CI. This remote-only review did not establish whether any GHM code path passes attacker-controlled glob patterns to picomatch; no such exposure should be claimed either way without inspecting the actual branch source and its callers.
- Decision remains unchanged: do not introduce an unreviewed fork, override, patch, audit waiver, or dependency downgrade. Keep the existing audit gate visible while the advisory remains in npm audit. Revisit only when GitHub/NVD/npm advisory state changes or a maintainer-approved release/mitigation becomes available. If a risk-based CI policy is later considered, it must explicitly distinguish production runtime dependencies from development/build tooling and retain a visible, documented development-toolchain finding rather than suppressing it.
- No source-code changes, dependency changes, new CI runs, merges, production changes, deployments, payment activation, or paid infrastructure were made during this follow-up.



## GHM source and dependency-boundary inspection — 18 November 2026

- Inspected the branch's root `package.json` and root `package-lock.json`. The backend package's direct runtime dependencies are AWS S3 SDKs, argon2, cors, dotenv, Express, express-rate-limit, jsonwebtoken, pg and socket.io; its dev dependencies include TypeScript and the local Actor Gateway Worker parser stub. The root lockfile contains no picomatch package entry and no picomatch dependency reference. Therefore the backend's production install/lockfile is not the source of the five audit findings.
- Inspected `web/package.json`: the only direct runtime dependencies are `react` and `react-dom`. Vite, `@vitejs/plugin-react`, TypeScript and Vitest are development dependencies. Inspected `web/vite.config.ts`: Vite configures React and Vitest's Node test environment; it does not configure an application glob-pattern feature.
- Inspected the web lockfile: it has one `node_modules/picomatch` entry at 4.0.7 with `dev: true`. This confirms the audited package is in the web development/build/test dependency tree.
- Inspected `.github/workflows/ci.yml`: the `web-quality` job runs `npm ci`, `npm run build`, `npm test`, then `npm audit --audit-level=moderate` in `web/`. The root `quality` job does not install or audit a root picomatch dependency. The failure is consequently scoped to the web toolchain audit step.
- Repository code-search requests for direct `picomatch`, `micromatch`, `fast-glob`, `minimatch` and `globSync` references returned no matches. The code-search connector searches the default branch, not the PR head, and its empty results are not a complete source-tree proof. No direct GHM application caller was found in the inspected material, but a full recursive source scan of the PR head still requires the actual checkout.
- Current public advisory cross-check: OSV imports the GitHub advisory with `github_reviewed: true` and review timestamp 17 November 2026; the advisory still marks versions through 4.0.7 affected and lists no fixed release. npm's current package page still shows 4.0.7 as latest. The maintainer dispute does not withdraw the advisory. Sources checked: OSV GHSA-fc5q-39xc-vjpf, npm picomatch version history, and the advisory revision record.
- Risk assessment: evidence currently supports a development/build/test supply-chain finding, not a demonstrated GHM production-runtime exposure. However, development tooling can still process repository-controlled patterns and build inputs, so the CI audit should remain visible. Do not disable dev dependency auditing, move tools between dependency sections to game the scanner, or weaken the gate.
- Recommended next step: run a recursive import/caller scan in the actual PR-head checkout (including scripts and config) and determine whether any user-controlled data reaches glob matching through Vite/Vitest or another tool. If no such path exists, retain the finding as a documented build-toolchain risk while waiting for an upstream decision or fixed release; do not claim zero risk.
- No dependency changes, source changes, new CI runs, merge, deployment, production database changes, payment activation, or paid infrastructure were made during this inspection.
