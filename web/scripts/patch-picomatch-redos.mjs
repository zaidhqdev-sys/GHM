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
const newline = String.fromCharCode(10);
const helper = [
  'const isSelfRepeatingStarBranch = branch => {',
  '  let escaped = false;',
  '  let bracket = false;',
  '  let star = false;',
  '',
  '  for (let i = 0; i < branch.length; i++) {',
  '    const ch = branch[i];',
  '',
  '    if (escaped === true) {',
  '      escaped = false;',
  '      continue;',
  '    }',
  '',
  '    if (ch.charCodeAt(0) === 92) {',
  '      escaped = true;',
  '      continue;',
  '    }',
  '',
  '    if (bracket === true) {',
  "      if (ch === ']') bracket = false;",
  '      continue;',
  '    }',
  '',
  "    if (ch === '[') {",
  '      bracket = true;',
  '      continue;',
  '    }',
  '',
  '    if (/[/(){}|!+@]/.test(ch)) {',
  '      return false;',
  '    }',
  '',
  "    if (ch === '*') {",
  "      if (branch[i + 1] === '*') {",
  '        return false;',
  '      }',
  '      star = true;',
  '    }',
  '  }',
  '',
  '  return star && !escaped && !bracket;',
  '};',
  '',
].join(newline);

const helperMarker = 'const isSelfRepeatingStarBranch = branch => {';
const helperAnchor = 'const repeatedExtglobRecursion = pattern => {';
if (!source.includes(helperMarker)) {
  if (source.split(helperAnchor).length !== 2) throw new Error('Unexpected picomatch parser helper location; refusing patch');
  source = source.replace(helperAnchor, helper + helperAnchor);
}

const analysisAnchor = [
  '  return { risky: false };',
  '};',
  '',
  '/**',
  ' * Parse the given input string.',
].join(newline);
const analysisPatch = [
  '  if (branches.length === 1 && isSelfRepeatingStarBranch(branches[0])) {',
  '    return { risky: false, collapse: true };',
  '  }',
  '',
  '',
].join(newline);
if (!source.includes('return { risky: false, collapse: true };')) {
  if (source.split(analysisAnchor).length !== 2) throw new Error('Unexpected picomatch analysis return; refusing patch');
  source = source.replace(analysisAnchor, analysisPatch + analysisAnchor);
}

const closeAnchor = [
  "    let output = token.close + (opts.capture ? ')' : '');",
  '    let rest;',
].join(newline);
const closePatch = [
  "    if (analysis.collapse === true && (token.type === 'plus' || token.type === 'star')) {",
  "      token.close = token.type === 'plus' ? ')' : ')?';",
  '    }',
  '',
].join(newline);
if (!source.includes('analysis.collapse === true')) {
  if (source.split(closeAnchor).length !== 2) throw new Error('Unexpected picomatch extglob close location; refusing patch');
  source = source.replace(closeAnchor, closePatch + closeAnchor);
}

if (!source.includes(helperMarker) ||
    !source.includes('return { risky: false, collapse: true };') ||
    !source.includes('analysis.collapse === true')) {
  throw new Error('picomatch ReDoS mitigation verification failed after patching');
}
fs.writeFileSync(sourcePath, source);
console.log('Applied picomatch single-branch repeated-extglob collapse mitigation aligned with upstream PR #237.');
