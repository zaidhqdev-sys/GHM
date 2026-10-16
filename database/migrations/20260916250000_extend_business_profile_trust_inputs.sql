-- Extend ghm.business with Trust-input profile columns.
-- Construction-only. No production migration or product cutover is authorized.
-- Trust and Saved Business remain QUALIFIED / CLOSED.
-- Source: Connect 20260718130542 + 20260721170743 + businessProfileEditor.js

ALTER TABLE ghm.business
  ADD COLUMN description text,
  ADD COLUMN phone text,
  ADD COLUMN email text,
  ADD COLUMN insurance_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN jobs_completed integer NOT NULL DEFAULT 0;

ALTER TABLE ghm.business
  ADD CONSTRAINT business_description_length_check
    CHECK (description IS NULL OR length(description) <= 5000),
  ADD CONSTRAINT business_phone_length_check
    CHECK (
      phone IS NULL
      OR length(btrim(phone)) BETWEEN 7 AND 32
    ),
  ADD CONSTRAINT business_email_length_check
    CHECK (
      email IS NULL
      OR length(btrim(email)) BETWEEN 3 AND 320
    ),
  ADD CONSTRAINT business_jobs_completed_check
    CHECK (jobs_completed >= 0);

COMMENT ON COLUMN ghm.business.description IS
  'Owner-managed Business description; Trust profile_complete input.';
COMMENT ON COLUMN ghm.business.phone IS
  'Owner-managed Business phone; Trust phone_verified presence input.';
COMMENT ON COLUMN ghm.business.email IS
  'Owner-managed Business email; Trust email_verified presence input.';
COMMENT ON COLUMN ghm.business.insurance_verified IS
  'Protected Trust input. Not owner-mutable through Business profile update.';
COMMENT ON COLUMN ghm.business.jobs_completed IS
  'Protected Trust input. Not owner-mutable through Business profile update.';

-- Narrow runtime DML: profile/protected columns must not be directly updatable.
-- Review aggregates retain UPDATE on rating/review_count/updated_at.
REVOKE UPDATE (
  name,
  slug,
  description,
  phone,
  email,
  insurance_verified,
  jobs_completed,
  verification_status,
  is_verified,
  is_active,
  id,
  created_at
) ON TABLE ghm.business FROM ghm_runtime;

GRANT SELECT ON TABLE ghm.business TO ghm_runtime;

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
  allowed_keys text[] := ARRAY['name', 'slug', 'description', 'phone', 'email'];
  forbidden text;
  next_name text;
  next_slug text;
  next_description text;
  next_phone text;
  next_email text;
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

-- Wire Trust calculation to consume Business profile Trust inputs.
-- Thresholds and Trust operation vocabulary are unchanged.
CREATE OR REPLACE FUNCTION ghm.calculate_business_trust_score(
  p_account_id bigint,
  p_business_id bigint
)
RETURNS ghm.trust_score
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  target_business ghm.business%ROWTYPE;
  calculated_profile_complete smallint;
  calculated_phone_verified smallint;
  calculated_email_verified smallint;
  calculated_id_verified smallint;
  calculated_cipc_verified smallint;
  calculated_vat_verified smallint;
  calculated_insurance_verified smallint;
  calculated_reviews_score smallint;
  calculated_completed_projects smallint;
  calculated_total_score smallint;
  calculated_trust_level text;
  calculated_score ghm.trust_score%ROWTYPE;
BEGIN
  IF p_account_id IS NULL OR p_account_id <= 0 THEN
    RAISE EXCEPTION 'Authentication is required to calculate a Trust score.';
  END IF;

  IF p_business_id IS NULL OR p_business_id <= 0 THEN
    RAISE EXCEPTION 'Business ID must be a positive integer';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM ghm.business_membership
    WHERE business_id = p_business_id
      AND account_id = p_account_id
      AND membership_status = 'active'
      AND membership_role IN ('owner', 'administrator')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to calculate this business Trust score.';
  END IF;

  SELECT *
    INTO target_business
    FROM ghm.business
   WHERE id = p_business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business was not found.';
  END IF;

  calculated_profile_complete :=
    CASE
      WHEN nullif(btrim(coalesce(target_business.description, '')), '') IS NOT NULL
        THEN 15
      ELSE 0
    END;

  calculated_phone_verified :=
    CASE
      WHEN nullif(btrim(coalesce(target_business.phone, '')), '') IS NOT NULL
        THEN 10
      ELSE 0
    END;

  calculated_email_verified :=
    CASE
      WHEN nullif(btrim(coalesce(target_business.email, '')), '') IS NOT NULL
        THEN 10
      ELSE 0
    END;

  calculated_id_verified := 0;
  calculated_cipc_verified := 0;
  calculated_vat_verified := 0;

  calculated_insurance_verified :=
    CASE
      WHEN target_business.insurance_verified IS TRUE THEN 15
      ELSE 0
    END;

  calculated_reviews_score :=
    least(
      greatest(
        round(coalesce(target_business.rating, 0) * 3)::integer,
        0
      ),
      15
    )::smallint;

  calculated_completed_projects :=
    least(
      greatest(
        floor(coalesce(target_business.jobs_completed, 0)::numeric / 5)::integer,
        0
      ),
      10
    )::smallint;

  calculated_total_score := (
    calculated_profile_complete
    + calculated_phone_verified
    + calculated_email_verified
    + calculated_id_verified
    + calculated_cipc_verified
    + calculated_vat_verified
    + calculated_insurance_verified
    + calculated_reviews_score
    + calculated_completed_projects
  )::smallint;

  calculated_trust_level :=
    CASE
      WHEN calculated_total_score >= 80 THEN 'platinum'
      WHEN calculated_total_score >= 60 THEN 'gold'
      WHEN calculated_total_score >= 40 THEN 'silver'
      ELSE 'bronze'
    END;

  INSERT INTO ghm.trust_score (
    business_id,
    profile_complete,
    phone_verified,
    email_verified,
    id_verified,
    cipc_verified,
    vat_verified,
    insurance_verified,
    reviews_score,
    completed_projects,
    total_score,
    trust_level,
    last_updated
  )
  VALUES (
    p_business_id,
    calculated_profile_complete,
    calculated_phone_verified,
    calculated_email_verified,
    calculated_id_verified,
    calculated_cipc_verified,
    calculated_vat_verified,
    calculated_insurance_verified,
    calculated_reviews_score,
    calculated_completed_projects,
    calculated_total_score,
    calculated_trust_level,
    now()
  )
  ON CONFLICT (business_id)
  DO UPDATE
  SET
    profile_complete = EXCLUDED.profile_complete,
    phone_verified = EXCLUDED.phone_verified,
    email_verified = EXCLUDED.email_verified,
    id_verified = EXCLUDED.id_verified,
    cipc_verified = EXCLUDED.cipc_verified,
    vat_verified = EXCLUDED.vat_verified,
    insurance_verified = EXCLUDED.insurance_verified,
    reviews_score = EXCLUDED.reviews_score,
    completed_projects = EXCLUDED.completed_projects,
    total_score = EXCLUDED.total_score,
    trust_level = EXCLUDED.trust_level,
    last_updated = EXCLUDED.last_updated
  RETURNING *
  INTO calculated_score;

  RETURN calculated_score;
END;
$$;

ALTER FUNCTION ghm.calculate_business_trust_score(bigint, bigint)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.calculate_business_trust_score(bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.calculate_business_trust_score(bigint, bigint) TO ghm_runtime;
