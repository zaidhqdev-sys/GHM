# Review HTTP Qualification Evidence

## Scope
This document records the construction qualification evidence for the Review HTTP surface.

## Contract coverage
| Surface | Contract operation | HTTP boundary |
|---|---|---|
| Public reviews | `readPublic` | unauthenticated public list |
| Customer create | `create` | authenticated customer POST |
| Customer own read | `readOwn` | authenticated customer GET |
| Admin pending list | `readPending` | authenticated admin GET |
| Admin moderation | `approve` / `reject` | authenticated admin moderation PATCH |

## Input boundary
The router rejects:
- unknown fields;
- invalid business/review IDs;
- invalid ratings;
- malformed moderation decisions;
- malformed limits;
- server-owned review/moderation fields.

The canonical service remains authoritative for semantic validation and persistence behavior.

## Expected error mapping
- unauthenticated protected route: `401`
- unauthorized role/resource operation: `403`
- malformed request: `400`
- service-level not found: `404`
- unexpected failure: `500`

## Verification
The qualification test suite covers:
- public access without authentication;
- public identifier validation;
- authenticated customer creation and context binding;
- server-owned field rejection;
- customer own-read context binding;
- unauthenticated protection;
- admin pending-read authorization;
- rejection of business-role access;
- moderation decision binding;
- arbitrary moderation field rejection;
- not-found mapping.

Final local build/test results must be recorded after the repository branch is pulled and verified locally. This document intentionally does not claim those results before that independent local run.

## Construction state
Qualified construction artifact pending founder decision on merge.
