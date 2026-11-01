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
## QuoteFlow Business provisioning and identity attestation batch — 2026-10-31
- Added the migration-only QuoteFlow organization-to-GHM Business provisioning function and its follow-up migration correcting the initial status to the canonical `unverified` value. The function creates only an inactive Business, one explicitly approved active owner membership, exact Supabase external mapping, and review-evidence audit in one transaction. It is executable only by ghm_schema_owner; runtime/public access is revoked.
- Added the typed provisioning service and focused service tests; added migration contract tests covering provenance, atomic write shape, unverified/inactive state, and privilege boundary.
- Ported the ES256 QuoteFlow identity-link attestation verifier and its cryptographic tests as isolated groundwork; no route or persistence integration has been enabled.
- Corrected identity-link decision test expectations: QuoteFlow subject IDs and GHM account IDs are separate namespaces. The test no longer expects the QuoteFlow subject to equal the GHM account numeric ID. This helper remains unintegrated and must not be treated as an authorization endpoint; its business confirmation boundary needs a stronger membership-resolved type before any route uses it.
- Registered the QuoteFlow provisioning, attestation, decision, and migration contract tests in npm test.
- Directory schema/profile migrations remain held. The profile migration replaces a SECURITY DEFINER function and requires exact reconciliation with recovery's current profile validation and Trust constraints. No public directory route is added in this batch.
- Batch commits: `422977b0dd4ca040b32337e521d953235600e8f7`, `6e88b6fb22d6b42093f3cda79324a12fc1241494`, `74c43e766aaa9b6d4b70d8953267492e4689cc31`, `31740f44c9290733e469d2e2438447edebf30727`, `0b0186e427bd32b9efd15e82795925f00db12188`, `a65b7a47087ba0991123d96ba67c87265310bd71`.
- Not yet locally pulled or tested. Source-only; no migration execution, database access/mutation, deployment, PR, merge to main, or integration-branch modification.
## QuoteFlow attestation test correction — 2026-10-31
- User pulled the provisioning/attestation batch at `7d5d7c9a` and reported `npm test`: TypeScript build passed; 674 passed, 1 failed.
- Failure was isolated to the valid-attestation test fixture. `jsonwebtoken`'s `noTimestamp: true` option removes the supplied `iat`, so the verifier correctly rejected the otherwise valid token as missing required timestamps.
- Corrected only the test signing helper to allow jsonwebtoken to retain the explicit `iat`; verifier validation remains unchanged and strict.
- Fix commit: `7bc0e90d9c677b9efcc4164935fcaa693855a42d`. Awaiting local pull and full test run.
- No DB, migration execution, deployment or production changes.

## Directory profile reconciliation — 2026-11-01
- Added forward-only directory metadata migrations: `20261101090000_add_business_directory_profile_fields.sql` and `20261101100000_extend_business_profile_directory_fields.sql`.
- Kept category normalized through `ghm.business_category_assignment`; did not add a duplicate `business.category` field.
- Extended owner/administrator profile mutation only for province, city, physical address, WhatsApp, website, self-declared supplier flag, and years in business. Existing name/slug/description/phone/email behavior and SECURITY DEFINER membership check remain.
- Protected logo/avatar references, tier, featured state, analytics, verification and Trust fields from owner profile mutation. Runtime grants remain narrow; no table-wide UPDATE grant was added.
- Extended business identity and public directory DTO/repository projections and request validation for the new fields. Directory search keeps its existing category-assignment filter and visibility guard.
- Added migration contract test and registered it in `npm test`.
- Relevant commit sequence: `2c98b73973489e1de879f29ed781aadf3f0f54a9`, `72dfed1657c1cfa13ceb9d5fa83c93a6a6633dd9`, `7533d2e3b7ba17e0768d8b126a07d69eb7977d55`, `fbdd87bdff1717cc2eb2a04143cd2710c2d23e19`, `2060cf94702c4fade4eac5c90dc85b67856dc1e2`, `6d99c8f5ff111633c5de7532a2a866e6f5eb0aa3`, `6e5fbec76e2be4cdc60fa17d5b4b10185dc6212f`, `e23c0413448b3cd54c8e187fba1ea2cdd13c930e`, `37da533dca6e08da8347e8a62d1cc8ae5ec7ad89`, `1fe4edc5c69c89f2cb1f2aa0a633fab1914452d1`, `00418ae92a14a61defb34c8b8a95a09dab8b2832`, `c8b542cd21b89e1eafd9aeede232738da56d9004`, `60d8518f54e608b757d74a3985f8e8320dc883a9`.
- Awaiting local TypeScript build and full test verification. No migration was executed; no database, deployment, production service, PR, main branch or integration branch was touched.


## QuoteFlow Business provisioning database qualification — 2026-11-01

- The QuoteFlow Business provisioning migration qualification is now **QUALIFIED / PASS** on the isolated, disposable local PostgreSQL 18.6 cluster. Evidence: `docs/evidence/QUOTEFLOW_BUSINESS_PROVISIONING_DB_QUALIFICATION_2026-11-01.md`; execution plan: `docs/architecture/QUOTEFLOW_BUSINESS_PROVISIONING_EXTENDED_QUALIFICATION_PLAN.md`.
- The user fast-forwarded the local recovery branch to `efe9168a616412c62fe5a4d38e6c0e180ce045c3` before running the qualification. All 91 migrations were applied to `ghm_qualification` at `127.0.0.1:5440` with certificate-verified TLS. Synthetic active business owner fixture ID was `1`; no real/founder account was used.
- Baseline rollback-only qualification: **PASS**; all privilege, provisioning, retry/conflict, provenance and rollback checks passed; no committed provisioning mutations.
- Test A forced mid-write atomicity: **PASS**; injected audit-trigger SQLSTATE `P0001`; zero partial resource rows; test-only DDL absent after rollback.
- Test B two-session concurrency: **PASS**; A returned `created`, B returned `already_provisioned` with matching IDs; PostgreSQL directly showed B waiting on an advisory lock; final counts were exactly one Business, one active owner membership, one mapping and one exact audit row.
- Test B database disposition: **PASS**; the database was immediately dropped and recreated after the test. Both test and cleanup exit codes were `0`.
- Qualification-only observer grants (schema `USAGE` for `ghm_migrator` and `SELECT` on the four count/catalog resources) were confined to the disposable database and discarded when it was dropped. No qualification script or application source was edited.
- Current local qualification database state: newly recreated and empty; owner `ghm_schema_owner`; CONNECT revoked from PUBLIC and granted to `ghm_migrator` and `ghm_runtime`. Do not treat it as migrated or fixture-ready without a fresh migration and fixture setup.
- No production database/service, deployment, production credentials, founder-owned accounts, original integration branch, main merge, or PR was touched.
- Next safe work: review the next bounded source/implementation task against the updated qualification evidence. Do not infer that production cutover or full QuoteFlow identity-link integration is authorized by this database qualification.
