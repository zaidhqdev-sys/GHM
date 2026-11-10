import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration = fs.readFileSync(path.resolve(process.cwd(), 'database/migrations/20261105190000_extend_business_directory_location_contact.sql'), 'utf8');
const forwardMigration = fs.readFileSync(path.resolve(process.cwd(), 'database/migrations/20261109100000_persist_business_profile_presentation_fields.sql'), 'utf8');
const repository = fs.readFileSync(path.resolve(process.cwd(), 'src/resources/business-identity/repository.ts'), 'utf8');
const contracts = fs.readFileSync(path.resolve(process.cwd(), 'src/resources/business-identity/contracts.ts'), 'utf8');
const gatewayCutover = fs.readFileSync(path.resolve(process.cwd(), 'database/migrations/20261110270000_gateway_business_profile_update.sql'), 'utf8');
const legacyCompatibility = fs.readFileSync(path.resolve(process.cwd(), 'database/migrations/20261110265000_reconcile_business_profile_legacy_contract.sql'), 'utf8');

test('owner-editable avatar and business tenure fields are stored in canonical GHM Business', () => {
  for (const field of ['avatar_letter', 'avatar_color', 'years_in_business']) {
    assert.ok(migration.includes('ADD COLUMN IF NOT EXISTS ' + field));
    assert.ok(migration.includes(field));
    assert.ok(repository.includes(field));
  }
  assert.ok(contracts.includes('avatarLetter'));
  assert.ok(contracts.includes('avatarColor'));
  assert.ok(contracts.includes('yearsInBusiness'));
  for (const field of ['avatar_letter', 'avatar_color', 'years_in_business']) {
    assert.ok(forwardMigration.includes(field + " = CASE WHEN p_patch ? '" + field + "'"));
  }
});

test('avatar and tenure updates match canonical Business constraints', () => {
  assert.ok(migration.includes("'avatar_letter', 'avatar_color', 'years_in_business'"));
  assert.ok(migration.includes('Avatar letter must be 3 characters or fewer'));
  assert.ok(migration.includes("avatar_color ~ '^#[0-9A-Fa-f]{6}$'"));
  assert.ok(migration.includes('years_in_business BETWEEN 0 AND 500'));
  assert.ok(migration.includes('province IS NULL OR length(btrim(province)) BETWEEN 1 AND 100'));
  assert.ok(forwardMigration.includes('Province must be 100 characters or fewer'));
  assert.ok(forwardMigration.includes('Avatar color must be a six-digit hexadecimal color'));
  assert.ok(forwardMigration.includes('Years in business must be between 0 and 500'));
  assert.ok(forwardMigration.includes("'avatar_letter', 'avatar_color', 'years_in_business'"));
});

test('business tenure remains self-declared and is not a verified trust signal', () => {
  assert.ok(migration.includes('Owner-declared years in business; not independently verified.'));
  assert.ok(repository.includes('yearsInBusiness: row.years_in_business'));
  assert.doesNotMatch(repository, /yearsInBusiness:[^\n]*insuranceVerified/);
});

test('directory migration reuses pre-existing canonical Business constraints and indexes', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS province text/);
  assert.match(migration, /business_directory_province_check/);
  assert.match(migration, /business_directory_city_check/);
  assert.match(migration, /business_directory_address_check/);
  assert.match(migration, /business_directory_avatar_color_check/);
  assert.match(migration, /business_directory_years_in_business_check/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS business_public_directory_location_idx/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS business_public_directory_geo_idx/);
});

test('Business profile writes are restricted to the isolated actor gateway', () => {
  assert.match(gatewayCutover, /REVOKE ALL ON FUNCTION ghm\.update_business_profile\(bigint, bigint, jsonb\) FROM ghm_runtime/);
  assert.match(gatewayCutover, /GRANT EXECUTE ON FUNCTION ghm\.gateway_update_business_profile\(bigint, bigint, jsonb\) TO ghm_actor_gateway/);
  assert.match(gatewayCutover, /REVOKE ALL ON FUNCTION ghm\.gateway_update_business_profile\(bigint, bigint, jsonb\) FROM ghm_runtime/);
  assert.doesNotMatch(repository, /ghm\.update_business_profile/);
  assert.match(repository, /must be updated through the authenticated actor gateway/);
});

test('Business profile forward reconciliation preserves legacy API fields and snake/camel aliases', () => {
  assert.match(legacyCompatibility, /'category'/);
  assert.match(legacyCompatibility, /'isSupplier'/);
  assert.match(legacyCompatibility, /membership_role IN \\('owner', 'administrator'\\)/);
  assert.match(legacyCompatibility, /Conflicting Business profile aliases/);
  assert.match(legacyCompatibility, /v_patch->v_alias IS DISTINCT FROM v_patch->v_key/);
  assert.match(legacyCompatibility, /physical_address/);
  assert.match(legacyCompatibility, /avatar_letter/);
  assert.match(legacyCompatibility, /years_in_business/);
});
