# Business Capability Tenant Adoption

**Status:** CONSTRUCTION — tenant adoption under qualification

## Scope

Business Capability is a Business-owned resource and now adopts the durable GHM tenant boundary for its Business-scoped read and assertion-creation operations.

## Boundary

- listBusinessCapabilities resolves the canonical tenant through `withTenantTransaction`.
- createBusinessCapability resolves the canonical tenant through `withTenantTransaction`.
- Business management authority is derived from the resolved tenant membership role.
- Caller-supplied `businessId` is only a tenant-selection input; it cannot rebind the resolved tenant or bypass membership.
- getBusinessCapability first identifies the canonical owning Business and then resolves tenant access on the same authorized transaction client.
- Capability catalogue reads remain global/reference-data reads and are not incorrectly tenant-scoped.
- Verification transitions remain under the separately governed global verifier-admin boundary; they are not converted into ordinary Business membership mutations by this adoption.

## Failure mode

Missing or inactive membership, inactive Business state, and cross-Business access fail through the canonical `Business tenant access denied` boundary.

## Qualification target

Runtime qualification must prove:

1. runtime identity remains `ghm_runtime`;
2. authorized Business member reads succeed;
3. owner/administrator creation succeeds;
4. ordinary Business members cannot create assertions;
5. cross-Business reads and creates fail closed;
6. customer access fails closed;
7. capability catalogue selectability rules remain intact;
8. provenance remains server-derived;
9. duplicate and concurrent duplicate protection remains intact;
10. runtime direct UPDATE/DELETE remain denied;
11. existing Business Capability regression suite remains green.

No production cutover, Supabase mutation, or public HTTP exposure is authorized by this document.
