import { Express, Request, Response , RequestHandler} from 'express';
import { AuthContext, canAccessResource } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import { isRegisteredOperation } from '../resources/registry';
import type { CreateReviewInput, ModerateReviewInput, ReviewService } from '../resources/review/contracts';

const param = (v: string | string[]) => typeof v === 'string' ? v : null;
const id = (v: string) => /^[1-9]\d*$/.test(v) && Number.isSafeInteger(Number(v)) ? Number(v) : null;
const access = (op: 'create'|'readOwn'|'readPending'|'approve'|'reject', roles: readonly AuthContext['role'][]) =>
  (req: Request,res: Response,next: () => void) => {
    const c=req.authContext as AuthContext|undefined;
    if(!c || !roles.includes(c.role) || !isRegisteredOperation('review',op) || !canAccessResource(c,'review')) { res.status(403).json({error:'forbidden'}); return; }
    next();
  };
const pub=(op:'readPublic') => (_req:Request,res:Response,next:()=>void) => {
  if(!isRegisteredOperation('review',op)){res.status(403).json({error:'forbidden'});return;} next();
};
const createInput=(b:unknown):CreateReviewInput|null=>{
  if(!b||typeof b!=='object'||Array.isArray(b))return null; const x=b as Record<string,unknown>;
  if(Object.keys(x).some(k=>!['businessId','rating','title','body'].includes(k)))return null;
  if(!Number.isSafeInteger(x.businessId)||Number(x.businessId)<=0||!Number.isSafeInteger(x.rating)||Number(x.rating)<1||Number(x.rating)>5||typeof x.title!=='string'||typeof x.body!=='string')return null;
  return {businessId:x.businessId as number,rating:x.rating as number,title:x.title,body:x.body};
};
const moderation=(b:unknown):ModerateReviewInput|null=>{
  if(!b||typeof b!=='object'||Array.isArray(b))return null; const x=b as Record<string,unknown>;
  if(Object.keys(x).some(k=>!['decision','rejectionReason'].includes(k))||(x.decision!=='approved'&&x.decision!=='rejected'))return null;
  if(Object.hasOwn(x,'rejectionReason')&&x.rejectionReason!==null&&typeof x.rejectionReason!=='string')return null;
  return {decision:x.decision as ModerateReviewInput['decision'],...(Object.hasOwn(x,'rejectionReason')?{rejectionReason:x.rejectionReason as string|null}:{})};
};
const limit=(v:unknown):number|null=>{
  if(v===undefined)return 20;if(typeof v!=='string'||!/^[1-9]\d*$/.test(v))return null;const n=Number(v);return Number.isSafeInteger(n)&&n<=100?n:null;
};
const error=(e:unknown,res:Response)=>{
  if(e instanceof Error){
    if(e.message==='Review not found'){res.status(404).json({error:'not_found'});return;}
    if(e.message==='Insufficient role'||e.message==='Business access required'||e.message==='Customer access required'){res.status(403).json({error:'forbidden'});return;}
    if(e.message.includes('Invalid Review')||e.message.includes('Invalid reviewId')||e.message.includes('Invalid businessId')||e.message.includes(' must be between ')||e.message.includes(' is required')){res.status(400).json({error:'invalid_request'});return;}
  }
  console.error(JSON.stringify({event:'http_request_failed',error:{name:e instanceof Error?e.name:'UnknownError'}}));res.status(500).json({error:'internal_error'});
};
export const registerReviewRoutes=(app:Express,service:ReviewService,authMiddleware:RequestHandler=requireAuth)=>{
  app.get('/api/v1/public/reviews',pub('readPublic'),async(req,res)=>{
    try{const businessId=typeof req.query.businessId==='string'?id(req.query.businessId):null;const n=limit(req.query.limit);if(businessId===null||n===null){res.status(400).json({error:'invalid_request'});return;}res.status(200).json({reviews:await service.getPublicReviews(businessId,n)});}
    catch(e){error(e,res);}
  });
  app.get('/api/v1/reviews',authMiddleware,access('readPending',['admin']),async(req,res)=>{
    try{const n=limit(req.query.limit);if(n===null){res.status(400).json({error:'invalid_request'});return;}res.status(200).json({reviews:await service.getPendingReviews(req.authContext as AuthContext,n)});}
    catch(e){error(e,res);}
  });
  app.post('/api/v1/reviews',authMiddleware,access('create',['customer']),async(req,res)=>{
    try{const input=createInput(req.body);if(!input){res.status(400).json({error:'invalid_request'});return;}res.status(201).json({review:await service.createReview(req.authContext as AuthContext,input)});}
    catch(e){error(e,res);}
  });
  app.get('/api/v1/reviews/:reviewId',authMiddleware,access('readOwn',['customer']),async(req,res)=>{
    try{const v=param(req.params.reviewId);const reviewId=v===null?null:id(v);if(reviewId===null){res.status(400).json({error:'invalid_request'});return;}const review=await service.getOwnReview(req.authContext as AuthContext,reviewId);if(!review){res.status(404).json({error:'not_found'});return;}res.status(200).json({review});}
    catch(e){error(e,res);}
  });
  app.patch('/api/v1/reviews/:reviewId/moderation',authMiddleware,access('approve',['admin']),async(req,res)=>{
    try{const v=param(req.params.reviewId);const reviewId=v===null?null:id(v);const input=moderation(req.body);if(reviewId===null||!input){res.status(400).json({error:'invalid_request'});return;}const op=input.decision==='approved'?'approve':'reject';if(!isRegisteredOperation('review',op)){res.status(403).json({error:'forbidden'});return;}res.status(200).json({review:await service.moderateReview(req.authContext as AuthContext,reviewId,input)});}
    catch(e){error(e,res);}
  });
};
