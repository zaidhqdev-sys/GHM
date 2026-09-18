# GHM Campaign HTTP Founder Decision Record

**Canonical owner:** GHM platform governance
**Status:** Founder wire decisions **LOCKED** (Gate 9G); Campaign HTTP **IMPLEMENTATION AUTHORIZED** for this surface only
**Authority:** Local repository `C:\GHM`
**Baseline:** branch `construction/saved-business-resource`, HEAD prior to Gate 9G implementation on `0a9a9f7`
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
- Issuer / IdP / login / signup / refresh: **UNSELECTED** (not implemented)

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
AUTH ISSUANCE IMPLEMENTATION: NOT AUTHORIZED
```

Runtime surface: `src/http/campaign-router.ts` registered from `src/http/app.ts`.

## Non-goals (unchanged)

- Auth issuance / issuer / IdP
- KBM adapter
- Campaign DELETE
- Pagination / retry / idempotency
- Database schema changes
- Unrelated Resource API refactors
