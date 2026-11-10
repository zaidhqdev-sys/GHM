import type { Pool, PoolClient } from 'pg';

export interface GatewayCapability {
  id:string; parentId:string|null; name:string; slug:string; description:string|null; sortOrder:number;
  lifecycleStatus:'draft'|'active'|'deprecated'|'retired'; taxonomyVersion:number; effectiveFrom:Date|null;
  effectiveTo:Date|null; sourceAuthority:string; sourceReference:string|null; replacedByCapabilityId:string|null;
  isSelectable:boolean; createdAt:Date; updatedAt:Date;
}
export interface GatewayCapabilityDraftInput {
  name:string; slug:string; description?:string|null; parentId?:string|null; sortOrder?:number; sourceReference?:string|null;
}
export interface CapabilityGovernanceReader {
  list(accountId:number):Promise<GatewayCapability[]>;
  createDraft(accountId:number,input:GatewayCapabilityDraftInput):Promise<GatewayCapability>;
  updateDraft(accountId:number,id:string,input:GatewayCapabilityDraftInput):Promise<GatewayCapability>;
  transition(accountId:number,id:string,status:'active'|'deprecated'|'retired',replacementId?:string|null):Promise<GatewayCapability>;
}
type ConnectablePool=Pick<Pool,'connect'>;
const columns=`id,parent_id,name,slug,description,sort_order,lifecycle_status,taxonomy_version,effective_from,effective_to,source_authority,source_reference,replaced_by_capability_id,is_selectable,created_at,updated_at`;
const map=(r:Record<string,unknown>):GatewayCapability=>({
 id:String(r.id),parentId:r.parent_id===null?null:String(r.parent_id),name:String(r.name),slug:String(r.slug),
 description:r.description===null?null:String(r.description),sortOrder:Number(r.sort_order),
 lifecycleStatus:r.lifecycle_status as GatewayCapability['lifecycleStatus'],taxonomyVersion:Number(r.taxonomy_version),
 effectiveFrom:r.effective_from===null?null:new Date(String(r.effective_from)),effectiveTo:r.effective_to===null?null:new Date(String(r.effective_to)),
 sourceAuthority:String(r.source_authority),sourceReference:r.source_reference===null?null:String(r.source_reference),
 replacedByCapabilityId:r.replaced_by_capability_id===null?null:String(r.replaced_by_capability_id),
 isSelectable:Boolean(r.is_selectable),createdAt:new Date(String(r.created_at)),updatedAt:new Date(String(r.updated_at)),
});
export class PostgresCapabilityGovernanceReader implements CapabilityGovernanceReader {
 constructor(private readonly pool:ConnectablePool){}
 private async run<T>(work:(client:PoolClient)=>Promise<T>):Promise<T>{
  const client=await this.pool.connect();
  try{await client.query('BEGIN');const value=await work(client);await client.query('COMMIT');return value;}
  catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{client.release();}
 }
 async list(accountId:number):Promise<GatewayCapability[]>{
  return this.run(async c=>(await c.query(`SELECT * FROM ghm.gateway_list_capabilities($1)`,[accountId])).rows.map(map));
 }
 async createDraft(accountId:number,input:GatewayCapabilityDraftInput):Promise<GatewayCapability>{
  return this.run(async c=>{const r=await c.query(`SELECT * FROM ghm.gateway_create_capability_draft($1,$2,$3,$4,$5,$6,$7,$8)`,
   [accountId,input.name,input.slug,input.description??null,input.parentId??null,input.sortOrder??0,input.sourceReference??null,1]);return map(r.rows[0]);});
 }
 async updateDraft(accountId:number,id:string,input:GatewayCapabilityDraftInput):Promise<GatewayCapability>{
  return this.run(async c=>{const r=await c.query(`SELECT * FROM ghm.gateway_update_capability_draft($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
   [accountId,id,input.name,input.slug,input.description??null,input.parentId??null,input.sortOrder??0,input.sourceReference??null,1]);return map(r.rows[0]);});
 }
 async transition(accountId:number,id:string,status:'active'|'deprecated'|'retired',replacementId:string|null=null):Promise<GatewayCapability>{
  return this.run(async c=>{const r=await c.query(`SELECT * FROM ghm.gateway_transition_capability_lifecycle($1,$2,$3,$4,$5)`,[accountId,id,status,replacementId,1]);return map(r.rows[0]);});
 }
}
