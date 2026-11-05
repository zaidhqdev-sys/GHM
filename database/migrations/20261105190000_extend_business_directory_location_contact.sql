-- Extend canonical Business profile with Connect directory location/contact fields.
-- Construction-only. No production migration or provider cutover is authorized.
-- Canonical owner remains ghm.business / Business Identity.

ALTER TABLE ghm.business
  ADD COLUMN province text,
  ADD COLUMN city text,
  ADD COLUMN physical_address text,
  ADD COLUMN latitude double precision,
  ADD COLUMN longitude double precision,
  ADD COLUMN whatsapp text,
  ADD COLUMN website text;

ALTER TABLE ghm.business
  ADD CONSTRAINT business_province_length_check CHECK (province IS NULL OR length(btrim(province)) BETWEEN 1 AND 120),
  ADD CONSTRAINT business_city_length_check CHECK (city IS NULL OR length(btrim(city)) BETWEEN 1 AND 120),
  ADD CONSTRAINT business_physical_address_length_check CHECK (physical_address IS NULL OR length(btrim(physical_address)) BETWEEN 1 AND 500),
  ADD CONSTRAINT business_latitude_range_check CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT business_longitude_range_check CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  ADD CONSTRAINT business_coordinates_pair_check CHECK ((latitude IS NULL) = (longitude IS NULL)),
  ADD CONSTRAINT business_whatsapp_length_check CHECK (whatsapp IS NULL OR length(btrim(whatsapp)) BETWEEN 7 AND 32),
  ADD CONSTRAINT business_website_length_check CHECK (website IS NULL OR length(btrim(website)) BETWEEN 8 AND 2048);

CREATE INDEX business_public_directory_location_idx
  ON ghm.business (province, city, id)
  WHERE is_active = true AND is_verified = true AND verification_status = 'approved';
CREATE INDEX business_public_directory_geo_idx
  ON ghm.business (latitude, longitude, id)
  WHERE is_active = true AND is_verified = true AND verification_status = 'approved'
    AND latitude IS NOT NULL AND longitude IS NOT NULL;

COMMENT ON COLUMN ghm.business.province IS 'Owner-managed public directory province.';
COMMENT ON COLUMN ghm.business.city IS 'Owner-managed public directory city or locality.';
COMMENT ON COLUMN ghm.business.physical_address IS 'Owner-managed public business street address.';
COMMENT ON COLUMN ghm.business.latitude IS 'Owner-managed public directory latitude; paired with longitude.';
COMMENT ON COLUMN ghm.business.longitude IS 'Owner-managed public directory longitude; paired with latitude.';
COMMENT ON COLUMN ghm.business.whatsapp IS 'Owner-managed public WhatsApp contact number.';
COMMENT ON COLUMN ghm.business.website IS 'Owner-managed public business website URL.';

CREATE OR REPLACE FUNCTION ghm.update_business_profile(
  p_account_id bigint,
  p_business_id bigint,
  p_patch jsonb
)
RETURNS ghm.business
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  patch_keys text[];
  allowed_keys text[] := ARRAY['name', 'slug', 'description', 'phone', 'email', 'province', 'city', 'physical_address', 'latitude', 'longitude', 'whatsapp', 'website'];
  forbidden text;
  next_name text;
  next_slug text;
  next_description text;
  next_phone text;
  next_email text;
  next_province text;
  next_city text;
  next_address text;
  next_whatsapp text;
  next_website text;
  next_latitude double precision;
  next_longitude double precision;
  updated_row ghm.business%ROWTYPE;
BEGIN
  IF p_account_id IS NULL OR p_account_id <= 0 THEN RAISE EXCEPTION 'Authentication is required to update a Business profile.'; END IF;
  IF p_business_id IS NULL OR p_business_id <= 0 THEN RAISE EXCEPTION 'Business ID must be a positive integer'; END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN RAISE EXCEPTION 'Business profile patch must be a JSON object'; END IF;

  SELECT coalesce(array_agg(key ORDER BY key), ARRAY[]::text[]) INTO patch_keys FROM jsonb_object_keys(p_patch) AS key;
  IF coalesce(cardinality(patch_keys), 0) = 0 THEN RAISE EXCEPTION 'Business update requires at least one field'; END IF;
  FOREACH forbidden IN ARRAY patch_keys LOOP
    IF NOT (forbidden = ANY (allowed_keys)) THEN RAISE EXCEPTION 'Unsupported Business update field: %', forbidden; END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM ghm.business_membership
    WHERE business_id = p_business_id AND account_id = p_account_id
      AND membership_status = 'active' AND membership_role IN ('owner', 'administrator')
  ) THEN RAISE EXCEPTION 'Business management permission required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM ghm.business WHERE id = p_business_id) THEN RAISE EXCEPTION 'Business not found'; END IF;

  IF p_patch ? 'name' THEN
    IF jsonb_typeof(p_patch->'name') <> 'string' THEN RAISE EXCEPTION 'Business name is required'; END IF;
    next_name := btrim(p_patch->>'name'); IF next_name = '' THEN RAISE EXCEPTION 'Business name is required'; END IF;
  END IF;
  IF p_patch ? 'slug' THEN
    IF jsonb_typeof(p_patch->'slug') <> 'string' THEN RAISE EXCEPTION 'Business slug is required'; END IF;
    next_slug := btrim(p_patch->>'slug'); IF next_slug = '' THEN RAISE EXCEPTION 'Business slug is required'; END IF;
  END IF;
  IF p_patch ? 'description' THEN
    IF p_patch->'description' = 'null'::jsonb THEN next_description := NULL;
    ELSIF jsonb_typeof(p_patch->'description') <> 'string' THEN RAISE EXCEPTION 'Business description must be text or null';
    ELSE next_description := p_patch->>'description'; IF length(next_description) > 5000 THEN RAISE EXCEPTION 'Description must be 5000 characters or fewer'; END IF; IF btrim(next_description) = '' THEN next_description := NULL; END IF; END IF;
  END IF;
  IF p_patch ? 'phone' THEN
    IF p_patch->'phone' = 'null'::jsonb THEN next_phone := NULL;
    ELSIF jsonb_typeof(p_patch->'phone') <> 'string' THEN RAISE EXCEPTION 'Business phone must be text or null';
    ELSE next_phone := btrim(p_patch->>'phone'); IF next_phone = '' THEN next_phone := NULL; ELSIF length(next_phone) NOT BETWEEN 7 AND 32 THEN RAISE EXCEPTION 'Phone must be between 7 and 32 characters'; END IF; END IF;
  END IF;
  IF p_patch ? 'email' THEN
    IF p_patch->'email' = 'null'::jsonb THEN next_email := NULL;
    ELSIF jsonb_typeof(p_patch->'email') <> 'string' THEN RAISE EXCEPTION 'Business email must be text or null';
    ELSE next_email := btrim(p_patch->>'email'); IF next_email = '' THEN next_email := NULL; ELSIF length(next_email) NOT BETWEEN 3 AND 320 THEN RAISE EXCEPTION 'Email must be between 3 and 320 characters'; END IF; END IF;
  END IF;

  IF p_patch ? 'province' THEN
    IF p_patch->'province' = 'null'::jsonb THEN next_province := NULL;
    ELSIF jsonb_typeof(p_patch->'province') <> 'string' THEN RAISE EXCEPTION 'Province must be text or null';
    ELSE next_province := nullif(btrim(p_patch->>'province'), ''); IF next_province IS NOT NULL AND length(next_province) > 120 THEN RAISE EXCEPTION 'Province must be 120 characters or fewer'; END IF; END IF;
  END IF;
  IF p_patch ? 'city' THEN
    IF p_patch->'city' = 'null'::jsonb THEN next_city := NULL;
    ELSIF jsonb_typeof(p_patch->'city') <> 'string' THEN RAISE EXCEPTION 'City must be text or null';
    ELSE next_city := nullif(btrim(p_patch->>'city'), ''); IF next_city IS NOT NULL AND length(next_city) > 120 THEN RAISE EXCEPTION 'City must be 120 characters or fewer'; END IF; END IF;
  END IF;
  IF p_patch ? 'physical_address' THEN
    IF p_patch->'physical_address' = 'null'::jsonb THEN next_address := NULL;
    ELSIF jsonb_typeof(p_patch->'physical_address') <> 'string' THEN RAISE EXCEPTION 'Physical address must be text or null';
    ELSE next_address := nullif(btrim(p_patch->>'physical_address'), ''); IF next_address IS NOT NULL AND length(next_address) > 500 THEN RAISE EXCEPTION 'Physical address must be 500 characters or fewer'; END IF; END IF;
  END IF;
  IF p_patch ? 'whatsapp' THEN
    IF p_patch->'whatsapp' = 'null'::jsonb THEN next_whatsapp := NULL;
    ELSIF jsonb_typeof(p_patch->'whatsapp') <> 'string' THEN RAISE EXCEPTION 'WhatsApp must be text or null';
    ELSE next_whatsapp := nullif(btrim(p_patch->>'whatsapp'), ''); IF next_whatsapp IS NOT NULL AND length(next_whatsapp) NOT BETWEEN 7 AND 32 THEN RAISE EXCEPTION 'WhatsApp must be between 7 and 32 characters'; END IF; END IF;
  END IF;
  IF p_patch ? 'website' THEN
    IF p_patch->'website' = 'null'::jsonb THEN next_website := NULL;
    ELSIF jsonb_typeof(p_patch->'website') <> 'string' THEN RAISE EXCEPTION 'Website must be text or null';
    ELSE next_website := nullif(btrim(p_patch->>'website'), ''); IF next_website IS NOT NULL AND (length(next_website) NOT BETWEEN 8 AND 2048 OR next_website !~* '^https?://[^[:space:]]+$') THEN RAISE EXCEPTION 'Website must be a valid HTTP(S) URL'; END IF; END IF;
  END IF;
  IF p_patch ? 'latitude' THEN
    IF p_patch->'latitude' = 'null'::jsonb THEN next_latitude := NULL;
    ELSIF jsonb_typeof(p_patch->'latitude') <> 'number' THEN RAISE EXCEPTION 'Latitude must be a number or null';
    ELSE next_latitude := (p_patch->>'latitude')::double precision; IF next_latitude NOT BETWEEN -90 AND 90 THEN RAISE EXCEPTION 'Latitude is out of range'; END IF; END IF;
  END IF;
  IF p_patch ? 'longitude' THEN
    IF p_patch->'longitude' = 'null'::jsonb THEN next_longitude := NULL;
    ELSIF jsonb_typeof(p_patch->'longitude') <> 'number' THEN RAISE EXCEPTION 'Longitude must be a number or null';
    ELSE next_longitude := (p_patch->>'longitude')::double precision; IF next_longitude NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'Longitude is out of range'; END IF; END IF;
  END IF;
  IF (p_patch ? 'latitude' AND next_latitude IS NULL) <> (p_patch ? 'longitude' AND next_longitude IS NULL) THEN
    RAISE EXCEPTION 'Latitude and longitude must be supplied or cleared together';
  END IF;

  UPDATE ghm.business SET
    name = CASE WHEN p_patch ? 'name' THEN next_name ELSE name END,
    slug = CASE WHEN p_patch ? 'slug' THEN next_slug ELSE slug END,
    description = CASE WHEN p_patch ? 'description' THEN next_description ELSE description END,
    phone = CASE WHEN p_patch ? 'phone' THEN next_phone ELSE phone END,
    email = CASE WHEN p_patch ? 'email' THEN next_email ELSE email END,
    province = CASE WHEN p_patch ? 'province' THEN next_province ELSE province END,
    city = CASE WHEN p_patch ? 'city' THEN next_city ELSE city END,
    physical_address = CASE WHEN p_patch ? 'physical_address' THEN next_address ELSE physical_address END,
    latitude = CASE WHEN p_patch ? 'latitude' THEN next_latitude ELSE latitude END,
    longitude = CASE WHEN p_patch ? 'longitude' THEN next_longitude ELSE longitude END,
    whatsapp = CASE WHEN p_patch ? 'whatsapp' THEN next_whatsapp ELSE whatsapp END,
    website = CASE WHEN p_patch ? 'website' THEN next_website ELSE website END,
    updated_at = now()
  WHERE id = p_business_id
  RETURNING * INTO updated_row;
  RETURN updated_row;
END;
$$;

ALTER FUNCTION ghm.update_business_profile(bigint, bigint, jsonb)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.update_business_profile(bigint, bigint, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.update_business_profile(bigint, bigint, jsonb) TO ghm_runtime;
