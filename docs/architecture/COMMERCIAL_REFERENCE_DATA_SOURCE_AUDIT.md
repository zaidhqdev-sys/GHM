# GHM Canonical Commercial Reference-Data Source Audit

**Status:** SOURCE RECONCILIATION — CONSTRUCTION CONTRACT CANDIDATE  
**Date:** 2026-10-03

## Purpose

Reconcile the reference data required by the already-constructed GHM Commercial schema before payment preparation is implemented.

## Authoritative Connect evidence

Connect's regional foundation establishes separate canonical concepts for regions, currencies, locales, countries, administrative areas, regional configurations, and regional membership prices.

For Commercial's current GHM contract, only the country/currency identity needed by ghm.commercial_plan_price is relevant. GHM must not reproduce Connect's UUID model, RLS policies, provider configuration, locale hierarchy, or regional pricing tables.

The Connect migration establishes currencies with ISO-style three-letter codes, names, symbols, and minor-unit precision; countries with alpha-2 and alpha-3 codes, names, and a default currency; and South Africa (ZA / ZAF) and South African Rand (ZAR) as source evidence.

## GHM dependency evidence

docs/architecture/COMMERCIAL_MINIMUM_SCHEMA_CONTRACT.md requires commercial_plan_price.country_id to reference ghm.country when supplied; commercial_plan_price.currency_id to reference ghm.currency; existing canonical GHM rows rather than fixed IDs; a separately governed reference-data migration or existing canonical seed authority; and no silent Commercial seeding.

The current GHM migration tree contains no migration creating ghm.country or ghm.currency.

Therefore the Commercial schema has a repository-level dependency gap that must be resolved before Commercial payment qualification.

## Proposed bounded GHM contract

The reference-data slice should own only canonical currency identity required by GHM Commercial, canonical country identity required by GHM Commercial, the country-to-default-currency relationship where needed, stable natural-code uniqueness, and runtime read access.

It must not own payment-provider configuration, locale presentation, administrative-area hierarchy, Connect UUIDs, product-specific pricing, commercial plan/price seed data, or provider credentials.

## Seed authority

No production reference rows are authorized by this audit alone. Required canonical rows must be introduced by an explicitly governed migration/seed decision. The presence of South Africa/ZAR in Connect is source evidence, not permission to silently copy Connect data into GHM.

## Gate

**OPEN — NOT AUTHORIZED FOR MUTATION.**

Payment preparation remains blocked until this reference-data contract receives explicit construction authorization and its migration ordering, live schema state, privileges, and canonical seed authority are qualified.