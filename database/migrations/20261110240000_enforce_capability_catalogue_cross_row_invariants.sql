-- Serialize Capability hierarchy mutations and enforce cross-row invariants
-- at the database boundary, including direct SQL writes.

BEGIN;

CREATE OR REPLACE FUNCTION ghm.enforce_capability_catalogue_database_invariants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  ancestor_id uuid;
  parent_status text;
  replacement_status text;
  replacement_version integer;
BEGIN
  -- A transaction-scoped global lock prevents two concurrent hierarchy
  -- updates from each validating against a stale, acyclic snapshot.
  PERFORM pg_advisory_xact_lock(741923, 20261110);

  NEW.name := btrim(NEW.name);
  NEW.slug := lower(btrim(NEW.slug));
  NEW.source_authority := btrim(NEW.source_authority);
  IF NEW.description IS NOT NULL THEN NEW.description := btrim(NEW.description); END IF;
  IF NEW.source_reference IS NOT NULL THEN NEW.source_reference := btrim(NEW.source_reference); END IF;

  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'Capability cannot be its own parent';
    END IF;
    SELECT lifecycle_status INTO parent_status
      FROM ghm.capability WHERE id = NEW.parent_id;
    IF NOT FOUND OR parent_status = 'retired' THEN
      RAISE EXCEPTION 'Capability parent not found or retired';
    END IF;

    ancestor_id := NEW.parent_id;
    WHILE ancestor_id IS NOT NULL LOOP
      IF ancestor_id = NEW.id THEN
        RAISE EXCEPTION 'Capability hierarchy cycle detected';
      END IF;
      SELECT parent_id INTO ancestor_id
        FROM ghm.capability WHERE id = ancestor_id;
    END LOOP;
  END IF;

  IF NEW.replaced_by_capability_id IS NOT NULL THEN
    IF NEW.replaced_by_capability_id = NEW.id OR NEW.lifecycle_status NOT IN ('deprecated', 'retired') THEN
      RAISE EXCEPTION 'Capability replacement is inconsistent with lifecycle state';
    END IF;
    SELECT lifecycle_status, taxonomy_version
      INTO replacement_status, replacement_version
      FROM ghm.capability WHERE id = NEW.replaced_by_capability_id;
    IF NOT FOUND OR replacement_status <> 'active' OR replacement_version <> NEW.taxonomy_version THEN
      RAISE EXCEPTION 'Replacement must reference a different active Capability in the same taxonomy version';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.lifecycle_status <> 'draft' AND NEW.slug <> OLD.slug THEN
    RAISE EXCEPTION 'Published Capability slug is immutable';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (OLD.lifecycle_status IS DISTINCT FROM NEW.lifecycle_status
          OR OLD.taxonomy_version IS DISTINCT FROM NEW.taxonomy_version)
     AND EXISTS (
       SELECT 1
         FROM ghm.capability dependent
        WHERE dependent.replaced_by_capability_id = OLD.id
          AND dependent.id <> OLD.id
          AND (NEW.lifecycle_status <> 'active'
               OR dependent.taxonomy_version <> NEW.taxonomy_version)
     ) THEN
    RAISE EXCEPTION 'Capability cannot leave active state or change taxonomy version while referenced as a replacement';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION ghm.enforce_capability_catalogue_database_invariants() OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.enforce_capability_catalogue_database_invariants() FROM PUBLIC, ghm_runtime, ghm_actor_gateway;

DROP TRIGGER IF EXISTS capability_database_invariants ON ghm.capability;
CREATE TRIGGER capability_database_invariants
BEFORE INSERT OR UPDATE ON ghm.capability
FOR EACH ROW
EXECUTE FUNCTION ghm.enforce_capability_catalogue_database_invariants();

COMMIT;
