export type PostgresTargetExpectation = {
  databaseName: string | undefined;
  host: string | undefined;
  label: string;
};

export const normalizePostgresHost = (host: string): string =>
  host.trim().toLowerCase().replace(/\.frankfurt-postgres\.render\.com$/i, '');

export const assertPostgresTargetConfiguration = (
  connectionString: string | undefined,
  expectation: PostgresTargetExpectation,
): { databaseName: string; host: string } => {
  if (!connectionString?.trim()) throw new Error(`${expectation.label}: database connection URL is required`);
  if (!expectation.databaseName?.trim()) {
    throw new Error(`${expectation.label}: explicit approved database name is required`);
  }
  if (!expectation.host?.trim()) {
    throw new Error(`${expectation.label}: explicit approved PostgreSQL host is required`);
  }

  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error(`${expectation.label}: database connection URL is invalid`);
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const host = normalizePostgresHost(parsed.hostname);
  const expectedHost = normalizePostgresHost(expectation.host);

  if (!databaseName || databaseName !== expectation.databaseName.trim()) {
    throw new Error(`${expectation.label}: connected database URL does not match the explicitly approved database name`);
  }
  if (!host || host !== expectedHost) {
    throw new Error(`${expectation.label}: connected database URL does not match the explicitly approved PostgreSQL host`);
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(`${expectation.label}: only PostgreSQL connection URLs are allowed`);
  }

  return { databaseName, host };
};

export const assertMatchingPostgresTargets = (
  first: { databaseName: string; host: string },
  second: { databaseName: string; host: string },
  label: string,
): void => {
  if (first.databaseName !== second.databaseName || normalizePostgresHost(first.host) !== normalizePostgresHost(second.host)) {
    throw new Error(`${label}: runtime and migration connections must target the same explicitly approved PostgreSQL database`);
  }
};
