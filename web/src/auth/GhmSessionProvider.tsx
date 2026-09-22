import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createGhmAuthClient, type GhmAuthClient } from './ghm-auth-client';

/**
 * Browser session wiring only — not GHM AuthContext.
 * Authorization remains DB-backed on the GHM API; this never decodes JWT roles.
 */
interface GhmSessionValue {
  readonly client: GhmAuthClient;
  readonly ready: boolean;
  readonly authenticated: boolean;
  readonly accountId: number | null;
  readonly sessionId: number | null;
}

const GhmSessionContext = createContext<GhmSessionValue | null>(null);

export const GhmSessionProvider = ({ children }: { children: ReactNode }) => {
  const client = useMemo(() => createGhmAuthClient(), []);
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);

  const sync = useCallback(() => {
    setAuthenticated(client.isAuthenticated());
    setAccountId(client.getAccountId());
    setSessionId(client.getSessionId());
  }, [client]);

  useEffect(() => {
    const unsubscribe = client.subscribe(sync);
    let cancelled = false;
    void (async () => {
      await client.restoreSession();
      if (!cancelled) {
        sync();
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [client, sync]);

  const value = useMemo(
    () => ({
      client,
      ready,
      authenticated,
      accountId,
      sessionId,
    }),
    [client, ready, authenticated, accountId, sessionId],
  );

  return <GhmSessionContext.Provider value={value}>{children}</GhmSessionContext.Provider>;
};

export const useGhmSession = (): GhmSessionValue => {
  const value = useContext(GhmSessionContext);
  if (!value) {
    throw new Error('useGhmSession must be used within GhmSessionProvider');
  }
  return value;
};
