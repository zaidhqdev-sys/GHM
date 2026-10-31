# Reconciliation recovery handover — 2026-10-31

## Recovery baseline
- Working branch: `reconciliation/ghm-identity-mainline-restored-20261031`
- Recovery baseline: `22602ee26f3f79c3e93e76486adc8bf96af998b2`
- The conflicted merge was aborted locally; merge metadata was removed.
- The original integration branch remains unchanged.
- Local backup: `C:\\GHM-recovery-backup-20261031-233954` (1,047 files, approximately 115 MB, zero copy failures).
- Local TypeScript check subsequently passed; earlier editor diagnostics disappeared without source changes.

## Remote reconciliation work
All changes below are committed only to this recovery branch:
- `e081f746738781ca305446b896945a06a9c83ac2` — add runtime identity module.
- `2339f3899f30478ef274d83f110cccb04a93ca6b` — add runtime startup gate.
- `ddd2d9217dff4a21a5ba0bec2b7c538da1d6c533` — add runtime identity tests.
- `8cb0d51b1de4c9c8f7c53d3418df111ee177a1de` — add startup gate tests.
- `2c01677aa3b66c8384b6a46878751a7f0b5e1864` — add strict PostgreSQL TLS helper.
- `c6aa389518ab9eb15f198306fccded3f5452ef31` — add TLS tests.
- `4cc1aefa3749e383ba766d2ea0818210a3ba002d` — enforce runtime identity verification before HTTP listen.
- `e6471d62780225da716d94acdd012585b5519c13` — include runtime/TLS tests in npm test.
- `b9ddd6d88bab2814ec20cff928e2035d1263fcc9` — require GHM_RUNTIME_DATABASE_URL for the app pool.
- `28d5f1945cc67f851356f54e6b6802986cca4aec` — require PostgreSQL certificate validation when TLS is enabled.
- `ed85cd8c5a562f73c7780bbe4b7a6ef296e06c34` — update config tests for dedicated runtime URL.
- `e674b99ad4a73231ec58a9790348b012470eaf1c` — document runtime URL in .env.example.

## Current implementation decisions
- Server startup queries `session_user`, `current_user`, and `current_database()` through the runtime pool and does not call `listen()` unless the identity helper accepts the runtime role.
- The application pool now reads `GHM_RUNTIME_DATABASE_URL`, not the generic `DATABASE_URL`.
- Runtime role must be `ghm_runtime` as both session and effective user.
- TLS enabled means `rejectUnauthorized: true`.
- Migration pool remains separate and continues to use `GHM_MIGRATOR_DATABASE_URL` and explicit target guard.
- No database migration was run by this reconciliation work.

## Local verification required
After fast-forwarding the local recovery branch to this remote head:
```powershell
npm test
npm run verify:runtime
```
Do not deploy until the production service has an explicitly provisioned `GHM_RUNTIME_DATABASE_URL` using the dedicated `ghm_runtime` credentials and the production TLS connection has been independently validated.

## Safety boundaries
- Production Render service and production database remain off limits.
- Sandbox DB only for explicitly approved qualification fixtures and cleanup.
- No migrations, deployment, PR creation, main merge, or production configuration changes are authorised by this handover.
- Do not modify the original integration branch.


## Verification update — 2026-10-31 22:24 UTC
- Local recovery branch fast-forwarded successfully to `ab4408cd1bbaaea4b389c883560e9316b96143aa`.
- Local `npm test`: TypeScript build succeeded; 616 tests passed, 0 failed.
- Local `npm run verify:runtime`: passed.
- PowerShell pasted-output errors were command-prompt/output text accidentally re-entered; no repository changes resulted from those parser errors.
- The next migration-safety batch on this branch:
  - `4b4b1fc6f23fffc9150bdd9ae34e9d593130d702` — accept historical exact-byte BOM checksum before canonical/CRLF compatibility.
  - `fe75c61bcade3902cd7612131a85e3354c9c4b30` — test BOM + CRLF historical checksum compatibility.
  - `eda8c7783daee7d168712f5d84bba89f47281983` — require certificate validation for migration TLS.
- No migration command was run. No database was mutated. These changes have not yet been pulled or tested locally.


## Verification update — 2026-10-31 22:27 UTC
- Local recovery branch fast-forwarded to `f882a9efa8f4299e8c60ecaad0fb263712ae3e46`.
- Local `npm test`: TypeScript build succeeded; 617 tests passed, 0 failed.
- QuoteFlow recovery integration batch committed remotely after that verified baseline:
  - `758fdf0e935d2a13a315c3ecff514f16464c7fce` — secure recovery webhook delivery implementation.
  - `5a933955dbcacf2aaf1309c79860b30c72fcd24b` — webhook delivery security and failure tests.
  - `9e9b89d442b1cb72d3f501003f52f1a9950467f3` — wire migration reset recovery/completion through the app's single injected AuthPersistence instance.
  - `0b26b54afd07948dccb81ba02a644d6c84336be9` — include recovery delivery and reset service tests in npm test.
  - `0d851f344d639c801210bd771d4830774994bce4` — document optional recovery webhook configuration; both values must be set together.
- The reset recovery endpoint remains unavailable (503) unless an operator explicitly configures the HTTPS delivery URL and strong bearer token. No token is returned by the HTTP API.
- The existing mainline `authPersistence` injection is preserved and shared by password reset, QuoteFlow reset recovery/completion, and lazy auth-service session issuance.
- This batch has not yet been pulled or tested locally. No database migrations, fixture mutations, deployment or production configuration changes were made.


## Verification update — 2026-10-31 22:47 UTC
- Local recovery branch fast-forwarded successfully from `31f2c26c` through the two correction commits to `57701855`.
- Local `npm test`: TypeScript build succeeded; 646 tests passed, 0 failed.
- The first compile attempt exposed a malformed regular expression in the business-engagement migration contract test and assertions against fields not present in the public business contract. Both were corrected on this recovery branch before the successful 646-test run.
- Business identity/engagement batch:
  - Added business engagement and business registration identity domain services, repositories, contracts and tests.
  - Added HTTP route modules and wired them into `createApp` with injectable service dependencies.
  - Added both resources to the authorization resource union and per-role resource access list; registered only `business_engagement.create` and `business_registration_identity.read/update`.
  - Restored `database/migrations/20261019190000_create_business_engagement_events.sql` and `database/migrations/20261019210000_create_business_registration_identity.sql` as source files.
  - Added migration contract tests for both schema boundaries and included new domain/router/migration/reset-enrollment tests in `npm test`.
- Batch commits include `d6624652be19c34ffe0cac814538aa1c7b26fcd4`, `34b217f23a6a79bcf9b6c7217bb8556ee201e263`, `36298e0c2033bd11bc538c60203d51f280e483bf`, `6431c2da6ed9fb718f2d6bd59e7634f3dd9f51be`, `a011bd21302079119277548a4babb4c1668aebff`, `cf955adda30709d626f186b38b81bc4af2f6f44d`, `d92b4c4286bc5cf4282269e7286360e171bd4142`, `f9327ba522ff3f484539ccb85f0da7528f5dd454`, `9dd5d0f0497d563005de08d197d442527a8599aa`, and `57701855ef94c0b70a5aa302724ea07ce3299ab1`.
- These migration files are source changes only. No migration command was run, no DB was mutated, and no deployment occurred.
- This batch is now locally verified by the 646-test passing run above.

## Reconciliation review — 2026-10-31
- Compared recovery-branch authorization and registry changes with main: the new business_registration_identity and business_engagement resource entries are additive; the existing role/resource entries and authorization helpers are retained.
- Reviewed src/http/app.ts: business identity and engagement services are dependency-injectable; the existing injected authPersistence remains the shared persistence for password reset and QuoteFlow reset flows.
- Reviewed private registration identity boundary: owner/administrator membership is checked in the tenant repository and again in the SECURITY DEFINER SQL functions; direct runtime table privileges are revoked; registration number/legal name are not present in general or public Business DTOs.
- Reviewed engagement boundary: authenticated account context supplies the persisted account ID; request bodies cannot supply an account ID; event type/source/context are allow-listed and active approved Businesses are required.
- Migration order is timestamped after the existing Business and account identity foundation migrations. These files remain source-only; no migration was executed.
- Candidate-only identity/profile and QuoteFlow work is not yet ported. The candidate adds identity-authority, directory profile, account-email/external-mapping and QuoteFlow business-provisioning migrations. These must be reconciled as a dependency-ordered set against the recovery branch's existing 20260916250000 profile/Trust migration and 20260921120000-series account identity migrations; do not cherry-pick the candidate's final identity-authority permission revocation without its function contract and caller review.
- The candidate's latest 20261031100000_restrict_identity_authority_reader.sql revokes runtime execution of ghm.auth_read_connect_identity_authority(bigint). That function/migration is not present on the recovery branch, so this revocation is intentionally not copied in isolation.
- No production or sandbox DB was accessed or mutated. No deployment, PR, merge to main, or integration-branch modification occurred.

## Connect identity foundation batch — 2026-10-31
- Ported the candidate's explicit Connect account intent/role and founder directory reviewer contract, external account mapping (migration-only lookup), authenticated account-email reader, and narrowly scoped account-profile row-lock UPDATE grant.
- Ported the final identity-authority permission restriction as a separate later migration. The earlier SECURITY DEFINER reader is not left executable by ghm_runtime; its output includes system-admin/reviewer authority and there is no reviewed runtime caller in this branch.
- Added SQL contract tests for account email, external mapping, and identity-authority permission restriction; registered all three in npm test.
- Migration dependencies reviewed: account email function follows the existing password credential migration; account row-lock grant follows the new Connect authority columns; external mapping references canonical account identity and remains inaccessible directly to runtime/migrator.
- Not ported yet: public directory columns/profile function and QuoteFlow business provisioning. Directory profile mutation replaces the existing SECURITY DEFINER profile function and must be reconciled with recovery's Trust/profile hardening rather than copied verbatim. QuoteFlow provisioning remains separate until directory and external mapping contracts are reconciled.
- Candidate QuoteFlow attestation/decision tests contain a contradictory idempotency assertion (the test expects an attestation subject to change to the GHM account ID). Those files are not ported pending correction and review.
- New batch commits include 149a50203cb7329495267ec286f055c97d5052fa, a7864d33cba4ebe7cc0106ba0ef1302a57536e89, dd3861f0ee05918faf08f5acde7614da0b6543fe, 85df4d1121e8993fd1661efa681c2e2fdeb20f10, a3b94c8e970f60f052f630be4ce4c9d525c3f994, 6b67d4c5be110fd178e7980e0718586dfc12e744, d166df2df9fe4a3e00da50935f118ef5322d05ae, ab77bb4771fa3241023009d69e1c42700a131e8a, and 85c30e878886ce0b0a65a838e3401774d7662af1.
- Source-only changes. No migration execution, database access/mutation, deployment, PR, merge to main, or integration-branch modification.