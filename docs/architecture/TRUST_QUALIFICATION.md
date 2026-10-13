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

- The separate Business Profile extension later added `description`, `phone`, `email`, `insurance_verified`, and `jobs_completed` to `ghm.business`. The qualified Trust calculation function still deliberately scores these dimensions as `0`; consuming them requires a separate authorized Trust-scoring change and must not infer verification from field presence;
- no public HTTP Trust routes in this slice;
- no product adapter, shadow qualification, provider cleanup, production migration, or cutover is authorized;
- The verification/evidence authority for protected inputs such as `insurance_verified` and `jobs_completed` remains a separate open governance gate; this Trust Score qualification does not certify those inputs or authorize callers to set them.
- no product adapter, shadow qualification, provider cleanup, production migration, or cutover is authorized;
- Connect readiness blockers outside Trust remain open.
