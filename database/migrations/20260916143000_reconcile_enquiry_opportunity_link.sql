ALTER TABLE ghm.enquiry
  ADD COLUMN opportunity_id bigint
  REFERENCES ghm.opportunity(id)
  ON DELETE RESTRICT;

CREATE INDEX enquiry_opportunity_idx
  ON ghm.enquiry (opportunity_id)
  WHERE opportunity_id IS NOT NULL;

GRANT INSERT (
  business_id,
  customer_id,
  customer_name,
  customer_phone,
  customer_email,
  project,
  description,
  city,
  budget_min,
  budget_max,
  urgency,
  source,
  opportunity_id
)
ON TABLE ghm.enquiry TO ghm_runtime;
