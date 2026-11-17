import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const metadata = JSON.parse(fs.readFileSync(path.resolve(root, '../node_modules/picomatch/package.json'), 'utf8'));
const parser = fs.readFileSync(path.resolve(root, '../node_modules/picomatch/lib/parse.js'), 'utf8');

assert.equal(metadata.version, '4.0.7');
assert.match(parser, /const isSelfRepeatingStarBranch = branch =>/);
assert.match(parser, /return \{ risky: false, collapse: true \};/);
assert.match(parser, /analysis\.collapse === true/);

const picomatch = require('picomatch');
for (const pattern of ['+(*)', '+(*a)', '*(*a)', '+(a*)', '+(a*b)', '*(*.js)']) {
  assert.doesNotMatch(picomatch.makeRe(pattern).source, /\)[+*]/, pattern + ' must not retain nested outer repetition');
}
for (const pattern of ['+(*a)', '*(*a)', '+(*a)c', 'x+(*a)']) {
  const start = performance.now();
  assert.equal(picomatch.isMatch('a'.repeat(50) + 'b', pattern), false);
  assert.ok(performance.now() - start < 100, pattern + ' exceeded the 100ms regression bound');
}
assert.equal(picomatch.isMatch('abc', '+(*)c'), true);
assert.equal(picomatch.isMatch('aaa', '+(*a)'), true);
assert.equal(picomatch.isMatch('a.a', '+(*a)'), true);
assert.equal(picomatch.isMatch('ab', '+(*a)'), false);
assert.equal(picomatch.isMatch('axbayb', '+(a*b)'), true);
assert.equal(picomatch.isMatch('axbay', '+(a*b)'), false);
assert.equal(picomatch.isMatch('foo.js', '*(*.js)'), true);
assert.equal(picomatch.isMatch('foo.ts', '*(*.js)'), false);

console.log('PICOMATCH CVE-2026-112366 MITIGATION: exact parser guard, collapse semantics and regression cases PASS');
