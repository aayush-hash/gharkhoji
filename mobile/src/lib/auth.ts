// Login state for the whole app (Zustand store).
// Tokens are kept in memory for speed and in SecureStore so login survives app restarts.
import { create } from 'zustand';

import { api, registerTokenHandlers } from './api';
import { unregisterPush } from './push';
import { storage } from './storage';
import type { LoginResponse, TokenPair, User } from './types';

type AuthState = {
  ready: boolean; // true once we've loaded saved tokens at startup
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  hydrate: () => Promise<void>;
  signIn: (res: LoginResponse) => Promise<void>;
  setTokens: (tokens: TokenPair) => Promise<void>;
  setUser: (user: User) => void;
  signOut: () => Promise<void>;
};

async function saveTokens(tokens: TokenPair) {
  await storage.set('accessToken', tokens.access_token);
  await storage.set('refreshToken', tokens.refresh_token);
}

export const useAuth = create<AuthState>((set, get) => ({
  ready: false,
  accessToken: null,
  refreshToken: null,
  user: null,

  hydrate: async () => {
    const [accessToken, refreshToken] = await Promise.all([storage.get('accessToken'), storage.get('refreshToken')]);
    set({ accessToken, refreshToken });
    if (refreshToken) {
      try {
        const user = await api<User>('/users/me');
        if (!user.has_password || !user.onboarding_completed) {
          // Signed in with the old code-only login: they must set a password first
          // ("Forgot password" on the login screen sends a code to do that).
          await get().signOut();
        } else {
          set({ user });
        }
      } catch {
        // Offline or session expired — the api() helper already cleared an expired session.
      }
    }
    set({ ready: true });
  },

  signIn: async (res) => {
    await saveTokens(res);
    await storage.set('lastPhone', res.user.phone.replace(/^\+977/, ''));
    set({ accessToken: res.access_token, refreshToken: res.refresh_token, user: res.user });
  },

  // After a password change the server gives this phone fresh tokens (others are logged out).
  setTokens: async (tokens) => {
    await saveTokens(tokens);
    set({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
  },

  setUser: (user) => set({ user }),

  signOut: async () => {
    await unregisterPush(); // needs the access token, so do it first
    const { refreshToken } = get();
    if (refreshToken) {
      api('/auth/logout', { method: 'POST', body: { refresh_token: refreshToken }, auth: false }).catch(() => {});
    }
    await Promise.all([storage.remove('accessToken'), storage.remove('refreshToken')]);
    set({ accessToken: null, refreshToken: null, user: null });
  },
}));

registerTokenHandlers({
  getAccessToken: () => useAuth.getState().accessToken,
  getRefreshToken: () => useAuth.getState().refreshToken,
  onTokensRefreshed: async (tokens) => {
    await saveTokens(tokens);
    useAuth.setState({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
  },
  onSessionExpired: async () => {
    await Promise.all([storage.remove('accessToken'), storage.remove('refreshToken')]);
    useAuth.setState({ accessToken: null, refreshToken: null, user: null });
  },
});
