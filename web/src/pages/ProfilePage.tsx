import { useEffect, useState } from 'react';
import { createProfileClient, type AccountProfile } from '../api/profile';
import { useGhmSession } from '../auth/GhmSessionProvider';

export const ProfilePage = () => {
  const { client } = useGhmSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    const profileClient = createProfileClient((path, init) => client.apiFetch(path, init));

    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await profileClient.getOwnProfile();
        if (!cancelled) {
          setProfile(result);
        }
      } catch {
        if (!cancelled) {
          setError('Unable to load profile from GHM.');
          setProfile(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <section className="profile-page">
      <h2>Profile</h2>
      <p className="muted">Loaded from GET /api/v1/profile</p>
      {loading ? <p>Loading profile…</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      {profile && !loading ? (
        <dl className="profile-grid">
          <div>
            <dt>Account ID</dt>
            <dd>{profile.id}</dd>
          </div>
          <div>
            <dt>Full name</dt>
            <dd>{profile.fullName ?? '—'}</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd>{profile.phone ?? '—'}</dd>
          </div>
          <div>
            <dt>Role (from API response)</dt>
            <dd>{profile.role}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{profile.createdAt}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{profile.updatedAt}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
};
