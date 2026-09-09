import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/server.ts', import.meta.url), 'utf8');

const forbidden = [
  ['runtime schema mutation', /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/i],
  ['implicit administrator bootstrap', /UPDATE\s+users\s+SET\s+role\s*=\s*['"]admin['"]\s+WHERE\s+id\s*=\s*1/i],
  ['fallback JWT secret', /JWT_SECRET\s*\|\|\s*['"]fallback-secret['"]/i],
  ['wildcard CORS middleware', /app\.use\(cors\(\)\)/i],
  ['unrestricted table endpoint', /\/api\/v1\/tables\/:table/i],
  ['Supabase-owned storage in GHM runtime', /SUPABASE_SERVICE_KEY/i],
];

const failures = forbidden.filter(([, pattern]) => pattern.test(source));

if (failures.length > 0) {
  console.error('Runtime boundary verification FAILED.');
  for (const [name] of failures) console.error(`- ${name}`);
  process.exit(1);
}

console.log('Runtime boundary verification PASSED.');
