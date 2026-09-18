-- Fix ambiguous column references in campaign SECURITY DEFINER functions.
-- RETURNS TABLE output names collide with unqualified membership column references.

CREATE OR REPLACE FUNCTION ghm.create_campaign(
  p_account_id bigint,
  p_business_id bigint,
  p_title text
)
RETURNS TABLE (
  id bigint,
  business_id bigint,
  created_by_account_id bigint,
  title text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  normalized_title text;
BEGIN
  IF p_account_id IS NULL OR p_account_id <= 0 THEN
    RAISE EXCEPTION 'Account ID must be a positive integer';
  END IF;

  IF p_business_id IS NULL OR p_business_id <= 0 THEN
    RAISE EXCEPTION 'Business ID must be a positive integer';
  END IF;

  normalized_title := btrim(p_title);
  IF normalized_title IS NULL OR length(normalized_title) < 1 OR length(normalized_title) > 200 THEN
    RAISE EXCEPTION 'Campaign title must be between 1 and 200 characters';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ghm.business b
     WHERE b.id = p_business_id
       AND b.is_active = true
  ) THEN
    RAISE EXCEPTION 'Business is not eligible for campaign creation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ghm.business_membership bm
     WHERE bm.business_id = p_business_id
       AND bm.account_id = p_account_id
       AND bm.membership_status = 'active'
       AND bm.membership_role IN ('owner', 'administrator')
  ) THEN
    RAISE EXCEPTION 'Business management permission required';
  END IF;

  RETURN QUERY
  INSERT INTO ghm.campaign AS c (business_id, created_by_account_id, title, status)
  VALUES (p_business_id, p_account_id, normalized_title, 'draft')
  RETURNING
    c.id,
    c.business_id,
    c.created_by_account_id,
    c.title,
    c.status,
    c.created_at,
    c.updated_at;
END;
$$;

ALTER FUNCTION ghm.create_campaign(bigint, bigint, text)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.create_campaign(bigint, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.create_campaign(bigint, bigint, text) TO ghm_runtime;

CREATE OR REPLACE FUNCTION ghm.update_campaign(
  p_account_id bigint,
  p_campaign_id bigint,
  p_title text,
  p_status text
)
RETURNS TABLE (
  id bigint,
  business_id bigint,
  created_by_account_id bigint,
  title text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  current_row ghm.campaign%ROWTYPE;
  next_title text;
  next_status text;
  normalized_title text;
BEGIN
  IF p_account_id IS NULL OR p_account_id <= 0 THEN
    RAISE EXCEPTION 'Account ID must be a positive integer';
  END IF;

  IF p_campaign_id IS NULL OR p_campaign_id <= 0 THEN
    RAISE EXCEPTION 'Campaign ID must be a positive integer';
  END IF;

  IF p_title IS NULL AND p_status IS NULL THEN
    RAISE EXCEPTION 'Campaign update requires at least one field';
  END IF;

  SELECT c.* INTO current_row
    FROM ghm.campaign c
   WHERE c.id = p_campaign_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found or management permission required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ghm.business_membership bm
     WHERE bm.business_id = current_row.business_id
       AND bm.account_id = p_account_id
       AND bm.membership_status = 'active'
       AND bm.membership_role IN ('owner', 'administrator')
  ) THEN
    RAISE EXCEPTION 'Campaign not found or management permission required';
  END IF;

  next_title := current_row.title;
  next_status := current_row.status;

  IF p_title IS NOT NULL THEN
    IF current_row.status = 'archived' THEN
      RAISE EXCEPTION 'Archived campaign title cannot be updated';
    END IF;
    IF current_row.status NOT IN ('draft', 'active') THEN
      RAISE EXCEPTION 'Campaign title cannot be updated in the current status';
    END IF;
    normalized_title := btrim(p_title);
    IF normalized_title IS NULL OR length(normalized_title) < 1 OR length(normalized_title) > 200 THEN
      RAISE EXCEPTION 'Campaign title must be between 1 and 200 characters';
    END IF;
    next_title := normalized_title;
  END IF;

  IF p_status IS NOT NULL THEN
    IF p_status NOT IN ('draft', 'active', 'archived') THEN
      RAISE EXCEPTION 'Invalid campaign status';
    END IF;
    IF current_row.status = p_status THEN
      next_status := current_row.status;
    ELSIF current_row.status = 'draft' AND p_status IN ('active', 'archived') THEN
      next_status := p_status;
    ELSIF current_row.status = 'active' AND p_status = 'archived' THEN
      next_status := p_status;
    ELSE
      RAISE EXCEPTION 'Invalid campaign status transition: % -> %', current_row.status, p_status;
    END IF;
  END IF;

  RETURN QUERY
  UPDATE ghm.campaign AS c
     SET title = next_title,
         status = next_status,
         updated_at = now()
   WHERE c.id = current_row.id
  RETURNING
    c.id,
    c.business_id,
    c.created_by_account_id,
    c.title,
    c.status,
    c.created_at,
    c.updated_at;
END;
$$;

ALTER FUNCTION ghm.update_campaign(bigint, bigint, text, text)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.update_campaign(bigint, bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.update_campaign(bigint, bigint, text, text) TO ghm_runtime;
