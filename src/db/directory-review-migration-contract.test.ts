import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = fs.readFileSync(path.resolve(process.cwd(), 'database/migrations/20261105230000_create_founder_directory_review.sql'), 'utf8');
const reconciliationMigration = fs.readFileSync(path.resolve(process.cwd(), 'database/migrations/20261107211500_reconcile_business_profile_and_founder_authority.sql'), 'utf8');
const founderReviewCloseMigration = fs.readFileSync(path.resolve(process.cwd(), 'database/migrations/20261109140000_close_evidence_and_founder_review_authority.sql'), 'utf8');
const migrationRunner = fs.readFileSync(path.resolve(process.cwd(), 'src/db/migrate.ts'), 'utf8');
// Static assertions protect the private Founder authority and publication boundary.
const businessIdentity = fs.readFileSync(path.resolve(process.cwd(), 'src/resources/business-identity/public-repository.ts'), 'utf8');

test('Founder allowlist is explicit, private and deliberately has no default reviewer', () => {
  assert.ok(migration.includes('CREATE TABLE ghm.directory_listing_founder_reviewer'));
  assert.ok(migration.includes('REVOKE ALL ON TABLE ghm.directory_listing_founder_reviewer FROM PUBLIC, ghm_runtime'));
  assert.doesNotMatch(migration, /INSERT INTO ghm\.directory_listing_founder_reviewer/i);
  assert.ok(migration.includes('is_directory_listing_founder_reviewer'));
 assert.ok(migration.includes("to_jsonb(b)->>'province'"));
 assert.ok(migration.includes("to_jsonb(b)->>'city'"));
 assert.ok(migration.includes("to_jsonb(b)->>'physical_address'"));
 assert.ok(migration.includes("to_jsonb(b)->>'whatsapp'"));
 assert.ok(migration.includes("to_jsonb(b)->>'website'"));
});

test('Founder decisions are server-authorized and review events cannot be mutated', () => {
  assert.ok(migration.includes('Founder directory review authority required'));
  assert.ok(migration.includes('CREATE TRIGGER business_directory_review_event_immutable'));
  assert.ok(migration.includes('Directory review events are append-only'));
  assert.ok(migration.includes('A reason between 1 and 1000 characters is required'));
});

test('directory review preserves GHM public visibility predicate and never toggles Business activation', () => {
  assert.match(businessIdentity, /b\.is_active = true[\s\S]*b\.is_verified = true[\s\S]*b\.verification_status = 'approved'/);
  const decision = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION ghm.review_business_directory_listing'), migration.indexOf('CREATE OR REPLACE FUNCTION ghm.get_business_directory_review_presentation'));
  assert.doesNotMatch(decision, /SET[\s\S]*is_active\s*=/i);
  assert.match(decision, /is_verified=\(p_decision='approve'\)/);
});

test('owner submission requires a declared private registration identity and does not auto-approve', () => {
  assert.match(migration, /ghm\.business_registration_identity ri[\s\S]*ri\.registration_status IS NOT NULL/);
  const submit = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION ghm.submit_business_directory_review'), migration.indexOf('CREATE OR REPLACE FUNCTION ghm.list_businesses_for_directory_review'));
  assert.match(submit, /verification_status='under_review', is_verified=false/);
  assert.match(submit, /v_prior_status/);
});

test('reconciliation migration leaves transaction boundaries to the migration runner', () => {
  assert.match(migrationRunner, /await client\.query\('BEGIN'\)/);
  assert.match(migrationRunner, /await client\.query\('COMMIT'\)/);
  assert.doesNotMatch(reconciliationMigration, /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im);
});


test('founder review write RPCs are revoked while the owner presentation read remains separately available', () => {
  assert.match(founderReviewCloseMigration, /CREATE OR REPLACE FUNCTION ghm\.is_directory_listing_founder_reviewer\(p_account_id bigint\)[\s\S]*SELECT false/);
  assert.match(founderReviewCloseMigration, /REVOKE ALL ON FUNCTION ghm\.is_directory_listing_founder_reviewer\(bigint\)[\s\S]*FROM PUBLIC, ghm_runtime/);
  assert.match(founderReviewCloseMigration, /REVOKE ALL ON FUNCTION ghm\.submit_business_directory_review\(bigint, bigint\)[\s\S]*FROM PUBLIC, ghm_runtime/);
  assert.match(founderReviewCloseMigration, /REVOKE ALL ON FUNCTION ghm\.list_businesses_for_directory_review\(bigint, text, integer, integer\)[\s\S]*FROM PUBLIC, ghm_runtime/);
  assert.match(founderReviewCloseMigration, /REVOKE ALL ON FUNCTION ghm\.review_business_directory_listing\(bigint, bigint, text, text\)[\s\S]*FROM PUBLIC, ghm_runtime/);
  assert.doesNotMatch(founderReviewCloseMigration, /REVOKE ALL ON FUNCTION ghm\.get_business_directory_review_presentation/);
});
