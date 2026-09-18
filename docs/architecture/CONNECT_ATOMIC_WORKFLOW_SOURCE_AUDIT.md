# Connect Atomic Workflow Source Audit

**Status:** SOURCE EVIDENCE ONLY — NO CONSTRUCTION AUTHORIZATION  
**Connect commit:** `abcffa73f893602c25310a58946bebb91fd7eeb5`  
**Date:** 2026-09-18

## 1. Purpose

Map multi-write Connect workflows and compare them to current GHM equivalents. Closed GHM capabilities are not reopened.

## 2. Workflow matrix

| Workflow | Initiator | Entities touched | Atomicity | Concurrency / duplicates | GHM equivalent | Gap |
|---|---|---|---|---|---|---|
| Marketplace Enquiry + Opportunity | `marketplaceService` → `create_marketplace_enquiry_with_opportunity` | businesses read; opportunities; participants; leads | PL/pgSQL SECURITY DEFINER txn | Business eligibility checks | Enquiry create can atomically bind Opportunity | Connect also has **non-atomic** `leadService.create` direct insert |
| Project + Opportunity | `projectsService.createProject` → `create_project_with_opportunity` | opportunity_types; opportunities; projects | PL/pgSQL txn | — | Project create inserts project only | **Missing** Project↔Opportunity atomic create |
| Decide Project Quote | `decide_project_quote` | project_quotes FOR UPDATE; projects FOR UPDATE; sibling rejects | PL/pgSQL txn | Row locks | QUALIFIED Project Quote accept/reject | Adapter/HTTP may lag |
| Replace Business Hours | `replace_business_hours` | delete+insert hours | PL/pgSQL txn | Manage permission | QUALIFIED `ghm.replace_business_hours` | Covered |
| Activate commercial trial | `activate_business_commercial_trial` | consents; trials; subscriptions; events | PL/pgSQL txn | One trial per business | QUALIFIED commercial trial | Covered |
| Prepare subscription payment | `prepare_business_subscription_payment` | subscriptions; consents; payment_attempts; events | PL/pgSQL txn | Launch gate | GHM preparePayment **throws** | **Payment ops gap** |
| Apply payment result | Edge webhook → `apply_commercial_payment_result` | provider_events; attempts; subscriptions; transactions; trials; founding; events | PL/pgSQL + idempotent provider event | Idempotent event key | Not implemented | **Payment ops + runtime gap** |
| Submit review | RPC `submit_business_review` (canonical) | reviews pending | PL/pgSQL | One review/business rules in contract | QUALIFIED Review create | Connect UI also uses **direct** `reviewService.create` insert |
| Moderate review + aggregates | `moderate_business_review` + trigger | reviews; businesses rating/count | RPC + trigger | — | QUALIFIED Review moderate + aggregates | Covered |
| Replace capability assertions | `replace_business_capability_assertions` | business_capabilities bulk | PL/pgSQL | — | GHM create/read only | **Replace semantics gap** |
| Capability evidence submit/review | evidence RPCs | evidence + assertion status | PL/pgSQL | — | No GHM evidence slice | **Missing domain** |
| Directory listing submit/review | founder review RPCs | businesses fields; review events; notifications | PL/pgSQL | Founder reviewer gate | Partial verification fields only | **Workflow gap** |
| Support create/reply/status | support RPCs | support_requests + messages | PL/pgSQL | — | QUALIFIED Support Request | Covered |
| Saved Business toggle | `savedService.toggle` | select → delete or insert | **App composition**, not one RPC | Unique (user, business) | QUALIFIED create/delete | Intentional; no GHM toggle |
| Create notification | `create_notification` RPC | notifications | PL/pgSQL | — | QUALIFIED Notification create | Covered |

## 3. Authorization notes

- Marketplace/project Opportunity RPCs enforce eligibility and creator binding inside DB functions.
- Hours replace and commercial ops require manage/launch authorization.
- Directory review requires founder-reviewer predicates.
- GHM uses AuthContext + service checks rather than `auth.uid()` RLS copies.

## 4. Conclusions

1. Several Connect “canonical” workflows are SECURITY DEFINER RPCs; some UI paths bypass them (direct lead insert, direct review insert).
2. GHM already covers hours replace, trial activation, project-quote decide, review moderate, support, notification create, saved create/delete, and enquiry atomic Opportunity binding (with documented limitations).
3. Material gaps: Project↔Opportunity atomic create, commercial payment prepare/apply, capability replace/evidence, directory founder review workflow.
4. No workflow in this document authorizes new GHM construction.
