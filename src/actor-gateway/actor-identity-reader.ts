import type {Pool,PoolClient} from 'pg';
import {createActorGatewayAssertion} from './request-assertion';
export interface ActorIdentity{accountId:number;role:string;fullName:string|null}
export interface ActorIdentityReader{readOwnIdentity(accountId:number):Promise<ActorIdentity>}
type ConnectablePool=Pick<Pool,'connect'>;
export class PostgresActorIdentityReader implements ActorIdentityReader{
 private readonly key:Buffer;
 constructor(private readonly pool:ConnectablePool,secret:string){const k=Buffer.from(secret,'base64');if(k.length!==32||k.toString('base64')!==secret)throw new Error('GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET must be canonical base64 for exactly 32 bytes');this.key=k}
 async readOwnIdentity(accountId:number):Promise<ActorIdentity>{const c:PoolClient=await this.pool.connect();try{await c.query('BEGIN');const a=createActorGatewayAssertion(this.key,accountId,'actor.identity.read',{});
 const r=await c.query<{account_id:string|number;account_role:string;full_name:string|null}>('SELECT account_id,account_role,full_name FROM ghm.gateway_get_actor_identity($1,$2,$3,$4,$5)',[accountId,a.issuedAt,a.nonce,a.context,a.signature]);
 if(r.rowCount!==1)throw Object.assign(new Error('Actor identity is unavailable'),{code:'42501'});const x=r.rows[0];await c.query('COMMIT');return{accountId:Number(x.account_id),role:x.account_role,fullName:x.full_name}
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}}
}
