BEGIN;

-- This role is provisioned as a NOLOGIN group by the database/infrastructure owner.
-- The migration intentionally fails if that prerequisite is absent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ghm_payment_provider') THEN
    RAISE EXCEPTION 'required role ghm_payment_provider is missing; provision it as NOLOGIN before applying this migration';
  END IF;
END;
$$;

-- Ordinary API connections must never settle provider payments directly.
REVOKE EXECUTE ON FUNCTION ghm.commercial_apply_payment_result(
  bigint,text,text,text,text,text,text,text,timestamptz,jsonb
) FROM PUBLIC, ghm_runtime;

CREATE OR REPLACE FUNCTION ghm.commercial_get_payfast_attempt(p_payment_attempt_id bigint)
RETURNS TABLE (
  payment_attempt_id bigint,
  provider_code text,
  amount_minor_units bigint,
  attempt_status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
  SELECT a.id, a.provider_code, a.amount_minor_units, a.attempt_status
  FROM ghm.commercial_payment_attempt AS a
  WHERE a.id = p_payment_attempt_id
  LIMIT 1
$$;

ALTER FUNCTION ghm.commercial_get_payfast_attempt(bigint) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.commercial_get_payfast_attempt(bigint) FROM PUBLIC, ghm_runtime;
GRANT EXECUTE ON FUNCTION ghm.commercial_get_payfast_attempt(bigint) TO ghm_payment_provider;

CREATE OR REPLACE FUNCTION ghm.commercial_apply_payfast_payment_result(
  p_payment_attempt_id bigint,
  p_external_provider_event_id text,
  p_provider_event_type text,
  p_provider_payload_hash text,
  p_transaction_kind text,
  p_transaction_status text,
  p_provider_transaction_reference text,
  p_occurred_at timestamptz,
  p_metadata jsonb
)
RETURNS ghm.commercial_payment_transaction
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
BEGIN
  RETURN ghm.commercial_apply_payment_result(
    p_payment_attempt_id,
    'payfast',
    p_external_provider_event_id,
    p_provider_event_type,
    p_provider_payload_hash,
    p_transaction_kind,
    p_transaction_status,
    p_provider_transaction_reference,
    p_occurred_at,
    p_metadata
  );
END;
$$;

ALTER FUNCTION ghm.commercial_apply_payfast_payment_result(
  bigint,text,text,text,text,text,text,text,timestamptz,jsonb
) OWNER TO ghm_schema_owner;

REVOKE ALL ON FUNCTION ghm.commercial_apply_payfast_payment_result(
  bigint,text,text,text,text,text,text,text,timestamptz,jsonb
) FROM PUBLIC, ghm_runtime;

GRANT EXECUTE ON FUNCTION ghm.commercial_apply_payfast_payment_result(
  bigint,text,text,text,text,text,text,text,timestamptz,jsonb
) TO ghm_payment_provider;

COMMIT;
