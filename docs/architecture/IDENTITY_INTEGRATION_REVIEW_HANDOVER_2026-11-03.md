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
