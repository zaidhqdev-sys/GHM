import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from './app';
import { AuthContext } from '../auth/authorization';
import { config } from '../config';
import type { Review, ReviewService } from '../resources/review/contracts';

const start=async(reviewService:ReviewService)=>{
  const server=http.createServer(createApp({reviewService}));
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const a=server.address(); assert.ok(a&&typeof a!=='string');
  return {server,baseUrl:`http://127.0.0.1:${a.port}`};
};
const token=(c:AuthContext)=>jwt.sign({userId:c.userId,role:c.role},config.jwtSecret);
const review=(businessId=20):Review=>({
  id:1,businessId,reviewerId:42,reviewerName:'Customer',rating:5,title:'Great',body:'Excellent service and delivery.',
  moderationStatus:'pending',moderationReason:null,moderatedBy:null,moderatedAt:null,
  createdAt:new Date('2026-09-18T00:00:00.000Z'),updatedAt:new Date('2026-09-18T00:00:00.000Z')
});
const close=(server:http.Server)=>new Promise<void>(r=>server.close(()=>r()));

test('public review list requires no authentication and binds business id',async()=>{
 let received:{businessId:number;limit?:number}|undefined;
 const service={getPublicReviews:async(b:number,l?:number)=>{received={businessId:b,limit:l};return[review(b)]}} as unknown as ReviewService;
 const {server,baseUrl}=await start(service);try{
  const res=await fetch(`${baseUrl}/api/v1/public/reviews?businessId=20&limit=10`);
  assert.equal(res.status,200);assert.deepEqual(received,{businessId:20,limit:10});
  assert.equal((await res.json() as {reviews:Review[]}).reviews.length,1);
 }finally{await close(server);}
});
test('public review list rejects invalid business id before service execution',async()=>{
 let called=false;const service={getPublicReviews:async()=>{called=true;return[]}} as unknown as ReviewService;
 const {server,baseUrl}=await start(service);try{const r=await fetch(`${baseUrl}/api/v1/public/reviews?businessId=0`);assert.equal(r.status,400);assert.equal(called,false);}finally{await close(server);}
});
test('customer review creation requires authentication and binds context',async()=>{
 let received:{context:AuthContext;input:unknown}|undefined;
 const service={createReview:async(c:AuthContext,input:unknown)=>{received={context:c,input};return review()}} as unknown as ReviewService;
 const {server,baseUrl}=await start(service);try{
  const r=await fetch(`${baseUrl}/api/v1/reviews`,{method:'POST',headers:{authorization:`Bearer ${token({userId:42,role:'customer'})}`,'content-type':'application/json'},body:JSON.stringify({businessId:20,rating:5,title:'Great',body:'Excellent service and delivery.'})});
  assert.equal(r.status,201);assert.deepEqual(received,{context:{userId:42,role:'customer'},input:{businessId:20,rating:5,title:'Great',body:'Excellent service and delivery.'}});
 }finally{await close(server);}
});
test('customer review creation rejects server-owned fields',async()=>{
 let called=false;const service={createReview:async()=>{called=true;return review()}} as unknown as ReviewService;
 const {server,baseUrl}=await start(service);try{
  const r=await fetch(`${baseUrl}/api/v1/reviews`,{method:'POST',headers:{authorization:`Bearer ${token({userId:42,role:'customer'})}`,'content-type':'application/json'},body:JSON.stringify({businessId:20,rating:5,title:'Great',body:'Excellent service and delivery.',moderationStatus:'approved'})});
  assert.equal(r.status,400);assert.equal(called,false);
 }finally{await close(server);}
});
test('review own read is customer scoped',async()=>{
 let received:AuthContext|undefined;const service={getOwnReview:async(c:AuthContext)=>{received=c;return review()}} as unknown as ReviewService;
 const {server,baseUrl}=await start(service);try{
  const r=await fetch(`${baseUrl}/api/v1/reviews/1`,{headers:{authorization:`Bearer ${token({userId:42,role:'customer'})}`}});
  assert.equal(r.status,200);assert.deepEqual(received,{userId:42,role:'customer'});
 }finally{await close(server);}
});
test('review own read rejects unauthenticated requests',async()=>{
 const service={getOwnReview:async()=>{throw new Error('must not be called')}} as unknown as ReviewService;
 const {server,baseUrl}=await start(service);try{const r=await fetch(`${baseUrl}/api/v1/reviews/1`);assert.equal(r.status,401);}finally{await close(server);}
});
test('pending review list is admin only',async()=>{
 let received:AuthContext|undefined;const service={getPendingReviews:async(c:AuthContext)=>{received=c;return[review()]}} as unknown as ReviewService;
 const {server,baseUrl}=await start(service);try{
  const r=await fetch(`${baseUrl}/api/v1/reviews?limit=5`,{headers:{authorization:`Bearer ${token({userId:7,role:'admin'})}`}});
  assert.equal(r.status,200);assert.deepEqual(received,{userId:7,role:'admin'});
 }finally{await close(server);}
});
test('business role cannot read pending reviews',async()=>{
 let called=false;const service={getPendingReviews:async()=>{called=true;return[]}} as unknown as ReviewService;
 const {server,baseUrl}=await start(service);try{const r=await fetch(`${baseUrl}/api/v1/reviews`,{headers:{authorization:`Bearer ${token({userId:7,role:'business'})}`}});assert.equal(r.status,403);assert.equal(called,false);}finally{await close(server);}
});
test('moderation approves or rejects only through canonical moderation input',async()=>{
 let received:unknown;const service={moderateReview:async(_c:AuthContext,id:number,input:unknown)=>{received={id,input};return review()}} as unknown as ReviewService;
 const {server,baseUrl}=await start(service);try{
  const r=await fetch(`${baseUrl}/api/v1/reviews/1/moderation`,{method:'PATCH',headers:{authorization:`Bearer ${token({userId:7,role:'admin'})}`,'content-type':'application/json'},body:JSON.stringify({decision:'rejected',rejectionReason:'Insufficient evidence'})});
  assert.equal(r.status,200);assert.deepEqual(received,{id:1,input:{decision:'rejected',rejectionReason:'Insufficient evidence'}});
 }finally{await close(server);}
});
test('moderation rejects arbitrary fields',async()=>{
 let called=false;const service={moderateReview:async()=>{called=true;return review()}} as unknown as ReviewService;
 const {server,baseUrl}=await start(service);try{
  const r=await fetch(`${baseUrl}/api/v1/reviews/1/moderation`,{method:'PATCH',headers:{authorization:`Bearer ${token({userId:7,role:'admin'})}`,'content-type':'application/json'},body:JSON.stringify({decision:'approved',moderationStatus:'approved'})});
  assert.equal(r.status,400);assert.equal(called,false);
 }finally{await close(server);}
});
test('review routes map service not found to 404',async()=>{
 const service={getOwnReview:async()=>null} as unknown as ReviewService;
 const {server,baseUrl}=await start(service);try{const r=await fetch(`${baseUrl}/api/v1/reviews/1`,{headers:{authorization:`Bearer ${token({userId:42,role:'customer'})}`}});assert.equal(r.status,404);}finally{await close(server);}
});
