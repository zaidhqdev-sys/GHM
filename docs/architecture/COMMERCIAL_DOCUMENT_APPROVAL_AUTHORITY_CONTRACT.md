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
