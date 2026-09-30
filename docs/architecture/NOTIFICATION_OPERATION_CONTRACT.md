# GHM Notification Operation Contract

**Status:** CONSTRUCTION AUTHORIZED — operation contract frozen 2026-09-16

## 1. Purpose

Define the narrow provider-neutral operation boundary for the production-backed Zaid Connect Notification capability.

Canonical resource:

```text
notification
```

Canonical relation:

```text
ghm.notification
```

This resource represents user-facing notification records. It is not a domain-event store, event bus, broker, replay system, or generic message transport.

## 2. Production source authority

The source capability is established by Zaid Connect's production migration:

```text
zaid-connect/supabase/migrations/20260718202200_establish_notifications_contract.sql
```

Production behavior also exists through the notification service and notification hook, including user-scoped reads, read-state mutations, and realtime INSERT subscription.

The Connect event specification explicitly states that notification records are user-facing messages/state changes and are not automatically durable domain events. Realtime and browser push delivery therefore remain outside this GHM resource contract.

## 3. Initial operations

The source-backed operation surface is:

| Operation | Purpose |
|---|---|
| `read` | Read notifications belonging to the authenticated account/user. |
| `create` | Create an authorized notification for a recipient. |
| `markRead` | Mark one recipient-owned notification as read. |
| `markAllRead` | Mark all unread notifications for the authenticated recipient as read. |

There is no delete operation.

There is no arbitrary notification update operation.

There is no bulk create operation in this initial contract.

There is no generic event-publishing operation.

## 4. Canonical notification types

The authoritative production notification contract permits exactly:

```text
system
lead
verification
project
quote
message
```

GHM must not add `payment`, `review`, or any other type without new source evidence and a separately reconciled contract change.

An older consolidated Connect schema contains `payment` and `review`, and older PayFast paths attempt direct `payment` inserts. Those paths conflict with the later production notification contract and therefore are not authoritative evidence for the GHM type vocabulary.

## 5. Notification shape

Canonical fields are:

```text
id
user_id
type
title
body
metadata
is_read
read_at
created_at
```

The GHM model may use provider-neutral names where the existing GHM identity convention requires them, but recipient ownership must remain explicit and canonical.

Constraints established by production are:

- recipient is required;
- type is required and must use the exact canonical vocabulary;
- title, after trimming, must contain 1–160 characters;
- body, after trimming, must contain 1–2000 characters;
- metadata defaults to an empty JSON object;
- metadata must be a JSON object;
- unread notifications have `read_at = null`;
- read notifications have `read_at` populated.

`created_at` is server-controlled.

## 6. Read authorization

A caller may read only notifications belonging to the authenticated recipient/account scope.

The production source uses an own-notification predicate equivalent to:

```text
notification.user_id = authenticated_user_id
```

GHM must not permit an arbitrary recipient identifier to expand read authority.

A missing or inaccessible notification must not disclose another user's notification existence.

## 7. Create authorization

Conceptual signature:

```text
createNotification(context, input) -> Notification
```

The production creation function establishes these authorization paths:

1. self-notification: recipient is the authenticated caller;
2. administrative notification: authenticated caller has the production admin role;
3. authorized lead notification: for a `lead` notification, the caller is the lead customer and the recipient is the owner of the business attached to that lead, with optional `business_id` metadata required to agree with the lead when supplied.

GHM must preserve the source-backed authorization boundary without copying Supabase `auth.uid()`, RLS, or security-definer implementation details into the provider-neutral contract.

Recipient existence must be validated before creation.

The service must derive the authenticated actor from `AuthContext`; caller-supplied actor identity must not override authenticated context.

## 8. Lead-specific authorization

`lead` notifications have an additional source-backed relationship check when lead metadata identifies a lead.

The authorized relationship is:

```text
caller = lead.customer
recipient = owner of lead.business
```

If `metadata.business_id` is supplied, it must identify the same business as the lead.

GHM must not generalize this relationship rule to unrelated notification types without production evidence.

## 9. Mark one read

Conceptual signature:

```text
markNotificationRead(context, notificationId) -> Notification
```

The operation may mutate only the authenticated recipient's notification.

The resulting state is:

```text
is_read = true
read_at = existing read_at OR current server timestamp
```

Calling the operation on another user's notification must not succeed.

The operation must not modify type, title, body, metadata, recipient, or creation timestamp.

## 10. Mark all read

Conceptual signature:

```text
markAllNotificationsRead(context) -> integer
```

The operation targets only unread notifications belonging to the authenticated recipient.

Each affected row becomes:

```text
is_read = true
read_at = existing read_at OR current server timestamp
```

The operation returns the number of rows updated, matching the production source behavior.

## 11. No arbitrary update

The initial Notification resource must not expose a generic patch surface.

Forbidden mutations include:

```text
id
user_id / recipient_id
type
title
body
metadata
created_at
```

Read state is changed only through the dedicated `markRead` and `markAllRead` operations.

## 12. Delivery boundary

The following are explicitly outside the GHM Notification resource:

- Supabase Realtime;
- browser Web Push;
- service workers;
- browser permission prompts;
- device notification APIs;
- notification scheduling;
- delivery-provider credentials;
- event brokers;
- durable event replay;
- generic event envelopes.

A downstream product adapter may consume GHM notification state and provide delivery through an appropriate provider. GHM must not make a delivery provider a domain dependency.

## 13. Event architecture boundary

Zaid Connect's approved event specification states that no canonical internal event transport is currently implemented.

Accordingly:

- a Notification row is not a domain event;
- Notification creation must not imply an event-bus architecture;
- GHM must not create a generic event store as part of Notification construction;
- future event infrastructure requires its own architecture decision and contract.

## 14. Repository guidance

The provider-neutral repository surface should follow the existing GHM layering pattern, conceptually:

```text
createNotification(context, input)
getNotification(context, notificationId)
listNotifications(context, options)
markNotificationRead(context, notificationId)
markAllNotificationsRead(context)
```

The exact list operation shape may preserve the production ordering and limit semantics without exposing provider-specific query syntax.

Production reads order notifications newest first and the current application requests a default limit of 30. Any GHM limit default must remain source-backed rather than becoming an arbitrary business rule.

## 15. Validation and stable errors

At minimum, qualification must establish stable behavior for:

- authentication required;
- recipient required;
- recipient not found;
- unsupported notification type;
- title length violation;
- body length violation;
- metadata must be a JSON object;
- unauthorized creation;
- unauthorized read;
- unauthorized mark-read;
- read-state invariant;
- unsupported arbitrary update;
- duplicate or concurrency behavior if a future uniqueness rule is introduced.

No uniqueness rule for notification content is authorized by the current production source. GHM must not invent one.

## 16. Transaction boundary

Single-row Notification creation is one atomic database operation.

Read-state mutations must be atomic database updates scoped to the authenticated recipient.

No cross-resource transaction is authorized by this initial Notification contract beyond the source-backed lead authorization lookup required to authorize a `lead` notification.

Future workflows that create notifications as a consequence of another domain mutation must define their own cross-resource transaction boundary rather than assuming Notification construction authorizes that workflow.

## 17. Runtime privilege boundary

GHM runtime access must follow the established runtime/migrator separation.

Runtime application access must be limited to the operations required by the qualified Notification repository/service boundary. Schema creation, destructive cleanup, migration ledger operations, and broader administrative authority remain outside the runtime role.

The exact PostgreSQL grants must be qualified against the implementation and must not be broadened merely to make tests pass.

## 18. Qualification requirements

Before Notification construction is marked complete, qualification must independently demonstrate:

1. schema presence and exact core constraints;
2. runtime identity and migrator identity separation;
3. runtime privilege boundary;
4. recipient ownership/read isolation;
5. authorized self creation;
6. authorized admin creation if retained in the GHM identity model;
7. lead-specific authorization;
8. unauthorized creation denial;
9. type vocabulary enforcement;
10. title/body validation;
11. metadata-object validation;
12. mark-one-read ownership enforcement;
13. mark-all-read ownership enforcement;
14. read-state persistence and reconciliation;
15. arbitrary-update rejection;
16. rollback behavior where a multi-step repository transaction is introduced;
17. final persisted-state reconciliation through governed cleanup authority.

Only after these checks pass may the Notification capability be marked QUALIFIED / CLOSED.

## 19. Construction boundary

Construction order is:

```text
migration
  -> repository
  -> service
  -> registry
  -> tests / qualification
  -> runtime privilege qualification
```

No public HTTP route is authorized by this contract merely because the resource is registered.

## 20. Explicit exclusions

The following remain outside this capability until independently sourced and contracted:

- notification preferences;
- notification retention/anonymisation;
- notification deletion;
- email delivery;
- SMS delivery;
- WhatsApp delivery;
- browser push delivery;
- mobile push delivery;
- scheduling;
- digest/batching;
- rate limiting;
- anti-spam policy;
- event bus / event store;
- generic cross-resource notification workflow orchestration.
