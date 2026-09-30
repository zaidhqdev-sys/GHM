export interface AccountProfile {
  readonly id: number;
  readonly fullName: string | null;
  readonly phone: string | null;
  readonly avatarRef: string | null;
  readonly role: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProfileClient {
  getOwnProfile(): Promise<AccountProfile>;
}

export const createProfileClient = (
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
): ProfileClient => ({
  async getOwnProfile(): Promise<AccountProfile> {
    const response = await apiFetch('/api/v1/profile', { method: 'GET' });
    if (!response.ok) {
      let code = 'request_failed';
      try {
        const body = (await response.json()) as { error?: unknown };
        if (typeof body.error === 'string') code = body.error;
      } catch {
        // ignore
      }
      throw new Error(`Profile request failed (${response.status}): ${code}`);
    }
    const body = (await response.json()) as { profile?: AccountProfile };
    if (!body.profile || typeof body.profile.id !== 'number') {
      throw new Error('Profile response was invalid');
    }
    return body.profile;
  },
});
