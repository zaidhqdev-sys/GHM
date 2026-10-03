# QuoteFlow Notification Reconciliation

**Status: RECONCILIATION COMPLETE — NO GHM NOTIFICATION ADAPTER AUTHORIZED**

## Evidence

QuoteFlow follow-up reminders are implemented through Expo local notification APIs. The current implementation:

- requests device notification permission;
- creates a local Android follow-up channel;
- schedules notifications on-device;
- stores the scheduled notification identifier with the local Quote;
- cancels scheduled reminders locally;
- embeds the local QuoteFlow `quoteId` in notification data;
- handles notification responses on-device.

No server-side notification delivery, push-token persistence, notification table, Realtime channel, notification RPC, or notification webhook is established by this current feature.

## Reconciliation result

QuoteFlow's current follow-up reminder capability is a device-local product feature.

It must not be converted into a GHM Notification resource merely because GHM already has a Notification HTTP/resource boundary. The current QuoteFlow implementation does not establish server-side notification ownership or a requirement for cross-device delivery.

The local QuoteFlow `quoteId` also cannot be treated as a GHM Quote identifier because the QuoteFlow → GHM Quote mapping remains unqualified.

**QuoteFlow local follow-up notifications → GHM: NOT YET AUTHORIZED.**

## What is not authorized

Do not:

- create GHM notification records for current local reminders;
- store QuoteFlow device push tokens in GHM;
- introduce Realtime subscriptions or notification webhooks;
- map local notification `quoteId` values to GHM Quote IDs;
- replace local scheduling with server-side delivery;
- migrate existing scheduled reminders;
- build a notification adapter;
- introduce production routing, shadow traffic, or cutover.

## Required future authority

A server-authoritative notification system would require a separate contract covering:

- notification ownership and purpose;
- event source and canonical Quote identity;
- delivery channels;
- device/token ownership and lifecycle;
- user consent and permission state;
- scheduling/time-zone semantics;
- deduplication and idempotency;
- retry/failure behavior;
- cancellation and lifecycle;
- privacy/content rules;
- multi-device behavior;
- auditability, recovery, migration, shadow qualification, rollback, and cutover.

## Construction conclusion

Keep the current QuoteFlow follow-up reminder capability device-local.

This reconciliation changes no application logic, database schema, provider configuration, production routing, shadow traffic, or cutover.
