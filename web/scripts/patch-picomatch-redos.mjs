import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const packagePath = path.resolve(root, '../node_modules/picomatch/package.json');
const sourcePath = path.resolve(root, '../node_modules/picomatch/lib/parse.js');

if (!fs.existsSync(packagePath) || !fs.existsSync(sourcePath)) {
  throw new Error('picomatch is not installed where the web lockfile expects it');
}
const metadata = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
if (metadata.name !== 'picomatch' || metadata.version !== '4.0.7') {
  throw new Error('Refusing to patch an unexpected picomatch package: ' + metadata.name + '@' + metadata.version);
}

let source = fs.readFileSync(sourcePath, 'utf8');
const helper = String.raw\`// Mitigation aligned with upstream micromatch/picomatch PR #238 (CVE-2026-112366).
// A leading bare wildcard followed by more content inside a repeated extglob
// can create nested unbounded quantifiers and catastrophic backtracking.
const hasUnsafeLeadingQuantifier = branch => {
  let i = 0;
  while (i < branch.length && (branch[i] === '*' || branch[i] === '?') && branch[i + 1] !== '(') {
    i++;
  }
  return i > 0 && i < branch.length;
};

\`;
const helperMarker = 'const hasUnsafeLeadingQuantifier = branch => {';
const call = '    if (hasUnsafeLeadingQuantifier(branch)) {\\n      return { risky: true };\\n    }\\n\\n';
const helperAnchor = 'const repeatedExtglobRecursion = pattern => {';
const callAnchor = '    if (repeatedExtglobRecursion(branch) > max) {';

if (!source.includes(helperMarker)) {
  if (source.split(helperAnchor).length !== 2) {
    throw new Error('Unexpected picomatch parser layout; refusing an unverified patch');
  }
  source = source.replace(helperAnchor, helper + helperAnchor);
}
if (!source.includes('if (hasUnsafeLeadingQuantifier(branch))')) {
  if (source.split(callAnchor).length !== 2) {
    throw new Error('Unexpected picomatch repeated-extglob analysis; refusing an unverified patch');
  }
  source = source.replace(callAnchor, call + callAnchor);
}
if (!source.includes(helperMarker) || !source.includes('if (hasUnsafeLeadingQuantifier(branch))')) {
  throw new Error('picomatch mitigation verification failed after patching');
}
fs.writeFileSync(sourcePath, source);
console.log('Applied verified picomatch 4.0.7 ReDoS mitigation aligned with upstream PR #238.');
