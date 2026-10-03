CREATE TABLE ghm.quoteflow_identity_link (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  relationship_type text NOT NULL CHECK (relationship_type IN ('account','business')),
  quoteflow_subject text NOT NULL CHECK (btrim(quoteflow_subject) <> ''),
  ghm_target_id bigint NOT NULL CHECK (ghm_target_id > 0),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','active','revoked')),
  ceremony_id uuid NOT NULL UNIQUE,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  initiated_by_ghm_account_id bigint REFERENCES ghm.account_identity(id),
  quoteflow_confirmation_subject text,
  quoteflow_confirmed_at timestamptz,
  ghm_confirmed_by bigint REFERENCES ghm.account_identity(id),
  ghm_confirmed_at timestamptz,
  activated_at timestamptz,
  revoked_by bigint REFERENCES ghm.account_identity(id),
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((quoteflow_confirmed_at IS NULL) = (quoteflow_confirmation_subject IS NULL)),
  CHECK (state <> 'active' OR (activated_at IS NOT NULL AND quoteflow_confirmed_at IS NOT NULL AND ghm_confirmed_at IS NOT NULL)),
  CHECK (state <> 'revoked' OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revocation_reason IS NOT NULL))
);

CREATE UNIQUE INDEX quoteflow_identity_link_active_account_subject_uq ON ghm.quoteflow_identity_link (quoteflow_subject) WHERE relationship_type='account' AND state='active';
CREATE UNIQUE INDEX quoteflow_identity_link_active_account_target_uq ON ghm.quoteflow_identity_link (ghm_target_id) WHERE relationship_type='account' AND state='active';
CREATE UNIQUE INDEX quoteflow_identity_link_active_business_subject_uq ON ghm.quoteflow_identity_link (quoteflow_subject) WHERE relationship_type='business' AND state='active';
CREATE UNIQUE INDEX quoteflow_identity_link_active_business_target_uq ON ghm.quoteflow_identity_link (ghm_target_id) WHERE relationship_type='business' AND state='active';

CREATE OR REPLACE FUNCTION ghm.create_quoteflow_identity_link(
  p_relationship_type text, p_quoteflow_subject text, p_ghm_target_id bigint, p_ceremony_id uuid, p_initiated_by bigint
) RETURNS ghm.quoteflow_identity_link
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm AS $$
DECLARE v_row ghm.quoteflow_identity_link%ROWTYPE;
BEGIN
  IF p_relationship_type NOT IN ('account','business') OR p_quoteflow_subject IS NULL OR btrim(p_quoteflow_subject)='' OR p_ghm_target_id IS NULL OR p_ghm_target_id<=0 OR p_ceremony_id IS NULL OR p_initiated_by IS NULL OR p_initiated_by<=0 THEN
    RAISE EXCEPTION 'Valid identity link target and initiator are required';
  END IF;
  IF p_relationship_type='account' AND NOT EXISTS (SELECT 1 FROM ghm.account_identity WHERE id=p_ghm_target_id) THEN
    RAISE EXCEPTION 'Target GHM account not found';
  END IF;
  IF p_relationship_type='business' AND NOT EXISTS (SELECT 1 FROM ghm.business WHERE id=p_ghm_target_id) THEN
    RAISE EXCEPTION 'Target GHM business not found';
  END IF;
  INSERT INTO ghm.quoteflow_identity_link(relationship_type,quoteflow_subject,ghm_target_id,ceremony_id,initiated_by_ghm_account_id)
  VALUES(p_relationship_type,btrim(p_quoteflow_subject),p_ghm_target_id,p_ceremony_id,p_initiated_by)
  RETURNING * INTO v_row;
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION ghm.confirm_quoteflow_identity_link(
  p_ceremony_id uuid, p_expected_version bigint, p_side text, p_quoteflow_subject text, p_ghm_target_id bigint, p_actor_id bigint
) RETURNS ghm.quoteflow_identity_link
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm AS $$
DECLARE v_row ghm.quoteflow_identity_link%ROWTYPE; v_authorized boolean;
BEGIN
  SELECT * INTO v_row FROM ghm.quoteflow_identity_link WHERE ceremony_id=p_ceremony_id FOR UPDATE;
  IF NOT FOUND OR v_row.version IS DISTINCT FROM p_expected_version OR v_row.state<>'pending' OR v_row.quoteflow_subject IS DISTINCT FROM p_quoteflow_subject OR v_row.ghm_target_id IS DISTINCT FROM p_ghm_target_id THEN
    RAISE EXCEPTION 'Identity link ceremony is stale or mismatched';
  END IF;
  IF p_side='ghm' THEN
    IF v_row.relationship_type='account' THEN v_authorized := p_actor_id=v_row.ghm_target_id;
    ELSE SELECT EXISTS(SELECT 1 FROM ghm.business_membership WHERE business_id=v_row.ghm_target_id AND account_id=p_actor_id AND membership_status='active' AND membership_role IN ('owner','administrator')) INTO v_authorized;
    END IF;
    IF NOT v_authorized THEN RAISE EXCEPTION 'GHM confirmation authority denied'; END IF;
    v_row.ghm_confirmed_by:=p_actor_id; v_row.ghm_confirmed_at:=clock_timestamp();
  ELSIF p_side='quoteflow' THEN
    IF p_actor_id IS NULL THEN RAISE EXCEPTION 'QuoteFlow confirmation actor is required'; END IF;
    v_row.quoteflow_confirmation_subject:=p_quoteflow_subject; v_row.quoteflow_confirmed_at:=clock_timestamp();
  ELSE RAISE EXCEPTION 'Invalid confirmation side';
  END IF;
  v_row.version:=v_row.version+1;
  IF v_row.ghm_confirmed_at IS NOT NULL AND v_row.quoteflow_confirmed_at IS NOT NULL THEN v_row.state:='active'; v_row.activated_at:=clock_timestamp(); END IF;
  UPDATE ghm.quoteflow_identity_link SET state=v_row.state,version=v_row.version,quoteflow_confirmation_subject=v_row.quoteflow_confirmation_subject,quoteflow_confirmed_at=v_row.quoteflow_confirmed_at,ghm_confirmed_by=v_row.ghm_confirmed_by,ghm_confirmed_at=v_row.ghm_confirmed_at,activated_at=v_row.activated_at,updated_at=clock_timestamp() WHERE id=v_row.id RETURNING * INTO v_row;
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION ghm.revoke_quoteflow_identity_link(
  p_ceremony_id uuid,p_expected_version bigint,p_actor_id bigint,p_reason text
) RETURNS ghm.quoteflow_identity_link
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ghm AS $$
DECLARE v_row ghm.quoteflow_identity_link%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM ghm.quoteflow_identity_link WHERE ceremony_id=p_ceremony_id FOR UPDATE;
  IF NOT FOUND OR v_row.state<>'active' OR v_row.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Identity link is stale or not active'; END IF;
  IF p_reason IS NULL OR btrim(p_reason)='' THEN RAISE EXCEPTION 'Revocation reason is required'; END IF;
  UPDATE ghm.quoteflow_identity_link SET state='revoked',version=version+1,revoked_by=p_actor_id,revoked_at=clock_timestamp(),revocation_reason=btrim(p_reason),updated_at=clock_timestamp() WHERE id=v_row.id RETURNING * INTO v_row;
  RETURN v_row;
END; $$;

ALTER TABLE ghm.quoteflow_identity_link OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.create_quoteflow_identity_link(text,text,bigint,uuid,bigint) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.confirm_quoteflow_identity_link(uuid,bigint,text,text,bigint,bigint) OWNER TO ghm_schema_owner;
ALTER FUNCTION ghm.revoke_quoteflow_identity_link(uuid,bigint,bigint,text) OWNER TO ghm_schema_owner;
REVOKE ALL ON TABLE ghm.quoteflow_identity_link FROM PUBLIC,ghm_runtime;
REVOKE ALL ON FUNCTION ghm.create_quoteflow_identity_link(text,text,bigint,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION ghm.confirm_quoteflow_identity_link(uuid,bigint,text,text,bigint,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION ghm.revoke_quoteflow_identity_link(uuid,bigint,bigint,text) FROM PUBLIC;
GRANT SELECT ON ghm.quoteflow_identity_link TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.create_quoteflow_identity_link(text,text,bigint,uuid,bigint) TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.confirm_quoteflow_identity_link(uuid,bigint,text,text,bigint,bigint) TO ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.revoke_quoteflow_identity_link(uuid,bigint,bigint,text) TO ghm_runtime;