import { assertRuntimeDatabaseIdentity } from './runtime-identity';

export const startRuntimeServer = async (
  query: Parameters<typeof assertRuntimeDatabaseIdentity>[0],
  listen: () => void,
): Promise<void> => {
  await assertRuntimeDatabaseIdentity(query);
  listen();
};