# Contact Access Open Decision Analysis

## Status

`PROPOSAL — FOUNDER DECISION REQUIRED`

Date: 2026-09-23  
Branch context: `construction/saved-business-resource`

This document analyzes remaining Founder-open Contact Access decisions after:

- `CONTACT_ACCESS_ENTITLEMENT_CONTRACT.md`
- `CONTACT_ACCESS_FOUNDER_DECISION_RECORD.md` (Model A selected; §4 lifecycle principles)

**It does not authorize implementation.**  
Recommendations below are labelled **PROPOSAL — NOT FOUNDER-APPROVED** unless they merely restate already locked Founder decisions.

---

## 1. Current Locked Architecture

Already Founder-approved (do not reopen here):

1. Resource READ ≠ Contact Disclosure.
2. Enquiry remains canonical owner of `customerPhone` / `customerEmail` for the marketplace Enquiry→Opportunity path.
3. Opportunity remains contact-free (no phone/email duplication).
4. Contact Access Entitlement is distinct from resource auth, membership, visibility, and subscription feature entitlements.
5. Payment/provider success is not the long-term authorization primitive.
6. **Model A:** commercial target is `Opportunity.id`; entitlement is Business + Opportunity specific.
7. Entitlement does not transfer contact ownership; does not grant Project/Opportunity/Quote ownership or unrestricted Enquiry access.
8. While active, access is reusable for that Opportunity; duplicate concurrent active entitlements for the same pair must be prevented.
9. Revoking future authorization does not technically undisclose prior disclosures.
10. No credit system authorized; Project↔Opportunity remains separate; no Enquiry redaction authorized yet; current Enquiry received-read behaviour unchanged.

Executable reality (unchanged):

- Received Enquiry HTTP returns full contact fields today.
- Opportunity HTTP returns full or public projection without phone/email.
- Commercial payment prepare/cancel are stubs; no Contact Access store exists.

---

## 2. Open Decision Analysis

### 2.1 Protected identity fields

| Field | Why a Business might want it | Privacy / security | Required for commercial use (contact the customer)? | Identity correlation | After Contact Access? |
| --- | --- | --- | --- | --- | --- |
| `customerPhone` | Call / WhatsApp the lead | High — direct contact | **Yes** for intended unlock product | Direct contact channel | **Disclose** (locked minimum candidate) |
| `customerEmail` | Email the lead | High — direct contact | **Yes** for intended unlock product | Direct contact channel | **Disclose** (locked minimum candidate) |
| `customerName` | Personalize outreach; verify human lead | Medium — PII, not a channel alone | Often useful, not strictly required to place a call/email if phone/email present | Correlates with public/social identity | **Open** — may stay evaluation-safe or become protected |
| `customerId` | Join to other GHM account records | High as durable account key | Not required to contact the person | Strong correlation / recovery key into Account | Prefer **undisclosed** even after Contact Access unless Founder explicitly needs it |
| `creatorAccountId` | Same as account key on Opportunity full projection today | High as durable account key | Not required to contact | Strong correlation; may match Enquiry `customerId` on Enquiry-spawned Opportunities | Prefer **undisclosed** on evaluate/disclosure surfaces unless Founder explicitly needs it |

#### Proposed minimum disclosure set

**PROPOSAL — NOT FOUNDER-APPROVED** (except phone/email already locked as protected minimum candidates in the FDR §4.B):

| Include after valid Contact Access | Exclude by default |
| --- | --- |
| `customerPhone` | `customerId` |
| `customerEmail` | `creatorAccountId` |
| Optionally `customerName` if Founder wants human-readable greeting | Other recovery/join keys |

Do **not** change current Enquiry behaviour in this analysis.

---

### 2.2 Exact granting events

| Option | Meaning | Fits locked chain? |
| --- | --- | --- |
| **A. Verified successful payment** | Provider success → verified commercial event → entitlement | Yes, if provider success is verified into GHM event first |
| **B. Verified commercial transaction** | GHM canonical transaction/event qualifies grant | Yes; provider-neutral |
| **C. Promotional/manual grant** | Founder/admin non-payment grant | Yes; still creates entitlement, not “special read bypass” |

#### Mutual exclusion vs combination

These should **not** be mutually exclusive product capabilities. They are different **grant reasons** under **one** Contact Access Entitlement model (Model A target).

| Approach | Fit |
| --- | --- |
| Separate entitlement types per grant channel | Unnecessary complexity for v1 |
| One entitlement model + `grantReason` / source-event reference | Aligns with payment≠auth and audit needs |

#### Smallest coherent v1 model

**PROPOSAL — NOT FOUNDER-APPROVED:**

1. Single Contact Access Entitlement (Business + Opportunity).
2. Allowed grant reasons in v1: **verified commercial event** (including verified payment outcomes) **and** **promotional/manual Founder grant**.
3. Provider webhook never authorizes disclosure directly.

Founder must still approve the allow-list.

---

### 2.3 Entitlement lifecycle states

Separate three layers:

| Layer | Purpose | Examples |
| --- | --- | --- |
| **Authorization state** | Does this Business currently have disclosure rights for this Opportunity? | `active`, `revoked` |
| **Commercial / payment history** | What financial/commercial events occurred? | payment succeeded, refunded, charged back |
| **Audit / event history** | Immutable log of grants, revokes, attempts | event rows / append-only records |

#### Candidate states on the entitlement itself

| State | Needed in v1? | Notes |
| --- | --- | --- |
| `active` | **Yes** | Authorizes disclosure |
| `revoked` | **Yes** | Future disclosure denied; history retained |
| `pending` | Optional | Only if grant is async (intent before verification). Can be omitted if entitlement is created only when verified |
| `expired` | Optional | Only if Founder chooses time-based expiry; else model as `revoked` + reason `expired` or omit |
| `refunded` | Prefer **not** on entitlement | Prefer payment/history reason + `revoked` |
| `cancelled` | Prefer **not** on entitlement | Prefer Reason codes on revoke / commercial history |

**PROPOSAL — NOT FOUNDER-APPROVED:** v1 authorization states = `{ active, revoked }` (+ optional `pending` only if async grant is required). Represent refund/expiry/cancel as **reasons** and **events**, not parallel authorization enums that duplicate history.

---

### 2.4 Re-grant behavior

| Situation | Analysis |
| --- | --- |
| Active entitlement | Reuse; do not create a second active row (locked) |
| Revoked entitlement | New grant may create a **new** active entitlement (or reactivate with new event) — Founder-open commercially |
| “Refunded entitlement” | Prefer: entitlement `revoked` + refund event in history; re-grant = new commercial action |
| Duplicate payment/event | Idempotency key on commercial event / provider event must not create duplicate **active** access |
| Historical audit | Keep prior entitlement versions/events; uniqueness applies to **active** (Business, Opportunity) only |

**PROPOSAL — NOT FOUNDER-APPROVED:** Enforce at most one `active` entitlement per (Business, Opportunity). Idempotent grant for the same verified event returns the existing active entitlement. After revoke, a **new** verified grant event may create a new active entitlement if Founder allows re-purchase; all prior rows/events remain auditable.

---

### 2.5 Expiry

| Model | Fit for “pay to obtain contact for this Opportunity” |
| --- | --- |
| 1. No expiry | Simple; access lasts until revoke; matches “bought the contact” intuition |
| 2. Fixed entitlement expiry | Needs Founder-chosen duration; adds renewal/commerce complexity |
| 3. Opportunity lifecycle-dependent expiry | Couples Contact Access to Opportunity transitions; interactions with purchased access are policy-heavy |

Existing requirements do **not** mandate a duration.

**PROPOSAL — NOT FOUNDER-APPROVED:** Prefer **no automatic expiry** for v1 authorization state, with revocation reserved for abuse/refund/admin/Founder policy. **Leave duration Founder-open** if product later wants time-boxed access; do not invent a number here.

---

### 2.6 Revocation triggers

| Trigger | Auto vs manual | Historical audit |
| --- | --- | --- |
| Manual / admin revocation | Manual | Retain |
| Fraud / abuse | Manual or policy-driven auto after investigation | Retain |
| Business / account disablement | Often automatic denial of **runtime** disclosure via auth/membership even before entitlement revoke; entitlement revoke optional | Retain |
| Refund | Candidate automatic revoke of **future** auth | Retain; prior disclosure not undone |
| Chargeback | Candidate automatic revoke of **future** auth | Retain |
| Opportunity cancellation | Founder-open (see §2.7) | Retain |
| Opportunity archive | Founder-open | Retain |
| Opportunity award / completion | Founder-open; often **retain** purchased access (work continues) | Retain |

**PROPOSAL — NOT FOUNDER-APPROVED:**

- Always support **manual/admin** revocation.
- Treat **refund/chargeback** as strong candidates for automatic **future-auth** revoke once payment ops exist.
- Do **not** auto-revoke solely because Opportunity reaches `awarded` / `in_progress` / `completed` unless Founder explicitly wants that (conflicts with “bought contact to pursue the job”).
- Disablement of Business/account should block disclosure at the auth layer regardless.

---

### 2.7 Opportunity lifecycle interaction

Opportunity statuses from `OpportunityLifecycleStatus` in `src/resources/opportunity/contracts.ts`:

| Opportunity state | Contact Access (analysis) | Commercial implication |
| --- | --- | --- |
| `draft` | Typically not marketplace-sold; grant eligibility open | Selling contact on draft is rarely coherent |
| `open` | Natural purchase window | Evaluate → unlock |
| `responding` | Purchase still commercially sensible | Pursuit ongoing |
| `evaluating` | Purchase still sensible | Pursuit ongoing |
| `awarded` | **Retain vs revoke open** | Buyer may still need contact to deliver |
| `in_progress` | **Retain vs revoke open** | Same |
| `completed` | **Retain vs revoke open** | Historical contact; less need for new unlocks |
| `cancelled` | **Retain vs revoke open** | Product may revoke (deal dead) or retain (already paid) |
| `archived` | **Retain vs revoke open** | Usually end-state; retain for audit/history reads |

No existing Founder-approved architecture forces revoke-on-transition.  
**Do not treat the table above as Founder decision.**

**PROPOSAL — NOT FOUNDER-APPROVED:** Keep previously purchased `active` access across `awarded` / `in_progress` / `completed` unless revoked for payment/abuse reasons. Treat `cancelled` / `archived` as Founder policy (retain paid access vs revoke). Restrict **new** grants on terminal/non-sellable states as a separate eligibility rule.

---

### 2.8 Enquiry mutation after access

| Model | Privacy | Correctness | Complexity | Audit | Customer changes | Refund/dispute |
| --- | --- | --- | --- | --- | --- | --- |
| **A. Current canonical contact** | Live PII | Always latest | Lowest | Shows current only unless events logged | Buyer sees updates | Disputes over “what I bought” harder |
| **B. Purchase-time snapshot** | Freezes purchased values | Matches purchase moment | Medium (store copy) | Strong “what was sold” | Updates don’t change sold bundle | Clearer dispute evidence |
| **C. Versioned contact** | Strong | Strong | Highest | Strongest | Explicit versions | Strongest; heaviest |

Enquiry already stores a contact **snapshot at Enquiry creation** relative to the customer account, but customer can theoretically update Enquiry fields only via limited status path today (Business updates status; contact fields are create-time). Still, future mutation paths may appear.

**PROPOSAL — NOT FOUNDER-APPROVED:** Smallest architecture consistent with current GHM principles for v1:

> **Model A — current canonical Enquiry contact fields** at disclosure time,

because:

- Enquiry is already the contact owner;
- no snapshot table is required;
- Opportunity stays contact-free;
- create-time Enquiry fields are already largely stable in current operations.

If Founder requires strong “what was purchased” evidence for disputes, escalate to **Model B** in a later construction — not assumed here.

---

### 2.9 Project-originated Opportunities

Model A’s contact path today depends on:

```text
Opportunity → (associated) Enquiry → contact snapshot
```

**What is known**

- Enquiry create atomically creates Opportunity and sets `enquiry.opportunity_id` (Enquiry→Opportunity).
- Opportunity has no phone/email.
- Project is account-owned; Project Quote has no contact fields.
- No executable Project↔Opportunity relationship; `create_project_with_opportunity` is documented/not implemented.

**What is missing**

- Canonical association from an arbitrary Opportunity to an Enquiry when Opportunity did not come from Enquiry create.
- Canonical Project-side contact owner if no Enquiry exists.

**What must be decided separately**

- Project↔Opportunity relationship (or alternate contact owner for Project-origin Opportunities).
- Whether Contact Access for Project-origin Opportunities is in scope at all for v1 marketplace.

**This analysis does not invent Project contact fields or relationships.**

Model A marketplace Contact Access can proceed for Enquiry-associated Opportunities without solving Project↔Opportunity first (already locked in FDR).

---

## 3. Option Comparison Summary

| Area | Options | Proposal label |
| --- | --- | --- |
| Protected fields | Phone/email vs name/ids | Min disclose phone+email; withhold ids (**proposal** except phone/email locked as protected) |
| Grant events | Payment / GHM transaction / promo | One entitlement model + multiple grant reasons (**proposal**) |
| Lifecycle states | pending/active/revoked/expired/refunded/cancelled | Prefer `active`/`revoked` (+ optional pending) (**proposal**) |
| Re-grant | Block forever vs allow after revoke | One active; re-grant after revoke if Founder allows (**proposal**) |
| Expiry | None / fixed / lifecycle | Prefer no auto-expiry; duration Founder-open (**proposal**) |
| Revocation | Auto vs manual triggers | Manual always; refund/chargeback candidates; lifecycle auto-revoke cautious (**proposal**) |
| Opportunity states | Retain vs revoke purchased access | Retain through award/progress/complete; cancel/archive Founder-open (**proposal**) |
| Enquiry mutation | Live / snapshot / versioned | Live canonical Enquiry fields for v1 (**proposal**) |

---

## 4. Decisions Requiring Founder Approval

1. Whether `customerName` is disclosed after Contact Access.  
2. Whether `customerId` / `creatorAccountId` are ever disclosed (recommended default: no).  
3. Exact grant-event allow-list (payment / commercial transaction / promo/manual).  
4. Whether `pending` is a first-class entitlement state.  
5. Whether `expired` is first-class or modelled as revoke+reason.  
6. Re-purchase / re-grant rules after revoke or refund.  
7. Expiry: none vs fixed duration vs Opportunity-tied (and duration if fixed).  
8. Automatic revoke on refund and/or chargeback.  
9. Automatic revoke (or not) on Opportunity `cancelled` / `archived` / `awarded` / `completed`.  
10. Eligibility to **purchase** Contact Access by Opportunity state (e.g. block draft/archived).  
11. Enquiry mutation model: live vs purchase-time snapshot vs versioned.  
12. Whether Project-origin Opportunities are in Contact Access v1 scope (separate relationship decision).  
13. Audit/event catalog and retention requirements.  
14. HTTP disclosure / Enquiry redaction timing (separate construction authorization).  
15. Payment-provider integration authorization (separate from this analysis).

---

## 5. Implementation Authorization

> **No implementation is authorized by this analysis.**

Specifically not authorized:

- schema / migrations  
- entitlement runtime  
- payment / Paystack  
- Enquiry redaction or response changes  
- Opportunity behaviour changes  
- Project↔Opportunity construction  
- HTTP disclosure surfaces  
- commits / deploys  

Construction requires Founder decisions on §4 plus a separate construction brief.

---

## 6. Sources

- `docs/architecture/CONTACT_ACCESS_FOUNDER_DECISION_RECORD.md`
- `docs/architecture/CONTACT_ACCESS_ENTITLEMENT_CONTRACT.md`
- `docs/architecture/COMMERCIAL_CAPABILITY_ARCHITECTURE_CONTRACT.md`
- `docs/architecture/ENQUIRY_OPERATION_CONTRACT.md`
- `docs/architecture/OPPORTUNITY_CORE_CONTRACT.md`
- `docs/architecture/PROJECT_RESOURCE_CONTRACT.md`
- `src/resources/enquiry/contracts.ts`, `repository.ts`, `service.ts`, `src/http/enquiry-router.ts`
- `src/resources/opportunity/contracts.ts`, `repository.ts`, `src/http/opportunity-router.ts`
- `src/resources/commercial/contracts.ts`, `repository.ts`
