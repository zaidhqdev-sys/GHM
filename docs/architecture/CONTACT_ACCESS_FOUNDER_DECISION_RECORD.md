# Contact Access Founder Decision Record

## 1. Status

`FOUNDER-APPROVED — MODEL A SELECTED; COMMERCIAL DECISIONS FINALIZED IN §5; IMPLEMENTATION UNAUTHORIZED`

This record **locks**:

1. Architectural principles separating resource access from customer-contact disclosure.
2. **Commercial model Model A — Per Opportunity Contact Access.**
3. **§5 Founder Commercial Decisions** (v1 commercial policy), except items explicitly marked open.

It does **not** authorize executable construction, schema, HTTP redaction, payment, entitlement persistence, Paystack integration, Enquiry behavioural change, or Project↔Opportunity work.

Initial principles date: 2026-09-23  
Model A selection date: 2026-09-23  
§5 commercial finalization date: 2026-09-23  
Branch context: `construction/saved-business-resource`

---

## 2. Source Contracts

This decision record is grounded in:

| Source | Role |
| --- | --- |
| `docs/architecture/CONTACT_ACCESS_ENTITLEMENT_CONTRACT.md` | Contact-access architecture contract (field classifications, scope options, payment→entitlement boundary) |
| Customer Data Exposure Audit (read-only session evidence) | Current Enquiry/Opportunity/Project/Quote/Commercial exposure facts |
| Contact Access Commercial Model Analysis (read-only session evidence) | Neutral implications of Models A–E |
| `docs/architecture/ENQUIRY_OPERATION_CONTRACT.md` | Enquiry recipient ownership and operations |
| `docs/architecture/OPPORTUNITY_CORE_CONTRACT.md` | Opportunity projections, visibility, ownership |
| `docs/architecture/COMMERCIAL_CAPABILITY_ARCHITECTURE_CONTRACT.md` | Plan/subscription feature entitlements vs provider-neutral commercial core |
| `docs/architecture/PROJECT_RESOURCE_CONTRACT.md` | Account-owned Project; no contact fields |
| `docs/architecture/PROJECT_QUOTE_SCHEMA_CONTRACT.md` / operation contracts | Quote against Project + Business; no contact fields |

Executable evidence (unchanged by this record) includes:

- `src/resources/enquiry/*`, `src/http/enquiry-router.ts`
- `src/resources/opportunity/*`, `src/http/opportunity-router.ts`
- `src/resources/project/*`, `src/resources/project-quote/*`
- `src/resources/commercial/*`

---

## 3. Locked Architectural Decisions

### Decision 1 — Resource READ ≠ Contact Disclosure

GHM resource authorization and customer-contact disclosure are **separate concepts**.

A Business being authorized to read an Opportunity, Enquiry, Project, or other resource does **not inherently grant** the right to receive protected customer contact information.

This is a foundational architectural invariant.

### Decision 2 — Enquiry remains canonical contact-data owner

For the current marketplace workflow:

- `Enquiry.customerPhone`
- `Enquiry.customerEmail`

remain the canonical customer-contact data.

These fields must **not** be moved into Opportunity.  
They must **not** be duplicated onto Opportunity merely for convenience.  
Project currently has no contact fields and remains that way under this decision.

> Opportunity is a commercial/evaluation surface, not a customer-contact store.

### Decision 3 — Opportunity remains contact-free

Opportunity must **not** acquire:

- customer phone
- customer email
- duplicated customer contact fields

Opportunity may expose sufficient evaluation information without exposing direct contact information.

Whether `creatorAccountId`, `customerId`, and `customerName` are evaluation-safe remains **OPEN** (see §5.B).

### Decision 4 — Contact Access is a separate entitlement concept

GHM recognizes a conceptual capability:

**Contact Access Entitlement**

Purpose (aligned with Model A):

> A separately established commercial authorization allowing a specific Business to receive protected customer contact information associated with a specific Opportunity (resolved through the associated Enquiry contact snapshot where applicable).

It is **not** the same as:

- resource `read`
- membership
- owner/admin authorization
- Opportunity visibility
- subscription feature entitlement

No Contact Access Entitlement schema or implementation is authorized by this record.

### Decision 5 — Existing subscription entitlements remain separate

Existing commercial subscription entitlements such as `quote_management` remain **feature entitlements**.

They must **not** be reinterpreted as:

- lead ownership
- contact access
- contact purchase
- Opportunity unlock

Contact Access Entitlement remains a distinct concept even if subscription eligibility later becomes one **input** into whether a Business may acquire Contact Access.

### Decision 6 — Payment is not the authorization primitive

Conceptual boundary (locked):

```text
Payment / verified commercial event
        ↓
Entitlement grant
        ↓
Contact disclosure authorization
        ↓
Protected contact data
```

The payment provider itself is not the long-term authorization source.

GHM should eventually evaluate an authoritative **internal entitlement state** before disclosing protected contact data.

This record does **not** implement payment or entitlement and does **not** invent Paystack webhook behaviour.

---

## 3A. Dated Decision — Model A Selected (2026-09-23)

**Founder-selected commercial model:**

### Model A — Per Opportunity Contact Access

The commercial target is the canonical `Opportunity.id`.

A Business may acquire Contact Access for a **specific Opportunity**.

The resulting entitlement is target-specific and independently authorizes disclosure of the protected contact information held by the **associated Enquiry**.

Conceptual relationship (not implemented):

```text
Business
  → commercial action / payment / event
  → Contact Access Entitlement
  → Opportunity
  → associated Enquiry
  → protected customer contact snapshot
```

Models B (Per Enquiry), C (Business Credit), D (Subscription Feature as sole unlock), and E (Hybrid) are **not selected** as the primary commercial target model by this decision. Credits and subscription eligibility may be considered later without changing the Opportunity-target entitlement model (see locked principles below).

---

## 3B. Locked Commercial Principles (Model A)

Approved with Model A:

### 1. Commercial target

The monetized target is an **Opportunity**, not the Business subscription and not the generic Enquiry resource.

### 2. Entitlement specificity

Contact access is granted for a specific Opportunity.

A Business that has access to one Opportunity does **not** automatically receive contact access to other Opportunities.

### 3. Contact ownership

Phone/email remain owned by the canonical Enquiry contact snapshot.

The entitlement does **not** transfer ownership of the contact data.

### 4. Disclosure

Contact Access Entitlement authorizes disclosure of the protected contact fields.

It does **not** automatically grant:

- Project ownership
- Opportunity ownership
- Quote ownership
- Business membership
- administrator privileges
- unrestricted Enquiry access

### 5. Payment separation

Payment/provider state does not itself authorize contact disclosure.

Future flow:

```text
Provider / payment event
  → verified commercial event
  → GHM entitlement state
  → contact disclosure authorization
```

Provider credentials, webhooks, and payment-provider-specific behaviour remain outside the GHM authorization primitive.

### 6. Reusability

Once granted, Contact Access is reusable by the entitled Business for that specific Opportunity, subject to future lifecycle rules.

Expiry, revocation, refund, and cancellation behaviour details are recorded in **§4** where decided, and remain open where marked Founder-required.

### 7. Subscription separation

Existing subscription/plan entitlements may later determine whether a Business is **eligible** to perform a commercial action, but they do **not** replace the target-specific Contact Access Entitlement.

No subscription gating is added by this record.

### 8. Credits

No Business credit/balance system is authorized by this decision.

Credits may be considered later as a payment/funding mechanism without changing the Opportunity-target entitlement model.

### 9. Project-originated Opportunities

This decision does **not** settle the Project↔Opportunity relationship.

Do **not** assume that every Opportunity has an Enquiry.

If future Project-originated Opportunities require contact disclosure, a separate canonical contact-owner relationship must be designed before implementation.

### 10. Existing customers/businesses

Do **not** grandfather, revoke, or migrate existing Enquiry contact access as part of this decision.

Existing behaviour remains unchanged until a separate redaction/migration decision is approved.

---

## §4 — Contact Access Lifecycle Decision

This section records lifecycle decisions for **Model A — Per Opportunity Contact Access**.

It does **not** rewrite §3 / §3A / §3B.  
It does **not** authorize schema, HTTP, payment, redaction, or runtime construction.

Where a Founder choice has not been made, the item is marked `OPEN — FOUNDER DECISION REQUIRED` without invention.

---

### A. Entitlement identity and lifecycle

**Decision:** The conceptual entitlement identity is:

```text
Business + Opportunity + Contact Access
```

i.e. a target-specific Contact Access Entitlement bound to one `businessId` and one `Opportunity.id` (Model A).

Conceptual lifecycle under consideration:

```text
pending → active → revoked
```

- `active` is the state that authorizes contact disclosure for that Business+Opportunity pair.
- `revoked` means future disclosure must not be authorized by that entitlement.
- Whether `pending` is required (e.g. between commercial intent and verified grant) is an implementation detail to confirm at construction.
- Whether separate terminal states such as `expired` or `refunded` are required (vs representing those outcomes as `revoked` plus audit metadata) is **not** fully settled.

**Rationale:** Model A and entitlement specificity already lock the identity key. Reusability while granted implies a durable `active` state. Revocation of future authorization is required by the contact-disclosure architecture. Exact state vocabulary beyond that must not invent schema.

**Implementation implication:** Future construction may persist an entitlement keyed by Business + Opportunity with at least an active/revoked distinction. No migration or table is authorized here. Do not invent columns or CHECK constraints in this record.

**Status:** `FOUNDER-APPROVED PRINCIPLE — IMPLEMENTATION OPEN`  
(Identity / Model A binding: Founder-approved. Exact state machine including whether `expired`/`refunded`/`pending` are first-class states: implementation still open; Founder must confirm before construction.)

---

### B. Protected fields

**Decision:**

| Field | Classification for Contact Access | Notes |
| --- | --- | --- |
| `customerPhone` | Protected contact field | Canonical Enquiry contact; minimum disclosure candidate after valid Contact Access |
| `customerEmail` | Protected contact field | Canonical Enquiry contact; minimum disclosure candidate after valid Contact Access |
| `customerName` | **Not settled** | Identity-facing; may be evaluation-safe or protected |
| `customerId` | Internal identity / recovery identifier | Not phone/email; whether disclosure-gated remains open |
| `creatorAccountId` | Internal Opportunity identity / recovery identifier | Not on Enquiry contact snapshot; not phone/email; whether disclosure-gated remains open |

**Minimum fields that should eventually be disclosable after valid Contact Access (principle):** `customerPhone` and `customerEmail` from the Enquiry contact snapshot.

**Rationale:** Decisions 2–3 and the Contact Access Entitlement Contract treat phone/email as the contact-disclosure surface and Opportunity as contact-free. Name and account ids were left `DECISION_REQUIRED` / open and must not be invented here.

**Implementation implication:** Future redaction/disclosure must not change current Enquiry HTTP behaviour until separately authorized. When constructed, protected disclosure after Contact Access must include phone/email at minimum; other fields wait on Founder choice.

**Status:**

- `customerPhone` / `customerEmail` (protected + minimum post-access disclosure): `FOUNDER-APPROVED PRINCIPLE — IMPLEMENTATION OPEN`
- `customerName` / `customerId` / `creatorAccountId`: `OPEN — FOUNDER DECISION REQUIRED`

---

### C. Granting event

**Decision:** The canonical future grant mechanism must preserve:

```text
provider event
  → verified commercial event
  → GHM Contact Access Entitlement
  → contact disclosure authorization
```

Payment-provider success must **never** itself become the authorization primitive.

Candidate granting events (not selected as the sole exclusive mechanism by this §4):

- verified payment;
- verified commercial transaction;
- promotional / manual Founder grant.

**Rationale:** Decision 6 / principle 5 already lock the provider→verified event→entitlement→disclosure chain. Which concrete events may create an `active` entitlement has not been Founder-selected beyond allowing that payment is one possible input and promotional grants remain conceptually possible.

**Implementation implication:** Construction must evaluate GHM entitlement state for disclosure, not raw provider webhook success. Exact allow-list of grant events requires Founder choice before implementation.

**Status:** Chain / non-provider-as-auth: `FOUNDER-APPROVED`  
Exact exclusive grant-event set: `OPEN — FOUNDER DECISION REQUIRED`

---

### D. Repeated access

**Decision:**

1. **Duplicate active prevention:** A Business must not hold multiple concurrent **active** Contact Access Entitlements for the same Opportunity.
2. **Reuse:** While an entitlement for that Business+Opportunity remains **active**, repeated reads/disclosures reuse that entitlement (no second purchase required solely to re-read). This follows locked reusability (§3B.6).
3. **Re-grant after revocation:** Whether a Business may acquire a new active entitlement for the same Opportunity after revocation (and under what commercial conditions) is **not** settled.
4. **Historical audit:** Prior grants, revocations, and commercial events must remain auditable even after revocation; audit history is not erased by losing future authorization.

**Rationale:** Specificity (one Opportunity) plus reusability while granted imply uniqueness of active entitlement and reuse. Re-purchase after revoke is a commercial policy choice not yet locked. Auditability is required for commercial entitlement systems and does not invent a schema here.

**Implementation implication:** Future unique constraint / application check on active `(businessId, opportunityId)`. Disclosure services consult active entitlement. Re-grant rules wait for Founder. Audit trail retained on revoke.

**Status:** Duplicate prevention + reuse while active + historical audit principle: `FOUNDER-APPROVED PRINCIPLE — IMPLEMENTATION OPEN`  
Re-grant after revocation: `OPEN — FOUNDER DECISION REQUIRED`

---

### E. Expiry

**Decision:** Not selected.

Access may eventually:

- not expire;
- have fixed expiry;
- depend on Opportunity lifecycle;

…but **no** duration, calendar rule, or Opportunity-driven expiry rule is Founder-approved here.

**Rationale:** §3B.6 explicitly left expiry unspecified. Inventing a duration would exceed this task’s authority.

**Implementation implication:** Do not encode TTL or lifecycle-tied expiry until Founder decides. Construction briefs must ask for an explicit expiry policy.

**Status:** `OPEN — FOUNDER DECISION REQUIRED`

---

### F. Revocation

**Decision:**

1. **Future authorization vs history:** Revocation (or equivalent loss of active status) removes authority for **future** contact disclosure under that entitlement. It does **not** technically “undisclose” information already returned to a client in prior responses.
2. **Candidate revocation triggers** (evaluative; not all approved as automatic rules):

| Trigger | Status in this record |
| --- | --- |
| Administrative revocation | Conceptually valid; automation/policy open |
| Fraud / abuse | Conceptually valid; automation/policy open |
| Refund | See §4.G |
| Chargeback | See §4.G |
| Opportunity cancellation | See §4.H |
| Business / account disablement | Conceptually relevant; policy open |

**Rationale:** Architecture separates entitlement state (authorization) from irreversible prior disclosure. Specific automatic triggers were listed as open in prior Founder open decisions and must not be invented.

**Implementation implication:** Disclosure checks active entitlement at request time. Revocation updates entitlement state and audit metadata. Do not claim data already delivered can be erased from recipient systems by GHM alone.

**Status:** Future-auth revocation vs non-undisclosure of past disclosure: `FOUNDER-APPROVED PRINCIPLE — IMPLEMENTATION OPEN`  
Which triggers automatically revoke: `OPEN — FOUNDER DECISION REQUIRED`

---

### G. Refund / chargeback

**Decision:**

1. Verified refund or chargeback events **may** affect **future** contact authorization (e.g. by revoking an active entitlement), but the exact automatic rule is **not** Founder-approved here.
2. Information **already disclosed** cannot be technically undisclosed by GHM as a consequence of refund/chargeback.

**Rationale:** Preserves payment→entitlement separation and the irreversible nature of prior disclosure. Exact coupling of refund/chargeback to entitlement state remains a Founder commercial/risk policy choice.

**Implementation implication:** Do not implement payment processing, refund pipelines, or chargeback handlers in this slice. Future construction must not treat provider refund webhooks as direct disclosure toggles without GHM entitlement state updates.

**Status:** Non-undisclosure of past disclosure: `FOUNDER-APPROVED PRINCIPLE — IMPLEMENTATION OPEN`  
Whether / how refund or chargeback auto-revokes entitlement: `OPEN — FOUNDER DECISION REQUIRED`

---

### H. Opportunity lifecycle

**Decision:** Not settled per state.

Evaluated Opportunity states (Opportunity lifecycle remains unmodified by this record):

| Opportunity state | Contact Access policy |
| --- | --- |
| `cancelled` | `OPEN — FOUNDER DECISION REQUIRED` |
| `archived` | `OPEN — FOUNDER DECISION REQUIRED` |
| `awarded` | `OPEN — FOUNDER DECISION REQUIRED` |
| `completed` | `OPEN — FOUNDER DECISION REQUIRED` |

**Rationale:** Prior open decision G explicitly left Opportunity cancellation/archive behaviour open. Extending invented auto-revoke/keep rules to awarded/completed would exceed authority.

**Implementation implication:** Do not modify Opportunity transition code or couple Contact Access to lifecycle in implementation until Founder policy exists. Entitlement evaluation must not silently invent lifecycle hooks.

**Status:** `OPEN — FOUNDER DECISION REQUIRED` (for each listed state)

---

### I. Enquiry mutation after entitlement

**Decision:** Not selected among:

1. current canonical Enquiry contact fields (live read);
2. a purchase-time snapshot;
3. another versioned contact model.

Note: language elsewhere referring to the Enquiry “contact snapshot” means the **Enquiry-owned contact fields as the data owner**, not a Founder decision that disclosure is frozen at purchase time.

**Rationale:** Open Decision H in the prior open list; creating a snapshot table is explicitly out of scope for this documentation task.

**Implementation implication:** Do not create snapshot tables or change Enquiry writes. Construction requires an explicit Founder choice before disclosure semantics for mutated contacts are coded.

**Status:** `OPEN — FOUNDER DECISION REQUIRED`

---

## §5 — Founder Commercial Decisions

**Date:** 2026-09-23  

This section finalizes v1 commercial policy for Model A using:

- `CONTACT_ACCESS_OPEN_DECISION_ANALYSIS.md` as **decision input only**;
- prior locked principles in §3 / §3A / §3B / §4.

Proposals from the analysis are **not** silently treated as approved unless recorded below with an explicit status.

This section does **not** authorize schema, HTTP, payment, redaction, or runtime construction (see Implementation Gate).

---

### A. Protected fields

| Field | After valid Contact Access | Classification |
| --- | --- | --- |
| `customerPhone` | **May be disclosed** | Protected contact field |
| `customerEmail` | **May be disclosed** | Protected contact field |
| `customerName` | **May be disclosed** | Protected contact field (human-readable identity for outreach) |
| `customerId` | **Must not be disclosed** by Contact Access | Permanently protected / internal identifier |
| `creatorAccountId` | **Must not be disclosed** by Contact Access | Permanently protected / internal identifier |

**Disclosure after Contact Access (v1):** `customerPhone`, `customerEmail`, `customerName` from the canonical Enquiry contact snapshot (subject to §5.H mutation rule).

**Permanently protected / internal (v1):** `customerId`, `creatorAccountId` — not part of Contact Access disclosure even when entitlement is active.

**Status:** `FOUNDER-APPROVED`  
**Implementation implication:** Future disclosure projections include phone/email/name only among these five; account ids remain omitted. Current Enquiry HTTP behaviour is unchanged until redaction/disclosure construction is separately authorized.

---

### B. Grant mechanism

**Decision:** v1 grants Contact Access only through:

```text
provider/commercial event
  → verified GHM commercial event
  → Contact Access Entitlement (active)
```

Approved grant reasons under one entitlement model:

1. **Verified commercial grant** — includes verified successful payment outcomes once payment ops exist, represented as a verified GHM commercial event (not raw provider success).
2. **Promotional / manual Founder (or authorized admin) grant** — separate auditable grant reason; still creates a Contact Access Entitlement; never a read-bypass around entitlement checks.

Provider webhook success must never authorize disclosure directly.

**Status:** `FOUNDER-APPROVED`  
**Implementation implication:** Entitlement rows carry grant reason + commercial/event reference. Payment-provider integration remains separately authorized (§5.M).

---

### C. Entitlement states

**Decision:** Separate layers:

| Layer | v1 content |
| --- | --- |
| Entitlement **authorization** state | `active` \| `revoked` |
| Commercial / payment history | Separate events/records (success, refund, chargeback, etc.) |
| Audit / event history | Immutable grant/revoke/attempt history |

- `pending` is **not** required as a first-class authorization state for v1 if entitlements are created only when verified.
- `expired`, `refunded`, and `cancelled` are **not** first-class authorization states; express via `revoked` + reason and/or commercial history.

**Status:** `FOUNDER-APPROVED PRINCIPLE — IMPLEMENTATION OPEN`  
(Persistence shape open; authorization vocabulary locked as above.)

---

### D. Duplicate / idempotency behavior

**Decision:**

1. At most **one active** Contact Access Entitlement per `(Business, Opportunity)`.
2. Duplicate commercial/provider events for the same grant must be **idempotent**: do not create a second active entitlement.
3. While `active`, the Business **reuses** that entitlement for repeated disclosure (no repurchase solely to re-read).
4. After `revoked`, a **new** verified grant (or approved promotional grant) **may** create a new active entitlement; prior entitlement/events remain auditable.

**Status:** `FOUNDER-APPROVED`  
**Implementation implication:** Unique active constraint / equivalent application rule; idempotency keys on commercial events; history retained on re-grant.

---

### E. Expiry

**Decision:** v1 Contact Access authorization **does not expire** by calendar TTL and **does not** automatically expire solely because Opportunity lifecycle advances.

Future authorization ends only via **revocation** (or equivalent loss of `active` status) under §5.F / §5.G.

No fixed duration is approved.

**Status:** `FOUNDER-APPROVED`  
**Implementation implication:** Do not encode entitlement TTL in v1. Opportunity lifecycle effects on **new purchase eligibility** are separate (§5.G).

---

### F. Revocation

**Decision:**

| Trigger | Future authorization | Already-disclosed information |
| --- | --- | --- |
| Manual / admin revocation | **Revoke** (`active` → `revoked`) | Not undisclosed |
| Fraud / abuse | **Revoke** (manual or policy-driven) | Not undisclosed |
| Business / account disablement | Disclosure **blocked** at auth/membership runtime; entitlement **may** also be revoked | Not undisclosed |
| Verified refund | **Revoke** future authorization | Not undisclosed |
| Verified chargeback | **Revoke** future authorization | Not undisclosed |

**Status:** `FOUNDER-APPROVED`  
**Implementation implication:** Disclosure checks `active` entitlement at request time **and** caller auth. Revocation updates entitlement + audit; never claims prior deliveries are erased from recipient systems.

---

### G. Opportunity lifecycle

**Decision:** Opportunity lifecycle itself is unmodified. Contact Access policy:

| Opportunity state | New Contact Access grants | Existing `active` entitlement |
| --- | --- | --- |
| `draft` | **Not eligible** | N/A (should not be sold) |
| `open` | Eligible | Retain until revoked |
| `responding` | Eligible | Retain until revoked |
| `evaluating` | Eligible | Retain until revoked |
| `awarded` | **Not eligible** for new grants | **Retain** until revoked |
| `in_progress` | **Not eligible** for new grants | **Retain** until revoked |
| `completed` | **Not eligible** for new grants | **Retain** until revoked |
| `cancelled` | **Not eligible** for new grants | **Retain** until revoked (paid access not auto-cleared solely by cancel) |
| `archived` | **Not eligible** for new grants | **Retain** until revoked |

**Status:** `FOUNDER-APPROVED`  
**Implementation implication:** Grant eligibility gated by Opportunity status; retain purchased access across terminal/progress states unless §5.F/G revoke applies. Do not alter Opportunity transition code in this documentation stage.

---

### H. Enquiry mutation

**Decision:** Contact Access authorizes disclosure of the **current canonical Enquiry contact fields** (`customerPhone`, `customerEmail`, `customerName`) at disclosure time.

Not selected for v1: purchase-time snapshot table; versioned contact model.

**Status:** `FOUNDER-APPROVED`  
**Implementation implication:** No snapshot/version tables in v1. Disclosure reads live Enquiry fields. Dispute evidence relies on audit/event history + commercial records, not a frozen contact copy (unless a later Founder decision upgrades this).

---

### I. Audit requirements

**Decision:** Minimum information that must eventually exist (conceptually):

**On / with the entitlement record (authorization):**

- Business id
- Opportunity id
- entitlement id
- authorization status (`active` / `revoked`)
- grant reason
- commercial event reference (nullable for pure promotional grants if separately referenced)
- created timestamp
- granted timestamp
- revoked timestamp (when revoked)
- revoked reason (when revoked)
- actor/source where applicable

**Immutable audit/event history (separate conceptually):**

- grant attempts/successes
- revocations
- commercial/provider event correlations
- disclosure attempts may be logged at construction discretion

Entitlement authorization state ≠ commercial/payment history ≠ append-only audit log.

**Status:** `FOUNDER-APPROVED PRINCIPLE — IMPLEMENTATION OPEN`  
**Implementation implication:** Construction must preserve these fields/concepts; exact table layout unauthorized here.

---

### J. Disclosure operation

**Decision:** Conceptual authorization boundary for protected contact disclosure:

```text
Business authenticated
  + authority to act for that Business (existing membership rules as constructed)
  + active Contact Access Entitlement for the target Opportunity
  → protected contact disclosure (phone, email, name per §5.A)
```

Contact Access does **not** authorize:

- Project ownership
- Opportunity ownership / mutation / transition
- Quote ownership
- Business membership changes
- administrator privileges
- unrestricted Enquiry access (evaluation-safe vs protected projections remain distinct when redaction is activated)
- disclosure of `customerId` / `creatorAccountId`

**Status:** `FOUNDER-APPROVED`  
**Implementation implication:** No HTTP route in this task. Future disclosure endpoint/service must enforce this boundary.

---

### K. Enquiry redaction

**Decision (future requirement only):**

Once the commercial Contact Access boundary is **activated** in a separately authorized construction:

> Ordinary Business Enquiry reads must not expose protected contact fields (`customerPhone`, `customerEmail`, and `customerName` when treated as protected under §5.A) unless the Business possesses valid active Contact Access for the associated Opportunity.

**Current behaviour remains unchanged** until that construction is authorized.

**Status:** `FOUNDER-APPROVED PRINCIPLE — IMPLEMENTATION OPEN`  
**Implementation implication:** Redaction/compatibility migration is a **separate** construction authorization. This decision does not change routes now.

---

### L. Project-originated Opportunity

**Decision:** Unresolved.

> Model A currently resolves contact ownership through Opportunity → Enquiry. Project-originated Opportunities require a separate Founder-approved contact-owner relationship before Contact Access can be extended to them.

**Status:** `OPEN — FOUNDER DECISION REQUIRED`  
**Implementation implication:** Do not invent Project contact fields or Project↔Opportunity links here. Marketplace Enquiry-associated Opportunities may proceed under Model A without this.

---

### M. Payment-provider integration

**Decision:**

> Paystack/provider integration is not authorized by this decision record. Provider verification must feed a GHM commercial event; it must not become the authorization primitive.

**Status:** `OPEN — FOUNDER DECISION REQUIRED` (for provider construction authorization)  
Underlying architectural principle (provider ≠ auth primitive): already `FOUNDER-APPROVED` in §3 Decision 6 / §5.B.

---

### Implementation Gate

> Contact Access implementation remains unauthorized until the approved decisions above are converted into a canonical executable contract and separately authorized for schema/runtime construction.

This §5 update authorizes **documentation only**. It does **not** authorize migrations, HTTP, payment providers, Enquiry redaction, or entitlement runtime.

Items still open (§5.L, §5.M provider build auth, and implementation-open persistence details) must be resolved or explicitly deferred in that executable contract brief.

---

## 6. Architectural Invariants

1. Resource READ ≠ Contact Disclosure.
2. Enquiry remains canonical contact-data owner for this workflow.
3. Opportunity remains contact-free (no phone/email / duplicated contact fields).
4. Contact Access is distinct from resource authorization (identity, membership, visibility, registry `read`).
5. Contact Access is distinct from subscription feature entitlements.
6. Payment is not itself the authorization primitive; it may produce events that lead to entitlement grant.
7. Project↔Opportunity remains a separate architectural gap and is not a prerequisite for defining Contact Access.
8. Once a future Contact Access system is implemented, protected contact disclosure must not occur without an authoritative entitlement decision.
9. **Model A:** Contact Access is per `Opportunity.id`; one Opportunity unlock does not unlock others.
10. Contact ownership is not transferred by entitlement grant.
11. **§5:** v1 disclosure fields are phone/email/name; account ids are not disclosed via Contact Access.
12. **§5:** v1 authorization states are `active` / `revoked`; no calendar expiry.
13. **§5:** Refund/chargeback revoke future authorization; prior disclosure is not undisclosed.

---

## 7. Remaining Open Decisions

After §5, the following remain **OPEN — NOT YET AUTHORIZED** for construction/product:

### L. Project-originated Opportunity contact ownership

See §5.L. Separate Founder decision required before extending Contact Access beyond Enquiry-associated Opportunities.

### M. Payment-provider integration construction

See §5.M. Architectural separation is approved; provider implementation authorization is separate.

### Implementation-open persistence details

Exact table/column layout, idempotency key formats, audit event catalog granularity, and HTTP path shapes remain for the executable contract — not open commercial-policy choices, but **not authorized** here.

---

## 8. Current System Behaviour

This decision record **does not change** current implementation. Explicitly:

- Business received Enquiry still exposes phone/email (`GET /api/v1/enquiries/received/:enquiryId` and list).
- Opportunity has no phone/email.
- Project has no phone/email.
- No Contact Access Entitlement exists.
- Payment operations remain incomplete/stubs (`prepareCommercialPayment` / cancellation throw).
- Existing subscription entitlements remain unchanged.
- No Project↔Opportunity relationship is created.
- No Enquiry redaction is activated.

---

## 9. Future Construction Preconditions

Executable construction requires:

1. A canonical **executable Contact Access contract** derived from this FDR (§3–§5).
2. Separate Founder/construction authorization for schema/runtime.
3. Resolution or explicit deferral of §5.L and §5.M as applicable to scope.
4. Separate authorization for Enquiry redaction activation (§5.K).
5. Separate authorization for payment-provider integration if grants are payment-backed.

**Model A + §5 documentation alone does not authorize implementation.**

---

## 10. Explicit Non-Changes

Confirmed for this documentation update:

- no source code changed
- no schema changed
- no migration created
- no migration executed
- no HTTP changed
- no auth changed
- no frontend changed
- no payment implemented
- no entitlement implemented
- no Enquiry redaction implemented
- no Project↔Opportunity implementation
- no deployment
- no commit
- no push
- `docs/architecture/BRIEF_SOURCE_AUDIT.md` not modified
- `docs/architecture/CONTACT_ACCESS_OPEN_DECISION_ANALYSIS.md` not modified
- `docs/architecture/CONTACT_ACCESS_ENTITLEMENT_CONTRACT.md` not modified

---

## 11. Validation

Validation commands for this documentation slice:

- `git diff --check`
- inspect final document contents (confirm `## §5 — Founder Commercial Decisions` exists)
- `git status --short`

Expected: only this decision-record document changed; analysis and entitlement contract unchanged; `BRIEF_SOURCE_AUDIT.md` remains untouched and untracked if present.
