BEGIN;

CREATE TABLE ghm.quoteflow_legal_document (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_key text NOT NULL UNIQUE,
  title text NOT NULL CHECK (btrim(title) <> ''),
  is_required boolean NOT NULL DEFAULT true,
  document_status text NOT NULL DEFAULT 'active'
    CHECK (document_status IN ('active', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ghm.quoteflow_legal_document_version (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id bigint NOT NULL REFERENCES ghm.quoteflow_legal_document(id),
  version_label text NOT NULL CHECK (btrim(version_label) <> ''),
  content_markdown text NOT NULL CHECK (btrim(content_markdown) <> ''),
  content_sha256 char(64) NOT NULL
    CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  effective_at timestamptz NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_label)
);

CREATE INDEX quoteflow_legal_version_current_idx
  ON ghm.quoteflow_legal_document_version (document_id, effective_at DESC, id DESC);

CREATE TABLE ghm.quoteflow_legal_acceptance (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id bigint NOT NULL REFERENCES ghm.account_identity(id),
  document_version_id bigint NOT NULL REFERENCES ghm.quoteflow_legal_document_version(id),
  document_sha256 char(64) NOT NULL CHECK (document_sha256 ~ '^[0-9a-f]{64}$'),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  acceptance_channel text NOT NULL DEFAULT 'quoteflow_android'
    CHECK (acceptance_channel IN ('quoteflow_android', 'quoteflow_web')),
  UNIQUE (account_id, document_version_id)
);

CREATE INDEX quoteflow_legal_acceptance_account_idx
  ON ghm.quoteflow_legal_acceptance (account_id, accepted_at DESC);

ALTER TABLE ghm.quoteflow_legal_document OWNER TO ghm_schema_owner;
ALTER TABLE ghm.quoteflow_legal_document_version OWNER TO ghm_schema_owner;
ALTER TABLE ghm.quoteflow_legal_acceptance OWNER TO ghm_schema_owner;

REVOKE ALL ON ghm.quoteflow_legal_document FROM PUBLIC, ghm_runtime, ghm_migrator;
REVOKE ALL ON ghm.quoteflow_legal_document_version FROM PUBLIC, ghm_runtime, ghm_migrator;
REVOKE ALL ON ghm.quoteflow_legal_acceptance FROM PUBLIC, ghm_runtime, ghm_migrator;

CREATE OR REPLACE FUNCTION ghm.quoteflow_legal_current_documents(p_account_id bigint)
RETURNS TABLE (
  document_key text,
  title text,
  is_required boolean,
  version_id bigint,
  version_label text,
  content_markdown text,
  content_sha256 text,
  effective_at timestamptz,
  accepted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
  SELECT d.document_key,
         d.title,
         d.is_required,
         v.id,
         v.version_label,
         v.content_markdown,
         v.content_sha256::text,
         v.effective_at,
         a.accepted_at
    FROM ghm.quoteflow_legal_document d
    LEFT JOIN LATERAL (
      SELECT version.id, version.version_label, version.content_markdown,
             version.content_sha256, version.effective_at
        FROM ghm.quoteflow_legal_document_version version
       WHERE version.document_id = d.id
         AND version.published_at <= now()
         AND version.effective_at <= now()
       ORDER BY version.effective_at DESC, version.id DESC
       LIMIT 1
    ) v ON true
    LEFT JOIN ghm.quoteflow_legal_acceptance a
      ON a.document_version_id = v.id
     AND a.account_id = p_account_id
    JOIN ghm.account_identity account
      ON account.id = p_account_id
     AND account.account_status = 'active'
   WHERE d.document_status = 'active'
   ORDER BY d.is_required DESC, d.document_key;
$$;

CREATE OR REPLACE FUNCTION ghm.quoteflow_legal_accept(
  p_account_id bigint,
  p_document_version_id bigint,
  p_acceptance_channel text DEFAULT 'quoteflow_android'
)
RETURNS TABLE (
  acceptance_id bigint,
  account_id bigint,
  document_version_id bigint,
  document_sha256 text,
  accepted_at timestamptz,
  acceptance_channel text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_hash char(64);
  v_document_id bigint;
  v_acceptance_id bigint;
BEGIN
  IF p_account_id IS NULL OR p_account_id <= 0
     OR p_document_version_id IS NULL OR p_document_version_id <= 0
     OR p_acceptance_channel IS NULL
     OR p_acceptance_channel NOT IN ('quoteflow_android', 'quoteflow_web') THEN
    RAISE EXCEPTION 'invalid legal acceptance request' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ghm.account_identity
     WHERE id = p_account_id AND account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'account unavailable' USING ERRCODE = 'P0002';
  END IF;

  SELECT v.content_sha256, v.document_id
    INTO v_hash, v_document_id
    FROM ghm.quoteflow_legal_document_version v
    JOIN ghm.quoteflow_legal_document d ON d.id = v.document_id
   WHERE v.id = p_document_version_id
     AND d.document_status = 'active'
     AND v.published_at <= now()
     AND v.effective_at <= now()
     AND NOT EXISTS (
       SELECT 1
         FROM ghm.quoteflow_legal_document_version newer
        WHERE newer.document_id = v.document_id
          AND newer.published_at <= now()
          AND newer.effective_at <= now()
          AND (newer.effective_at, newer.id) > (v.effective_at, v.id)
     );

  IF v_hash IS NULL THEN
    RAISE EXCEPTION 'legal document version is not current' USING ERRCODE = '22023';
  END IF;

  INSERT INTO ghm.quoteflow_legal_acceptance (
    account_id, document_version_id, document_sha256, acceptance_channel
  )
  VALUES (p_account_id, p_document_version_id, v_hash, p_acceptance_channel)
  ON CONFLICT (account_id, document_version_id) DO NOTHING;

  SELECT a.id
    INTO v_acceptance_id
    FROM ghm.quoteflow_legal_acceptance a
   WHERE a.account_id = p_account_id
     AND a.document_version_id = p_document_version_id;

  RETURN QUERY
    SELECT a.id, a.account_id, a.document_version_id,
           a.document_sha256::text, a.accepted_at, a.acceptance_channel
      FROM ghm.quoteflow_legal_acceptance a
     WHERE a.id = v_acceptance_id;
END;
$$;

ALTER FUNCTION ghm.quoteflow_legal_current_documents(bigint) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.quoteflow_legal_accept(bigint, bigint, text) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.quoteflow_legal_current_documents(bigint) SET search_path = pg_catalog, ghm;
ALTER FUNCTION ghm.quoteflow_legal_accept(bigint, bigint, text) SET search_path = pg_catalog, ghm;

REVOKE ALL ON FUNCTION ghm.quoteflow_legal_current_documents(bigint) FROM PUBLIC, ghm_migrator;
REVOKE ALL ON FUNCTION ghm.quoteflow_legal_accept(bigint, bigint, text) FROM PUBLIC, ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.quoteflow_legal_current_documents(bigint) TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.quoteflow_legal_accept(bigint, bigint, text) TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.quoteflow_legal_current_documents(bigint) TO ghm_schema_owner;
GRANT EXECUTE ON FUNCTION ghm.quoteflow_legal_accept(bigint, bigint, text) TO ghm_schema_owner;

COMMIT;
