# Support Request HTTP Qualification

**Status:** CONSTRUCTION QUALIFICATION — pending local execution
**Branch:** `construction/support-request-http-api`
**Date:** 2026-09-30

## Construction evidence

Implemented:

- `src/http/support-request-router.ts`
- `src/http/support-request-router.test.ts`
- Support Request service wiring in `src/http/app.ts`
- HTTP qualification inclusion in `package.json`
- `docs/architecture/SUPPORT_REQUEST_HTTP_BOUNDARY_RECONCILIATION.md`

## Required checks

The HTTP qualification suite covers:

1. authenticated list context binding;
2. list filter validation;
3. authenticated read and not-found mapping;
4. request ID validation;
5. customer-only creation;
6. canonical create input and server-owned field rejection;
7. admin-only status mutation;
8. status input boundary;
9. message read context/request binding;
10. exact customer/admin reply dispatch;
11. business-role denial for replies;
12. business-role denial for request reads, lists, and messages;
13. reply input and request ID validation.

## Local qualification command

```powershell
cd C:\GHM
git fetch --prune origin
git switch construction/support-request-http-api
git pull --ff-only origin construction/support-request-http-api
npm test
```

The branch is not considered locally qualified until the complete configured test suite reports zero failures.

## Gate

This branch is a construction slice only.

Do not merge it into the authoritative branch until founder approval is explicitly given after local verification.
