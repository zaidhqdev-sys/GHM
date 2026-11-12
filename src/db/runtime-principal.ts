export interface RuntimeDatabaseIdentity {
  session_user: string;
  current_user: string;
  database_connect_privilege: boolean;
  database_create_privilege: boolean;
  schema_usage: boolean;
  schema_create: boolean;
  rolcanlogin: boolean;
  rolinherit: boolean;
  rolsuper: boolean;
  rolcreatedb: boolean;
  rolcreaterole: boolean;
  rolreplication: boolean;
  rolbypassrls: boolean;
  no_untrusted_role_memberships: boolean;
}

export const assertRuntimeDatabaseIdentity = (identity: RuntimeDatabaseIdentity): void => {
  const expectedFlags = {
    database_connect_privilege: true,
    database_create_privilege: false,
    schema_usage: true,
    schema_create: false,
    rolcanlogin: true,
    rolinherit: false,
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolreplication: false,
    rolbypassrls: false,
    no_untrusted_role_memberships: true,
  };
  const invalidFlags = Object.entries(expectedFlags)
    .filter(([key, expected]) => identity[key as keyof RuntimeDatabaseIdentity] !== expected)
    .map(([key]) => key);

  if (
    identity.session_user !== 'ghm_runtime' ||
    identity.current_user !== 'ghm_runtime' ||
    invalidFlags.length > 0
  ) {
    throw new Error(
      `Runtime database principal failed least-privilege verification: session_user=${identity.session_user}, current_user=${identity.current_user}, invalid_flags=${invalidFlags.join(',') || 'none'}`,
    );
  }
};
