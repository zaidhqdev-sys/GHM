import { afterEach, describe, expect, it, vi } from 'vitest';
import { getApiBaseUrl, getAuthIssuerBaseUrl } from './config';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GHM API and authentication issuer origins', () => {
  it('keeps authentication on the API origin when no issuer origin is configured', () => {
    vi.stubEnv('VITE_GHM_API_BASE_URL', 'https://resource.example/');
    vi.stubEnv('VITE_GHM_AUTH_ISSUER_BASE_URL', '');

    expect(getApiBaseUrl()).toBe('https://resource.example');
    expect(getAuthIssuerBaseUrl()).toBe('https://resource.example');
  });

  it('uses the issuer origin only for authentication when configured', () => {
    vi.stubEnv('VITE_GHM_API_BASE_URL', 'https://resource.example/');
    vi.stubEnv('VITE_GHM_AUTH_ISSUER_BASE_URL', 'https://issuer.example/');

    expect(getApiBaseUrl()).toBe('https://resource.example');
    expect(getAuthIssuerBaseUrl()).toBe('https://issuer.example');
  });
});
