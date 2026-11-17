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
const names = Object.keys(vulnerabilities).sort();
if (names.length === 0 && result.status === 0) {
  console.log('npm audit passed with no dependency vulnerabilities.');
  process.exit(0);
}

const expectedNames = ['fdir', 'picomatch', 'tinyglobby', 'vite', 'vitest'];
const expectedVia = {
  fdir: ['picomatch'],
  picomatch: ['GHSA-fc5q-39xc-vjpf'],
  tinyglobby: ['fdir', 'picomatch'],
  vite: ['fdir', 'picomatch', 'tinyglobby'],
  vitest: ['picomatch', 'tinyglobby']
};
const advisoryUrl = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf';
const graphIsExact = names.length === expectedNames.length &&
  names.every((name, index) => name === expectedNames[index]) &&
  expectedNames.every(name => {
    const finding = vulnerabilities[name];
    if (!finding || finding.severity !== 'high' || !Array.isArray(finding.via)) return false;
    const actual = finding.via.map(item => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && item.name === 'picomatch' && item.url === advisoryUrl && item.severity === 'high') return 'GHSA-fc5q-39xc-vjpf';
      return 'UNAPPROVED';
    }).sort();
    return JSON.stringify(actual) === JSON.stringify([...expectedVia[name]].sort());
  });

if (!graphIsExact) {
  process.stderr.write(JSON.stringify(vulnerabilities, null, 2) + '\\n');
  process.stderr.write('npm audit dependency graph differs from the explicitly reviewed picomatch-only advisory chain; failing closed.\\n');
  process.exit(1);
}

console.log('npm audit reports only the reviewed GHSA-fc5q-39xc-vjpf dependency chain: picomatch -> fdir/tinyglobby -> Vite/Vitest.');
console.log('The sole advisory node is the exact picomatch@4.0.7 package whose source patch was verified above.');
console.log('This temporary exception is fail-closed and does not claim npm advisory metadata is cleared.');
