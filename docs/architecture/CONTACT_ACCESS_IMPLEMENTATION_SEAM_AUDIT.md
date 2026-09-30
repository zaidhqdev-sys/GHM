# Contact Access Implementation Seam Audit

## Status

`READ-ONLY AUDIT — CONSTRUCTION NOT AUTHORIZED`

Date: 2026-09-23  
Branch context: `construction/saved-business-resource`  
Commercial model: **Model A — Per Opportunity Contact Access**

### Authority precedence (this audit)

1. `CONTACT_ACCESS_FOUNDER_DECISION_RECORD.md`
2. `CONTACT_ACCESS_EXECUTABLE_CONTRACT.md`
3. Existing GHM resource / schema / auth / commercial contracts and runtime
4. `CONTACT_ACCESS_ENTITLEMENT_CONTRACT.md` — historical/proposed only where non-conflicting

This document does **not** authorize construction. It does **not** modify other architecture documents.

---

## 1. Executive verdict

**No executable Contact Access implementation exists.** Model A requires a **new target-specific entitlement domain + persistence**, composed with existing Enquiry contact ownership and Business membership primitives.

Reusable today:

- Enquiry canonical contact fields and Business received-read ownership gates
- Opportunity identity, lifecycle, and Business owner/admin read context
- Auth bearer → `AuthContext`, active membership patterns, disabled-account rejection
- Commercial **subscription / plan-feature** patterns and `commercial_event` idempotency *as design reference only*

Not reusable as Contact Access:

- `commercial_plan_entitlement` (plan feature codes, not Business+Opportunity)
- Ordinary `enquiry:read` / received Enquiry HTTP (currently full contact exposure)
- Ordinary Opportunity read (includes `creatorAccountId`; no contact fields)
- Provider/Paystack (absent in `src/`)

**Smallest first construction slice:** dedicated Contact Access entitlement **persistence + domain grant/check/revoke** (promotional/manual grant path), Enquiry-backed Opportunities only — **no HTTP, no payment provider, no Enquiry redaction**.

---

## 2. Current relationship graph

Required conceptual chain:

```text
Business
   ↓
Opportunity
   ↓
Enquiry
   ↓
customerName / customerPhone / customerEmail
```

| Arrow | Executable today? | Evidence |
| --- | --- | --- |
| Business → Opportunity | **Partial — executable for ownership/participation, not Contact Access** | `opportunity.owner_business_id`; marketplace create also inserts `opportunity_participant` roles `owner` / `recipient` for the target Business (`src/resources/enquiry/repository.ts`). No Contact Access subject entitlement. |
| Opportunity → Enquiry | **Schema link only — reverse domain lookup MISSING** | `enquiry.opportunity_id` FK + non-unique index (`database/migrations/20260916143000_reconcile_enquiry_opportunity_link.sql`). Marketplace create writes 1:1. **No** `findByOpportunityId` (or equivalent) on Enquiry repository/service. |
| Enquiry → contact fields | **EXISTS — DIRECTLY REUSABLE (data)** | Columns + full `Enquiry` projection: `customer_name`, `customer_phone`, `customer_email` (also exposes `customer_id`). |

**Do not invent:** Project → contact owner, Opportunity-stored phone/email/name, or Contact Access tables.

---

## 3. Existing capability inventory

### 3.1 Contact Access

| Capability | Result |
| --- | --- |
| Entitlement / unlock / disclosure / grant / revoke / check / audit | **ABSENT** in `src/`, `database/`, migrations, tests |
| Naming search (`contact access`, `ContactAccess`, lead unlock, etc.) | Hits only architecture docs + unrelated plan-feature “entitlement” |

### 3.2 Enquiry

| Capability | Status | Location |
| --- | --- | --- |
| Canonical contact fields | EXISTS | `ghm.enquiry`; `Enquiry` contract |
| Opportunity linkage (Enquiry → Opportunity) | EXISTS | `opportunity_id` set on marketplace create |
| Reverse Opportunity → Enquiry | **MISSING** domain API | Index exists; no repository method |
| Business recipient authorization | EXISTS (owner-only) | `assertActiveOwner` / received queries — `membership_role = 'owner'` |
| Received list/read | EXISTS | `GET /api/v1/enquiries/received`, `.../received/:enquiryId` |
| Current contact exposure | **Full** on received + own reads | Returns entire `Enquiry` including phone/email/name **and** `customerId` |
| Contact-only projection | **MISSING** | Would need adapter on Enquiry repository |

### 3.3 Opportunity

| Capability | Status | Location |
| --- | --- | --- |
| Identity / lifecycle | EXISTS | `ghm.opportunity`; lifecycle transitions |
| Ownership | EXISTS | `creator_account_id`; optional `owner_business_id` |
| Business authorization for read | EXISTS | Creator **or** active owner/administrator of `owner_business_id`; else public projection |
| Relationship to Enquiry | One-way from Enquiry | Opportunity service has **no** Enquiry awareness |
| Contact fields on Opportunity | Correctly **absent** | Must remain absent |
| HTTP single read | EXISTS | `GET /api/v1/opportunities/:opportunityId` |

### 3.4 Commercial

| Capability | Status | Fit for Contact Access |
| --- | --- | --- |
| Plans / plan versions / prices | EXISTS (schema + partial domain) | Not Contact Access |
| `commercial_plan_entitlement` | EXISTS | Plan feature codes (e.g. `quote_management`) — **orthogonal** |
| Subscriptions / trials | EXISTS | Business-scoped subscription lifecycle |
| Payment attempts / transactions | Schema + prepare path | Subscription-oriented |
| `commercial_provider_event` | Schema | No Paystack runtime in `src/` |
| `commercial_event` + `idempotency_key` | EXISTS | Pattern reusable; events tied to subscription/business commercial ops, **not** Opportunity Contact Access |
| Commercial HTTP | **ABSENT** | `commercial` in role resource map; **not** in `resourceRegistry`; no commercial router |
| Domain service | EXISTS | access / subscription / trial / prepare payment / cancel |

### 3.5 Authorization

| Primitive | Status | Reuse for disclosure predicate |
| --- | --- | --- |
| Authenticated account + GHM bearer | EXISTS | Yes — outer gate |
| Disabled account → auth failure | EXISTS | Yes |
| `AuthContext` `{ userId, role }` | EXISTS | Yes |
| Coarse resource ACL (`canAccessResource`) | EXISTS | Registry gate only — **not** Contact Access |
| Active Business membership | EXISTS (SQL patterns) | Yes — compose into CA; note Enquiry received is **owner-only**, commercial mgmt is **owner\|administrator** |
| Resource registry | EXISTS | `enquiry` / `opportunity` registered; **no** `contact_access` |
| Separate Contact Access capability | **MISSING** | Must not equal `enquiry:read` |

---

## 4. Contact Access gap matrix

| # | Capability | Classification |
| --- | --- | --- |
| 1 | Entitlement persistence (Business + Opportunity, `active`/`revoked`, grant/revoke metadata) | `MISSING — NEW PERSISTENCE` |
| 2 | Entitlement grant | `MISSING — NEW DOMAIN CAPABILITY` |
| 3 | Entitlement check | `MISSING — NEW DOMAIN CAPABILITY` |
| 4 | Entitlement revoke | `MISSING — NEW DOMAIN CAPABILITY` |
| 5 | Commercial-event linkage / verified GHM event → grant | `EXISTS — REUSABLE WITH ADAPTER` (pattern + `commercial_event` idempotency); Contact Access–specific event/reference model still `MISSING — NEW DOMAIN CAPABILITY` / likely `NEW PERSISTENCE` |
| 6 | Opportunity → Enquiry resolution | `EXISTS — REUSABLE WITH ADAPTER` (schema FK; add reverse lookup) |
| 7 | Protected-contact resolution (name/phone/email only) | `EXISTS — REUSABLE WITH ADAPTER` (fields exist; need narrow projection) |
| 8 | Contact Access disclosure authorization predicate | `MISSING — NEW DOMAIN CAPABILITY` (compose auth + membership + CA state) |
| 9 | Contact Access HTTP (status / disclose / grant) | `MISSING — NEW HTTP` |
| 10 | Ordinary Enquiry redaction / cutover | `EXPLICITLY OUT OF SCOPE` for first slices; future seam on received routes |
| 11 | Audit / event history | `MISSING — NEW PERSISTENCE` (+ domain write-on-grant/revoke) |
| 12 | Project-origin Opportunities | `EXPLICITLY OUT OF SCOPE` — Founder gate |
| 13 | Provider / Paystack integration | `EXPLICITLY OUT OF SCOPE` — Founder gate; absent in `src/` |

---

## 5. Commercial reuse analysis

### Why `commercial_plan_entitlement` is **not** appropriate

| Plan entitlement | Contact Access (Model A) |
| --- | --- |
| Keyed by `plan_version_id` + `entitlement_code` | Keyed by **Business + Opportunity** |
| Feature flag / access level for subscription | Target-specific contact disclosure right |
| No Opportunity target | Opportunity is the commercial target |
| No `active`/`revoked` per lead | Authorization state per pair |
| No per-opportunity audit of contact unlock | Required grant/revoke audit |

**Verdict:** Contact Access needs a **dedicated persistence model**. Do not overload plan entitlements.

### What commercial *can* contribute later

- Verified GHM commercial event concept and **idempotency** (`commercial_event.idempotency_key` unique partial index)
- Membership assertion style (`assertBusinessManagementAccess`)
- Separation of provider signal vs GHM state (schema: `commercial_provider_event` vs `commercial_event`)

### What commercial does **not** satisfy today

- Per-Opportunity Contact Access rows
- Contact disclosure operations
- Payment-complete → Contact Access grant pipeline
- Any HTTP commercial surface

---

## 6. Authorization reuse analysis

Smallest composition for future disclosure (executable contract §11):

```text
requireAuth / valid GHM token
→ AuthContext
→ active Business membership for businessId
→ active Contact Access entitlement (businessId, opportunityId)   [MISSING]
→ resolvable Enquiry-backed Opportunity                          [ADAPTER]
→ Business/account not disabled                                  [EXISTS for account]
→ return { customerName, customerPhone, customerEmail } only
```

Reuse without inventing a second auth system:

- Bearer + `AuthContext`
- Existing membership SQL patterns
- New **domain** check for CA entitlement (not a parallel login/token stack)
- New registry resource/operation for HTTP **when** HTTP is authorized (distinct from `enquiry:read`)

**Alignment note:** Received Enquiry is **owner-only**; Opportunity Business read and commercial management allow **owner|administrator**. Contact Access construction must pick a Founder-consistent membership role set when authorized — not invented in this audit beyond recording the mismatch.

---

## 7. Persistence assessment

| Requirement | Assessment |
| --- | --- |
| Target-specific entitlement | **Required** — new model |
| One active per Business + Opportunity | **Required** — partial unique / equivalent; not in commercial schema |
| Historical grants after revoke | **Required** — retain history; allow new active after revoke |
| Commercial event idempotency | Pattern exists; CA grant must key off verified event reference (or promo reason) without duplicating active access |
| Audit/history | Prefer immutable event/history table or append-only records separate from current auth state |
| Reuse `commercial_plan_entitlement` | **No** |
| Reuse `commercial_subscription` as CA state | **No** |

**Migration:** New migration(s) required when schema construction is authorized. No SQL in this audit.

**Schema risk:** `enquiry.opportunity_id` is **not UNIQUE**. Marketplace create is 1:1 today; reverse resolution must define deterministic eligibility (e.g. exactly one Enquiry, else unsupported). Optional unique index is a future schema decision, not authorized here.

---

## 8. HTTP assessment

| Surface | Exists today? | Future seam |
| --- | --- | --- |
| Entitlement status | No | New route(s) — active/revoked/none; no contact payload |
| Protected contact disclosure | No | New route(s) — only name/phone/email under full predicate |
| Commercial grant / payment action | No CA; no commercial HTTP | Separate; provider gated |

**Disclosure must be a new capability**, not `enquiry:read`.

Current bypass after future redaction activation:

- `GET /api/v1/enquiries/received`
- `GET /api/v1/enquiries/received/:enquiryId`
- (Customer) `GET /api/v1/enquiries/:enquiryId` — own path; different actor

Opportunity `GET /api/v1/opportunities/:id` must **not** become contact disclosure (and already exposes `creatorAccountId` on full projection).

---

## 9. Redaction assessment

### Where Business reads expose protected contact fields today

| Route | Projection | Exposes name/phone/email | Also exposes |
| --- | --- | --- | --- |
| `GET /api/v1/enquiries/received` | Full `Enquiry[]` | Yes | `customerId`, full enquiry body |
| `GET /api/v1/enquiries/received/:enquiryId` | Full `Enquiry` | Yes | `customerId` |
| Status PATCH response | Full `Enquiry` | Yes | `customerId` |

Seam for future cutover (not authorized):

- Redact at HTTP response mapping and/or service projection for Business received reads unless active CA for associated `opportunityId`
- Preserve **current production full disclosure** until cutover is separately authorized

Minimum future redaction seam: received list + received single (+ status response if it returns full enquiry). Customer own-read policy remains a separate product decision.

---

## 10. Smallest construction slice

### Slice A — **authorize first** (smallest independently testable)

**Contact Access Entitlement persistence + domain grant / check / revoke**  
(Promotional / manual grant path only; Enquiry-backed Opportunities only)

| Dimension | Detail |
| --- | --- |
| Concept owner | New `contact-access` (or equivalent) resource module — **not** Enquiry, Opportunity, or commercial plan entitlement |
| New capability | Persist entitlement; grant (idempotent / one-active); check; revoke; append audit history |
| Migration | **Yes** — dedicated CA tables (current auth state + history/events) |
| Opportunity→Enquiry | Adapter method on Enquiry repository (lookup by `opportunity_id`; eligibility rules) used by grant validation — **not** full Enquiry disclose API |
| HTTP | **Deliberately unimplemented** |
| Payment / provider | **Deliberately unimplemented** |
| Enquiry redaction | **Deliberately unimplemented** |
| Independently qualifiable? | **Yes** — repository/service unit tests with fake pool / authorized transaction patterns |

**Likely files (when authorized — do not create now):**

- `database/migrations/<timestamp>_create_contact_access*.sql` (new)
- `src/resources/contact-access/contracts.ts` (new)
- `src/resources/contact-access/repository.ts` (new)
- `src/resources/contact-access/service.ts` (new)
- `src/resources/contact-access/*.test.ts` (new)
- `src/resources/enquiry/contracts.ts` / `repository.ts` — **minimal** reverse-lookup + optional contact-field projection adapters
- Possibly `src/auth/authorization.ts` / `src/resources/registry.ts` only if registry resource is required for later HTTP (prefer **defer** registry until HTTP slice)

**Remains unimplemented in Slice A:** disclose HTTP, status HTTP, payment grants, Paystack, redaction, Project-origin, Opportunity lifecycle changes.

---

## 11. Ordered dependency sequence

| Order | Slice | Depends on | Deliberately excludes |
| --- | --- | --- | --- |
| **1** | **A — Persistence + grant/check/revoke (promo/manual)** | Existing Business membership + Opportunity identity + Enquiry FK | HTTP, payment, redaction |
| **2** | **B — Domain disclose** | Slice A + Enquiry contact projection adapter | HTTP, payment, redaction |
| **3** | **C — HTTP status + disclose** | Slice B; registry resource/ops; auth middleware | Payment, redaction |
| **4** | **D — Verified commercial-event → grant** | Slice A; GHM commercial event model for CA purchases | Provider wiring |
| **5** | **E — Provider / Paystack** | Slice D + Founder decision | — |
| **6** | **F — Enquiry redaction cutover** | Slice B/C live; Founder-approved activation | Changing lifecycle |

Project-origin support: **blocked** until Founder decision; not in sequence above.

---

## 12. Exact files likely affected (by slice)

### Slice A

- New: `database/migrations/*contact_access*`
- New: `src/resources/contact-access/**`
- Touch (adapter only): `src/resources/enquiry/repository.ts`, `contracts.ts`, tests

### Slice B

- Touch: `src/resources/contact-access/service.ts` (+ tests)
- Touch: Enquiry narrow projection helper if not in A

### Slice C

- New: `src/http/contact-access-router.ts` (+ tests)
- Touch: app route registration site
- Touch: `src/resources/registry.ts`, possibly `src/auth/authorization.ts` (`Resource` union)

### Slice D (constructed — domain/persistence)

- New: `database/migrations/20260923153000_create_contact_access_commercial_fact.sql`
- New: `ghm.contact_access_commercial_fact` — verified Opportunity-scoped commercial authorization facts (not `ghm.commercial_event`, not payment rows)
- New: `ghm.grant_contact_access_commercial(...)` — atomic verified fact + Contact Access commercial grant (`verified_commercial`)
- New: `src/resources/contact-access-commercial/**` — governed domain boundary; no HTTP; no provider/payment tables
- Touch: `contact_access_entitlement` grant reason + `contact_access_commercial_fact_id` FK (via Slice D migration only)
- **Not repurposed:** `ghm.commercial_event` (subscription audit), `commercial_payment_*`, `src/resources/commercial/**` payment paths
- **Verified** at this boundary means: created only through the governed DEFINER function after GHM commercial validation inputs (management membership, eligibility, idempotency) — not raw provider/webhook success
- Provider integration remains **Slice E+**

### Slice E / F

- Provider modules (new); enquiry-router projection — **gated**

**Must not change for Contact Access correctness:** Opportunity schema to store contact fields; Enquiry ownership model; opportunity lifecycle machine; `commercial_plan_entitlement` semantics.

---

## 13. Tests / qualification required

### Slice A (minimum)

- Grant creates `active` for Business+Opportunity
- Second grant while active → idempotent reuse (no duplicate active)
- Same commercial-event reference → no duplicate active (when commercial path exists; promo path: explicit reason audit)
- Revoke → check returns `revoked`; subsequent disclose denied (domain)
- Re-grant after revoke → new active; history preserved
- Grant without resolvable Enquiry → unsupported/unavailable
- Grant against non-eligible lifecycle (per FDR) → rejected
- Membership failure → authorization failure
- Audit rows reconstruct grant/revoke who/when/why

### Slice B

- Disclose returns only `{ customerName, customerPhone, customerEmail }`
- Never returns `customerId` / `creatorAccountId`
- Live Enquiry mutation reflected on disclose
- Missing/revoked entitlement → denied

### Slice C

- HTTP maps conceptual outcomes to existing GHM status conventions
- Registry: disclosure ≠ `enquiry:read`

### Regression

- Received Enquiry routes **unchanged** until Slice F
- Opportunity read unchanged
- No payment/provider behavior until Slice E

---

## 14. Explicit nonchanges (this audit and first slices)

- No modification of FDR / executable contract / entitlement contract / open-decision analysis / `BRIEF_SOURCE_AUDIT.md`
- No `src/` / `database/` / `web/` / package / migration / provider / deploy / commit / push from this audit
- No Opportunity lifecycle change
- No Project↔Opportunity / Project-origin contact ownership
- No Paystack construction
- No Enquiry redaction activation
- No treating subscription entitlements as Contact Access

---

## 15. Remaining Founder gates

| Gate | Status |
| --- | --- |
| Project-origin Contact Ownership | `OPEN — FOUNDER DECISION REQUIRED` |
| Provider / Paystack construction | `OPEN — FOUNDER DECISION REQUIRED` |
| Contact Access membership role (owner-only vs owner\|administrator) | **Implementation alignment decision** — evidence conflict between Enquiry received (owner) and Opportunity/commercial (owner\|admin); resolve at construction authorization |
| Schema / runtime / HTTP / redaction cutover | Not authorized by this audit |

---

## 16. Security checks (proposed construction must NOT)

| Anti-requirement | Audit confirmation |
| --- | --- |
| Expose `customerId` via Contact Access disclose | Must use narrow projection — full `Enquiry` reuse alone is unsafe |
| Expose `creatorAccountId` | Opportunity full read has it; CA must not route through that as disclose |
| Put contact data on Opportunity | Opportunity has none today — keep it that way |
| Trust Paystack/provider callbacks as auth | No provider code; future must consume verified GHM event |
| Use subscription entitlement as CA | `commercial_plan_entitlement` unfit |
| Grant CA via ordinary Opportunity read | Opportunity read ≠ contact fields or CA |
| Grant CA via ordinary Enquiry read | Today Enquiry read **already exposes** contacts — future redaction required; CA must be separate capability |
| Grant Project ownership / Business membership | CA domain must not mutate those |
| Create a second auth system | Compose existing bearer + membership + CA entitlement |

---

## 17. Summary table — seam classification (required list)

1. Entitlement persistence — `MISSING — NEW PERSISTENCE`  
2. Entitlement grant — `MISSING — NEW DOMAIN CAPABILITY`  
3. Entitlement check — `MISSING — NEW DOMAIN CAPABILITY`  
4. Entitlement revoke — `MISSING — NEW DOMAIN CAPABILITY`  
5. Commercial-event linkage — `EXISTS — REUSABLE WITH ADAPTER` + CA-specific work still missing  
6. Opportunity→Enquiry resolution — `EXISTS — REUSABLE WITH ADAPTER`  
7. Protected-contact resolution — `EXISTS — REUSABLE WITH ADAPTER`  
8. CA disclosure authorization — `MISSING — NEW DOMAIN CAPABILITY`  
9. CA HTTP — `MISSING — NEW HTTP`  
10. Enquiry redaction/cutover — `EXPLICITLY OUT OF SCOPE` (first slices)  
11. Audit/event history — `MISSING — NEW PERSISTENCE`  
12. Project-origin Opportunities — `EXPLICITLY OUT OF SCOPE`  
13. Provider/Paystack — `EXPLICITLY OUT OF SCOPE`  

---

*End of read-only audit. Construction not authorized.*
