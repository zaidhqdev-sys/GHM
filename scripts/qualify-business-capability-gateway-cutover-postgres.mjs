import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl=process.env.GHM_RUNTIME_DATABASE_URL, gatewayUrl=process.env.GHM_ACTOR_GATEWAY_DATABASE_URL, migratorUrl=process.env.GHM_MIGRATOR_DATABASE_URL;
const secretText=process.env.GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET;
if(!runtimeUrl||!gatewayUrl||!migratorUrl||new Set([runtimeUrl,gatewayUrl,migratorUrl]).size!==3)throw new Error('Three distinct database principals are required');
if(process.env.GHM_QUALIFICATION_DATABASE_NAME!=='ghm_disposable_test'||process.env.GHM_QUALIFICATION_DATABASE_HOST!=='localhost')throw new Error('This qualification is restricted to disposable localhost PostgreSQL');
const key=Buffer.from(secretText??'','base64');if(key.length!==32||key.toString('base64')!==secretText)throw new Error('A canonical base64 32-byte assertion key is required');
const ssl=process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:false;
const runtime=new Pool({connectionString:runtimeUrl,ssl}),gateway=new Pool({connectionString:gatewayUrl,ssl}),migrator=new Pool({connectionString:migratorUrl,ssl});
const marker='gw-capability-'+randomUUID(),ids={accounts:[],businesses:[],capabilities:[],assertions:[],evidence:[]};
const sign=(actor,operation,context)=>{const issuedAt=Math.floor(Date.now()/1000),nonce=randomUUID(),json=JSON.stringify(context),hex=Buffer.from(json,'utf8').toString('hex'),payload='ghm-actor-gateway:v2|'+actor+'|'+operation+'|'+issuedAt+'|'+nonce+'|'+hex;return{issuedAt,nonce,context:json,signature:createHmac('sha256',key).update(payload,'utf8').digest('hex')}};
const call=async(actor,op,fn,args,context)=>{const a=sign(actor,op,context);return gateway.query('SELECT * FROM ghm.'+fn+'($1,$2,$3,$4,$5'+(args.length?','+args.map((_,i)=>'$'+(i+6)).join(','):'')+')',[actor,a.issuedAt,a.nonce,a.context,a.signature,...args])};
const denied=async(work,label)=>{let caught;try{await work()}catch(e){caught=e}assert.ok(caught,label+' unexpectedly succeeded');console.log(label+': PASS');return caught};
const setup=async(sql,args=[])=>{const c=await migrator.connect();try{await c.query('BEGIN');await c.query('SET LOCAL ROLE ghm_schema_owner');const r=await c.query(sql,args);await c.query('COMMIT');return r}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}};
try{
 const accounts=await setup("INSERT INTO ghm.account_identity(full_name,role) VALUES($1,'business'),($2,'business'),($3,'business'),($4,'admin') RETURNING id,role",[marker+' owner',marker+' member',marker+' outsider',marker+' verifier']);
 const owner=Number(accounts.rows[0].id),member=Number(accounts.rows[1].id),outsider=Number(accounts.rows[2].id),admin=Number(accounts.rows[3].id);ids.accounts.push(owner,member,outsider,admin);
 const b=await setup("INSERT INTO ghm.business(name,slug,verification_status,is_verified,is_active) VALUES($1,$2,'approved',true,true) RETURNING id",[marker,marker]);const business=Number(b.rows[0].id);ids.businesses.push(business);
 await setup("INSERT INTO ghm.business_membership(business_id,account_id,membership_role,membership_status,created_by) VALUES($1,$2,'owner','active',$2),($1,$3,'member','active',$2)",[business,owner,member]);
 const capId=randomUUID();ids.capabilities.push(capId);
 await setup("INSERT INTO ghm.capability(id,name,slug,lifecycle_status,taxonomy_version,source_authority,is_selectable) VALUES($1,$2,$3,'active',1,'gateway qualification',true)",[capId,marker,marker]);
 const bc=await setup("INSERT INTO ghm.business_capability(business_id,capability_id,assertion_status,assertion_basis,verification_status,created_by) VALUES($1,$2,'active','self_declared','unverified',$3) RETURNING id",[business,capId,owner]);const bcId=Number(bc.rows[0].id);ids.assertions.push(bcId);
 const cutover=await readFile(fileURLToPath(new URL('../database/cutovers/20261111030000_revoke_legacy_business_capability_runtime_mutations.sql',import.meta.url)),'utf8');
 await setup(cutover);
 console.log('MANUAL BUSINESS CAPABILITY CUTOVER APPLIED TO DISPOSABLE POSTGRESQL: PASS');
 const deniedReplace=await denied(()=>runtime.query('SELECT * FROM ghm.replace_business_capability_assertions($1,$2,$3::jsonb)',[business,owner,'[]']),'RUNTIME LEGACY ASSERTION REPLACEMENT DENIED');
 assert.equal(deniedReplace.code,'42501');
 const deniedVerify=await denied(()=>runtime.query('SELECT * FROM ghm.transition_business_capability_verification($1,$2,$3,$4,$5)',[bcId,'unverified','pending',admin,null]),'RUNTIME LEGACY CAPABILITY VERIFICATION DENIED');assert.equal(deniedVerify.code,'42501');
 const deniedReview=await denied(()=>runtime.query('SELECT * FROM ghm.transition_business_capability_evidence($1,$2,$3,$4)',[1,'verified',admin,null]),'RUNTIME LEGACY EVIDENCE REVIEW DENIED');assert.equal(deniedReview.code,'42501');
 const deniedInsert=await denied(()=>runtime.query("INSERT INTO ghm.business_capability_evidence(business_capability_id,evidence_type,title,submitted_by) VALUES($1,'other','direct runtime',$2)",[bcId,owner]),'RUNTIME DIRECT EVIDENCE INSERT DENIED');assert.equal(deniedInsert.code,'42501');
 const deniedSeq=await denied(()=>runtime.query("SELECT nextval('ghm.business_capability_evidence_id_seq')"),'RUNTIME EVIDENCE SEQUENCE ACCESS DENIED');assert.equal(deniedSeq.code,'42501');
 console.log('LEGACY RUNTIME MUTATION SURFACE REVOKED: PASS');

 const input={businessCapabilityId:bcId,evidenceType:'certification',title:'Signed gateway evidence',description:null,issuerName:'Qualification',referenceNumber:marker,evidenceUrl:null,issuedOn:null,expiresOn:null,visibility:'private'};
 const context={...input};
 const submitted=await call(owner,'business.capability.evidence.submit','gateway_submit_business_capability_evidence',[bcId,input.evidenceType,input.title,input.description,input.issuerName,input.referenceNumber,input.evidenceUrl,input.issuedOn,input.expiresOn,input.visibility],context);
 assert.equal(submitted.rowCount,1);const evidenceId=Number(submitted.rows[0].id);ids.evidence.push(evidenceId);assert.equal(Number(submitted.rows[0].submitted_by),owner);assert.equal(submitted.rows[0].verification_status,'pending');assert.equal(submitted.rows[0].business_name,marker);
 console.log('SIGNED EVIDENCE SUBMISSION AND ACTOR PROVENANCE: PASS');

 const altered=sign(owner,'business.capability.evidence.submit',context);
 const tamper=await denied(()=>gateway.query('SELECT * FROM ghm.gateway_submit_business_capability_evidence($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::date,$14::date,$15)',[owner,altered.issuedAt,altered.nonce,altered.context,altered.signature,bcId,'certification','Tampered title',null,'Qualification',marker,null,null,null,'private']),'SIGNED EVIDENCE PAYLOAD TAMPERING DENIED');assert.equal(tamper.code,'42501');
 const replayContext={...input,referenceNumber:null};
 const replay=sign(owner,'business.capability.evidence.submit',replayContext);
 const submitArgs=[owner,replay.issuedAt,replay.nonce,replay.context,replay.signature,bcId,input.evidenceType,input.title,null,input.issuerName,null,null,null,null,'private'];
 const replayInserted=await gateway.query('SELECT * FROM ghm.gateway_submit_business_capability_evidence($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::date,$14::date,$15)',submitArgs);ids.evidence.push(Number(replayInserted.rows[0].id));
 const replayError=await denied(()=>gateway.query('SELECT * FROM ghm.gateway_submit_business_capability_evidence($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::date,$14::date,$15)',submitArgs),'SIGNED EVIDENCE ASSERTION REPLAY DENIED');assert.equal(replayError.code,'42501');
 const memberInput={...input,description:null,issuerName:null,referenceNumber:null};const memberSubmit=await denied(()=>call(member,'business.capability.evidence.submit','gateway_submit_business_capability_evidence',[bcId,input.evidenceType,input.title,null,null,null,null,null,null,'private'],memberInput),'NON-MANAGEMENT BUSINESS MEMBER CANNOT SUBMIT EVIDENCE');assert.match(memberSubmit.message,/Business management permission required/);
 const outsiderSubmit=await denied(()=>call(outsider,'business.capability.evidence.submit','gateway_submit_business_capability_evidence',[bcId,input.evidenceType,input.title,null,null,null,null,null,null,'private'],memberInput),'NON-MEMBER CANNOT SUBMIT EVIDENCE');assert.match(outsiderSubmit.message,/Business management permission required/);

 const replacement=[{capabilityId:capId}];const replaceContext={businessId:business,assertions:replacement};
 const replaced=await call(owner,'business.capability.replace','gateway_replace_business_capability_assertions',[business,JSON.stringify(replacement)],replaceContext);assert.equal(replaced.rowCount,1);
 console.log('SIGNED CAPABILITY ASSERTION REPLACEMENT AFTER CUTOVER: PASS');
 const wrongBusiness=sign(owner,'business.capability.replace',replaceContext);
 const cross=await denied(()=>gateway.query('SELECT * FROM ghm.gateway_replace_business_capability_assertions($1,$2,$3,$4,$5,$6,$7::jsonb)',[owner,wrongBusiness.issuedAt,wrongBusiness.nonce,wrongBusiness.context,wrongBusiness.signature,business+999,'[]']),'SIGNED REPLACEMENT TARGET SUBSTITUTION DENIED');assert.equal(cross.code,'42501');
 const memberReplaceContext={businessId:business,assertions:[]};const memberReplace=await denied(()=>call(member,'business.capability.replace','gateway_replace_business_capability_assertions',[business,'[]'],memberReplaceContext),'NON-MANAGEMENT MEMBER CANNOT REPLACE ASSERTIONS');assert.notEqual(memberReplace.code,'42501','HMAC/actor gate unexpectedly failed before membership authorization');

 const verifyContext={businessCapabilityId:bcId,expectedStatus:'unverified',targetStatus:'pending',reason:null};
 const nonAdmin=await denied(()=>call(owner,'business.capability.verify','gateway_transition_business_capability_verification',[bcId,'unverified','pending',null],verifyContext),'BUSINESS OWNER CANNOT VERIFY CAPABILITY');assert.match(nonAdmin.message,/Verification authority requires admin role/);
 const verified=await call(admin,'business.capability.verify','gateway_transition_business_capability_verification',[bcId,'unverified','pending',null],verifyContext);assert.equal(verified.rowCount,1);assert.equal(verified.rows[0].verification_status,'pending');
 console.log('SIGNED ADMIN CAPABILITY VERIFICATION AFTER CUTOVER: PASS');

 const reviewContext={evidenceId,decision:'verified',reason:null};
 const selfReview=await denied(()=>call(owner,'business.capability.evidence.review','gateway_transition_business_capability_evidence',[evidenceId,'verified',null],reviewContext),'BUSINESS OWNER CANNOT REVIEW EVIDENCE');assert.match(selfReview.message,/Capability evidence verifier authority required/);
 const reviewed=await call(admin,'business.capability.evidence.review','gateway_transition_business_capability_evidence',[evidenceId,'verified',null],reviewContext);assert.equal(reviewed.rowCount,1);assert.equal(Number(reviewed.rows[0].verified_by),admin);assert.equal(reviewed.rows[0].verification_status,'verified');assert.equal(Number(reviewed.rows[0].submitted_by),owner);
 console.log('SIGNED ADMIN EVIDENCE REVIEW AND DTO COMPATIBILITY AFTER CUTOVER: PASS');

 const privilege=await runtime.query("SELECT has_function_privilege('ghm_runtime','ghm.gateway_replace_business_capability_assertions(bigint,bigint,uuid,text,text,bigint,jsonb)','EXECUTE') AS can_gateway_replace,has_function_privilege('ghm_actor_gateway','ghm.gateway_replace_business_capability_assertions(bigint,bigint,uuid,text,text,bigint,jsonb)','EXECUTE') AS gateway_can_replace,has_table_privilege('ghm_runtime','ghm.business_capability_evidence','INSERT') AS runtime_can_insert");
 assert.deepEqual(privilege.rows[0],{can_gateway_replace:false,gateway_can_replace:true,runtime_can_insert:false});
 console.log('POST-CUTOVER ROLE PRIVILEGE MATRIX: PASS');
 console.log('GHM BUSINESS CAPABILITY SIGNED GATEWAY CUTOVER QUALIFICATION: PASS');
}finally{
 try{await setup('DELETE FROM ghm.business_capability_evidence WHERE id=ANY($1::bigint[])',[ids.evidence]);await setup('DELETE FROM ghm.business_capability WHERE id=ANY($1::bigint[])',[ids.assertions]);await setup('DELETE FROM ghm.business WHERE id=ANY($1::bigint[])',[ids.businesses]);await setup('DELETE FROM ghm.capability WHERE id=ANY($1::uuid[])',[ids.capabilities]);await setup('DELETE FROM ghm.account_identity WHERE id=ANY($1::bigint[])',[ids.accounts]);}catch(e){console.error('Qualification fixture cleanup failed:',e.message)}
 await Promise.all([runtime.end(),gateway.end(),migrator.end()]);
}
