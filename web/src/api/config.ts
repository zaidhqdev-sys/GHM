/** Default construction API host for local development. */
export const DEFAULT_GHM_API_BASE_URL = 'https://ghm-internal-runtime.onrender.com';

export const getApiBaseUrl = (): string => {
  const configured = import.meta.env.VITE_GHM_API_BASE_URL?.trim();
  if (configured && configured.length > 0) {
    return configured.replace(/\/$/, '');
  }
  return DEFAULT_GHM_API_BASE_URL;
};
