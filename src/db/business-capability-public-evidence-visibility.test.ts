import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const repository = fs.readFileSync('src/resources/business-capability/repository.ts', 'utf8');
const migration = fs.readFileSync('database/migrations/20261109140000_close_evidence_and_founder_review_authority.sql', 'utf8');

test('public capability listings use a narrow database predicate rather than reading evidence rows', () => {
  assert.match(repository, /is_business_capability_publicly_evidence_eligible\(bc_assertion\.id\)/);
  assert.doesNotMatch(repository, /FROM ghm\.business_capability_evidence/);
  assert.match(migration, /REVOKE SELECT ON TABLE ghm\.business_capability_evidence FROM ghm_runtime/);
  assert.match(migration, /evidence\.visibility = 'public'/);
  assert.match(migration, /evidence\.verification_status = 'verified'/);
  assert.match(migration, /evidence\.expires_on IS NULL OR evidence\.expires_on >= current_date/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION ghm\.is_business_capability_publicly_evidence_eligible\(bigint\)[\s\S]*TO ghm_runtime/);
});

test('evidence eligibility preserves the no-evidence pathway but never exposes private evidence', () => {
  assert.match(migration, /NOT EXISTS \([\s\S]*business_capability_evidence evidence[\s\S]*business_capability_id = p_business_capability_id/);
  assert.match(migration, /OR EXISTS \([\s\S]*visibility = 'public'[\s\S]*verification_status = 'verified'/);
});

test('runtime has no direct evidence SELECT grant', () => {
  assert.doesNotMatch(migration, /GRANT SELECT[^;]*business_capability_evidence[^;]*ghm_runtime/);
});
