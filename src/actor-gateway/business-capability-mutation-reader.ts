import type {Pool,PoolClient} from 'pg';
import {createActorGatewayAssertion} from './request-assertion';
import type {ReplaceBusinessCapabilityAssertionInput,BusinessCapabilityVerificationStatus,BusinessCapability} from '../resources/business-capability/contracts';
import type {EvidenceDecision,BusinessCapabilityEvidence} from '../resources/business-capability-evidence/contracts';

type ConnectablePool=Pick<Pool,'connect'>;
type Operation='business.capability.replace'|'business.capability.verify'|'business.capability.evidence.review';
export interface GatewayCapabilityMutationReader {
 replace(actor:number,businessId:number,assertions:readonly ReplaceBusinessCapabilityAssertionInput[]):Promise<unknown[]>;
 verify(actor:number,id:number,expected:BusinessCapabilityVerificationStatus,target:BusinessCapabilityVerificationStatus,reason:string|null):Promise<BusinessCapability>;
 reviewEvidence(actor:number,id:number,decision:EvidenceDecision,reason:string|null):Promise<BusinessCapabilityEvidence>;
}
export class PostgresGatewayCapabilityMutationReader implements GatewayCapabilityMutationReader {
 private readonly key:Buffer;
 constructor(private readonly pool:ConnectablePool,secret:string){const k=Buffer.from(secret,'base64');if(k.length!==32||k.toString('base64')!==secret)throw new Error('GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET must be canonical base64 for exactly 32 bytes');this.key=k}
 private async run<T>(work:(c:PoolClient)=>Promise<T>):Promise<T>{const c=await this.pool.connect();try{await c.query('BEGIN');const v=await work(c);await c.query('COMMIT');return v}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}}
 private assertion(actor:number,op:Operation,context:Record<string,unknown>){return createActorGatewayAssertion(this.key,actor,op,context)}
 async replace(actor:number,businessId:number,assertions:readonly ReplaceBusinessCapabilityAssertionInput[]){const args={businessId,assertions};return this.run(async c=>{const a=this.assertion(actor,'business.capability.replace',args);const r=await c.query('SELECT * FROM ghm.gateway_replace_business_capability_assertions($1,$2,$3,$4,$5,$6,$7::jsonb)',[actor,a.issuedAt,a.nonce,a.context,a.signature,businessId,JSON.stringify(assertions)]);return r.rows})}
 async verify(actor:number,id:number,expected:BusinessCapabilityVerificationStatus,target:BusinessCapabilityVerificationStatus,reason:string|null){const args={businessCapabilityId:id,expectedStatus:expected,targetStatus:target,reason};return this.run(async c=>{const a=this.assertion(actor,'business.capability.verify',args);const r=await c.query('SELECT * FROM ghm.gateway_transition_business_capability_verification($1,$2,$3,$4,$5,$6,$7,$8,$9)',[actor,a.issuedAt,a.nonce,a.context,a.signature,id,expected,target,reason]);if(r.rowCount!==1)throw Object.assign(new Error('Capability verification transition returned no row'),{code:'P0001'});return r.rows[0] as BusinessCapability})}
 async reviewEvidence(actor:number,id:number,decision:EvidenceDecision,reason:string|null){const args={evidenceId:id,decision,reason};return this.run(async c=>{const a=this.assertion(actor,'business.capability.evidence.review',args);const r=await c.query('SELECT * FROM ghm.gateway_transition_business_capability_evidence($1,$2,$3,$4,$5,$6,$7,$8)',[actor,a.issuedAt,a.nonce,a.context,a.signature,id,decision,reason]);if(r.rowCount!==1)throw Object.assign(new Error('Evidence review returned no row'),{code:'P0001'});return r.rows[0] as BusinessCapabilityEvidence})}
}
