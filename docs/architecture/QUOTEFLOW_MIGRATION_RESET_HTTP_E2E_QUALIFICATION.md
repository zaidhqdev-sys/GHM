# QuoteFlow migration reset — database-backed HTTP E2E qualification

**Status:** Implemented qualification harness; execution pending isolated non-production credentials.  
**Scope:** Synthetic test identities only. This does not migrate either real founder account or QuoteFlow local data.

## Command

```bash
export GHM_QUALIFICATION_ENV=non-production
export GHM_RUNTIME_DATABASE_URL='postgres://...runtime...'
export GHM_MIGRATOR_DATABASE_URL='postgres://...migrator...'
export DATABASE_URL="$GHM_RUNTIME_DATABASE_URL"
export DATABASE_SSL=true
export INVITE_CODE='non-production-invite-code'
export CORS_ORIGINS='http://127.0.0.1:3000'
export GHM_AUTH_TOKEN_PEPPER='...'
export GHM_JWT_ES256_PRIVATE_KEY_PEM='...'
export GHM_JWT_ES256_PUBLIC_KEY_PEM='...'
export GHM_JWT_ES256_KID='nonprod-key-id'

npm run qualify:quoteflow-migration-reset-http-e2e
```

Use the exact environment variable names and key format required by the current GHM configuration/key loader. The command must run only against a dedicated, isolated non-production database with migrations already applied. The runtime and migrator URLs must be distinct; runtime access must authenticate as `ghm_runtime`. Never copy production credentials into a local shell, CI log or repository file.

The script starts an ephemeral HTTP server bound to loopback and uses the real `createApp`, `PostgresAuthPersistence`, migration reset services and GHM authentication service. A deterministic in-memory delivery sink captures reset messages; no external email provider is called.

## Covered in this first slice

- Provisions two eligible synthetic migration accounts and one ineligible synthetic account.
- Uses the actual HTTP reset-request endpoint for unknown, ineligible and eligible addresses.
- Verifies unknown and ineligible addresses receive the same accepted response and do not trigger delivery.
- Verifies eligible requests deliver to the enrollment's approved address, not the address supplied to the request endpoint.
- Completes both reset flows through the actual HTTP completion endpoint.
- Verifies returned GHM access/refresh token responses are bound to the expected distinct account IDs.
- Verifies each pre-reset session is no longer usable.
- Exercises refresh-token rotation for each returned session.
- Verifies consumed recovery tokens cannot be reused.
- Verifies both independent enrollment rows transition to `completed`.

The script prints only a random run identifier, synthetic account count and check names. It does not print recovery tokens, passwords, email addresses or account identifiers.

## Cleanup

The script tracks only account IDs it created and removes their migration enrollment, recovery credentials, refresh credentials, sessions, external-identity mappings, password credentials and account identity in a single cleanup transaction using `ghm_schema_owner`. Cleanup runs in `finally`. If cleanup fails, the command fails; inspect only the synthetic run's rows using the privileged non-production cleanup procedure before re-running.

## Explicit limitations of this first slice

This qualification does not yet prove:
- the actual delivery provider, provider configuration, deliverability or inbox receipt;
- the live production API deployment or production configuration;
- expiry behavior, transaction rollback injection, HTTP log redaction under a forced error, or rate-limit exhaustion;
- protected-resource tenant/Business isolation after login;
- the identity mapping of either real founder account;
- recovery of QuoteFlow local data or its namespace-to-GHM-Business mapping.

Those are separate qualification items. Do not claim the full founder migration ceremony is qualified based on this synthetic test.

## Safety

- `GHM_QUALIFICATION_ENV=non-production` is an operator assertion, not automatic environment detection. Verify the database host/name and access role before setting it.
- Do not point this script at production. It creates and deletes account rows.
- Do not use real founder/customer email addresses, external subjects, passwords, tokens, local backups or device data.
- Do not enable QuoteFlow local storage scope or cut over real users based on this result.
