PROJECT PUBLIC DISCLOSURE CONTRACT

Status: Construction contract — public disclosure boundary defined, implementation not yet authorized
Owner: GHM architecture
Canonical resource: ghm.project
Related resource contract: PROJECT_RESOURCE_CONTRACT.md
Related schema contract: PROJECT_SCHEMA_CONTRACT.md


1. PURPOSE

This document defines the public disclosure boundary for the governed GHM
Project resource.

The purpose is to distinguish:

1. private owner-resource access to ghm.project; and
2. public discovery of eligible Project opportunities.

Public discovery MUST NOT be implemented by exposing ghm.project directly.

A future public Project capability MUST use a dedicated public projection or
equivalent governed read boundary.


2. CANONICAL PRODUCT PRECEDENT

Zaid Connect establishes the current ecosystem precedent for Project
marketplace disclosure.

The Connect Project implementation:

- keeps the primary Project relation private;
- exposes a separate project_marketplace projection;
- permits anonymous and authenticated read access to that projection;
- exposes only open Projects;
- exposes non-sensitive Project fields;
- does not expose the Project owner's private account identity through the
  marketplace projection.

This precedent establishes the intended architectural direction for GHM.

It does NOT make GHM dependent on Zaid Connect.

GHM MUST retain its own canonical schema, authorization boundary, and
implementation.


3. PUBLIC ELIGIBILITY

The baseline public eligibility rule is:

    Project.status = 'open'

Only open Projects are eligible for public disclosure.

A Project whose status is:

- in_progress
- completed
- cancelled

MUST NOT appear in the public Project projection.

The public projection MAY expose the status field for contract consistency,
but under the current eligibility rule a publicly disclosed Project will have
status = 'open'.

Additional moderation, publication, verification, or account-state gates
have not been authorized by this contract.

If such gates are required later, they MUST be explicitly added to the
canonical Project governance contract before implementation.


4. PUBLIC REPRESENTATION

The future public Project representation is:

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

These fields correspond to the non-sensitive Project representation already
established by the Connect marketplace precedent, except for Connect-specific
quote information that does not exist in GHM.


5. PRIVATE FIELDS

The following MUST NOT be exposed through the public Project projection:

- account_id
- owner identity
- internal authorization context
- Business membership information
- internal membership identifiers
- authentication information
- internal moderation metadata
- internal governance metadata
- quote or engagement information
- private account information
- internal database/security metadata

The Project owner MUST NOT become publicly identifiable merely because a
Project is publicly discoverable.


6. QUOTE BOUNDARY

GHM currently does not contain a Project quote relation.

Therefore the GHM public Project projection MUST NOT introduce:

- project_quotes
- quotes_received
- quote acceptance state
- quote rejection state
- business quote relationships
- quote transaction information

Connect's project_marketplace projection includes a quotes_received count
because Connect has a governed project_quotes relation.

That field MUST NOT be copied into GHM.

If GHM later introduces Project engagement or quote resources, their public
disclosure rules MUST be defined separately.


7. ACCESS MODEL

Public Project discovery is a separate capability from owner-resource access.

The intended future boundary is:

Anonymous user
    |
    v
Public Project projection
    |
    v
Open Projects only

Authenticated non-owner
    |
    v
Public Project projection
    |
    v
Open Projects only

Project owner
    |
    +--> authenticated owner resource access
    |
    +--> public projection for eligible open Project

The existing owner-resource operations MUST NOT be repurposed as the public
marketplace API.

In particular:

- getOwnedProject() is not a public-read operation;
- owner authorization MUST remain intact;
- public access MUST NOT require account ownership;
- public access MUST NOT grant access to private Project fields.


8. DATABASE BOUNDARY

The existing ghm.project table remains the canonical private Project
relation.

The current ghm_runtime privileges MUST NOT be broadened merely to make
Projects public.

A future public disclosure implementation SHOULD use a dedicated projection,
view, or equivalent governed read surface.

Direct anonymous access to ghm.project is prohibited.

A generic endpoint that exposes arbitrary columns from ghm.project is
prohibited.

A public database grant on ghm.project is prohibited unless a future
architecture contract explicitly replaces this boundary.


9. PROJECTION PRINCIPLE

The public representation SHOULD be implemented as a deliberately defined
projection rather than as a generic table serialization.

The projection MUST:

- select only explicitly authorized public fields;
- enforce status = 'open';
- exclude account ownership information;
- exclude internal authorization information;
- exclude future private fields by default;
- avoid coupling public disclosure to private owner-resource operations.

Adding a new column to ghm.project MUST NOT automatically make that column
public.


10. IDENTIFIERS

The Project id MAY be exposed publicly as the identifier of the public
Project opportunity.

The public identifier MUST NOT provide access to private owner information.

Knowledge of a public Project id MUST NOT bypass:

- owner authorization;
- private Project reads;
- Project update authorization;
- lifecycle authorization;
- any future private engagement boundary.


11. LIFECYCLE

The canonical GHM Project lifecycle remains:

- open
- in_progress
- completed
- cancelled

Public disclosure is currently limited to:

    open

Lifecycle transitions remain governed by the Project resource contract.

This document does not authorize arbitrary public lifecycle mutation.


12. SEARCH AND DISCOVERY

Public disclosure establishes a read boundary.

It does not by itself authorize:

- generic search;
- ranking;
- recommendation;
- geographic radius search;
- marketplace filtering beyond the canonical public eligibility rule;
- pagination policy;
- sorting policy;
- discovery analytics;
- personalization.

Those capabilities require separate contracts if introduced.


13. BUSINESS RELATIONSHIP

A Project's ownership is determined by:

    ghm.project.account_id
        ->
    ghm.account_identity.id

Business membership does not establish Project ownership.

The public Project representation MUST NOT expose Business membership or imply
that a Project is owned by a Business merely because an account has Business
relationships.


14. CONNECT RELATIONSHIP

Zaid Connect and GHM have related Project concepts but separate canonical
resources.

Connect's Project marketplace behavior is treated as ecosystem precedent.

GHM MUST NOT:

- copy Connect's database tables;
- copy Connect's profile identifiers;
- introduce customer_id -> profiles.id;
- introduce project_quotes solely to reproduce Connect behavior;
- depend on Connect runtime services;
- create a Connect adapter as part of the public Project foundation.

Cross-system integration, if required later, must be separately governed.


15. CURRENT IMPLEMENTATION STATUS

The current GHM implementation provides:

- Project creation;
- owner-bound Project reads;
- owner-bound Project updates;
- lifecycle protection;
- runtime authorization;
- runtime ACL protection.

The current implementation does NOT provide:

- anonymous Project reads;
- authenticated non-owner marketplace reads;
- a public Project route;
- a public Project projection;
- marketplace search;
- public ranking;
- Project quotes;
- quote acceptance;
- marketplace transactions.

Therefore this contract defines and governs the public disclosure boundary.
Implementation is authorized only for construction qualification of the
dedicated projection and runtime read boundary described below. Production
deployment, product cutover, and provider migration remain unauthorized.


16. REQUIRED IMPLEMENTATION QUALIFICATION

Before public Project disclosure is implemented, qualification MUST establish:

1. anonymous access is limited to the public projection;
2. authenticated non-owner access is limited to the public projection;
3. only status = 'open' Projects are disclosed;
4. account_id is not disclosed;
5. owner identity is not disclosed;
6. private Project fields cannot be reached through the public boundary;
7. direct access to ghm.project remains protected;
8. public projection columns are explicitly allowlisted;
9. non-open Projects are excluded;
10. public access cannot mutate Projects;
11. owner-resource authorization remains unchanged;
12. Project quote functionality is not implicitly introduced;
13. projection behavior is covered by automated tests;
14. live runtime qualification confirms the actual database boundary.


17. EXPLICIT EXCLUSIONS

This contract does NOT authorize:

- project_quotes;
- quote acceptance;
- quote rejection;
- marketplace transactions;
- Business verification;
- Business ownership of Projects;
- generic public table endpoints;
- anonymous database access to ghm.project;
- arbitrary lifecycle mutation;
- Project deletion;
- ranking;
- recommendations;
- geographic search;
- personalization;
- Connect adapters;
- production migration/cutover.


18. GOVERNANCE RULE

The public Project representation is a governed capability.

No implementation may expose additional Project fields merely because they
exist in ghm.project.

Any new public field, eligibility rule, moderation rule, lifecycle rule, or
external relationship MUST be added to this contract or its canonical parent
contract before implementation.

The canonical rule is:

    private Project relation
        ->
    explicit public projection
        ->
    open Projects only
        ->
    explicitly authorized non-sensitive fields


19. CURRENT DECISION

PUBLIC DISCLOSURE DIRECTION: APPROVED

PUBLIC DISCLOSURE IMPLEMENTATION: AUTHORIZED FOR CONSTRUCTION QUALIFICATION

The governed implementation stage is the dedicated public projection and its
runtime read boundary. This authorization covers only construction database
objects, application code, automated qualification, and live construction
runtime evidence.

This authorization does NOT authorize production deployment, production
database migration, provider/bootstrap mutation, product cutover, shadow
traffic, DNS/routing changes, or migration of Zaid Connect or QuoteFlow.
