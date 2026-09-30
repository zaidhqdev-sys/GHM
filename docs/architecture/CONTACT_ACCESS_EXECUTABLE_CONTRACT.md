# Contact Access Executable Contract

## Status

`CANONICAL CONTRACT — IMPLEMENTATION NOT YET AUTHORIZED`

Date: 2026-09-23  
Branch context: `construction/saved-business-resource`  
Commercial model: **Model A — Per Opportunity Contact Access**

### Authority

| Source | Role |
| --- | --- |
| `CONTACT_ACCESS_FOUNDER_DECISION_RECORD.md` | **Authoritative** for Founder-approved commercial decisions |
| `CONTACT_ACCESS_OPEN_DECISION_ANALYSIS.md` | Historical decision input only |
| `CONTACT_ACCESS_ENTITLEMENT_CONTRACT.md` | Earlier proposed architecture; **superseded where it conflicts** with the FDR (see §0) |

This document translates Founder-approved decisions into **executable rules**.

It does **not** authorize schema, migrations, domain/runtime code, HTTP routes, Enquiry redaction cutover, payment-provider construction, or Project↔Opportunity work.

---

## 0. Document contradictions / supersession

| Topic | Older entitlement contract | FDR (authoritative) | This executable contract |
| --- | --- | --- | --- |
| Document status | `PROPOSED — FOUNDER APPROVAL REQUIRED` | Model A + §5 finalized | Follows FDR |
| Commercial scope | Options A–E undecided | **Model A selected** | Model A only |
| `customerName` | `DECISION_REQUIRED` | Disclose after Contact Access | Disclose after CA |
| `customerId` / `creatorAccountId` | `DECISION_REQUIRED` | Must not disclose via CA | Must not disclose via CA |
| Expiry | Open | No calendar expiry | No calendar expiry |
| Auth states | Conceptual | `active` / `revoked` | `active` / `revoked` |
| Enquiry mutation | Open | Live canonical Enquiry fields | Live canonical |

No silent rewrite of `CONTACT_ACCESS_ENTITLEMENT_CONTRACT.md` is performed by this task; implementers must treat the **FDR + this executable contract** as governing for Model A v1.

---

## 1. Purpose

Define precise implementation requirements for Contact Access such that:

1. A Business may obtain target-specific Contact Access for an `Opportunity.id`.
2. Protected contact disclosure is authorized only by an **active** Contact Access Entitlement.
3. Contact data remains owned by the associated Enquiry.
4. Resource READ never equals Contact Disclosure.
5. External payment providers never become the authorization primitive.

---

## 2. Scope

### In scope (Enquiry-backed Opportunities only)

```text
Business
  → verified GHM commercial event (or promotional/manual grant reason)
  → Contact Access Entitlement (Business + Opportunity)
  → Opportunity
  → associated Enquiry
  → live canonical contact fields
```

An Opportunity is **eligible for Contact Access** only when an associated Enquiry can be resolved for contact ownership (marketplace Enquiry→Opportunity path).

### Out of scope

- Project-originated Opportunities without a Founder-approved contact-owner relationship
- Provider/Paystack construction
- Schema/runtime/HTTP construction (this document only specifies rules)
- Activating Enquiry redaction cutover (principle recorded; construction gated)

---

## 3. Commercial target and identity

| Rule | Requirement |
| --- | --- |
| Target | `Opportunity.id` |
| Subject | Business id for which Contact Access is granted |
| Canonical identity | `Business + Opportunity + Contact Access` |
| Specificity | Access to one Opportunity does **not** grant access to any other Opportunity |

---

## 4. Contact ownership and resolution

| Rule | Requirement |
| --- | --- |
| Owner | Canonical Enquiry contact fields |
| Resolution | `Opportunity → associated Enquiry → live canonical contact fields` |
| Transfer | Entitlement does **not** transfer ownership of contact data |
| Opportunity store | Must **not** copy `customerPhone` / `customerEmail` / `customerName` onto Opportunity |

Association for marketplace path: Enquiry row with `opportunity_id = Opportunity.id` (existing `enquiry.opportunity_id` FK direction).

If no eligible associated Enquiry exists → Contact Access grant/disclose is **unsupported/unavailable** for that Opportunity under this contract.

---

## 5. Protected disclosure fields

### Disclosable after valid Contact Access

- `customerPhone`
- `customerEmail`
- `customerName`

### Must never be disclosed by Contact Access

- `customerId`
- `creatorAccountId`

These remain protected/internal identifiers.

### Mutation

Disclosure reads **current** Enquiry values for the disclosable fields (no purchase-time snapshot required in v1).

---

## 6. Entitlement authorization state

### V1 authorization states

- `active` — future disclosure permitted (if full predicate passes)
- `revoked` — future disclosure denied

### Not v1 authorization states

- calendar TTL / expiry
- first-class `expired` / `refunded` / `cancelled` enums (express via `revoked` + reason and/or commercial history)

### Separate layers (must not be collapsed)

1. **Current authorization state** — is Contact Access `active` now?
2. **Commercial / payment history** — verified events, refunds, chargebacks
3. **Immutable audit / event history** — what happened

---

## 7. Grant rules

### Authorization chain

```text
External provider (optional)
      ↓
provider verification
      ↓
GHM commercial event (verified)
      ↓
Contact Access grant
      ↓
active entitlement
      ↓
contact disclosure (separate operation)
```

GHM authorization **MUST** consume verified GHM commercial event/state.  
A raw provider success signal is **never** itself authorization.

### Approved grant reasons

1. **Verified commercial grant** — verified GHM commercial event (including verified payment outcomes once payment ops exist).
2. **Promotional / manual Founder (or authorized admin) grant** — explicit auditable grant reason; still creates entitlement; never a read-bypass.

### Grant operation (conceptual)

**Input**

- `businessId`
- `opportunityId`
- verified commercial event reference (required for commercial grants; promotional grants carry explicit reason + actor/source)
- `grantReason`
- actor/source where applicable

**Output**

- Contact Access entitlement identity and authorization state (`active`)

**Rules**

1. Validate target Opportunity exists.
2. Validate Opportunity is grant-eligible by lifecycle (§10).
3. Validate Business context (caller may act for Business under existing membership rules as constructed).
4. Resolve associated Enquiry; if none → unsupported/unavailable.
5. Enforce **at most one active** entitlement for `(businessId, opportunityId)`.
6. Idempotent for the same commercial event: return existing active authorization; do not duplicate active access.
7. Preserve audit history on every grant attempt/success.
8. After prior `revoked`, a new verified grant may create a new active authorization while retaining historical records.

---

## 8. Check operation (conceptual)

**Input:** `businessId`, `opportunityId`  

**Output:** `active` | `revoked` | `none` (no entitlement history / no applicable record)

Does not disclose contact fields.

---

## 9. Revoke operation (conceptual)

**Input:** `businessId`, `opportunityId`, reason, actor/source  

**Rules**

1. Set authorization to `revoked` (future disclosure denied).
2. Preserve immutable history.
3. Do not claim prior disclosures are retracted from recipient systems.

### Required revocation triggers (policy)

| Trigger | Effect on future authorization |
| --- | --- |
| Manual / admin | Revoke |
| Fraud / abuse | Revoke |
| Verified refund commercial event | Revoke |
| Verified chargeback commercial event | Revoke |
| Business / account disablement | Block disclosure at auth/membership runtime; entitlement may also be revoked |

Opportunity lifecycle transitions alone do **not** auto-revoke (§10).

---

## 10. Opportunity lifecycle interaction

Opportunity lifecycle behaviour itself is **unchanged**.

| Opportunity state | New grants | Existing `active` entitlement |
| --- | --- | --- |
| `draft` | Not eligible | N/A |
| `open` | Eligible | Retain until revoked |
| `responding` | Eligible | Retain until revoked |
| `evaluating` | Eligible | Retain until revoked |
| `awarded` | Not eligible | Retain until revoked |
| `in_progress` | Not eligible | Retain until revoked |
| `completed` | Not eligible | Retain until revoked |
| `cancelled` | Not eligible | Retain until revoked |
| `archived` | Not eligible | Retain until revoked |

---

## 11. Authorization predicate (disclosure)

Protected contact disclosure is permitted **only** when **all** hold:

```text
authenticated request
AND valid GHM access token / AuthContext
AND active Business membership (authority to act for businessId)
AND Business is the entitlement subject for the target Opportunity
AND Contact Access entitlement is active for (businessId, opportunityId)
AND associated Enquiry is resolvable for contact ownership
AND Business/account is not disabled for disclosure purposes
```

### Contact Access MUST NOT grant

- Business membership
- Opportunity ownership / mutation / transition
- Project ownership
- Quote ownership
- administrator rights
- unrestricted Enquiry read
- access to `customerId`
- access to `creatorAccountId`

Contact disclosure is a **separate capability** from ordinary Enquiry resource `read`.

---

## 12. Disclose operation (conceptual)

**Input**

- authenticated Business context
- `opportunityId`

**Output (only if §11 passes)**

```text
{
  customerName,
  customerPhone,
  customerEmail
}
```

**Must not return** `customerId`, `creatorAccountId`, or other internal identity/recovery identifiers via this operation.

If entitlement missing/revoked → contact disclosure denied.  
If Opportunity has no eligible Enquiry → unsupported/unavailable.

---

## 13. Persistence requirements (conceptual)

Persistence must support, without prescribing SQL names:

| Requirement | Notes |
| --- | --- |
| Business id | Subject |
| Opportunity id | Target |
| Authorization state | `active` \| `revoked` |
| Grant reason | Commercial vs promotional/manual |
| Commercial event reference | Idempotency / audit |
| Created / granted timestamps | |
| Revocation timestamp + reason | When revoked |
| Actor/source | Where applicable |
| Immutable audit/event history | Separate from current auth state |
| One active per Business + Opportunity | Uniqueness / equivalent enforcement |
| Idempotent commercial-event handling | Same event must not create duplicate active access |

No migrations are authorized by this document.

---

## 14. Commercial event boundary

```text
External provider
      ↓
provider verification
      ↓
GHM commercial event
      ↓
Contact Access grant
      ↓
active entitlement
      ↓
contact disclosure
```

Provider-specific implementation remains a **separate authorization gate** (§18).

---

## 15. HTTP contract (conceptual — not implemented)

Future HTTP surface must distinguish at least:

1. **Contact Access status** — check active/revoked/none (no contact payload).
2. **Contact disclosure** — returns only `{ customerName, customerPhone, customerEmail }` under §11.
3. **Grant / commercial action** — initiates or confirms grant from verified commercial flow (provider wiring separately gated).

Exact paths/methods/status codes are **not** fixed here unless already governed by existing GHM HTTP conventions at construction time.

### Enquiry bypass prohibition (future activation)

Once the commercial redaction boundary is activated:

- Ordinary `GET /api/v1/enquiries/received/...` (single and list) **must not** remain an accidental bypass of Contact Access.
- Contact Access **must not** be bolted into the existing coarse `enquiry:read` registry capability as equivalent to contact disclosure.

Current Enquiry responses remain unchanged until redaction cutover is separately authorized.

---

## 16. Redaction boundary

**Approved architectural principle:**

Once the commercial boundary is activated, ordinary Business Enquiry reads must return a **redacted** representation unless valid active Contact Access exists for the associated Opportunity.

Protected fields under redaction include at least those in §5 disclosable set when treated as protected (`customerPhone`, `customerEmail`, `customerName`).

Exact migration/cutover plan is an implementation decision.  
**This document does not change current Enquiry HTTP behaviour.**

---

## 17. Error semantics (conceptual)

| Condition | Conceptual outcome |
| --- | --- |
| Unauthenticated | Authentication failure |
| Authenticated but no Business authorization / membership | Authorization failure |
| Business authorized but no active Contact Access | Contact disclosure denied |
| Target Opportunity not associated with eligible Enquiry | Unsupported / unavailable |
| Entitlement revoked | Contact disclosure denied |
| Duplicate grant while active | Idempotent existing active authorization |
| Duplicate commercial event | No duplicate entitlement |

HTTP status numbers are not invented here; map to existing GHM HTTP error conventions at construction time.

---

## 18. Audit requirements

### Current authorization state

Answer: Does this Business currently have `active` Contact Access for this Opportunity?

### Immutable commercial/audit history

Must permit reconstruction of:

- who/what granted access
- which Business
- which Opportunity
- grant reason
- commercial event reference
- granted timestamp
- who/what revoked
- revoked timestamp
- revocation reason
- promotional/manual versus commercial origin

Do not implement audit storage in this task.

---

## 19. Domain operations summary

| Operation | Purpose |
| --- | --- |
| `grant` | Create/activate Contact Access from verified event or promo grant |
| `check` | Return active/revoked/none |
| `revoke` | End future authorization; keep history |
| `disclose` | Return phone/email/name only when §11 passes |

---

## 20. Implementation gates

| Gate | Status |
| --- | --- |
| Project-origin Contact Ownership | `OPEN — FOUNDER DECISION REQUIRED` |
| Provider / Paystack construction | `OPEN — FOUNDER DECISION REQUIRED` |
| Schema construction | **Not authorized** by this document |
| Runtime / domain construction | **Not authorized** by this document |
| HTTP construction | **Not authorized** by this document |
| Enquiry redaction / cutover | **Not authorized** by this document |

---

## 21. Explicit non-authorization

This document:

- does **not** authorize code changes under `src/**`
- does **not** authorize `database/**` or migrations
- does **not** authorize HTTP route changes
- does **not** authorize auth implementation changes
- does **not** authorize frontend changes
- does **not** authorize payment-provider implementation
- does **not** authorize Enquiry behavioural change
- does **not** authorize Opportunity lifecycle change
- does **not** authorize Project↔Opportunity construction
- does **not** authorize commit, push, or deploy

---

## 22. Project-origin boundary (explicit)

> Model A currently resolves contact ownership through Opportunity → Enquiry. Project-originated Opportunities require a separate Founder-approved contact-owner relationship before Contact Access can support them.

Therefore this contract is currently:

**Enquiry-backed Opportunities only.**
