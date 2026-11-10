-- Forward-only reconciliation of the live Business profile function contract.
-- This later migration intentionally follows 20261109100000, which replaced the
-- compatibility-aware function with a presentation-only patch allowlist.
-- Restore the current and historical API contract before the Actor Gateway cutover.
-- DO NOT apply to production without the separately approved migration gate.

BEGIN;

ALTER TABLE ghm.business
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

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

COMMENT ON COLUMN ghm.business.latitude IS
  'Owner-managed public directory latitude; paired with longitude.';
COMMENT ON COLUMN ghm.business.longitude IS
  'Owner-managed public directory longitude; paired with latitude.';

CREATE OR REPLACE FUNCTION ghm.update_business_profile(
  p_account_id bigint,
  p_business_id bigint,
  p_patch jsonb
)
RETURNS ghm.business
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $function$
DECLARE
  v_patch jsonb;
  v_key text;
  i integer;
  v_alias text;
  v_set_extra text := '';
  v_allowed_keys text[] := ARRAY[
    'name', 'slug', 'description', 'phone', 'email', 'category',
    'province', 'city', 'physicalAddress', 'whatsapp', 'website',
    'isSupplier', 'yearsInBusiness', 'latitude', 'longitude',
    'avatarLetter', 'avatarColor'
  ];
  v_aliases text[] := ARRAY[
    'physical_address', 'avatar_letter', 'avatar_color', 'years_in_business'
  ];
  v_targets text[] := ARRAY[
    'physicalAddress', 'avatarLetter', 'avatarColor', 'yearsInBusiness'
  ];
  v_updated ghm.business%ROWTYPE;
BEGIN
  IF p_account_id IS NULL OR p_account_id <= 0 THEN
    RAISE EXCEPTION 'Authentication is required to update a Business profile.';
  END IF;
  IF p_business_id IS NULL OR p_business_id <= 0 THEN
    RAISE EXCEPTION 'Business ID must be a positive integer';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'Business profile patch must be a JSON object';
  END IF;
  IF p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'Business update requires at least one field';
  END IF;

  -- Normalize current repository snake_case keys and historical camelCase API keys.
  -- Supplying both spellings with different values is rejected, never silently merged.
  v_patch := p_patch;
  FOR i IN 1..array_length(v_aliases, 1) LOOP
    v_alias := v_aliases[i];
    v_key := v_targets[i];
    IF v_patch ? v_alias AND v_patch ? v_key
       AND v_patch->v_alias IS DISTINCT FROM v_patch->v_key THEN
      RAISE EXCEPTION 'Conflicting Business profile aliases: % and %', v_alias, v_key;
    END IF;
    IF v_patch ? v_alias THEN
      IF NOT (v_patch ? v_key) THEN
        v_patch := jsonb_set(v_patch, ARRAY[v_key], v_patch->v_alias, true);
      END IF;
      v_patch := v_patch - v_alias;
    END IF;
  END LOOP;

  FOR v_key IN SELECT jsonb_object_keys(v_patch) LOOP
    IF NOT (v_key = ANY(v_allowed_keys)) THEN
      RAISE EXCEPTION 'Unsupported Business update field: %', v_key;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM ghm.business_membership
    WHERE business_id = p_business_id
      AND account_id = p_account_id
      AND membership_status = 'active'
      AND membership_role IN ('owner', 'administrator')
  ) THEN
    RAISE EXCEPTION 'Business management permission required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ghm.business WHERE id = p_business_id) THEN
    RAISE EXCEPTION 'Business not found';
  END IF;

  IF v_patch ? 'name' AND (
    jsonb_typeof(v_patch->'name') <> 'string'
    OR btrim(v_patch->>'name') = ''
  ) THEN RAISE EXCEPTION 'Business name is required'; END IF;
  IF v_patch ? 'slug' AND (
    jsonb_typeof(v_patch->'slug') <> 'string'
    OR btrim(v_patch->>'slug') = ''
  ) THEN RAISE EXCEPTION 'Business slug is required'; END IF;
  IF v_patch ? 'description' AND v_patch->'description' <> 'null'::jsonb
     AND (jsonb_typeof(v_patch->'description') <> 'string'
       OR length(v_patch->>'description') > 5000) THEN
    RAISE EXCEPTION 'Business description must be text up to 5000 characters or null';
  END IF;
  IF v_patch ? 'phone' AND v_patch->'phone' <> 'null'::jsonb
     AND (jsonb_typeof(v_patch->'phone') <> 'string'
       OR (length(btrim(v_patch->>'phone')) NOT BETWEEN 7 AND 32
           AND btrim(v_patch->>'phone') <> '')) THEN
    RAISE EXCEPTION 'Phone must be between 7 and 32 characters or null';
  END IF;
  IF v_patch ? 'email' AND v_patch->'email' <> 'null'::jsonb
     AND (jsonb_typeof(v_patch->'email') <> 'string'
       OR (length(btrim(v_patch->>'email')) NOT BETWEEN 3 AND 320
           AND btrim(v_patch->>'email') <> '')) THEN
    RAISE EXCEPTION 'Email must be between 3 and 320 characters or null';
  END IF;
  IF v_patch ? 'category' AND v_patch->'category' <> 'null'::jsonb
     AND (jsonb_typeof(v_patch->'category') <> 'string'
       OR (length(btrim(v_patch->>'category')) NOT BETWEEN 1 AND 100
           OR btrim(v_patch->>'category') !~ '^[a-z0-9]+(-[a-z0-9]+)*$')) THEN
    RAISE EXCEPTION 'Category must be a lowercase slug or null';
  END IF;
  IF v_patch ? 'province' AND v_patch->'province' <> 'null'::jsonb
     AND (jsonb_typeof(v_patch->'province') <> 'string'
       OR length(btrim(v_patch->>'province')) NOT BETWEEN 1 AND 100) THEN
    RAISE EXCEPTION 'Province must contain 1 to 100 characters';
  END IF;
  IF v_patch ? 'city' AND v_patch->'city' <> 'null'::jsonb
     AND (jsonb_typeof(v_patch->'city') <> 'string'
       OR length(btrim(v_patch->>'city')) NOT BETWEEN 1 AND 120) THEN
    RAISE EXCEPTION 'City must contain 1 to 120 characters';
  END IF;
  IF v_patch ? 'physicalAddress' AND v_patch->'physicalAddress' <> 'null'::jsonb
     AND (jsonb_typeof(v_patch->'physicalAddress') <> 'string'
       OR length(btrim(v_patch->>'physicalAddress')) NOT BETWEEN 1 AND 500) THEN
    RAISE EXCEPTION 'Physical address must contain 1 to 500 characters';
  END IF;
  IF v_patch ? 'whatsapp' AND v_patch->'whatsapp' <> 'null'::jsonb
     AND (jsonb_typeof(v_patch->'whatsapp') <> 'string'
       OR length(btrim(v_patch->>'whatsapp')) NOT BETWEEN 7 AND 32) THEN
    RAISE EXCEPTION 'WhatsApp must contain 7 to 32 characters';
  END IF;
  IF v_patch ? 'website' AND v_patch->'website' <> 'null'::jsonb
     AND (jsonb_typeof(v_patch->'website') <> 'string'
       OR (length(btrim(v_patch->>'website')) NOT BETWEEN 1 AND 2048
           OR btrim(v_patch->>'website') !~* '^https?://[^[:space:]]+$')) THEN
    RAISE EXCEPTION 'Website must be a valid HTTP(S) URL';
  END IF;
  IF v_patch ? 'isSupplier' AND v_patch->'isSupplier' <> 'null'::jsonb
     AND jsonb_typeof(v_patch->'isSupplier') <> 'boolean' THEN
    RAISE EXCEPTION 'Supplier classification must be boolean or null';
  END IF;
  IF v_patch ? 'yearsInBusiness' AND v_patch->'yearsInBusiness' <> 'null'::jsonb
     AND (jsonb_typeof(v_patch->'yearsInBusiness') <> 'number'
       OR (v_patch->>'yearsInBusiness') !~ '^[0-9]{1,3}$'
       OR (v_patch->>'yearsInBusiness')::integer NOT BETWEEN 0 AND 500) THEN
    RAISE EXCEPTION 'Years in business must be an integer from 0 to 500';
  END IF;
  IF v_patch ? 'latitude' AND v_patch->'latitude' <> 'null'::jsonb
     AND (jsonb_typeof(v_patch->'latitude') <> 'number'
       OR (v_patch->>'latitude')::double precision NOT BETWEEN -90 AND 90) THEN
    RAISE EXCEPTION 'Latitude must be between -90 and 90';
  END IF;
  IF v_patch ? 'longitude' AND v_patch->'longitude' <> 'null'::jsonb
     AND (jsonb_typeof(v_patch->'longitude') <> 'number'
       OR (v_patch->>'longitude')::double precision NOT BETWEEN -180 AND 180) THEN
    RAISE EXCEPTION 'Longitude must be between -180 and 180';
  END IF;
  IF (v_patch ? 'latitude') <> (v_patch ? 'longitude') THEN
    RAISE EXCEPTION 'Latitude and longitude must be supplied together';
  END IF;
  IF v_patch ? 'latitude'
     AND ((v_patch->'latitude' = 'null'::jsonb) <> (v_patch->'longitude' = 'null'::jsonb)) THEN
    RAISE EXCEPTION 'Latitude and longitude must be supplied or cleared together';
  END IF;
  IF v_patch ? 'avatarLetter' AND v_patch->'avatarLetter' <> 'null'::jsonb
     AND (jsonb_typeof(v_patch->'avatarLetter') <> 'string'
       OR length(btrim(v_patch->>'avatarLetter')) NOT BETWEEN 1 AND 3) THEN
    RAISE EXCEPTION 'Avatar letter must contain 1 to 3 characters';
  END IF;
  IF v_patch ? 'avatarColor' AND v_patch->'avatarColor' <> 'null'::jsonb
     AND (jsonb_typeof(v_patch->'avatarColor') <> 'string'
       OR btrim(v_patch->>'avatarColor') !~ '^#[0-9A-Fa-f]{6}$') THEN
    RAISE EXCEPTION 'Avatar color must be a six-digit hex color';
  END IF;

  IF v_patch ? 'category' THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = 'ghm.business'::regclass
        AND attname = 'category' AND attnum > 0 AND NOT attisdropped
    ) THEN
      RAISE EXCEPTION 'Category profile field is not present in this Business schema';
    END IF;
    v_set_extra := v_set_extra || ', category = CASE WHEN $1 ? ''category'' THEN $1->>''category'' ELSE category END';
  END IF;
  IF v_patch ? 'isSupplier' THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = 'ghm.business'::regclass
        AND attname = 'is_supplier' AND attnum > 0 AND NOT attisdropped
    ) THEN
      RAISE EXCEPTION 'Supplier profile field is not present in this Business schema';
    END IF;
    v_set_extra := v_set_extra || ', is_supplier = CASE WHEN $1 ? ''isSupplier'' THEN ($1->>''isSupplier'')::boolean ELSE is_supplier END';
  END IF;

  EXECUTE format($statement$
    UPDATE ghm.business
    SET
      name = CASE WHEN $1 ? 'name' THEN btrim($1->>'name') ELSE name END,
      slug = CASE WHEN $1 ? 'slug' THEN btrim($1->>'slug') ELSE slug END,
      description = CASE WHEN $1 ? 'description' THEN nullif($1->>'description', '') ELSE description END,
      phone = CASE WHEN $1 ? 'phone' THEN nullif(btrim($1->>'phone'), '') ELSE phone END,
      email = CASE WHEN $1 ? 'email' THEN nullif(btrim($1->>'email'), '') ELSE email END,
      province = CASE WHEN $1 ? 'province' THEN nullif(btrim($1->>'province'), '') ELSE province END,
      city = CASE WHEN $1 ? 'city' THEN nullif(btrim($1->>'city'), '') ELSE city END,
      physical_address = CASE WHEN $1 ? 'physicalAddress' THEN nullif(btrim($1->>'physicalAddress'), '') ELSE physical_address END,
      latitude = CASE WHEN $1 ? 'latitude' THEN ($1->>'latitude')::double precision ELSE latitude END,
      longitude = CASE WHEN $1 ? 'longitude' THEN ($1->>'longitude')::double precision ELSE longitude END,
      whatsapp = CASE WHEN $1 ? 'whatsapp' THEN nullif(btrim($1->>'whatsapp'), '') ELSE whatsapp END,
      website = CASE WHEN $1 ? 'website' THEN nullif(btrim($1->>'website'), '') ELSE website END,
      avatar_letter = CASE WHEN $1 ? 'avatarLetter' THEN nullif(btrim($1->>'avatarLetter'), '') ELSE avatar_letter END,
      avatar_color = CASE WHEN $1 ? 'avatarColor' THEN nullif(btrim($1->>'avatarColor'), '') ELSE avatar_color END,
      years_in_business = CASE WHEN $1 ? 'yearsInBusiness' THEN ($1->>'yearsInBusiness')::integer ELSE years_in_business END,
      updated_at = now()
      %s
    WHERE id = $2
    RETURNING *
  $statement$, v_set_extra)
  USING v_patch, p_business_id
  INTO v_updated;

  RETURN v_updated;
END;
$function$;

ALTER FUNCTION ghm.update_business_profile(bigint, bigint, jsonb)
  OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.update_business_profile(bigint, bigint, jsonb)
  SET search_path = pg_catalog, ghm;
REVOKE ALL ON FUNCTION ghm.update_business_profile(bigint, bigint, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.update_business_profile(bigint, bigint, jsonb) TO ghm_runtime;

COMMIT;
