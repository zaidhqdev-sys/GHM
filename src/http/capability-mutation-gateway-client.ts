import {assertActorGatewayBaseUrl} from './actor-gateway-url';
import type {ReplaceBusinessCapabilityAssertionInput,BusinessCapabilityVerificationStatus} from '../resources/business-capability/contracts';
import type {EvidenceDecision} from '../resources/business-capability-evidence/contracts';
export class CapabilityMutationGatewayError extends Error{constructor(readonly status:number){super('Actor gateway request failed');this.name='CapabilityMutationGatewayError'}}
export class HttpCapabilityMutationGatewayClient{
 constructor(private readonly baseUrl:string,private readonly timeoutMs=5000,private readonly fetchImpl:typeof fetch=fetch){assertActorGatewayBaseUrl(baseUrl)}
 private async request<T>(token:string,path:string,method:'PUT'|'POST'|'PATCH',body:unknown):Promise<T>{
  if(!token.trim())throw new Error('Actor gateway bearer token is required');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),this.timeoutMs);
  try{const response=await this.fetchImpl(`${this.baseUrl.replace(/\/$/,'')}${path}`,{method,redirect:'error',headers:{authorization:`Bearer ${token}`,accept:'application/json','content-type':'application/json'},body:JSON.stringify(body),signal:controller.signal});if(!response.ok)throw new CapabilityMutationGatewayError(response.status);const payload:unknown=await response.json();if(!payload||typeof payload!=='object')throw new Error('Actor gateway response is invalid');return payload as T;}finally{clearTimeout(timeout)}
 }
 replace(token:string,businessId:number,assertions:readonly ReplaceBusinessCapabilityAssertionInput[]){return this.request<{capabilities:unknown[]}>(token,`/v1/businesses/${businessId}/capabilities`,'PUT',{assertions})}
 verify(token:string,id:number,expectedStatus:BusinessCapabilityVerificationStatus,targetStatus:BusinessCapabilityVerificationStatus,reason:string|null){return this.request<{capability:unknown}>(token,`/v1/business-capabilities/${id}/verification`,'POST',{expectedStatus,targetStatus,reason})}
 reviewEvidence(token:string,id:number,decision:EvidenceDecision,reason:string|null){return this.request<{evidence:unknown}>(token,`/v1/business-capability-evidence/${id}/review`,'PATCH',{decision,reason})}
}
