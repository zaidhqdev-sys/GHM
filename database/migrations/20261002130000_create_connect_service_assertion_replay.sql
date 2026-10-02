-- Connect service assertion replay protection.
CREATE TABLE ghm.connect_service_assertion_replay (
  jti text PRIMARY KEY,
  integration_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connect_service_assertion_replay_jti_check CHECK (jti ~ '^[!-~]{1,128}$'),
  CONSTRAINT connect_service_assertion_replay_integration_check CHECK (integration_id ~ '^[!-~]{1,128}$')
);
COMMENT ON TABLE ghm.connect_service_assertion_replay IS 'Short-lived replay-consumption record for verified Connect service assertions. Not an audit log.';
REVOKE ALL ON TABLE ghm.connect_service_assertion_replay FROM PUBLIC;

CREATE OR REPLACE FUNCTION ghm.connect_service_assertion_consume(
  p_jti text, p_integration_id text, p_expires_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ghm
AS $$
BEGIN
  IF p_jti IS NULL OR p_jti !~ '^[!-~]{1,128}$' THEN RAISE EXCEPTION 'Connect service assertion jti must be printable ASCII <= 128 characters' USING ERRCODE = '22023'; END IF;
  IF p_integration_id IS NULL OR p_integration_id !~ '^[!-~]{1,128}$' THEN RAISE EXCEPTION 'Connect integration id must be printable ASCII <= 128 characters' USING ERRCODE = '22023'; END IF;
  IF p_expires_at IS NULL OR p_expires_at <= now() THEN RAISE EXCEPTION 'Connect service assertion expiry must be in the future' USING ERRCODE = '22023'; END IF;
  DELETE FROM ghm.connect_service_assertion_replay WHERE expires_at <= now();
  INSERT INTO ghm.connect_service_assertion_replay (jti, integration_id, expires_at)
  VALUES (p_jti, p_integration_id, p_expires_at)
  ON CONFLICT (jti) DO NOTHING;
  RETURN FOUND;
END;
$$;
ALTER FUNCTION ghm.connect_service_assertion_consume(text, text, timestamptz) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.connect_service_assertion_consume(text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.connect_service_assertion_consume(text, text, timestamptz) TO ghm_runtime;
