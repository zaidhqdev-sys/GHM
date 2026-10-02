# Connect Service Assertion Replay Protection Qualification

**Status:** CONSTRUCTION QUALIFIED — SERVICE ASSERTION REPLAY SUB-SLICE

## Scope
This qualification covers durable replay detection for the short-lived ES256 Connect service assertion request identifier (jti).

The slice establishes:
- a GHM-authoritative durable replay record;
- atomic first-consumption semantics;
- runtime read/write isolation through a governed database function;
- request/integration/expiry validation before persistence;
- fail-closed rejection when the request identifier has already been consumed;
- HTTP integration before governed Connect dispatch.

## Evidence
- Local full suite: **450/450 passing**.
- TypeScript build: passing.
- Migration execution: passing.
- Live PostgreSQL qualification: passing with distinct runtime and migrator credentials.
- Runtime direct table INSERT denied by database privileges.
- First consumption accepted; second consumption rejected.

## Security boundary
Replay protection is keyed to the verified Connect assertion request identifier and integration identity. It does not create end-user authorization, identity mapping, membership, ownership, or administrative privilege.

The replay store is not a generic table/RPC interface. Product callers do not receive database credentials or direct persistence access.

## Qualified chain

ES256 assertion → active integration lifecycle → durable replay consumption → trusted request context → governed operation → GHM authorization → typed capability dispatch → bounded HTTP read

## Not qualified
- production credential issuance or secret/key deployment;
- Connect session migration;
- broader product adapter parity;
- mutation HTTP operations;
- business-level idempotency for mutations;
- storage/media;
- realtime;
- payment/provider runtime;
- production routing, DNS, CORS, cutover or shadow traffic;
- generic table/SQL/RPC exposure.

## Stop boundary
The replay sub-slice is qualified. Construction stops here for replay protection. The next construction decision remains separately gated by the consolidated Connect readiness register.