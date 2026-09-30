import http from 'http';
import { config } from './config';
import { createApp } from './http/app';
import { pool } from './db/pool';

const app = createApp();
const server = http.createServer(app);
let ready = false;

const safeErrorDetails = (error: unknown): { name: string; code?: string } => {
  if (!(error instanceof Error)) return { name: 'UnknownError' };
  const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  return code ? { name: error.name, code } : { name: error.name };
};

app.get('/readyz', (_req, res) => {
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
});

const start = async (): Promise<void> => {
  await pool.query('SELECT 1');
  server.listen(config.port, () => {
    ready = true;
    console.log(`GHM Core Engine listening on port ${config.port}`);
  });
};

const shutdown = async (signal: string): Promise<void> => {
  ready = false;
  console.log(`Received ${signal}; shutting down GHM Core Engine`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
};

process.once('SIGTERM', () => void shutdown('SIGTERM').finally(() => process.exit(0)));
process.once('SIGINT', () => void shutdown('SIGINT').finally(() => process.exit(0)));
process.on('uncaughtException', (error: Error) => {
  console.error(JSON.stringify({ event: 'uncaught_exception', error: safeErrorDetails(error) }));
  process.exit(1);
});
process.on('unhandledRejection', (reason: unknown) => {
  console.error(JSON.stringify({ event: 'unhandled_rejection', error: safeErrorDetails(reason) }));
  process.exit(1);
});

void start().catch(async (error: unknown) => {
  console.error(JSON.stringify({ event: 'startup_failed', error: safeErrorDetails(error) }));
  await pool.end();
  process.exitCode = 1;
});
