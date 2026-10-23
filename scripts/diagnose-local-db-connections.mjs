import { readFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import { Client } from 'pg';

const envPath = '.env';
const targetNames = new Set([
  'DATABASE_URL',
  'GHM_RUNTIME_DATABASE_URL',
  'GHM_MIGRATOR_DATABASE_URL',
]);

const redactMessage = (message) => String(message ?? 'unknown error')
  .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[connection URL redacted]')
  .replace(/(password\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]')
  .replace(/(passfile\s*[=:]\s*)[^\s,;]+/gi, '$1[redacted]');

const lines = (await readFile(envPath, 'utf8')).split(/\r?\n/);
let count = 0;

for (let index = 0; index < lines.length; index += 1) {
  const parsed = dotenv.parse(lines[index]);
  for (const name of targetNames) {
    if (!Object.hasOwn(parsed, name)) continue;
    count += 1;
    const connectionString = parsed[name];
    let client;

    try {
      const url = new URL(connectionString);
      const database = decodeURIComponent(url.pathname.replace(/^\//, '').split('?')[0]);
      const username = decodeURIComponent(url.username);
      console.log(JSON.stringify({
        variable: name,
        env_line: index + 1,
        host: url.hostname,
        database,
        username,
      }));

      client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 7000,
        application_name: 'ghm_readonly_local_db_diagnostic',
      });

      await client.connect();
      await client.query('BEGIN READ ONLY');
      const result = await client.query(`
        SELECT current_database() AS database_name,
               session_user,
               current_user,
               current_setting('transaction_read_only') AS transaction_read_only
      `);
      await client.query('ROLLBACK');
      console.log(JSON.stringify({
        env_line: index + 1,
        status: 'CONNECTED',
        identity: result.rows[0],
      }));
    } catch (error) {
      console.log(JSON.stringify({
        env_line: index + 1,
        status: 'FAILED',
        code: error?.code ?? 'UNKNOWN',
        message: redactMessage(error?.message),
      }));
    } finally {
      if (client) await client.end().catch(() => {});
    }
  }
}

if (count === 0) {
  console.log('No DATABASE_URL, GHM_RUNTIME_DATABASE_URL, or GHM_MIGRATOR_DATABASE_URL entries found in .env.');
} else {
  console.log(`Checked ${count} .env entry/entries. No files or database privileges were changed.`);
}
