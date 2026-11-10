import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = new URL('../../database/migrations/20261110020000_create_business_engagement_analytics.sql', import.meta.url);
test('engagement event storage is bounded, append-only and runtime least-privilege', async () => {
  const sql = await readFile(migration, 'utf8');
  assert.match(sql, /CREATE TABLE ghm\.business_engagement_event/);
  assert.match(sql, /quote_request/);
  assert.match(sql, /octet_length\(event_context::text\) <= 4000/);
  assert.match(sql, /REVOKE ALL ON TABLE ghm\.business_engagement_event FROM PUBLIC, ghm_migrator/);
  assert.match(sql, /GRANT INSERT \(business_id, account_id, event_type, event_context, source\)/);
  assert.doesNotMatch(sql, /GRANT (?:ALL|UPDATE|DELETE)/);
});
