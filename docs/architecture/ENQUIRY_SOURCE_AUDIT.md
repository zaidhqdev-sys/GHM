# Enquiry Source Audit — Zaid Connect → GHM

**Status:** SOURCE AUDIT — RECONCILED / CONSTRUCTION AUTHORIZED

## Scope

This audit reconciles the production Zaid Connect marketplace enquiry contract with the current GHM Enquiry implementation before any further Enquiry construction or qualification work.

## Production source of truth

Primary production migration:

`zaid-connect/supabase/migrations/20260718143737_establish_marketplace_enquiry_contract.sql`

Opportunity workflow integration:

`zaid-connect/supabase/migrations/20260721195200_establish_opportunity_creation_workflows.sql`

## Canonical production entity

Zaid Connect uses `public.leads` as the authoritative customer-to-business enquiry record.

The production record contains:

- `id`
- `business_id`
- `customer_id`
- `customer_name`
- `customer_phone`
- `customer_email`
- `project`
- `description`
- `city`
- `budget_min`
- `budget_max`
- `urgency`
- `source`
- `status`
- `created_at`
- `updated_at`

The Opportunity workflow later adds the optional `opportunity_id` compatibility link to this record.

## Exact production vocabularies

### Urgency

```text
standard
urgent
emergency
```

### Source

```text
marketplace
directory
ai_quote
direct
```

The current marketplace creation policy requires `source = marketplace` and `status = new`.

### Status

```text
new
contacted
qualified
quoted
won
lost
archived
```

The source explicitly describes status as a lifecycle state managed by the recipient business owner.

## Production validation contract

The production source enforces:

- customer name length 1–200 after trim;
- phone null or length 7–32 after trim;
- email null or length 3–320 after trim;
- project length 1–200 after trim;
- description length 10–5000 after trim;
- city null or length 1–120 after trim;
- non-negative budget bounds;
- `budget_max >= budget_min` when both are present;
- exact urgency vocabulary;
- exact source vocabulary;
- exact status vocabulary.

## Production authorization contract

Marketplace enquiry creation is authenticated and requires:

- `customer_id = auth.uid()`;
- `source = marketplace`;
- `status = new`;
- selected Business is approved, verified, active;
- selected Business is not owned by the submitting Account.

Customer visibility is limited to the customer's own enquiries.

Recipient-business visibility is granted to the Business owner.

Recipient-business status update authority is granted to the Business owner.

The production source does not establish a separate administrator status-management permission for enquiries.

## Lifecycle transition evidence

The production source establishes the seven allowed status values and states that status is a protected lifecycle state managed by the recipient Business owner.

It does **not** provide an explicit database transition graph restricting status changes to:

```text
new -> contacted -> qualified -> quoted -> won/lost/archived
```

Therefore that transition graph is **not frozen as production source truth** by this audit. GHM must not treat an inferred transition graph as a canonical provider-neutral contract without additional production evidence.

Terminal-state behavior beyond the documented status vocabulary is likewise not inferred here.

## Opportunity relationship

The production Marketplace workflow atomically creates:

1. a service-request Opportunity;
2. the creator Account participant;
3. the owning Business participant;
4. a distinct Business `recipient` participant;
5. the compatible Lead/enquiry record linked through `opportunity_id`.

The Opportunity is created with lifecycle `open` and visibility `participants` for the marketplace workflow.

This confirms that the enquiry and Opportunity are related but remain distinct domain records. The Business `owner` and `recipient` participant responsibilities are also distinct.

## Current GHM comparison

GHM already contains `ghm.enquiry` with the same core field model, vocabularies, validation ranges, customer/Business ownership boundaries, indexes, runtime INSERT columns, and runtime status-update column.

Current GHM additionally contains an application-level status transition graph in `src/resources/enquiry/contracts.ts` and rejects transitions outside that graph in the repository. That graph is stricter than the currently evidenced production database contract and therefore requires reconciliation before it can be treated as canonical.

Current GHM recipient authorization is based on an active `owner` Business membership. The production source identifies the Business owner as the recipient authority. Administrator access is not evidenced by the production enquiry source and is therefore not authorized by this audit.

## Construction boundary

Construction is authorized for reconciliation and qualification of the existing GHM Enquiry capability, with these constraints:

- preserve the production field and vocabulary contract;
- preserve the customer-only creation boundary;
- preserve approved/verified/active Business targeting;
- preserve owner-only recipient authority unless new source evidence authorizes more;
- do not invent a status transition graph;
- preserve the Opportunity compatibility relationship;
- do not change Zaid Connect production;
- do not migrate or backfill production data;
- do not add notifications, realtime messaging, lead scoring, administration access, retention/anonymisation, anti-spam/rate-limiting, or presentation behavior without separate source evidence.

## Next work

1. Reconcile the current GHM Enquiry status-transition implementation against this audit.
2. Reconcile the GHM schema with the Opportunity compatibility link required by the production workflow.
3. Reconcile the atomic Marketplace Enquiry → Opportunity → recipient → Lead workflow in GHM.
4. Qualify runtime authorization, validation, duplicate/concurrency behavior where applicable, transaction rollback, and runtime privilege boundaries.

This audit does not authorize production cutover or any change to Zaid Connect's Supabase backend.
