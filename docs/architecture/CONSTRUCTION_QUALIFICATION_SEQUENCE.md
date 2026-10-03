# GHM Construction Qualification Sequence

## Purpose

This is the governed execution order for qualifying GHM as the future backend replacement without touching live Zaid Connect or QuoteFlow traffic.

The sequence remains the architecture-level gate order. Individual gates may have partial evidence or qualified first slices; a qualified slice does not imply production qualification of the whole sequence.

## Gate order and current state

1. **Runtime boundary** — canonical configuration is used and unsafe legacy runtime bootstrap behavior is removed or formally constrained. **Construction evidence exists; production qualification remains open.**
2. **Schema authority** — PostgreSQL schema is owned by repository migrations; application startup performs no schema mutation. **First canonical GHM Business Identity slice is established through repository-owned migrations, relocated into the dedicated `ghm` schema, and qualified against the live catalog.**
3. **Authorization boundary** — authenticated identity and authorization are enforced within the same query/transaction context; no connection-pool context leakage. **CLOSED / PASS for construction qualification of the first canonical Business Identity slice.**
4. **Resource API** — unrestricted generic table access is removed and replaced with explicit governed resources. **First Business Identity Resource API slice implemented and qualified; future registry resources remain governed work.**
5. **Operational boundary** — health/readiness, graceful shutdown, structured errors, and safe logging are qualified. **CLOSED / PASS for construction qualification of the current operational boundary; production qualification remains open.**
6. **Automated qualification** — build and negative security/runtime checks run deterministically in CI. **Construction checks exist and are passing for the current branch state; they do not close production gates.**
7. **Database reconciliation** — actual GHM PostgreSQL catalog evidence is captured and reconciled before dependent product/business migrations are authored. **Dedicated-schema catalog reconciliation and Business Identity runtime qualification are PASS for the current construction slice. The existing catalog artifact remains an app-role-scoped snapshot captured through `DATABASE_URL` (`ghm_app_user` → `ghm_db_user`), not an authoritative full-database catalog. Canonical GHM recovery has also been captured separately through the dedicated migrator/schema-owner path. Remaining work is provider/bootstrap authority limits, legacy authority cleanup, and subsequent governed resource slices.**
7a. **Business Offering resource slice** — migration, repository, service, registry, and runtime privilege boundary are **CLOSED / PASS**. Live PostgreSQL qualification passed on 2026-10-01; public HTTP exposure remains separately gated.
8. **Product adapters** — governed Connect capability seams may be construction-qualified only after their concrete backend contracts and authorization boundaries are evidenced. **Connect Business Offering capability adapter: CLOSED / PASS. Connect Business Capability read adapter: CLOSED / PASS. Connect Opportunity Participant adapter: CLOSED / PASS for construction qualification. Connect Business Capability lifecycle/verification transition authority: CLOSED / PASS for construction qualification. Broader adapters and QuoteFlow remain governed work. QuoteFlow Customer and Business Profile reconciliation are complete at the current evidence boundary; QuoteFlow Quote is structurally reconciled but its cross-system identity/customer ownership remains unqualified. No QuoteFlow adapter is authorized. This does not authorize cutover.**
9. **Shadow qualification** — product workflows are exercised against GHM while Supabase remains authoritative. **Not started.**
10. **Controlled cutover** — migrate one product at a time with an explicit rollback path. **Not started; production remains on Supabase.**

## Current closed construction gates

### Business Capability Lifecycle / Verification Transition: CLOSED / PASS

The Business Capability lifecycle transition authority is now constructed and runtime-qualified against the live PostgreSQL boundary.

The qualified transition boundary is deliberately separate from Business Capability assertion/create/read: assertion records what a Business claims about a Capability; verification is a governed state transition; evidence remains a separate future boundary.

Qualified transitions are:
- `unverified → pending`
- `pending → verified`
- `pending → rejected`
- `verified → revoked`
- `verified → expired`
- `rejected → pending`
- `revoked → pending`
- `expired → pending`

The transition authority requires an authenticated GHM `admin` context. Non-admin and business-owner contexts are denied. Verifier identity is derived from the authenticated context.

The boundary enforces expected-current-state matching, transaction/row-lock serialization, reason requirements, derived verification timestamps, and immutable assertion content. Direct runtime table UPDATE and DELETE remain denied; the runtime role receives only the narrowly governed transition execution privilege.

On 2026-10-03:
- repository suite: **516/516 PASS**
- live migration/build: **PASS**
- lifecycle runtime qualification: **PASS**
- persisted assertion immutability reconciliation: **PASS**
- runtime privilege boundary: **UPDATE=no, DELETE=no, TRANSITION=execute**

Final result: **GHM BUSINESS CAPABILITY LIFECYCLE RUNTIME QUALIFICATION: PASS**.

This closes the Business Capability lifecycle/verification construction slice. It does not authorize evidence storage, automated verification, public HTTP transition routes, production Connect traffic, provider integrations, Supabase migration, shadow qualification, or cutover.


### Trust Score Resource: CLOSED / PASS

The GHM Trust resource is constructed and runtime-qualified. `docs/architecture/TRUST_RESOURCE_CONTRACT.md` and `docs/architecture/TRUST_OPERATION_CONTRACT.md` record the reconciled current contract and qualified operation surface. The dedicated runtime harness passed the Trust schema, authorization, public/private disclosure, concurrency, direct-mutation denial, effective ACL, and cleanup checks; the Business Profile runtime harness also passed the Trust-input and protected-field checks.

Trust consumes qualified Business Profile inputs (description, phone, email) and the Review-owned rating aggregate. Protected Trust inputs (insurance_verified, jobs_completed) remain non-owner-mutable. Identity/CIPC/VAT dimensions remain zero pending authoritative evidence contracts.

The Trust resource is closed for the current construction slice. Calculation-version/provenance hardening and future evidence domains are separately governed work; no production routing, shadow traffic, migration, or cutover is authorized.

### Commercial Payment Preparation: CLOSED / PASS for construction boundary

Canonical country/currency reference data and provider-neutral commercial payment preparation are qualified. Runtime commercial payment write qualification, transactional rollback, and least-privilege boundaries passed. Provider checkout, callbacks/results, webhook application, production credentials, and cutover remain separately governed.

### Connect Business Offering Capability Adapter: CLOSED / PASS

The explicit Connect Business Offering capability seam is construction-qualified. The adapter binds the resolved resource/capability/operation, requires an authenticated `business` or `admin` role before service access, validates identifiers, delegates to the canonical Business Offering service, and rejects customer context before any service call. Local validation passed 504/504 tests. This seam does not authorize production traffic, shadow qualification, or Supabase replacement.

### Connect Business Capability Read Adapter: CLOSED / PASS

The Connect Business Capability read seam has been constructed as a bounded adapter. It binds `business_capability.read` to the `business_capability` resource and `read` operation, validates the business identifier, and delegates to the canonical GHM Business Capability service. GHM repository authorization remains authoritative for active-business membership. Connect currently projects nested Capability and Business Capability Evidence data; those projections are deliberately not fabricated here because GHM has no separately qualified projection contract. Local qualification passed 510/510 tests. This seam does not reproduce Connect's nested Capability/Evidence projection and therefore does not authorize production replacement of that richer Connect projection.

### Connect Opportunity Participant Capability Adapter: CLOSED / PASS

The Connect Opportunity Participant adapter exposes the already-qualified Opportunity Participant service through the governed capability path:

- `opportunity_participant.read`
- `opportunity_participant.create`
- `opportunity_participant.update`

The adapter enforces resource/capability/operation alignment, positive identifiers, and delegation through the canonical service with the authenticated GHM context. Governed HTTP tests exercise the service chain.

The full repository qualification run on 2026-10-03 passed **515/515 tests**, including the Opportunity Participant adapter and Connect service HTTP coverage.

The dedicated live PostgreSQL runtime qualification was then executed on 2026-10-03 and passed the participant schema, least-privilege, authorization, validation, immutable-field, concurrency, direct-mutation-denial, list, persistence-reconciliation, and cleanup checks.

Final result: **OPPORTUNITY PARTICIPANT RUNTIME QUALIFICATION PASS**.

The Opportunity Participant resource and Connect adapter are therefore closed for construction qualification.

No production Connect traffic, public/browser exposure, provider change, Supabase migration, shadow qualification, or cutover is authorized.

### Dedicated Schema → Business Identity Runtime: CLOSED / PASS

The relocated first-slice Business Identity runtime qualification passed the canonical `ghm.*` checks, including atomic duplicate-slug rollback and concurrent Business creation serialization.

### Transaction Qualification: CLOSED / PASS

Transaction qualification is closed for the first Business Identity slice against the relocated `ghm` schema.

### Authorization Qualification: CLOSED / PASS

Authorization qualification is closed for construction qualification of the first canonical Business Identity slice.

### TEMP Privilege Decision: CLOSED / NO GRANT REQUIRED

The current runtime source and qualification harness require no temporary tables or other temporary objects. Least privilege therefore requires no `TEMP` grant to `ghm_runtime` at this stage.

## Resource API — first-slice qualification

The first Business Identity Resource API slice is implemented and qualified. No generic table/query endpoint is permitted.

## Provider / bootstrap authority gate

**Status: OPEN / BLOCKED FOR MUTATION**

Render workspace/resource administration is established, but PostgreSQL bootstrap/superuser authority is not established through the customer-facing control plane. Dedicated GHM roles cannot independently revoke legacy `ghm_db_user` memberships granted by `postgres`.

Therefore no credential rotation, pgAdmin deployment, production `DATABASE_URL` change, or cutover is authorized merely to seek bootstrap authority.

## Recovery evidence

A canonical GHM-only recovery dump was captured through the dedicated migrator/schema-owner path and verified as a custom archive. No restore was performed. It covers the canonical `ghm` schema only.

## Important sequencing interpretation

Qualified resource slices establish only their governed construction boundaries. They do not imply complete GHM product parity.

The provider/bootstrap authority and legacy-role cleanup remain constrained by the currently available managed PostgreSQL authority. Construction may advance only to resource slices whose database contracts and privileges can be evidenced without relying on unresolved bootstrap authority.

## Hard stop conditions

Do not proceed where live PostgreSQL schema is unknown/reconciled inadequately, startup mutates product schema, generic table querying crosses resource boundaries, authorization leaks query context, required rollback/evidence is missing, or legacy authority cleanup requires unavailable bootstrap privileges.

## Production safety

This sequence is construction-only until separate release authorization. Supabase remains the production authority for Connect and QuoteFlow.

No construction qualification authorizes production environment-variable changes, DNS/routing changes, credential rotation, data migration, or product traffic cutover.
