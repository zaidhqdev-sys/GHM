# GHM Commercial Document Approval Authority Contract

**Status:** IMPLEMENTATION FOUNDATION — NO AUTHORITY ASSIGNED; NO APPROVAL OR CONSENT WRITE API ENABLED  
**Date:** 2026-11-16  
**Scope:** GHM-owned legal-document approval authority and commercial consent evidence  
**Canonical system:** GHM Internal Runtime / `ghm-db`

## 1. Purpose

Separate legal-document approval authority from technical GHM administration. A GHM account having the `admin` role or `is_system_admin` flag does not, by itself, authorize that account to approve commercial legal terms.

The existing commercial consent foundation stores immutable document versions, append-only document lifecycle events and append-only Business consent evidence. This contract adds explicit scoped approval-authority evidence before an approval write path is implemented.

## 2. Authority scope

An immutable authority identity fixes:
- authority identifier (stable UUID shared by grant and revoke events);
- authority account (the person permitted to approve);
- document type (`trial_terms` or `subscription_terms`);
- document key;
- optional jurisdiction country.

A separate event ledger records each grant/revocation against that fixed identity. The recorded-by account identifies the GHM account that recorded the event. The reason, request identifier, timestamp and metadata preserve provenance. Revocation is a new event; historical identity and grant events are never edited or deleted.

A later approval operation must prove all of the following inside one database transaction:
1. The authenticated actor is the same account as the authority account on the cited grant event.
2. The cited event is a grant for the exact document type/key/jurisdiction.
3. The latest event for that authority identifier and scope at approval time is still `granted`; a later revocation makes the grant unusable.
4. The exact immutable document version exists and its document type/key/jurisdiction/plan scope matches the approval operation.
5. The approval event and authority evidence are committed atomically.

The new foreign key and CHECK constraint require every `approved` document status event to cite a grant event. They do not themselves prove the grant is active or actor/scope matched. Only the future governed database write function can enforce those cross-row authorization rules.

## 3. Authority assignment governance

No approver is seeded by this migration. No GHM admin is implicitly designated. The authority ledger is migration-principal-only at this foundation stage; there is no HTTP endpoint, runtime grant, Actor Gateway grant, or application read/write access.

Before any grant is recorded, the owner must explicitly designate the person/account and scope that carries legal approval authority. The controlled grant-recording mechanism must preserve who authorized the assignment and must not allow an ordinary application administrator to self-assign. If the owner has not designated an approver, no legal document can be approved and commercial writes remain unavailable.

## 4. Immutable evidence and access

Migration `20261116160000_add_commercial_document_approval_authority.sql` adds:
- `ghm.commercial_document_approval_authority`, immutable authority principal and document scope;
- `ghm.commercial_document_approval_authority_event`, append-only `granted` / `revoked` events referencing that fixed identity, with recording account, reason, request ID, timestamp and metadata;
- `approval_authority_event_id` on `ghm.commercial_document_status_event`;
- a constraint requiring the authority-event reference for approval events and forbidding it for non-approval lifecycle events;
- UPDATE/DELETE/TRUNCATE rejection triggers;
- explicit grants only to `ghm_migrator`.

No authority rows, legal documents, hashes, approved statuses or consent records are inserted. Runtime, Actor Gateway and PUBLIC privileges are intentionally absent.

## 5. Required next implementation

After this schema foundation is qualified:
1. Define the owner-authorized process for assigning and revoking scoped approvers.
2. Implement a narrowly scoped Actor Gateway/database boundary for authority grant/revoke, with verified actor identity and no caller-supplied authority.
3. Implement the approved-document transition operation that validates current authority, exact document scope and immutable version, then appends the status event.
4. Implement the authenticated consent/payment preparation transaction: canonical GHM actor, active Business owner/administrator membership, approved exact document version, explicit acceptance, unique idempotency, and payment attempt prepared atomically.
5. Add disposable PostgreSQL positive/negative tests for unauthorized admin, wrong approver, wrong document scope, revoked authority, stale grant, mismatched version, replay/idempotency, concurrent revocation/approval, and rollback.
6. Keep Connect commercial writes hidden and preserve `launchAuthorized=false` and `onlineSubscriptionActivation=false`.

## 6. Production boundary

This is a repository migration/test foundation only. CI must apply it to disposable PostgreSQL. It is not authorization to apply the migration to production `ghm_db`, provision authority, grant runtime access, deploy Actor Gateway, configure provider credentials, create payment attempts, or activate commercial services. Production backup, administrator, migration-ledger, Actor Gateway hosting/cost and deployment gates remain independent.


## 7. Owner and assistant boundary — confirmed 2026-11-16

The operating arrangement is the owner and the assistant only. There is no third-party employee, invented reviewer, placeholder approver, or synthetic GHM account.

- The user is the human owner and the intended sole legal approver for ZAID Technologies commercial documents unless the owner explicitly changes that decision.
- The assistant supports drafting, technical review, implementation, qualification and handover maintenance. The assistant is not a natural/legal person, does not possess a GHM account, cannot accept legal responsibility, and must never be recorded as an approver or grantor.
- Any approval-authority record must reference the owner's real, authenticated GHM account identity. Never invent or infer an account ID.
- The owner's authority must be established through a controlled owner-designation mechanism, not merely because an account has a GHM administrator flag.
- Until the real account identity and controlled owner-designation path are verified, do not create authority rows, approve document versions, or expose approval/consent/payment writes.

The next implementation must make the owner-only designation explicit and test denial for every other account. The assistant's technical actions and recommendations are not legal approval.


## 8. Existing founder identity is the owner anchor — no invented account lookup

Repository review found the existing one-time founder bootstrap authority:
- `ghm.founder_system_admin_bootstrap_state` records the canonical founder account ID and designated founder login.
- The controlled bootstrap function only promotes the pre-existing active canonical founder account and records that one-time state.
- This is a stronger owner anchor than selecting an account by display name, email supplied by a request, generic `role='admin'`, or `is_system_admin=true` alone.

The future owner-only authority operation must derive/verify the actor against the singleton founder bootstrap state inside the database transaction, also requiring the founder account to remain active and retain the expected canonical founder identity. It must never accept a target approver account ID from the request. For this project, the only permitted authority account is the account recorded by the founder bootstrap state; no delegation is implemented.

The production presence and account ID in that bootstrap state have not been independently verified through the restricted Render session. Therefore the function must fail closed if the singleton row is absent, ambiguous, or inconsistent. This avoids asking the owner to supply an account ID and avoids inventing one.


## 9. Founder-only grant/revoke database operation — qualification in progress

Migration `20261116170000_add_founder_only_commercial_document_authority_gateway.sql` introduces the database-side grant/revoke operation.

- No request-supplied approver/target account ID exists. The authority account is always the authenticated actor, and the function requires that actor to equal the singleton founder bootstrap account.
- The operation verifies the canonical founder login and exactly one matching credential, plus active account status and system-admin state. Missing or inconsistent founder bootstrap state fails closed.
- The database call is restricted to `session_user='ghm_actor_gateway'` and a one-use HMAC assertion with operation name `commercial.document.authority.manage`, exact JSON context, timestamp and nonce.
- Grant/revoke is serialized by exact owner/document/jurisdiction scope. A repeated grant or revoke without a current grant is rejected.
- The authority scope has a unique NULLS NOT DISTINCT index to avoid duplicate identities when jurisdiction is NULL.
- Only the Actor Gateway principal receives EXECUTE; no direct table grants or runtime/PUBLIC access are added.

This branch currently adds the SQL boundary and migration contract test. It does not yet wire the HTTP route, TypeScript reader, or signer integration. Until that integration and exact-head CI pass, the function is not exposed through an application route. No authority row or approved document is seeded.


## 10. Founder-only grant/revoke qualification result — 2026-11-16

The database-side owner authority operation passed exact-head CI on code commit `174d10aece78ceacdecdfe8d701f1bcaff1256b2`:
- Workflow run `43902840161`: `quality` and `web-quality` both succeeded.
- All repository migrations applied to disposable PostgreSQL.
- The isolated Actor Gateway principal qualification exercised successful founder grant, revoke and re-grant; duplicate grant/revoke denial; non-founder denial; forged, scope-transplanted, replayed and expired assertion denial.
- The test founder bootstrap/account/credential fixture and authority writes were isolated to disposable PostgreSQL and rolled back/cleaned up.
- The exact Actor Gateway function allow-list and no-direct-table-access boundary passed.

The PR adds only the SQL boundary, ACL allow-list entries, migration contract and disposable qualification. The HTTP route/reader is intentionally not yet wired. No authority row is present in production, and no document is approved. Next slice is the authenticated Actor Gateway HTTP/TypeScript integration with strict request validation and tests, followed by the separate governed document-approval transition. Production backup, migration-ledger, gateway hosting/cost and service deployment gates remain unchanged.


## 11. Authenticated Actor Gateway owner route — qualification in progress

The next integration slice adds `POST /v1/owner/commercial-document-approval-authority`.

- ES256 bearer middleware supplies the actor account from the verified token. The body cannot specify an actor or approver account.
- Strict request validation permits only action, document type/key, jurisdiction country ID and reason.
- The TypeScript reader creates the one-use HMAC assertion using the configured gateway secret and binds it to the exact operation payload.
- The database function remains the authorization authority: it checks the gateway session, assertion, founder bootstrap singleton, active founder account and canonical active founder credential.
- The route returns only the authority identifier, event identifier and resulting event type; it does not disclose the founder account ID or login.
- Authorization denial is 403, invalid input is 400, duplicate/invalid transition is 409, and internal failure is 503 without SQL detail leakage.

This is still only an owner authority grant/revoke route. It does not approve a document version. The separate approval transition must validate the latest grant event, actor equality, document type/key/jurisdiction/plan and immutable version before appending an approved status event. No production deployment or write has been performed.


### 11.1 Owner authority HTTP/TypeScript qualification passed (2026-11-16)

PR #291 exact code head `13923a1c538ce23aacd491d65f5bca65bbbe8c85` passed workflow `43905417391` (`quality` and `web-quality`).
The route and reader tests verify ES256 actor derivation, strict request shape, HMAC context binding, transaction commit/rollback, forbidden founder checks and conflict handling. This remains an authenticated grant/revoke route only; it does not approve a legal document version. No production deployment or authority write occurred.


## 12. Exact immutable document-version approval transition — qualification in progress

Migration `20261116180000_add_founder_only_commercial_document_approval_transition.sql` adds a distinct approval operation:

- HMAC operation `commercial.document.status.approve`, separate from authority grant/revoke.
- Canonical founder bootstrap/account/credential checks are repeated at approval time.
- Assertion context binds one exact immutable document-version ID and reason.
- The function serializes against grant/revoke using the same advisory-lock scope.
- It requires the exact founder authority identity, latest authority event `granted`, and latest status event `draft`.
- It appends the approved status event with the authenticated founder actor and exact grant-event ID/type atomically.
- Only Actor Gateway EXECUTE is granted; no direct table access is added.

The disposable qualification uses synthetic immutable version/draft fixtures and rolls back all grant/revoke/approved events. No real legal document, production approval, consent or payment is created. A future HTTP route/reader must derive actor only from ES256 bearer identity and call this transition. The owner must still provide and inspect the actual legal document before any production version is registered or approved.


### 12.1 Exact document approval transition qualification passed (2026-11-16)

PR #292 code head `0e9c4fe1ebb59054b17c15ab6af28348e2ac6bde` passed workflow `43908611434` (`quality` and `web-quality`). Disposable PostgreSQL verified exact-version approval under a current grant, denial after revocation, approval after re-grant, duplicate approval denial, wrong-scope denial, non-founder denial, forged/context-transplanted/replayed/expired assertion denial. Synthetic immutable draft fixtures remain only in ephemeral CI; grant/revoke/approval events were rolled back. No production legal document or approval was created.


## 12. Founder-only exact document approval route — implementation in progress (2026-11-16)

PR #292 has merged the database transition and its disposable behavioral qualification. The next bounded branch wires that already-qualified operation through the authenticated Actor Gateway:

- Route: `POST /v1/owner/commercial-document-approval`.
- The only request fields are `documentVersionId` and `reason`; caller-supplied actor/approver fields and extra fields are rejected.
- Actor identity is derived only from the verified ES256 bearer token.
- The TypeScript reader signs operation `commercial.document.status.approve`, binding the exact immutable version ID and reason, then calls `ghm.gateway_approve_commercial_document_version` inside a transaction.
- The database rechecks canonical founder identity, active account/credential, one-use assertion, current scoped grant, exact version and latest draft state.
- Success returns status-event ID, document-version ID, authority-event ID and `approved`; denial, conflict and missing-version responses are mapped without exposing SQL details.

The route is source code only pending exact-head CI. It is not deployed or callable in production. No owner authority has been assigned, no legal document has been registered or approved, and no consent/payment write has occurred. The existing founder-only database operation has only been exercised using synthetic fixtures in disposable CI.

The human approver remains the owner alone. The assistant is the technical implementation/review partner, not a person, employee, approver, or legal signatory. No ghost reviewer is to be added.


## 13. GHM-native explicit consent and payment preparation — database boundary in progress (2026-11-16)

The next database operation is `ghm.gateway_prepare_commercial_payment_with_consent`, exposed only to the restricted Actor Gateway principal.

It performs one transaction that:
1. Verifies a one-use, short-lived Actor Gateway HMAC assertion bound to the exact Business, immutable document version, pricing country, idempotency key, server-selected provider code, explicit acceptance, expiry and request ID.
2. Revalidates the actor's active GHM account and locks an active owner/administrator membership for the canonical Business.
3. Locks the current Business subscription and selects an effective active price for its plan version and exact country.
4. Requires the supplied immutable document version to be `subscription_terms`, match the plan (or be plan-neutral), match the pricing jurisdiction (or be global), and have a latest lifecycle event of `approved`.
5. Inserts the payment attempt, append-only `commercial_consent_event`, and `subscription_payment_prepared` commercial event atomically.
6. Uses a per-idempotency advisory lock. A retry returns only the original attempt plus its exact consent event when Business, actor, document version, country and provider match. A reused key with different evidence conflicts.

The database operation does not call a provider, create a checkout redirect, settle a payment, or activate a subscription. Provider code remains server-selected and provider-neutral; the Actor Gateway must validate that the configured adapter is actually installed before calling the function. No browser field chooses a provider.

Qualification uses only synthetic disposable Business/plan/price/subscription/document fixtures. The approved synthetic document is approved inside the same disposable test transaction; all grant, approval, consent, payment-attempt and commercial-event writes are rolled back. Immutable synthetic draft/version fixtures may remain in the ephemeral CI database. No legal document, hash, approval, authority assignment, consent, or payment attempt is created in production.

The operation is not yet wired to an HTTP route. Any future route must derive actor identity from ES256 bearer authentication, require explicit customer acceptance, preserve the separate commercial launch freeze, and remain unavailable until the owner supplies and approves the real legal document and the production/hosting gates are cleared. Existing legacy internal payment preparation remains a separate Supabase-mapped path and must not be treated as the approved native path.
