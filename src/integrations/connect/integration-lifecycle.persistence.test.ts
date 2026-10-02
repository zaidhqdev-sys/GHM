import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import 'dotenv/config';

import { PostgresConnectIntegrationLifecycleRepository, requireActiveConnectIntegration } from './integration-lifecycle';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
const ssl = process.env.DATABASE_SSL === 'true'
  ? { rejectUnauthorized: false }
  : undefined;

test('Connect integration lifecycle: live PostgreSQL qualification', async (t) => {
  if (!runtimeUrl || !migratorUrl || runtimeUrl === migratorUrl) {
    t.skip('Distinct runtime/migrator database URLs are required');
    return;
  }

  const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
  const migratorPool = new Pool({ connectionString: migratorUrl, ssl });
  const integrationId = `qualification-${randomUUID()}`;

  const owner = async <T>(work: (client: any) => Promise<T>): Promise<T> => {
    const client = await migratorPool.connect();
    try {
      await client.query('SET ROLE ghm_schema_owner');
      return await work(client);
    } finally {
      client.release();
    }
  };

  t.after(async () => {
    await owner(async (client) => {
      await client.query('DELETE FROM ghm.connect_integration WHERE id = $1', [integrationId]);
    });
    await runtimePool.end();
    await migratorPool.end();
  });

  await owner(async (client) => {
    await client.query(
      'SELECT * FROM ghm.connect_integration_create($1, $2)',
      [integrationId, 'Connect lifecycle qualification'],
    );
  });

  const repository = new PostgresConnectIntegrationLifecycleRepository(runtimePool);

  await t.test('runtime can read active integration and active gate accepts it', async () => {
    const result = await requireActiveConnectIntegration(repository, integrationId);
    assert.equal(result.id, integrationId);
    assert.equal(result.status, 'active');
  });

  await owner(async (client) => {
    const result = await client.query(
      'SELECT ghm.connect_integration_disable($1) AS changed',
      [integrationId],
    );
    assert.equal(result.rows[0].changed, true);
  });

  await t.test('disabled integration is rejected by runtime gate', async () => {
    await assert.rejects(
      () => requireActiveConnectIntegration(repository, integrationId),
      /Connect integration is not active/,
    );
  });

  await owner(async (client) => {
    const result = await client.query(
      'SELECT ghm.connect_integration_enable($1) AS changed',
      [integrationId],
    );
    assert.equal(result.rows[0].changed, true);
  });

  await t.test('disabled integration can return to active', async () => {
    const result = await requireActiveConnectIntegration(repository, integrationId);
    assert.equal(result.status, 'active');
  });

  await owner(async (client) => {
    const result = await client.query(
      'SELECT ghm.connect_integration_revoke($1) AS changed',
      [integrationId],
    );
    assert.equal(result.rows[0].changed, true);

    const reenable = await client.query(
      'SELECT ghm.connect_integration_enable($1) AS changed',
      [integrationId],
    );
    assert.equal(reenable.rows[0].changed, false);
  });

  await t.test('revoked integration is rejected and terminal', async () => {
    await assert.rejects(
      () => requireActiveConnectIntegration(repository, integrationId),
      /Connect integration is not active/,
    );
  });

  await t.test('runtime cannot mutate lifecycle directly', async () => {
    const client = await runtimePool.connect();
    try {
      await assert.rejects(
        () => client.query('SELECT ghm.connect_integration_revoke($1)', [integrationId]),
      );
    } finally {
      client.release();
    }
  });
});
