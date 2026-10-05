# GHM Legacy Role Remediation Audit

**Status:** CONSTRUCTION — READ-ONLY SECURITY/AUTHORITY AUDIT

## Purpose

The legacy bootstrap/object audits established that `ghm_app_user` and `ghm_db_user` remain live and that `ghm_db_user` owns the historical `public.*` application objects. This boundary determines the effective authority graph before any role remediation.

## Critical evidence boundary

The audit must distinguish:

- direct role membership;
- transitive role reachability;
- role attributes such as `CREATEROLE` and `CREATEDB`;
- ownership of remaining legacy objects;
- schema/table/database privileges;
- runtime and migration dependency evidence.

The most important security path already established in live PostgreSQL is:

`ghm_app_user -> ghm_db_user`

with `ghm_db_user` retaining `CREATEROLE` and `CREATEDB`, plus admin-option membership in the canonical migration/runtime/schema-owner roles. This is a remediation finding, not permission to change it.

## Safety

This harness is read-only. It performs catalog inspection only and does **not**:

- GRANT or REVOKE;
- ALTER or DROP roles;
- DROP OWNED or REASSIGN OWNED;
- transfer object ownership;
- alter schemas or tables;
- mutate application data.

## Required remediation order

1. Prove current GHM runtime uses `ghm_runtime` and migrations use `ghm_migrator`.
2. Prove no recovery/operational path requires `ghm_app_user` or `ghm_db_user`.
3. Preserve the two legacy `public.users` rows until QuoteFlow provenance is reconciled.
4. Inventory and reconcile ownership of every remaining legacy object.
5. Define the least-privilege canonical role end state.
6. Remove legacy memberships/authority in a dedicated mutation slice.
7. Reconcile ownership and only then consider role retirement.
8. Re-run the full authority audit after each mutation boundary.

## Current decision

**REMEDIATION_PENDING — DO NOT MUTATE.**

The audit is evidence for a future role-remediation slice. It does not authorize role changes.

## Qualification gates

- [x] legacy role attributes captured;
- [x] direct memberships captured;
- [x] transitive role reachability captured;
- [x] legacy ownership captured;
- [x] schema/table/database privileges captured;
- [x] no mutation performed;
- [ ] runtime dependency proof complete;
- [ ] migration dependency proof complete;
- [ ] recovery/operations dependency proof complete;
- [ ] canonical least-privilege target approved;
- [ ] mutation slice qualified.
