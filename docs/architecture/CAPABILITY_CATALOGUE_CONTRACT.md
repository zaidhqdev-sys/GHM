# GHM Capability Catalogue Contract

**Status:** CONSTRUCTION CONTRACT — QUALIFICATION COMPLETE / COMMIT PENDING

## 1. Purpose

Define the provider-neutral GHM Capability Catalogue required by downstream
capabilities, beginning with Opportunity Capability Requirements.

This is a GHM capability contract, not a copy of the Zaid Connect Supabase
schema or its SECURITY DEFINER implementation.

## 2. Source of truth

The authoritative production source is Zaid Connect's `public.capabilities`
catalogue and its governed lifecycle semantics.

The verified production Capability model establishes:

- stable Capability identity;
- hierarchical parent/child relationships;
- name and slug;
- bounded description;
- lifecycle status;
- taxonomy version;
- effective validity dates;
- source authority and source reference;
- replacement relationship for deprecated/retired entries;
- selectable state;
- governed lifecycle transitions.

GHM preserves the domain semantics required by downstream product workflows
without copying provider-specific RPC, RLS, or authentication implementation.

## 3. Canonical GHM relation

The canonical GHM relation is:

`ghm.capability`

The GHM representation is independently owned.

Where an external Capability identifier is required for future adapter
reconciliation, the canonical Capability identifier is preserved as a UUID.
GHM does not depend on Supabase authentication identifiers.

## 4. Canonical fields

`ghm.capability` contains:

- `id`
- `parent_id`
- `name`
- `slug`
- `description`
- `sort_order`
- `lifecycle_status`
- `taxonomy_version`
- `effective_from`
- `effective_to`
- `source_authority`
- `source_reference`
- `replaced_by_capability_id`
- `is_selectable`
- `created_at`
- `updated_at`

## 5. Lifecycle vocabulary

The canonical lifecycle vocabulary is:

- `draft`
- `active`
- `deprecated`
- `retired`

Lifecycle semantics:

- draft may become active;
- active may become deprecated or retired;
- deprecated may become active or retired;
- retired is terminal;
- deprecated/retired entries may identify an active replacement;
- replacement cannot self-reference;
- retiring a Capability must not orphan non-retired children.

`is_selectable` is independent stored catalogue state used by downstream
selection workflows. It is not an authorization flag.

## 6. Hierarchy

A Capability may have a parent Capability.

The hierarchy must:

- reference an existing Capability;
- prevent self-parenting;
- prevent hierarchy cycles;
- preserve parent/child referential integrity.

The first GHM migration does not introduce a recursive hierarchy-management
API.

## 7. Identity and reconciliation

Capability identifiers are stable domain identifiers.

GHM does not generate replacement identifiers merely because the source system
uses a different provider.

Future product adapters may reconcile the GHM Capability identifier against
the Connect identifier. That adapter is outside this construction slice.

## 8. Read capability

The first GHM Capability surface is read-only.

Required repository operations:

- `getCapability`
- `listActiveCapabilities`
- `listSelectableCapabilities`

Downstream requirement construction may resolve only active/selectable
Capabilities through this boundary.

Retired or deprecated entries remain readable when explicitly requested by
identifier so historical references can remain intelligible, but they are
not returned by active/selectable catalogue reads.

## 9. Runtime authorization boundary

`ghm_runtime` receives:

- schema USAGE;
- SELECT on `ghm.capability`.

`ghm_runtime` receives no:

- INSERT;
- UPDATE;
- DELETE;
- sequence privilege;
- DDL authority;
- governance escalation.

Capability governance mutations are not part of this slice.

## 10. Transaction boundary

Capability reads do not require an account-owned transaction when no protected
resource is being mutated.

Downstream mutations that consume Capability identifiers remain responsible
for their own authorized transaction boundary.

## 11. Validation boundary

The database must enforce:

- non-empty bounded names;
- canonical lowercase slug format;
- bounded descriptions;
- non-negative sort order;
- valid lifecycle vocabulary;
- positive taxonomy version;
- valid effective-date ordering;
- valid source authority/reference lengths;
- no self-replacement;
- no self-parent;
- replacement references an existing Capability;
- replacement is valid only for deprecated/retired semantics;
- `is_selectable` is boolean and defaults deterministically.

Repository/service reads must map rows into typed domain objects and must not
expose raw PostgreSQL rows.

## 12. Governance boundary

Connect's review-moderator RPCs are not copied into GHM.

No GHM application operation is authorized by this contract to create,
update, transition, retire, replace, or otherwise govern catalogue entries.

Those operations require a future explicit governance contract if GHM
eventually becomes authoritative for Capability Catalogue administration.

## 13. Downstream dependency

The intended dependency is:

`ghm.capability`
        |
        v
`ghm.opportunity_capability_requirement`

Opportunity Capability Requirements remain outside this slice.

Their construction is blocked until the Capability Catalogue itself is
qualified CLOSED / PASS.

## 14. Qualification requirements

Capability Catalogue qualification must demonstrate:

1. schema exists in `ghm`;
2. required fields and constraints exist;
3. hierarchy integrity is enforced;
4. lifecycle vocabulary is enforced;
5. source/replacement integrity is enforced;
6. active catalogue reads work;
7. selectable catalogue reads work;
8. inactive/deprecated/retired filtering is correct;
9. explicit historical identifier reads remain possible;
10. runtime identity is `ghm_runtime`;
11. runtime SELECT succeeds;
12. runtime INSERT is denied;
13. runtime UPDATE is denied;
14. runtime DELETE is denied;
15. cross-boundary governance mutation is denied;
16. repository/service mapping is typed;
17. existing GHM tests remain passing;
18. rollback/failure leaves catalogue state unchanged.

## 15. Completion gate

The Capability Catalogue is CLOSED / PASS only after:

- contract reconciled;
- migration applied;
- repository/service implemented;
- static tests pass;
- runtime qualification passes;
- least privilege is measured;
- documentation is reconciled;
- commit is pushed.

No Opportunity Capability Requirement construction may begin before this gate
closes.
