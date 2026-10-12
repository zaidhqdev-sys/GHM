# GHM Documentation Reconciliation — Third Pass — 2026-10-13

**Baseline:** `main @ 1f2b10d0850095311614c5b5f9531eb8b7cce860` (2026-10-12)
**Inventory:** 714 tracked tree entries; 209 Markdown files total, of which 206 are under `docs/` (10 top-level, 180 architecture, 16 evidence documents). Three further Markdown files are `SECURITY.md`, `database/README.md`, and `src/storage/README.md`.

## Scope and method

This pass reconciles high-authority living status documents against the identified mainline implementation and recorded qualification evidence. It updates the current-state index, remaining-work register, Connect production-readiness register, production replacement foundation, product capability/evidence inventories, construction sequence, checksum provenance record, storage boundary, and SQL privilege inventory. It preserves historical checkpoints and labels them as historical rather than rewriting them as current state.

This is a targeted reconciliation of the principal status and architecture authorities, not a claim that every historical Markdown paragraph is rewritten. Dated handovers and source audits remain historical evidence; readers should follow the current registers/contracts for present status.

## Corrections made

- Current-state and remaining-work indexes now identify the actual mainline checkpoint and preserve the October 5 checkpoint as historical baseline.
- PayFast checkout/ITN/provider-validation/server-confirmation implementation is recorded as merged and construction-tested; sandbox end-to-end qualification, production credentials, and enablement remain open.
- Cloudflare R2 signed PUT/HEAD/GET/DELETE and payload-integrity qualification is recorded as passed on 2026-10-05. Service/tenant authorization, product exposure, recovery/backup, deployment-managed credentials, and production enablement remain open.
- Selected Connect adapter seams and bounded service-trust/read boundaries are recorded as existing on main. Full workflow parity, product session/membership migration, shadow qualification, and production cutover remain separately gated.
- The construction sequence and product capability/evidence inventories are updated to distinguish implemented resource slices from complete product migration.
- Migration checksum provenance now records the current CRLF/LF normalization behavior: line-ending-only differences are compatible; genuinely different SQL remains fail-closed except for explicitly documented historical provenance. No ledger rows were rewritten and no migration was rerun by this code change.
- SQL privilege inventory now records the 2026-10-12 removal of direct `ghm_runtime` DML privileges on `ghm.business_external_mapping`; mapping use remains governed by the approved function boundary.

## Qualification evidence and remaining gates

The isolated dependency-refresh candidate based on this baseline passed `npm ci`, TypeScript build, `git diff --check`, the full configured test suite (560/560, zero failures and zero skips) with the explicit non-production sandbox test environment, and both production-only and full `npm audit` (zero vulnerabilities). This is candidate evidence, not evidence of deployment or live PayFast sandbox end-to-end completion.

Remaining gates include PayFast sandbox/runtime end-to-end qualification and production enablement; storage service/tenant authorization and operational recovery; independent bootstrap/legacy-role disposition; QuoteFlow-specific legacy provenance and migration qualification; Connect workflow parity, public directory/realtime ownership, shadow operation, rollback, and founder-authorized cutover. Issue #1 remains open until its complete production-foundation acceptance criteria have current evidence.

## Safety boundary

This reconciliation changes documentation only. It does not change source code, migrations, database state, credentials, Render configuration, DNS, product traffic, or provider state. No dependency lockfile is included in this documentation change.
