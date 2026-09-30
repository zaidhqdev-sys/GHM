CREATE TABLE ghm.capability (
  id uuid PRIMARY KEY,
  parent_id uuid REFERENCES ghm.capability(id) ON DELETE RESTRICT,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  lifecycle_status text NOT NULL DEFAULT 'draft',
  taxonomy_version integer NOT NULL DEFAULT 1,
  effective_from timestamptz,
  effective_to timestamptz,
  source_authority text NOT NULL DEFAULT 'ZAID Connect',
  source_reference text,
  replaced_by_capability_id uuid REFERENCES ghm.capability(id) ON DELETE RESTRICT,
  is_selectable boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT capability_name_valid
    CHECK (length(btrim(name)) BETWEEN 1 AND 120),

  CONSTRAINT capability_slug_valid
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),

  CONSTRAINT capability_description_valid
    CHECK (
      description IS NULL
      OR length(btrim(description)) BETWEEN 1 AND 2000
    ),

  CONSTRAINT capability_sort_order_valid
    CHECK (sort_order >= 0),

  CONSTRAINT capability_lifecycle_valid
    CHECK (
      lifecycle_status IN (
        'draft',
        'active',
        'deprecated',
        'retired'
      )
    ),

  CONSTRAINT capability_taxonomy_version_valid
    CHECK (taxonomy_version BETWEEN 1 AND 1000000),

  CONSTRAINT capability_effective_dates_valid
    CHECK (
      effective_to IS NULL
      OR effective_from IS NULL
      OR effective_to > effective_from
    ),

  CONSTRAINT capability_source_authority_valid
    CHECK (length(btrim(source_authority)) BETWEEN 1 AND 160),

  CONSTRAINT capability_source_reference_valid
    CHECK (
      source_reference IS NULL
      OR length(btrim(source_reference)) BETWEEN 1 AND 500
    ),

  CONSTRAINT capability_not_self_parent
    CHECK (parent_id IS NULL OR parent_id <> id),

  CONSTRAINT capability_not_self_replacement
    CHECK (
      replaced_by_capability_id IS NULL
      OR replaced_by_capability_id <> id
    )
);

CREATE UNIQUE INDEX capability_slug_unique
  ON ghm.capability (slug);

CREATE INDEX capability_parent_idx
  ON ghm.capability (parent_id);

CREATE INDEX capability_lifecycle_sort_idx
  ON ghm.capability (lifecycle_status, sort_order, name);

CREATE INDEX capability_replaced_by_idx
  ON ghm.capability (replaced_by_capability_id)
  WHERE replaced_by_capability_id IS NOT NULL;

CREATE OR REPLACE FUNCTION ghm.enforce_capability_governance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  ancestor_id uuid;
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.slug := lower(btrim(NEW.slug));
  NEW.source_authority := btrim(NEW.source_authority);

  IF NEW.description IS NOT NULL THEN
    NEW.description := btrim(NEW.description);
  END IF;

  IF NEW.source_reference IS NOT NULL THEN
    NEW.source_reference := btrim(NEW.source_reference);
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.lifecycle_status <> 'draft'
     AND NEW.slug <> OLD.slug THEN
    RAISE EXCEPTION
      'Published Capability slug is immutable';
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION
      'Capability cannot be its own parent';
  END IF;

  IF NEW.replaced_by_capability_id = NEW.id THEN
    RAISE EXCEPTION
      'Capability cannot replace itself';
  END IF;

  IF NEW.replaced_by_capability_id IS NOT NULL THEN
    IF NEW.lifecycle_status NOT IN ('deprecated', 'retired') THEN
      RAISE EXCEPTION
        'Only deprecated or retired Capabilities may identify a replacement';
    END IF;

    PERFORM 1
    FROM ghm.capability replacement
    WHERE replacement.id = NEW.replaced_by_capability_id
      AND replacement.lifecycle_status = 'active';

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Capability replacement must reference an active Capability';
    END IF;
  END IF;

  /*
   * Prevent parent hierarchy cycles.
   *
   * Walk upward from the proposed parent. If the current Capability is
   * encountered, the proposed hierarchy would contain a cycle.
   */
  ancestor_id := NEW.parent_id;

  WHILE ancestor_id IS NOT NULL LOOP
    IF ancestor_id = NEW.id THEN
      RAISE EXCEPTION
        'Capability hierarchy cycle detected';
    END IF;

    SELECT parent_id
      INTO ancestor_id
    FROM ghm.capability
    WHERE id = ancestor_id;
  END LOOP;

  IF NEW.lifecycle_status = 'active'
     AND NEW.effective_from IS NULL THEN
    NEW.effective_from := now();
  END IF;

  IF NEW.lifecycle_status IN ('draft', 'active') THEN
    NEW.effective_to := NULL;
    NEW.replaced_by_capability_id := NULL;
  ELSIF NEW.lifecycle_status IN ('deprecated', 'retired')
        AND NEW.effective_to IS NULL THEN
    NEW.effective_to := now();
  END IF;

  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER capability_enforce_governance
BEFORE INSERT OR UPDATE ON ghm.capability
FOR EACH ROW
EXECUTE FUNCTION ghm.enforce_capability_governance();

CREATE OR REPLACE FUNCTION ghm.enforce_capability_retirement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lifecycle_status = 'retired'
     AND (
       TG_OP = 'INSERT'
       OR OLD.lifecycle_status <> 'retired'
     )
  THEN
    PERFORM 1
    FROM ghm.capability child
    WHERE child.parent_id = NEW.id
      AND child.lifecycle_status <> 'retired';

    IF FOUND THEN
      RAISE EXCEPTION
        'Capability cannot be retired while non-retired children exist';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER capability_enforce_retirement
BEFORE INSERT OR UPDATE ON ghm.capability
FOR EACH ROW
EXECUTE FUNCTION ghm.enforce_capability_retirement();

GRANT USAGE ON SCHEMA ghm TO ghm_runtime;

GRANT SELECT ON TABLE ghm.capability TO ghm_runtime;

-- Runtime Capability access is deliberately read-only.
-- No INSERT, UPDATE, DELETE, sequence, DDL, or governance privileges.
