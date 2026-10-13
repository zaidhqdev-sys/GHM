# GHM Enquiry Operation Contract

> **Current-status reconciliation — 2026-10-13:** The bounded GHM Enquiry resource is already constructed and qualification-backed on mainline. The original statement that the marketplace create path was “the first source eligible for implementation qualification” is historical planning language, not a current construction step. Open work is product-parity reconciliation of the stricter GHM status-transition graph, owner-only recipient authority, and the atomic Marketplace Enquiry → Opportunity → recipient → Lead workflow. No production cutover or Connect production change is authorized by this contract.

## Status

**CONSTRUCTION QUALIFICATION CONTRACT — AUTHORIZED**

This contract reconciles the authoritative Zaid Connect enquiry concept into the GHM identity and Business model. It authorizes construction qualification only.

It does **not** authorize production deployment, production database migration, provider/bootstrap mutation, product cutover, DNS/routing changes, shadow traffic, or migration of Zaid Connect or QuoteFlow.

## 1. Canonical domain concept

An **Enquiry** is a customer-to-Business request submitted by an authenticated GHM account to a specific Business.

An Enquiry is not a Project. A Project is account-owned work information. An Enquiry is a relationship and workflow record whose recipient is a Business.

The GHM Enquiry slice must therefore bind to canonical GHM identities:

- customer → `ghm.account_identity.id`
- recipient → `ghm.business.id`
- recipient authorization → `ghm.business_membership`

GHM must not reproduce Supabase `auth.uid()`, UUID, or Supabase RLS assumptions.

## 2. Source-of-truth reconciliation

The Zaid Connect authoritative `public.leads` contract establishes these responsibilities:

- customer-to-business enquiries;
- customer contact snapshots captured at submission time;
- project/request description and location/budget information;
- explicit lifecycle state;
- customer visibility of own enquiries;
- recipient-business visibility;
- recipient-owner status management;
- marketplace submission only to an eligible, active business other than the submitting customer's own business;
- no anonymous enquiry access.

The same source explicitly defers notifications, realtime messaging, saved businesses, lead scoring, administration access, automated retention/anonymisation, anti-spam/rate-limiting infrastructure, and Business Workspace presentation changes.

GHM shall preserve these domain responsibilities while replacing provider-specific identity and authorization mechanisms with its canonical model.

## 3. Minimum first-slice identity contract

### Customer

The authenticated customer is the `account_identity.id` carried by `AuthContext.userId`.

The enquiry stores a submission-time customer contact snapshot separately from the identity reference. The snapshot is not the authorization principal and does not replace `customer_id`.

### Recipient Business

The recipient is the canonical `business.id` relation.

A business may have multiple memberships in GHM, but the first Enquiry authorization slice shall remain conservative: recipient-side management is limited to an active **owner** membership unless a later contract explicitly authorizes administrators or other members.

This avoids silently broadening authority beyond the authoritative Connect owner-only contract.

## 4. First-slice operations

The first GHM Enquiry slice is limited to these operations:

| Operation | Actor | Authorization | Result |
| --- | --- | --- | --- |
| `enquiry.create` | authenticated customer | authenticated account is the customer; target Business is eligible; customer is not the Business owner | creates a new enquiry in `new` state |
| `enquiry.readOwn` | authenticated customer | `customer_id = context.userId` | reads only enquiries submitted by that customer |
| `enquiry.readReceived` | authenticated business owner | active owner membership for `business_id` | reads only enquiries addressed to that Business |
| `enquiry.updateStatus` | authenticated business owner | active owner membership for `business_id` | changes lifecycle status only |

Anonymous users have no Enquiry operations.

A customer cannot read another customer's Enquiry.

A business owner cannot read enquiries addressed to another Business.

A customer cannot update Enquiry status.

No first-slice Enquiry operation grants delete authority.

## 5. Submission invariants

A create operation must establish all of the following before the record is accepted:

1. the caller is authenticated;
2. `customer_id` is the caller's canonical GHM account identity;
3. the target Business exists;
4. the target Business is approved and active;
5. the submitting customer is not the target Business's active owner;
6. the initial status is `new`;
7. the submitted source is an explicitly approved workflow value;
8. customer contact snapshot fields are validated independently from the account identity;
9. budget values are non-negative and, when both exist, `budget_max >= budget_min`;
10. urgency is one of `standard`, `urgent`, or `emergency`.

The authorization contract must not depend on caller-supplied ownership claims.

## 6. Lifecycle

The authoritative Connect **status vocabulary** is:

`new`, `contacted`, `qualified`, `quoted`, `won`, `lost`, `archived`.

The sequence below is a historical construction-time illustration, **not** a source-proven production transition graph:

`new → contacted → qualified → quoted → won | lost | archived`

The production source establishes the allowed status values and recipient-owner authority, but it does not establish a database transition graph for these values. GHM's application-level transition restrictions are therefore GHM-local construction behavior, not proven Connect workflow parity. The stricter transition graph remains an explicit product-parity reconciliation item in `ENQUIRY_SOURCE_AUDIT.md`; it must not be treated as canonical Connect lifecycle authority before that reconciliation closes.

Status is recipient-business workflow state. It is not customer-editable data. The GHM service must continue to reject invalid status values and enforce its currently qualified mutation boundary; any change to transition semantics requires a separate reviewed qualification.

## 7. Source

The authoritative Connect contract recognises these source values:

- `marketplace`
- `directory`
- `ai_quote`
- `direct`

GHM retains this vocabulary for reconciliation. The existing bounded Enquiry implementation is qualified, but accepting a source still requires an authorized product workflow. The marketplace create path was the first source selected for construction; remaining work is end-to-end product-parity reconciliation and qualification, not initial Enquiry resource construction.

No source may be accepted merely because it is syntactically valid if the calling operation is not authorized to create that source.

## 8. Data boundary

The minimum Enquiry data boundary is:

- Enquiry identifier;
- recipient Business identifier;
- customer account identifier;
- submission-time customer name snapshot;
- optional submission-time customer phone snapshot;
- optional submission-time customer email snapshot;
- project/request title or description;
- detailed description;
- optional city;
- optional minimum and maximum budget;
- urgency;
- source;
- lifecycle status;
- created timestamp;
- updated timestamp.

The GHM implementation must use canonical snake_case database fields and map them to the repository's established camelCase domain contracts.

The customer snapshot is intentionally duplicated domain data: it records what contact information was supplied at submission time and must not be treated as a live mirror of the account profile.

## 9. Recipient authorization boundary

Recipient authorization is relationship-based, not role-name-only.

A `business` GHM role does not by itself authorize access to every Business's enquiries. The caller must have the required active membership for the specific recipient Business.

For the first slice, that relationship is an active membership with `membership_role = 'owner'`.

Future administrator/member access requires an explicit contract and qualification; it must not be inferred from the existence of those membership roles.

## 10. Least privilege

The runtime role must receive only the Enquiry privileges required by the qualified operations.

At minimum:

- runtime may read Enquiries through qualified repository queries;
- runtime may insert the permitted create columns;
- runtime may update only the lifecycle status for the permitted recipient workflow;
- runtime receives no Enquiry delete privilege;
- runtime receives no blanket table DML;
- runtime receives no privilege to bypass service-level authorization by writing customer or recipient identity fields during updates.

If PostgreSQL column grants cannot fully express a business invariant, the invariant remains an explicit repository/service authorization requirement.

## 11. Project relationship

An Enquiry may carry project/request information, but it must not automatically create, own, mutate, or expose a `ghm.project` row.

Project and Enquiry remain separate canonical resources:

- `ghm.project` → account-owned project resource;
- `ghm.enquiry` → customer-to-Business workflow relationship.

Any later relationship between an Enquiry and Project requires a separate contract and migration.

## 12. Explicitly out of scope

The first Enquiry qualification does not implement or authorize:

- notifications;
- realtime messaging;
- saved businesses;
- lead scoring;
- administration access;
- automated retention or anonymisation;
- anti-spam or rate limiting infrastructure;
- Business Workspace UI changes;
- payment or quoting workflows;
- automatic Project creation;
- production provider migration;
- production data migration;
- Supabase RLS replication.

## 13. Historical construction qualification criteria — CLOSED / PASS

The following criteria record the bounded Enquiry schema/runtime qualification already completed; they are not a request to rebuild or reopen that qualified slice:

1. exact customer identity binding to `account_identity`;
2. exact Business recipient binding to `business`;
3. active-owner recipient authorization through `business_membership`;
4. customer own-read isolation;
5. cross-customer read denial;
6. cross-business read denial;
7. marketplace target eligibility enforcement;
8. own-business submission denial;
9. submission-time contact snapshot persistence;
10. lifecycle validation;
11. recipient-only status mutation;
12. customer/status-field mutation denial;
13. no Enquiry delete capability for runtime;
14. least-privilege runtime grants;
15. live qualification using the dedicated `ghm_runtime` identity;
16. cleanup using the dedicated `ghm_migrator` authority;
17. automated repository/service/API tests covering the authorization boundary.

A schema existing in PostgreSQL is not sufficient evidence of qualification. The bounded resource qualification is closed; the separate source-parity and atomic Opportunity workflow gaps stated in the current-status notice and `ENQUIRY_SOURCE_AUDIT.md` remain open. In particular, the current GHM transition graph must not be treated as canonical production source truth until reconciled against the evidenced Connect contract.

## 14. Founder boundary

**ENQUIRY DIRECTION: QUALIFIED / CLOSED / PASS**

**ENQUIRY CONTRACT: QUALIFIED / CLOSED / PASS**

**ENQUIRY SCHEMA + RUNTIME: QUALIFIED / CLOSED / PASS**

This authorization remains construction-only. Production deployment and product cutover remain separately gated.
