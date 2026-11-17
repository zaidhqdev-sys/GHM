import 'dotenv/config';
import pg from 'pg';
import {
  provisionVerifierSecretInsertOnly,
  validateVerifierSecretProvisioningConfig,
} from './lib/database-verifier-secret-provisioning.mjs';

const safeFailure = (error) => ({
  status: 'BLOCKED',
  error: error instanceof Error ? error.message : 'UnknownError',
  secret_value_logged: false,
});

try {
  const config = validateVerifierSecretProvisioningConfig(process.env);
  const client = new pg.Client({
    connectionString: process.env.GHM_MIGRATOR_DATABASE_URL,
    ssl: config.ssl,
    connectionTimeoutMillis: 5000,
  });
  const result = await provisionVerifierSecretInsertOnly(client, config);
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(JSON.stringify(safeFailure(error)));
  process.exitCode = 2;
}
