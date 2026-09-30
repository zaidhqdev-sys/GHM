# GHM Campaign HTTP Resource Contract

**Canonical owner:** GHM platform governance
**Status:** Campaign HTTP resource contract â€” wire **FOUNDER-LOCKED**; surface **IMPLEMENTATION AUTHORIZED** (Gate 9G)
**Authority:** Local repository `C:\GHM`
**Baseline domain:** branch `construction/saved-business-resource`, Campaign domain qualified at `0a9a9f7`
**Authoritative wire decisions:** [CAMPAIGN_HTTP_FOUNDER_DECISION_RECORD.md](./CAMPAIGN_HTTP_FOUNDER_DECISION_RECORD.md)
**Runtime surface:** `src/http/campaign-router.ts` (registered from `src/http/app.ts`)

**Depends on (committed domain contracts):**
- [CAMPAIGN_SOURCE_AUDIT.md](./CAMPAIGN_SOURCE_AUDIT.md)
- [CAMPAIGN_SCHEMA_CONTRACT.md](./CAMPAIGN_SCHEMA_CONTRACT.md)
- [CAMPAIGN_OPERATION_CONTRACT.md](./CAMPAIGN_OPERATION_CONTRACT.md)
- [RESOURCE_API_BOUNDARY_CONTRACT.md](./RESOURCE_API_BOUNDARY_CONTRACT.md)

```text
TRANSPORT: HTTP/API
CAMPAIGN HTTP WIRE: FOUNDER-LOCKED
CAMPAIGN HTTP IMPLEMENTATION: AUTHORIZED (this surface only)
AUTH ISSUANCE: UNSELECTED
KBM ADAPTER: NOT AUTHORIZED
VERSION LIFECYCLE: OPEN
RETRY: NO SPECIAL CONTRACT
IDEMPOTENCY: NO CONTRACT
```

---

## 1. Purpose

Define the **Campaign HTTP resource contract** for the GHM Campaign root consumed by supported products (KBM first).

This contract records:

- Founder-locked Campaign HTTP wire (Gates 9F / 9G);
- alignment with the qualified Campaign domain;
- items that remain intentionally **OPEN** / **UNSELECTED**.

It does **not** authorize auth issuance, a KBM adapter, Campaign children, or unrelated Resource API changes.

---

## 2. Resource identity

| Item | Value |
|---|---|
| Conceptual resource name | `campaign` |
| Registry resource | `campaign` |
| PostgreSQL relation | `ghm.campaign` |
| Domain type | `Campaign` (`src/resources/campaign/contracts.ts`) |
| Product-facing projection | Campaign root (seven fields below) |

---

## 3. Supported operations

| Semantic operation | Registry | Domain service | HTTP |
|---|---|---|---|
| READ one | `campaign.read` | `getCampaign` | `GET /api/v1/campaigns/:campaignId` |
| LIST by business | `campaign.read` | `listCampaigns` | `GET /api/v1/campaigns?businessId=:businessId` |
| CREATE | `campaign.create` | `createCampaign` | `POST /api/v1/campaigns` |
| UPDATE | `campaign.update` | `updateCampaign` | `PATCH /api/v1/campaigns/:campaignId` |

**Not supported:**

```text
DELETE
readPublic / anonymous read
```

Archival is `UPDATE` with `status = archived`, not delete.

---

## 4. Founder-locked routes

| Operation | Method + path |
|---|---|
| GET one | `GET /api/v1/campaigns/:campaignId` |
| LIST | `GET /api/v1/campaigns?businessId=:businessId` |
| CREATE | `POST /api/v1/campaigns` |
| UPDATE | `PATCH /api/v1/campaigns/:campaignId` |

LIST business context: **query parameter** `businessId`.

Path / query ids use positive decimal integers (`^[1-9]\d*$`), consistent with existing Resource API parsers.

---

## 5. Request schema

Field names are camelCase (`businessId`, not `business_id`).

Request bodies are **bare** Campaign input objects (not wrapped).

### 5.1 CREATE

| Field | Type | Required | Notes |
|---|---|---|---|
| `businessId` | positive safe integer | Yes | GHM validates eligibility + membership |
| `title` | string | Yes | Trimmed length 1â€“200 |

**Forbidden in create body:** `createdByAccountId`, `id`, `status`, `createdAt`, `updatedAt`, and any other fields.

Creator is **never** caller-supplied. Creator = `AuthContext.userId`.

### 5.2 UPDATE

At least one of:

| Field | Type | Notes |
|---|---|---|
| `title` | string | Trimmed 1â€“200; rejected when status is `archived` |
| `status` | `'draft' \| 'active' \| 'archived'` | Must obey transition graph |

**Forbidden on update:** `id`, `businessId`, `createdByAccountId`, `createdAt`.

### 5.3 READ one / LIST

| Operation | Identity carriage |
|---|---|
| READ one | path `:campaignId` |
| LIST | query `businessId` |

---

## 6. Response schema

### 6.1 Campaign root projection

| Field | Semantic type | Authority |
|---|---|---|
| `id` | positive integer (bigint identity) | GHM |
| `businessId` | positive integer | GHM |
| `createdByAccountId` | positive integer | GHM (from AuthContext) |
| `title` | string | GHM |
| `status` | `'draft' \| 'active' \| 'archived'` | GHM |
| `createdAt` | timestamptz â†’ ISO 8601 JSON string | GHM |
| `updatedAt` | timestamptz â†’ ISO 8601 JSON string | GHM |

### 6.2 Success envelopes and statuses

| Outcome | Status | Envelope |
|---|---|---|
| GET one | `200` | `{ campaign }` |
| LIST | `200` | `{ campaigns }` |
| CREATE | `201` | `{ campaign }` |
| UPDATE | `200` | `{ campaign }` |

### 6.3 Dates

Campaign HTTP wire dates are **ISO 8601** JSON strings (via standard JSON `Date` serialization).

---

## 7. Authentication

| Item | State |
|---|---|
| Mechanism | Existing Bearer verification (`requireAuth` / `authenticateRequest`) |
| AuthContext | `{ userId, role }` |
| Creator | `created_by_account_id = AuthContext.userId` |
| Token issuer | **UNSELECTED** |
| Identity provider | **UNSELECTED** |
| Login / signup / refresh | **UNSELECTED** |
| New JWT claims | **Not introduced** |

All Campaign HTTP operations require authentication. No anonymous / public Campaign surface.

---

## 8. AuthContext and authorization

| Concern | Rule |
|---|---|
| Coarse ACL | `canAccessResource(context, 'campaign')` + registered operation |
| Fine-grained authz | Campaign service â†’ repository / SQL membership (unchanged domain) |
| READ one / LIST membership | active `owner` \| `administrator` \| `member` |
| CREATE / UPDATE membership | active `owner` \| `administrator` (+ create eligibility) |
| Caller-supplied creator | **Forbidden** |
| Direct product DB access | **Not approved** |

Product-selected `businessId` is context, not proof of authorization. GHM validates authority.

Unauthorized GET returns `404` / `not_found` when the authorized resource is absent (including non-disclosure of inaccessible rows). LIST returns the authorized set for the business (empty array when membership is absent). CREATE permission denials map to `403` / `forbidden` where applicable. UPDATE uses domain messages; conflated â€œnot found or management permissionâ€ maps to `404` / `not_found`.

---

## 9. Error wire (Founder-locked)

Error envelope: `{ error: "<token>" }`.

| Concern | Status | Body |
|---|---|---|
| Authentication failure | `401` | `{ error: "unauthorized" }` |
| Authorization denial | `403` | `{ error: "forbidden" }` |
| Validation failure | `400` | `{ error: "invalid_request" }` |
| Not found | `404` | `{ error: "not_found" }` |
| Lifecycle rejection | `409` | `{ error: "conflict" }` |
| Internal failure | `500` | `{ error: "internal_error" }` |

Campaign HTTP uses a **Campaign-local** mapper (`handleCampaignError` in `campaign-router.ts`). Global `handleError` is not redesigned for Campaign.

Platform-wide semantic taxonomy refactor (unauthenticated / validation_failed / invalid_state / â€¦) remains outside this Campaign HTTP lock.

---

## 10. Versioning

| Item | Status |
|---|---|
| Campaign routes under `/api/v1` | **LOCKED** |
| Version lifecycle / deprecation / compatibility policy | **OPEN** |
| Package / `GET /` version `2.0.0` | Implementation evidence only â€” not the Campaign compatibility policy |

```text
VERSION LIFECYCLE: OPEN
```

---

## 11. Retry / idempotency

```text
RETRY: NO SPECIAL CONTRACT
IDEMPOTENCY: NO CONTRACT
```

No retry headers, idempotency keys, or algorithms are part of this Campaign HTTP surface.

---

## 12. Pagination / list semantics

| Item | Status |
|---|---|
| Pagination | **Not supported** |
| List completeness | Full authorized set for the business |
| Ordering | Repository-defined: `created_at DESC, id DESC` |

---

## 13. Mutability / lifecycle (domain-locked)

Status vocabulary:

```text
draft | active | archived
```

Transitions:

```text
draft    â†’ active | archived
active   â†’ archived
archived â†’ (none)
```

| Constraint | Rule |
|---|---|
| Create status | Always `draft` |
| Title on archived | Rejected â†’ lifecycle `409` |
| Status from archived | Rejected â†’ lifecycle `409` |
| Immutable fields | `id`, `businessId`, `createdByAccountId`, `createdAt` |
| Delete | Not supported |

---

## 14. Security boundary

Non-negotiable:

- GHM remains authorization authority
- No direct product â†’ PostgreSQL
- No product-manufactured privileged AuthContext
- No caller-chosen creator identity
- No raw SQL / arbitrary SECURITY DEFINER exposure
- No secrets/tokens in error bodies
- No Campaign public/anonymous surface
- Bearer verification required for all Campaign HTTP ops
- Auth issuance remains a separate **UNSELECTED** decision
- KBM adapter remains **NOT AUTHORIZED** by this contract

---

## 15. HTTP pipeline

```text
HTTP route
  â†’ requireAuth (Bearer verify â†’ AuthContext)
  â†’ registered resource+operation (campaign + read|create|update)
  â†’ canAccessResource
  â†’ input validation
  â†’ CampaignService
  â†’ repository / authorized transaction
  â†’ ghm.campaign
```

---

## 16. Explicit non-goals

This contract does **not**:

- authorize auth issuance / issuer / IdP / login / signup / refresh
- authorize a KBM HTTP adapter
- authorize Campaign DELETE
- authorize pagination, retry, or idempotency machinery
- change Campaign domain semantics or database schema
- expand Campaign children (brief, media, AI, storage, jobs)
- redesign global Resource API error taxonomy
- select a version lifecycle policy beyond `/api/v1` prefix lock

---

## 17. Implementation status

```text
CAMPAIGN HTTP IMPLEMENTATION: AUTHORIZED
RUNTIME: src/http/campaign-router.ts
KBM ADAPTER: NOT AUTHORIZED
AUTH ISSUANCE IMPLEMENTATION: NOT AUTHORIZED
```

Wire selection and implementation authorization for this surface were Founder-approved (Gates 9F / 9G). Selecting this wire does **not** authorize KBM adapter work or auth issuance.

---

## 18. Status table

| Item | Status |
|---|---|
| Campaign domain | QUALIFIED |
| Transport | HTTP/API |
| Routes / envelopes / Campaign HTTP status map | **FOUNDER-LOCKED** |
| Datetime wire | **ISO 8601** (locked) |
| `/api/v1` prefix | **LOCKED** |
| Version lifecycle | **OPEN** |
| Retry / idempotency | **OPEN** (no special contract) |
| Pagination | **Not supported** |
| Auth verification | PRESENT |
| Auth issuance | **UNSELECTED** |
| Campaign HTTP implementation | **AUTHORIZED** |
| KBM adapter | **NOT AUTHORIZED** |

---

## Final gate

GHM CAMPAIGN HTTP RESOURCE CONTRACT RECONCILED (Gate 9I).

WIRE FOUNDER-LOCKED.

IMPLEMENTATION AUTHORIZED FOR CAMPAIGN HTTP SURFACE ONLY.

AUTH ISSUANCE UNSELECTED.

KBM ADAPTER NOT AUTHORIZED.

VERSION LIFECYCLE OPEN.

NO RETRY / IDEMPOTENCY CONTRACT.
