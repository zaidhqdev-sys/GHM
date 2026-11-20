# PR #302 runtime privilege-stage follow-up

**Date:** 2026-11-20  
**Related:** PR #302, PR #301, PR #298, PR #300, PR #297  
**Status:** Root cause isolated; no source correction yet.

## CI evidence

Exact-head PR #302 commit `e4d9e1f215e91f7bab3a97256560f1d7c076a679` completed:
- `web-quality`: passed
- Cloudflare Pages: passed
- `quality`: failed at `Qualify isolated actor gateway database principal`

The disposable PostgreSQL migration sequence progressed past the previous signed capability verifier `search_path` guard. The next failure occurred before Gateway-specific identity/ACL assertions, at the initial `assertRuntimeDatabaseFunctionPrivileges(await readRuntimeDatabaseFunctionPrivileges(runtimePool))`, with `Runtime database function EXECUTE allow-list mismatch`.

## Source-grounded mismatch

Observed runtime state has the three legacy capability governance functions revoked and `update_business_registration_identity(bigint,bigint,text,text,text)` revoked, while `read_business_registration_identity(bigint,bigint)` remains executable.

`src/db/runtime-database-privileges.ts` currently models `registrationIdentity` as one group containing both read and update signatures. Automatic migration `20261117010000_revoke_runtime_business_registration_identity_write.sql` revokes only the update signature. Separate manual cutover `database/cutovers/20261111020000_revoke_legacy_registration_identity_runtime.sql` revokes both read and update. The current all-or-nothing stage model therefore cannot represent the intended automatic write-only intermediate state before the manual read+write cutover.

This is not evidence that Gateway identity or Gateway ACL checks failed; those checks have not yet been reached.

## Next action

Inspect `src/db/runtime-database-privileges.test.ts`, the manual registration cutover SQL, migration/cutover execution order, and every reference to `registrationIdentity`. Design an explicit write-only intermediate stage while preserving the full read+write manual cutover stage. Add focused tests for both states, then rerun exact-head CI.

PR #302 remains draft/unmerged and quality is failing. PR #301 remains draft/unmerged and not deployable. Do not merge or deploy. No production SQL, migration, DB role/ACL, Render configuration/deploy, secret, payment state, or paid resource was changed.

## Correction implemented — automatic registration write-only state

Inspected `src/db/runtime-database-privileges.test.ts`, the exact manual cutover SQL, automatic migration, and runtime stage model.

The automatic migration `20261117010000_revoke_runtime_business_registration_identity_write.sql` removes only `ghm.update_business_registration_identity(bigint,bigint,text,text,text)`. The later manual cutover `database/cutovers/20261111020000_revoke_legacy_registration_identity_runtime.sql` removes both read and write signatures. The previous model incorrectly treated these as one indivisible transition.

On PR #302 branch `fix/actor-gateway-capability-cutover-search-path-20261120`, split the registration privilege transition into independent exact groups:
- `registrationIdentityWrite`: automatic migration's write-only revoke.
- `registrationIdentityRead`: later manual cutover's read revoke.

Added an explicit `RUNTIME_POST_REGISTRATION_IDENTITY_WRITE_FUNCTIONS` state: read remains executable, write is absent. Existing full registration-cutover states still require both read and write to be absent. Expanded the stage matrix from 512 to 1,024 exact combinations (ten independent transitions), kept the fully cut-over inventory at 13 functions, and added regression assertions for the intermediate and final registration states. No grant is restored and no authorization check is relaxed.

Commits include `cbb00be91e2545a7c5c32cb3cee4e1795c9a5ba3`, `15e3c593bab7390d232a6b53167a0a407c1f1588`, and `8f619799c07aab2ca7a070ccaf10b6d06444a9a1`. PR #302 now has four changed files and remains draft/open/unmerged.

Exact-head CI run #5483 is running:
- `quality`: in progress
- `web-quality`: in progress

No Render deploy, merge, production SQL, migration, DB role/ACL change, secret/environment update, payment-state change, or paid resource change occurred. PR #301 remains draft and is not deployable until its own exact-head CI passes after the migration/privilege corrections.

## PR #302 exact-head quality result — third blocker isolated

Exact-head run #5483 for PR #302 commit `8f619799c07aab2ca7a070ccaf10b6d06444a9a1` completed:
- Cloudflare Pages: passed
- web-quality: passed
- quality: failed at step 51, `Qualify system-admin Capability catalogue governance on disposable PostgreSQL`

Fetched the full job log and exact failure context. The previous runtime privilege-stage mismatch is cleared: the run progressed through all migration, runtime-principal, gateway-principal, signed assertion, and Business Capability lifecycle qualifications. The capability catalogue script passed non-admin service read denial, runtime/gateway role-separation checks, gateway admin listing, context-substitution rejection, forged assertion rejection, replay rejection, operation binding, non-admin gateway denial, and gateway draft creation.

It then failed at `scripts/qualify-capability-catalogue-governance.mjs:148`: the script calls `service.createDraft(admin,...)`, which uses the legacy runtime RPC `ghm.create_capability_draft`; PostgreSQL returns `permission denied for function create_capability_draft`. This is the intended gateway-only cutover state, not a database migration/ACL defect. The manual capability cutover revokes runtime execution of legacy create/update/transition functions. The qualification script still attempts subsequent successful create/update/lifecycle operations through the runtime-backed `CapabilityServiceImpl`, despite having already proved Gateway positive operations. Its direct runtime non-admin/version-guard assertions later in the script likewise need to be reconciled with the post-cutover expected permission denial.

Do not restore runtime EXECUTE or weaken the manual cutover. Next correction should be isolated to the disposable qualification harness: exercise post-cutover positive create/update/lifecycle through the signed Gateway SQL wrappers, and assert direct runtime calls to legacy RPCs are denied. Keep pre-cutover application-level service authorization assertions where their setup genuinely runs before the cutover; otherwise adjust test ordering explicitly and document it. Review all remaining `service.createDraft`, `service.updateDraft`, `service.transition` and direct runtime legacy RPC calls in the script before editing.

PR #302 remains draft/unmerged with quality failed; PR #301 remains draft/unmerged and must not deploy yet. No production SQL, role/ACL, Render setting/deploy, secrets, payment state or paid resource changed.
