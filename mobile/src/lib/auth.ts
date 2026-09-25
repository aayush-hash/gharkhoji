// Login state for the whole app (Zustand store).
// Tokens are kept in memory for speed and in SecureStore so login survives app restarts.
import { create } from 'zustand';

import { api, registerTokenHandlers } from './api';
import { storage } from './storage';
import type { LoginResponse, TokenPair, User } from './types';

type AuthState = {
  ready: boolean; // true once we've loaded saved tokens at startup
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  hydrate: () => Promise<void>;
  signIn: (res: LoginResponse) => Promise<void>;
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
        set({ user });
      } catch {
        // Offline or session expired — the api() helper already cleared an expired session.
      }
    }
    set({ ready: true });
  },

  signIn: async (res) => {
    await saveTokens(res);
    set({ accessToken: res.access_token, refreshToken: res.refresh_token, user: res.user });
  },

  setUser: (user) => set({ user }),

  signOut: async () => {
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
