import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, '..');
const serverSource = await readFile(path.join(repoRoot, 'src/server.ts'), 'utf8');
const appSource = await readFile(path.join(repoRoot, 'src/http/app.ts'), 'utf8');

const failures = [];

if (!/import\s+\{\s*pool\s*\}\s+from\s+'\.\/db\/pool'/.test(serverSource)) failures.push('server does not use the canonical database pool');
if (/new\s+Pool\s*\(/.test(serverSource)) failures.push('server creates a second database pool');
if (/config\.isProduction\s*\?/.test(serverSource)) failures.push('server derives database TLS from NODE_ENV instead of DATABASE_SSL');
if (!/app\.get\(['"]\/healthz['"]/.test(serverSource)) failures.push('health endpoint is not registered');
if (!/app\.get\(['"]\/readyz['"]/.test(serverSource)) failures.push('readiness endpoint is not registered');
if (!/server\.close\(/.test(serverSource) || !/pool\.end\(\)/.test(serverSource)) failures.push('graceful shutdown does not close the HTTP server and database pool');
if (/console\.error\([^\n]*error\s*\)/.test(appSource) || /console\.error\([^\n]*reason\s*\)/.test(serverSource)) failures.push('error logging may serialize raw error details');
if (!/res\.status\(500\)\.json\(\{\s*error:\s*['"]internal_error['"]\s*\}\)/.test(appSource)) failures.push('HTTP 500 response is not a stable internal_error contract');

if (failures.length > 0) {
  console.error('Operational boundary static verification FAILED.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const port = '3101';
const databaseUrl = process.env.GHM_RUNTIME_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('Operational boundary runtime verification FAILED.');
  console.error('- GHM_RUNTIME_DATABASE_URL or DATABASE_URL is required');
  process.exit(1);
}

const childEnv = { ...process.env, DATABASE_URL: databaseUrl, PORT: port };

async function run() {
  const child = spawn(process.execPath, ['dist/server.js'], {
    cwd: repoRoot,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  const waitFor = async (url, expectedStatus, timeoutMs = 15000) => {
    const deadline = Date.now() + timeoutMs;
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(url);
        const body = await response.text();
        if (response.status === expectedStatus) return body;
        lastError = new Error(`status ${response.status}: ${body}`);
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw lastError ?? new Error(`timeout waiting for ${url}`);
  };

  try {
    await waitFor(`http://127.0.0.1:${port}/readyz`, 200);
    const health = await waitFor(`http://127.0.0.1:${port}/healthz`, 200);
    if (health !== JSON.stringify({ status: 'ok' })) throw new Error(`unexpected /healthz response: ${health}`);

    const forbiddenSecrets = /(postgres(?:ql)?:\/\/|password\s*=|JWT_SECRET|Authorization:\s*Bearer\s+)/i;
    if (forbiddenSecrets.test(stdout) || forbiddenSecrets.test(stderr)) throw new Error('runtime logs contain a forbidden secret/credential pattern');

    child.kill('SIGTERM');
    const exitResult = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting for graceful shutdown')), 10000);
      child.once('exit', (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
    });

    if (exitResult.code !== 0) throw new Error(`graceful shutdown exited with code ${exitResult.code ?? 'null'} and signal ${exitResult.signal ?? 'none'}`);

    console.log('Operational boundary runtime verification PASSED.');
    console.log('- /readyz reached 200 only after database startup check');
    console.log('- /healthz returned 200 with the stable health contract');
    console.log('- runtime logs contained no forbidden credential patterns');
    console.log('- SIGTERM completed graceful shutdown with exit code 0');
  } catch (error) {
    if (!child.killed) child.kill('SIGTERM');
    console.error('Operational boundary runtime verification FAILED.');
    console.error(`- ${error instanceof Error ? error.message : String(error)}`);
    if (stderr.trim()) console.error(`stderr: ${stderr.trim()}`);
    process.exitCode = 1;
  }
}

run();
