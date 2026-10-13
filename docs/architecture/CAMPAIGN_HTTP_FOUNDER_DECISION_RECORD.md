# GHM Campaign HTTP Founder Decision Record

**Canonical owner:** GHM platform governance
**Status:** Founder wire decisions **LOCKED** (Gate 9G); Campaign HTTP **IMPLEMENTATION AUTHORIZED** for this surface only
**Authority:** Local repository `C:\GHM`
**Baseline:** branch `construction/saved-business-resource`, HEAD prior to Gate 9G implementation on `0a9a9f7`

> **Current-status reconciliation — 2026-10-13:** Gate 9G froze the Campaign HTTP wire and authorized this bounded surface. Its `AUTH ISSUANCE AT GATE 9G: UNSELECTED THEN; BOUNDED GHM AUTH FOUNDATION LATER QUALIFIED UNDER GATE 3B` statements describe that historical decision point: the bounded GHM ES256 issuance/session foundation was subsequently selected, implemented, and qualified under Gate 3B. Campaign routes consume the existing GHM bearer boundary; this record does not authorize a new issuer/IdP, a KBM adapter, product session migration, broader public exposure, or production cutover.
**Depends on:**
- [CAMPAIGN_HTTP_RESOURCE_CONTRACT.md](./CAMPAIGN_HTTP_RESOURCE_CONTRACT.md)
- [CAMPAIGN_OPERATION_CONTRACT.md](./CAMPAIGN_OPERATION_CONTRACT.md)
- [CAMPAIGN_SCHEMA_CONTRACT.md](./CAMPAIGN_SCHEMA_CONTRACT.md)

```text
GATE: 9G â€” IMPLEMENT GHM CAMPAIGN HTTP
TRANSPORT: HTTP/API
CAMPAIGN HTTP IMPLEMENTATION: AUTHORIZED (this surface only)
KBM ADAPTER: NOT AUTHORIZED
AUTH ISSUANCE: UNSELECTED
```

## Founder-locked wire (Gate 9G)

### Routing

| Operation | Method + path |
|---|---|
| GET one | `GET /api/v1/campaigns/:campaignId` |
| LIST | `GET /api/v1/campaigns?businessId=:businessId` |
| CREATE | `POST /api/v1/campaigns` |
| UPDATE | `PATCH /api/v1/campaigns/:campaignId` |
| DELETE | **Not supported** |

LIST business context: **query parameter** `businessId`.

### Success wire

| Item | Locked value |
|---|---|
| Singular envelope | `{ campaign }` |
| List envelope | `{ campaigns }` |
| GET / LIST status | `200` |
| CREATE status | `201` |
| UPDATE status | `200` |
| Request bodies | Bare Campaign input objects |

### Inputs

| Operation | Body |
|---|---|
| CREATE | `{ businessId, title }` only |
| UPDATE | `{ title?, status? }` only |

Creator derives from `AuthContext.userId`. Caller must not supply `createdByAccountId`.

### Authentication

- Bearer verification via existing GHM auth boundary
- AuthContext `{ userId, role }`
- Campaign-specific issuer / IdP / login / signup / refresh: **not implemented or authorized by this Campaign decision**; routes consume the separately qualified GHM bearer boundary. Product session migration remains gated.

### Errors

| Concern | Status + body |
|---|---|
| Authentication failure | `401` `{ error: "unauthorized" }` |
| Authorization denial | `403` `{ error: "forbidden" }` |
| Validation failure | `400` `{ error: "invalid_request" }` |
| Not found | `404` `{ error: "not_found" }` |
| Lifecycle rejection | `409` `{ error: "conflict" }` |
| Internal failure | `500` `{ error: "internal_error" }` |

### Dates / version / retry

| Item | Locked value |
|---|---|
| Dates | ISO 8601 JSON date strings |
| API prefix | `/api/v1` |
| Version lifecycle | **OPEN** |
| Retry | No special contract |
| Idempotency | No contract |
| Pagination | Not supported |

### Implementation authorization

```text
CAMPAIGN HTTP IMPLEMENTATION: AUTHORIZED
KBM ADAPTER: NOT AUTHORIZED
ADDITIONAL CAMPAIGN-SPECIFIC AUTH ISSUANCE: NOT AUTHORIZED BY GATE 9G; USE THE QUALIFIED GHM AUTH FOUNDATION
```

Runtime surface: `src/http/campaign-router.ts` registered from `src/http/app.ts`.

## Non-goals (unchanged)

- A new Campaign-specific issuer / IdP or auth implementation (the existing GHM authentication foundation is separately qualified)
- KBM adapter
- Campaign DELETE
- Pagination / retry / idempotency
- Database schema changes
- Unrelated Resource API refactors
