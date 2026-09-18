# Connect Backend Operation Inventory

**Status:** EVIDENCE INVENTORY — BRIDGE TO FUTURE ADAPTER WORK (NOT AUTHORIZED)  
**Connect commit:** `abcffa73f893602c25310a58946bebb91fd7eeb5`  
**GHM comparison tip:** docs/resources as of evidence sprint  
**Date:** 2026-09-18

## 1. Purpose

List Connect backend operations evidenced in application source and classify GHM coverage. This does not authorize adapter construction.

Status values: `GHM_PROVIDES` | `GHM_PARTIAL` | `GHM_ABSENT` | `EXTERNAL` | `CONNECT_LOCAL` | `ORPHAN_REF`.

## 2. Inventory

| Source | Operation | Entity | R/W | Provider | Auth | Txn | GHM equivalent | Status |
|---|---|---|---|---|---|---|---|---|
| `authService.signUp/signIn/signOut/getSession` | auth | session/user | W/R | Supabase Auth | public/auth | provider | JWT AuthContext (different) | EXTERNAL / GHM_PARTIAL |
| `profileService.get/update` | read/update | profiles | R/W | Postgres | owner | row | account_identity profile | GHM_PARTIAL |
| `profileService.uploadAvatar` | upload | media+profile | W | Storage `media` | owner | app | none | EXTERNAL + GHM_ABSENT |
| `businessService.create/update/get*` | CRUD subset | businesses | R/W | Postgres | owner/member | row | business identity | GHM_PARTIAL |
| `businessService.getRegistrationIdentity` | private read | registration | R | RPC | manage | fn | none dedicated | GHM_PARTIAL |
| `businessService.uploadLogo/clearLogo` | logo set | media+business | W | Storage+RPC | manage | fn | none | EXTERNAL + GHM_ABSENT |
| `businessService.incrementViews` | analytics | views/engagement | W | RPC | public-ish | fn | none | GHM_ABSENT |
| `businessMembershipService.*` | membership authz | memberships | R | table+RPC | member | fn | business_membership | GHM_PARTIAL |
| `directoryService.search/get*/featured/nearby` | directory | businesses public | R | Postgres | public rules | query | first-slice public only | GHM_PARTIAL |
| `directoryListingReviewService.*` | 4A review | businesses+events | R/W | RPCs | founder/owner | fn | verification fields only | GHM_PARTIAL |
| `leadService.create` | create lead | leads | W | insert | customer | row | enquiry | GHM_PARTIAL (non-atomic path) |
| `marketplaceService` create RPC | atomic enquiry+opp | leads+opportunities | W | RPC | customer | fn | enquiry atomic path | GHM_PARTIAL |
| `leadService.get/updateStatus` | read/status | leads | R/W | table/RPC | business | mixed | enquiry | GHM_PARTIAL |
| `reviewService.create` | create | reviews | W | insert | customer | row | review create | GHM_PARTIAL (bypasses submit RPC) |
| `reviewService.moderate` | moderate | reviews | W | RPC | admin | fn | review moderate | GHM_PROVIDES |
| `reviewService.get*` | read | reviews | R | table | public/own | query | review reads | GHM_PROVIDES |
| `notificationService.create/get/mark*` | notification | notifications | R/W | RPC/table | recipient | fn | notification | GHM_PROVIDES |
| `notificationService.subscribeToUser` | realtime | notifications | R | Realtime | filter | — | none | EXTERNAL |
| `useLeads` channel | realtime | leads | R | Realtime | filter | — | none | EXTERNAL |
| `savedService.toggle/getAll` | save | saved_businesses | R/W | table | owner | app | saved_business C/D/R | GHM_PROVIDES |
| `businessHourService.get/replace` | hours | business_hours | R/W | table/RPC | manage/public | fn | business_hours | GHM_PROVIDES |
| `businessOfferingService.*` | offerings | business_offerings | R/W | table | manage | row | none | GHM_ABSENT |
| `categoryService` / `businessClassificationService` | categories | category tables | R/W | table/RPC | mixed | mixed | none | GHM_ABSENT |
| `capabilityService` list/get | catalogue read | capabilities | R | table | public/auth | query | capability catalogue | GHM_PROVIDES |
| `capabilityService` draft/transition | catalogue write | capabilities | W | RPC | admin/gov | fn | SELECT-only catalogue | GHM_ABSENT |
| `businessCapabilityService.get/replace` | assertions | business_capabilities | R/W | table/RPC | manage | fn | create/read only | GHM_PARTIAL |
| `businessCapabilityService` evidence* | evidence | evidence table | R/W | RPC | manage/verifier | fn | none | GHM_ABSENT |
| `businessKnowledgeGraphService.get` | projection | RPC | R | RPC | auth | fn | none | GHM_ABSENT |
| `businessEngagementService.track` / analytics dashboard | analytics | engagement | R/W | RPC | manage/public | fn | none | GHM_ABSENT |
| `commercialService.getOffer/activateTrial` | trial | commercial | R/W | RPC | manage | fn | commercial trial | GHM_PROVIDES |
| `commercialService.prepare/startCheckout` | payment | payment+edge | W | RPC+Paystack | manage | fn+edge | stubs | GHM_PARTIAL |
| `onboardingService.*` | onboarding | onboarding progress | R/W | RPC | self | fn | none | GHM_ABSENT |
| `supportRequestService.*` | support | support_* | R/W | RPC | customer/admin | fn | support_request | GHM_PROVIDES |
| `projectService` / `projectsService` CRUD | projects | projects | R/W | table | customer | row | project | GHM_PARTIAL |
| `projectsService.createProject` RPC | project+opp | projects+opportunities | W | RPC | customer | fn | project only | GHM_ABSENT (atomic) |
| `projectQuoteService` + `decide_project_quote` | project quotes | project_quotes | R/W | table/RPC | parties | fn | project_quote | GHM_PROVIDES |
| `trustScoreService.*` | trust | trust_scores | R/W | table/RPC | mixed | fn | none | GHM_ABSENT |
| `opportunityService` list/get/replace requirements | opportunities | opportunities+requirements | R/W | table/RPC | public/manage | mixed | opportunity + requirements | GHM_PARTIAL |
| regional services (region/currency/locale/country/area/config/pricing) | regional | regional tables | R/W | table | mixed | row | country/currency subset | GHM_PARTIAL |
| relationship/outcome services | relationships | relationship/outcome tables | R/W | table | mixed | row | none | GHM_ABSENT |
| `verificationService.uploadDocument` | docs | private-docs + orphan table | W | Storage | manage | app | none | ORPHAN_REF + EXTERNAL |
| `businessImageService` / project images / workspace | media meta | orphan tables + media | R/W | Storage+table | mixed | app | none | ORPHAN_REF |
| `quoteAnalyzerService` | AI analysis persist | quote_analyses | R/W | orphan table | user | row | none | ORPHAN_REF |
| `supplierService` | suppliers | suppliers* | R/W | orphan | mixed | row | none | ORPHAN_REF |
| `disputeService` / `referralService` / `adminService` / `auditLogService` / `featureAccessService` / `referralTrackingService` | admin/social | orphan/legacy tables | R/W | mixed | admin/user | row | none | ORPHAN_REF |
| `commercialLaunchAdminService` | launch admin | RPC | R | RPC | admin | fn | none | GHM_ABSENT |
| WhatsApp deep links | open URL | — | — | client | n/a | — | n/a | CONNECT_LOCAL |
| `aiProxyClient` / `ai-proxy` | AI invoke | — | R | Edge+Anthropic | flagged | — | none | EXTERNAL |
| Paystack webhook | apply payment | commercial_* | W | Edge | signature | fn | stubs | EXTERNAL + GHM_PARTIAL |

## 3. Summary counts (inventory rows above)

| Status | Approx count |
|---|---:|
| GHM_PROVIDES | 12 |
| GHM_PARTIAL | 18 |
| GHM_ABSENT | 14 |
| EXTERNAL | 8 |
| CONNECT_LOCAL | 1 |
| ORPHAN_REF | 8 |

Counts are operation-family rows, not line-level API methods.

## 4. Adapter implication (non-authorizing)

A future Connect adapter must map each row to GHM operation, external provider, Connect-local behavior, or explicit unsupported. That mapping is **not** authorized by this inventory.
