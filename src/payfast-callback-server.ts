import http from 'node:http';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Pool } from 'pg';
import { postgresSslConfig } from './db/postgres-ssl';
import { PayfastCallbackBoundary, parsePayfastItnFields } from './resources/commercial/payfast-callback';

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};
const environment = process.env.PAYFAST_ENVIRONMENT?.trim() || 'sandbox';
if (environment !== 'sandbox' && environment !== 'live') throw new Error('PAYFAST_ENVIRONMENT must be sandbox or live');
const port = Number(process.env.PAYFAST_CALLBACK_PORT ?? '3100');
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('PAYFAST_CALLBACK_PORT is invalid');
const trustProxyRaw = process.env.PAYFAST_CALLBACK_TRUST_PROXY?.trim() ?? 'false';
const trustProxy = trustProxyRaw === 'false' || trustProxyRaw === '' ? false : Number(trustProxyRaw);
if (trustProxy !== false && (!Number.isSafeInteger(trustProxy) || trustProxy < 1 || trustProxy > 5)) {
  throw new Error('PAYFAST_CALLBACK_TRUST_PROXY must be false or a hop count from 1 to 5');
}
const databaseSsl = process.env.PAYFAST_CALLBACK_DATABASE_SSL === 'true';
if (process.env.NODE_ENV === 'production' && !databaseSsl) throw new Error('PAYFAST_CALLBACK_DATABASE_SSL must be true in production');

const database = new Pool({
  connectionString: required('PAYFAST_CALLBACK_DATABASE_URL'),
  ssl: postgresSslConfig(databaseSsl),
  max: 5,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000,
});
const boundary = new PayfastCallbackBoundary(database, {
  merchantId: required('PAYFAST_MERCHANT_ID'),
  passphrase: process.env.PAYFAST_PASSPHRASE?.trim() || null,
  environment,
});
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', trustProxy);
app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok' }));
app.get('/readyz', async (_req, res) => {
  try { await database.query('SELECT 1'); res.status(200).json({ status: 'ready' }); }
  catch { res.status(503).json({ status: 'not_ready' }); }
});
app.post('/api/v1/commercial/payfast/itn', express.urlencoded({ extended: false, limit: '32kb', parameterLimit: 64 }), async (req: Request, res: Response) => {
  try {
    const fields = parsePayfastItnFields(req.body);
    if (!fields) { res.status(400).send('INVALID'); return; }
    const sourceIp = req.ip ?? req.socket.remoteAddress ?? '';
    await boundary.handleItn(fields, sourceIp);
    res.status(200).send('OK');
  } catch (error) {
    if (error instanceof Error && /Payfast|not found|not payable|invalid commercial payment result input|provider does not match attempt/i.test(error.message)) {
      res.status(400).send('INVALID');
      return;
    }
    console.error(JSON.stringify({ event: 'payfast_callback_failed', error: { name: error instanceof Error ? error.name : 'UnknownError' } }));
    res.status(500).send('ERROR');
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = error && typeof error === 'object' && 'status' in error ? Number((error as { status?: unknown }).status) : 500;
  if (status === 400 || status === 413 || status === 415) { res.status(400).send('INVALID'); return; }
  console.error(JSON.stringify({ event: 'payfast_callback_parser_failed', error: { name: error instanceof Error ? error.name : 'UnknownError' } }));
  res.status(500).send('ERROR');
});

const server = http.createServer(app);
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
let ready = false;
const start = async (): Promise<void> => {
  await database.query('SELECT 1');
  server.listen(port, () => { ready = true; console.log(`PayFast callback listener ready on port ${port}`); });
};
const shutdown = async (signal: string): Promise<void> => {
  ready = false;
  console.log(`PayFast callback received ${signal}; shutting down`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await database.end();
};
process.once('SIGTERM', () => void shutdown('SIGTERM').finally(() => process.exit(0)));
process.once('SIGINT', () => void shutdown('SIGINT').finally(() => process.exit(0)));
void start().catch(async (error: unknown) => {
  console.error(JSON.stringify({ event: 'payfast_callback_startup_failed', error: { name: error instanceof Error ? error.name : 'UnknownError' } }));
  await database.end();
  process.exitCode = 1;
});
