import { Pool } from 'pg';
import { config } from '../config';
import { postgresSslConfig } from './postgres-ssl';

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: postgresSslConfig(config.databaseSsl),
});
