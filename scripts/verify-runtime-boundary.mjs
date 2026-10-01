import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/server.ts', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../src/http/app.ts', import.meta.url), 'utf8');
const configSource = await readFile(new URL('../src/config.ts', import.meta.url), 'utf8');

const forbidden = [
  ['runtime schema mutation', /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/i],
  ['implicit administrator bootstrap', /UPDATE\s+users\s+SET\s+role\s*=\s*['"]admin['"]\s+WHERE\s+id\s*=\s*1/i],
  ['fallback JWT secret', /JWT_SECRET\s*\|\|\s*['"]fallback-secret['"]/i],
  ['wildcard CORS middleware', /app\.use\(cors\(\)\)/i],
  ['unrestricted table endpoint', /\/api\/v1\/tables\/:table/i],
];

const failures = forbidden.filter(([, pattern]) => pattern.test(source));
if (!/server\.requestTimeout\s*=\s*30_000/.test(source)) failures.push(['bounded HTTP request timeout', /required/]);
if (!/server\.headersTimeout\s*=\s*10_000/.test(source)) failures.push(['bounded HTTP headers timeout', /required/]);
if (!/server\.keepAliveTimeout\s*=\s*5_000/.test(source)) failures.push(['bounded HTTP keep-alive timeout', /required/]);
if (!/app\.disable\(['"]etag['"]\)/.test(appSource)) failures.push(['ETag disabled', /required/]);
if (!/X-Content-Type-Options/.test(appSource) || !/X-Frame-Options/.test(appSource) || !/Referrer-Policy/.test(appSource)) failures.push(['baseline security headers', /required/]);
if (!/must not contain wildcard origin/.test(configSource)) failures.push(['wildcard CORS rejected at configuration', /required/]);

if (failures.length > 0) {
  console.error('Runtime boundary verification FAILED.');
  for (const [name] of failures) console.error(`- ${name}`);
  process.exit(1);
}

console.log('Runtime boundary verification PASSED.');
