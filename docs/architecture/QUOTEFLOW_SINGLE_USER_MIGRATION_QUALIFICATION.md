# QuoteFlow Single-User Migration Qualification Plan

**Status:** QUALIFICATION PLAN — ONE KNOWN USER

QuoteFlow currently has one known user. Therefore the migration qualification should be intentionally narrow: prove the complete migration path for one synthetic account that represents the real user, rather than inventing a bulk-migration framework.

## Scope

The qualification covers one synthetic existing-user account:

`RESET_REQUIRED` → recovery request → one-time recovery credential → password establishment → session revocation → fresh GHM login.

It does not require batch orchestration, bulk concurrency testing, or a multi-user migration queue.

## Required evidence

The qualification must prove:

1. exactly one source identity resolves to exactly one GHM account;
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

Because there is one known user, do not add:

- bulk migration queues;
- batch worker infrastructure;
- multi-user progress tracking;
- retry orchestration for thousands of accounts;
- production email delivery;
- production Supabase export automation.

Those are unnecessary until the product has more users.

## Current implementation gap

The existing GHM repository has the protected recovery-token persistence and recovery request boundary, but the repository does not yet expose a complete migration-specific password-reset HTTP ceremony.

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
