import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor } from './test-resource-auth';
import type { AuthContext } from '../auth/authorization';
import type { DirectoryReviewService } from '../resources/directory-review/contracts';

const start = async (service: DirectoryReviewService) => {
  const server = http.createServer(createApp({resourceAuthMiddleware:httpTestAuth,directoryReviewService:service}));
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  const address=server.address(); assert.ok(address && typeof address !== 'string');
  return {server,baseUrl:`http://127.0.0.1:${address.port}`};
};
const close=(server:http.Server)=>new Promise<void>(resolve=>server.close(()=>resolve()));
const review={business_id:55,verification_status:'under_review',is_verified:false,directory_review_submitted_at:null,directory_review_last_reason:null,directory_review_last_event_type:'submitted'};

test('Founder directory review queue requires authentication',async()=>{
 const service={list:async()=>[]} as unknown as DirectoryReviewService;
 const {server,baseUrl}=await start(service);
 try { const response=await fetch(`${baseUrl}/api/v1/admin/directory-reviews`); assert.equal(response.status,401); }
 finally { await close(server); }
});

test('Founder queue binds authenticated account and validated pagination',async()=>{
 let received:unknown;
 const service={list:async(context:AuthContext,options:unknown)=>{received={context,options};return[];}} as unknown as DirectoryReviewService;
 const {server,baseUrl}=await start(service);
 try {
  const response=await fetch(`${baseUrl}/api/v1/admin/directory-reviews?status=all&limit=10&offset=20`,{headers:{authorization:`Bearer ${tokenFor({userId:9,role:'customer'})}`}});
  assert.equal(response.status,200);
  assert.deepEqual(received,{context:{userId:9,role:'customer'},options:{status:null,limit:10,offset:20}});
 } finally { await close(server); }
});

test('Founder queue rejects malformed filters before service execution',async()=>{
 let called=false; const service={list:async()=>{called=true;return[];}} as unknown as DirectoryReviewService;
 const {server,baseUrl}=await start(service);
 try {
  const response=await fetch(`${baseUrl}/api/v1/admin/directory-reviews?status=anything`,{headers:{authorization:`Bearer ${tokenFor({userId:9,role:'admin'})}`}});
  assert.equal(response.status,400); assert.equal(called,false);
 } finally { await close(server); }
});

test('Founder decision binds actor, Business ID, decision and reason',async()=>{
 let received:unknown;
 const service={review:async(context:AuthContext,id:number,decision:string,reason:string)=>{received={context,id,decision,reason};return review;}} as unknown as DirectoryReviewService;
 const {server,baseUrl}=await start(service);
 try {
  const response=await fetch(`${baseUrl}/api/v1/admin/directory-reviews/55`,{method:'PATCH',headers:{authorization:`Bearer ${tokenFor({userId:7,role:'admin'})}`,'content-type':'application/json'},body:JSON.stringify({decision:'request_information',reason:'Add proof'})});
  assert.equal(response.status,200);
  assert.deepEqual(received,{context:{userId:7,role:'admin'},id:55,decision:'request_information',reason:'Add proof'});
 } finally { await close(server); }
});

test('owner submission rejects client-supplied fields and binds authenticated account',async()=>{
 let received:unknown;
 const service={submit:async(context:AuthContext,id:number)=>{received={context,id};return review;}} as unknown as DirectoryReviewService;
 const {server,baseUrl}=await start(service);
 try {
  const response=await fetch(`${baseUrl}/api/v1/businesses/55/directory-review`,{method:'POST',headers:{authorization:`Bearer ${tokenFor({userId:42,role:'business'})}`,'content-type':'application/json'},body:JSON.stringify({verificationStatus:'approved'})});
  assert.equal(response.status,400); assert.equal(received,undefined);
  const accepted=await fetch(`${baseUrl}/api/v1/businesses/55/directory-review`,{method:'POST',headers:{authorization:`Bearer ${tokenFor({userId:42,role:'business'})}`,'content-type':'application/json'},body:'{}'});
  assert.equal(accepted.status,200);
  assert.deepEqual(received,{context:{userId:42,role:'business'},id:55});
 } finally { await close(server); }
});

test('Founder authority endpoint reports disabled without invoking the database service',async()=>{
 let called=false;
 const service={isFounderReviewer:async()=>{called=true;throw new Error('revoked database function must not be called');}} as unknown as DirectoryReviewService;
 const {server,baseUrl}=await start(service);
 try {
  const response=await fetch(`${baseUrl}/api/v1/admin/directory-reviews/authority`,{headers:{authorization:`Bearer ${tokenFor({userId:7,role:'admin'})}`}});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{isFounderReviewer:false});
  assert.equal(called,false);
 } finally { await close(server); }
});
