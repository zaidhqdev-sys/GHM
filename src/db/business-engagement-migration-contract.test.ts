import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = fs.readFileSync(path.resolve(
  process.cwd(),
  'database/migrations/20261019190000_create_business_engagement_events.sql',
), 'utf8');

test('business engagement event storage is constrained and grants only required runtime columns', () => {
  assert.match(migration, /CREATE TABLE ghm\.business_engagement_event/);
  assert.match(migration, /event_type IN \([\s\S]*'profile_view'[\s\S]*'share'/);
  assert.match(migration, /jsonb_typeof\(event_context\) = 'object'/);
  assert.match(migration, /source IN \('web', 'mobile'\)/);
  assert.match(migration, /REVOKE ALL ON TABLE ghm\.business_engagement_event FROM PUBLIC, ghm_migrator/);
  assert.match(migration, /GRANT INSERT \(business_id, account_id, event_type, event_context, source\)/);
  assert.match(migration, /GRANT USAGE, SELECT ON SEQUENCE ghm\.business_engagement_event_id_seq TO ghm_runtime/);
  assert.doesNotMatch(migration, /GRANT ALL ON TABLE ghm\.business_engagement_event/);
});
