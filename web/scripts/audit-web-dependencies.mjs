import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packageRoot = join(root, 'node_modules', 'picomatch');
const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
const source = await readFile(join(packageRoot, 'lib', 'parse.js'), 'utf8');
if (packageJson.name !== 'picomatch' || packageJson.version !== '4.0.7' || !source.includes('const isSelfRepeatingStarBranch = branch => {') || !source.includes('analysis.collapse === true')) {
  throw new Error('Exact picomatch 4.0.7 source patch is absent; refusing the temporary audit exception.');
}
const result = spawnSync('npm', ['audit', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
let report;
try { report = JSON.parse(result.stdout); } catch {
  process.stderr.write(result.stderr || result.stdout || 'npm audit returned no valid JSON.\\n');
  process.exit(1);
}
const vulnerabilities = report.vulnerabilities ?? {};
const names = Object.keys(vulnerabilities);
if (names.length === 0 && result.status === 0) { console.log('npm audit passed with no dependency vulnerabilities.'); process.exit(0); }
const finding = vulnerabilities.picomatch;
const allowed = names.length === 1 && names[0] === 'picomatch' && finding.severity === 'high' && Array.isArray(finding.via) && finding.via.length > 0 && finding.via.every(item => typeof item === 'object' && String(item.url ?? '').includes('GHSA-fc5q-39xc-vjpf'));
if (!allowed) {
  process.stderr.write(JSON.stringify(vulnerabilities, null, 2) + '\\n');
  process.stderr.write('npm audit found an unapproved vulnerability; failing closed.\\n');
  process.exit(1);
}
console.log('npm audit reports only GHSA-fc5q-39xc-vjpf against picomatch@4.0.7.');
console.log('Temporary exception requires the exact source patch and dedicated ReDoS regression tests in this CI job.');
console.log('This does not claim the upstream advisory or npm metadata has been cleared.');
