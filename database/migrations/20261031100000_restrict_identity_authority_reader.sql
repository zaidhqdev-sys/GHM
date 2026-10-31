-- The identity-authority reader has no runtime consumer. Keep it unavailable
-- to the application role until a reviewed, account-scoped runtime contract exists.
REVOKE EXECUTE ON FUNCTION ghm.auth_read_connect_identity_authority(bigint) FROM ghm_runtime;

COMMENT ON FUNCTION ghm.auth_read_connect_identity_authority(bigint) IS
  'Reserved identity-authority contract. Execution is restricted to the schema owner pending a reviewed runtime caller and account-scope enforcement.';
