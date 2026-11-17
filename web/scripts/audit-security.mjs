import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: path.resolve(root, '..'), encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
};

const verification = run(process.execPath, [path.resolve(root, 'verify-picomatch-redos.mjs')]);
if (verification.status !== 0) {
  process.stderr.write(verification.stdout || '');
  process.stderr.write(verification.stderr || '');
  process.exit(1);
}
process.stdout.write(verification.stdout);

const audit = run('npm', ['audit', '--audit-level=moderate', '--json']);
if (audit.status === 0) {
  process.stdout.write('npm audit: no vulnerabilities found.\\n');
  process.exit(0);
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  process.stderr.write(audit.stdout || '');
  process.stderr.write(audit.stderr || '');
  throw new Error('npm audit failed without valid JSON; refusing any exception');
}

const vulnerabilities = report.vulnerabilities || {};
const allowedPackages = new Set(['picomatch', 'fdir', 'tinyglobby', 'vite', 'vitest']);
const names = Object.keys(vulnerabilities);
if (!names.includes('picomatch') || names.some(name => !allowedPackages.has(name))) {
  process.stderr.write(JSON.stringify(vulnerabilities, null, 2) + '\\n');
  throw new Error('npm audit found vulnerabilities outside the narrowly reviewed picomatch dependency path');
}

const advisoryUrl = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf';
let directAdvisoryFound = false;
for (const [name, finding] of Object.entries(vulnerabilities)) {
  if (!['high', 'critical'].includes(finding.severity)) {
    throw new Error('Unexpected severity metadata for ' + name);
  }
  const via = Array.isArray(finding.via) ? finding.via : [];
  if (name === 'picomatch') {
    if (!via.some(item => typeof item === 'object' && item.url === advisoryUrl)) {
      throw new Error('picomatch finding is not exclusively the reviewed GHSA');
    }
    directAdvisoryFound = true;
  } else if (!via.length || via.some(item =>
    typeof item === 'object'
      ? item.url !== advisoryUrl
      : !allowedPackages.has(item)
  )) {
    throw new Error('Unexpected advisory path for ' + name);
  }
}
if (!directAdvisoryFound) throw new Error('The expected direct picomatch advisory was not found');

const lock = JSON.parse(fs.readFileSync(path.resolve(root, '../package-lock.json'), 'utf8'));
const picomatchEntries = Object.entries(lock.packages || {}).filter(([key]) =>
  key === 'node_modules/picomatch' || key.endsWith('/node_modules/picomatch')
);
if (picomatchEntries.length !== 1 || picomatchEntries[0][1].version !== '4.0.7') {
  throw new Error('Lockfile picomatch inventory changed; re-review before allowing the audit exception');
}

process.stdout.write(
  'npm audit reports only GHSA-fc5q-39xc-vjpf through the reviewed picomatch/fdir/tinyglobby/Vite/Vitest path.\\n' +
  'The installed picomatch parser passed the exact mitigation and regression checks above.\\n' +
  'Scoped exception accepted; all other npm audit findings remain blocking.\\n'
);
