import type {Pool,PoolClient} from 'pg';
import {createActorGatewayAssertion} from './request-assertion';
export interface GatewayBusinessRegistrationIdentity{businessId:number;registrationStatus:'registered'|'unregistered'|null;registrationNumber:string|null;legalName:string|null;updatedAt:Date|null}
export interface GatewayBusinessRegistrationIdentityUpdate{businessId:number;registrationStatus:'registered'|'unregistered'|null;registrationNumber:string|null;legalName:string|null}
export interface BusinessRegistrationIdentityReader{readRegistrationIdentity(accountId:number,businessId:number):Promise<GatewayBusinessRegistrationIdentity>;updateRegistrationIdentity(accountId:number,input:GatewayBusinessRegistrationIdentityUpdate):Promise<GatewayBusinessRegistrationIdentity>}
type ConnectablePool=Pick<Pool,'connect'>;
export class PostgresBusinessRegistrationIdentityReader implements BusinessRegistrationIdentityReader{
 private readonly key:Buffer;
 constructor(private readonly pool:ConnectablePool,secret:string){const k=Buffer.from(secret,'base64');if(k.length!==32||k.toString('base64')!==secret)throw new Error('GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET must be canonical base64 for exactly 32 bytes');this.key=k}
 async readRegistrationIdentity(accountId:number,businessId:number):Promise<GatewayBusinessRegistrationIdentity>{return this.run(accountId,'business.registration.read',{businessId},[accountId,businessId])}
 async updateRegistrationIdentity(accountId:number,input:GatewayBusinessRegistrationIdentityUpdate):Promise<GatewayBusinessRegistrationIdentity>{return this.run(accountId,'business.registration.update',{businessId:input.businessId,registrationStatus:input.registrationStatus,registrationNumber:input.registrationNumber,legalName:input.legalName},[accountId,input.businessId,input.registrationStatus,input.registrationNumber,input.legalName])}
 private async run(accountId:number,op:'business.registration.read'|'business.registration.update',context:Record<string,unknown>,args:unknown[]):Promise<GatewayBusinessRegistrationIdentity>{const c:PoolClient=await this.pool.connect();try{await c.query('BEGIN');const a=createActorGatewayAssertion(this.key,accountId,op,context);
 const sql=op==='business.registration.read'?'SELECT * FROM ghm.gateway_read_business_registration_identity($1,$2,$3,$4,$5,$6)':'SELECT * FROM ghm.gateway_update_business_registration_identity($1,$2,$3,$4,$5,$6,$7,$8,$9)';
 const r=await c.query<{business_id:string|number;registration_status:'registered'|'unregistered'|null;registration_number:string|null;legal_name:string|null;updated_at:Date|null}>(sql,[accountId,a.issuedAt,a.nonce,a.context,a.signature,...args.slice(1)]);if(r.rowCount!==1)throw Object.assign(new Error('Business registration identity is unavailable'),{code:'42501'});const x=r.rows[0];await c.query('COMMIT');return{businessId:Number(x.business_id),registrationStatus:x.registration_status,registrationNumber:x.registration_number,legalName:x.legal_name,updatedAt:x.updated_at}
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}}
}
