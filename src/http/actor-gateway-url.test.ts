import assert from 'node:assert/strict';
import test from 'node:test';
import { assertActorGatewayBaseUrl } from './actor-gateway-url';

test('accepts credential-free HTTPS origins and localhost development origins', () => {
  assert.equal(assertActorGatewayBaseUrl('https://gateway.example.test').origin, 'https://gateway.example.test');
  assert.equal(assertActorGatewayBaseUrl('http://localhost:8787').port, '8787');
  assert.equal(assertActorGatewayBaseUrl('http://127.0.0.1:8787').hostname, '127.0.0.1');
});

test('rejects insecure remote origins, embedded credentials, paths, queries and fragments', () => {
  for (const value of [
    'http://gateway.example.test',
    'https://user:password@gateway.example.test',
    'https://gateway.example.test/private',
    'https://gateway.example.test?target=other',
    'https://gateway.example.test#fragment',
    'http://[::1]:8787',
  ]) {
    assert.throws(() => assertActorGatewayBaseUrl(value));
  }
});
