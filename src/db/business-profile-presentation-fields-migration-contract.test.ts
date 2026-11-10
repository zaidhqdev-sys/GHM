import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const migration=fs.readFileSync(path.resolve(process.cwd(),'database/migrations/20261105190000_extend_business_directory_location_contact.sql'),'utf8');
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

const reconciled=fs.readFileSync(path.resolve(process.cwd(),'database/migrations/20261108140000_reconcile_business_profile_contract.sql'),'utf8');
const gatewayCutover=fs.readFileSync(path.resolve(process.cwd(),'database/migrations/20261110270000_gateway_business_profile_update.sql'),'utf8');

test('forward-only Business profile reconciliation adds only missing coordinates idempotently',()=>{
 assert.match(reconciled,/ADD COLUMN IF NOT EXISTS latitude double precision/);
 assert.match(reconciled,/ADD COLUMN IF NOT EXISTS longitude double precision/);
 assert.match(reconciled,/business_coordinates_pair_check/);
 assert.doesNotMatch(reconciled,/ADD COLUMN IF NOT EXISTS (province|city|physical_address|whatsapp|website|avatar_letter|avatar_color|years_in_business)/);
});

test('profile function accepts both current snake_case and historical camelCase keys',()=>{
 for(const [snake,camel] of [['physical_address','physicalAddress'],['avatar_letter','avatarLetter'],['avatar_color','avatarColor'],['years_in_business','yearsInBusiness']]){
  assert.ok(reconciled.includes(snake),`missing current repository key ${snake}`);
  assert.ok(reconciled.includes(camel),`missing historical API key ${camel}`);
 }
 assert.match(reconciled,/Conflicting Business profile aliases/);
 assert.match(reconciled,/v_patch->v_alias IS DISTINCT FROM v_patch->v_key/);
});

test('profile reconciliation preserves legacy category and supplier fields and authorization',()=>{
 assert.match(reconciled,/'category'/);
 assert.match(reconciled,/'isSupplier'/);
 assert.match(reconciled,/membership_role IN \('owner', 'administrator'\)/);
 assert.match(reconciled,/SECURITY DEFINER/);
 assert.match(reconciled,/SET search_path = pg_catalog, ghm/);
 assert.match(reconciled,/REVOKE ALL ON FUNCTION ghm\.update_business_profile\(bigint, bigint, jsonb\) FROM PUBLIC/);
 assert.match(gatewayCutover,/REVOKE ALL ON FUNCTION ghm\.update_business_profile\(bigint, bigint, jsonb\) FROM ghm_runtime/);
 assert.match(gatewayCutover,/GRANT EXECUTE ON FUNCTION ghm\.gateway_update_business_profile\(bigint, bigint, jsonb\) TO ghm_actor_gateway/);
 assert.match(gatewayCutover,/REVOKE ALL ON FUNCTION ghm\.gateway_update_business_profile\(bigint, bigint, jsonb\) FROM ghm_runtime/);
 assert.doesNotMatch(repository,/ghm\.update_business_profile/);
 assert.match(repository,/must be updated through the authenticated actor gateway/);
});

test('profile reconciliation preserves live DB validation limits rather than tightening data contracts',()=>{
 assert.match(reconciled,/NOT BETWEEN 0 AND 500/);
 assert.match(reconciled,/length\(btrim\(v_patch->>'province'\)\) NOT BETWEEN 1 AND 100/);
 assert.match(reconciled,/avatarColor.*six-digit hex color/s);
 assert.match(reconciled,/Latitude and longitude must be supplied together/);
});
