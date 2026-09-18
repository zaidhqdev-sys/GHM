# GHM Trust Score Qualification

## Status

**QUALIFIED / CLOSED**

## Command

```text
npm run qualify:trust-score-runtime
```

## Result

```text
GHM TRUST SCORE RUNTIME QUALIFICATION: PASS
```

## Verified

- schema presence and exact column/integrity boundary;
- runtime identity (`ghm_runtime`) and cleanup authority (`ghm_migrator` / `ghm_schema_owner`);
- runtime privilege boundary: SELECT-only table, no INSERT/UPDATE/DELETE, calculate EXECUTE-only;
- anonymous calculate denial;
- member and outsider calculate denial;
- owner calculate with rating→reviews_score reconciliation;
- administrator calculate upsert onto the same business row;
- persisted reconciliation;
- public read for approved businesses;
- public read denial for non-approved businesses;
- authenticated trust.read private read;
- cross-account / member isolation;
- list-by-trust-level public and trust.read boundaries;
- concurrent calculate uniqueness (`UNIQUE(business_id)`);
- unauthorized direct mutation denial;
- runtime effective ACL;
- governed cleanup.

## Automated suite

```text
npm run build
npm test
git diff --check
```

Result: `180/180` automated tests passed; `git diff --check` clean.

## Explicit limitations

- GHM Business first-slice lacks Connect profile input columns (`description`, `phone`, `email`, `insurance_verified`, `jobs_completed`); those dimensions score `0` until a separately authorized Business profile extension;
- no public HTTP Trust routes in this slice;
- no product adapter, shadow qualification, provider cleanup, production migration, or cutover is authorized;
- Connect readiness blockers outside Trust remain open.
