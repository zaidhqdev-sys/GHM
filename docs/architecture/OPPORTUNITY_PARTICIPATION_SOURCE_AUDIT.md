# Opportunity Participation — Source Audit

## Status

SOURCE AUDIT — CONSTRUCTION NOT YET AUTHORIZED

This document records the next Opportunity-domain boundary after the completed Opportunity Capability Requirements slice. It intentionally does **not** invent or implement a participant schema without an evidenced production contract.

## GHM current state

The qualified Opportunity Core contract currently models:

- Opportunity creator Account;
- optional owning Business;
- lifecycle status;
- visibility including `participants`;
- full and safe read projections;
- Opportunity management authorization.

The GHM repository currently has no `opportunity_participant` resource, migration, repository, service, or registry operation.

The completed Opportunity Capability Requirements slice is separate and CLOSED.

## Canonical product-domain evidence

The current Zaid Connect approved target domain model defines **Opportunity Participation** as:

> the governed relationship between an Opportunity and the Accounts or Businesses that create, own, receive, respond to, evaluate, or fulfill it.

The same domain model explicitly classifies the approved target model separately from the current production model and states that target concepts do not become production state merely because they appear in the domain model.

Therefore the target-domain statement is architectural evidence of meaning, but it is **not sufficient by itself** to define a GHM physical schema or runtime mutation contract.

## Important reconciliation

The current GHM Opportunity visibility vocabulary contains:

```text
private
participants
authenticated
public
```

The presence of `participants` establishes a visibility concept, but it does not establish the missing participant relationship itself.

A participant resource must not be inferred from the visibility enum.

## What is evidenced today

The current Zaid Connect Opportunity application surface exposes:

- Opportunity marketplace listing;
- Opportunity type selection;
- Opportunity lifecycle/visibility fields;
- structured Capability Requirements;
- requirement replacement through the canonical Opportunity manager RPC.

The reviewed current Opportunity service does not expose a participant-management operation.

The current production Enquiry/Lead contract is a separate customer-to-Business interaction. Its canonical schema does not contain an Opportunity foreign key. Its documented migration describes the persisted record as a Marketplace Enquiry/Lead and defines customer and recipient-Business authorization independently.

The current domain model describes Enquiry/Lead as an existing directed interaction that **may later map to an Opportunity workflow**. That is target direction, not evidence of an already-authoritative Opportunity participant contract.

## Construction decision

Do **not** construct `ghm.opportunity_participant` yet.

Do not invent:

- participant roles;
- participant lifecycle states;
- invitation/application semantics;
- Account-versus-Business participant ownership rules;
- participant qualification rules;
- response/award semantics;
- participant visibility predicates;
- mutation operations;
- uniqueness/concurrency rules;
- runtime ACLs;
- adapter assumptions.

Those require an explicit canonical contract first.

## Next governed action

The next construction step is a dedicated **Opportunity Participation contract/source reconciliation** across the authoritative product source, including any later migration or approved target contract that establishes:

1. participant identity model;
2. participant role vocabulary;
3. creation/invitation/application semantics;
4. owner/creator/participant authorization boundaries;
5. lifecycle and withdrawal rules;
6. visibility semantics for `participants` Opportunities;
7. qualification rules, if any;
8. response/evaluation/award boundaries;
9. concurrency and duplicate protection;
10. operation versioning;
11. application UI/consumer behavior.

Only after those are evidenced should GHM schema, repository/service operations, ACLs, tests, and runtime qualification be constructed.

## Production safety

This audit changes no Zaid Connect production data, Supabase schema, credentials, routing, DNS, traffic, or environment variables.

No production adapter or cutover is authorized by this document.
