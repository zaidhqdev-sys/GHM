# GHM Trust Resource Contract

**Status:** QUALIFIED / CLOSED — canonical GHM Trust construction slice  
**Date:** 2026-10-03

## Purpose

This document records the reconciled GHM-owned Trust contract after construction and runtime qualification. GHM Trust is the canonical backend Trust resource for future Connect and QuoteFlow use. Supabase remains the production authority until a separately authorized shadow/cutover gate.

GHM Trust is a future backend-owned domain for Connect and QuoteFlow. During construction and qualification, Supabase remains the production authority. The Connect Trust implementation is source evidence for compatibility requirements only; its tables, RPCs, policies, and calculation code are not copied as GHM implementation.

## Canonical ownership

GHM owns the canonical Trust domain once this contract is constructed and qualified.

- Business Identity owns business identity and lifecycle facts.
- Review owns review facts and review lifecycle.
- Project/outcome domains own their respective commercial-work facts when those domains are qualified and explicitly admitted as Trust evidence.
- Verification/evidence domains own authoritative verification facts when such contracts exist.
- Trust owns the derived Trust result, calculation version, and provenance of admitted inputs.
- Connect remains production authority until a separately authorized shadow/cutover gate is completed.

Trust must not become a second owner of source facts.

## Resource identity

The GHM resource is **Business Trust**.

- One current Trust result per Business.
- Business Identity is the referenced business owner.
- Trust has no independent business identity.
- A Trust result must not outlive its Business.
- Historical calculation lineage may be retained only if separately justified by the Trust persistence contract.

The physical table name is intentionally not prescribed. GHM must not inherit Connect's `public.trust_scores` name merely for compatibility.

## Result contract

A current Business Trust result must expose, at minimum:

- `business_id`
- bounded derived Trust dimensions
- `total_score`
- `trust_level`
- `calculation_version`
- `calculated_at`
- `updated_at`

The current qualified dimension set and score ranges are declared in the Trust schema contract and enforced by schema. They are not caller-editable.

A Trust level is derived from the calculated score and is not independently editable.

## Evidence-input contract

Trust calculation may consume only evidence owned by a canonical GHM resource.

Every admitted input requires:

1. a named canonical owner;
2. a defined authorization boundary;
3. a defined lifecycle/status meaning;
4. a deterministic mapping into the Trust calculation;
5. qualification evidence for the upstream resource.

Connect's current evidence dimensions are compatibility evidence, not automatically admitted GHM inputs:

- profile completeness;
- phone/email verification;
- identity verification;
- CIPC verification;
- VAT verification;
- insurance verification;
- review contribution;
- completed-project contribution.

Identity, CIPC, and VAT remain unavailable to Trust until GHM has authoritative evidence contracts for those facts.

Trust must not manufacture verification facts from unrelated fields.

## Calculation ownership

GHM owns Trust calculation.

The calculation must be:

- deterministic for a fixed set of admitted inputs and calculation version;
- implemented in a GHM service/domain boundary;
- transactionally consistent with the persisted result;
- versioned so calculation changes are distinguishable;
- independently testable without Supabase.

A provider or product adapter must never calculate or directly mutate Trust.

## Authorization contract

The GHM authorization layer owns Trust authorization.

Required operation identifiers:

- `trust.read` — read a Trust result when the caller is entitled to the Business Trust resource.
- `trust.calculate` — request recalculation for an entitled Business context.
- Administrative access may be granted only through the existing governed administrator boundary.

`trust_score.calculate` is membership-gated to active Business owners/administrators. Members, outsiders, and unauthenticated callers are denied. Public reads require active + verified + approved Business visibility. No direct Trust row create/update/delete operation is exposed.

Public read behavior is a resource disclosure rule, not an authorization bypass. A public-safe Trust projection may be exposed only for Businesses satisfying the canonical public Business visibility/approval boundary. Private or non-public Trust data remains permission-controlled.

No caller may update individual Trust dimensions directly.

## Persistence contract

Trust persistence is owned by GHM.

A calculation operation must persist the complete derived result atomically. Partial dimension writes are not permitted.

Persistence must enforce:

- one current result per Business;
- valid Business foreign-key ownership;
- bounded score values;
- valid Trust level values;
- calculation-version presence;
- timestamp integrity;
- transaction rollback on failed calculation or persistence.

The runtime role receives only the minimum Trust privileges required by the qualified repository/service boundary. Migration authority remains separate.

## Provenance contract

A Trust result must be explainable from its admitted inputs and calculation version.

The current implementation does not persist a separate calculation-version or provenance record. Those remain future hardening requirements. The current implementation records enough persisted result state to support the qualified calculation/read boundary.\n\nThe future provenance contract must preserve enough information to answer:

- which calculation version produced the result;
- when it was calculated;
- which canonical input domains were consulted;
- whether an expected evidence dimension was unavailable because its authoritative contract did not yet exist.

Provenance must not duplicate source records.

## Connect compatibility boundary

Connect source evidence at commit `abcffa73f893602c25310a58946bebb91fd7eeb5` establishes these compatibility facts:

- Trust is persisted one-per-Business;
- Trust is a derived result;
- Connect exposes a Trust calculation operation requiring authentication and Trust permission;
- public visibility is restricted to active, verified, approved businesses unless the caller has Trust permission;
- identity, CIPC, and VAT contributions remain zero where authoritative evidence contracts do not exist.

These facts constrain compatibility analysis. They do not authorize copying the Connect table, RPC, RLS policies, or calculation implementation into GHM.

## Qualification contract

The Trust construction slice is qualified / closed. The dedicated runtime harness verifies:

1. Business Trust identity and Business foreign-key integrity;
2. calculation determinism;
3. calculation-version behavior;
4. unauthenticated denial;
5. denial without the Trust permission;
6. public disclosure boundary;
7. direct dimension-write denial;
8. atomic persistence and rollback;
9. one-current-result invariant;
10. provenance integrity;
11. runtime least-privilege boundaries;
12. compatibility with the existing GHM qualification suite.

A Trust HTTP adapter or Connect adapter is a separate gate after the canonical GHM resource is qualified.

## Explicit non-goals

This contract does not authorize:

- copying `public.trust_scores`;
- copying `calculate_business_trust_score(uuid)`;
- changing Supabase;
- routing production Connect or QuoteFlow traffic to GHM;
- migrating Trust data;
- changing provider configuration;
- exposing a new production HTTP endpoint;
- implementing verification providers;
- inventing CIPC, VAT, identity, insurance, review, or project evidence that GHM does not canonically own.

## Construction gate

**Trust Contract Definition: CLOSED / READY FOR IMPLEMENTATION DESIGN**

The architecture contract is sufficiently defined to begin a separate implementation-design gate.

Implementation still requires:

- migration design;
- exact calculation/dimension contract;
- repository/service boundary;
- authorization registry mapping;
- live schema/privilege reconciliation for the new resource;
- qualification harness and negative security tests.

No implementation mutation is authorized by this document alone.
