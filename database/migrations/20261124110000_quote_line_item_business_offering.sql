-- Add a typed, same-Business reference from Quote line items to the existing Business Offering catalogue.
-- Legacy account-scoped quote lines remain unlinked (NULL Business/Offering IDs).
ALTER TABLE ghm.business_offering
  ADD CONSTRAINT business_offering_business_id_id_uk UNIQUE (business_id, id);

ALTER TABLE ghm.quote
  ADD CONSTRAINT quote_business_id_id_uk UNIQUE (business_id, id);

ALTER TABLE ghm.quote_line_item
  ADD COLUMN business_id bigint NULL,
  ADD COLUMN business_offering_id uuid NULL,
  ADD COLUMN currency_code text NULL,
  ADD COLUMN price_unit text NULL;

ALTER TABLE ghm.quote_line_item
  ADD CONSTRAINT quote_line_item_offering_requires_business_ck
    CHECK (business_offering_id IS NULL OR business_id IS NOT NULL),
  ADD CONSTRAINT quote_line_item_quote_business_fk
    FOREIGN KEY (business_id, quote_id)
    REFERENCES ghm.quote (business_id, id)
    ON DELETE CASCADE,
  ADD CONSTRAINT quote_line_item_offering_business_fk
    FOREIGN KEY (business_id, business_offering_id)
    REFERENCES ghm.business_offering (business_id, id)
    ON DELETE RESTRICT;

CREATE INDEX quote_line_item_business_offering_idx
  ON ghm.quote_line_item (business_id, business_offering_id)
  WHERE business_offering_id IS NOT NULL;

-- Existing account-scoped quote lines remain NULL/NULL and retain their existing behavior.
-- Preserve the runtime's column-level least-privilege model for the new snapshot/reference fields.
GRANT SELECT (business_id, business_offering_id, currency_code, price_unit)
  ON TABLE ghm.quote_line_item TO ghm_runtime;
GRANT INSERT (business_id, business_offering_id, currency_code, price_unit)
  ON TABLE ghm.quote_line_item TO ghm_runtime;
