import type {Capability,CapabilityDraftInput,CapabilityLifecycle} from '../resources/capability/contracts';
export interface CapabilityGovernanceGatewayClient {
 list(accessToken:string):Promise<Capability[]>;
 createDraft(accessToken:string,input:CapabilityDraftInput):Promise<Capability>;
 updateDraft(accessToken:string,id:string,input:CapabilityDraftInput):Promise<Capability>;
 transition(accessToken:string,id:string,status:CapabilityLifecycle,replacementId?:string|null):Promise<Capability>;
}
export class CapabilityGovernanceGatewayError extends Error {
 constructor(readonly status:number){super('Actor gateway request failed');this.name='CapabilityGovernanceGatewayError';}
}
export class HttpCapabilityGovernanceGatewayClient implements CapabilityGovernanceGatewayClient {
 constructor(private readonly baseUrl:string,private readonly timeoutMs=5000,private readonly fetchImpl:typeof fetch=fetch){
  const u=new URL(baseUrl);if(u.protocol!=='https:' && !['localhost','127.0.0.1'].includes(u.hostname))throw new Error('Actor gateway URL must use HTTPS outside localhost');
 }
 private async request<T>(token:string,path:string,method:'GET'|'POST'|'PATCH',body?:unknown):Promise<T>{
  if(!token.trim())throw new Error('Actor gateway bearer token is required');
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),this.timeoutMs);
  try{
   const response=await this.fetchImpl(`${this.baseUrl.replace(/\/$/,'')}${path}`,{method,headers:{authorization:`Bearer ${token}`,accept:'application/json',...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal});
   if(!response.ok)throw new CapabilityGovernanceGatewayError(response.status);
   const payload:unknown=await response.json();
   if(!payload || typeof payload!=='object')throw new Error('Actor gateway response is invalid');
   const value='capabilities' in payload?(payload as {capabilities:unknown}).capabilities:(payload as {capability?:unknown}).capability;
   if(!Array.isArray(value) && (!value || typeof value!=='object'))throw new Error('Actor gateway response is invalid');
   return value as T;
  }finally{clearTimeout(timeout);}
 }
 list(token:string){return this.request<Capability[]>(token,'/v1/admin/capabilities','GET');}
 createDraft(token:string,input:CapabilityDraftInput){return this.request<Capability>(token,'/v1/admin/capabilities/drafts','POST',input);}
 updateDraft(token:string,id:string,input:CapabilityDraftInput){return this.request<Capability>(token,`/v1/admin/capabilities/${id}/draft`,'PATCH',input);}
 transition(token:string,id:string,status:CapabilityLifecycle,replacementId?:string|null){return this.request<Capability>(token,`/v1/admin/capabilities/${id}/transition`,'POST',{targetStatus:status,replacedByCapabilityId:replacementId??null});}
}
