import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const pendingMigrations = [
  '20261105190000_extend_business_directory_location_contact.sql',
  '20261105213000_create_business_capability_evidence.sql',
  '20261105220000_replace_business_capability_assertions.sql',
  '20261105230000_create_founder_directory_review.sql',
  '20261106090000_business_logo_storage_binding.sql',
  '20261106200000_link_project_to_opportunity.sql',
  '20261107211500_reconcile_business_profile_and_founder_authority.sql',
  '20261108150000_reconcile_business_registration_identity_authorization.sql',
  '20261109100000_persist_business_profile_presentation_fields.sql',
  '20261109110000_reconcile_capability_evidence_pending_state.sql',
];

test('pending migrations leave transaction boundaries to the migration runner', () => {
  for (const filename of pendingMigrations) {
    const sql = fs.readFileSync(path.resolve(process.cwd(), 'database/migrations', filename), 'utf8');
    assert.doesNotMatch(sql, /^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im, filename);
  }
  const runner = fs.readFileSync(path.resolve(process.cwd(), 'src/db/migrate.ts'), 'utf8');
  assert.match(runner, /await client\.query\('BEGIN'\)/);
  assert.match(runner, /await client\.query\('COMMIT'\)/);
  assert.match(runner, /await client\.query\('ROLLBACK'\)/);
});
