import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const schema = fs.readFileSync(path.resolve(process.cwd(), 'database/migrations/20261101090000_add_business_directory_profile_fields.sql'), 'utf8');
const profile = fs.readFileSync(path.resolve(process.cwd(), 'database/migrations/20261101100000_extend_business_profile_directory_fields.sql'), 'utf8');
const normalizedSchema = schema.replace(/\\s+/g, ' ');
const normalizedProfile = profile.replace(/\\s+/g, ' ');

test('directory profile schema constrains fields and leaves protected columns runtime-read-only', () => {
  for (const column of ['province', 'city', 'physical_address', 'whatsapp', 'website', 'logo_url', 'avatar_letter', 'avatar_color', 'is_supplier', 'tier', 'is_featured', 'profile_views', 'years_in_business']) {
    assert.match(schema, new RegExp('ADD COLUMN ' + column + '\\b'));
  }
  assert.match(schema, /business_directory_years_in_business_check/);
  assert.match(schema, /business_directory_profile_views_check/);
  assert.match(schema, /REVOKE UPDATE \([\s\S]*?tier, is_featured,[\s\S]*?profile_views, years_in_business\)/);
  assert.doesNotMatch(schema, /GRANT UPDATE ON TABLE ghm\.business TO ghm_runtime/i);
  assert.match(schema, /business_directory_province_city_idx/);
});

test('owner profile function permits descriptive fields only and preserves membership and definer boundary', () => {
  assert.match(profile, /SECURITY DEFINER\s+SET search_path = pg_catalog, ghm/);
  assert.match(profile, /membership_role IN \('owner', 'administrator'\)/);
  assert.match(normalizedProfile, /'province',\s*'city',\s*'physicalAddress',\s*'whatsapp',\s*'website',\s*'isSupplier',\s*'yearsInBusiness'/);
  assert.match(profile, /is_supplier = CASE WHEN p_patch \? 'isSupplier'/);
  assert.match(profile, /years_in_business = CASE WHEN p_patch \? 'yearsInBusiness'/);
  assert.doesNotMatch(profile, /'logoUrl'|'avatarLetter'|'avatarColor'|'tier'|'isFeatured'|'profileViews'|'insuranceVerified'|'jobsCompleted'|'verificationStatus'/);
  assert.match(profile, /REVOKE ALL ON FUNCTION ghm\.update_business_profile/);
  assert.match(profile, /GRANT EXECUTE ON FUNCTION ghm\.update_business_profile\(bigint, bigint, jsonb\) TO ghm_runtime/);
});
