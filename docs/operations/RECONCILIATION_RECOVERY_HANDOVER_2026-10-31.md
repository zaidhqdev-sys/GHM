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
