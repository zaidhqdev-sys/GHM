-- Password credential store for GHM Auth (Argon2id PHC hash + login email).
-- Construction-only. No Auth API, no password hashing in app runtime yet, no secrets.

CREATE TABLE ghm.account_password_credential (
  account_id bigint NOT NULL
    REFERENCES ghm.account_identity(id)
    ON DELETE CASCADE,

  login_email text NOT NULL,
  login_email_normalized text NOT NULL,
  password_hash text NOT NULL,

  argon2_memory_kib integer,
  argon2_time_cost integer,
  argon2_parallelism integer,

  credential_status text NOT NULL DEFAULT 'active',
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT account_password_credential_pkey
    PRIMARY KEY (account_id),

  CONSTRAINT account_password_credential_login_email_normalized_unique
    UNIQUE (login_email_normalized),

  CONSTRAINT account_password_credential_status_check
    CHECK (credential_status IN ('active', 'disabled')),

  CONSTRAINT account_password_credential_login_email_nonblank_check
    CHECK (btrim(login_email) <> ''),

  CONSTRAINT account_password_credential_login_email_normalized_nonblank_check
    CHECK (btrim(login_email_normalized) <> ''),

  CONSTRAINT account_password_credential_password_hash_nonblank_check
    CHECK (btrim(password_hash) <> '')
);

COMMENT ON TABLE ghm.account_password_credential IS
  'One password credential per account. Stores Argon2id PHC hash only; never plaintext. Login email uniqueness is on login_email_normalized (narrow first-gate policy).';

ALTER TABLE ghm.account_password_credential OWNER TO ghm_schema_owner;

GRANT USAGE ON SCHEMA ghm TO ghm_runtime;

-- No runtime DML or SELECT until controlled Auth functions exist (hashes must not be readable by ghm_runtime).
REVOKE ALL ON TABLE ghm.account_password_credential FROM ghm_runtime;
