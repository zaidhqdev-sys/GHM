import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type { BusinessCapabilityEvidence, BusinessCapabilityEvidenceRepository, CreateBusinessCapabilityEvidenceInput } from './contracts';
import { BusinessCapabilityEvidenceServiceImpl } from './service';

const row: BusinessCapabilityEvidence = {
  id:1,businessCapabilityId:2,businessId:3,businessName:'Business',capabilityName:'Electrical',
  evidenceType:'certification',title:'Certificate',description:null,issuerName:null,referenceNumber:null,
  evidenceUrl:'https://example.test/certificate',issuedOn:null,expiresOn:null,visibility:'private',
  verificationStatus:'pending',submittedBy:10,submittedAt:new Date(),verifiedBy:null,verifiedAt:null,verificationReason:null,
};
class FakeRepository implements BusinessCapabilityEvidenceRepository {
  createContext: AuthContext | null = null;
  createInput: CreateBusinessCapabilityEvidenceInput | null = null;
  reviewCall: unknown = null;
  async create(context:AuthContext,input:CreateBusinessCapabilityEvidenceInput){this.createContext=context;this.createInput=input;return row;}
  async listForBusiness(){return [row];}
  async listForVerification(){return [row];}
  async review(context:AuthContext,id:number,decision:any,reason?:string|null){this.reviewCall={context,id,decision,reason};return {...row,verificationStatus:decision};}
}
const business:AuthContext={userId:10,role:'business'};
const admin:AuthContext={userId:99,role:'admin'};
const input:CreateBusinessCapabilityEvidenceInput={businessCapabilityId:2,evidenceType:'certification',title:'Certificate',evidenceUrl:'https://example.test/certificate'};

test('Business evidence creation preserves authenticated account context',async()=>{
 const repository=new FakeRepository();const service=new BusinessCapabilityEvidenceServiceImpl(repository);
 await service.create(business,input);
 assert.equal(repository.createContext,business);assert.equal(repository.createInput,input);
});
test('evidence creation rejects customer role and invalid metadata',async()=>{
 const repository=new FakeRepository();const service=new BusinessCapabilityEvidenceServiceImpl(repository);
 await assert.rejects(()=>service.create({userId:10,role:'customer'},input),/Business account required/);
 await assert.rejects(()=>service.create(business,{...input,evidenceType:'other_bad' as never}),/Evidence type is invalid/);
 await assert.rejects(()=>service.create(business,{...input,evidenceUrl:'http://example.test'}),/bounded HTTPS URL/);
 await assert.rejects(()=>service.create(business,{...input,expiresOn:'2026-01-01',issuedOn:'2026-02-01'}),/later than issue date/);
 assert.equal(repository.createInput,null);
});
test('only admins can list the verification queue or moderate evidence',async()=>{
 const repository=new FakeRepository();const service=new BusinessCapabilityEvidenceServiceImpl(repository);
 await assert.rejects(()=>service.listForVerification(business),/verifier authority required/);
 await assert.rejects(()=>service.review(business,1,'verified'),/verifier authority required/);
 assert.equal(repository.reviewCall,null);
});
test('moderation validates decision, identifiers and required reasons',async()=>{
 const repository=new FakeRepository();const service=new BusinessCapabilityEvidenceServiceImpl(repository);
 await assert.rejects(()=>service.review(admin,0,'verified'),/positive integer/);
 await assert.rejects(()=>service.review(admin,1,'invalid' as never),/decision is invalid/);
 await assert.rejects(()=>service.review(admin,1,'rejected'),/bounded reason is required/);
 await service.review(admin,1,'rejected','Insufficient evidence');
 assert.deepEqual(repository.reviewCall,{context:admin,id:1,decision:'rejected',reason:'Insufficient evidence'});
});
