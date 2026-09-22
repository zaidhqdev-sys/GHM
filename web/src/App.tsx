import { GhmSessionProvider, useGhmSession } from './auth/GhmSessionProvider';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { ProfilePage } from './pages/ProfilePage';

const AppRoutes = () => {
  const { ready, authenticated } = useGhmSession();

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
    <AppShell activeNav="profile">
      <ProfilePage />
    </AppShell>
  );
};

export const App = () => (
  <GhmSessionProvider>
    <AppRoutes />
  </GhmSessionProvider>
);
