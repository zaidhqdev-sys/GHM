import { argon2id, argon2Verify } from 'hash-wasm';

const BENCHMARK_PASSWORD = 'GHM-Argon2id-CI-interoperability-test';
const BENCHMARK_SALT = Uint8Array.from([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
]);

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/healthz') {
      return Response.json({ status: 'ok', profile: 'argon2id-m65536-t3-p1' });
    }
    if (request.method !== 'POST' || !['/verify', '/hash'].includes(url.pathname)) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }

    try {
      const body = await request.json() as { password?: string; hash?: string };
      if (body.password !== BENCHMARK_PASSWORD) {
        return Response.json({ error: 'invalid_input' }, { status: 400 });
      }

      const started = performance.now();
      if (url.pathname === '/verify') {
        if (typeof body.hash !== 'string' || !body.hash.startsWith('$argon2id$')) {
          return Response.json({ error: 'invalid_hash' }, { status: 400 });
        }
        const valid = await argon2Verify({ password: body.password, hash: body.hash });
        return Response.json({
          operation: 'verify',
          valid,
          elapsedMs: performance.now() - started,
          profile: 'argon2id-m65536-t3-p1',
        });
      }

      const hash = await argon2id({
        password: body.password,
        salt: BENCHMARK_SALT,
        parallelism: 1,
        iterations: 3,
        memorySize: 65536,
        hashLength: 32,
        outputType: 'encoded',
      });
      return Response.json({
        operation: 'hash',
        hash,
        elapsedMs: performance.now() - started,
        profile: 'argon2id-m65536-t3-p1',
      });
    } catch {
      return Response.json({ error: 'argon2_benchmark_failed' }, { status: 500 });
    }
  },
};
