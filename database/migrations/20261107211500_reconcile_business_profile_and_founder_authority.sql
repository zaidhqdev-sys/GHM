-- Reconcile the deployed Business projection and founder-authority lookup.
-- Safe to apply when some profile fields already exist. This migration does not
-- seed reviewer identities or change any Business verification state.


ALTER TABLE ghm.business
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS logo_storage_object_id bigint
    REFERENCES ghm.storage_object(id) ON DELETE SET NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'ghm.business'::regclass
      AND conname = 'business_latitude_range_check'
  ) THEN
    ALTER TABLE ghm.business
      ADD CONSTRAINT business_latitude_range_check
      CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'ghm.business'::regclass
      AND conname = 'business_longitude_range_check'
  ) THEN
    ALTER TABLE ghm.business
      ADD CONSTRAINT business_longitude_range_check
      CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'ghm.business'::regclass
      AND conname = 'business_coordinates_pair_check'
  ) THEN
    ALTER TABLE ghm.business
      ADD CONSTRAINT business_coordinates_pair_check
      CHECK ((latitude IS NULL) = (longitude IS NULL));
  END IF;
END;
$migration$;

CREATE UNIQUE INDEX IF NOT EXISTS business_logo_storage_object_unique
  ON ghm.business (logo_storage_object_id)
  WHERE logo_storage_object_id IS NOT NULL;

COMMENT ON COLUMN ghm.business.latitude IS
  'Owner-managed public directory latitude; paired with longitude.';
COMMENT ON COLUMN ghm.business.longitude IS
  'Owner-managed public directory longitude; paired with latitude.';
COMMENT ON COLUMN ghm.business.logo_storage_object_id IS
  'Canonical GHM storage_object ID for the public Business logo.';

CREATE TABLE IF NOT EXISTS ghm.directory_listing_founder_reviewer (
  account_id bigint PRIMARY KEY REFERENCES ghm.account_identity(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_account_id bigint REFERENCES ghm.account_identity(id) ON DELETE RESTRICT,
  notes text
);
ALTER TABLE ghm.directory_listing_founder_reviewer OWNER TO ghm_schema_owner;
ALTER TABLE ghm.directory_listing_founder_reviewer ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE ghm.directory_listing_founder_reviewer FROM PUBLIC, ghm_runtime;

CREATE OR REPLACE FUNCTION ghm.is_directory_listing_founder_reviewer(p_account_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $function$
  SELECT p_account_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM ghm.directory_listing_founder_reviewer r
    WHERE r.account_id = p_account_id
  );
$function$;

ALTER FUNCTION ghm.is_directory_listing_founder_reviewer(bigint)
  OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.is_directory_listing_founder_reviewer(bigint)
  SET search_path = pg_catalog, ghm;
REVOKE ALL ON FUNCTION ghm.is_directory_listing_founder_reviewer(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.is_directory_listing_founder_reviewer(bigint) TO ghm_runtime;

