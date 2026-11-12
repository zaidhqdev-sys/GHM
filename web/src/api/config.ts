/** Default construction API host for local development. */
export const DEFAULT_GHM_API_BASE_URL = 'https://ghm-internal-runtime.onrender.com';

export const getApiBaseUrl = (): string => {
  const configured = import.meta.env.VITE_GHM_API_BASE_URL?.trim();
  if (configured && configured.length > 0) {
    return configured.replace(/\/$/, '');
  }
  return DEFAULT_GHM_API_BASE_URL;
};

/**
 * Authentication issuer origin. Until the issuer is deployed/configured,
 * auth remains on the resource API origin for backwards compatibility.
 */
export const getAuthIssuerBaseUrl = (): string => {
  const configured = import.meta.env.VITE_GHM_AUTH_ISSUER_BASE_URL?.trim();
  if (configured && configured.length > 0) {
    return configured.replace(/\/$/, '');
  }
  return getApiBaseUrl();
};
