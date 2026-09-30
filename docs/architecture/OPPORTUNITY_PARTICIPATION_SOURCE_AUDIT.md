# Opportunity Participation — Source Audit

## Status

SOURCE AUDIT — RECONCILED / CONSTRUCTION AUTHORIZED

This document records the canonical Opportunity Participation contract evidenced from the current Zaid Connect production source and reconciled against the current GHM Opportunity foundation. It authorizes GHM construction of the persisted participation relationship without authorizing any production migration or cutover.

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

## Canonical production source

The authoritative production source is the Zaid Connect `main` branch, specifically the Opportunity foundation migration:

```text
supabase/migrations/20260721191700_establish_opportunity_foundation.sql
```

and the atomic Opportunity creation workflows:

```text
supabase/migrations/20260721195200_establish_opportunity_creation_workflows.sql
```

The production foundation explicitly establishes Account and Business Opportunity participation, the six participant roles, membership-aware authorization, RLS, and explicit grants. The creation workflow establishes the additional Marketplace recipient relationship and the Project-type Opportunity relationship. 

## Canonical participant identity

A participant belongs to an Opportunity and is identified by exactly one principal:

- Account; OR
- Business.

The production schema enforces this invariant with a subject-required constraint:

```text
(account_id is not null and business_id is null)
or
(account_id is null and business_id is not null)
```

A participant row therefore cannot represent both an Account and a Business.

## Canonical participant roles

The production contract defines exactly these six roles:

```text
creator
owner
recipient
responder
evaluator
fulfiller
```

No additional role is authorized by this reconciliation.

## Canonical participant statuses

The production contract defines exactly these participation lifecycle states:

```text
invited
active
declined
withdrawn
removed
completed
```

These are participation states and are distinct from the Opportunity lifecycle:

```text
draft
open
responding
evaluating
awarded
in_progress
completed
cancelled
archived
```

GHM must preserve that distinction.

## Duplicate protection

The production source establishes separate partial unique indexes for Account and Business participation:

- Opportunity + Account + role where Account is present;
- Opportunity + Business + role where Business is present.

GHM construction must preserve the source duplicate-protection invariant and must not replace it with a weaker application-only check.

## Automatic creator and owner participation

The production Opportunity foundation installs an Opportunity creation trigger which automatically establishes:

1. the creator Account as `creator` / `active`;
2. when `owner_business_id` is present, that Business as `owner` / `active`.

Therefore creator and owner participation are persisted relationships, not inferred solely from Opportunity columns.

## Participant visibility

The production source defines `is_opportunity_participant(target_opportunity_id)` as a participant-aware visibility predicate.

The predicate recognizes:

- the Opportunity creator Account; and
- participant Accounts with status `invited`, `active`, or `completed`; and
- participant Businesses where the authenticated Account is a member and the participation status is `invited`, `active`, or `completed`.

Therefore the GHM implementation must not infer participant access merely from `opportunity.visibility = 'participants'`.

The persisted participation relationship is part of the authorization boundary.

## Opportunity management authority

The production source separately defines `can_manage_opportunity(target_opportunity_id)`.

Management authority is granted to:

- the Opportunity creator Account; or
- an authorized member of the owning Business through the established `business.manage` permission.

Being a participant is therefore not equivalent to unrestricted Opportunity management authority.

GHM must preserve this distinction.

## Participant RLS / mutation boundary

The production Opportunity foundation enables and forces RLS on `opportunity_participants` and establishes explicit participant authorization policies.

GHM construction must therefore treat participant access as an explicit resource authorization boundary rather than inheriting generic Opportunity access.

The exact GHM service operation surface must remain limited to behavior supported by the reconciled production contract; no broader participant-management API is invented merely because the physical relationship exists.

## Marketplace enquiry workflow

The production Marketplace enquiry RPC:

```text
create_marketplace_enquiry_with_opportunity(...)
```

atomically creates a service-request Opportunity and its compatible Lead.

The Opportunity creation trigger establishes:

- authenticated Account as `creator` / `active`;
- recipient Business as `owner` / `active`.

The workflow then establishes the same Business as a distinct:

```text
recipient / active
```

participant.

This proves that `owner` and `recipient` are distinct participation responsibilities and must not be collapsed into one role during GHM construction.

The selected Business must also be active, verified, and approved before the workflow proceeds.

## Project workflow

The production Project RPC:

```text
create_project_with_opportunity(...)
```

atomically creates a Project-type Opportunity and the compatible Project record.

The Opportunity foundation establishes the authenticated Account as `creator` / `active` participation.

This confirms that Opportunity Participation is an independent Opportunity foundation and is not synonymous with the Project resource.

## Enquiry / Lead relationship

The production Opportunity foundation adds an optional `opportunity_id` compatibility link to Leads and Projects.

The Marketplace enquiry workflow uses that link to associate the Lead with the newly created Opportunity.

GHM must therefore keep:

- Opportunity;
- Opportunity Participation;
- Enquiry/Lead

as separate resource boundaries while preserving the evidenced relationship.

GHM must not copy the Lead schema into Participation.

## Application surface

The production foundation explicitly states that the Opportunity user interface is deferred and that Opportunity matching, recommendations, outcomes, notifications, knowledge-graph integration, and AI ranking are also deferred from that milestone.

The current application/service surface does not establish a general standalone participant-management UI/API contract.

This does not invalidate the persisted participation contract. It means GHM must reproduce the evidenced persisted relationship and authorization semantics without inventing an additional public mutation surface.

## Reconciled construction contract

The following are now source-evidenced and authorized for GHM construction:

1. Opportunity-to-participant relationship.
2. Account-or-Business principal identity.
3. Exactly six canonical participant roles.
4. Exactly six canonical participant statuses.
5. Account/Business XOR identity constraint.
6. Account-role duplicate protection.
7. Business-role duplicate protection.
8. Automatic creator participation.
9. Automatic owner-Business participation where applicable.
10. Participant-aware visibility predicate semantics.
11. Separate Opportunity management authority.
12. Participant-specific authorization boundary.
13. Marketplace recipient-Business participation.
14. Separation of owner and recipient responsibilities.
15. Project-type Opportunity relationship.
16. Opportunity/Participation/Lead resource separation.

## Explicit non-inferences

The following remain outside this construction contract unless separately evidenced:

- new participant roles;
- new participant statuses;
- generic invitation/application workflow semantics beyond the persisted status vocabulary and existing source behavior;
- qualification rules not present in the production source;
- response/evaluation/award state machines beyond the existing Opportunity/participant vocabulary;
- participant notification semantics;
- matching/recommendation semantics;
- AI ranking/intelligence;
- a new public participant-management API;
- production adapters;
- production cutover.

## Construction sequence

The reconciled next sequence is:

1. Freeze this source contract.
2. Design `ghm.opportunity_participant` against the existing GHM Opportunity Core and identity/business model.
3. Define migration constraints and indexes.
4. Define runtime/migrator privileges.
5. Implement repository/service behavior supported by the source contract.
6. Register the resource and authorization boundary.
7. Add focused tests.
8. Qualify runtime behavior using the established GHM qualification pattern.
9. Update the handover to mark Opportunity Participation complete only after qualification passes.

## Production safety

This reconciliation changes no Zaid Connect production data, Supabase schema, credentials, routing, DNS, traffic, or environment variables.

No production adapter or cutover is authorized by this document.
