-- Add Business-scoped Customer ownership for QuoteFlow while preserving
-- existing account-scoped Customer rows and API behavior.
ALTER TABLE ghm.customer
  ADD COLUMN business_id bigint NULL
    REFERENCES ghm.business(id) ON DELETE RESTRICT;

ALTER TABLE ghm.customer
  ADD CONSTRAINT customer_business_id_id_uk UNIQUE (business_id, id);

CREATE INDEX customer_business_created_idx
  ON ghm.customer (business_id, created_at DESC, id DESC)
  WHERE business_id IS NOT NULL;

ALTER TABLE ghm.quote
  ADD COLUMN business_id bigint NULL;

ALTER TABLE ghm.quote
  ADD CONSTRAINT quote_business_customer_fk
  FOREIGN KEY (business_id, customer_id)
  REFERENCES ghm.customer (business_id, id)
  ON DELETE RESTRICT;

CREATE INDEX quote_business_created_idx
  ON ghm.quote (business_id, created_at DESC, id DESC)
  WHERE business_id IS NOT NULL;

-- Preserve the existing least-privilege column grants. Runtime may set the
-- tenant key only during INSERT; it cannot move records between Businesses.
GRANT INSERT (business_id) ON TABLE ghm.customer TO ghm_runtime;
GRANT INSERT (business_id) ON TABLE ghm.quote TO ghm_runtime;

-- Existing account-scoped records retain NULL business_id. No automatic
-- account-to-Business mapping or data migration is performed here.
