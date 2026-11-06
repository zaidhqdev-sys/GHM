-- Link each customer Project to the canonical project-type Opportunity.
-- Creation is performed in one authorized application transaction.
ALTER TABLE ghm.project
  ADD COLUMN opportunity_id bigint;

ALTER TABLE ghm.project
  ADD CONSTRAINT project_opportunity_fk
  FOREIGN KEY (opportunity_id)
  REFERENCES ghm.opportunity(id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX project_opportunity_unique
  ON ghm.project(opportunity_id)
  WHERE opportunity_id IS NOT NULL;

COMMENT ON COLUMN ghm.project.opportunity_id IS
  'Canonical GHM project-type Opportunity created atomically with this Project.';
