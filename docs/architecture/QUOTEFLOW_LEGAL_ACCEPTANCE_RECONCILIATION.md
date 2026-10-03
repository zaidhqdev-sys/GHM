# QuoteFlow Legal Acceptance → GHM Reconciliation

## Status

**SOURCE RECONCILED — NO GHM LEGAL-ACCEPTANCE RESOURCE AUTHORIZED**

This is a documentation/source reconciliation only. It does not authorize a GHM migration, legal-acceptance resource, adapter, Supabase mutation, production routing change, or cutover.

## QuoteFlow source evidence

QuoteFlow has a dedicated legal-document registry:

- `legal_documents`
- `legal_document_versions`
- `legal_acceptances`

Legal documents are product-scoped. The current product is `quoteflow`.

The acceptance record contains:

- document version
- authenticated user
- optional organization
- acceptance timestamp
- acceptance context
- app version

Direct client INSERT/UPDATE/DELETE on legal acceptances is denied. Acceptance is recorded through an authenticated security-definer RPC.

The current acceptance flow explicitly permits **account-level acceptance before an organization exists**:

- `organization_id` may be null;
- default acceptance context is `account_onboarding`;
- the authenticated user is the source of the accepting principal;
- repeated acceptance of the same document version for the same user and organization scope is idempotent.

When an organization is supplied, QuoteFlow requires the authenticated user to be either:

- the organization owner; or
- an active organization owner/admin member.

This means organization association is an additional authorization scope, not the canonical identity of the acceptance itself.

## GHM source evidence

Current GHM source search found no canonical:

- legal acceptance resource;
- legal document registry;
- legal document version resource;
- legal acceptance migration;
- legal acceptance service/repository;
- legal acceptance HTTP capability.

GHM therefore currently has **no established owner or contract** for this domain.

## Ownership conclusion

QuoteFlow legal acceptance cannot be safely attached to:

- Business Identity;
- Business Profile;
- Business Membership;
- Commercial subscription;
- account identity alone.

The product evidence establishes that the accepting principal is an account/user, while organization association is optional and contextual.

That distinction matters because GHM's account identity and Business membership are separate canonical concepts.

## Required future contract

Before constructing a GHM legal-acceptance resource, the following must be explicitly reconciled:

1. canonical document ownership;
2. canonical document-version ownership;
3. accepting principal mapping from QuoteFlow/Supabase Auth to GHM account identity;
4. whether acceptance is account-scoped, Business-scoped, or both;
5. whether Business association is historical context or authorization scope;
6. acceptance-context vocabulary and lifecycle;
7. version/hash/content provenance;
8. re-acceptance rules when a document version changes;
9. read visibility;
10. mutation authority and idempotency;
11. retention/audit requirements;
12. whether existing production QuoteFlow records must migrate or remain Supabase-authoritative.

## Explicit non-goals

Do not create:

- `legal_acceptance` tables;
- legal document tables;
- legal document migrations;
- account-to-organization mapping tables;
- QuoteFlow legal adapters;
- GHM legal HTTP routes;
- production Supabase changes;
- cutover logic.

## Current decision

**QuoteFlow legal acceptance remains QuoteFlow/Supabase-owned.**

GHM should not duplicate or absorb the domain until a separate ownership contract establishes why it must become part of the GHM system of record.

The next reconciliation target is QuoteFlow subscription/entitlement semantics, not implementation.
