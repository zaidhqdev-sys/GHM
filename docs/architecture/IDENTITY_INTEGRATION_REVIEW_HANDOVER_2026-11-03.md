# Identity Integration Review Handover — 2026-11-03

Repository: zaidhqdev-sys/GHM
Candidate branch: integration/ghm-identity-merge-candidate-20261018
Reviewed head: 8739b0bf24ef2619f63a14d06a1db3f64138330c
PR #142: https://github.com/zaidhqdev-sys/GHM/pull/142 (open, draft)
CI #1839: https://github.com/zaidhqdev-sys/GHM/actions/runs/41730855382 (passed on the exact head).

## Safety

Do not merge PR #142 wholesale. It is a broad divergent integration candidate, not a release bundle. Do not run shared Render qualification, production migrations, production writes, grants, deployment, provider activation, or cutover without fresh explicit authorization. Preserve the untracked local .ghm-quoteflow-readonly-preflight.mjs; do not remove or commit it. No source or environment changes were made during this review.

## CI evidence

CI #1839 passed build, all migrations against disposable PostgreSQL, Business Identity and QuoteFlow migration qualification, DB-backed tests, migration audit policy tests, and runtime boundary verification. This is disposable-CI evidence only, not shared Render or production qualification.

## Read-only security findings

### Database and migration boundary
- QuoteFlow provisioning is a SECURITY DEFINER function owned/executable by ghm_schema_owner, not ghm_runtime.
- Qualification connects as migrator, explicitly switches to ghm_schema_owner, and verifies runtime cannot execute provisioning or directly write mapping/audit tables.
- Provisioning validates active Business-role ownership and source/provider inputs; uses transaction-scoped advisory locks and uniqueness constraints; handles idempotent retries; records mapping/audit provenance. Qualification checks concurrency and rollback.
- Cleanup is scoped to synthetic run fixtures and transactional; process/network interruption can still leave residue.
- Business Registration Identity is private self-declared data, not independent verification or public projection. RLS is enabled; direct PUBLIC/runtime privileges are revoked. Read/update SECURITY DEFINER functions pin search_path, are owned by ghm_schema_owner, and check active Business plus active owner/administrator membership.
- Repository uses withTenantTransaction, checks owner/administrator membership, and supplies context.userId rather than caller-provided account identity.
- No confirmed privilege-escalation blocker found in inspected SQL/grants.

### HTTP wiring and privacy
- Inspected src/http/app.ts, src/http/business-registration-identity-router.ts, src/auth/authorization.ts, src/auth/http.ts, registration identity repository, public Business contract/repository, and relevant route tests.
- Registration-identity handlers derive account identity from authenticated req.authContext, not request body/query.
- Update parser is allow-listed and rejects caller-supplied businessId. Business ID comes from URL, is parsed as positive safe integer, then checked through tenant repository.
- Repository and SQL independently enforce active owner/administrator membership.
- Public Business contract and SQL projection omit registration_number and legal_name; private fields are returned only by the dedicated authenticated registration-identity endpoint.
- app.ts wires registration identity routes, but no QuoteFlow migration provisioning service/HTTP route was found in the inspected app composition.
- No confirmed account-ID substitution, public registration-data leak, or HTTP exposure of migration-only provisioning found.

## Conclusion and limitations

No confirmed blocker found in the inspected database and HTTP paths. This is a limited source-level review at the exact head above, not a full security approval or complete audit of every route/configuration, and does not establish deployed runtime behavior.

Remaining trust boundaries:
1. Authentication middleware/session issuance and reset/recovery lifecycle: prove AuthContext.userId originates only from a validated GHM session/token and remains correctly bound through reset, recovery, and lazy session issuance.
2. Role/resource registry and resource-operation authorization: verify registration-identity operation mapping and upstream middleware cannot be bypassed or broadened.
3. Continue broader route/service review only after those focused checks.

## Resume point

Next: read-only review of identity/authentication lifecycle, focusing on reset, recovery, and lazy session issuance. Trace token/session validation through middleware to req.authContext, then check account binding, invalidation, and re-enrollment behavior.

Related notes:
- docs/architecture/GHM_AUTHENTICATION_SESSION_CONTRACT.md
- docs/architecture/CONNECT_GHM_MIGRATION_HANDOVER_2026-10-13.md
- docs/operations/handover-production-db-and-render-2026-10-24.md

No production or shared Render operations were performed. Keep secrets and full connection URLs out of handover notes.


## Authentication / session lifecycle review (continued 2026-11-03)

Reviewed at the same immutable candidate head `8739b0bf24ef2619f63a14d06a1db3f64138330c`:
- `src/auth/resource-auth.ts`, `src/auth/ghm-bearer.ts`, `src/auth/ghm-auth-context.ts`, `src/auth/foundation/access-jwt.ts`
- `src/auth/ghm-auth-service.ts`, `src/auth/foundation/persistence.ts`
- `src/auth/password-recovery.ts`, `src/auth/password-reset.ts`
- `src/migrations/quoteflow-migration-reset-recovery.ts`, `src/migrations/quoteflow-migration-reset-completion.ts`
- `src/http/auth-router.ts`, relevant auth/resource/reset tests
- `src/http/app.ts`
- `database/migrations/20260921130000_create_auth_runtime_functions.sql`
- `database/migrations/20261004181000_add_quoteflow_migration_reset_enrollment_lookup.sql`
- `database/migrations/20261004190000_add_quoteflow_migration_reset_completion.sql`

### Confirmed positive boundaries
- Resource auth accepts only a Bearer token, verifies ES256 with pinned algorithm, issuer, audience, key ID and expiry, then loads the account's current active status/role/admin flag from `ghm.account_identity`. JWT role/userId claims are not authorization authority. `AuthContext.userId` is constructed from the verified JWT subject's account ID and current DB state; missing/disabled accounts fail closed with 401.
- The access JWT subject is constrained to a positive decimal safe-integer account ID. Access token TTL is 15 minutes.
- Password recovery issues opaque random tokens, persists only a peppered HMAC hash, and sends the raw token only through the delivery port. Unknown/inactive accounts do not receive a recovery message; the HTTP response does not include the token.
- Standard password reset redeems the opaque recovery credential and changes password/revokes sessions inside a transaction. A failed password update rolls back the token redemption and revocation with the transaction.
- QuoteFlow reset lookup binds the approved normalized email to an active enrollment and matching Supabase external identity. Completion is a single SECURITY DEFINER transaction: locks eligible enrollment/account/recovery rows, rechecks source identity and active account, consumes the unexpired token, sets password using the approved enrollment email, revokes all existing sessions, and marks enrollment completed.
- QuoteFlow reset completion endpoint does not trust a caller-supplied account ID or email. It completes by opaque token + password, then logs in using the approved email returned by the DB transaction. Session issuance occurs after completion commits; a login/session issuance failure returns sanitized 500 (reset remains completed, so user may need normal login).
- App composition creates one `PostgresAuthPersistence` for reset and QuoteFlow recovery/completion services. The lazily initialized `GhmAuthService` separately creates its own default persistence instance, but both use the same configured database/persistence implementation; do not describe these as the same object instance.
- Existing tests cover token claim tampering/role-claim rejection, invalid issuer/audience/algorithm/kid/expiry, disabled account rejection, recovery anti-enumeration/token non-disclosure, migration reset anti-enumeration, and completion-before-login ordering.

### Residual design limitation to track (not confirmed blocker)
- The ES256 access JWT currently carries `sub`, `iss`, `aud`, `iat`, `exp`, and `kid`, but no session identifier. Resource bearer authentication verifies the token and active account state only; it does not call `auth_validate_session` or check a session ID. Logout, refresh replay, password recovery, and QuoteFlow reset revoke persisted session/refresh families, but already-issued access JWTs can remain accepted until their 15-minute expiry (unless the account is disabled). This may be an intentional short-lived access-token trade-off, but it is not immediate access-token revocation. Confirm this behavior is an accepted contract; if immediate revocation is required, design a session-bound JWT/session-state check as a separately scoped change.
- Do not assume session inactivity/absolute-expiry checks are applied to each API request: they are enforced in refresh rotation and `auth_validate_session`, not in the current resource bearer middleware.

### Review status / next step
No confirmed account-identity substitution or reset-token bypass was found in the inspected source paths. This remains source review, not runtime/deployment qualification. Next inspect role/resource authorization registry and the full auth route wiring/configuration (including origin/cookie policy and delivery configuration), then continue route-level coverage. Keep the review read-only. No code, database, shared Render, or production changes were made in this continuation.


## Role/resource registry and browser auth configuration review (2026-11-03)

Reviewed `src/auth/authorization.ts`, `src/resources/registry.ts`, `src/auth/resource-auth.ts`, `src/auth/ghm-bearer.ts`, `src/auth/http.ts`, `src/http/auth-router.ts`, `src/auth/recovery-webhook-delivery.ts`, and relevant authorization, resource-auth, auth-router, and webhook-delivery tests.

### Findings
- The generic resource registry gives all three GHM roles coarse access to `business_registration_identity` read/update. This is not the final tenant authorization: the route then calls the service/repository, which independently requires active owner/administrator membership for the requested Business. SQL functions repeat the active Business and membership checks. The tests assert registry vocabulary and the route tests exercise the tenant boundary. No cross-tenant access was demonstrated in inspected paths.
- Resource middleware requires a Bearer token, verifies it with the ES256 authenticator, loads active account status/role/system-admin flag from the database, and builds `req.authContext` from that database state. HS tokens fail closed; JWT role/userId claims do not override DB state. Tests cover invalid issuer/audience/algorithm/kid/expiry, disabled accounts, HS rejection, and system-admin role resolution.
- Browser auth routes require an exact configured Origin allow-list. If no origins are configured, web auth fails closed with 503; missing/unlisted Origin gets 403. Responses set `Cache-Control: no-store` and `Vary: Origin` after origin validation.
- Browser refresh credential is held in an HttpOnly, SameSite=Lax cookie scoped by default to `/api/ghm`; Secure is enabled in production unless explicitly overridden. Cookie path is validated to start with slash and exclude semicolon. Refresh/logout use cookie-only credentials for web routes; raw API routes use explicit refresh token body.
- Recovery webhook delivery is disabled unless both URL and bearer token are configured. It requires HTTPS, no URL credentials/query/fragment, a bearer token at least 32 chars, POST with redirects disabled, five-second timeout, and fails when receiver rejects. Raw recovery token is sent only to that configured webhook boundary.
- Auth route tests cover migration reset anti-enumeration and unavailable delivery, completion-before-login order, sanitized failure after committed completion, and standard login/register behavior.

### Remaining questions / hardening observations (not confirmed blockers)
- Coarse role registry inclusion for `business_registration_identity` is broader than the apparent business-manager use case. Tenant membership checks currently provide the decisive gate, so this is not a demonstrated bypass; consider tightening the coarse role list for clarity/defense in depth if product semantics require only business/admin roles.
- Browser cookie policy uses SameSite=Lax plus exact Origin validation, which is a sensible CSRF boundary for the inspected POST routes. No explicit CSRF token is used. Confirm the deployed reverse-proxy preserves the browser Origin header and that the configured allow-list exactly matches the trusted frontend origins. The raw non-cookie API auth routes intentionally remain separate.
- `GHM_WEB_AUTH_COOKIE_SECURE=false` can disable Secure even in production. This is an explicit override; production configuration should leave it unset/true and be checked operationally before enablement.
- The webhook validates HTTPS and URL shape but does not pin destination host/IP or prevent DNS rebinding/private-network destinations. Since the URL is operator-configured rather than user-controlled, this is an operator trust boundary; restrict the configured endpoint through deployment policy/egress controls.
- Rate limits are in-process Express rate-limiters (10 login/register, 5 recovery, 60 refresh/logout per 15 minutes). They are not shared/distributed across replicas unless separately configured; production multi-instance abuse controls should be confirmed at the edge.

### Updated review status
No confirmed bypass was found in the inspected role/resource, browser-origin/cookie, or recovery-delivery paths. Remaining access-token revocation caveat remains as documented above (persisted session revocation does not invalidate an already-issued access JWT before its 15-minute expiry). This remains source-level review at the recorded candidate SHA, not deployment verification. Next: inspect full route authorization/tenant scoping for the broader resource surface and confirm relevant production edge/configuration separately. Continue read-only; no code or environment changes.


## Broader resource-route and tenant-scope review (2026-11-03)

Read-only sample review at candidate SHA `8739b0bf24ef2619f63a14d06a1db3f64138330c`. Inspected route composition and authorization patterns in `src/http/app.ts`, customer, enquiry, opportunity, opportunity-participant, project-quote, quote, support-request, notification, saved-business, campaign, business-offering, business-capability and storage routers; then traced representative repositories for campaign, opportunity participants, enquiry, notifications, support requests, saved businesses, customers, opportunities, project quotes, business hours, and storage service/tenant tests.

### Positive findings
- `app.ts` composes resource routers with the same resource-auth middleware and per-route registered-operation/role gates. Public read routes are separately registered and use public projections/services.
- Tenant-owned Business Hours reads use `withTenantTransaction`; writes additionally require owner/administrator membership and execute the database replacement function. This matches the earlier tenant-boundary pattern.
- Enquiry creation derives customer identity from `context.userId`, checks the target Business is eligible and that the customer is not improperly acting as the target owner, and writes the opportunity/enquiry/notification within a transaction. Received-enquiry access checks active owner membership and lead-management entitlement.
- Campaign reads are scoped to the caller's active Business membership; writes delegate to database functions that accept the authenticated account ID, with membership/management checks in the SQL contract.
- Opportunity creation binds creator to `context.userId`; optional owner Business requires active owner/administrator membership. Participant creation requires opportunity creator or owning Business manager authority, validates target account/business existence and eligibility, and records `created_by=context.userId`. Participant updates are deliberately disabled pending qualified transition authority.
- Support requests bind account ownership to `context.userId`; customer creation/replies require customer role and account ownership, while administrative read/status/reply paths explicitly require admin role.
- Customer and saved-business records are scoped to `context.userId` except explicit admin access. Notification service rejects non-admin attempts to create notifications for another account; repository reads/updates are scoped to the authenticated account.
- Storage routes derive caller identity from `req.authContext`, resolve stored metadata before access/delete, and delegate authorization to tenant-aware storage service. Existing tenant-auth tests cover unauthenticated requests and cross-tenant upload/completion/access/delete denials.
- No confirmed cross-tenant read/write or account-ID substitution vulnerability was found in the sampled routes/repositories.

### Scope caveats / follow-up
- This was a representative sample, not a line-by-line audit of every route and SQL function. The remaining routers (including review, trust-score, category/assignment, business engagement, opportunity requirements, and Connect service endpoints) still need focused checks.
- Some resources intentionally permit broad role-level access in the route registry, with decisive ownership/tenant scoping deferred to service/repository/database layers. Future review should continue tracing the full call chain rather than treating route gates alone as tenant authorization.
- Opportunity participant list visibility is intentionally opportunity-scoped; confirm product/privacy expectations for exposing the other participants on an opportunity to every account/business participant. No unauthorized access was demonstrated, but the policy merits explicit product confirmation.
- Confirm production behavior for database functions, RLS/grants, and storage authorization through approved non-production qualification; this source review does not prove deployed configuration.

### Resume point
Next read-only pass: remaining resource families and Connect service routes, especially review/trust-score, category/assignment, business engagement, opportunity requirements, and any internal Connect adapter that calls multiple services. Preserve the existing access-token revocation caveat and production configuration checks. No code, database, CI, Render, or production changes were made in this pass.


## Remaining resource families and Connect service review (2026-11-03)

Read-only review at candidate SHA `8739b0bf24ef2619f63a14d06a1db3f64138330c`. Inspected review, trust-score, business-category, business-engagement, opportunity-requirements routers/services/repositories, plus Connect service router, assertion/replay, trusted-request context, governed-operation resolution, authorization binding, and opportunity-participant adapter/tests.

### Findings
- Review creation is customer-role gated in the service and records reviewer account from `context.userId`; repository checks target eligibility and writes the review under that identity. Public review reads expose only approved reviews for active, approved Businesses. Moderation is admin-gated and transactional.
- Trust-score public reads filter to active, verified, approved Businesses. Authenticated reads expose public scores plus non-public scores only to active owner/administrator members. Calculation delegates to `ghm.calculate_business_trust_score(account_id, business_id)`; the SQL function's internal authorization still needs separate migration-level confirmation before treating calculation as fully cleared.
- Business-category assignment reads are tenant-scoped; assignment and primary-category changes require owner/administrator membership and active/selectable categories.
- Business-engagement events are attributed to `context.userId` and can only be recorded against an active, verified, approved Business. The current implementation does not require the caller to be a Business member; this appears consistent with customer engagement analytics, but event types/context must remain non-sensitive and rate-limited to prevent analytics spam.
- Opportunity requirements reads are limited to creator, tenant members, or opportunities with authenticated/public visibility. Replacement is restricted to creator or owner/administrator of the owning Business and validates active/selectable capability IDs.
- Connect service endpoint rejects browser-originated requests, verifies short-lived ES256 service assertions, consumes a one-time replay identifier, confirms integration lifecycle is active, resolves an existing Supabase identity mapping without bootstrap, reloads current account status/role, checks the canonical resource registry, and dispatches through capability-specific adapters. Integration principal does not become the end-user principal.
- Connect opportunity-participant adapter checks that authorized resource/capability/operation agree before dispatch. Input parsers use allow-lists and validate IDs/types. Existing tests exercise the route with injected identity/account/assertion/replay dependencies.
- No confirmed cross-tenant access or end-user identity substitution found in these reviewed paths.

### Follow-up / limitations
- Inspect SQL definition and grants for `ghm.calculate_business_trust_score` to confirm caller/business membership checks and runtime execution scope.
- Review all Connect capability adapters and the governed operation map against the resource registry, especially project quotes, quotes, enquiries, and opportunities; this pass inspected the central dispatch and participant adapter but not every adapter implementation in depth.
- Business-engagement event creation has no tenant membership requirement; confirm that all allowed event types and context fields are suitable for any authenticated customer and cannot carry secrets/PII. Add abuse controls if operational telemetry shows spam risk.
- Opportunity requirements deliberately allow authenticated/public opportunity visibility; confirm this matches the intended disclosure policy.
- No runtime or production config verification was performed.

### Resume point
Next: inspect trust-score calculation SQL function/grants, then complete adapter-by-adapter Connect capability authorization and compare all governed capabilities with registered resource operations. Continue read-only. No code, database, CI, Render, or production changes were made.


## Trust-score SQL and Connect capability adapter follow-up (2026-11-03)

Reviewed at candidate SHA `8739b0bf24ef2619f63a14d06a1db3f64138330c`:
- `database/migrations/20260916240000_create_trust_score.sql`
- `database/migrations/20260916250000_extend_business_profile_trust_inputs.sql`
- `src/resources/trust-score/service.ts`, `src/resources/trust-score/repository.ts`
- `src/resources/registry.ts`, `src/integrations/connect/authorization-binding.ts`, `src/integrations/connect/governed-operation-resolution.ts`, `src/integrations/connect/resource-capability-dispatch.ts`
- Connect adapters: business, business-capability, business-offering, customer, enquiry, identity, opportunity, opportunity-participant, project, project-quote, quote and saved-business.

### Trust-score SQL findings
- `ghm.calculate_business_trust_score(bigint,bigint)` is SECURITY DEFINER, owned by `ghm_schema_owner`, pins `search_path = pg_catalog, ghm`, revokes PUBLIC execution and grants execution to `ghm_runtime`.
- It validates positive account/business IDs and independently requires an active owner/administrator membership before calculating/upserting. Direct runtime INSERT/UPDATE/DELETE on `ghm.trust_score` is revoked; SELECT is granted.
- The profile extension explicitly protects `insurance_verified` and `jobs_completed` from direct runtime updates; owner profile updates allow only name/slug/description/phone/email. Review aggregate fields remain separately writable for the review workflow.
- Trust-score repository passes `context.userId` from authenticated context to SQL. Public score queries filter to active, verified, approved Businesses; private score queries additionally allow the active owner/administrator of the relevant Business.
- No SQL privilege escalation or caller-ID substitution was found in the inspected trust-score path. The calculation function checks membership but does not itself require the Business to be active/verified/approved; public visibility is separately filtered in read queries. Confirm whether allowing an owner to calculate an unpublished/inactive Business score is intended.

### Connect adapter findings
- Governed operation resolution admits only operations registered in the canonical resource registry.
- Authorization binding requires a trusted request, exact resource/operation match, mapped Supabase subject (bootstrap disabled), active GHM account, current database role, and role permission for the resource. The integration principal does not replace the mapped end-user account.
- Most inspected adapters check exact capability/resource/operation correspondence before invoking typed services. Several also add role checks (e.g. business offering, project, project quote, enquiry). Underlying services/repositories remain responsible for tenant/object ownership.
- Saved-business dispatch checks exact capability/resource/operation; service methods receive the bound AuthContext.
- Identity adapter is a mapping seam, not a bearer-auth endpoint; bootstrap is an explicit option and is disabled in governed authorization binding.
- Business adapter is a separate provision-or-resolve seam with role and membership checks; it is not itself the generic typed capability dispatcher.
- No confirmed adapter mismatch that bypasses tenant service checks was identified in this sample.

### Remaining adapter / qualification caveats
- This source review does not exhaustively inspect every adapter's tests and every underlying service/repository. Keep adapter-by-adapter comparison against resource registry and object-level service checks as an ongoing review task.
- Trust-score calculation on inactive/unapproved Businesses is a product-policy question, not a demonstrated cross-tenant bypass.
- The broad resource role registry still relies on service/repository/database object checks for tenant isolation.
- Do not infer production grants from migration source alone; confirm only in separately authorized non-production qualification.

### Resume point
Next inspect the remaining Connect adapter implementation/test pairs and underlying object-level services for quote/project/business mutation and lifecycle transitions. Then reconcile the candidate's complete resource registry with every HTTP/Connect operation, documenting unsupported or intentionally disabled operations. Continue read-only; no source, CI, DB, Render or production changes in this pass.


## Connect adapter tests and object-level quote/project service follow-up (2026-11-03)

Read-only review at candidate SHA `8739b0bf24ef2619f63a14d06a1db3f64138330c`. Inspected Connect adapter/test pairs for quote, project quote, project, business, and business capability; inspected quote, project-quote, project, business-capability and business-offering service/repository paths.

### Findings
- Quote adapter verifies exact authorized capability/resource/operation and positive identifiers before calling quote service. Quote creation service/repository binds customer ownership to `context.userId`; repository scopes quote reads/updates to owner account (admin has explicit wider path) and checks customer ownership on creation.
- Project adapter enforces customer role for create/update; project repository scopes records to `context.userId`.
- Project-quote adapter enforces role split: customer for received/read-decision actions, business for own/read-create-update actions. Repository independently checks project ownership or active Business owner membership, validates quote/project association, and performs accept/reject transactionally with project transition. This is a strong layered boundary.
- Business capability writes use tenant transaction and owner/administrator membership; verification transition delegates to a dedicated SQL function. Reads are tenant-context scoped. Customer read dispatch is permitted by adapter and is constrained by service/repository tenant policy.
- Business offering mutations require owner/administrator membership after resolving tenant context; public listing uses a separate public repository query.
- Adapter tests verify capability/resource/operation mismatch fails before service access, role mismatches fail closed, and malformed IDs are rejected. Tests use injected service stubs, so they prove adapter dispatch rules rather than the full production persistence boundary; repository tests/DB qualification remain important.
- Business adapter resolution checks active membership for an existing mapping; provisioning is a separate role-gated transactional path with advisory locking and external mapping.
- No confirmed object-level authorization bypass was identified in these inspected quote/project paths.

### Residual questions
- Quote adapter accepts status and notes updates as separate branches. The repository scopes by quote owner/account and admin, but confirm whether business-role users are intended to update customer-owned quote status/notes and whether status transition rules are enforced consistently (the service currently validates identifier and notes shape but delegates status transition policy to repository). Treat as product/transition-policy verification, not a confirmed vulnerability.
- Business capability read is available to customer context at the adapter layer. Confirm the service/repository only returns fields intended for customer visibility; tenant context currently provides the isolation boundary.
- Continue with customer, enquiry, opportunity, saved-business and business-offering adapter/test pairs plus SQL transition functions. Then produce a complete operation-to-resource matrix; this pass remains sampled, not exhaustive.

### Resume point
Next: inspect remaining Connect adapters and their object-level services, then inspect SQL transition functions for quote/project/capability and verify resource registry parity. Continue read-only; no source, CI, database, Render or production changes were made.


## Remaining Connect adapters and capability-verification SQL (2026-11-03)

Reviewed at candidate SHA `8739b0bf24ef2619f63a14d06a1db3f64138330c`: customer, enquiry, opportunity, saved-business and business-offering Connect adapters and their adapter tests; business-capability repository; and migration `20261003202000_create_business_capability_verification_transition.sql`.

### Adapter findings
- Customer adapter enforces capability/resource/operation equality, validates IDs, and dispatches using the trusted bound AuthContext. Object-level customer ownership/admin restrictions remain in customer services/repositories.
- Enquiry adapter separates customer-owned reads/creation from business received-enquiry reads/updates and requires an explicit enquiry/business ID for each read mode. Service/repository layer remains responsible for membership/ownership.
- Opportunity adapter enforces exact capability/resource/operation and delegates to owned-opportunity service methods; earlier repository review confirmed creator/account scoping.
- Saved-business adapter uses the mapped active GHM account context and passes it to user-scoped service methods.
- Business-offering adapter requires business/admin role and exact capability/resource/operation; service/repository adds tenant manager checks.
- Tests exercise capability mismatch, operation mismatch, role mismatch, malformed IDs and dispatch identity. As before, adapter stub tests validate dispatch rather than DB behavior.
- No confirmed adapter-level cross-tenant bypass found in this pass.

### Business-capability verification SQL: important defense-in-depth gap
- The transition function is SECURITY DEFINER, owned by `ghm_schema_owner`, pins `search_path`, revokes PUBLIC execution, and grants EXECUTE to `ghm_runtime`; direct runtime UPDATE/DELETE is intentionally denied.
- It validates positive capability/verifier IDs, locks the target row, checks expected-state freshness, prohibits self-verification, validates allowed transitions, and requires reasons for rejected/revoked transitions.
- However, the function authorizes the verifier by looking up the caller-supplied `p_verifier_id` and checking only that the stored role is `admin`. It does not independently bind that ID to the current authenticated database principal/session, nor does it check account active status.
- The application repository currently passes `context.userId`, and the HTTP/resource middleware constructs that context from a verified token plus current DB account state. Thus no direct HTTP exploit was established in this source review. But because `ghm_runtime` can execute the SECURITY DEFINER function and supply an arbitrary admin ID, the SQL function's apparent independent authorization check is not a true caller-binding boundary. A compromised/misused runtime DB credential or another call site could impersonate an admin at this function.
- Treat this as a **confirmed database defense-in-depth authorization gap**, not as proof of an exploitable unauthenticated HTTP route. Before relying on SQL as an independent authorization boundary, bind verifier identity to trusted DB session context (or move the transition behind a narrowly controlled DB API whose caller identity cannot be selected by the runtime parameter) and verify active admin status. Any fix requires separate review, migration qualification and explicit authorization; no change was made.

### Resume point
Next inspect other SECURITY DEFINER functions that accept caller/account/verifier IDs and claim to enforce authorization internally, especially quote/project/opportunity lifecycle transitions and administrative moderation. Compare every such parameter to trusted session identity and active account status. Then finish the resource registry ↔ HTTP ↔ Connect operation matrix. Continue read-only; no source, CI, DB, Render or production changes were made.


## SECURITY DEFINER caller-identity parameter audit (2026-11-03)

Continued the read-only SQL review at candidate SHA `8739b0bf24ef2619f63a14d06a1db3f64138330c`. Examined the Business Capability verification transition, campaign create/update functions and reconciliation migration, project quote grants, opportunity core grants, review schema/grants, commercial payment-result boundary, founder bootstrap function, and the relevant application repositories where source paths were available.

### Confirmed pattern beyond Business Capability
- `ghm.create_campaign(p_account_id, p_business_id, p_title)` and `ghm.update_campaign(p_account_id, p_campaign_id, p_title, p_status)` are SECURITY DEFINER, owned by `ghm_schema_owner`, revoke PUBLIC execution and grant execution to `ghm_runtime`.
- Both use caller-supplied `p_account_id` to check active owner/administrator membership. Neither binds that parameter to a trusted session principal nor checks the account's active status as part of the function.
- Application campaign repository passes `context.userId`, so ordinary HTTP callers cannot choose this value through the reviewed service path. But a runtime DB caller can invoke the function with another manager's account ID. This is the same class of database caller-identity gap as the Business Capability verifier function.
- Treat this as a **confirmed database authorization defense-in-depth gap** in both campaign functions. No direct unauthenticated HTTP exploit has been demonstrated.

### Other reviewed SQL boundaries
- Project quote migration grants column-level INSERT/UPDATE (including status) to runtime; the repository/service layer provides the object-level checks and transaction semantics reviewed previously. The inspected transition-privilege reconciliation adds only the underlying project status primitive. This is a different architecture from the SECURITY DEFINER caller-ID functions and needs continued app-level enforcement; do not infer database-enforced identity from grants alone.
- Opportunity core migration grants runtime INSERT/UPDATE on opportunity rows; creator/owner scoping is enforced in application service/repository paths reviewed earlier. No separate SQL transition function was found in that migration.
- Review schema establishes moderator attribution columns and constraints, but the initial review migration itself does not establish a SECURITY DEFINER moderation function. Moderation is application/admin-gated in the reviewed service path.
- Commercial payment-result SECURITY DEFINER function takes provider event/payment attempt data, not a user account/verifier ID. It is a provider integration trust boundary and should be audited separately for who can invoke it and whether the caller is restricted to the trusted provider callback path.
- Founder system-admin bootstrap function is explicitly revoked from both PUBLIC and `ghm_runtime`; it is not an ordinary runtime callable path.

### Important distinction
These findings do not establish that the app's authenticated HTTP paths allow account impersonation: those paths pass verified `context.userId`. They establish that the database functions themselves trust caller-supplied account identity and therefore are not independent identity boundaries when executable by the shared runtime database role. A compromised runtime credential, SQL injection, or unintended internal call site could select another account ID. This should be fixed consistently rather than one function at a time.

### Recommended remediation design (not applied)
- Prefer a transaction-local authenticated principal set by trusted server code on the same checked-out connection (e.g. a validated account ID set with `SET LOCAL` / transaction-local config), with functions reading only that context and rejecting missing/invalid identity. Ensure runtime callers cannot set arbitrary identity through a separate untrusted code path; a custom GUC alone is not cryptographic proof, so its trust derives from the tightly controlled application transaction boundary.
- Alternatively, move sensitive transitions behind narrowly scoped SQL procedures whose identity derives from a verifiable database principal or another non-forgeable credential, and revoke direct runtime execution of the parameterized versions.
- Check active account status and current role inside the function in addition to identity binding.
- Add negative DB qualification proving a runtime caller cannot pass a different administrator/account ID to impersonate them. Include business capability verification and both campaign functions.
- Any remediation requires a new migration, app transaction-context plumbing, test/qualification, and explicit approval. No code or migration change was made.

### Resume point
Next inventory every SECURITY DEFINER function across all migrations, classify by caller type (user, provider, migration/admin), execution grants, identity parameters, and application call site. Prioritize other user-attributed functions such as campaign and verification, then payment-result provider boundary. No CI, DB, Render, or production changes in this pass.


## SECURITY DEFINER inventory — authentication, migration, storage and provider boundaries (2026-11-03)

Read-only inventory continued at candidate SHA `8739b0bf24ef2619f63a14d06a1db3f64138330c`. This pass inspected function definitions and grants in the auth runtime migration, registration and QuoteFlow account provisioning, QuoteFlow reset completion, QuoteFlow Business provisioning, storage persistence, Business Capability verification, campaign functions, and commercial payment-result boundary.

### Classification and findings

**User/account-attributed runtime functions**
- Auth migration exposes multiple SECURITY DEFINER functions to `ghm_runtime` that accept account/session IDs as parameters: `auth_set_password`, `auth_create_session_with_refresh`, `auth_revoke_session`, `auth_revoke_all_sessions_for_account`, `auth_change_password`, `auth_disable_account`, and `auth_issue_recovery`. Some functions are token-bound (e.g. `auth_redeem_recovery`, `auth_rotate_refresh`) or read-only lookup operations.
- These are privileged persistence primitives. Their account/session parameters are not universally bound to a database-authenticated caller inside SQL. The application service is therefore a critical authorization boundary. The source review previously found app-level reset/recovery flows bind target account to a verified recovery token and/or authenticated context, and the route layer derives identity from verified auth state. However, this does not make these SQL functions independently safe against arbitrary use of the shared runtime DB credential.
- `auth_internal_revoke_session_family` and `auth_internal_revoke_all_sessions_for_account` have PUBLIC execution revoked and no explicit `ghm_runtime` grant in this migration; they are internal helpers called by the exposed auth functions.
- `auth_disable_account` and `auth_issue_recovery` are especially sensitive: direct runtime execution can target an arbitrary account ID. Confirm all application call sites and ensure no generic route exposes these primitives without strict account/role policy. Treat them as privileged internal APIs, not self-authorizing database boundaries.

**Migration-only functions**
- `auth_provision_migration_account` is a QuoteFlow migration provisioning primitive; execution grants must remain restricted to the migration role. It is not a normal auth registration function.
- `auth_complete_quoteflow_migration_reset` is token/enrollment-bound and checks active account plus source identity within one transaction; it does not accept caller-supplied account ID.
- `auth_provision_quoteflow_migration_business` is granted to `ghm_schema_owner`, not `ghm_runtime`, and uses source identity / active owner constraints. It remains migration-only.
- Founder system-admin bootstrap is revoked from `PUBLIC` and `ghm_runtime`.
- Standard `auth_create_account` is registration-oriented: role allow-list is customer/business and system-admin is false. Confirm its grant and call sites separately, but no caller-selected privileged role is permitted by the inspected function body.

**Provider boundary**
- `commercial_apply_payment_result` is SECURITY DEFINER and runtime-executable. It accepts provider/payment event data, not an end-user account ID. Its trust boundary is the provider callback/service path and payment-attempt binding, idempotency and event authenticity. It needs a separate call-site audit to ensure arbitrary authenticated users cannot invoke it.

**Storage functions**
- Storage persistence functions inspected are SECURITY INVOKER, not SECURITY DEFINER. Their authority depends on runtime table grants and service-level tenant authorization; they should not be grouped with the SECURITY DEFINER caller-ID issue.

### Review conclusion
- The three previously documented user-attributed functions (Business Capability verifier and campaign create/update) remain confirmed examples where a runtime-executable SECURITY DEFINER function trusts a caller-supplied account ID without binding it to trusted transaction identity.
- The auth runtime migration exposes a broader family of privileged account/session mutation primitives. This is a design-level database trust boundary concern, but the application call sites must be fully traced before classifying individual functions as exploitable. Do not describe every such function as a confirmed vulnerability solely because it accepts an ID.
- This inventory is based on migration source and grants, not live database ACL inspection. Do not infer deployed privileges from source alone.

### Resume point
Next trace every call site of `auth_disable_account`, `auth_issue_recovery`, `auth_set_password`, `auth_change_password`, `auth_create_session_with_refresh`, `auth_revoke_session` and `auth_revoke_all_sessions_for_account`; inspect the payment-result callback call path and all grants for registration/bootstrap. Then inventory remaining SECURITY DEFINER functions across earlier business, review, quote, opportunity, commercial and storage migrations. Continue read-only; no source, CI, DB, Render or production changes.


## Auth privileged-function call sites and commercial provider callback review (2026-11-03)

Read-only review at candidate SHA `8739b0bf24ef2619f63a14d06a1db3f64138330c`. Traced the exposed auth persistence methods through `src/auth/ghm-auth-service.ts`, `src/auth/foundation/persistence.ts`, `src/auth/password-recovery.ts`, `src/auth/password-reset.ts`, `src/http/auth-router.ts`, and reviewed PayFast verification plus the commercial internal router and payment-result SQL boundary.

### Auth call-site findings
- `auth_issue_recovery` is called by the password-recovery service only after normalized-email lookup returns an active account and active password credential. The raw recovery token is delivered through the configured delivery port; the HTTP route returns a generic 202 response, preserving anti-enumeration. The SQL function itself still trusts its supplied account ID and is not an independent authorization boundary.
- Recovery reset redeems a one-time opaque token and obtains account ID from the redeemed credential inside a single DB transaction, then changes the password and revokes all sessions for that derived account. The HTTP reset route accepts token/email/password but no account ID. This is a strong app/transaction binding; email must still match the account in `auth_set_password`.
- `auth_set_password` is used for login-time password rehash and token-derived recovery reset in inspected call paths. The reset call is within the same transaction as redemption and session revocation.
- `auth_create_session_with_refresh` is called after account creation or successful password verification; refresh rotation uses the account ID returned by the persisted refresh credential, not a caller-supplied account ID.
- Logout revokes using the opaque refresh token and persistence-resolved session/account. The exposed `revokeSession(sessionId)`, `revokeAllSessionsForAccount(accountId)`, `changePassword(accountId, keepSessionId,...)`, and `disableAccount(accountId)` persistence methods are privileged primitives. In the inspected HTTP/service files, no ordinary public route was found that accepts a caller-selected session/account ID and calls these methods. `disableAccount` and `changePassword` appear to be currently unused by the reviewed app call paths. This is not a complete repository-wide call-site proof.
- These SQL functions remain executable by the shared runtime role and rely on trusted application call sites. Do not treat them as self-authorizing against a compromised runtime credential.

### Commercial provider callback findings
- PayFast ITN is intentionally unauthenticated at the HTTP layer, but validates the provider source IPv4 allow-list, merchant ID, signed fields using constant-time signature comparison, expected gross amount against the stored payment attempt, provider-side ITN confirmation (must return `VALID`), and provider payment identifier before applying the result.
- The callback resolves the payment attempt from the stored GHM numeric attempt ID and checks payable state before verification. SQL locks the payment attempt/subscription, checks provider-event idempotency and payload hash consistency, and updates transaction/subscription/event records atomically.
- Internal payment preparation and checkout routes require ES256 service assertions, fresh replay IDs, active integration lifecycle and no browser Origin. Payment preparation resolves mapped Supabase identity to current active GHM account state and resolves Business UUID through canonical mapping; it does not accept caller-supplied numeric GHM Business IDs.
- Internal `payment-result` route also requires a fresh assertion and active integration, but the reviewed route does not visibly bind the assertion's integration to a specific payment-result capability/provider scope before invoking the shared provider boundary. This warrants confirmation against assertion claims and integration policy: if every active integration can submit arbitrary payment results, that is a high-impact trust-boundary issue. No exploit is confirmed from the inspected files alone.
- The SQL function `commercial_apply_payment_result` is SECURITY DEFINER and executable by `ghm_runtime`; it validates structure and locks/updates the attempt but does not authenticate the provider or caller. Its safety depends on only trusted callback/service code invoking it. As with auth primitives, the shared runtime credential is a broad trust boundary.

### Residual risks / next actions
1. Complete repository-wide call-site search for `disableAccount`, `changePassword`, `revokeSession`, `revokeAllSessionsForAccount` and all direct SQL function invocations. No complete search result was obtained in this pass.
2. Verify Connect service assertion claims and integration capability policy for internal commercial payment-result; bind provider result submission to an explicit trusted integration/provider permission.
3. Verify Express `trust proxy` configuration for PayFast source-IP validation; `req.ip` is only reliable if proxy trust is configured safely.
4. Add DB qualification proving runtime-role callers cannot impersonate another account for auth/campaign/business-capability functions, and cannot directly apply provider payment results outside approved callback/service boundary. Requires explicit authorization; no tests/migrations run.
5. Confirm deployed grants/config separately; migration source does not prove live database ACLs.

No confirmed public HTTP account impersonation was identified in the auth call paths reviewed. The previously documented SQL caller-identity gaps remain confirmed design weaknesses. No code, CI, database, Render or production changes were made.


## Commercial payment-result permission and PayFast proxy-trust follow-up (2026-11-04)

Read-only review at candidate SHA `8739b0bf24ef2619f63a14d06a1db3f64138330c`. Inspected `src/http/commercial-internal-router.ts`, `src/http/connect-service-router.ts`, `src/integrations/connect/service-assertion.ts`, `src/integrations/connect/integration-lifecycle.ts`, `src/resources/commercial/payfast-http.ts`, `src/resources/commercial/payfast.ts`, `src/config.ts`, `src/http/app.ts`, and available router tests.

### Confirmed payment-result authorization gap
- Connect service assertions contain only `sub` (integration ID), issuer, audience, issued-at, expiry and replay ID. There is no capability/scope claim.
- `/api/v1/internal/commercial/payment-result` verifies the ES256 assertion, consumes the replay ID, and checks only that the integration is active. It then accepts caller-supplied payment attempt ID, provider code, event ID/type, payload hash, status and metadata and calls `applyCommercialPaymentResult`.
- Unlike the ordinary Connect capability router, this route does not resolve a governed operation or check an integration-specific provider/payment-result permission.
- Therefore any integration able to obtain a valid service assertion and remain active appears able to submit a payment result for an arbitrary payment attempt, subject to downstream attempt/provider/idempotency validation. The SQL function itself does not authenticate provider origin. This is a **confirmed route authorization gap in source** unless an external network or key-issuance restriction not represented in this repository makes the route unreachable to other integrations.
- Severity is potentially high because a forged `succeeded` event could affect payment/subscription state. Do not test against shared/production systems. Recommended fix: remove this generic route from ordinary integration assertions; expose a provider-specific callback path (PayFast ITN) or require an explicit provider-scoped permission bound to integration ID and provider code, and validate the payment attempt's provider code matches the authorized provider. Add negative tests for active but unauthorized integrations and mismatched provider/attempt.

### PayFast source-IP and proxy-trust findings
- PayFast ITN derives source IP from `req.ip` then socket remote address. Express `trust proxy` is set centrally from `TRUST_PROXY`.
- `TRUST_PROXY` defaults to false; literal true is deliberately parsed as exactly one trusted hop; explicit numeric hop count is limited to 0–5. This avoids Express's unsafe boolean trust-all mode.
- With default false, the direct socket peer is used and spoofed forwarded headers are ignored. With one-hop trust, correctness depends on the deployed edge proxy overwriting/sanitizing forwarded-for headers. The source code does not prove the deployed Render setting or proxy behavior.
- No code-level trust-all proxy configuration was found. Deployment value and edge behavior remain runtime configuration evidence to obtain separately.

### Other call-site inventory
- Targeted source search found the known privileged auth persistence methods used in auth service/recovery/reset code, but no ordinary public HTTP route was identified that accepts arbitrary account/session IDs for disable/revoke operations. Repository-wide completeness is not proven.
- The internal commercial payment-prepare and checkout routes both accept any active signed integration assertion as an outer service-auth gate; payment preparation then independently binds a mapped active end-user and Business membership in service/repository. Checkout is keyed by stored payment-attempt state. Their integration-specific permission policy still deserves review, but the payment-result operation is materially more sensitive because it can assert settlement outcome.

### Resume point
Next: trace who can mint Connect service assertions and how integration keys/credentials are assigned; inspect integration lifecycle/permission schema and provider onboarding to determine whether all active integrations share one signing authority. Review provider code matching in commercial payment repository/SQL. Then propose a minimal remediation plan for payment-result authorization and the earlier account-ID SQL identity gaps. No source, CI, DB, Render or production changes were made.


## Connect assertion issuance/key custody and payment-result provider binding (2026-11-04)

Follow-up read-only review at candidate SHA `8739b0bf24ef2619f63a14d06a1db3f64138330c`. Inspected service assertion implementation, integration lifecycle migration/repository, commercial internal router, payment-result SQL, provider boundary and route tests.

### Assertion issuance and key custody
- Connect service assertion signing uses the single active `GHM_JWT_ES256_PRIVATE_KEY_PEM` loaded by the GHM service. The signed subject is a caller-supplied `integrationId`; there is no per-integration private key or credential lookup in `createConnectServiceAssertionService.sign()`.
- The integration lifecycle table explicitly describes itself as authoritative integration identity/lifecycle and **not a credential store**. It stores ID, display name and active/disabled/revoked status. Runtime can read lifecycle; lifecycle creation/disable/enable/revoke functions are SECURITY DEFINER with PUBLIC revoked and no runtime EXECUTE grant in the migration.
- The ordinary Connect service router verifies an assertion and then performs replay/lifecycle checks before resolving governed capability and binding mapped end-user context.
- No external HTTP route that mints/signs service assertions was found in the inspected routers. The signing method is a library capability requiring access to the GHM private key; repository source alone does not establish who holds that secret operationally, nor whether another trusted internal service is authorized to request assertions for arbitrary integration IDs.
- Therefore refine the earlier payment-result finding: the route's missing provider/capability authorization is confirmed in source. The exploitability by a third-party integration is **conditional and not yet established**, because issuance and private-key custody are not fully traced. Any component holding the shared private key can create an assertion for any integration subject unless issuance is separately constrained.

### Provider binding in payment-result persistence
- `commercial_apply_payment_result` locks and validates the payment attempt and subscription, but the inspected function does not compare `p_provider_code` to a provider bound to the payment attempt/subscription/price. It trusts caller-supplied provider code to create the provider-event idempotency key and transaction provenance.
- This compounds the route issue: there is no SQL-level binding between payment attempt and provider identity. A caller authorized only for one provider could potentially submit an event labelled as another provider if upstream code does not enforce the association.
- PayFast ITN path independently validates PayFast-specific merchant/signature/amount/confirmation and invokes the same boundary, but the generic internal payment-result route bypasses those PayFast-specific checks.

### Tests and lifecycle
- Current commercial internal router tests cover payment actor mapping and Connect Business mapping; the fetched test file contains no payment-result authorization tests.
- Integration lifecycle state is checked after assertion verification and replay consumption, but lifecycle state is not an operation permission or provider authorization.
- The generic route rejects browser Origin, but that is not a substitute for integration/provider scope authorization.

### Updated risk statement
- **Confirmed source defect:** generic payment-result endpoint lacks operation/provider-specific authorization, and SQL does not bind provider code to payment attempt.
- **Conditional exploitability:** whether an external/less-trusted integration can obtain a valid assertion with a chosen integration subject depends on operational private-key custody and any out-of-repository assertion broker. No such issuance route was found in the reviewed HTTP routers.
- **Impact if reachable:** a valid caller could potentially mark an arbitrary payment attempt succeeded/failed, affecting subscription activation and payment state. No exploit attempt or production interaction performed.

### Remediation direction
1. Remove generic payment-result access from ordinary Connect service assertions, or introduce a separate assertion audience/key with an explicit provider identity and narrowly scoped permission.
2. Bind each payment attempt to an expected provider and enforce exact equality in the SQL boundary; do not trust a caller-selected provider code.
3. Ensure assertion issuance is tied to an authenticated integration credential and allowed scopes; do not let callers choose `sub` freely.
4. Add negative route/DB tests for unauthorized active integrations, provider mismatch, and attempts to mark another provider's payment successful.
5. Keep PayFast ITN on its provider-specific verification path.

### Resume point
Next trace key deployment/secret ownership only through authorized source/config documentation and available repository workflows (do not read secret values), locate any out-of-repository assertion broker references, and inspect all provider/payment-attempt schema constraints. Then assemble a concise prioritized remediation register for payment-result, SQL caller-ID functions and service assertion key custody. No source, CI, DB, Render or production changes were made.


## Assertion key custody, provider schema and prioritized remediation register (2026-11-04)

Read-only follow-up at candidate SHA `8739b0bf24ef2619f63a14d06a1db3f64138330c`. Reviewed the governing Connect service-trust contract, implementation parameters, assertion construction evidence, production readiness gap register, commercial schema, payment-result qualification script and CI workflow.

### Key custody / issuance conclusion
- Governing docs explicitly say deployment-managed credential issuance/rotation and production credentials are deferred; the assertion construction evidence qualifies only the cryptographic primitive, not full service trust or production issuance.
- CI generates an ephemeral P-256 keypair in the runner for isolated qualification and removes the temporary files. This is not evidence of production key custody.
- Repository source has a shared GHM signing key configuration and a signing method that takes an integration subject, but no production credential issuer or HTTP minting endpoint was found in the reviewed routers.
- No secret values were accessed. Repository/workflow inspection cannot establish which deployed service/person holds the production private key or whether an external assertion broker exists. Mark this as an unresolved operational dependency, not a proven compromise.

### Provider-to-attempt schema conclusion
- `ghm.commercial_payment_attempt` has business, subscription, price, initiator, amount, currency, billing interval, checkout reference and state fields; it has **no provider_code/provider_id column or provider foreign key**.
- `commercial_apply_payment_result` accepts provider code independently from the attempt and does not compare it to a provider binding on the attempt/price/subscription.
- Existing idempotency is keyed by (provider_code, external provider event ID), and transaction uniqueness by provider_event_id. This prevents duplicate event application but does not establish that the provider is authorized for the target attempt.
- The runtime qualification script directly invokes the SECURITY DEFINER payment-result function using the runtime connection and a caller-selected `payfast` provider code; it proves function operation under runtime role, not provider authentication or provider-to-attempt authorization.

### Prioritized remediation register (design only; no changes applied)

| Priority | Finding | Required control | Required proof |
|---|---|---|---|
| P0 | Generic internal payment-result accepts any active integration assertion; no provider/capability scope | Remove from general Connect assertion path or require dedicated provider-scoped identity/permission | Unauthorized integration and wrong-provider route tests fail closed |
| P0 | Payment attempt has no expected provider binding; SQL trusts caller provider code | Persist expected provider at attempt/checkout creation and enforce exact provider match in SQL | DB negative test cannot settle attempt with another provider |
| P1 | Business Capability verifier and campaign functions trust caller-supplied account IDs | Bind actor to trusted transaction principal; check active status and role inside DB boundary | Runtime-role impersonation tests fail |
| P1 | Auth persistence exposes privileged account/session mutation functions to shared runtime role | Narrow callable DB surface or prove all call sites transaction-bound and non-user-selectable; split admin-only functions where possible | Repository-wide call-site inventory plus DB negative tests |
| P1 | Shared assertion signing key and arbitrary subject input; issuance/custody not qualified | Establish per-integration credential issuance or tightly controlled broker, scoped subject/permissions, auditable rotation/revocation | Credential issuance/rotation/revocation qualification without exposing keys |
| P2 | PayFast IP check depends on deployed proxy topology | Verify exact Render `TRUST_PROXY` value and edge forwarded-header sanitization | Deployment config evidence and spoofed-forwarded-for test |
| P2 | Commercial provider callback and runtime paths have separate trust assumptions | Keep provider-specific ITN verification separate; ensure no generic route bypasses it | End-to-end sandbox evidence on isolated environment |

### Important qualification distinctions
- The prior payment-result runtime qualification script proves that `ghm_runtime` can execute the function and that the state transition works; it does not test caller/provider authorization. Do not treat it as a security qualification.
- The Connect service-trust contract and readiness register explicitly retain production issuance, full service authorization, payment provider authorization and cutover as open gates. This review is consistent with those existing gates and does not supersede them.
- No production or shared environment was queried. No secret values were read.

### Resume point
Next, produce a concrete remediation proposal with minimal schema/API changes and migration/test plan for P0 payment-result/provider binding, then a separate proposal for P1 SQL actor binding. Do not implement without explicit approval. Obtain deployment key-custody and proxy configuration evidence only through an authorized read-only operational review. No source, CI, DB, Render or production changes were made.


## P0 payment-result remediation proposal (design only; 2026-11-04)

Prepared a minimal implementation proposal after re-reading the exact candidate route, SQL function, payment-attempt schema and runtime qualification script. No implementation or environment action was taken.

### Current vulnerable path
`POST /api/v1/internal/commercial/payment-result` accepts a valid active Connect service assertion and caller-selected `paymentAttemptId`, `providerCode` and transaction status, then invokes `commercial_apply_payment_result`. The SQL function locks the attempt but does not bind `providerCode` to the attempt. The attempt schema currently has no provider field. The runtime qualification script demonstrates that the shared `ghm_runtime` role can directly call this SECURITY DEFINER function with `payfast` and mark its fixture succeeded.

### Proposed minimal safe target
**A. Remove the generic integration settlement path.**
- Remove/unregister `/api/v1/internal/commercial/payment-result` from the ordinary Connect internal router. Do not replace it with a generic route merely adding a broad `payment_result` scope to the existing shared assertion.
- Keep PayFast settlement on the provider-specific ITN route, which performs PayFast source-IP, merchant, signature, amount and PayFast server-confirmation checks.
- If a future provider requires server-to-server callbacks, create a provider-specific adapter/route with a provider-specific credential or assertion audience and a fixed provider identity. Do not let the caller choose `providerCode`.

**B. Bind provider to the payment attempt.**
- Add `provider_code` to `ghm.commercial_payment_attempt` with a strict non-empty allow-list/check constraint (or a provider registry FK if a provider registry is introduced).
- Populate it at the point the attempt is created from server-side commercial provider routing. With the current single PayFast checkout implementation, the initial rollout may assign `payfast` server-side; do not accept it from Connect request JSON. If provider selection is added later, it must be an explicit server-side selection from eligible configured providers.
- For existing rows, backfill only where evidence establishes the provider. Do not blindly label historical rows `payfast`; quarantine/expire unresolved pending attempts or use a documented manual reconciliation. Then enforce NOT NULL.
- Add an index only if query plans/lookup patterns justify it; uniqueness is not needed for provider binding.

**C. Enforce the binding in SQL.**
- In `commercial_apply_payment_result`, after locking the attempt, reject unless `p_provider_code = v_attempt.provider_code` exactly. Reject unsupported provider codes at the schema/function boundary too.
- Preserve event idempotency on (provider_code, provider_event_id), payload-hash conflict behavior, attempt/subscription row locks, and atomic transaction updates.
- Prefer a second, narrower SQL entry point for PayFast (or an internal provider identity argument that cannot be chosen by untrusted request data) if this helps remove caller control over provider identity. The DB comparison is still mandatory.
- Consider revoking direct EXECUTE from `ghm_runtime` and exposing only a narrowly scoped provider-result function to a dedicated DB role. This is a stronger follow-up; it requires connection-pool/role design and should not be mixed into the smallest migration without proving the app can use the role safely.

**D. Make route authorization structurally provider-specific.**
- PayFast ITN has no Connect assertion; its provider verification is the authorization. It should call a PayFast-specific boundary method that fixes provider code internally.
- Do not accept `providerCode` from the ITN payload; PayFast adapter supplies the constant `payfast`.
- Ensure checkout creation verifies the attempt is assigned to PayFast before generating PayFast checkout fields.
- Internal Connect payment-prepare/checkout routes remain service-authenticated; their integration permissions should be reviewed separately, but they must not have settlement authority.

### Migration and rollout sequence
1. Add a forward-only migration adding nullable provider_code, backfill only provable PayFast attempts, and report unresolved rows; do not mutate shared/production DB during this design stage.
2. Update attempt creation and PayFast checkout to persist/check `payfast`.
3. Update SQL function to reject provider mismatch and unsupported provider.
4. Remove generic payment-result HTTP route and its caller-controlled parser/type surface.
5. Update PayFast ITN adapter to submit a fixed provider code through the provider-specific boundary.
6. Add tests and qualification before considering NOT NULL enforcement. In an isolated qualification DB, verify all seeded attempts have an explicit provider; then add NOT NULL/check constraint in a subsequent migration if rollout/backfill evidence is clean.
7. Only after isolated tests and review, plan deployment sequencing; no production/shared migration or deployment is authorised by this proposal.

### Required negative and regression tests
- Active Connect integration assertion cannot submit a payment result (route absent/404).
- PayFast ITN with invalid source IP, merchant, signature, amount or provider confirmation cannot settle.
- Valid PayFast ITN can settle only an attempt whose stored provider is `payfast`.
- Direct SQL invocation with `p_provider_code <> attempt.provider_code` fails before event/transaction/state mutation.
- Unknown provider code fails.
- PayFast checkout rejects an attempt bound to another provider.
- Duplicate same-provider event remains idempotent; same event ID with different payload hash still conflicts.
- Concurrent valid PayFast callbacks produce one transaction and consistent subscription state.
- Qualification proves rollback leaves no event, transaction, attempt or subscription residue.

### Acceptance criteria
- No ordinary Connect service assertion can settle a payment.
- Provider identity is selected by trusted server-side routing and stored on the attempt before checkout.
- Both HTTP/provider adapter and SQL enforce provider-to-attempt match.
- All negative tests above pass on disposable PostgreSQL; CI passes.
- Existing PayFast ITN behavior and idempotency regressions pass.

### Separate P1 work (not bundled)
Do not combine account-ID actor binding for Business Capability/campaign/auth SQL functions with this P0 payment remediation. Design that as a separate transaction-principal change with its own migration, connection-pool implications and negative DB tests.

### Outstanding decision before implementation
Confirm whether the intended initial provider for every newly created paid attempt is PayFast, or whether attempt creation can precede provider choice. This determines whether provider_code can be set at creation or must be set atomically by a server-side provider-selection step before checkout. No code, tests, CI, DB, Render or production changes were made.


## P0 provider-selection decision resolved from current code (2026-11-04)

Follow-up source trace of `PostgresCommercialRepository.prepareCommercialPayment`, `registerCommercialInternalRoutes`, `PayfastHttpBoundary.createCheckout` and `PayfastHttpBoundary.handleItn` resolves the outstanding design question for the current candidate:

- The current payment preparation flow selects an eligible commercial price and creates the payment attempt before checkout. It does not accept or select a provider.
- The only implemented checkout adapter is PayFast: `GET /api/v1/internal/commercial/payfast/checkout/:paymentAttemptId`. The only implemented provider callback is PayFast ITN, which hardcodes `providerCode: 'payfast'` after provider verification.
- Therefore, for the current single-provider implementation, **every newly created payable attempt should be assigned `provider_code = 'payfast'` server-side at attempt creation**. Do not ask the caller or Connect integration to choose it.
- This conclusion is grounded in current repository code, not a claim that every future attempt must always use PayFast. When a second provider is introduced, add an explicit server-side provider-selection step (or separate provider-specific preparation operation) that validates eligibility and atomically persists the selected provider before checkout. Never make the provider a free-form caller-controlled settlement field.
- PayFast checkout should additionally select and assert `a.provider_code = 'payfast'`; ITN should lock/read the attempt and verify the same stored binding before verification/application; SQL remains the final enforcement point.

### Revised P0 migration detail
1. Add nullable `provider_code` to payment attempts.
2. Backfill existing attempts to `payfast` only after checking the current deployment's supported checkout/callback history. Candidate source shows only PayFast checkout and ITN, but this is not proof that all historical deployed rows used PayFast. In an isolated qualification DB, seed/backfill explicit fixtures. For any real rollout, inspect data/read-only evidence and handle unknown rows conservatively.
3. Update payment preparation INSERT and idempotency SELECT/mapping to persist and return `provider_code`; assign constant `payfast` server-side.
4. Update PayFast checkout and ITN queries to require the stored provider equals `payfast`.
5. Update SQL payment-result function to compare caller/provider-bound input to the locked attempt's provider and reject mismatch/unknown values before writes.
6. Remove generic Connect payment-result route and caller-controlled `providerCode` parser/type usage.
7. Once all existing rows are accounted for and qualification proves coverage, enforce NOT NULL and a provider allow-list/check constraint in a follow-up migration.

No implementation, test, CI, DB, Render or production operation was performed. PR #142 remains open and draft.


## P0 PayFast provider-binding implementation branch (2026-11-04)

Implementation started on isolated branch `security/payfast-provider-binding-20261104`, forked from candidate commit `a726c1154b2a8ef127f67589a331ac2dffc6ab00`. This branch is intentionally separate from PR #142 and the integration candidate.

### Implemented in source (not yet CI-qualified)
- Added nullable `provider_code` to `ghm.commercial_payment_attempt` with a check allowing only `payfast` or NULL during the transition.
- Commercial payment preparation now inserts `provider_code = 'payfast'` as a server-side literal, returns/maps the stored provider, and the public input contract does not allow a caller to choose a provider.
- PayFast checkout and ITN now require the stored attempt provider to equal `payfast` before generating checkout or verifying/applying ITN.
- `ghm.commercial_apply_payment_result` now locks the attempt and rejects provider mismatch before creating provider events or mutating subscription/attempt state.
- Removed `POST /api/v1/internal/commercial/payment-result` from the Connect internal router; retained payment preparation, PayFast checkout and provider-specific PayFast ITN.
- Narrowed the TypeScript provider code contract to literal `'payfast'`.
- Added/updated unit fixtures and assertions for provider persistence, ITN provider mismatch, and absence of the generic Connect settlement route.
- Updated `scripts/qualify-commercial-payment-result-runtime.mjs` to probe provider mismatch rejection using a savepoint before the positive settlement fixture.

### Critical residual limitation — not full P0 closure
- The migration deliberately leaves historical `provider_code` values NULL. It does not blindly backfill production rows without data evidence. Such historical attempts will fail closed in PayFast checkout/ITN and payment-result SQL until reconciled. A read-only inventory and documented backfill decision are required before rollout; NOT NULL is deferred to a later migration.
- The migration still grants `EXECUTE` on `commercial_apply_payment_result` to shared `ghm_runtime`. That means any code running with the shared runtime DB credential can still call the function directly and submit a matching `payfast` result without proving PayFast ITN. Removing the generic HTTP route reduces the exposed application surface but **does not close the shared-runtime database trust boundary**.
- Full settlement authorization requires a dedicated provider execution identity/role and separate credential/pool or another DB-verifiable trust mechanism. Do not claim complete P0 security until that is designed, implemented, and qualified. The existing runtime qualification intentionally still demonstrates runtime EXECUTE; that test must be replaced/expanded when dedicated provider role architecture is approved.
- Provider binding is an allow-list of PayFast only. Introducing another provider requires a forward migration and explicit server-side provider selection; do not widen the check constraint casually.

### Validation status
- No local build, unit test, migration application, database qualification, CI run, shared Render check, or production operation has been performed from this branch yet.
- Source edits have been reviewed by fetching the resulting GitHub files, but are not yet considered compile- or runtime-verified.
- The branch should be opened as a draft PR against `integration/ghm-identity-merge-candidate-20261018` for isolated diff/CI review only after final static inspection. It must not be merged until historical row reconciliation and dedicated DB settlement identity are addressed.

### Immediate next tasks
1. Verify exact SQL migration transaction/grants and all changed query/RETURNING columns; inspect complete diff.
2. Finish negative unit tests and run CI on the isolated branch.
3. Design a dedicated provider DB role/pool so `ghm_runtime` cannot directly execute settlement; keep provider credential values out of GitHub/source/logs.
4. Add read-only inventory query for historical attempts and define safe backfill/expiry handling; no shared/production mutation without fresh explicit authorization.


### CI result update — 2026-11-04
- First PR #205 run `41738700625` failed at TypeScript build only: `src/resources/commercial/service.test.ts` fixture lacked required `providerCode`. Database migration/test/qualification steps were skipped due to fail-fast build.
- Added `providerCode: 'payfast'` to that fixture in commit `9634dd9b2628e826dfbea9fdbc32a49e267cecda`.
- Corrected run `41739138801` passed all quality steps on commit `9634dd9b2628e826dfbea9fdbc32a49e267cecda`: build; all migrations on disposable PostgreSQL 18; Business Identity and QuoteFlow migration qualification; full database-backed test suite; migration audit policy tests; runtime boundary verification.
- This is isolated CI evidence only. It does not resolve the known shared `ghm_runtime` direct-EXECUTE settlement trust boundary, nor historical NULL provider_code reconciliation. PR #205 remains draft and must not be merged/treated as production-approved.


## Next P0 trust-boundary design — dedicated provider settlement execution (2026-11-04)

Read-only trace after the green CI run confirms:
- `src/db/pool.ts` creates the application's only PostgreSQL pool from `config.databaseUrl` (`DATABASE_URL`).
- `src/resources/commercial/provider-boundary.ts` defaults to that shared pool and calls `ghm.commercial_apply_payment_result`.
- `src/config.ts` has no separate provider database connection configuration.
- The migration grants the SECURITY DEFINER settlement function to `ghm_runtime`.
- The PayFast ITN route is registered in the same ordinary HTTP application, so merely adding a second pool variable to the same process would not create a strong process/secret boundary: application code running in that process could potentially access the provider credential.

### Preferred architecture to evaluate
Use a **separate provider callback service/process** (or isolated worker) with its own deployment identity and dedicated database login, not a second secret exposed to the general API process.

- General API service: retains `ghm_runtime`; revoke its EXECUTE on the settlement function. It can prepare attempts and create PayFast checkout, but cannot settle.
- Provider callback service: exclusively receives PayFast ITN, validates source IP/merchant/signature/amount/server confirmation, then calls a narrowly scoped SECURITY DEFINER function through a dedicated login (e.g. `ghm_payment_provider`).
- Dedicated login: NOLOGIN owner separation; grant only CONNECT, schema USAGE, and EXECUTE on the one provider-specific settlement function. No direct table DML/SELECT beyond what is strictly required. The SECURITY DEFINER function owner remains `ghm_schema_owner`; its fixed search_path and explicit validation are mandatory.
- Prefer a PayFast-specific SQL function with no caller-supplied provider parameter (it internally binds `payfast`) rather than a generic provider argument. Keep the attempt.provider_code comparison in SQL.
- Do not put the provider DB URL in the general API service's environment. Store it only in the callback service's secret configuration. Keep DB credential creation/rotation in controlled infrastructure operations, not migrations with hard-coded passwords.
- General API's ordinary checkout route may remain service-authenticated, but it must not have access to settlement credentials or settlement function EXECUTE.

### Qualification required for the dedicated identity
- `ghm_runtime` cannot execute either generic or PayFast settlement functions.
- The provider login can execute only the PayFast-specific function; cannot read/write provider event, attempt, transaction, subscription, commercial event, or founding allocation tables directly.
- Ordinary API connection pool cannot invoke settlement even when supplied a forged `providerCode = 'payfast'`.
- Callback service verifies PayFast's full ITN requirements before function invocation; invalid signature/source/merchant/amount/server confirmation never reaches SQL.
- Valid PayFast ITN settles only a stored `provider_code = 'payfast'` attempt.
- Duplicate event idempotency and payload-hash conflict behavior remain intact under concurrent callbacks.
- Credential rotation/revocation and service-to-service ingress restrictions are documented and tested.

### Historical attempts — safe inventory only
The nullable migration intentionally leaves pre-existing attempts NULL. Before backfill, run a strictly read-only inventory against an explicitly approved target and classify:
- count by `attempt_status`, created date, and provider_code;
- pending/unexpired attempts versus expired/terminal attempts;
- any provider event/transaction evidence linked to each attempt;
- checkout/provider history evidence, where available.

Do not backfill every NULL row to PayFast solely because PayFast is currently the only adapter in this candidate. Backfill only rows with trustworthy historical evidence. Unknown pending attempts should be quarantined/expired via a separately approved process; unknown terminal rows can remain NULL if no later callback can validly settle them. NOT NULL should wait until all retained rows have a defensible provider assignment or have been archived/handled.

### Newly identified application edge case to verify
The idempotency replay branch in `preparePayment` reads `provider_code` and maps the existing attempt. A pre-migration attempt replayed by idempotency key may have NULL provider_code; ensure the repository fails closed with an explicit reconciliation conflict instead of returning a runtime null that violates the narrowed TypeScript `'payfast'` contract. Add a regression test before calling the slice fully source-reviewed.

No provider service, second DB login, credentials, deployment, historical-row query, backfill or environment mutation was created or executed. This is an architecture proposal and read-only source trace only.


### Follow-up CI result — idempotency replay guard (2026-11-04)
- Added fail-closed behavior to `prepareCommercialPayment`: if an idempotency-key replay resolves to a historical attempt with `provider_code IS NULL` (or any value other than `payfast`), it throws an explicit provider-reconciliation conflict instead of mapping/returning an invalid provider contract.
- Added a regression test for the NULL-provider replay case.
- CI run [#41739588105](https://github.com/zaidhqdev-sys/GHM/actions/runs/41739588105) passed on head commit `e2637eb1a3f85770013e6a398fcde28f2cc8b590`. The quality job passed build, all migrations on disposable PostgreSQL, Business Identity/QuoteFlow qualification, full DB-backed test suite, migration audit policy tests, and runtime-boundary verification.
- PR #205 remains draft. This success qualifies the code in isolated CI only; it does not resolve the shared `ghm_runtime` settlement EXECUTE grant or historical NULL rows already persisted in any shared/production database.


## Isolated PayFast settlement architecture ADR added (2026-11-04)
- Added `docs/architecture/PAYFAST_ISOLATED_SETTLEMENT_SERVICE_ADR_2026-11-04.md` in commit `90dd3cc4a7e95e8b76adb65842c05c8ad9674058`.
- ADR records the inspected current topology and the target split: general GHM API retains `ghm_runtime` for prepare/checkout; a separately deployed callback process alone receives `PAYFAST_CALLBACK_DATABASE_URL` for `ghm_payment_provider`; callback invokes a PayFast-specific SECURITY DEFINER settlement function with no caller-selected provider argument.
- It specifies role grants/revokes, callback validation, deployment/process separation, negative privilege/callback test matrix, historical-attempt reconciliation, operational prerequisites, and phased delivery.
- ADR is a design proposal only. No callback server/module, DB function/role, secret, Render service, network rule, deployment or data query was created/performed. Existing API remains unchanged.
- Next code task, if continuing: implement the callback service and provider-specific settlement function in a new isolated code PR, with CI-only role provisioning and disposable PostgreSQL qualification. Preserve PR #205 as draft until the runtime grant is removed and both identity paths are proven.
