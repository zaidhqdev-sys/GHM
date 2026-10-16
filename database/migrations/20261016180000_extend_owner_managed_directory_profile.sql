-- Extend the existing membership-checked Business profile mutation contract.
-- This is a new forward migration; historical migration files remain immutable.
-- Owner-editable: descriptive category/location/contact fields and self-declared supplier type.
-- Protected: logo/media, avatar presentation, tier, promotion, analytics, verification and Trust.

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
  allowed_keys text[] := ARRAY['name', 'slug', 'description', 'phone', 'email', 'category', 'province', 'city', 'physicalAddress', 'whatsapp', 'website', 'isSupplier', 'yearsInBusiness'];
  forbidden text;
  next_name text;
  next_slug text;
  next_description text;
  next_phone text;
  next_email text;
  next_category text;
  next_province text;
  next_city text;
  next_physical_address text;
  next_whatsapp text;
  next_website text;
  next_is_supplier boolean;
  next_years_in_business integer;
  updated_row ghm.business%ROWTYPE;
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

  SELECT coalesce(array_agg(key ORDER BY key), ARRAY[]::text[])
    INTO patch_keys
    FROM jsonb_object_keys(p_patch) AS key;

  IF coalesce(cardinality(patch_keys), 0) = 0 THEN
    RAISE EXCEPTION 'Business update requires at least one field';
  END IF;

  FOREACH forbidden IN ARRAY patch_keys LOOP
    IF NOT (forbidden = ANY (allowed_keys)) THEN
      RAISE EXCEPTION 'Unsupported Business update field: %', forbidden;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM ghm.business_membership
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

  IF p_patch ? 'name' THEN
    IF jsonb_typeof(p_patch->'name') <> 'string' THEN
      RAISE EXCEPTION 'Business name is required';
    END IF;
    next_name := btrim(p_patch->>'name');
    IF next_name = '' THEN
      RAISE EXCEPTION 'Business name is required';
    END IF;
  END IF;

  IF p_patch ? 'slug' THEN
    IF jsonb_typeof(p_patch->'slug') <> 'string' THEN
      RAISE EXCEPTION 'Business slug is required';
    END IF;
    next_slug := btrim(p_patch->>'slug');
    IF next_slug = '' THEN
      RAISE EXCEPTION 'Business slug is required';
    END IF;
  END IF;

  IF p_patch ? 'description' THEN
    IF p_patch->'description' = 'null'::jsonb THEN
      next_description := NULL;
    ELSIF jsonb_typeof(p_patch->'description') <> 'string' THEN
      RAISE EXCEPTION 'Business description must be text or null';
    ELSE
      next_description := p_patch->>'description';
      IF length(next_description) > 5000 THEN
        RAISE EXCEPTION 'Description must be 5000 characters or fewer';
      END IF;
      IF btrim(next_description) = '' THEN
        next_description := NULL;
      END IF;
    END IF;
  END IF;

  IF p_patch ? 'phone' THEN
    IF p_patch->'phone' = 'null'::jsonb THEN
      next_phone := NULL;
    ELSIF jsonb_typeof(p_patch->'phone') <> 'string' THEN
      RAISE EXCEPTION 'Business phone must be text or null';
    ELSE
      next_phone := btrim(p_patch->>'phone');
      IF next_phone = '' THEN
        next_phone := NULL;
      ELSIF length(next_phone) < 7 OR length(next_phone) > 32 THEN
        RAISE EXCEPTION 'Phone must be between 7 and 32 characters';
      END IF;
    END IF;
  END IF;

  IF p_patch ? 'email' THEN
    IF p_patch->'email' = 'null'::jsonb THEN
      next_email := NULL;
    ELSIF jsonb_typeof(p_patch->'email') <> 'string' THEN
      RAISE EXCEPTION 'Business email must be text or null';
    ELSE
      next_email := btrim(p_patch->>'email');
      IF next_email = '' THEN
        next_email := NULL;
      ELSIF length(next_email) < 3 OR length(next_email) > 320 THEN
        RAISE EXCEPTION 'Email must be between 3 and 320 characters';
      END IF;
    END IF;
  END IF;

  IF p_patch ? 'category' THEN
    IF p_patch->'category' = 'null'::jsonb THEN next_category := NULL;
    ELSIF jsonb_typeof(p_patch->'category') <> 'string' THEN RAISE EXCEPTION 'Category must be a lowercase slug or null';
    ELSE
      next_category := btrim(p_patch->>'category');
      IF length(next_category) < 1 OR length(next_category) > 100 OR next_category !~ '^[a-z0-9]+(-[a-z0-9]+)* WHEN p_patch ? 'name' THEN next_name ELSE name END,
    slug = CASE WHEN p_patch ? 'slug' THEN next_slug ELSE slug END,
    description = CASE WHEN p_patch ? 'description' THEN next_description ELSE description END,
    phone = CASE WHEN p_patch ? 'phone' THEN next_phone ELSE phone END,
    email = CASE WHEN p_patch ? 'email' THEN next_email ELSE email END,
    category = CASE WHEN p_patch ? 'category' THEN next_category ELSE category END,
    province = CASE WHEN p_patch ? 'province' THEN next_province ELSE province END,
    city = CASE WHEN p_patch ? 'city' THEN next_city ELSE city END,
    physical_address = CASE WHEN p_patch ? 'physicalAddress' THEN next_physical_address ELSE physical_address END,
    whatsapp = CASE WHEN p_patch ? 'whatsapp' THEN next_whatsapp ELSE whatsapp END,
    website = CASE WHEN p_patch ? 'website' THEN next_website ELSE website END,
    is_supplier = CASE WHEN p_patch ? 'isSupplier' THEN next_is_supplier ELSE is_supplier END,
    years_in_business = CASE WHEN p_patch ? 'yearsInBusiness' THEN next_years_in_business ELSE years_in_business END,
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

 THEN RAISE EXCEPTION 'Category must be a lowercase slug'; END IF;
    END IF;
  END IF;
  IF p_patch ? 'province' THEN
    IF p_patch->'province' = 'null'::jsonb THEN next_province := NULL;
    ELSIF jsonb_typeof(p_patch->'province') <> 'string' OR length(btrim(p_patch->>'province')) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Province must contain 1 to 100 characters';
    ELSE next_province := btrim(p_patch->>'province'); END IF;
  END IF;
  IF p_patch ? 'city' THEN
    IF p_patch->'city' = 'null'::jsonb THEN next_city := NULL;
    ELSIF jsonb_typeof(p_patch->'city') <> 'string' OR length(btrim(p_patch->>'city')) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'City must contain 1 to 120 characters';
    ELSE next_city := btrim(p_patch->>'city'); END IF;
  END IF;
  IF p_patch ? 'physicalAddress' THEN
    IF p_patch->'physicalAddress' = 'null'::jsonb THEN next_physical_address := NULL;
    ELSIF jsonb_typeof(p_patch->'physicalAddress') <> 'string' OR length(btrim(p_patch->>'physicalAddress')) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Physical address must contain 1 to 500 characters';
    ELSE next_physical_address := btrim(p_patch->>'physicalAddress'); END IF;
  END IF;
  IF p_patch ? 'whatsapp' THEN
    IF p_patch->'whatsapp' = 'null'::jsonb THEN next_whatsapp := NULL;
    ELSIF jsonb_typeof(p_patch->'whatsapp') <> 'string' OR length(btrim(p_patch->>'whatsapp')) NOT BETWEEN 7 AND 32 THEN RAISE EXCEPTION 'WhatsApp must contain 7 to 32 characters';
    ELSE next_whatsapp := btrim(p_patch->>'whatsapp'); END IF;
  END IF;
  IF p_patch ? 'website' THEN
    IF p_patch->'website' = 'null'::jsonb THEN next_website := NULL;
    ELSIF jsonb_typeof(p_patch->'website') <> 'string' OR length(btrim(p_patch->>'website')) NOT BETWEEN 1 AND 2048 OR p_patch->>'website' !~* '^https?://' THEN RAISE EXCEPTION 'Website must be a valid HTTP(S) URL';
    ELSE next_website := btrim(p_patch->>'website'); END IF;
  END IF;
  IF p_patch ? 'isSupplier' THEN
    IF p_patch->'isSupplier' = 'null'::jsonb THEN next_is_supplier := NULL;
    ELSIF jsonb_typeof(p_patch->'isSupplier') <> 'boolean' THEN RAISE EXCEPTION 'Supplier classification must be boolean or null';
    ELSE next_is_supplier := (p_patch->>'isSupplier')::boolean; END IF;
  END IF;
  IF p_patch ? 'yearsInBusiness' THEN
    IF jsonb_typeof(p_patch->'yearsInBusiness') <> 'number' OR (p_patch->>'yearsInBusiness') !~ '^[0-9]{1,3} WHEN p_patch ? 'name' THEN next_name ELSE name END,
    slug = CASE WHEN p_patch ? 'slug' THEN next_slug ELSE slug END,
    description = CASE WHEN p_patch ? 'description' THEN next_description ELSE description END,
    phone = CASE WHEN p_patch ? 'phone' THEN next_phone ELSE phone END,
    email = CASE WHEN p_patch ? 'email' THEN next_email ELSE email END,
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

 OR (p_patch->>'yearsInBusiness')::integer > 500 THEN RAISE EXCEPTION 'Years in business must be an integer from 0 to 500';
    ELSE next_years_in_business := (p_patch->>'yearsInBusiness')::integer; END IF;
  END IF;

  UPDATE ghm.business
  SET
    name = CASE WHEN p_patch ? 'name' THEN next_name ELSE name END,
    slug = CASE WHEN p_patch ? 'slug' THEN next_slug ELSE slug END,
    description = CASE WHEN p_patch ? 'description' THEN next_description ELSE description END,
    phone = CASE WHEN p_patch ? 'phone' THEN next_phone ELSE phone END,
    email = CASE WHEN p_patch ? 'email' THEN next_email ELSE email END,
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


REVOKE UPDATE (
  category, province, city, physical_address, whatsapp, website, logo_url,
  avatar_letter, avatar_color, is_supplier, tier, is_featured, profile_views,
  years_in_business
) ON TABLE ghm.business FROM ghm_runtime;
