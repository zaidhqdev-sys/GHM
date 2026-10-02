import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import 'dotenv/config';
import { PostgresConnectServiceAssertionReplayStore, requireFreshConnectServiceAssertion } from './service-assertion-replay';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;

test('Connect service assertion replay: live PostgreSQL qualification', async (t) => {
  if (!runtimeUrl || !migratorUrl || runtimeUrl === migratorUrl) { t.skip('Distinct runtime/migrator database URLs are required'); return; }
  const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
  const migratorPool = new Pool({ connectionString: migratorUrl, ssl });
  const requestId = 'qualification-replay-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  const integrationId = 'connect-test';
  const owner = async <T>(work: (client: any) => Promise<T>): Promise<T> => {
    const client = await migratorPool.connect();
    try { await client.query('SET ROLE ghm_schema_owner'); return await work(client); } finally { client.release(); }
  };
  t.after(async () => {
    await owner(async (client) => { await client.query('DELETE FROM ghm.connect_service_assertion_replay WHERE jti = $1', [requestId]); });
    await runtimePool.end(); await migratorPool.end();
  });
  const store = new PostgresConnectServiceAssertionReplayStore(runtimePool);
  const expiry = new Date(Date.now() + 60_000);
  await requireFreshConnectServiceAssertion(store, requestId, integrationId, expiry);
  assert.equal(await store.consume(requestId, integrationId, expiry), false);
  const runtimeClient = await runtimePool.connect();
  try {
    await assert.rejects(
      () => runtimeClient.query('INSERT INTO ghm.connect_service_assertion_replay (jti, integration_id, expires_at) VALUES ($1,$2,$3)', [requestId + '-direct', integrationId, expiry]),
    );
  } finally { runtimeClient.release(); }
});