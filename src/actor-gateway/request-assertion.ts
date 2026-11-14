import { createHmac, randomUUID } from 'node:crypto';
export interface ActorGatewayAssertion { issuedAt:number; nonce:string; context:string; signature:string; }
export const createActorGatewayAssertion=(key:Buffer,accountId:number,operation:string,context:Record<string,unknown>):ActorGatewayAssertion=>{
 if(!Number.isSafeInteger(accountId)||accountId<=0) throw new Error('Actor account ID must be a positive safe integer');
 if(key.length!==32) throw new Error('Actor gateway assertion key must contain exactly 32 bytes');
 const issuedAt=Math.floor(Date.now()/1000),nonce=randomUUID(),contextJson=JSON.stringify(context);
 if(typeof contextJson!=='string') throw new Error('Actor assertion context is not serializable');
 const contextHex=Buffer.from(contextJson,'utf8').toString('hex');
 const payload=`ghm-actor-gateway:v2|${accountId}|${operation}|${issuedAt}|${nonce}|${contextHex}`;
 return {issuedAt,nonce,context:contextJson,signature:createHmac('sha256',key).update(payload,'utf8').digest('hex')};
};
