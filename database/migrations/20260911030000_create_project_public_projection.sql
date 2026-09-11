CREATE VIEW ghm.project_public AS
SELECT
  id,
  title,
  description,
  category,
  province,
  city,
  budget_min,
  budget_max,
  urgency,
  status,
  created_at,
  updated_at
FROM ghm.project
WHERE status = 'open';

GRANT USAGE ON SCHEMA ghm TO ghm_runtime;

GRANT SELECT
  ON TABLE ghm.project_public
  TO ghm_runtime;
