import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const repository = fs.readFileSync('src/resources/business-capability/repository.ts', 'utf8');

test('public capability listings suppress evidence-backed assertions without valid verified evidence', () => {
  assert.match(repository, /NOT EXISTS \([\s\S]*FROM ghm\.business_capability_evidence evidence[\s\S]*evidence\.business_capability_id = bc_assertion\.id/);
  assert.match(repository, /EXISTS \([\s\S]*FROM ghm\.business_capability_evidence evidence[\s\S]*evidence\.verification_status = 'verified'[\s\S]*evidence\.expires_on IS NULL OR evidence\.expires_on >= current_date/);
});

test('evidence expiry affects public presentation only and does not mutate audit state', () => {
  const publicQuery = repository.slice(repository.indexOf('async listPublicBusinessCapabilities'), repository.indexOf('async createBusinessCapability'));
  assert.match(publicQuery, /Expiry is display-only/);
  assert.doesNotMatch(publicQuery, /UPDATE ghm\.business_capability/);
  assert.match(publicQuery, /NOT EXISTS \([\s\S]*business_capability_evidence/);
});
