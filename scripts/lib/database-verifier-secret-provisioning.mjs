import { URL } from 'node:url';

const DEFINITIONS = Object.freeze({
  actor: Object.freeze({
    envName: 'GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET',
    table: 'actor_gateway_capability_assertion_secret',
  }),
  storage: Object.freeze({
    envName: 'GHM_STORAGE_PROVIDER_WORKFLOW_ATTESTATION_SECRET',
    table: 'storage_provider_workflow_attestation_secret',
  }),
});

const disposableName = /(^|[_-])(qualification|qual|test|testing|disposable|sandbox)([_-]|$)/i;

export const verifierSecretDefinition = (kind) => {
  const definition = DEFINITIONS[kind];
  if (!definition) throw new Error('Secret kind must be actor or storage');
  return definition;
};

export const validateVerifierSecretProvisioningConfig = (env) => {
  const kind = env.GHM_DATABASE_VERIFIER_SECRET_KIND?.trim();
  const definition = verifierSecretDefinition(kind);
  const databaseUrl = env.GHM_MIGRATOR_DATABASE_URL;
  if (!databaseUrl) throw new Error('GHM_MIGRATOR_DATABASE_URL is required; generic DATABASE_URL fallbacks are disabled');
  const url = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('A PostgreSQL connection URL is required');
  if (url.search || url.hash) throw new Error('Connection URL query parameters and fragments are not permitted');
  if (decodeURIComponent(url.username) !== 'ghm_migrator') throw new Error('Connection URL must authenticate as ghm_migrator');
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) throw new Error('Connection URL must name an explicit database');

  const target = env.GHM_SECRET_PROVISIONING_TARGET?.trim();
  let ssl;
  if (target === 'disposable') {
    const expected = env.GHM_QUALIFICATION_DATABASE_NAME?.trim() || 'ghm_disposable_test';
    if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)
      || database !== expected || !disposableName.test(expected)) {
      throw new Error('Disposable provisioning is restricted to the explicitly named local qualification database');
    }
    if (env.GHM_DATABASE_VERIFIER_SECRET_ALLOW_DISPOSABLE_MUTATION !== 'true') {
      throw new Error('Disposable provisioning requires GHM_DATABASE_VERIFIER_SECRET_ALLOW_DISPOSABLE_MUTATION=true');
    }
    ssl = ['true', 'require'].includes((env.DATABASE_SSL ?? '').trim().toLowerCase())
      ? { rejectUnauthorized: true }
      : false;
  } else if (target === 'production') {
    const expectedConfirmation = `PROVISION ghm_db ${kind}`;
    if (database !== 'ghm_db' || env.GHM_SECRET_PROVISIONING_CONFIRMATION !== expectedConfirmation
      || !env.GHM_SECRET_PROVISIONING_EXPECTED_HOST
      || url.hostname !== env.GHM_SECRET_PROVISIONING_EXPECTED_HOST
      || ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
      throw new Error('Production provisioning requires ghm_db, the exact explicit confirmation, and an exact non-local expected database host');
    }
    if (env.DATABASE_SSL !== 'true') {
      throw new Error('Production provisioning requires DATABASE_SSL=true with certificate verification enabled');
    }
    ssl = { rejectUnauthorized: true };
  } else {
    throw new Error('GHM_SECRET_PROVISIONING_TARGET must be disposable or production');
  }

  const encodedSecret = env[definition.envName];
  if (!encodedSecret) throw new Error(`${definition.envName} is required; this tool never generates secrets`);
  const secret = Buffer.from(encodedSecret, 'base64');
  if (secret.length !== 32 || secret.toString('base64') !== encodedSecret) {
    throw new Error(`${definition.envName} must be canonical base64 for exactly 32 bytes`);
  }
  return { kind, database, definition, secret, ssl, target };
};

export const provisionVerifierSecretInsertOnly = async (client, config) => {
  await client.connect();
  let inTransaction = false;
  try {
    const identity = await client.query('SELECT session_user,current_user,current_database()');
    const row = identity.rows[0];
    if (row?.session_user !== 'ghm_migrator' || row?.current_user !== 'ghm_migrator'
      || row?.current_database !== config.database) {
      throw new Error('Connected database identity does not match the explicit provisioning target');
    }

    await client.query('BEGIN');
    inTransaction = true;
    await client.query('SET LOCAL ROLE ghm_schema_owner');
    const owner = await client.query('SELECT session_user,current_user,current_database()');
    if (owner.rows[0]?.session_user !== 'ghm_migrator'
      || owner.rows[0]?.current_user !== 'ghm_schema_owner'
      || owner.rows[0]?.current_database !== config.database) {
      throw new Error('SET LOCAL ROLE ghm_schema_owner identity verification failed');
    }

    const result = await client.query(
      `INSERT INTO ghm.${config.definition.table}(singleton,secret) VALUES(true,$1) ON CONFLICT(singleton) DO NOTHING RETURNING singleton`,
      [config.secret],
    );
    if (result.rowCount !== 1) {
      throw new Error('Verifier secret already exists; provisioning is insert-only and never rotates or overwrites a key');
    }
    await client.query('COMMIT');
    inTransaction = false;
    return {
      status: 'PROVISIONED',
      target: config.target,
      database: config.database,
      kind: config.kind,
      session_user: owner.rows[0].session_user,
      current_user: owner.rows[0].current_user,
      secret_bytes: config.secret.length,
      secret_value_logged: false,
      rotation: 'NOT_SUPPORTED_BY_THIS_COMMAND',
    };
  } catch (error) {
    if (inTransaction) await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
};
