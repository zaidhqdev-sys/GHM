import type {Pool,PoolClient} from 'pg';
import {createActorGatewayAssertion} from './request-assertion';
export interface GatewayBusinessProfileUpdate{businessId:number}
export interface BusinessProfileReader{updateBusinessProfile(accountId:number,businessId:number,patch:Record<string,unknown>):Promise<GatewayBusinessProfileUpdate>}
type ConnectablePool=Pick<Pool,'connect'>;
export class PostgresBusinessProfileReader implements BusinessProfileReader{
 private readonly key:Buffer;
 constructor(private readonly pool:ConnectablePool,secret:string){const k=Buffer.from(secret,'base64');if(k.length!==32||k.toString('base64')!==secret)throw new Error('GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET must be canonical base64 for exactly 32 bytes');this.key=k}
 async updateBusinessProfile(accountId:number,businessId:number,patch:Record<string,unknown>):Promise<GatewayBusinessProfileUpdate>{const c:PoolClient=await this.pool.connect();try{await c.query('BEGIN');const a=createActorGatewayAssertion(this.key,accountId,'business.profile.update',{businessId,patch});
 const r=await c.query<{id:string|number}>('SELECT updated.id FROM ghm.gateway_update_business_profile($1,$2,$3,$4,$5,$6,$7::jsonb) AS updated',[accountId,a.issuedAt,a.nonce,a.context,a.signature,businessId,JSON.stringify(patch)]);if(r.rowCount!==1)throw Object.assign(new Error('Business profile is unavailable'),{code:'42501'});await c.query('COMMIT');return{businessId:Number(r.rows[0].id)}
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}}
}
