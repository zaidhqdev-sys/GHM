import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;
const databaseUrl = process.env.GHM_QUALIFICATION_DATABASE_URL;
const encodedSecret = process.env.GHM_STORAGE_PROVIDER_WORKFLOW_ATTESTATION_SECRET;
if (!databaseUrl) throw new Error('GHM_QUALIFICATION_DATABASE_URL is required; generic DATABASE_URL fallbacks are disabled');
const qualificationUrl = new URL(databaseUrl);
const expectedDatabase = process.env.GHM_QUALIFICATION_DATABASE_NAME?.trim() || 'ghm_disposable_test';
if (!['localhost', '127.0.0.1', '::1'].includes(qualificationUrl.hostname)
  || qualificationUrl.pathname !== `/${expectedDatabase}`
  || qualificationUrl.search !== '' || qualificationUrl.hash !== ''
  || !/(^|[_-])(qualification|qual|test|testing|disposable|sandbox)([_-]|$)/i.test(expectedDatabase)) {
  throw new Error('Refusing secret provisioning: URL must target the explicitly named disposable database on localhost');
}
if (process.env.GHM_STORAGE_PROVIDER_ATTESTATION_ALLOW_MUTATIONS !== 'true') {
  throw new Error('Refusing secret provisioning; set GHM_STORAGE_PROVIDER_ATTESTATION_ALLOW_MUTATIONS=true only for a disposable qualification database');
}
if (!encodedSecret) throw new Error('GHM_STORAGE_PROVIDER_WORKFLOW_ATTESTATION_SECRET is required');
const secret = Buffer.from(encodedSecret, 'base64');
if (secret.length !== 32 || secret.toString('base64') !== encodedSecret) {
  throw new Error('Provider workflow attestation secret must be canonical base64 for exactly 32 bytes');
}

const client = new Client({
  connectionString: databaseUrl,
  ssl: ['true', 'require'].includes((process.env.DATABASE_SSL ?? '').trim().toLowerCase())
    ? { rejectUnauthorized: false }
    : undefined,
});
try {
  await client.connect();
  const identity = await client.query('SELECT session_user,current_user,current_database()');
  const row = identity.rows[0];
  if (row.session_user !== 'ghm_migrator' || row.current_user !== 'ghm_migrator') {
    throw new Error('Refusing secret provisioning: expected session_user=current_user=ghm_migrator');
  }
  if (row.current_database !== expectedDatabase) {
    throw new Error('Refusing secret provisioning: connected database does not match the explicit disposable database name');
  }
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE ghm_schema_owner');
  const owner = await client.query('SELECT session_user,current_user');
  if (owner.rows[0]?.session_user !== 'ghm_migrator' || owner.rows[0]?.current_user !== 'ghm_schema_owner') {
    throw new Error('Refusing secret provisioning: SET ROLE ghm_schema_owner identity check failed');
  }
  await client.query(
    'INSERT INTO ghm.storage_provider_workflow_attestation_secret(singleton,secret) VALUES(true,$1) ON CONFLICT(singleton) DO UPDATE SET secret=EXCLUDED.secret,created_at=clock_timestamp()',
    [secret],
  );
  await client.query('COMMIT');
  console.log(JSON.stringify({
    status: 'PROVISIONED',
    database: row.current_database,
    session_user: owner.rows[0].session_user,
    current_user: owner.rows[0].current_user,
    secret_bytes: secret.length,
    secret_value_logged: false,
  }));
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  console.error(JSON.stringify({ status: 'BLOCKED', error: error instanceof Error ? error.message : 'UnknownError' }));
  process.exitCode = 2;
} finally {
  await client.end().catch(() => undefined);
}
