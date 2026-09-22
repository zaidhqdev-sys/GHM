-- Controlled link of an existing account_identity to an external (provider, subject).
-- Does NOT create accounts. Does NOT match by email. Does NOT merge or move mappings.
-- Identity mapping ≠ account activation: linking a disabled account is allowed; status unchanged.

CREATE OR REPLACE FUNCTION ghm.auth_link_external_identity(
  p_provider text,
  p_subject text,
  p_account_id bigint
) RETURNS TABLE (
  outcome text,
  id bigint,
  provider text,
  subject text,
  account_id bigint,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_existing ghm.account_external_identity%ROWTYPE;
  v_mapping ghm.account_external_identity%ROWTYPE;
  v_account_exists boolean;
BEGIN
  IF p_provider IS NULL OR btrim(p_provider) = '' THEN
    RAISE EXCEPTION 'provider must be non-blank' USING ERRCODE = '22023';
  END IF;
  IF p_subject IS NULL OR btrim(p_subject) = '' THEN
    RAISE EXCEPTION 'subject must be non-blank' USING ERRCODE = '22023';
  END IF;
  IF p_account_id IS NULL THEN
    RAISE EXCEPTION 'account_id must be non-null' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM ghm.account_identity a WHERE a.id = p_account_id
  ) INTO v_account_exists;

  IF NOT v_account_exists THEN
    outcome := 'account_not_found';
    id := NULL;
    provider := NULL;
    subject := NULL;
    account_id := NULL;
    created_at := NULL;
    updated_at := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT m.* INTO v_existing
    FROM ghm.account_external_identity m
   WHERE m.provider = p_provider
     AND m.subject = p_subject;

  IF FOUND THEN
    IF v_existing.account_id = p_account_id THEN
      outcome := 'already_linked';
      id := v_existing.id;
      provider := v_existing.provider;
      subject := v_existing.subject;
      account_id := v_existing.account_id;
      created_at := v_existing.created_at;
      updated_at := v_existing.updated_at;
      RETURN NEXT;
      RETURN;
    END IF;

    outcome := 'conflict';
    id := v_existing.id;
    provider := v_existing.provider;
    subject := v_existing.subject;
    account_id := v_existing.account_id;
    created_at := v_existing.created_at;
    updated_at := v_existing.updated_at;
    RETURN NEXT;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO ghm.account_external_identity (provider, subject, account_id)
    VALUES (p_provider, p_subject, p_account_id)
    RETURNING * INTO v_mapping;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT m.* INTO v_existing
        FROM ghm.account_external_identity m
       WHERE m.provider = p_provider
         AND m.subject = p_subject;
      IF NOT FOUND THEN
        RAISE;
      END IF;
      IF v_existing.account_id = p_account_id THEN
        outcome := 'already_linked';
      ELSE
        outcome := 'conflict';
      END IF;
      id := v_existing.id;
      provider := v_existing.provider;
      subject := v_existing.subject;
      account_id := v_existing.account_id;
      created_at := v_existing.created_at;
      updated_at := v_existing.updated_at;
      RETURN NEXT;
      RETURN;
  END;

  outcome := 'created';
  id := v_mapping.id;
  provider := v_mapping.provider;
  subject := v_mapping.subject;
  account_id := v_mapping.account_id;
  created_at := v_mapping.created_at;
  updated_at := v_mapping.updated_at;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION ghm.auth_link_external_identity(text, text, bigint)
  OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_link_external_identity(text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_link_external_identity(text, text, bigint) TO ghm_runtime;

COMMENT ON FUNCTION ghm.auth_link_external_identity(text, text, bigint) IS
  'Link existing account_identity to (provider, subject). Outcomes: created|already_linked|conflict|account_not_found. Does not create accounts, match email, merge, move mappings, or change account_status.';

-- Reaffirm: runtime has no direct DML on external identity table.
REVOKE INSERT, UPDATE, DELETE ON TABLE ghm.account_external_identity FROM ghm_runtime;
