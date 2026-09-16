# GHM Quote Operation Contract

**Status:** CONSTRUCTION CONTRACT — OPERATION SURFACE FROZEN

## 1. Purpose

Define the narrow provider-neutral operation boundary for the QuoteFlow Quote capability.

Canonical resource:

```text
quote
```

Canonical relation:

```text
ghm.quote
```

This contract is distinct from `project_quote`.

## 2. Initial operations

The source-backed operation surface is:

| Operation | Purpose |
|---|---|
| `read` | Read Quotes owned by the authenticated account/organization. |
| `create` | Create a Quote for an active registered Customer. |
| `update` | Mutate only source-backed Quote state: status or notes. |

There is no Quote delete operation.

There is no customer reassignment operation.

There is no arbitrary Quote field-edit operation.

There is no Invoice operation in this contract.

## 3. Ownership authorization

The Quote owner is derived from the authenticated GHM identity context and the active organization/account boundary.

A caller must not supply an independent owner identity that overrides authenticated context.

The implementation must use the existing GHM account/organization identity architecture and must not equate Quote ownership with Business membership merely because the generic authorization registry contains a `quote` resource vocabulary.

## 4. Customer authorization

Quote creation requires an active Customer belonging to the same Quote owner/account scope.

The service must resolve the Customer inside the authorized transaction boundary before inserting the Quote.

The caller must not supply customer snapshot values as independent authority fields. The service derives:

- customer name;
- customer phone;
- customer email

from the selected active Customer and persists those values as Quote snapshots.

Customer reassignment is not supported by the initial operation contract.

## 5. Create operation

Conceptual signature:

```text
createQuote(context, input) -> Quote
```

Input contains only creation-authorized values:

```text
customerId
lineItems
afollowUpDate
```

The implementation derives:

```text
customerName
customerPhone
customerEmail
description
amount
status = active
reminderId = null or application-produced value
reminderDate = null or application-produced value
notes = ''
createdAt
updatedAt
```

The exact external application reminder adapter is outside GHM. GHM persistence may store the product-level reminder metadata when explicitly supplied by a trusted adapter, but the domain service must not invoke a device notification provider.

Creation must be atomic across the Quote row and all line items.

## 6. Line-item validation

Every submitted line item must satisfy:

- non-empty trimmed description;
- finite quantity > 0;
- finite unit price > 0.

At least one valid line item is required.

The Quote amount is calculated from the line-item subtotal rather than accepted as a caller-controlled independent total.

The Quote description is derived from line-item descriptions joined with `, `.

The implementation must preserve the production Quote arithmetic semantics. It must not silently apply the separate invoice rounding implementation.

## 7. Follow-up validation

`followUpDate` is required and must represent a valid calendar date corresponding to the production `YYYY-MM-DD` contract.

The database stores this as a date value; presentation formatting remains outside the resource.

## 8. Read operation

Conceptual signatures:

```text
getQuote(context, quoteId) -> Quote | null
listQuotes(context) -> Quote[]
```

Reads are owner-scoped.

An authenticated context must never read another owner's Quote or Quote line items.

A missing or inaccessible Quote must not disclose unrelated-resource existence through authorization errors.

Quote history includes all three statuses:

```text
active
won
lost
```

## 9. Status operation

Conceptual signature:

```text
setQuoteStatus(context, quoteId, status) -> Quote
```

Allowed target statuses:

```text
active
won
lost
```

Supported source-backed behavior:

```text
active -> won
active -> lost
won   -> active
lost  -> active
```

Setting the same status is an idempotent no-op at the product behavior level.

No other transition is authorized by this contract.

## 10. Reminder metadata behavior

When status changes, existing reminder metadata is cleared.

When reopening to `active`, the existing follow-up date is retained and an external application adapter may schedule a replacement reminder.

GHM itself does not schedule device notifications.

The Quote resource must not require Expo, AsyncStorage, notification-provider identifiers, or device APIs.

## 11. Notes operation

Conceptual signature:

```text
setQuoteNotes(context, quoteId, notes) -> Quote
```

Only `notes` and server-controlled `updated_at` may change through this operation.

The operation must not mutate status, customer snapshots, line items, amount, or follow-up date.

The current source does not impose a maximum note length. GHM must not invent a restrictive business limit without further evidence, but PostgreSQL text storage must remain bounded by normal database/resource safeguards.

## 12. Update restrictions

The initial generic `update` surface must not accept arbitrary patch objects.

Forbidden through Quote update:

```text
id
account_id
customer_id
customer_name
customer_phone
customer_email
description
amount
line_items
follow_up_date
created_at
```

These fields are creation/history state in the current source contract.

Status and notes require their dedicated domain operations.

## 13. Transaction boundary

Quote creation must use one checked-out PostgreSQL transaction for:

1. authenticated ownership validation;
2. Customer existence/status/ownership validation;
3. customer snapshot retrieval;
4. Quote insert;
5. line-item inserts;
6. commit.

A failure at any step must roll back the complete Quote aggregate.

Status and notes mutations must each use an authorized transaction boundary.

## 14. Concurrency

Quote status changes must be protected against lost updates.

The repository must re-read or lock the target Quote inside the transaction before applying the source-backed status mutation.

Two concurrent authorized status changes must leave the database in one valid canonical state rather than producing partial reminder metadata or malformed aggregate state.

Quote creation must not permit partially committed parent/child aggregates.

## 15. Error boundary

The service must expose stable domain-level errors for at least:

- authentication required;
- Quote access denied;
- Quote not found / inaccessible;
- Customer not found / inaccessible;
- Customer not active;
- invalid line item;
- invalid follow-up date;
- invalid Quote status;
- unsupported Quote mutation;
- transaction failure.

PostgreSQL implementation details must not become the public domain contract.

## 16. Repository contract

The intended typed repository boundary is equivalent in scope to:

```text
createQuote(context, input)
getQuote(context, quoteId)
listQuotes(context)
setQuoteStatus(context, quoteId, status)
setQuoteNotes(context, quoteId, notes)
```

A repository may use additional private helpers, but no raw SQL operation may be exposed through request input.

All identifiers are explicit `ghm.*` identifiers and all values are parameterized.

## 17. Service contract

The service owns:

- input validation;
- customer snapshot derivation;
- amount/description derivation;
- authorization orchestration;
- domain status rules;
- transaction composition.

The service must not:

- accept caller-controlled owner identity;
- accept caller-controlled customer snapshots as authority;
- invoke notification providers;
- create invoices;
- call WhatsApp or device dialler APIs;
- expose arbitrary field updates;
- expose generic SQL behavior.

## 18. Registry

The existing generic `quote` vocabulary may remain registered, but implementation of this contract requires a concrete `ghm.quote` resource before the registry entry can be considered evidence of capability.

The initial operation mapping is:

```text
quote.read
quote.create
quote.update
```

The registry must not be interpreted as proof that all authenticated roles can mutate every Quote.

## 19. Invoice boundary

Invoice creation remains a separate downstream capability.

The Quote service must not create or update invoices as a side effect of Quote status mutation.

The source-backed prerequisite is:

```text
Quote.status = won
```

Only a separately reconciled Invoice capability may consume that state.

## 20. Qualification requirements

Quote operation qualification must prove:

1. authenticated context is required;
2. owner scope is enforced;
3. Customer ownership is enforced;
4. archived Customer creation is rejected;
5. customer snapshots come from the canonical Customer row;
6. caller-supplied snapshot authority is impossible;
7. Quote and line items commit atomically;
8. invalid line items are rejected;
9. amount is derived correctly;
10. description is derived correctly;
11. follow-up date is validated;
12. exact status vocabulary is enforced;
13. source-backed status transitions pass;
14. unsupported status transitions fail;
15. notes-only mutation cannot alter other Quote fields;
16. reminder metadata follows the source-backed lifecycle boundary;
17. unauthorized reads fail;
18. unauthorized mutations fail;
19. runtime DELETE is denied;
20. runtime column privileges are least-privilege;
21. concurrent status mutation remains valid;
22. build/tests/diff checks pass;
23. no existing qualified capability regresses;
24. production safety remains intact.

## 21. Dependency gate

Implementation of this operation contract is authorized only after the GHM Customer resource required by the schema contract has been constructed and qualified.

Until then this document is the frozen provider-neutral Quote operation boundary, not authorization to invent a Customer implementation inside Quote.

## 22. Production safety

No QuoteFlow production database, application code, environment, credentials, routing, traffic, or data is changed by this contract. GHM construction remains isolated from production cutover.
