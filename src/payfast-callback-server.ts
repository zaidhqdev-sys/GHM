import http from 'node:http';
import express, { type NextFunction, type Request, type Response } from 'express';
import { Pool } from 'pg';
import { classifyPayfastItnFailure, payfastItnHttpStatus, PayfastCallbackBoundary, parsePayfastItnFields, resolvePayfastEnvironment } from './resources/commercial/payfast-callback';

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};
const environment = resolvePayfastEnvironment(process.env.NODE_ENV, process.env.PAYFAST_ENVIRONMENT);
const port = Number(process.env.PORT ?? process.env.PAYFAST_CALLBACK_PORT ?? '3100');
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
  // Render's internal Postgres endpoint presents a self-signed certificate.
  // Keep TLS encryption enabled, but do not attempt CA validation for this managed endpoint.
  ssl: databaseSsl ? { rejectUnauthorized: false } : false,
  max: 5,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 10000,
});
const boundary = new PayfastCallbackBoundary(database, {
  merchantId: required('PAYFAST_MERCHANT_ID'),
  passphrase: process.env.PAYFAST_PASSPHRASE?.trim() || null,
  environment,
});

const startupErrorDetails = (error: unknown): Record<string, string> => {
  if (!(error instanceof Error)) return { name: 'UnknownError' };
  const pgError = error as Error & { code?: unknown; severity?: unknown };
  const message = error.message
    .replace(/postgres(?:ql)?:\/\/[^\s"'\x60]+/gi, 'postgresql://[REDACTED]')
    .replace(/((?:password|passphrase|secret|token)\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 500);
  return {
    name: error.name,
    ...(typeof pgError.code === 'string' && /^[A-Z0-9]{5}$/.test(pgError.code) ? { code: pgError.code } : {}),
    ...(typeof pgError.severity === 'string' ? { severity: pgError.severity.slice(0, 32) } : {}),
    message,
  };
};

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', trustProxy);
app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok' }));
app.get('/readyz', async (_req, res) => {
  try {
    const identity = (await database.query('SELECT session_user, current_user')).rows[0];
    if (identity.session_user !== 'ghm_payment_provider' || identity.current_user !== 'ghm_payment_provider') throw new Error('unexpected database identity');
    res.status(200).json({ status: 'ready' });
  }
  catch { res.status(503).json({ status: 'not_ready' }); }
});
app.post('/api/v1/commercial/payfast/itn', express.urlencoded({ extended: false, limit: '32kb', parameterLimit: 64 }), async (req: Request, res: Response) => {
  try {
    const fields = parsePayfastItnFields(req.body);
    if (!fields) {
      console.warn(JSON.stringify({ event: 'payfast_itn_rejected', reason: 'malformed_request' }));
      res.status(200).send('OK');
      return;
    }
    const sourceIp = req.ip ?? req.socket.remoteAddress ?? '';
    await boundary.handleItn(fields, sourceIp);
    res.status(200).send('OK');
  } catch (error) {
    const disposition = classifyPayfastItnFailure(error);
    if (!disposition.retry) {
      console.warn(JSON.stringify({
        event: 'payfast_itn_rejected',
        reason: disposition.reason,
        error_type: error instanceof Error ? error.name : 'UnknownError',
      }));
      res.status(payfastItnHttpStatus(error)).send(payfastItnHttpStatus(error) === 200 ? 'OK' : 'ERROR');
      return;
    }
    console.error(JSON.stringify({ event: 'payfast_callback_failed', error: startupErrorDetails(error) }));
    res.status(payfastItnHttpStatus(error)).send(payfastItnHttpStatus(error) === 200 ? 'OK' : 'ERROR');
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const disposition = classifyPayfastItnFailure(error);
  if (!disposition.retry) {
    console.warn(JSON.stringify({
      event: 'payfast_itn_rejected',
      reason: disposition.reason,
      error_type: error instanceof Error ? error.name : 'UnknownError',
    }));
    res.status(payfastItnHttpStatus(error)).send(payfastItnHttpStatus(error) === 200 ? 'OK' : 'ERROR');
    return;
  }
  console.error(JSON.stringify({ event: 'payfast_callback_parser_failed', error: startupErrorDetails(error) }));
  res.status(payfastItnHttpStatus(error)).send(payfastItnHttpStatus(error) === 200 ? 'OK' : 'ERROR');
});

const server = http.createServer(app);
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
const start = async (): Promise<void> => {
  const identity = (await database.query('SELECT session_user, current_user')).rows[0];
  if (identity.session_user !== 'ghm_payment_provider' || identity.current_user !== 'ghm_payment_provider') {
    throw new Error(`PAYFAST_CALLBACK_DATABASE_URL must authenticate as ghm_payment_provider (session_user=${String(identity.session_user)}, current_user=${String(identity.current_user)})`);
  }
  server.listen(port, () => { console.log(`PayFast callback listener ready on port ${port}`); });
};
const shutdown = async (signal: string): Promise<void> => {
  console.log(`PayFast callback received ${signal}; shutting down`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await database.end();
};
process.once('SIGTERM', () => void shutdown('SIGTERM').finally(() => process.exit(0)));
process.once('SIGINT', () => void shutdown('SIGINT').finally(() => process.exit(0)));
void start().catch(async (error: unknown) => {
  console.error(JSON.stringify({ event: 'payfast_callback_startup_failed', error: startupErrorDetails(error) }));
  await database.end();
  process.exitCode = 1;
});