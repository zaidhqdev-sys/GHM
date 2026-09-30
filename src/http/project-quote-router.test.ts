import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from './app';
import type { AuthContext } from '../auth/authorization';
import { config } from '../config';
import type { ProjectQuoteService } from '../resources/project-quote/contracts';

const start = async (service: ProjectQuoteService, context?: AuthContext) => {
  const app = createApp({ projectQuoteService: service });
  app.use((req, _res, next) => { if (context) req.authContext = context; next(); });
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};
const token = (context: AuthContext) => jwt.sign({ userId: context.userId, role: context.role }, config.jwtSecret);
const quote = (status: 'submitted'|'accepted'|'rejected'|'withdrawn' = 'submitted') => ({
  id: 11, projectId: 21, businessId: 31, amount: 15000, labourMin: 5000, labourMax: 7000,
  materialsMin: 7000, materialsMax: 9000, totalMin: 12000, totalMax: 16000, durationDays: 30,
  description: 'A governed Project Quote fixture.', status, createdAt: new Date(), updatedAt: new Date(),
});
const close = (server: http.Server) => new Promise<void>(resolve => server.close(() => resolve()));
const service = (overrides: Partial<ProjectQuoteService> = {}): ProjectQuoteService => ({
  readReceived: async () => [quote()],
  readOwn: async () => [quote()],
  create: async () => quote(),
  update: async () => quote(),
  accept: async () => quote('accepted'),
  reject: async () => quote('rejected'),
  ...overrides,
});

test('Project Quote received list requires customer authorization', async () => {
  const { server, baseUrl } = await start(service(), { userId: 10, role: 'business' });
  try { const res = await fetch(`${baseUrl}/api/v1/projects/21/quotes`, { headers: { Authorization: `Bearer ${token({userId:10,role:'business'})}` } }); assert.equal(res.status, 403); } finally { await close(server); }
});
test('Project Quote received list binds project id and context', async () => {
  let seen: AuthContext | undefined;
  const { server, baseUrl } = await start(service({ readReceived: async (c, p) => { seen=c; assert.equal(p,21); return [quote()]; } }), { userId:10, role:'customer' });
  try { const res=await fetch(`${baseUrl}/api/v1/projects/21/quotes`,{headers:{Authorization:`Bearer ${token({userId:10,role:'customer'})}`}}); assert.equal(res.status,200); assert.equal((await res.json() as {quotes:Array<{id:number}>}).quotes[0].id,11); assert.deepEqual(seen,{userId:10,role:'customer'}); } finally { await close(server); }
});
test('Project Quote own list requires business role', async () => {
  const {server,baseUrl}=await start(service(),{userId:10,role:'customer'});
  try { const res=await fetch(`${baseUrl}/api/v1/businesses/31/project-quotes`,{headers:{Authorization:`Bearer ${token({userId:10,role:'customer'})}`}}); assert.equal(res.status,403); } finally { await close(server); }
});
test('Project Quote creation rejects server-owned fields', async () => {
  const {server,baseUrl}=await start(service(),{userId:10,role:'business'});
  try { const res=await fetch(`${baseUrl}/api/v1/project-quotes`,{method:'POST',headers:{Authorization:`Bearer ${token({userId:10,role:'business'})}`,'Content-Type':'application/json'},body:JSON.stringify({...quote(),projectId:21,businessId:31})}); assert.equal(res.status,400); } finally { await close(server); }
});
test('Project Quote creation uses canonical input', async () => {
  let seen: unknown;
  const {server,baseUrl}=await start(service({create:async(_c,input)=>{seen=input;return quote();}}),{userId:10,role:'business'});
  try { const res=await fetch(`${baseUrl}/api/v1/project-quotes`,{method:'POST',headers:{Authorization:`Bearer ${token({userId:10,role:'business'})}`,'Content-Type':'application/json'},body:JSON.stringify({projectId:21,businessId:31,amount:15000,description:'A governed Project Quote fixture.'})}); assert.equal(res.status,201); assert.deepEqual(seen,{projectId:21,businessId:31,amount:15000,description:'A governed Project Quote fixture.'}); } finally { await close(server); }
});
test('Project Quote update rejects arbitrary fields', async () => {
  const {server,baseUrl}=await start(service(),{userId:10,role:'business'});
  try { const res=await fetch(`${baseUrl}/api/v1/project-quotes/11`,{method:'PATCH',headers:{Authorization:`Bearer ${token({userId:10,role:'business'})}`,'Content-Type':'application/json'},body:JSON.stringify({status:'accepted'})}); assert.equal(res.status,400); } finally { await close(server); }
});
test('Project Quote update accepts canonical editable fields', async () => {
  let seen: unknown;
  const {server,baseUrl}=await start(service({update:async(_c,id,input)=>{assert.equal(id,11);seen=input;return quote();}}),{userId:10,role:'business'});
  try { const res=await fetch(`${baseUrl}/api/v1/project-quotes/11`,{method:'PATCH',headers:{Authorization:`Bearer ${token({userId:10,role:'business'})}`,'Content-Type':'application/json'},body:JSON.stringify({amount:17500})}); assert.equal(res.status,200); assert.deepEqual(seen,{amount:17500}); } finally { await close(server); }
});
test('Project Quote accept and reject are explicit operations', async () => {
  const {server,baseUrl}=await start(service(),{userId:10,role:'customer'});
  try { const h={Authorization:`Bearer ${token({userId:10,role:'customer'})}`,'Content-Type':'application/json'}; const a=await fetch(`${baseUrl}/api/v1/project-quotes/11/accept`,{method:'POST',headers:h,body:'{}'}); assert.equal(a.status,200); assert.equal((await a.json() as {quote:{status:string}}).quote.status,'accepted'); const r=await fetch(`${baseUrl}/api/v1/project-quotes/11/reject`,{method:'POST',headers:h,body:'{}'}); assert.equal(r.status,200); assert.equal((await r.json() as {quote:{status:string}}).quote.status,'rejected'); } finally { await close(server); }
});
test('Project Quote decision rejects a non-empty request body', async () => {
  const {server,baseUrl}=await start(service(),{userId:10,role:'customer'});
  try { const res=await fetch(`${baseUrl}/api/v1/project-quotes/11/accept`,{method:'POST',headers:{Authorization:`Bearer ${token({userId:10,role:'customer'})}`,'Content-Type':'application/json'},body:JSON.stringify({status:'accepted'})}); assert.equal(res.status,400); } finally { await close(server); }
});
