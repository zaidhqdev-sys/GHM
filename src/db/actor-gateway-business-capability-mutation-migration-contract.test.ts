import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const migration=readFileSync('database/migrations/20261111070000_add_signed_business_capability_mutations.sql','utf8');
const cutover=readFileSync('database/cutovers/20261111030000_revoke_legacy_business_capability_runtime_mutations.sql','utf8');
test('capability mutation gateway signs and checks exact business assertion payload',()=>{
 assert.match(migration,/business\.capability\.replace/);
 assert.match(migration,/jsonb_build_object\('businessId',p_business,'assertions',p_assertions\)/);
 assert.match(migration,/ghm\.replace_business_capability_assertions\(p_business,p_actor,p_assertions\)/);
});
test('capability verification and evidence review derive verifier from signed actor',()=>{
 assert.match(migration,/business\.capability\.verify/);
 assert.match(migration,/transition_business_capability_verification\(p_capability,p_expected,p_target,p_actor,p_reason\)/);
 assert.match(migration,/business\.capability\.evidence\.review/);
 assert.match(migration,/transition_business_capability_evidence\(p_evidence,p_decision,p_actor,p_reason\)/);
});
test('new gateway functions are executable only by actor gateway',()=>{
 for(const signature of [
 'gateway_replace_business_capability_assertions\(bigint,bigint,uuid,text,text,bigint,jsonb\)',
 'gateway_transition_business_capability_verification\(bigint,bigint,uuid,text,text,bigint,text,text,text\)',
 'gateway_transition_business_capability_evidence\(bigint,bigint,uuid,text,text,bigint,text,text\)',
 ]){
  assert.match(migration,new RegExp('REVOKE ALL ON FUNCTION ghm\\.'+signature+' FROM PUBLIC,ghm_runtime,ghm_migrator'));
  assert.match(migration,new RegExp('GRANT EXECUTE ON FUNCTION ghm\\.'+signature+' TO ghm_actor_gateway'));
 }
});
test('manual cutover removes all legacy runtime mutation RPC execution without changing automatic migration path',()=>{
 assert.match(cutover,/MANUAL CUTOVER ONLY/);
 assert.match(cutover,/REVOKE ALL ON FUNCTION ghm\.replace_business_capability_assertions/);
 assert.match(cutover,/REVOKE ALL ON FUNCTION ghm\.transition_business_capability_verification/);
 assert.match(cutover,/REVOKE ALL ON FUNCTION ghm\.transition_business_capability_evidence/);
 assert.doesNotMatch(cutover,/GRANT EXECUTE/);
});
