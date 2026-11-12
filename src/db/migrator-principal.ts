export interface MigratorDatabaseIdentity {
  current_database: string;
  current_user: string;
  session_user: string;
  database_connect_privilege: boolean;
  database_create_privilege: boolean;
  schema_usage: boolean;
  schema_create: boolean;
  direct_relation_privileges: boolean;
  migrator_rolcanlogin: boolean;
  migrator_rolinherit: boolean;
  migrator_rolsuper: boolean;
  migrator_rolcreatedb: boolean;
  migrator_rolcreaterole: boolean;
  migrator_rolreplication: boolean;
  migrator_rolbypassrls: boolean;
  direct_membership_count: number;
  exact_schema_owner_membership: boolean;
  schema_owner_direct_membership_count: number;
  schema_owner_database_create_privilege: boolean;
  schema_owner_owns_ghm_schema: boolean;
  schema_owner_rolcanlogin: boolean;
  schema_owner_rolsuper: boolean;
  schema_owner_rolcreatedb: boolean;
  schema_owner_rolcreaterole: boolean;
  schema_owner_rolreplication: boolean;
  schema_owner_rolbypassrls: boolean;
}

export const assertMigratorDatabaseIdentity = (identity: MigratorDatabaseIdentity | undefined): void => {
  if (!identity) throw new Error('Migration database principal could not be resolved');

  const expectedFlags: Partial<Record<keyof MigratorDatabaseIdentity, boolean | number>> = {
    database_connect_privilege: true,
    database_create_privilege: false,
    schema_usage: false,
    schema_create: false,
    direct_relation_privileges: false,
    migrator_rolcanlogin: true,
    migrator_rolinherit: false,
    migrator_rolsuper: false,
    migrator_rolcreatedb: false,
    migrator_rolcreaterole: false,
    migrator_rolreplication: false,
    migrator_rolbypassrls: false,
    direct_membership_count: 1,
    exact_schema_owner_membership: true,
    schema_owner_direct_membership_count: 0,
    schema_owner_database_create_privilege: true,
    schema_owner_owns_ghm_schema: true,
    schema_owner_rolcanlogin: false,
    schema_owner_rolsuper: false,
    schema_owner_rolcreatedb: false,
    schema_owner_rolcreaterole: false,
    schema_owner_rolreplication: false,
    schema_owner_rolbypassrls: false,
  };
  const invalidFlags = Object.entries(expectedFlags)
    .filter(([key, expected]) => identity[key as keyof MigratorDatabaseIdentity] !== expected)
    .map(([key]) => key);

  if (
    identity.current_user !== 'ghm_migrator' ||
    identity.session_user !== 'ghm_migrator' ||
    invalidFlags.length > 0
  ) {
    throw new Error(
      `Migration database principal failed least-privilege verification: current_user=${identity.current_user}, session_user=${identity.session_user}, invalid_flags=${invalidFlags.join(',') || 'none'}`,
    );
  }
};
