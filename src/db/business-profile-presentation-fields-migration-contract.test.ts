import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration=fs.readFileSync(path.resolve(process.cwd(),'database/migrations/20261105190000_extend_business_directory_location_contact.sql'),'utf8');
const forwardMigration=fs.readFileSync(path.resolve(process.cwd(),'database/migrations/20261109100000_persist_business_profile_presentation_fields.sql'),'utf8');
const repository=fs.readFileSync(path.resolve(process.cwd(),'src/resources/business-identity/repository.ts'),'utf8');
const contracts=fs.readFileSync(path.resolve(process.cwd(),'src/resources/business-identity/contracts.ts'),'utf8');

test('owner-editable avatar and business tenure fields are stored in canonical GHM Business',()=>{
 for(const field of ['avatar_letter','avatar_color','years_in_business']) {
  assert.ok(migration.includes(`ADD COLUMN ${field}`));
  assert.ok(migration.includes(field));
  assert.ok(repository.includes(field));
 }
 assert.ok(contracts.includes('avatarLetter'));
 assert.ok(contracts.includes('avatarColor'));
 assert.ok(contracts.includes('yearsInBusiness'));
 for(const field of ['avatar_letter','avatar_color','years_in_business']) {
  assert.match(forwardMigration,new RegExp(`${field}\\s*=\\s*CASE WHEN p_patch \\? '${field}'`));
 }
});

test('avatar and tenure updates are explicitly allowlisted and bounded',()=>{
 assert.ok(migration.includes("'avatar_letter', 'avatar_color', 'years_in_business'"));
 assert.ok(migration.includes('Avatar letter must be 3 characters or fewer'));
 assert.ok(migration.includes('Avatar color must be 32 characters or fewer'));
 assert.ok(migration.includes('Years in business must be between 0 and 100'));
 assert.ok(repository.includes("'avatarLetter', 'avatarColor', 'yearsInBusiness'"));
});

test('business tenure remains self-declared and is not a verified trust signal',()=>{
 assert.ok(migration.includes('Owner-declared years in business; not independently verified.'));
 assert.ok(repository.includes('yearsInBusiness: row.years_in_business'));
 assert.doesNotMatch(repository,/yearsInBusiness:[^\n]*insuranceVerified/);
});
