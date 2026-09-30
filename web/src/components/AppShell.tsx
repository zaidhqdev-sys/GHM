import { useState, type ReactNode } from 'react';
import { useGhmSession } from '../auth/GhmSessionProvider';

export type AppNavId = 'profile' | 'business-profile' | 'business-hours';

interface AppShellProps {
  readonly children: ReactNode;
  readonly activeNav: AppNavId;
  readonly onNavigate: (nav: AppNavId) => void;
}

export const AppShell = ({ children, activeNav, onNavigate }: AppShellProps) => {
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
        <button
          type="button"
          className={activeNav === 'profile' ? 'nav-active nav-button' : 'nav-button'}
          onClick={() => onNavigate('profile')}
        >
          Profile
        </button>
        <button
          type="button"
          className={activeNav === 'business-profile' ? 'nav-active nav-button' : 'nav-button'}
          onClick={() => onNavigate('business-profile')}
        >
          Business Profile
        </button>
        <button
          type="button"
          className={activeNav === 'business-hours' ? 'nav-active nav-button' : 'nav-button'}
          onClick={() => onNavigate('business-hours')}
        >
          Business Hours
        </button>
      </nav>
      <main className="app-main">{children}</main>
    </div>
  );
};
