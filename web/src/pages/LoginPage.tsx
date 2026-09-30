import { useState, type FormEvent } from 'react';
import { GhmAuthClientError } from '../auth/ghm-auth-client';
import { useGhmSession } from '../auth/GhmSessionProvider';

export const LoginPage = () => {
  const { client } = useGhmSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await client.login(email.trim(), password);
    } catch (err) {
      if (err instanceof GhmAuthClientError && err.code === 'INVALID_CREDENTIALS') {
        setError('Invalid email or password.');
      } else {
        setError('Unable to sign in. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel">
        <p className="brand">GHM</p>
        <h1>Sign in</h1>
        <p className="muted">Use your GHM account credentials.</p>
        <form onSubmit={onSubmit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </label>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <button type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
};
