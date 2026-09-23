import { useState } from 'react';
import { GhmSessionProvider, useGhmSession } from './auth/GhmSessionProvider';
import { AppShell, type AppNavId } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { ProfilePage } from './pages/ProfilePage';
import { BusinessProfilePage } from './pages/BusinessProfilePage';

const AppRoutes = () => {
  const { ready, authenticated } = useGhmSession();
  const [activeNav, setActiveNav] = useState<AppNavId>('profile');

  if (!ready) {
    return (
      <main className="boot-screen">
        <p className="brand">GHM</p>
        <p className="muted">Restoring session…</p>
      </main>
    );
  }

  if (!authenticated) {
    return <LoginPage />;
  }

  return (
    <AppShell activeNav={activeNav} onNavigate={setActiveNav}>
      {activeNav === 'profile' ? <ProfilePage /> : <BusinessProfilePage />}
    </AppShell>
  );
};

export const App = () => (
  <GhmSessionProvider>
    <AppRoutes />
  </GhmSessionProvider>
);
