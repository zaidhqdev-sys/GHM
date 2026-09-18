# GHM ↔ Zaid Connect Backend Readiness Audit

**Status:** READ-ONLY AUDIT — DOCUMENTATION ONLY  
**Audit date:** 2026-09-18  
**Authority:** Live repository inspection of GHM and Zaid Connect. This document does not authorize construction, adapters, shadow qualification, cutover, or production change.

## 1. Audit scope

Determine what Zaid Connect actually requires from a backend to operate fully, then classify each dependency against current GHM construction evidence.

In scope:

- Connect application services, hooks, features, migrations, edge functions, storage, realtime, and provider calls
- GHM resources, migrations, authorization, HTTP surface, runtime privileges, and qualification evidence

Out of scope:

- Implementing missing resources
- Creating migrations or qualification scripts
- Changing GHM application code
- Changing production
- Reopening closed GHM capabilities
- Inventing requirements not evidenced in source

Classification vocabulary used throughout:

| Status | Meaning |
|---|---|
| `ALREADY PROVIDES` | GHM has schema, operations, authorization, ownership, relationships, privileges, behavior, and qualification evidence for the stated Connect backend contract |
| `PARTIALLY PROVIDES` | GHM covers a bounded subset; Connect requires additional schema/ops/auth/behavior not yet closed |
| `DOES NOT YET PROVIDE` | Connect requires a backend contract GHM does not currently provide |
| `CONNECT-LOCAL` | Remains client/UI/local behavior; should not become a GHM resource merely because it exists |
| `EXTERNAL PROVIDER` | Owned by an external provider/SDK/hosting boundary |
| `EVIDENCE INSUFFICIENT` | Connect code references a dependency whose production schema/contract cannot be confirmed from available migrations/source |

A table existing in either repository is not treated as a complete capability.

## 2. Repositories and commits audited

| Repository | Local path | Remote | Branch | Commit SHA |
|---|---|---|---|---|
| GHM | `C:\GHM` | `https://github.com/zaidhqdev-sys/GHM.git` | `construction/saved-business-resource` | `cf4fc08a8331bb8ecbf43e033b71431a8d7913b3` |
| Zaid Connect | `C:\zaid-connect-audit` | `https://github.com/zaidhqdev-sys/zaid-connect.git` | `main` | `abcffa73f893602c25310a58946bebb91fd7eeb5` |

Notes:

- `C:\Zaid Connect` exists but has no commits on `main` and was not used as source of truth.
- Connect primary application backend client: `src/lib/lib_supabase.js`.
- Connect migrations audited: 46 files under `supabase/migrations/`.
- Connect edge functions audited: `ai-proxy`, `commercial-payment-checkout`, `commercial-payment-webhook`, `payfast-webhook`.
- GHM docs also read: `docs/HANDOVER_2026-09-16.md`, `PRODUCT_BACKEND_CAPABILITY_INVENTORY.md`, `PRODUCT_BACKEND_EVIDENCE_REGISTER.md`.

## 3. Connect backend dependency inventory

### 3.1 Canonical public tables evidenced by Connect migrations

`account_onboarding_progress`, `administrative_areas`, `business_capabilities`, `business_capability_evidence`, `business_categories`, `business_category_assignments`, `business_commercial_trials`, `business_directory_review_events`, `business_engagement_events`, `business_hours`, `business_memberships`, `business_offerings`, `business_profile_view_visitors`, `business_relationships`, `business_subscriptions`, `businesses`, `capabilities`, `commercial_consents`, `commercial_events`, `commercial_founding_allocations`, `commercial_payment_attempts`, `commercial_payment_transactions`, `commercial_plan_entitlements`, `commercial_plan_prices`, `commercial_plan_versions`, `commercial_plans`, `commercial_provider_events`, `commercial_reconciliation_records`, `commercial_refund_records`, `countries`, `currencies`, `directory_listing_founder_reviewers`, `leads`, `locales`, `notifications`, `opportunities`, `opportunity_capability_requirements`, `opportunity_participants`, `opportunity_types`, `outcome_types`, `outcomes`, `profiles`, `project_quotes`, `projects`, `regional_configurations`, `regional_membership_prices`, `regions`, `relationship_types`, `reviews`, `saved_businesses`, `support_request_messages`, `support_requests`, `trust_scores`.

### 3.2 Application services that call the backend

Primary hub: `src/lib/lib_supabase.js`.

Additional domain services:

- `src/features/opportunities/opportunityService.js`
- `src/features/marketplace/marketplaceService.js`
- `src/features/projects/projectsService.js`
- `src/features/ai/aiProxyClient.js`
- hooks in `src/hooks/hooks_index.js` (including leads realtime)

### 3.3 Dependency inventory table

| Connect capability | Source path | Backend dependency | Operation | Current provider | Required backend contract |
|---|---|---|---|---|---|
| Auth sign-up/sign-in/session | `lib_supabase.js` `authService` | Supabase Auth | auth | EXTERNAL PROVIDER | Session identity issuance, refresh, sign-out |
| Profile read/update | `profileService` | `profiles` | read/update | Supabase Postgres/RLS | Account profile persistence |
| Avatar upload | `profileService.uploadAvatar` | Storage bucket `media` | storage write + profile URL | EXTERNAL PROVIDER + DB | Object storage + profile media reference |
| Business create/read/update | `businessService` | `businesses` | CRUD subset | Supabase | Business identity persistence + ownership |
| Business registration identity | `get_business_registration_identity` | RPC | read private | Supabase | Private registration projection for owners |
| Business logo set/clear | `set_business_logo` / `clear_business_logo` | Storage `business-logos` + RPC | storage + write | EXTERNAL + Supabase | Governed logo object + Business logo fields |
| Profile view increment | `increment_business_views` + engagement track | RPC + `business_engagement_events` | write | Supabase | Analytics/view counter contract |
| Membership checks | `businessMembershipService` | `business_memberships` + RPCs | read/authz | Supabase | Membership roles/permissions |
| Knowledge graph projection | `get_business_knowledge_graph_projection` | RPC | read | Supabase | Capability/knowledge projection |
| Verification documents | `verificationService` | Storage `private-docs` + `verification_documents` | storage + read/write | EXTERNAL + DB | Private verification document store (**table migration EVIDENCE INSUFFICIENT**) |
| Directory listing founder review | `directoryListingReviewService` | RPCs + `business_directory_review_events` | submit/review/list | Supabase | 4A directory review workflow |
| Marketplace enquiry create | `leadService` / `marketplaceService` | `leads` + `create_marketplace_enquiry_with_opportunity` | create/read/update + atomic RPC | Supabase | Enquiry + optional Opportunity workflow |
| Reviews | `reviewService` | `reviews` + moderate/submit RPCs | create/read/moderate | Supabase | Review lifecycle + aggregates |
| Notifications | `notificationService` | `notifications` + RPCs + realtime channel | create/read/mark + realtime | Supabase + Realtime | Notification persistence + push transport |
| Saved businesses | `savedService` | `saved_businesses` | toggle/read | Supabase | Account-owned save relationship |
| Business offerings | `businessOfferingService` | `business_offerings` | CRUD/deactivate | Supabase | Offering catalogue per Business |
| Engagement/analytics | `businessEngagementService` / dashboard RPC | `business_engagement_events` + analytics RPC | write/read | Supabase | Analytics event + dashboard |
| Commercial offer/trial | `commercialService` | commercial tables + trial RPC | read/activate | Supabase | Trial entitlement |
| Commercial payment prepare/checkout | `commercialService` + edge `commercial-payment-checkout` | payment tables + Paystack | prepare/checkout/webhook | EXTERNAL + Supabase | Payment attempt + provider result application |
| Onboarding progress | `onboardingService` | `account_onboarding_progress` + RPCs | read/write | Supabase | Onboarding journey state |
| Support requests + messages | `supportRequestService` | support tables + RPCs | create/read/reply/status | Supabase | Support conversation resource |
| Commercial launch admin | `commercialLaunchAdminService` | admin RPC | read | Supabase | Launch-state admin projection |
| Categories/classification | `categoryService` / `businessClassificationService` | category tables + set-primary RPC | read/assign | Supabase | Business classification |
| Capability catalogue admin | `capabilityService` | `capabilities` + draft/transition RPCs | read/create/update/transition | Supabase | Governed catalogue lifecycle |
| Business capability assertions/evidence | `businessCapabilityService` | assertion/evidence tables + RPCs | replace/submit/review | Supabase | Assertion + evidence verification |
| Directory search/featured/nearby | `directoryService` | `businesses` public allowlist | search/geo/sort | Supabase | Public directory query contract |
| Business images | `businessImageService` | `business_images` + `media` | storage + CRUD | EXTERNAL + DB | Gallery media (**table migration EVIDENCE INSUFFICIENT**) |
| Business hours | `businessHourService` | `business_hours` + `replace_business_hours` | read/replace | Supabase | Weekly schedule |
| Projects | `projectService` / `projectsService.js` | `projects` + images + `create_project_with_opportunity` | CRUD + atomic RPC | Supabase | Project resource + Opportunity link |
| Project quotes | `projectQuoteService` | `project_quotes` + `decide_project_quote` | CRUD + accept/reject | Supabase | Project Quote workflow |
| Trust scores | `trustScoreService` | `trust_scores` + `calculate_business_trust_score` | read/calculate | Supabase | Trust score contract |
| Quote AI analysis persistence | `quoteAnalyzerService` | `quote_analyses` | insert/read | DB (**migration EVIDENCE INSUFFICIENT**) + local AI heuristics | Analysis persistence |
| Project workspace/files | `workspaceService` | `project_workspace` / `workspace_files` + `media` | CRUD + storage | EXTERNAL + DB (**migration EVIDENCE INSUFFICIENT**) | Collaboration workspace |
| Suppliers | `supplierService` | `suppliers` / `supplier_products` | CRUD | DB (**migration EVIDENCE INSUFFICIENT**) | Supplier directory |
| Admin verification queue | `adminService` | `admin_verification_queue` | read/update | DB (**migration EVIDENCE INSUFFICIENT**) | Admin queue |
| Audit logs | `auditLogService` | `audit_logs` | read/write | DB (**migration EVIDENCE INSUFFICIENT**) | Audit trail |
| Feature access | `featureAccessService` | `feature_access` | read/write | DB (**migration EVIDENCE INSUFFICIENT**) | Feature flags persistence |
| Referrals | `referralService` / tracking | `referrals` / `referral_tracking` | write/read | DB (**migration EVIDENCE INSUFFICIENT**) | Referral program |
| Disputes | `disputeService` | `disputes` | create/list | DB (**migration EVIDENCE INSUFFICIENT**) | Dispute records |
| Regional config | region/currency/locale/country/admin-area/config/pricing services | regional tables | read/admin write | Supabase | Regional configuration |
| Relationships/outcomes | relationship/outcome services | relationship/outcome tables | CRUD | Supabase | Business relationship + outcome domains |
| Marketplace opportunities list | `opportunityService.js` | `opportunities` + requirements | read/replace requirements | Supabase | Opportunity discovery + requirements |
| Opportunity creation workflows | marketplace/projects services | workflow RPCs | atomic create | Supabase | Cross-resource Opportunity creation |
| Notification realtime | `notificationService.subscribeToUser` | Realtime `postgres_changes` | subscribe | EXTERNAL PROVIDER | Push transport |
| Leads realtime | `hooks_index.js` | Realtime channel `leads:*` | subscribe | EXTERNAL PROVIDER | Lead feed transport |
| WhatsApp send helpers | `lib_whatsapp.js` | Meta WhatsApp Cloud API | send | EXTERNAL PROVIDER | Messaging delivery |
| WhatsApp deep links | UI `WhatsAppLink` | client URL | local | CONNECT-LOCAL | No backend required |
| AI support proxy | `aiProxyClient.js` + edge `ai-proxy` | Edge Function + model provider | invoke | EXTERNAL PROVIDER | AI proxy hosting |
| PayFast client/webhook | `lib_payfast.js` + edge `payfast-webhook` | PayFast | checkout/webhook | EXTERNAL PROVIDER | Payment provider path |
| PDF generation | `lib_pdf.js` | client/local | local | CONNECT-LOCAL / EVIDENCE INSUFFICIENT for server dependency | Document generation ownership unclear without deeper product workflow evidence |

## 4. GHM coverage matrix

| Capability | Connect requirement | GHM resource | Status | Evidence | Missing requirement |
|---|---|---|---|---|---|
| Auth/session issuance | Supabase Auth | GHM JWT `AuthContext` exists but is not Connect Auth | `EXTERNAL PROVIDER` / `PARTIALLY PROVIDES` | Connect `authService`; GHM `src/auth/request-context.ts` | Connect-compatible identity provider/adapter; account bootstrap from Auth users |
| Account profile | `profiles` CRUD subset | `account_identity` / profile | `PARTIALLY PROVIDES` | GHM Business Identity qualification; Connect profile fields include phone/role/avatar URL | Full Connect profile field parity; avatar storage binding |
| Business identity core | create/read/managed update | `business` | `PARTIALLY PROVIDES` | Qualified Business Identity slice; HTTP exists | Rich Connect Business fields (description, geo, contact, tier, featured, aggregates beyond first slice) |
| Business public directory projection | `PUBLIC_DIRECTORY_BUSINESS_COLUMNS` (30+ columns) | first-slice public Business | `PARTIALLY PROVIDES` | Connect allowlist in `lib_supabase.js`; GHM SQL contract limits public fields to `id,name,slug,verification_status,is_active,created_at,updated_at` | Public projection parity; directory privacy rules for registration fields |
| Directory search/geo/featured | `directoryService` | none dedicated | `DOES NOT YET PROVIDE` | Connect directory service | Search/sort/geo/featured query contract |
| Membership | `business_memberships` + permission RPCs | `business_membership` | `PARTIALLY PROVIDES` | GHM membership create/resolve/manage checks | Full Connect permission vocabulary (`analytics.read`, `trust.read`, etc.) and membership management ops |
| Business Hours weekly | replace/read/public | `business_hours` | `ALREADY PROVIDES` | QUALIFIED / CLOSED; `qualify-business-hours-runtime` | Exceptions/booking/open-now remain out of contract |
| Business Hours exceptions/booking | excluded in Connect hours audit / not in weekly RPC | none | `DOES NOT YET PROVIDE` | GHM Business Hours source audit exclusions | Separate source authorization required |
| Capability catalogue selectable read | list/get selectable | `capability` | `ALREADY PROVIDES` | Catalogue contract + qualify script | Admin draft/transition lifecycle not provided by GHM app ops |
| Capability catalogue governance writes | create/update/transition drafts | none as app ops | `DOES NOT YET PROVIDE` | Connect `capabilityService` draft/transition RPCs; GHM catalogue SELECT-only | Governance write contract + authorization |
| Business capability assert create/read | assertions | `business_capability` | `PARTIALLY PROVIDES` | QUALIFIED create/read | Connect `replace` bulk assertions; evidence submit/review; verification update reserved in GHM |
| Capability evidence | evidence table + review RPC | none | `DOES NOT YET PROVIDE` | Connect evidence service + migration | Evidence schema/ops/auth |
| Knowledge graph projection | RPC | none | `DOES NOT YET PROVIDE` | Connect knowledge graph service | Projection contract |
| Categories/classification | category tables | none | `DOES NOT YET PROVIDE` | Connect category services + migrations | Classification schema/ops |
| Business offerings | `business_offerings` | none | `DOES NOT YET PROVIDE` | Connect offering service + migration | Offering resource |
| Enquiry/Lead core | create/read/status | `enquiry` | `PARTIALLY PROVIDES` | QUALIFIED / CLOSED Enquiry | Atomic marketplace Enquiry→Opportunity RPC parity; realtime lead feed |
| Marketplace Enquiry+Opportunity atomic create | `create_marketplace_enquiry_with_opportunity` | Enquiry + Opportunity exist separately | `PARTIALLY PROVIDES` | Connect marketplace service; GHM has Enquiry Opportunity link reconciliation | Exact atomic workflow qualification as Connect uses it |
| Opportunity core | create/read/update/transition | `opportunity` | `PARTIALLY PROVIDES` | Opportunity Core qualified | Marketplace discovery filters; complete outcome/matching graph not authorized |
| Opportunity requirements | replace/list | `opportunity_capability_requirement` | `ALREADY PROVIDES` | QUALIFIED requirements boundary | — |
| Opportunity participation initial | create/read | `opportunity_participant` | `PARTIALLY PROVIDES` | QUALIFIED initial; update deferred | Participant transition/invite workflows |
| Project core | create/read/update | `project` + public projection | `PARTIALLY PROVIDES` | Project + public qualify scripts | Connect project delete; project images; create_project_with_opportunity atomic |
| Project Quote | create/update/accept/reject | `project_quote` | `ALREADY PROVIDES` | QUALIFIED / CLOSED | Adapter/HTTP still absent for Connect consumption |
| Review lifecycle + aggregates | create/own/public/moderate + rating/count | `review` + Business aggregates | `ALREADY PROVIDES` | QUALIFIED / CLOSED Review | Trust remains separate |
| Saved Business relationship | create/read/delete | `saved_business` | `ALREADY PROVIDES` | QUALIFIED / CLOSED | Connect UI toggle is local composition of create/delete; Connect `getAll` joins public Business projection |
| Notification persistence/mark-read | create/read/mark | `notification` | `ALREADY PROVIDES` | QUALIFIED / CLOSED | Realtime transport not included |
| Notification realtime | channel subscribe | none | `EXTERNAL PROVIDER` / `DOES NOT YET PROVIDE` | Connect subscribeToUser | Delivery boundary decision + contract |
| Support request + messages | create/list/reply/status | `support_request` + messages | `ALREADY PROVIDES` | QUALIFIED / CLOSED | HTTP/adapter absent |
| Commercial trial | activate/read access | commercial trial path | `ALREADY PROVIDES` | QUALIFIED / CLOSED trial | — |
| Commercial payment prepare/cancel/provider result | payment RPCs + edge checkout/webhook | schema present; ops stubs | `PARTIALLY PROVIDES` | Commercial schema + stubs throw; Connect Paystack/PayFast edges | Payment operation contract + provider integration authorization |
| Trust score | `trust_scores` + calculate RPC | none | `DOES NOT YET PROVIDE` | Connect trust migration + service; GHM handover forbids opening without authorization | Source/schema/operation contracts + construction authorization |
| Directory founder review (4A) | submit/review/list RPCs | verification fields partially on Business | `PARTIALLY PROVIDES` | Connect founder review migrations; GHM listing verification reconciliation docs | Full founder-reviewer workflow + event history ops |
| Registration number private boundary | private RPC / excluded from public select | GHM excludes private 4A fields from Saved Business/public first slice | `PARTIALLY PROVIDES` | Connect public allowlist comments; GHM Saved Business/public contracts | Managed registration identity API parity |
| Profile views / engagement analytics | engagement events + dashboard | none | `DOES NOT YET PROVIDE` | Connect engagement migrations/services | Analytics contract |
| Onboarding progress | onboarding RPCs/table | none | `DOES NOT YET PROVIDE` | Connect onboarding migration/service | Onboarding contract |
| Regional configuration | regions/currencies/locales/countries/config/prices | `country`/`currency` exist for Opportunity | `PARTIALLY PROVIDES` | Connect regional foundation; GHM Opportunity refs | Full regional config/pricing/admin-area resources |
| Relationships / outcomes | relationship/outcome tables | none | `DOES NOT YET PROVIDE` | Connect relationship foundation migration | Relationship/outcome contracts |
| Storage media/private docs/logos | buckets `media`, `private-docs`, business logo bucket | none as GHM storage resource | `EXTERNAL PROVIDER` / `DOES NOT YET PROVIDE` | Connect storage call sites + logo migration | Storage abstraction + object authz contract |
| Edge Functions runtime | checkout/webhook/ai-proxy | none | `EXTERNAL PROVIDER` / `DOES NOT YET PROVIDE` | `supabase/functions/*` | Hosting/runtime decision + contracts |
| WhatsApp API send | Meta Cloud API | none | `EXTERNAL PROVIDER` | `lib_whatsapp.js` | Remains provider-owned unless separately authorized |
| WhatsApp deep link CTA | client URL | n/a | `CONNECT-LOCAL` | UI components | — |
| AI proxy / AI support | edge ai-proxy | none | `EXTERNAL PROVIDER` | `aiProxyClient.js` | Provider/runtime ownership |
| Quote analyses / workspace / suppliers / disputes / referrals / audit_logs / feature_access / admin_verification_queue / business_images / project_images / verification_documents | app services reference tables | none | `EVIDENCE INSUFFICIENT` | Referenced in `lib_supabase.js` but no matching `create table` in audited migrations | Migration/source reconciliation required before GHM construction decisions |
| QuoteFlow Customer/Quote CRM | not a Connect primary surface | `customer` / `quote` | `ALREADY PROVIDES` for QuoteFlow-oriented GHM slices; **not** a Connect runtime dependency evidenced here | GHM Customer/Quote qualification | Connect does not appear to require QuoteFlow CRM Quote to run |
| Connect→GHM product adapter | replace `lib_supabase.js` provider calls | none | `DOES NOT YET PROVIDE` | Evidence register OPEN | Explicit adapter construction authorization |
| HTTP resource surface for closed domains | Connect uses direct Supabase client | GHM HTTP only profile/business/project/enquiry | `PARTIALLY PROVIDES` | `src/http/app.ts`; many contracts forbid assuming HTTP from registry | Product adapter or authorized HTTP routes per resource |

## 5. Authorization and identity audit

### 5.1 Connect path

```text
Supabase Auth user (UUID)
→ profiles.id (= auth.uid())
→ optional business_memberships
→ RLS / SECURITY DEFINER RPC checks (auth.uid(), is_business_member, has_business_permission, can_manage_opportunity, founder reviewer predicates)
→ table/RPC/storage access
```

Evidence: `authService`, membership RPCs, founder-reviewer functions, opportunity auth predicates, RLS-oriented migrations.

### 5.2 GHM path

```text
Bearer JWT
→ AuthContext { userId: number, role: admin|customer|business }
→ requireAuthenticatedContext / canAccessResource / ownership asserts
→ service
→ withAuthorizedTransaction(context)
→ repository SQL binds context.userId
→ ghm_runtime least-privilege grants / SECURITY DEFINER functions
```

Evidence: `src/auth/authorization.ts`, `src/auth/request-context.ts`, `src/db/authorized-transaction.ts`.

### 5.3 Concrete mismatches

| Mismatch | Evidence | Impact |
|---|---|---|
| Identity key type UUID vs bigint | Connect profiles/businesses UUIDs; GHM `account_identity`/`business` bigint | Adapter must map identities; no cutover without mapping evidence |
| Auth provider | Connect Supabase Auth; GHM JWT secret verification | Session issuance not interchangeable |
| Role model | Connect profile role + Business membership permissions; GHM coarse `GhmRole` plus membership for Business ops | Permission vocabulary not 1:1 |
| Authorization mechanism | Connect RLS + `auth.uid()` in DB; GHM app AuthContext + role grants | Provider RLS cannot be copied as GHM model |
| Business context selection | Connect membership helpers/RPCs; GHM `resolveIdentity` selectedBusiness rules | Client must use GHM identity resolution contract |
| HTTP exposure | Connect talks to Supabase directly; GHM many resources are service-only | Without adapter/HTTP, Connect cannot call qualified GHM services |

## 6. Database/schema coverage

| Connect domain | Connect source | GHM schema | Status | Missing fields/relationships/constraints |
|---|---|---|---|---|
| profiles | identity migration | `ghm.account_identity` | PARTIAL | Connect-specific columns/URLs not fully mirrored; no auth.users coupling |
| businesses | identity + directory migrations | `ghm.business` | PARTIAL | Many Connect public/managed fields absent from first-slice GHM Business |
| business_memberships | membership foundation | `ghm.business_membership` | PARTIAL | Permission matrix / richer membership ops |
| business_hours | hours migration | `ghm.business_hours` | COVERED for weekly schedule | Exceptions not in either first-slice contract |
| capabilities | catalogue migrations | `ghm.capability` | PARTIAL | Governance write path not exposed |
| business_capabilities | assertion migration | `ghm.business_capability` | PARTIAL | Evidence relation absent; replace semantics differ |
| business_capability_evidence | evidence migration | none | MISSING | Entire evidence subdomain |
| business_categories / assignments | classification migration | none | MISSING | Entire classification subdomain |
| business_offerings | classification migration | none | MISSING | Entire offerings subdomain |
| leads | enquiry migration | `ghm.enquiry` | PARTIAL | Connect field/RPC naming; atomic Opportunity workflow |
| reviews | reviews migration | `ghm.review` | COVERED for qualified slice | — |
| saved_businesses | trust/saved migration | `ghm.saved_business` | COVERED for relationship | No Business embed |
| trust_scores | trust migration | none | MISSING | Trust score table/calc |
| notifications | notifications migration | `ghm.notification` | COVERED for persistence | Realtime not schema |
| support_requests / messages | support migrations | `ghm.support_request` (+ message) | COVERED | — |
| projects / project_quotes | projects migration | `ghm.project` / `ghm.project_quote` | PARTIAL/COVERED | Project images/workspace missing |
| opportunities / participants / requirements / types | opportunity migrations | `ghm.opportunity*` | PARTIAL | Outcome/matching deferred; participant update deferred |
| commercial_* + business_commercial_trials + business_subscriptions | commercial migrations | `ghm.commercial_*` | PARTIAL | Trial qualified; payment ops not implemented |
| regional_* / countries / currencies / locales | regional foundation | limited `country`/`currency` | PARTIAL | Regions/locales/admin areas/config/prices missing |
| relationship_types / business_relationships / outcome_* | relationship foundation | none | MISSING | Entire subdomain |
| account_onboarding_progress | onboarding migration | none | MISSING | Entire subdomain |
| business_engagement_events / profile view visitors | engagement migrations | none | MISSING | Analytics subdomain |
| business_directory_review_events / founder reviewers | founder review migration | none as dedicated tables | PARTIAL | Workflow tables/events missing |
| App-referenced tables without migration create | `disputes`, `referrals`, `quote_analyses`, `project_workspace`, `workspace_files`, `suppliers`, `admin_verification_queue`, `audit_logs`, `feature_access`, `referral_tracking`, `business_images`, `project_images`, `verification_documents` | none | EVIDENCE INSUFFICIENT | Cannot authorize GHM schema without source reconciliation |

## 7. Runtime privilege coverage

| Required Connect runtime behavior | GHM counterpart | Coverage |
|---|---|---|
| Authenticated table SELECT under RLS | `ghm_runtime` SELECT + app filters | Different model; app must enforce ownership |
| Narrow INSERT/UPDATE via RLS/RPC | Column grants or SECURITY DEFINER functions | Established per qualified resource; not universal |
| Saved Business create/delete via app insert/delete | SECURITY DEFINER create/delete functions; no table INSERT/DELETE | Covered for GHM model; Connect client shape differs |
| Business Hours replace RPC | `ghm.replace_business_hours` execute-only | Covered |
| Commercial trial activation | Qualified commercial trial path | Covered |
| Commercial payment prepare/apply | Stubs throw | Not covered |
| Trust calculate RPC | None | Not covered |
| Storage object write policies | None in GHM | Not covered |
| Realtime authorization | None in GHM | Not covered |
| Edge function service-role operations | None in GHM | Not covered |

## 8. Public/private data boundary

### Connect public Business allowlist

Source: `PUBLIC_DIRECTORY_BUSINESS_COLUMNS` in `src/lib/lib_supabase.js`.

Explicitly excluded from public select:

- `registration_number`
- `directory_review_submitted_at`
- `directory_review_last_reason`
- `directory_review_last_event_type`

Owner registration identity is retrieved through `get_business_registration_identity` RPC, not public select.

### GHM first-slice public Business

Source: `BUSINESS_IDENTITY_SQL_CONTRACT.md` / Business Identity service.

Public fields: `id`, `name`, `slug`, `verification_status`, `is_active`, `created_at`, `updated_at`.

Eligibility checks in service require active + approved; listing verification docs also discuss `is_verified`.

### Boundary findings

| Finding | Evidence | Classification impact |
|---|---|---|
| GHM public projection is narrower than Connect public allowlist | Connect columns include description/geo/contact/tier/rating/etc. | PARTIAL — not over-exposure; under-exposure for Connect UI parity |
| GHM Saved Business does not join Business rows | Saved Business qualification/contracts | Avoids accidental private Business leakage via Saved Business |
| Connect Saved `getAll` returns public Business projection | `savedService.getAll` | Adapter must use public Business contract, not `businesses(*)` |
| Private 4A fields must remain non-public | Connect remediation migration + GHM Saved Business contract | Preserve exclusion |
| Membership and account data are private | Both models | Must not become public directory fields |

No evidence in this audit that qualified GHM resources currently expose Connect’s excluded 4A private fields through public projections.

## 9. Provider dependency boundary

| Dependency | Current owner | GHM ownership expectation from evidence |
|---|---|---|
| Supabase Auth | EXTERNAL PROVIDER | Identity provider decision required; not automatically GHM |
| Supabase Postgres + RLS | EXTERNAL PROVIDER (prod) | GHM owns canonical schema/resources; not RLS copy |
| Supabase Realtime | EXTERNAL PROVIDER | Delivery channel; Notification resource excludes transport |
| Supabase Storage | EXTERNAL PROVIDER | Future storage abstraction would be separately authorized |
| Supabase Edge Functions | EXTERNAL PROVIDER | Runtime hosting decision separate from resource contracts |
| Paystack | EXTERNAL PROVIDER | Payment provider; GHM may own payment attempt/result contracts later |
| PayFast | EXTERNAL PROVIDER | Legacy/alternate payment path in Connect |
| Meta WhatsApp Cloud API | EXTERNAL PROVIDER | Messaging delivery remains provider-owned unless authorized otherwise |
| AI model via ai-proxy | EXTERNAL PROVIDER | Proxy/runtime remains outside GHM core resources |
| Client WhatsApp links / local AI heuristics / PDF helpers | CONNECT-LOCAL or mixed | Do not auto-promote to GHM resources |

## 10. Production-readiness blockers

These block GHM from actually becoming Connect’s backend. They are not implementation tasks.

| # | Blocker | Evidence | Affected Connect workflow | Affected GHM domain | Why it blocks | More source evidence? | Explicit construction authorization? |
|---|---|---|---|---|---|---|---|
| 1 | No Connect product adapter | Connect uses `@supabase/supabase-js` exclusively; evidence register OPEN | Entire app | Adapter boundary | Qualified GHM services are unreachable from Connect | Adapter contract mapping per resource | Yes |
| 2 | Auth/session not interchangeable | Supabase Auth vs GHM JWT AuthContext | Sign-in, all authenticated ops | Auth/identity | Users cannot authenticate into GHM with current Connect auth flow | Identity mapping + bootstrap | Yes |
| 3 | Identity keyspace mismatch | UUID vs bigint | All FKs | All resources | Data/API mapping unresolved | Mapping/migration design evidence | Yes |
| 4 | Public Business/directory contract incomplete | Connect public allowlist ≫ GHM first-slice public Business; no directory search resource | Directory, Marketplace, Business Profile | Business public projection / directory | Connect screens cannot render current directory UX | Field-by-field reconciliation | Yes |
| 5 | Missing Trust backend | `trust_scores` + calculate RPC | Trust feature | Trust | Trust workflows have no GHM resource | Trust source/schema/operation contracts | Yes (handover forbids opening without it) |
| 6 | Missing commercial payment ops | Connect payment RPCs/edges; GHM stubs | Subscription checkout | Commercial | Paid subscription path cannot run on GHM | Payment operation contract + provider boundary | Yes |
| 7 | Missing storage/media contracts | Logo/avatar/docs/images/workspace uploads | Profile, Business, Projects, Verification | Storage | Media workflows fail without object store contract | Storage abstraction + bucket authz | Yes |
| 8 | Missing realtime delivery | Notification + leads channels | Notifications, Business lead inbox | Notification / Enquiry | Live updates not provided by GHM resources | Delivery ownership decision | Yes |
| 9 | Missing edge/runtime equivalents | checkout/webhook/ai-proxy functions | Payments, AI support | Provider runtime | Provider callbacks and AI proxy have no GHM host | Runtime placement decision | Yes |
| 10 | Missing classification/offerings/evidence/relationships/outcomes/onboarding/analytics domains | Migrations + services exist in Connect; absent in GHM | Directory filters, Business profile richness, admin/ops journeys | Multiple | Large product surfaces have no GHM backend | Per-domain source audits | Yes |
| 11 | Partial Opportunity/Enquiry/Project atomic workflows | Connect workflow RPCs; GHM has pieces | Marketplace create, Project create-with-opportunity | Enquiry/Opportunity/Project | End-to-end Connect create flows not proven on GHM | Workflow operation contracts + qualification | Yes |
| 12 | Deferred participant/BC update authorities | GHM repositories/contracts reject or reserve updates | Participation transitions; capability verification lifecycle | Opportunity participant / Business capability | Connect mutation paths beyond initial slices unsupported | Transition authority evidence | Yes |
| 13 | Thin GHM HTTP surface | Only profile/business/project/enquiry HTTP | Most features | Resource API | Even with JWT, most domains have no HTTP route | Per-resource HTTP authorization | Yes |
| 14 | App tables without migration evidence | Services reference tables not created in audited migrations | Disputes, referrals, workspace, suppliers, admin queue, etc. | Unknown | Cannot define GHM contract safely | Locate authoritative schema or confirm dead code | Yes before construction |
| 15 | Shadow qualification / cutover absent | Evidence register OPEN | Production operation | Platform | Construction qualification ≠ production replacement | Shadow plan + rollback evidence | Yes |
| 16 | Provider/bootstrap authority cleanup open | Construction sequence / Postgres authority docs | Platform operations | Infra | Blocks some infra mutations; not product cutover by itself | Independent bootstrap authority | Separate infra authorization |

## 11. Already-closed capabilities

The following GHM capabilities remain **QUALIFIED / CLOSED** and are not reopened by this audit:

- Review
- Opportunity capability requirements
- Opportunity Participation (initial boundary)
- Quote
- Project Quote
- Enquiry / Lead
- Commercial trial operation
- Support Request
- Notification
- Saved Business

Also closed in current handover/inventory evidence and preserved here:

- Business Hours (weekly schedule)
- Business Capability (read/create)
- Capability Catalogue (selectable/active read)
- Business Identity first slice
- Project private/public disclosure
- Customer (QuoteFlow-oriented)
- Opportunity Core
- Resource API first HTTP slice
- Operational boundary

Closure means the frozen GHM construction slice is complete for its contract. It does **not** mean Connect can already run on GHM, and it does **not** mean every related Connect workflow is covered.

## 12. Backend readiness boundary

### What current evidence supports

- GHM has constructed and runtime-qualified multiple Connect-adjacent domain slices at the service/database boundary.
- Those closed slices are real backend contracts with least-privilege runtime evidence.
- Connect’s production backend today remains Supabase Auth + Postgres/RLS + Storage + Realtime + Edge Functions + payment/messaging providers.
- Several Connect domains are intentionally outside current GHM authorization (Trust, payment beyond trial, adapters, shadow, cutover).

### What current evidence does not support

- Any claim that GHM is production-ready as Connect’s backend.
- Any claim that qualified GHM resources alone are sufficient for full Connect operation.
- Any claim that every Connect `lib_supabase.js` service has a GHM equivalent.
- Any cutover, DNS, credential, or traffic change.
- Construction of Trust/payment/adapters without new source evidence and explicit authorization.

### Bottom line

```text
GHM construction progress ≠ Connect backend readiness.
Connect still requires Supabase/provider behaviors that GHM has not reproduced as complete, authorized, qualified backend contracts plus a product adapter.
```

## 13. Recommended next evidence

Only evidence needed to make future construction decisions. No speculative implementation.

1. **Connect adapter evidence pack** — map each `lib_supabase.js` / feature service method to either an existing GHM operation, an external provider, Connect-local behavior, or a missing contract.
2. **Public Business / directory field reconciliation** — exact Connect public allowlist vs GHM Business schema; decide which fields are first GHM public projection extensions.
3. **Trust source audit** — tables, calculate RPC inputs/outputs, authorization, write triggers, UI consumers; only then decide construction authorization.
4. **Commercial payment operation contract** — prepare/checkout/webhook/result/cancel flows from Connect migrations + edge functions; separate provider SDK ownership.
5. **Storage boundary audit** — buckets, object paths, RLS/storage policies, which metadata tables are authoritative.
6. **Realtime delivery ownership decision** — remain provider-owned vs GHM event transport; required for notifications/leads UX parity.
7. **Orphan table reconciliation** — for every app-referenced table lacking migrations, locate authoritative schema or prove unused/dead.
8. **Atomic workflow matrix** — `create_marketplace_enquiry_with_opportunity`, `create_project_with_opportunity`, `decide_project_quote` vs GHM multi-resource sequences.
9. **Identity mapping design evidence** — UUID↔bigint, auth bootstrap, membership permission vocabulary mapping.
10. **HTTP vs adapter decision record** — whether Connect should call GHM HTTP resources or an internal adapter layer.

---

## Appendix A — Classification counts (this audit)

Counts are for distinct capability rows in §4 coverage matrix (one primary status each):

| Classification | Count |
|---|---|
| ALREADY PROVIDES | 12 |
| PARTIALLY PROVIDES | 18 |
| DOES NOT YET PROVIDE | 16 |
| CONNECT-LOCAL | 2 |
| EXTERNAL PROVIDER | 6 |
| EVIDENCE INSUFFICIENT | 1 (grouped orphan-table set; expands to 13 referenced objects) |
| **Total matrix rows** | **55** |

Dependency inventory rows in §3.3: **48** concrete Connect backend dependencies inventoried from live source.

## Appendix B — Closed capability preservation statement

This audit inspected closed capabilities only to measure Connect coverage gaps. No closed capability was modified, re-qualified, or recommended for reopening.
