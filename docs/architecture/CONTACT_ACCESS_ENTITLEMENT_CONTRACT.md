# Contact Access Entitlement Contract

## 1. Status

`PROPOSED — FOUNDER APPROVAL REQUIRED`

This document is an architecture contract exercise only. It does **not** authorize schema construction, HTTP changes, entitlement implementation, payment integration, or Enquiry redaction.

Date of proposal: 2026-09-23  
Branch context: `construction/saved-business-resource`  
Evidence basis: Customer Data Exposure Audit (read-only) and existing GHM Enquiry / Opportunity / Project / Project Quote / Commercial source.

---

## 2. Purpose

Define the canonical architectural separation between:

1. **Resource access** — whether a Business may read Opportunity / Enquiry / Project surfaces under existing GHM identity, membership, ownership, and visibility rules; and
2. **Contact disclosure access** — whether a Business has a separately established commercial entitlement allowing protected customer contact information to be disclosed.

The conceptual commercial flow this contract prepares for:

```text
Customer
  → Enquiry / Project
  → Opportunity
  → Business evaluates opportunity
  → Commercial event
  → Contact Access Entitlement
  → Protected customer contact disclosure
```

Binding principles:

> Resource READ must not imply Contact Disclosure.

> Payment must not itself be treated as the authorization primitive; payment may be an event that results in a Contact Access Entitlement.

---

## 3. Non-Goals

This contract does **not**:

- authorize or perform Enquiry read behaviour changes;
- authorize Opportunity, Project, or Project Quote schema or HTTP changes;
- authorize Project↔Opportunity relationship construction;
- implement Paystack, payment preparation, webhooks, or provider adapters;
- implement Contact Access Entitlement persistence or disclosure endpoints;
- alter existing commercial subscription / plan-feature entitlement behaviour;
- move customer phone/email onto Opportunity or Project;
- prescribe legal, privacy-policy, or grandfathering business policy;
- select a single commercial scope (A–E) without Founder approval.

---

## 4. Current System Evidence

### Enquiry (IMPLEMENTED)

- Canonical type: `Enquiry` in `src/resources/enquiry/contracts.ts`.
- Contact snapshot fields: `customerId`, `customerName`, `customerPhone`, `customerEmail`.
- Business received read/list returns the **full** Enquiry object (no redaction):
  - `GET /api/v1/enquiries/received/:enquiryId`
  - `GET /api/v1/enquiries/received?businessId=`
- Repository selects full `ENQUIRY_COLUMNS` including phone/email (`src/resources/enquiry/repository.ts`).
- Admin is denied Enquiry own/received operations via role gates (`src/resources/enquiry/service.ts`).

### Opportunity (IMPLEMENTED)

- Full projection includes `creatorAccountId`, `ownerBusinessId`, title, description, budgets, lifecycle, visibility (`src/resources/opportunity/contracts.ts`).
- Safe/public projection omits `creatorAccountId`, `ownerBusinessId`, `updatedAt`.
- HTTP: `GET /api/v1/opportunities/:opportunityId` delegates to `getOpportunity` (`src/http/opportunity-router.ts`).
- No phone/email fields on Opportunity.
- Enquiry-created Opportunities use `visibility = participants` with `owner_business_id` set from Enquiry business (`src/resources/enquiry/repository.ts`).

### Project (IMPLEMENTED)

- Account-owned via `account_id` (`database/migrations/20260910230000_create_project.sql`).
- Owner read exposes `accountId`; public projection omits it (`src/resources/project/public-contracts.ts`).
- No customer phone/email fields.
- No executable Project↔Opportunity relationship.

### Project Quote (IMPLEMENTED domain; HTTP ABSENT)

- Quote DTO has `projectId`, `businessId`, financial fields, status — no contact fields (`src/resources/project-quote/contracts.ts`).
- Does not currently provide a contact-unlock entitlement.

### Commercial subscriptions (SCHEMA + PARTIAL DOMAIN)

- Plan/subscription/entitlement tables and domain access evaluation exist (`database/migrations/20260915150000_create_commercial_schema.sql`, `src/resources/commercial/`).
- Example feature entitlement code in tests: `quote_management`.
- Payment prepare/cancel throw “not implemented”.
- No Contact Access / lead-unlock entitlement in executable code.
- `commercial` appears in role ACL (`src/auth/authorization.ts`) but is **not** registered in `src/resources/registry.ts`.

### Documented Connect concepts (DOCUMENTED / NOT IMPLEMENTED in GHM)

- `create_project_with_opportunity` — customer Project + Project-type Opportunity atomic RPC; Missing in GHM.
- Paystack checkout/webhook — external provider; not GHM core HTTP.

---

## 5. Resource Access vs Contact Disclosure

### Resource access

Authorization to observe a commercial resource according to existing GHM rules, for example:

- Enquiry received-read: active **owner** membership on `enquiry.business_id` + role `business`;
- Opportunity full read: creator **or** active owner/administrator on `owner_business_id`;
- Opportunity safe read: visibility `authenticated` / `public` for non-managers;
- Project owner-read: `project.account_id = context.userId`;
- Project public-read: dedicated public projection for eligible open Projects.

Resource access answers: **May this caller see this resource (or a projection of it)?**

### Contact disclosure access

A **separate** commercial entitlement answering: **May this Business receive protected customer contact fields for a specific Enquiry/Opportunity target?**

### Hard separation

| Concept | Existing GHM mechanism | Contact disclosure |
| --- | --- | --- |
| Identity / membership / visibility | AuthContext, membership SQL, Opportunity visibility | Must **not** alone disclose protected contacts (target model) |
| Registry `read` | Coarse resource ACL | Must **not** equal contact unlock |
| Subscription plan feature | `commercial_plan_entitlement` codes | Must **not** equal per-lead contact ownership |
| Payment attempt / transaction | Commercial payment tables (ops incomplete) | Event only; not authorization primitive |

**Current gap:** Enquiry received `read` already returns phone/email. This contract records that as incompatible with the target model and names it a **future migration seam** (§13), without changing it now.

---

## 6. Evaluation-Safe Data

Field classification for a proposed **pre-entitlement business-facing** projection.

Legend:

- `EVALUATION_SAFE` — suitable for determining commercial relevance without contact disclosure.
- `CONTACT_PROTECTED` — must not be returned without Contact Access Entitlement (target model).
- `INTERNAL_ONLY` — system/audit fields not required for business evaluation UI.
- `DECISION_REQUIRED` — Founder/product must classify; evidence does not justify a final call.

### Enquiry

| Field | Classification | Notes |
| --- | --- | --- |
| `id` | `EVALUATION_SAFE` | Stable handle for list/detail. |
| `businessId` | `EVALUATION_SAFE` | Recipient Business; already known to caller for received paths. |
| `customerId` | `DECISION_REQUIRED` | Account identity key; may enable contact recovery elsewhere. |
| `customerName` | `DECISION_REQUIRED` | May be evaluate-useful; also personal identity. |
| `customerPhone` | `CONTACT_PROTECTED` | Canonical contact. |
| `customerEmail` | `CONTACT_PROTECTED` | Canonical contact. |
| `city` | `DECISION_REQUIRED` | Location aids evaluation; may be sensitive depending on product policy. |
| `project` | `EVALUATION_SAFE` | Work title / request summary. |
| `description` | `EVALUATION_SAFE` | Work content. |
| `budgetMin` / `budgetMax` | `EVALUATION_SAFE` | Commercial relevance. |
| `urgency` | `EVALUATION_SAFE` | Priority signal. |
| `source` | `EVALUATION_SAFE` | Provenance of request. |
| `status` | `EVALUATION_SAFE` | Pipeline state for recipient. |
| `opportunityId` | `EVALUATION_SAFE` | Link to evaluation surface. |
| `createdAt` / `updatedAt` | `EVALUATION_SAFE` | Freshness; not contact. |

### Opportunity

| Field | Classification | Notes |
| --- | --- | --- |
| `id` | `EVALUATION_SAFE` | Primary evaluation key. |
| `opportunityTypeId` | `EVALUATION_SAFE` | Type of commercial opportunity. |
| `creatorAccountId` | `DECISION_REQUIRED` | No phone/email, but identity key; present on full projection today. |
| `ownerBusinessId` | `EVALUATION_SAFE` | Recipient/owning Business for Enquiry-spawned rows. |
| `countryId` / `currencyId` | `EVALUATION_SAFE` | Geographic/commercial context when set. |
| `title` | `EVALUATION_SAFE` | Copied from Enquiry `project` on create. |
| `description` | `EVALUATION_SAFE` | Copied from Enquiry description on create. |
| `lifecycleStatus` | `EVALUATION_SAFE` | Pipeline. |
| `visibility` | `INTERNAL_ONLY` or `EVALUATION_SAFE` | Useful for operators; not customer contact. Treat as `EVALUATION_SAFE` for managers. |
| `budgetMin` / `budgetMax` | `EVALUATION_SAFE` | Commercial relevance. |
| `opensAt` / `closesAt` | `EVALUATION_SAFE` | Timing window. |
| `createdAt` | `EVALUATION_SAFE` | Freshness. |
| `updatedAt` | `INTERNAL_ONLY` | Omitted from public projection today; not required for first evaluate UI. |

Phone/email fields are **not present** on Opportunity and must not be added (§8).

---

## 7. Protected Customer Data

Under the target model, protected contact disclosure includes at least:

- `Enquiry.customerPhone`
- `Enquiry.customerEmail`

Additional fields marked `DECISION_REQUIRED` in §6 may be added to the protected set only after Founder approval (notably `customerId`, `customerName`, `creatorAccountId`, possibly `city`).

Protected data must not be inferred into Opportunity or Project schemas.

---

## 8. Canonical Contact Data Owner

**Canonical owner of customer contact snapshot for the Enquiry → Opportunity marketplace workflow:**

```text
ghm.enquiry
  customer_phone
  customer_email
  (and related customer_* snapshot fields)
```

Architectural direction:

> Opportunity is an evaluation/commercial surface, not a customer-contact store.

Therefore:

- Do **not** add phone/email columns to Opportunity or Project for this model.
- Contact disclosure, when entitled, should resolve from Enquiry (or a dedicated disclosure projection of Enquiry), keyed by the commercial target (Opportunity and/or Enquiry — scope TBD in §10).
- Project remains without contact fields; Project Quote remains without contact fields.

---

## 9. Contact Access Entitlement

Conceptual resource (not schema):

**Meaning:** Business *B* may receive protected customer contact data for commercial target *T* (Opportunity and/or Enquiry — scope TBD).

### Likely required conceptual attributes

| Attribute | Role |
| --- | --- |
| Entitlement identity | Stable id for audit and revocation. |
| `businessId` | Subject Business receiving disclosure rights. |
| Target binding | At least one of Opportunity id and/or Enquiry id (depends on §10 scope). |
| Entitlement type / code | Distinguishes contact-access from plan features (e.g. conceptual `contact_access`). |
| Status | e.g. active / revoked / expired (vocabulary TBD at construction). |
| `grantedAt` | When disclosure rights became effective. |
| Source / event reference | Link to verified commercial event (payment result, manual grant, etc.). |

### Optional / construction-time

| Attribute | Role |
| --- | --- |
| `expiresAt` | If time-bounded unlocks are product-required. |
| `revokedAt` | Explicit revocation timestamp. |
| Dual binding (Opportunity **and** Enquiry) | Stronger audit if both exist; may be redundant if one is canonical. |
| Actor / grantor metadata | Who/what granted the entitlement. |
| Audit metadata | Provider event ids, correlation ids — without embedding Paystack SDKs in core. |

### Canonical identifiers (directional)

- **Business id** is required (subject of disclosure).
- **Commercial target** must be bound to Opportunity and/or Enquiry once Founder selects scope A/B/E (§10).
- Payment attempt/transaction ids are **source references**, not substitutes for the entitlement record.

---

## 10. Entitlement Scope Options

No winner is declared. Founder approval is required for selection.

### A. Per Opportunity

Business unlocks contact for one Opportunity.

- **Implications:** Aligns with evaluation surface; Enquiry contacts retrieved via `enquiry.opportunity_id` / reverse lookup.
- **Ownership:** Entitlement keyed by `(businessId, opportunityId)`.
- **Audit:** Clear commercial unit.
- **Revocation:** Revoke one Opportunity unlock.
- **vs subscriptions:** Orthogonal to plan features.
- **vs payment:** One payment event → one Opportunity entitlement (typical).

### B. Per Enquiry

Business unlocks contact for one Enquiry.

- **Implications:** Matches canonical contact store; Opportunity optional for evaluation.
- **Ownership:** `(businessId, enquiryId)`.
- **Audit:** Direct.
- **Revocation:** Per Enquiry.
- **Risk:** Bypasses Opportunity as commercial unit if evaluation is Opportunity-centric.

### C. Business credit

Business consumes a credit to unlock a lead/contact.

- **Implications:** Needs ledger/balance primitive (not present as lead-credit today).
- **Ownership:** Credit pool on Business + spend event creating A or B entitlement.
- **Audit:** Requires double-entry style events.
- **Revocation:** Credits vs already-granted entitlements must be distinguished.
- **vs subscriptions:** May coexist (plan grants monthly credits).
- **vs payment:** Payment top-ups credits; spend grants entitlement.

### D. Subscription feature

Plan determines whether Business may unlock contacts at all.

- **Implications:** Reuses `commercial_plan_entitlement` **eligibility**, not ownership of a specific lead.
- **Must not** treat plan feature alone as proof of contact disclosure for a specific Enquiry/Opportunity (§16).
- **Audit:** Weak for per-lead disclosure unless paired with A/B/C event.
- **Revocation:** Plan expiry vs per-lead grants.

### E. Hybrid

Subscription/plan establishes **eligibility** to purchase/unlock; a separate commercial event grants Contact Access Entitlement for a specific Opportunity/Enquiry.

- **Implications:** Fits existing commercial architecture (plan entitlements) + new per-target entitlement.
- **Ownership:** Plan feature ≠ lead entitlement.
- **Audit:** Strongest separation of “can buy unlocks” vs “unlocked X”.
- **Revocation:** Plan loss may block new unlocks; existing entitlements need explicit policy.
- **vs payment:** Payment verifies purchase; entitlement records disclosure right.

**Architecture decisions requiring Founder approval:** choice among A–E (or a named hybrid of D+A / D+B / C+A).

---

## 11. Payment → Entitlement Boundary

Intended authority chain:

```text
Payment event
      ↓
Commercial verification
      ↓
Entitlement grant
      ↓
Contact disclosure authorization
      ↓
Protected contact returned
```

**Authoritative for disclosure:** the **Contact Access Entitlement** record (once constructed), not the raw payment row alone.

Payment / provider events may be **inputs** that cause entitlement grant after verification. Existing GHM commercial payment preparation is **not implemented**; Paystack remains an external adapter concern and is **outside** this contract’s construction authorization.

Combination pattern (directional): verified payment event **references** → entitlement **authorizes** disclosure.

---

## 12. Disclosure Contract

Conceptual rule for any future disclosure service/endpoint:

**Without** a valid Contact Access Entitlement for `(Business, target)`:

```text
protected contact fields MUST NOT be returned
```

**With** a valid Contact Access Entitlement:

```text
protected contact fields MAY be returned
```

Minimum validation concepts (construction-time):

1. Authenticated Business actor with authority to act for `businessId` (membership rules TBD against existing owner-only Enquiry pattern).
2. Entitlement status active (not revoked / not expired if expiry exists).
3. Entitlement `businessId` matches requesting Business.
4. Entitlement target binds to the Opportunity and/or Enquiry being disclosed.
5. Auditability: grant source/event reference retained.

Resource READ without entitlement may still return evaluation-safe projections (§6) once redaction is constructed — **future work**.

---

## 13. Enquiry Migration Seam

**Current behaviour (must be preserved until separately authorized):**

Received Enquiry HTTP returns full `Enquiry`, including `customerPhone` and `customerEmail`.

**Future construction requirement (not current behaviour):**

> Received-Enquiry business responses will eventually need a redacted projection unless a valid Contact Access Entitlement exists.

This is the primary privacy migration seam. Construction of redaction must not begin until Founder approves §18 decisions and an explicit construction authorization is issued.

---

## 14. Opportunity Boundary

Commercial interpretation proposed for Founder confirmation:

> Opportunity contains enough information for a Business to determine whether an opportunity is commercially relevant without requiring customer contact information.

**Supported by existing fields:** title, description, budgets, type, lifecycle, owner Business, timing, country/currency when set.

**Limitations (document; do not invent fields):**

- No structured category/location beyond what was copied into title/description/budgets from Enquiry.
- No phone/email (by design).
- Full read today still exposes `creatorAccountId` (`DECISION_REQUIRED` for evaluate-safe APIs).
- Enquiry remains the contact store; Opportunity alone cannot disclose phone/email.

Opportunity should remain the **evaluation/commercial surface**, not a contact store (§8).

---

## 15. Project Relationship Boundary

Separately documented; **out of scope for Contact Access construction:**

- Project is account-owned; Opportunity is creator + optional `owner_business_id`.
- No executable Project↔Opportunity relationship.
- `create_project_with_opportunity` remains documented / not implemented in GHM.

**Contact-entitlement architecture is not blocked** on Project↔Opportunity: Enquiry already carries contacts and links to Opportunity via `enquiry.opportunity_id`. Marketplace evaluate → unlock can proceed against Enquiry/Opportunity without Project.

**Future relationship requirement (not implemented here):** if Project-originated quoting must join the same unlock model, a separate Founder decision on Opportunity↔Project (Models A/C/D from prior audit) remains required.

---

## 16. Existing Commercial Subscription Boundary

| Kind | Example | Meaning |
| --- | --- | --- |
| **Existing** plan feature entitlement | e.g. `quote_management` | Business subscription/plan capability |
| **Proposed** Contact Access Entitlement | conceptual `contact_access` for target T | Per-target disclosure right |

**Hard rule:**

> Subscription feature entitlements MUST NOT be treated as proof of ownership of, or entitlement to, a specific customer lead’s protected contact data.

Hybrid scope E may use a plan feature as **eligibility to unlock**, while Contact Access Entitlement remains the **disclosure authority**.

---

## 17. Existing Exposure / Grandfathering Questions

Technical questions for Founder/Product (not legal advice; not implementation):

1. Does the new privacy boundary apply only to **future reads**?
2. Do previously exposed contacts require any technical treatment?
3. Are existing Enquiry rows grandfathered for Businesses that already received them?
4. Does Contact Access Entitlement apply retroactively to past Opportunities/Enquiries?
5. What happens to already-created Project Quotes or other commercial interactions tied to previously exposed contacts?
6. Should historical API clients expect breaking redaction, or dual endpoints during migration?

---

## 18. Founder Decisions Required

1. Approve the Resource Access vs Contact Disclosure separation as binding GHM architecture.
2. Classify all `DECISION_REQUIRED` fields in §6 (`customerId`, `customerName`, `city`, `creatorAccountId`, and any others raised).
3. Confirm Enquiry as canonical contact-data owner and Opportunity as non-contact store (§8).
4. Select entitlement scope among A / B / C / D / E (or a named hybrid).
5. Confirm payment → verified event → entitlement → disclosure chain (§11), with entitlement as disclosure authority.
6. Confirm subscription feature entitlements remain distinct from Contact Access Entitlement (§16).
7. Set grandfathering / migration policy for existing full Enquiry received exposure (§17).
8. Authorize (or defer) future Enquiry redaction construction separately from this contract.
9. Confirm Opportunity is sufficient as evaluation surface for v1, or list approved data gaps (without inventing fields in this slice).
10. Confirm Contact Access work is **not** gated on Project↔Opportunity construction (§15).

---

## 19. Future Construction Preconditions

Before any code, schema, or HTTP work for Contact Access:

1. This contract marked approved (or replaced) by Founder authorization with §18 decisions recorded.
2. Explicit construction brief naming: redaction vs new disclosure endpoint, entitlement persistence, and payment-event wiring (if any).
3. Separate authorization for Paystack/provider integration — not implied by this document.
4. No accidental reuse of `commercial_plan_entitlement` as per-lead contact ownership.
5. Enquiry received routes remain unchanged until a dedicated redaction/disclosure construction is authorized.

---

## 20. Non-Changes In This Slice

Explicitly confirmed for the exercise that produced this document:

- no executable code changed
- no existing migrations changed
- no new migration
- no HTTP route changed
- no auth change
- no entitlement implementation
- no payment implementation
- no frontend change
- no Project↔Opportunity implementation
- no deployment
- `docs/architecture/BRIEF_SOURCE_AUDIT.md` not modified
