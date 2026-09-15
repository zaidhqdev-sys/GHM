# Opportunity Capability Requirements Contract

## Status

CONSTRUCTION QUALIFICATION — CLOSED / PASS

Canonical source reconciled against Zaid Connect migration:

```text
supabase/migrations/20260726170000_establish_structured_opportunity_requirements.sql
```

GHM construction migration:

```text
database/migrations/20260914220000_create_opportunity_capability_requirements.sql
```

## Ownership

`ghm.opportunity_capability_requirement` is a child resource owned by the Opportunity domain.

Capability vocabulary remains owned by `ghm.capability`.

Opportunity management authorization remains owned by the Opportunity authorization boundary.

## Data contract

Each requirement contains:

- `opportunity_id` — required Opportunity reference;
- `capability_id` — required canonical Capability reference;
- `importance` — `required` or `preferred`, default `required`;
- `minimum_proficiency_level` — nullable `foundational`, `proficient`, `advanced`, or `expert`;
- `description` — nullable, trimmed, 1–1000 characters when present;
- `sort_order` — integer 0–1000, default 0;
- `created_by` — authenticated account provenance;
- `created_at` / `updated_at` — repository-owned timestamps.

At most 50 requirements may be supplied by the application replacement operation.

An Opportunity cannot contain the same Capability more than once.

## Capability validity

A requirement may reference only a Capability that is currently active and selectable.

The canonical Connect source requires an active Capability. GHM preserves that boundary while using the qualified GHM Capability lifecycle/selectability vocabulary.

## Read authorization

Requirement reads inherit the Opportunity read boundary:

- Opportunity creator may read;
- an active member of the Opportunity owner Business may read;
- authenticated/public Opportunities may be read according to the Opportunity visibility contract;
- an unrelated reader receives no requirement rows for a private Opportunity.

## Replacement authorization

Complete replacement is restricted to:

- the Opportunity creator; or
- an active owner/administrator of the Opportunity owner Business.

Active Business members who are not owners/administrators may read where the Opportunity boundary permits, but may not replace requirements.

## Atomic replacement

Replacement is one authorized transaction:

1. authenticate and establish the authorized transaction context;
2. authorize Opportunity management;
3. validate the complete input set;
4. validate every referenced Capability;
5. delete the existing requirement set;
6. insert the complete replacement set;
7. return the canonical ordered set.

Any failure rolls the entire replacement back. Partial replacement is not valid behavior.

## Ordering

Returned requirements are ordered by:

1. `required` before `preferred`;
2. ascending `sort_order`;
3. ascending requirement identifier.

When `sort_order` is omitted by the application input, the input ordinal is used.

## Runtime privilege boundary

`ghm_runtime` receives only the privileges required by the qualified repository operation:

- schema USAGE;
- table SELECT;
- column-level INSERT on the seven provenance/data columns;
- table DELETE for complete replacement;
- sequence USAGE.

No blanket UPDATE or ALL privilege is granted.

DELETE is intentionally confined to this child-resource table because complete replacement requires removal of the previous set. Authorization remains in the application repository/service transaction boundary.

## Versioning

The canonical Connect RPC accepts operation version `1`. GHM does not reproduce the provider-specific RPC surface; the GHM resource contract is the typed repository/service operation itself. No unsupported version surface is introduced until a future provider-neutral contract requires one.

## Production boundary

This contract establishes construction capability only. Zaid Connect and QuoteFlow remain on Supabase. No production migration, adapter, routing change, credential change, or cutover is authorized by this contract.
