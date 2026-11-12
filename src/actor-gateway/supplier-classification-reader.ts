import type {Pool,PoolClient} from 'pg';
import {createActorGatewayAssertion} from './request-assertion';
export interface GatewaySupplierClassification{businessId:number;isSupplier:boolean}
export interface SupplierClassificationReader{updateSupplierClassification(accountId:number,businessId:number,isSupplier:boolean):Promise<GatewaySupplierClassification>}
type ConnectablePool=Pick<Pool,'connect'>;
export class PostgresSupplierClassificationReader implements SupplierClassificationReader{
 private readonly key:Buffer;
 constructor(private readonly pool:ConnectablePool,secret:string){const k=Buffer.from(secret,'base64');if(k.length!==32||k.toString('base64')!==secret)throw new Error('GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET must be canonical base64 for exactly 32 bytes');this.key=k}
 async updateSupplierClassification(accountId:number,businessId:number,isSupplier:boolean):Promise<GatewaySupplierClassification>{const c:PoolClient=await this.pool.connect();try{await c.query('BEGIN');const a=createActorGatewayAssertion(this.key,accountId,'supplier.classification.update',{businessId,isSupplier});
 const r=await c.query<{business_id:string|number;is_supplier:boolean}>('SELECT * FROM ghm.gateway_update_business_supplier_classification($1,$2,$3,$4,$5,$6,$7)',[accountId,a.issuedAt,a.nonce,a.context,a.signature,businessId,isSupplier]);if(r.rowCount!==1)throw Object.assign(new Error('Supplier classification is unavailable'),{code:'42501'});const x=r.rows[0];await c.query('COMMIT');return{businessId:Number(x.business_id),isSupplier:x.is_supplier===true}
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}}
}
