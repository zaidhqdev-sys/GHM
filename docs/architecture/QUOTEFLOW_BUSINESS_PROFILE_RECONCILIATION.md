# QuoteFlow Business Profile Reconciliation

**Status: RECONCILIATION COMPLETE — NO GHM BUSINESS PROFILE ADAPTER AUTHORIZED**

## Evidence

QuoteFlow currently persists its Business Profile locally through `src/lib/businessProfileStorage.ts` using AsyncStorage and the existing authenticated account/organization storage boundary.

Current fields are:

- `businessName`
- `contactNumber`
- `logoUri`

The current source establishes no remote QuoteFlow Business Profile table, RPC, durable backend identifier, or server-authoritative profile record.

## Reconciliation result

No separately qualified GHM Business Profile resource was identified in the current GHM repository under the Business Profile/business_profile boundary.

The QuoteFlow local profile therefore must not be silently equated with GHM Business Identity or invented as a new GHM resource merely to absorb local product state.

There is some semantic overlap between `businessName` and GHM Business identity, but the current evidence does not establish that the QuoteFlow organization is a particular GHM Business.

Likewise, QuoteFlow `contactNumber` is not established as canonical GHM business contact data, and `logoUri` is not established as a transferable object-storage reference.

## What is established

1. QuoteFlow Business Profile is currently local/device-owned.
2. It is scoped through the authenticated QuoteFlow account/organization storage boundary.
3. QuoteFlow currently uses business name and contact number as sender/profile data.
4. GHM Business Identity is a separate canonical resource.
5. No durable QuoteFlow-organization-to-GHM-Business mapping is currently authorized.
6. No GHM Business Profile resource has been qualified for this product boundary.

## What is not authorized

Do not:

- map QuoteFlow organization to GHM Business by name, phone, slug, email, or other matching heuristic;
- copy QuoteFlow `businessName` into GHM Business automatically;
- treat QuoteFlow `contactNumber` as canonical GHM business contact data;
- persist `logoUri` in GHM without an explicit storage/object contract;
- create a new GHM Business Profile table/resource solely to mirror local QuoteFlow state;
- build a Business Profile adapter;
- migrate or shadow local profile data into GHM;
- authorize production routing or cutover.

## Required future authority

If QuoteFlow Business Profile is eventually moved behind GHM, a separate contract must establish:

- whether the profile belongs to the QuoteFlow organization, GHM Business, or another canonical owner;
- how the QuoteFlow organization maps to the GHM Business;
- which fields are canonical and which remain product-local;
- ownership and update authority;
- logo/object-storage ownership and lifecycle, if applicable;
- authorization and privacy boundaries;
- stable cross-system identifiers;
- migration and conflict behavior;
- idempotency, concurrency, recovery, shadow qualification, and rollback.

## Construction conclusion

**QuoteFlow Business Profile → GHM: NOT YET AUTHORIZED.**

Leave the current QuoteFlow profile local until ownership, field authority, cross-system mapping, and any object-storage boundary are explicitly qualified.

This reconciliation changes no application logic, database schema, provider configuration, production routing, shadow traffic, or cutover.
