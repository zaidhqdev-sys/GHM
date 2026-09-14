PROJECT PUBLIC DISCLOSURE CONTRACT

Status: **Construction qualification boundary — dedicated public disclosure slice qualified**
Owner: GHM architecture
Canonical resource: ghm.project
Related resource contract: PROJECT_RESOURCE_CONTRACT.md
Related schema contract: PROJECT_SCHEMA_CONTRACT.md

1. PURPOSE

This document defines the public disclosure boundary for the governed GHM
Project resource. It distinguishes private owner-resource access to
`ghm.project` from public discovery of eligible Project opportunities.

Public discovery MUST NOT expose `ghm.project` directly. The qualified public
capability uses a dedicated projection/read boundary.

2. CANONICAL PRODUCT PRECEDENT

Zaid Connect establishes the current ecosystem precedent for Project
marketplace disclosure: the primary Project relation remains private while a
separate `project_marketplace` projection exposes eligible non-sensitive
fields. This precedent establishes direction only; GHM retains its own
canonical schema, authorization boundary, and implementation.

3. PUBLIC ELIGIBILITY

Only Projects with:

    Project.status = 'open'

are eligible for public disclosure.

Projects with `in_progress`, `completed`, or `cancelled` status MUST NOT be
publicly disclosed.

4. PUBLIC REPRESENTATION

The public Project representation is explicitly allowlisted as:

- id
- title
- description
- category
- province
- city
- budget_min
- budget_max
- urgency
- status
- created_at
- updated_at

5. PRIVATE FIELDS

The public projection MUST NOT expose:

- account_id;
- owner identity;
- internal authorization context;
- Business membership information;
- internal membership identifiers;
- authentication information;
- internal moderation/governance metadata;
- quote or engagement information;
- private account information;
- internal database/security metadata.

6. QUOTE BOUNDARY

GHM now contains the canonical `ghm.project_quote` relation. The public Project
projection MUST NOT introduce quote fields merely to reproduce Connect's
`quotes_received` behavior. Project Quote disclosure remains separately governed.

7. ACCESS MODEL

Public Project discovery is a separate capability from owner-resource access.
Anonymous and authenticated non-owner callers may use only the governed public
projection for eligible open Projects. Project owners retain their private
owner-resource operations. Public access MUST NOT grant private Project access
or mutate Projects.

8. DATABASE BOUNDARY

`ghm.project` remains the canonical private Project relation. Direct
anonymous access to `ghm.project` is prohibited. The runtime role MUST NOT be
broadened merely to make Projects public. The public capability is isolated to
the explicit projection/read boundary.

9. PROJECTION PRINCIPLE

The public representation is a deliberately defined projection. It MUST:

- select only explicitly authorized public fields;
- enforce status = 'open';
- exclude account ownership information;
- exclude internal authorization information;
- exclude future private fields by default;
- remain independent of private owner-resource authorization.

Adding a column to `ghm.project` MUST NOT automatically make that column
public.

10. IDENTIFIERS

The Project id MAY be exposed as the public opportunity identifier. Knowledge
of that id MUST NOT bypass private owner authorization, update authorization,
lifecycle authorization, or future private engagement boundaries.

11. LIFECYCLE

The canonical GHM Project lifecycle remains:

- open
- in_progress
- completed
- cancelled

Public disclosure remains limited to `open`. This document does not authorize
public lifecycle mutation.

12. SEARCH AND DISCOVERY

Public disclosure establishes a read boundary only. It does not authorize
generic search, ranking, recommendation, geographic radius search, discovery
analytics, personalization, or an expanded filtering/sorting contract.

13. BUSINESS RELATIONSHIP

Project ownership is determined by:

    ghm.project.account_id -> ghm.account_identity.id

Business membership does not establish Project ownership and must not be
exposed by the public representation.

14. CONNECT RELATIONSHIP

Connect's Project marketplace behavior is ecosystem precedent. GHM MUST NOT
copy Connect tables, provider identifiers, `project_quotes`, or Connect
runtime dependencies. Cross-system integration, if required later, is a
separate governed activity.

15. CURRENT IMPLEMENTATION STATUS

The current GHM implementation provides:

- private Project creation;
- owner-bound Project reads;
- owner-bound Project updates;
- lifecycle protection;
- runtime authorization;
- runtime ACL protection;
- a dedicated public Project projection/read boundary for eligible open
  Projects.

Anonymous and authenticated non-owner public reads are therefore part of the
qualified construction slice, subject to the explicit projection and
eligibility contract. Marketplace search, ranking, recommendations, Project
quotes, marketplace transactions, and broader discovery remain out of scope.

16. QUALIFICATION REQUIREMENTS

The qualified public boundary must establish and preserve:

1. anonymous access is limited to the public projection;
2. authenticated non-owner access is limited to the public projection;
3. only status = 'open' Projects are disclosed;
4. account_id and owner identity are not disclosed;
5. private Project fields cannot be reached through the public boundary;
6. direct access to `ghm.project` remains protected;
7. public columns are explicitly allowlisted;
8. non-open Projects are excluded;
9. public access cannot mutate Projects;
10. owner-resource authorization remains unchanged;
11. Project Quote functionality exists as a separately governed resource and is not implicitly introduced into the public Project disclosure projection;
12. automated tests cover the projection boundary;
13. live runtime qualification confirms the actual database boundary.

17. EXPLICIT EXCLUSIONS

This contract does NOT authorize:

- project_quotes;
- quote acceptance/rejection;
- marketplace transactions;
- Business verification;
- Business ownership of Projects;
- generic public table endpoints;
- anonymous database access to `ghm.project`;
- arbitrary lifecycle mutation;
- Project deletion;
- ranking;
- recommendations;
- geographic search;
- personalization;
- Connect adapters;
- production migration/cutover.

18. GOVERNANCE RULE

The public Project representation is a governed capability. No implementation
may expose additional Project fields merely because they exist in
`ghm.project`. Any new public field, eligibility rule, moderation rule,
lifecycle rule, or external relationship must be added to this contract or
its canonical parent contract before implementation.

19. CURRENT DECISION

**PUBLIC DISCLOSURE DIRECTION: APPROVED**

**PUBLIC DISCLOSURE CONSTRUCTION QUALIFICATION: QUALIFIED / PASS**

The dedicated public projection/read boundary has been constructed and
qualified. This does not authorize production deployment, production
migration, provider/bootstrap mutation, product cutover, shadow traffic,
DNS/routing changes, or migration of Zaid Connect or QuoteFlow.
