import fs from 'node:fs';
import { spawn } from 'node:child_process';
import argon2 from 'argon2';

const PORT = 8788;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'GHM-Argon2id-CI-interoperability-test';
const nativeHash = fs.readFileSync('tmp/argon2-native-test-hash.txt', 'utf8').trim();
const logPath = 'tmp/argon2-worker-runtime.log';
let log = '';
let worker;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const writeReport = (report) => {
  report.workerLog = log;
  fs.writeFileSync('tmp/argon2-worker-runtime.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
};

try {
  worker = spawn('npx', [
    '--yes',
    'wrangler@4.161.0',
    'dev',
    '--local',
    '--ip',
    '127.0.0.1',
    '--port',
    String(PORT),
    '--config',
    'workers/auth-issuer-argon2-benchmark/wrangler.jsonc',
  ], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });

  worker.stdout.on('data', (chunk) => {
    log += chunk.toString();
    fs.writeFileSync(logPath, log);
  });
  worker.stderr.on('data', (chunk) => {
    log += chunk.toString();
    fs.writeFileSync(logPath, log);
  });

  let ready = false;
  for (let attempt = 0; attempt < 45; attempt += 1) {
    if (worker.exitCode !== null) throw new Error('Wrangler exited before benchmark Worker became ready');
    try {
      const response = await fetch(`${BASE_URL}/healthz`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // Worker is still starting.
    }
    await wait(1000);
  }
  if (!ready) throw new Error('Argon2 benchmark Worker did not become ready');

  const results = [];
  for (const operation of ['verify', 'hash']) {
    let response;
    try {
      response = await fetch(`${BASE_URL}/${operation}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          password: PASSWORD,
          ...(operation === 'verify' ? { hash: nativeHash } : {}),
        }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      results.push({
        operation,
        outcome: 'worker_request_failed',
        error: error instanceof Error ? error.message : 'unknown_error',
        timeoutSeconds: 20,
      });
      continue;
    }

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      results.push({
        operation,
        outcome: 'worker_operation_failed',
        httpStatus: response.status,
        response: body,
      });
      continue;
    }

    if (operation === 'verify') {
      results.push({
        operation,
        outcome: body.valid === true ? 'completed' : 'interoperability_failed',
        valid: body.valid,
        elapsedMs: body.elapsedMs,
      });
    } else {
      const nativeVerifiesWasm = await argon2.verify(body.hash, PASSWORD);
      results.push({
        operation,
        outcome: nativeVerifiesWasm ? 'completed' : 'interoperability_failed',
        nativeVerifiesWasm,
        elapsedMs: body.elapsedMs,
        profile: body.profile,
      });
    }
  }

  const completed = results.filter((item) => item.outcome === 'completed');
  const failedInterop = results.some((item) => item.outcome === 'interoperability_failed');
  const operationFailed = results.some((item) => item.outcome === 'worker_operation_failed' || item.outcome === 'worker_request_failed');
  const overBudget = completed.some((item) => typeof item.elapsedMs === 'number' && item.elapsedMs > 10);

  writeReport({
    status: failedInterop ? 'interoperability_failed'
      : operationFailed ? 'worker_operation_failed_under_10ms_limit'
      : overBudget ? 'over_10ms_free_cpu_budget'
      : completed.length === 2 ? 'under_10ms_local_candidate'
      : 'incomplete',
    cpuBudgetMs: 10,
    profile: 'argon2id-m65536-t3-p1-h32-s16',
    results,
  });

  if (failedInterop) process.exitCode = 1;
} catch (error) {
  writeReport({
    status: 'benchmark_runtime_error',
    error: error instanceof Error ? error.message : 'unknown_error',
  });
  process.exitCode = 1;
} finally {
  if (worker && worker.exitCode === null) {
    worker.kill('SIGTERM');
  }
}
