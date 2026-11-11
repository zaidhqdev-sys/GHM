import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor } from './test-resource-auth';
import type { AuthContext } from '../auth/authorization';
import type { BusinessCapabilityEvidence, BusinessCapabilityEvidenceService } from '../resources/business-capability-evidence/contracts';
import { BusinessCapabilityEvidenceServiceImpl } from '../resources/business-capability-evidence/service';

const start = async (service: BusinessCapabilityEvidenceService, capabilityMutationGatewayClient?: unknown, capabilityMutationGatewayRequired = false) => {
  const server = http.createServer(createApp({resourceAuthMiddleware:httpTestAuth,businessCapabilityEvidenceService:service,capabilityMutationGatewayClient:capabilityMutationGatewayClient as never,capabilityMutationGatewayRequired}));
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address(); assert.ok(address && typeof address!=='string');
  return {server,baseUrl:`http://127.0.0.1:${address.port}`};
};
const fixture = (context: AuthContext): BusinessCapabilityEvidence => ({
  id:91,businessCapabilityId:12,businessId:55,businessName:'Test Business',capabilityName:'Electrical installation',
  evidenceType:'certification',title:'Electrical certificate',description:null,issuerName:'Issuer',referenceNumber:'REF-91',
  evidenceUrl:'https://example.test/evidence/91',issuedOn:'2026-01-01',expiresOn:null,visibility:'private',
  verificationStatus:'pending',submittedBy:context.userId,submittedAt:new Date('2026-11-05T00:00:00.000Z'),
  verifiedBy:null,verifiedAt:null,verificationReason:null,
});

test('Business account can submit evidence with authenticated identity derived from token',async()=>{
 let received: {context:AuthContext; input:any}|undefined;
 const service={create:async(context:AuthContext,input:any)=>{received={context,input};return fixture(context);}} as unknown as BusinessCapabilityEvidenceService;
 const {server,baseUrl}=await start(service);
 try {
  const response=await fetch(`${baseUrl}/api/v1/business-capability-evidence`,{method:'POST',headers:{authorization:`Bearer ${tokenFor({userId:42,role:'business'})}`,'content-type':'application/json'},body:JSON.stringify({businessCapabilityId:12,evidenceType:'certification',title:'Electrical certificate',evidenceUrl:'https://example.test/evidence/91'})});
  assert.equal(response.status,201);assert.deepEqual(received?.context,{userId:42,role:'business'});assert.equal(received?.input.businessCapabilityId,12);
 } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('customer cannot submit Capability evidence',async()=>{
 let called=false;
 const service={create:async()=>{called=true;return {} as BusinessCapabilityEvidence;}} as unknown as BusinessCapabilityEvidenceService;
 const {server,baseUrl}=await start(service);
 try {
  const response=await fetch(`${baseUrl}/api/v1/business-capability-evidence`,{method:'POST',headers:{authorization:`Bearer ${tokenFor({userId:42,role:'customer'})}`,'content-type':'application/json'},body:JSON.stringify({businessCapabilityId:12,evidenceType:'certification',title:'Certificate'})});
  assert.equal(response.status,403);assert.equal(called,false);
 } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('evidence submission rejects unbounded or non-HTTPS references in the service validation boundary',async()=>{
 let called=false;
 const repository={create:async()=>{called=true;return {} as BusinessCapabilityEvidence;},listForBusiness:async()=>[],listForVerification:async()=>[],review:async()=>({} as BusinessCapabilityEvidence)};
 const service=new BusinessCapabilityEvidenceServiceImpl(repository);
 const {server,baseUrl}=await start(service);
 try {
  const response=await fetch(`${baseUrl}/api/v1/business-capability-evidence`,{method:'POST',headers:{authorization:`Bearer ${tokenFor({userId:42,role:'business'})}`,'content-type':'application/json'},body:JSON.stringify({businessCapabilityId:12,evidenceType:'certification',title:'Certificate',evidenceUrl:'http://unsafe.test/doc'})});
  assert.equal(response.status,400);assert.equal(called,false);
 } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('admin can list pending and verified evidence; identity is derived from admin token',async()=>{
 let received:AuthContext|undefined;
 const service={listForVerification:async(context:AuthContext)=>{received=context;return [fixture(context)];}} as unknown as BusinessCapabilityEvidenceService;
 const {server,baseUrl}=await start(service);
 try {
  const response=await fetch(`${baseUrl}/api/v1/business-capability-evidence?limit=50`,{headers:{authorization:`Bearer ${tokenFor({userId:99,role:'admin'})}`}});
  assert.equal(response.status,200);assert.deepEqual(received,{userId:99,role:'admin'});
  const body=await response.json() as {evidence:BusinessCapabilityEvidence[]};assert.equal(body.evidence[0].id,91);
 } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('admin review accepts verify, reject and revoke decisions only through review service',async()=>{
 let call:any;
 const service={review:async(context:AuthContext,id:number,decision:string,reason?:string)=>{call={context,id,decision,reason};return {...fixture(context),verificationStatus:decision};}} as unknown as BusinessCapabilityEvidenceService;
 const {server,baseUrl}=await start(service);
 try {
  const response=await fetch(`${baseUrl}/api/v1/business-capability-evidence/91/review`,{method:'PATCH',headers:{authorization:`Bearer ${tokenFor({userId:99,role:'admin'})}`,'content-type':'application/json'},body:JSON.stringify({decision:'rejected',reason:'Insufficient evidence'})});
  assert.equal(response.status,200);assert.deepEqual(call,{context:{userId:99,role:'admin'},id:91,decision:'rejected',reason:'Insufficient evidence'});
 } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('business role can list only business-scoped evidence and cannot access moderation',async()=>{
 let pendingListed=false,businessListed=false,reviewed=false;
 const service={listForBusiness:async()=>{businessListed=true;return[];},listForVerification:async()=>{pendingListed=true;return[];},review:async()=>{reviewed=true;return{};}} as unknown as BusinessCapabilityEvidenceService;
 const {server,baseUrl}=await start(service);
 try {
  const headers={authorization:`Bearer ${tokenFor({userId:42,role:'business'})}`};
  const list=await fetch(`${baseUrl}/api/v1/business-capability-evidence?businessId=55`,{headers});
  const review=await fetch(`${baseUrl}/api/v1/business-capability-evidence/91/review`,{method:'PATCH',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({decision:'verified'})});
  assert.equal(list.status,200);assert.equal(review.status,403);assert.equal(businessListed,true);assert.equal(pendingListed,false);assert.equal(reviewed,false);
 } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('evidence submission forwards the verified bearer token to the signed gateway and preserves the DTO response',async()=>{
 const token=tokenFor({userId:42,role:'business'});let received:any;
 const service={create:async()=>{throw new Error('legacy evidence create must not run');}} as unknown as BusinessCapabilityEvidenceService;
 const gateway={submitEvidence:async(t:string,input:unknown)=>{received={token:t,input};return{evidence:fixture({userId:42,role:'business'})};}};
 const {server,baseUrl}=await start(service,gateway,true);
 try{
  const input={businessCapabilityId:12,evidenceType:'certification',title:'Signed certificate',visibility:'private'};
  const response=await fetch(`${baseUrl}/api/v1/business-capability-evidence`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(input)});
  assert.equal(response.status,201);assert.equal(received.token,token);assert.deepEqual(received.input,input);
  const body=await response.json() as {evidence:BusinessCapabilityEvidence};assert.equal(body.evidence.id,91);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('evidence review forwards the verified admin bearer token to the signed gateway',async()=>{
 const token=tokenFor({userId:99,role:'admin'});let received:any;
 const service={review:async()=>{throw new Error('legacy evidence review must not run');}} as unknown as BusinessCapabilityEvidenceService;
 const gateway={reviewEvidence:async(t:string,id:number,decision:string,reason:string|null)=>{received={token:t,id,decision,reason};return{evidence:fixture({userId:42,role:'business'})};}};
 const {server,baseUrl}=await start(service,gateway,true);
 try{
  const response=await fetch(`${baseUrl}/api/v1/business-capability-evidence/91/review`,{method:'PATCH',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({decision:'verified',reason:null})});
  assert.equal(response.status,200);assert.deepEqual(received,{token,id:91,decision:'verified',reason:null});
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('evidence mutation fails closed when gateway is required but unavailable',async()=>{
 let called=false;
 const service={create:async()=>{called=true;return fixture({userId:42,role:'business'});}} as unknown as BusinessCapabilityEvidenceService;
 const {server,baseUrl}=await start(service,undefined,true);
 try{
  const response=await fetch(`${baseUrl}/api/v1/business-capability-evidence`,{method:'POST',headers:{authorization:`Bearer ${tokenFor({userId:42,role:'business'})}`,'content-type':'application/json'},body:JSON.stringify({businessCapabilityId:12,evidenceType:'certification',title:'Certificate'})});
  assert.equal(response.status,503);assert.equal(called,false);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
