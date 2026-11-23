import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import test from 'node:test';
import type { AuthContext } from '../auth/authorization';
import type { CustomerService } from '../resources/customer/contracts';
import type { QuoteService } from '../resources/quote/contracts';
import { registerQuoteFlowBusinessDataRoutes } from './quoteflow-business-data-router';

const start = (customers: CustomerService, quotes: QuoteService) => {
  const app = express();
  app.use(express.json());
  const auth = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.authContext = { userId: 42, role: 'business' } satisfies AuthContext;
    next();
  };
  registerQuoteFlowBusinessDataRoutes(app, customers, quotes, auth);
  const server = http.createServer(app);
  return new Promise<{server:http.Server;baseUrl:string}>(resolve => server.listen(0,'127.0.0.1',() => {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    resolve({server,baseUrl:`http://127.0.0.1:${address.port}`});
  }));
};

const close = (server: http.Server) => new Promise<void>(resolve => server.close(() => resolve()));

test('Business Customer routes pass the path Business ID to the tenant service', async () => {
  const calls: unknown[] = [];
  const customers = {
    listBusinessCustomers: async (context: AuthContext, businessId: number) => {
      calls.push([context.userId,businessId]);
      return [{id:7,businessId,accountId:context.userId,name:'Acme',phone:null,email:null,status:'active'}];
    },
  } as unknown as CustomerService;
  const {server,baseUrl}=await start(customers,{} as QuoteService);
  try {
    const response=await fetch(`${baseUrl}/api/v1/businesses/91/customers`);
    assert.equal(response.status,200);
    assert.deepEqual(calls,[[42,91]]);
    assert.equal((await response.json() as any).customers[0].businessId,91);
  } finally { await close(server); }
});

test('Business Customer creation rejects client-supplied tenant and owner fields', async () => {
  let called=false;
  const customers={createBusinessCustomer:async()=>{called=true;throw new Error('must not be called');}} as unknown as CustomerService;
  const {server,baseUrl}=await start(customers,{} as QuoteService);
  try {
    const response=await fetch(`${baseUrl}/api/v1/businesses/91/customers`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Acme',businessId:92,accountId:999})});
    assert.equal(response.status,400);
    assert.equal(called,false);
  } finally { await close(server); }
});

test('Business Quote creation passes Business scope and accepts only product fields', async () => {
  let received: unknown;
  const quotes={createBusinessQuote:async(context:AuthContext,businessId:number,input:unknown)=>{received=[context.userId,businessId,input];return {id:5,businessId};}} as unknown as QuoteService;
  const {server,baseUrl}=await start({} as CustomerService,quotes);
  try {
    const response=await fetch(`${baseUrl}/api/v1/businesses/91/quotes`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customerId:7,lineItems:[{description:'Work',quantity:1,unitPrice:100}],followUpDate:'2026-11-24'})});
    assert.equal(response.status,201);
    assert.deepEqual(received,[42,91,{customerId:7,lineItems:[{description:'Work',quantity:1,unitPrice:100}],followUpDate:'2026-11-24'}]);
  } finally { await close(server); }
});

test('Business Quote accepts a typed Business Offering reference without client price fields', async () => {
  let received: unknown;
  const offeringId = '123e4567-e89b-42d3-a456-426614174000';
  const quotes = { createBusinessQuote: async (context: AuthContext, businessId: number, input: unknown) => {
    received = [context.userId, businessId, input];
    return { id: 6, businessId };
  } } as unknown as QuoteService;
  const { server, baseUrl } = await start({} as CustomerService, quotes);
  try {
    const response = await fetch(`${baseUrl}/api/v1/businesses/91/quotes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customerId: 7, lineItems: [{ businessOfferingId: offeringId, quantity: 2 }], followUpDate: '2026-11-24' }),
    });
    assert.equal(response.status, 201);
    assert.deepEqual(received, [42, 91, { customerId: 7, lineItems: [{ businessOfferingId: offeringId, quantity: 2 }], followUpDate: '2026-11-24' }]);
  } finally { await close(server); }
});

test('Business Quote rejects a client-selected account or Business owner', async () => {
  let called=false;
  const quotes={createBusinessQuote:async()=>{called=true;throw new Error('must not be called');}} as unknown as QuoteService;
  const {server,baseUrl}=await start({} as CustomerService,quotes);
  try {
    const response=await fetch(`${baseUrl}/api/v1/businesses/91/quotes`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customerId:7,lineItems:[{description:'Work',quantity:1,unitPrice:100}],followUpDate:'2026-11-24',accountId:999,businessId:92})});
    assert.equal(response.status,400);
    assert.equal(called,false);
  } finally { await close(server); }
});

test('Business Quote rejects unmapped local catalog item IDs', async () => {
  let called=false;
  const quotes={createBusinessQuote:async()=>{called=true;throw new Error('must not be called');}} as unknown as QuoteService;
  const {server,baseUrl}=await start({} as CustomerService,quotes);
  try {
    const response=await fetch(`${baseUrl}/api/v1/businesses/91/quotes`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customerId:7,lineItems:[{description:'Work',quantity:1,unitPrice:100,catalogItemId:123}],followUpDate:'2026-11-24'})});
    assert.equal(response.status,400);
    assert.equal(called,false);
  } finally { await close(server); }
});
