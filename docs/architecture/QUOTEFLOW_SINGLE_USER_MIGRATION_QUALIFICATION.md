# QuoteFlow Founder-Account Migration Qualification Plan

**Status:** QUALIFICATION PLAN — TWO FOUNDER-OWNED ACCOUNTS; QUALIFY ACCOUNT PATHS INDIVIDUALLY

The two known QuoteFlow accounts are both founder-owned; one is the founder account, not an unrelated third-party user. Do not treat this as a general multi-customer migration or assume the accounts are interchangeable. Qualification should use synthetic data to prove the account migration/reset path and preserve each account's exact source identity and intended canonical mapping.

## Scope

The qualification covers synthetic representations of the two known founder-owned source accounts, with each account's identity and mapping tested independently:

`RESET_REQUIRED` → recovery request → one-time recovery credential → password establishment → session revocation → fresh GHM login.

It does not require batch orchestration, bulk concurrency testing, or a multi-user migration queue.

## Required evidence

The qualification must prove:

1. each exact source identity resolves to exactly one intended GHM account, without cross-linking the two accounts;
2. that account is provisioned without a legacy password;
3. account state is `RESET_REQUIRED` until successful re-enrollment;
4. recovery request is anti-enumerating;
5. recovery credential is delivered only through the delivery boundary;
6. recovery credential is opaque, protected at rest, single-use, and expiring;
7. password establishment uses canonical Argon2id;
8. existing sessions are revoked after successful reset;
9. fresh GHM authentication succeeds only after reset;
10. legacy external-identity provenance remains unchanged;
11. no Business or membership is changed by the reset;
12. failed/invalid reset leaves credential state unchanged.

## Qualification environment

Use synthetic non-production data only.

The test identity must not be the real QuoteFlow user's email, password, recovery token, Supabase token, or production identifier.

No production Supabase connection is permitted during qualification.

## Deliberate non-goals

Because the two known accounts are both founder-owned and must be reconciled independently, do not add:

- bulk migration queues;
- batch worker infrastructure;
- multi-user progress tracking;
- retry orchestration for thousands of accounts;
- production email delivery;
- production Supabase export automation.

Those are unnecessary until the product has more users.

## Current implementation gap

**Status reconciliation — 2026-10-12:** this sentence describes the earlier plan baseline and is superseded by the constructed request/completion path in `QUOTEFLOW_MIGRATION_RESET_REENROLLMENT_CEREMONY.md` and the detailed reconciliation in `QUOTEFLOW_MIGRATION_RESET_REENROLLMENT_RECONCILIATION.md`. The migration-specific request/completion path is constructed, but the complete user-facing ceremony remains unqualified pending non-production DB + HTTP evidence; production delivery, migration, and QuoteFlow cutover remain separately gated.

Therefore this qualification plan is a gate, not a claim that the ceremony is already executable.

The next implementation slice must provide the smallest GHM-owned reset operation needed to atomically:

1. authenticate/redeem the recovery credential;
2. establish the new Argon2id password;
3. revoke existing sessions;
4. return no recovery credential;
5. permit a fresh login.

That operation must reuse existing Auth persistence boundaries and must not introduce a second password authority.

## Founder gate

No production user data, production email delivery, production Supabase access, or QuoteFlow runtime cutover is authorized by this qualification plan.
