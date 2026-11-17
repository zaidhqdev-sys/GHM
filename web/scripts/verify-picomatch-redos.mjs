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
assert.match(parser, /const hasUnsafeLeadingQuantifier = branch =>/);
assert.match(parser, /if \(hasUnsafeLeadingQuantifier\(branch\)\)/);

const picomatch = require('picomatch');
assert.equal(picomatch.makeRe('+(*a)').source, '^(?:\\\\+\\\\(\\\\*a\\\\))$');
assert.equal(picomatch.makeRe('*(*a)').source, '^(?:\\\\*\\\\(\\\\*a\\\\))$');
assert.equal(picomatch.makeRe('+(a|*a)').source, '^(?:\\\\+\\\\(a\\\\|\\\\*a\\\\))$');
assert.equal(picomatch.isMatch('a'.repeat(30) + '!', '+(*a)'), false);
assert.equal(picomatch.isMatch('abc', '+(*)'), true);
assert.equal(picomatch.isMatch('abc', '+(a*)'), true);

console.log('PICOMATCH CVE-2026-112366 MITIGATION: exact parser guard and regression cases PASS');
