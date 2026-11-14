-- Cryptographically bind capability database actor identity to a trusted
-- Actor Gateway assertion. A database login alone cannot manufacture the
-- assertion because the HMAC key is not readable from PostgreSQL by that login.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

CREATE TABLE IF NOT EXISTS ghm.actor_gateway_capability_assertion_secret (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  secret bytea NOT NULL CHECK (octet_length(secret) = 32),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ghm.actor_gateway_capability_assertion_secret OWNER TO ghm_schema_owner;
REVOKE ALL ON ghm.actor_gateway_capability_assertion_secret FROM PUBLIC, ghm_runtime, ghm_actor_gateway, ghm_migrator;

CREATE TABLE IF NOT EXISTS ghm.actor_gateway_capability_assertion_nonce (
  nonce uuid PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ghm.actor_gateway_capability_assertion_nonce OWNER TO ghm_schema_owner;
REVOKE ALL ON ghm.actor_gateway_capability_assertion_nonce FROM PUBLIC, ghm_runtime, ghm_actor_gateway, ghm_migrator;
CREATE INDEX IF NOT EXISTS actor_gateway_capability_assertion_nonce_expires_at_idx
  ON ghm.actor_gateway_capability_assertion_nonce(expires_at);

CREATE OR REPLACE FUNCTION ghm.assert_actor_gateway_capability(
  p_actor_account_id bigint,
  p_operation text,
  p_issued_at bigint,
  p_nonce uuid,
  p_signature text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
DECLARE
  v_secret bytea;
  v_payload text;
  v_expected bytea;
  v_provided bytea;
  v_diff integer := 0;
  v_i integer;
BEGIN
  IF session_user <> 'ghm_actor_gateway' THEN
    RAISE EXCEPTION 'Actor gateway database principal required' USING ERRCODE = '42501';
  END IF;
  IF p_actor_account_id IS NULL OR p_actor_account_id <= 0
     OR p_issued_at IS NULL OR p_nonce IS NULL
     OR p_operation IS NULL OR p_operation NOT IN ('capability.list','capability.create','capability.update','capability.transition')
     OR p_signature IS NULL OR p_signature !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid actor assertion' USING ERRCODE = '42501';
  END IF;
  IF abs(extract(epoch FROM clock_timestamp())::bigint - p_issued_at) > 60 THEN
    RAISE EXCEPTION 'Actor assertion expired' USING ERRCODE = '42501';
  END IF;

  SELECT secret INTO v_secret
    FROM ghm.actor_gateway_capability_assertion_secret
   WHERE singleton = true;
  IF v_secret IS NULL OR octet_length(v_secret) <> 32 THEN
    RAISE EXCEPTION 'Actor assertion verifier is not provisioned' USING ERRCODE = '42501';
  END IF;

  v_payload := 'ghm-actor-gateway:v1|' || p_actor_account_id::text || '|' ||
               p_operation || '|' || p_issued_at::text || '|' || p_nonce::text;
  v_expected := public.hmac(convert_to(v_payload, 'UTF8'), v_secret, 'sha256');
  v_provided := decode(p_signature, 'hex');
  -- Compare every MAC byte before branching to avoid a prefix timing oracle.
  FOR v_i IN 0..31 LOOP
    v_diff := v_diff | (get_byte(v_expected, v_i) # get_byte(v_provided, v_i));
  END LOOP;
  IF v_diff <> 0 THEN
    RAISE EXCEPTION 'Actor assertion signature invalid' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ghm.account_identity
     WHERE id = p_actor_account_id AND account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active actor account required' USING ERRCODE = '42501';
  END IF;

  DELETE FROM ghm.actor_gateway_capability_assertion_nonce
   WHERE expires_at < clock_timestamp();
  BEGIN
    INSERT INTO ghm.actor_gateway_capability_assertion_nonce(nonce, expires_at)
    VALUES (p_nonce, GREATEST(clock_timestamp(), to_timestamp(p_issued_at)) + interval '60 seconds');
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Actor assertion replay detected' USING ERRCODE = '42501';
  END;

  RETURN p_actor_account_id;
END;
$$;
ALTER FUNCTION ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text) FROM PUBLIC, ghm_runtime, ghm_migrator;
GRANT EXECUTE ON FUNCTION ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text) TO ghm_actor_gateway;

DROP FUNCTION IF EXISTS ghm.gateway_list_capabilities(bigint);
DROP FUNCTION IF EXISTS ghm.gateway_create_capability_draft(bigint,text,text,text,uuid,integer,text,integer);
DROP FUNCTION IF EXISTS ghm.gateway_update_capability_draft(bigint,uuid,text,text,text,uuid,integer,text,integer);
DROP FUNCTION IF EXISTS ghm.gateway_transition_capability_lifecycle(bigint,uuid,text,uuid,integer);

CREATE FUNCTION ghm.gateway_list_capabilities(
 p_actor_account_id bigint,p_issued_at bigint,p_nonce uuid,p_signature text
) RETURNS SETOF ghm.capability
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ghm
AS $$
BEGIN
 PERFORM ghm.assert_actor_gateway_capability(p_actor_account_id,'capability.list',p_issued_at,p_nonce,p_signature);
 IF NOT EXISTS (SELECT 1 FROM ghm.account_identity WHERE id=p_actor_account_id AND account_status='active' AND (is_system_admin=true OR role='admin')) THEN
  RAISE EXCEPTION 'System administrator permission required' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT c.* FROM ghm.capability c ORDER BY taxonomy_version DESC, sort_order, name, id;
END; $$;

CREATE FUNCTION ghm.gateway_create_capability_draft(
 p_actor_account_id bigint,p_issued_at bigint,p_nonce uuid,p_signature text,
 p_name text,p_slug text,p_description text,p_parent_id uuid,p_sort_order integer,p_source_reference text,p_version integer
) RETURNS ghm.capability
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ghm
AS $$
BEGIN
 PERFORM ghm.assert_actor_gateway_capability(p_actor_account_id,'capability.create',p_issued_at,p_nonce,p_signature);
 IF NOT EXISTS (SELECT 1 FROM ghm.account_identity WHERE id=p_actor_account_id AND account_status='active' AND (is_system_admin=true OR role='admin')) THEN
  RAISE EXCEPTION 'System administrator permission required' USING ERRCODE='42501';
 END IF;
 RETURN ghm.create_capability_draft(p_actor_account_id,p_name,p_slug,p_description,p_parent_id,p_sort_order,p_source_reference,p_version);
END; $$;

CREATE FUNCTION ghm.gateway_update_capability_draft(
 p_actor_account_id bigint,p_issued_at bigint,p_nonce uuid,p_signature text,
 p_capability_id uuid,p_name text,p_slug text,p_description text,p_parent_id uuid,p_sort_order integer,p_source_reference text,p_version integer
) RETURNS ghm.capability
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ghm
AS $$
BEGIN
 PERFORM ghm.assert_actor_gateway_capability(p_actor_account_id,'capability.update',p_issued_at,p_nonce,p_signature);
 IF NOT EXISTS (SELECT 1 FROM ghm.account_identity WHERE id=p_actor_account_id AND account_status='active' AND (is_system_admin=true OR role='admin')) THEN
  RAISE EXCEPTION 'System administrator permission required' USING ERRCODE='42501';
 END IF;
 RETURN ghm.update_capability_draft(p_actor_account_id,p_capability_id,p_name,p_slug,p_description,p_parent_id,p_sort_order,p_source_reference,p_version);
END; $$;

CREATE FUNCTION ghm.gateway_transition_capability_lifecycle(
 p_actor_account_id bigint,p_issued_at bigint,p_nonce uuid,p_signature text,
 p_capability_id uuid,p_target_status text,p_replaced_by_capability_id uuid,p_version integer
) RETURNS ghm.capability
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ghm
AS $$
BEGIN
 PERFORM ghm.assert_actor_gateway_capability(p_actor_account_id,'capability.transition',p_issued_at,p_nonce,p_signature);
 IF NOT EXISTS (SELECT 1 FROM ghm.account_identity WHERE id=p_actor_account_id AND account_status='active' AND (is_system_admin=true OR role='admin')) THEN
  RAISE EXCEPTION 'System administrator permission required' USING ERRCODE='42501';
 END IF;
 RETURN ghm.transition_capability_lifecycle(p_actor_account_id,p_capability_id,p_target_status,p_replaced_by_capability_id,p_version);
END; $$;

ALTER FUNCTION ghm.gateway_list_capabilities(bigint,bigint,uuid,text) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_create_capability_draft(bigint,bigint,uuid,text,text,text,text,uuid,integer,text,integer) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_update_capability_draft(bigint,bigint,uuid,text,uuid,text,text,text,uuid,integer,text,integer) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.gateway_transition_capability_lifecycle(bigint,bigint,uuid,text,uuid,text,uuid,integer) OWNER TO ghm_schema_owner;

REVOKE ALL ON FUNCTION ghm.gateway_list_capabilities(bigint,bigint,uuid,text) FROM PUBLIC,ghm_runtime,ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_create_capability_draft(bigint,bigint,uuid,text,text,text,text,uuid,integer,text,integer) FROM PUBLIC,ghm_runtime,ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_update_capability_draft(bigint,bigint,uuid,text,uuid,text,text,text,uuid,integer,text,integer) FROM PUBLIC,ghm_runtime,ghm_migrator;
REVOKE ALL ON FUNCTION ghm.gateway_transition_capability_lifecycle(bigint,bigint,uuid,text,uuid,text,uuid,integer) FROM PUBLIC,ghm_runtime,ghm_migrator;

GRANT EXECUTE ON FUNCTION ghm.gateway_list_capabilities(bigint,bigint,uuid,text) TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_create_capability_draft(bigint,bigint,uuid,text,text,text,text,uuid,integer,text,integer) TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_update_capability_draft(bigint,bigint,uuid,text,uuid,text,text,text,uuid,integer,text,integer) TO ghm_actor_gateway;
GRANT EXECUTE ON FUNCTION ghm.gateway_transition_capability_lifecycle(bigint,bigint,uuid,text,uuid,text,uuid,integer) TO ghm_actor_gateway;

COMMENT ON FUNCTION ghm.assert_actor_gateway_capability(bigint,text,bigint,uuid,text) IS
 'Verifies a short-lived one-use HMAC actor assertion signed by the trusted Actor Gateway. The gateway DB login cannot read the HMAC key and cannot forge actor identity by supplying an account ID.';

COMMIT;
