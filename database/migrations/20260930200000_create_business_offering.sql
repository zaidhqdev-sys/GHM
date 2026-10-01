CREATE TABLE ghm.business_offering (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id bigint NOT NULL REFERENCES ghm.business(id) ON DELETE RESTRICT,
  offering_type text NOT NULL DEFAULT 'service',
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  price_amount numeric(14, 2),
  currency_code text NOT NULL DEFAULT 'ZAR',
  price_unit text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by bigint REFERENCES ghm.account_identity(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT business_offering_type_valid
    CHECK (offering_type IN ('service', 'product', 'solution')),
  CONSTRAINT business_offering_name_valid
    CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  CONSTRAINT business_offering_slug_valid
    CHECK (
      length(slug) BETWEEN 1 AND 120
      AND slug = lower(slug)
      AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),
  CONSTRAINT business_offering_description_valid
    CHECK (description IS NULL OR length(btrim(description)) BETWEEN 1 AND 4000),
  CONSTRAINT business_offering_price_valid
    CHECK (price_amount IS NULL OR price_amount >= 0),
  CONSTRAINT business_offering_currency_valid
    CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT business_offering_price_unit_valid
    CHECK (price_unit IS NULL OR length(btrim(price_unit)) BETWEEN 1 AND 80),
  CONSTRAINT business_offering_sort_order_valid
    CHECK (sort_order >= 0),
  CONSTRAINT business_offering_business_slug_unique
    UNIQUE (business_id, slug)
);

CREATE INDEX business_offering_business_active_sort_idx
  ON ghm.business_offering (business_id, is_active, sort_order, name);

CREATE INDEX business_offering_type_active_idx
  ON ghm.business_offering (offering_type, is_active);

CREATE OR REPLACE FUNCTION ghm.touch_business_offering()
RETURNS trigger
LANGUAGE plpgsql
AS $
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$;

CREATE TRIGGER business_offering_updated_at
BEFORE UPDATE ON ghm.business_offering
FOR EACH ROW
EXECUTE FUNCTION ghm.touch_business_offering();

REVOKE ALL ON TABLE ghm.business_offering FROM PUBLIC, ghm_runtime;
GRANT SELECT ON TABLE ghm.business_offering TO ghm_runtime;
GRANT INSERT (
  business_id, offering_type, name, slug, description, price_amount,
  currency_code, price_unit, sort_order, created_by
) ON TABLE ghm.business_offering TO ghm_runtime;
GRANT UPDATE (
  offering_type, name, slug, description, price_amount,
  currency_code, price_unit, is_active, sort_order
) ON TABLE ghm.business_offering TO ghm_runtime;
