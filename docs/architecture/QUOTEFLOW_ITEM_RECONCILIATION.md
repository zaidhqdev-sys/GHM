# QuoteFlow Item Reconciliation

**Status: RECONCILIATION COMPLETE — NO ITEM/CAPABILITY ADAPTER AUTHORIZED**

## Evidence

QuoteFlow stores its Item catalogue locally through AsyncStorage using `quoteflow.items.v1`, scoped through the authenticated account/organization storage boundary.

Current QuoteFlow Item fields:

- local string `id`
- `name`
- `description`
- `unitPrice`
- `createdAt`
- `active | archived` status

QuoteFlow Quote line items may optionally reference these local Items through `itemId`.

GHM has a canonical Capability resource, but it is a materially different domain. GHM Capability is a governed taxonomy entity with:

- UUID identifier
- parent/child taxonomy
- name and slug
- description
- lifecycle status
- taxonomy version
- source authority/reference
- replacement lineage
- selectable flag
- effective dates

GHM Quote line items optionally reference a GHM catalog-item identifier, but the current repository evidence does not establish a qualified GHM product/catalog-item resource corresponding to QuoteFlow Item.

## Reconciliation result

QuoteFlow Item is a product/pricing catalogue owned by the QuoteFlow local product boundary.

GHM Capability is a governed service/capability taxonomy and is **not** a substitute for QuoteFlow Item.

The existence of a GHM Quote line-item `catalogItemId` field does not establish a canonical product catalogue, nor does it authorize mapping QuoteFlow Item IDs into GHM Capability IDs.

**QuoteFlow Item → GHM: NOT YET AUTHORIZED.**

## What is not authorized

Do not:

- map QuoteFlow Item to GHM Capability;
- treat local string Item IDs as GHM UUID Capability IDs;
- infer catalog ownership from QuoteFlow organization identity;
- create a new GHM product catalogue solely to mirror QuoteFlow;
- populate GHM Quote `catalogItemId` from QuoteFlow Item IDs;
- migrate local Items;
- build an Item/Catalogue adapter;
- introduce production routing, shadow traffic, or cutover.

## Required future authority

If QuoteFlow Items are eventually moved behind GHM, a separate contract must establish:

- canonical ownership;
- whether the domain is a product catalogue, service catalogue, or another resource;
- organization/business tenancy;
- stable cross-system identifiers;
- name/description/price authority;
- active/archive lifecycle;
- currency/tax semantics;
- Quote line-item snapshot semantics;
- duplicate and merge behavior;
- migration/recovery/idempotency/concurrency;
- adapter, shadow, and cutover authority.

## Construction conclusion

Keep QuoteFlow Item local.

This reconciliation changes no application logic, database schema, provider configuration, production routing, shadow traffic, or cutover.
