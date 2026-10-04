# Business Offering Tenant Adoption

Status: CONSTRUCTION — tenant adoption implemented, runtime qualification pending.

## Decision

Business Offering is the first Connect business-domain resource adopted onto the durable tenant boundary.

The canonical protected path is:

`AuthContext → TenantContext → authorization → Business Offering resource → same PostgreSQL transaction`

## Rules

- Authenticated business reads resolve the requested business through `resolveTenantContext`.
- Creates resolve the tenant before mutation and permit only owner/administrator membership roles.
- Updates first identify the offering's canonical `business_id`, then resolve that tenant on the same checked-out transaction client before mutation.
- The caller cannot select or rebind tenant identity through mutation input.
- Cross-business reads and updates fail closed at tenant resolution.
- Public offering reads remain intentionally outside authenticated tenant resolution because they are public projection reads.
- Existing field-level validation and runtime database privilege boundaries remain intact.

## Qualification

The runtime qualification must prove:

- runtime identity is `ghm_runtime`;
- cleanup authority is `ghm_migrator`;
- owner/member access still works;
- non-members and cross-business access are denied;
- management mutations remain owner/administrator only;
- update tenant resolution uses the target offering's canonical business;
- public inactive filtering remains intact;
- database privilege boundaries remain unchanged.

No broad resource refactor is included in this slice.
