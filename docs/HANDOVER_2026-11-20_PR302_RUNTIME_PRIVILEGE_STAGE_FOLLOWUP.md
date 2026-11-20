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
