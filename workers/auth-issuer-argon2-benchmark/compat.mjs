import fs from 'node:fs';
import argon2 from 'argon2';
import { argon2id, argon2Verify } from 'hash-wasm';

const password = 'GHM-Argon2id-CI-interoperability-test';
const salt = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
const nativeStarted = performance.now();
const nativeHash = await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
  salt: Buffer.from(salt),
});
const nativeHashMs = performance.now() - nativeStarted;

const wasmVerifyStarted = performance.now();
const wasmVerifiesNative = await argon2Verify({ password, hash: nativeHash });
const wasmVerifyMs = performance.now() - wasmVerifyStarted;

const wasmHashStarted = performance.now();
const wasmHash = await argon2id({
  password,
  salt,
  parallelism: 1,
  iterations: 3,
  memorySize: 65536,
  hashLength: 32,
  outputType: 'encoded',
});
const wasmHashMs = performance.now() - wasmHashStarted;

const nativeVerifiesWasm = await argon2.verify(wasmHash, password);
const profileMatches = /\$argon2id\$v=19\$m=65536,t=3,p=1\$/.test(wasmHash);
if (!wasmVerifiesNative || !nativeVerifiesWasm || !profileMatches) {
  throw new Error('Argon2id PHC interoperability or parameter qualification failed');
}

fs.mkdirSync('tmp', { recursive: true });
fs.writeFileSync('tmp/argon2-native-test-hash.txt', nativeHash, { mode: 0o600 });
const freeCpuBudgetMs = 10;
const wasmVerifyWithinFreeCpuBudget = wasmVerifyMs <= freeCpuBudgetMs;
const wasmHashWithinFreeCpuBudget = wasmHashMs <= freeCpuBudgetMs;
fs.writeFileSync('tmp/argon2-wasm-compat.json', JSON.stringify({
  status: wasmVerifyWithinFreeCpuBudget && wasmHashWithinFreeCpuBudget
    ? 'phc_compatible_within_free_cpu_budget'
    : 'phc_compatible_but_over_free_cpu_budget',
  freeCpuBudgetMs,
  wasmVerifyWithinFreeCpuBudget,
  wasmHashWithinFreeCpuBudget,
  profile: 'argon2id-m65536-t3-p1-h32-s16',
  wasmVerifiesNative,
  nativeVerifiesWasm,
  profileMatches,
  nativeHashMs,
  wasmVerifyMs,
  wasmHashMs,
}, null, 2));
console.log(fs.readFileSync('tmp/argon2-wasm-compat.json', 'utf8'));
