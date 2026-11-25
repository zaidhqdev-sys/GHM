import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(new URL('../../database/migrations/20261125020000_add_business_engagement_analytics.sql', import.meta.url), 'utf8');

test('Business engagement migration preserves bounded canonical event vocabulary', () => {
  assert.match(migration, /CREATE TABLE ghm\.business_engagement_event/i);
  for (const event of ['profile_view', 'call', 'whatsapp', 'quote_request', 'website_visit', 'direction_request', 'save', 'share']) {
    assert.ok(migration.includes(`'${event}'`), `missing event type: ${event}`);
  }
  assert.match(migration, /context jsonb NOT NULL DEFAULT '\{\}'::jsonb/i);
  assert.match(migration, /octet_length\(context::text\) <= 4000/i);
});

test('profile view visitor deduplication is Business-scoped and 24-hour bounded', () => {
  assert.match(migration, /PRIMARY KEY \(business_id, visitor_id\)/i);
  assert.match(migration, /last_viewed_at < now\(\) - interval '24 hours'/i);
  assert.match(migration, /AFTER INSERT ON ghm\.business_engagement_event/i);
  assert.match(migration, /profile_views = profile_views \+ 1/i);
});

test('engagement event actor references canonical GHM account identity', () => {
  assert.match(migration, /actor_account_id bigint REFERENCES ghm\.account_identity\(id\)/i);
  assert.doesNotMatch(migration, /CREATE TABLE public\./i);
});
