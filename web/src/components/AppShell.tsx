import { useState, type ReactNode } from 'react';
import { useGhmSession } from '../auth/GhmSessionProvider';

interface AppShellProps {
  readonly children: ReactNode;
  readonly activeNav: 'profile';
}

export const AppShell = ({ children, activeNav }: AppShellProps) => {
  const { accountId, sessionId, client } = useGhmSession();
  const [loggingOut, setLoggingOut] = useState(false);

  const onLogout = async () => {
    setLoggingOut(true);
    try {
      await client.logout();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="brand">GHM</p>
          <p className="muted small">
            Account {accountId ?? '—'}
            {sessionId !== null ? ` · Session ${sessionId}` : ''}
          </p>
        </div>
        <button type="button" onClick={() => void onLogout()} disabled={loggingOut}>
          {loggingOut ? 'Signing out…' : 'Logout'}
        </button>
      </header>
      <nav className="app-nav" aria-label="Primary">
        <span className={activeNav === 'profile' ? 'nav-active' : undefined}>Profile</span>
      </nav>
      <main className="app-main">{children}</main>
    </div>
  );
};
