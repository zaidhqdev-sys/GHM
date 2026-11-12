import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('database/cutovers/20261112160000_campaign_directory_review_actor_gateway.sql', 'utf8');
const reader = readFileSync('src/actor-gateway/campaign-directory-review-reader.ts', 'utf8');
const rollback = readFileSync('database/cutovers/20261112161000_campaign_directory_review_actor_gateway_rollback.sql', 'utf8');

test('manual Campaign/review cutover extends the signed actor assertion allow-list', () => {
  for (const operation of ['campaign.create', 'campaign.update', 'directory_review.presentation.read']) {
    assert.ok(migration.includes(`'${operation}'`));
  }
  assert.match(migration, /ghm\.assert_actor_gateway_capability/);
  assert.match(migration, /Actor assertion context mismatch/);
});

test('Campaign create/update wrappers bind the complete request context and use the verified actor', () => {
  assert.match(migration, /jsonb_build_object\('businessId',p_business,'title',p_title\)/);
  assert.match(migration, /jsonb_build_object\('campaignId',p_campaign,'title',p_title,'status',p_status\)/);
  assert.match(migration, /ghm\.create_campaign\(v_actor,p_business,p_title\)/);
  assert.match(migration, /ghm\.update_campaign\(v_actor,p_campaign,p_title,p_status\)/);
  assert.match(reader, /createActorGatewayAssertion\(this\.key, actor, 'campaign\.create'/);
  assert.match(reader, /createActorGatewayAssertion\(this\.key, actor, 'campaign\.update'/);
});

test('directory-review presentation is read only through an actor-bound wrapper', () => {
  assert.match(migration, /jsonb_build_object\('businessId',p_business\)/);
  assert.match(migration, /ghm\.get_business_directory_review_presentation\(v_actor,p_business\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION ghm\.get_business_directory_review_presentation\(bigint,bigint\) FROM PUBLIC,ghm_runtime/);
  assert.match(reader, /directory_review\.presentation\.read/);
});

test('manual cutover grants wrappers only to Actor Gateway and revokes legacy runtime grants', () => {
  for (const signature of [
    'gateway_create_campaign(bigint,bigint,uuid,text,text,bigint,text)',
    'gateway_update_campaign(bigint,bigint,uuid,text,text,bigint,text,text)',
    'gateway_get_business_directory_review_presentation(bigint,bigint,uuid,text,text,bigint)',
  ]) {
    assert.ok(migration.includes(`REVOKE ALL ON FUNCTION ghm.${signature} FROM PUBLIC,ghm_runtime,ghm_migrator`));
    assert.ok(migration.includes(`GRANT EXECUTE ON FUNCTION ghm.${signature} TO ghm_actor_gateway`));
  }
  assert.match(migration, /REVOKE ALL ON FUNCTION ghm\.create_campaign\(bigint,bigint,text\) FROM PUBLIC,ghm_runtime/);
  assert.match(migration, /REVOKE ALL ON FUNCTION ghm\.update_campaign\(bigint,bigint,text,text\) FROM PUBLIC,ghm_runtime/);
});


test('manual rollback is guarded and restores the legacy runtime ACL while disabling gateway wrappers', () => {
  assert.match(rollback, /session_user IS DISTINCT FROM 'ghm_migrator'/);
  assert.match(rollback, /current_user IS DISTINCT FROM 'ghm_schema_owner'/);
  assert.match(rollback, /GRANT EXECUTE ON FUNCTION ghm\.create_campaign\(bigint,bigint,text\) TO ghm_runtime/);
  assert.match(rollback, /GRANT EXECUTE ON FUNCTION ghm\.update_campaign\(bigint,bigint,text,text\) TO ghm_runtime/);
  assert.match(rollback, /GRANT EXECUTE ON FUNCTION ghm\.get_business_directory_review_presentation\(bigint,bigint\) TO ghm_runtime/);
  assert.match(rollback, /REVOKE ALL ON FUNCTION ghm\.gateway_create_campaign[\s\S]*?FROM ghm_actor_gateway/);
  assert.match(rollback, /REVOKE ALL ON FUNCTION ghm\.gateway_update_campaign[\s\S]*?FROM ghm_actor_gateway/);
  assert.match(rollback, /REVOKE ALL ON FUNCTION ghm\.gateway_get_business_directory_review_presentation[\s\S]*?FROM ghm_actor_gateway/);
});


test('manual cutover refuses a partially extended assertion allow-list and is safe to reapply after rollback', () => {
  assert.match(migration, /v_create AND v_update AND v_review/);
  assert.match(migration, /ELSIF v_create OR v_update OR v_review/);
  assert.match(migration, /Idempotent re-application after a rehearsed rollback/);
});
