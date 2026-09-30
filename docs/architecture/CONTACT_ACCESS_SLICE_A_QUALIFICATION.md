# Contact Access Slice A Qualification

## Status

`QUALIFIED WITH FINDINGS — FOUNDER REVIEW REQUIRED`

Date: 2026-09-23  
Audit type: **Independent re-qualification** after security corrections for F1 / F2 / F3  
Method: Read-only inspection of the **current** working-tree implementation (not the construction report).

**Migration NOT executed.**  
**No deployment.**  
**No commit. No push.**  
**This audit did not modify source, tests, or migrations.**

---

## 1. Executive verdict

Previous findings **F1** and **F3** are **corrected and verified** in the current implementation.

Previous finding **F2** is **corrected on the governed application path** (no caller-supplied `p_account_id`; actor from transaction-local GUC set from `AuthContext.userId`). A **residual** security finding remains: any principal that can run SQL as `ghm_runtime` can still `set_config('ghm.actor_account_id', …)` and then `EXECUTE` the DEFINER functions, impersonating another account that holds owner/administrator membership on the target Business. This is the same residual class as other GHM DEFINER functions that accept caller-controlled actor identity under `ghm_runtime` EXECUTE (e.g. Campaign `p_account_id`).

Slice A remains suitable for Founder review of the **domain** seam, with Founder acknowledgment of residual **F2-R**. It is **not** a clean unqualified pass solely because tests pass.

Next construction boundary (if Founder accepts): **Slice B — domain disclosure**, separately authorized.

---

## 2. Previous findings → correction verification

| ID | Previous issue | Current evidence | Status |
| --- | --- | --- | --- |
| **F1** | Association service under-authorized | Signature `(context, businessId, opportunityId)`; service requires auth + `business` role; repository requires active membership on requested Business; cross-Business Enquiry throws; metadata-only SELECT | **Closed** |
| **F2** | DEFINER trusted caller-supplied `p_account_id` | Functions are `(business_id, opportunity_id, source/reason)` only; repository `set_config('ghm.actor_account_id', String(context.userId), true)` then EXECUTE; no `p_account_id` in migration | **Closed on app path**; **residual F2-R** |
| **F3** | Concurrent grant could surface raw unique_violation | Advisory xact lock + `EXCEPTION WHEN unique_violation` re-selects active and returns it; partial unique index retained | **Closed** |

---

## 3. Domain audit

| Requirement | Verdict |
| --- | --- |
| Only `manual_promotional` grants | **Pass** (service + DB CHECK + hard-coded INSERT) |
| No payment/provider grant path | **Pass** |
| Grant / check / revoke | **Pass** (`active` / `revoked` / `absent`) |
| Business + Opportunity identity | **Pass** |
| Re-grant after revoke = new active + history | **Pass** |
| No contact fields in CA domain | **Pass** |

---

## 4. F1 — Association authorization (verified)

Implementation:

- Service: `requireAuthenticatedContext` + `assertRole(..., 'business')` + positive `businessId` / `opportunityId`
- Repository: active membership for `(businessId, context.userId)`; then `SELECT id, business_id, opportunity_id`; ambiguity fails; `association.businessId !== businessId` fails closed

| Check | Result |
| --- | --- |
| Auth required | **Pass** |
| Business role required | **Pass** (customer/admin denied) |
| Active membership for requested Business | **Pass** |
| Cross-Business Enquiry | **Fail closed** |
| Inactive membership | **Denied** |
| Metadata only | **Pass** |
| Contact fields selected | **No** |
| Unrestricted metadata oracle | **No** — scoped to membership + Business match |

**Administrator (GHM role):** denied at service (`assertRole` business-only). Intended construction is Business role + owner/administrator **membership**, not system-admin bypass. Not broader than intended.

---

## 5. F2 — SECURITY DEFINER actor identity (verified)

### Application path (governed)

| Check | Result |
| --- | --- |
| Actor source = `AuthContext.userId` | **Pass** |
| `set_config(..., true)` immediately before function | **Pass** (is_local = transaction-local) |
| Function accepts actor argument | **No** |
| Membership binds actor to target Business | **Pass** |
| Fixed `search_path = pg_catalog, ghm` | **Pass** |
| PUBLIC EXECUTE revoked; EXECUTE to `ghm_runtime` | **Pass** |
| Runtime table DML revoked (SELECT only) | **Pass** |

### Residual finding **F2-R**

`ghm_runtime` may:

```sql
SELECT set_config('ghm.actor_account_id', '<other_account>', true);
SELECT * FROM ghm.grant_contact_access_manual(...);
```

and act as that account if it holds owner/administrator on the Business. The GUC is not cryptographically bound to AuthContext outside the repository convention.

**Severity:** Low–Medium residual (GHM-class DEFINER + runtime EXECUTE).  
**Does not** reopen application-layer argument impersonation.  
**Founder must acknowledge** before treating actor identity as fully closed.

---

## 6. F3 — Concurrent grant / idempotency (verified)

| Scenario | Behavior | Verdict |
| --- | --- | --- |
| First grant | INSERT active + event | **Pass** |
| Duplicate sequential | Reuse existing active (no second active) | **Pass** |
| Re-grant after revoke | New active row; revoked retained | **Pass** |
| Concurrent | Advisory lock + unique_violation → re-select active | **Pass** |
| Final integrity | Partial unique index `contact_access_one_active_uq` | **Pass** |

Advisory lock keys: `hashtext(business…)` + `hashtext(opportunity…)`. Hash collisions could only cause extra serialization contention, not dual-active rows (unique index remains final).

### Test-harness limitation

No real two-session PostgreSQL concurrency test. Qualification relies on SQL structure + unit/migration-invariant tests. Limitation is **explicitly recorded** here.

---

## 7. Lifecycle eligibility (verified against executable contract §10)

Implementation allows **new grants** only when Opportunity `lifecycle_status IN ('open', 'responding', 'evaluating')`.

Matches executable contract:

| State | Contract | Implementation |
| --- | --- | --- |
| draft | Not eligible | Rejected |
| open / responding / evaluating | Eligible | Allowed |
| awarded / in_progress / completed / cancelled / archived | Not eligible | Rejected |

No invented rule. Opportunity lifecycle machine unchanged.

---

## 8. Enquiry-backed requirement (verified)

Grant function:

- Opportunity must exist
- Exactly one Enquiry with `opportunity_id`
- `enquiry.business_id` must equal grant `business_id`
- No Project-origin fallback
- No new Opportunity↔Enquiry schema relationship (uses existing `enquiry.opportunity_id`)

---

## 9. Contact safety (verified)

Slice A persistence and domain responses do **not** include `customerPhone`, `customerEmail`, `customerName`, `customerId`, or `creatorAccountId`. Association SELECT is metadata-only. Opportunity remains contact-free. No HTTP disclosure surface registered.

---

## 10. Authorization matrix (verified)

| Caller | Grant/Revoke | Check | Association |
| --- | --- | --- | --- |
| Unauthenticated | Denied (`withAuthorizedTransaction` / service) | Denied | Denied |
| Customer | Denied (role) | Denied | Denied |
| Admin (GHM role) | Denied (role; not membership bypass) | Denied | Denied |
| Business inactive membership | Denied (DEFINER / read assert) | Denied | Denied |
| Business non-management member | Denied grant/revoke (owner\|admin only) | Allowed if active member | Allowed if active member |
| Business owner | Allowed | Allowed | Allowed |
| Business administrator (membership) | Allowed | Allowed | Allowed |
| Business A → Business B target | Denied | Denied | Denied |

---

## 11. Persistence / privileges (verified structurally; migration not run)

- FKs, status CHECKs, revocation consistency CHECK, timestamps: present
- Partial unique one-active index: present
- Event append on grant/revoke; no runtime DELETE: present
- Owners: `ghm_schema_owner`
- Runtime: SELECT only on tables; EXECUTE on grant/revoke; PUBLIC EXECUTE revoked

---

## 12. Audit / history (verified)

Reconstructable: Business, Opportunity, grant reason/source/actor/time, revoke reason/actor/time, event rows. Revocation updates the entitlement row to `revoked` (does not delete). Re-grant creates a new active row.

---

## 13. Tests (inspected + suite run)

Coverage includes: valid/duplicate grant, revoke, re-grant, management denial, Business mismatch, lifecycle ineligible, missing/non-Enquiry-backed, association auth (role/membership/cross-Business), contact exclusion, actor-context / no `p_account_id`, migration uniqueness + unique_violation + advisory lock invariants, concurrent convergence (simulated).

**Meaningful residual gap:** no live multi-session DB race test (documented above).

### Suite results (this audit)

- Full suite: **315 pass / 0 fail**
- Build (`tsc`): **OK**
- `git diff --check`: clean (CRLF warning only on `enquiry/service.ts`)

---

## 14. Scope audit

No unauthorized HTTP, disclosure, redaction, Paystack, payment, commercial-event processing, subscriptions/credits, frontend, Project↔Opportunity, Project-origin CA, Opportunity lifecycle implementation changes, auth architecture redesign, or deployment configuration in Slice A construction beyond Contact Access domain + Enquiry association adapter + test wiring.

---

## 15. Remaining findings

| ID | Finding | Blocking for Slice A domain review? |
| --- | --- | --- |
| **F2-R** | Direct `ghm_runtime` SQL can set `ghm.actor_account_id` then EXECUTE DEFINER grant/revoke | **No** for app-path review; Founder acknowledgment required |
| **T-LIM** | No real two-session concurrent DB test | **No** — SQL structure adequate; limitation recorded |

No open F1 or F3 defects.

---

## 16. Migration / Git / Deploy

- **Migration NOT executed.**
- **No commit. No push.**
- **No deployment.**

---

## 17. Next boundary

If Founder accepts this qualification (including residual **F2-R**):

- Slice A is ready for Founder review as the Contact Access **domain** seam.
- Next construction boundary remains **Slice B — domain disclosure**, subject to **separate authorization**.
- Do not authorize HTTP, payment/provider, or Enquiry redaction without their own gates.

---

*End of independent Slice A re-qualification.*
