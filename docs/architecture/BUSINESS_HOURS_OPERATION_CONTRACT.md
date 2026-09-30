# GHM Business Hours Operation Contract

**Status:** CONSTRUCTION AUTHORIZED — contract frozen 2026-09-16

## 1. Purpose

Define the provider-neutral GHM boundary for Business Hours reconciled from the current Zaid Connect production contract.

Business Hours are a Business-owned weekly operating schedule. They are not instantaneous availability, booking capacity, service coverage, or a manually asserted open/closed status.

## 2. Resource identity

Canonical resource:

```text
business_hours
```

Canonical PostgreSQL relation:

```text
ghm.business_hours
```

Parent resource: `ghm.business`.

## 3. Operations

The initial operation surface is deliberately narrow:

| Operation | Purpose |
|---|---|
| `read` | Read the weekly schedule for an authorized Business context. |
| `readPublic` | Read schedule rows for an active, publicly verified Business. |
| `replace` | Atomically replace the complete weekly schedule through governed Business management authority. |

There is no item-level create, update, or delete operation. There is no generic mutation surface.

## 4. Schedule model

Each Business may have at most one row per day (`day_of_week` 0–6).

A row is either:

- closed, with both `open_time` and `close_time` absent; or
- open, with both times present and `close_time > open_time`.

A replacement payload contains at most seven distinct days. An empty replacement is valid and means no schedule is provided.

## 5. Provenance

`created_by` is derived from the authenticated context for replacement-created rows. Caller-supplied provenance is not trusted.

## 6. Read boundary

Managed reads require an authenticated Account with an active Business membership. Public reads require the Business to be active and directory-approved.

Public reads expose only Business Hours fields. No private Business identity or membership data is part of this resource.

## 7. Replace boundary

Replacement requires authenticated Business management authority: active membership with role `owner` or `administrator`.

Replacement is atomic. The previous schedule is removed and the supplied bounded schedule becomes authoritative within one transaction.

The runtime application must not receive generic table DELETE authority merely to support this operation. The database-owned replacement function is the only mutation path exposed to the runtime role.

## 8. Validation

The service and database must enforce:

- Business identifier is a positive integer;
- maximum seven rows;
- day values 0–6;
- no duplicate day values;
- closed rows have no times;
- open rows have both times;
- close time is later than open time;
- only authorized Business management contexts may replace;
- public reads require active + approved Business state.

## 9. Explicit exclusions

This resource does not implement:

- booking or appointment availability;
- real-time open-now calculation;
- holiday calendars;
- exceptions or temporary closures;
- timezone conversion policy;
- staff/resource availability;
- service-specific hours;
- analytics or engagement events;
- notification delivery.

Those concerns require separately reconciled contracts.

## 10. Production boundary

This construction slice is provider-neutral and does not authorize production Zaid Connect cutover, Supabase migration, DNS changes, credential changes, or production traffic changes.
