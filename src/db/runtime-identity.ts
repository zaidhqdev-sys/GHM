export type RuntimeDatabaseIdentity = {
  session_user: string;
  current_user: string;
  current_database: string;
};

type IdentityQuery = (
  sql: string,
) => Promise<{ rows: RuntimeDatabaseIdentity[] }>;

export const assertRuntimeDatabaseIdentity = async (
  query: IdentityQuery,
): Promise<void> => {
  const result = await query(
    'SELECT session_user, current_user, current_database()',
  );

  const identity = result.rows[0];

  if (
    identity?.session_user !== 'ghm_runtime' ||
    identity?.current_user !== 'ghm_runtime'
  ) {
    throw new Error('Runtime database identity verification failed');
  }
};
