# GHM Support Request Operation Contract

**Status:** CONSTRUCTION AUTHORIZED — operation contract frozen 2026-09-16

## 1. Purpose

Define the provider-neutral operation boundary for the production-backed Zaid Connect Support Request capability.

Canonical resources:

```text
support_request
support_request_message
```

Canonical relations:

```text
ghm.support_request
ghm.support_request_message
```

A Support Request is a customer-to-support case with an attached conversation. The request and its conversation are separate resources with an explicit relationship.

## 2. Production source authority

The production Connect source exposes `support_requests` through typed database contracts and the support request UI/service. The conversation boundary is established by:

```text
zaid-connect/supabase/migrations/20260830120000_establish_support_conversations.sql
```

The production typed schema establishes the Support Request shape and RPC surface, including create, customer listing, administrator listing, message reads, customer/admin replies, and administrator lifecycle mutation.

## 3. Support Request shape

Canonical fields:

```text
id
requester_id
business_id
category
subject
description
priority
status
resolution_summary
resolved_at
closed_at
created_at
updated_at
```

`requester_id` identifies the customer/account that owns the request. `business_id` is optional and, when supplied by the customer, must be a Business the customer is authorized to associate with.

Production status vocabulary is exactly:

```text
open
in_progress
resolved
closed
```

The production create RPC does not accept priority as an input; priority therefore remains server-controlled in this initial GHM boundary. No caller-supplied priority mutation is authorized.

## 4. Initial operations

The source-backed operation surface is:

| Operation | Purpose |
|---|---|
| `create` | Customer creates a Support Request, optionally associated with an authorized Business. |
| `read` | Customer reads an owned request; administrator reads support requests. |
| `list` | Customer lists own requests; administrator lists requests with optional status/limit filters. |
| `updateStatus` | Administrator changes Support Request lifecycle status. |

There is no delete operation.

There is no arbitrary patch operation.

## 5. Customer authorization

The authenticated customer is the owner of the request.

Customer create must derive `requester_id` from authenticated context rather than accepting an arbitrary requester identity.

Customer read/list scope is restricted to requests where:

```text
requester_id = authenticated_account
```

A customer may not read, list, or mutate another customer's Support Request.

## 6. Business association

A customer may optionally associate a Support Request with a Business.

Production creation checks Business membership before accepting the association. GHM must preserve this boundary:

```text
business_id is null
OR
authenticated requester is an authorized member of business_id
```

GHM must not infer Business ownership from arbitrary caller input.

## 7. Validation

Production UI/service validation establishes:

- subject: trimmed, 3–160 characters;
- description: trimmed, 10–4000 characters;
- category: one of the product-supported support categories;
- reply body: trimmed, 1–4000 characters;
- resolution summary: trimmed, 1–2000 characters when supplied for resolved/closed lifecycle state.

The source-supported category vocabulary is:

```text
account
business
directory
marketplace
workspace
trial_and_commercial
technical
other
```

The database must retain server-side validation rather than relying only on UI checks.

## 8. Lifecycle status

Administrator lifecycle status is exactly:

```text
open
in_progress
resolved
closed
```

Administrator status mutation is the only lifecycle mutation in the initial contract.

For `resolved` and `closed`, the resolution summary may be supplied and is persisted as the resolution explanation. Resolution/closure timestamps are server-controlled.

A customer reply to an owned request reopens the request to `open` and clears resolution/closure state.

An administrator reply to a resolved or closed request moves it to `in_progress` and clears resolution/closure state.

## 9. Conversation message resource

Canonical fields:

```text
id
support_request_id
sender_id
sender_kind
body
created_at
```

`sender_kind` is exactly:

```text
customer
admin
```

Sender kind is assigned only by trusted operation logic. It is not caller-controlled.

Messages are ordered by `created_at` then `id` ascending for conversation history.

## 10. Message operations

The source-backed operation surface is:

```text
readMessages
replyAsCustomer
replyAsAdmin
```

Customer message reads are restricted to the customer's own Support Request.

Administrator message reads are restricted to administrators.

Customer replies must use the authenticated requester as sender and `customer` as sender kind.

Administrator replies must use the authenticated administrator as sender and `admin` as sender kind.

There is no message update operation.

There is no message delete operation.

## 11. Atomic create behavior

Creating a Support Request creates its initial customer conversation message from the request description in the same source-backed operation.

The GHM implementation must preserve this atomic relationship: a successfully created Support Request has its initial customer message; a failed message insert must not leave an orphan Support Request.

## 12. Runtime privilege boundary

GHM runtime access must follow the established runtime/migrator separation.

Runtime access must be limited to the columns and operations required by the qualified Support Request repository/service boundary.

No runtime DELETE privilege is authorized.

No runtime privilege should be broadened merely to make tests pass.

## 13. Provider boundary

The GHM resource must not depend on:

- Supabase RLS;
- `auth.uid()`;
- Supabase security-definer implementation details;
- realtime transport;
- email/SMS/WhatsApp delivery;
- browser push;
- mobile push;
- external ticketing providers.

Authentication is supplied by GHM `AuthContext`; authorization is enforced by the repository/service boundary and runtime database privileges.

## 14. Qualification requirements

Qualification must independently demonstrate:

1. exact Support Request schema and constraints;
2. runtime identity/migrator identity separation;
3. runtime privilege boundary;
4. authenticated requester binding;
5. customer create;
6. unauthorized requester substitution denial;
7. authorized Business association;
8. unauthorized Business association denial;
9. customer own read/list isolation;
10. administrator read/list access;
11. status vocabulary enforcement;
12. administrator-only lifecycle mutation;
13. resolution/closure timestamp behavior;
14. customer reply ownership enforcement;
15. administrator reply authorization;
16. sender-kind integrity;
17. message ownership isolation;
18. atomic initial request/message creation;
19. arbitrary update denial;
20. delete denial;
21. persisted-state reconciliation through governed cleanup authority.

## 15. Construction order

```text
migration
  -> repository
  -> service
  -> registry
  -> tests / qualification
  -> runtime privilege qualification
```

No public HTTP route is authorized merely because the resource is registered.

## 16. Explicit exclusions

The following are outside this initial capability:

- attachments;
- file uploads;
- SLA timers;
- escalation workflows;
- assignment to individual support agents;
- email/SMS/WhatsApp delivery;
- push delivery;
- external helpdesk synchronization;
- canned responses;
- support macros;
- customer satisfaction surveys;
- ticket deletion;
- message deletion/editing;
- generic event bus integration.
