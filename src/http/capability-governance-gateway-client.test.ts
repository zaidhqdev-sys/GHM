import assert from 'node:assert/strict';
import test from 'node:test';
import {HttpCapabilityGovernanceGatewayClient,CapabilityGovernanceGatewayError} from './capability-governance-gateway-client';

test('capability gateway client forwards the original bearer token and typed route',async()=>{
 let url='',auth='';
 const client=new HttpCapabilityGovernanceGatewayClient('https://gateway.example.test',1000,async(input,init)=>{
      assert.equal(init?.redirect, 'error');
  url=String(input);auth=new Headers(init?.headers).get('authorization')??'';
  return new Response(JSON.stringify({capabilities:[]}),{status:200,headers:{'content-type':'application/json'}});
 });
 assert.deepEqual(await client.list('verified-token'),[]);
 assert.equal(url,'https://gateway.example.test/v1/admin/capabilities');
 assert.equal(auth,'Bearer verified-token');
});

test('capability gateway client fails closed on gateway errors without fallback',async()=>{
 const client=new HttpCapabilityGovernanceGatewayClient('https://gateway.example.test',1000,async()=>new Response(JSON.stringify({error:'service_unavailable'}),{status:503}));
 await assert.rejects(()=>client.list('verified-token'),(e:unknown)=>e instanceof CapabilityGovernanceGatewayError&&e.status===503);
});

test('capability gateway client requires HTTPS outside localhost',()=>{
 assert.throws(()=>new HttpCapabilityGovernanceGatewayClient('http://gateway.example.test'),/HTTPS/);
});
