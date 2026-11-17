import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packageRoot = join(root, 'node_modules', 'picomatch');
const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
const parsePath = join(packageRoot, 'lib', 'parse.js');

if (packageJson.name !== 'picomatch' || packageJson.version !== '4.0.7') {
  throw new Error('Refusing to patch unexpected picomatch package: ' + packageJson.name + '@' + packageJson.version);
}

let source = await readFile(parsePath, 'utf8');
const marker = 'const isSelfRepeatingStarBranch = branch => {';
if (source.includes(marker)) {
  if (!source.includes('analysis.collapse === true')) throw new Error('Picomatch patch is only partially applied');
  console.log('Verified existing picomatch ReDoS patch.');
} else {
  const helperAnchor = 'const repeatedExtglobRecursion = pattern => {';
  const analysisAnchor = [
    '  if (sawStarSequence) {',
    '    return combinable',
    '      ? { risky: true, safeOutput: buildCharClassStar([...new Set(safeChars)]) }',
    '      : { risky: true };',
    '  }',
    '',
    '  return { risky: false };',
    '};'
  ].join('\n');
  const closeAnchor = "    let output = token.close + (opts.capture ? ')' : '');";
  if (!source.includes(helperAnchor) || !source.includes(analysisAnchor) || !source.includes(closeAnchor)) {
    throw new Error('picomatch 4.0.7 source differs from reviewed upstream patch context');
  }
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
    "    if (ch === '\\\\') {",
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
    "      if (branch[i + 1] === '*') return false;",
    '      star = true;',
    '    }',
    '  }',
    '',
    '  return star && !escaped && !bracket;',
    '};',
    ''
  ].join('\n');
  const patchedAnalysis = [
    '  if (sawStarSequence) {',
    '    return combinable',
    '      ? { risky: true, safeOutput: buildCharClassStar([...new Set(safeChars)]) }',
    '      : { risky: true };',
    '  }',
    '',
    '  if (branches.length === 1 && isSelfRepeatingStarBranch(branches[0])) {',
    '    return { risky: false, collapse: true };',
    '  }',
    '',
    '  return { risky: false };',
    '};'
  ].join('\n');
  const patchedClose = [
    "    if (analysis.collapse === true && (token.type === 'plus' || token.type === 'star')) {",
    "      token.close = token.type === 'plus' ? ')' : ')?';",
    '    }',
    '',
    closeAnchor
  ].join('\n');
  source = source.replace(helperAnchor, helper + helperAnchor);
  source = source.replace(analysisAnchor, patchedAnalysis);
  source = source.replace(closeAnchor, patchedClose);
  await writeFile(parsePath, source);
  console.log('Applied picomatch CVE-2026-112366 mitigation from upstream PR #237 commit 1bf0d04563cb9ce568cf36efc5f6b7187d9911d5.');
}
