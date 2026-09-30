-- Narrow the runtime Business Capability create boundary after the initial
-- relation migration was applied. The original migration checksum is preserved.

REVOKE INSERT (
  assertion_status,
  assertion_basis,
  verification_status,
  submitted_at,
  verified_by,
  verified_at,
  verification_reason
)
  ON TABLE ghm.business_capability
  FROM ghm_runtime;

GRANT INSERT (
  business_id,
  capability_id,
  proficiency_level,
  description,
  effective_from,
  effective_until,
  source_reference,
  created_by
)
  ON TABLE ghm.business_capability
  TO ghm_runtime;

-- No runtime UPDATE or DELETE is granted.
