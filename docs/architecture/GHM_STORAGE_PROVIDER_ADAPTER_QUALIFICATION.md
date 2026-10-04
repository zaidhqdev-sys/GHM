# GHM Storage Provider Adapter Qualification

## Status

**CONSTRUCTION — LOCAL EXECUTION REQUIRED**

The concrete S3-compatible adapter is implemented behind the provider-neutral `StorageProvider` contract.

This qualification deliberately requires local execution because the repository's TypeScript compiler and test environment are the authoritative executable evidence.

## Required local evidence

Run on the exact branch:

```powershell
cd C:\GHM
git fetch --prune origin
git switch construction/ghm-storage-provider-adapter
git pull --ff-only origin construction/ghm-storage-provider-adapter

npm run build
node --require ./scripts/test-env.cjs --test dist/storage/provider.test.js dist/storage/s3-provider.test.js
git diff --check
git status --short --branch
git log --oneline -8
```

## Qualification expectations

Build must pass.

Focused tests must pass.

The focused suite must establish:

- provider error contract;
- constructor credential/bucket/region validation;
- upload-grant input validation;
- download-grant input validation;
- deterministic signed upload grant generation without a provider network call.

No test may require production credentials or a production bucket.

## Current boundary

This qualification does not establish:

- live provider connectivity;
- production bucket provisioning;
- production credentials;
- real object upload/download;
- object/provider reconciliation;
- recovery.

Those require separate explicit gates.

## Failure handling

Any compiler failure, focused-test failure, dirty unexpected change, or provider-network dependency blocks the adapter qualification.

No merge or production configuration change follows a failed qualification.

## Documentation reconciliation

This qualification remains subordinate to:

- GHM storage capability boundary;
- GHM storage service contract;
- GHM storage metadata persistence boundary;
- GHM storage persistence qualification;
- GHM storage provider adapter boundary.

No provider provisioning is authorized by this document.
