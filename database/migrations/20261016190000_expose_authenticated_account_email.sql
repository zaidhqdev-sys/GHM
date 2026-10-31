-- Expose only the authenticated account's canonical login email through a narrow runtime function.
-- The password credential table remains inaccessible directly to ghm_runtime.

CREATE OR REPLACE FUNCTION ghm.auth_read_account_email(p_account_id bigint)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, ghm
AS $$
  SELECT credential.login_email
    FROM ghm.account_password_credential AS credential
   WHERE credential.account_id = p_account_id
     AND credential.credential_status = 'active'
$$;

ALTER FUNCTION ghm.auth_read_account_email(bigint) OWNER TO ghm_schema_owner;
REVOKE ALL ON FUNCTION ghm.auth_read_account_email(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ghm.auth_read_account_email(bigint) TO ghm_runtime;

COMMENT ON FUNCTION ghm.auth_read_account_email(bigint) IS
  'Returns the active login email for a canonical GHM account. HTTP callers must derive p_account_id from authenticated server context; never accept an arbitrary account ID from browser input.';
