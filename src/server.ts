import http from 'http';
import { Pool } from 'pg';
import { config } from './config';
import { createApp } from './http/app';

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.isProduction ? { rejectUnauthorized: false } : false,
});

const app = createApp();
const server = http.createServer(app);
let ready = false;

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
  console.error('Uncaught exception:', error);
  process.exit(1);
});
process.on('unhandledRejection', (reason: unknown) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

void start().catch(async (error: unknown) => {
  console.error('GHM startup failed:', error);
  await pool.end();
  process.exitCode = 1;
});
