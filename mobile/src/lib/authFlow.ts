// Temporary, in-memory state while someone signs up or resets a password.
// The verification ticket is never saved to disk and expires on the server after 15 minutes.
import { create } from 'zustand';

export type AuthMode = 'signup' | 'reset';

type FlowState = {
  phone: string; // 10 digits, e.g. 9812345678
  verificationToken: string | null;
  setPhone: (phone: string) => void;
  setVerified: (token: string) => void;
  clear: () => void;
};

export const useAuthFlow = create<FlowState>((set) => ({
  phone: '',
  verificationToken: null,
  setPhone: (phone) => set({ phone }),
  setVerified: (verificationToken) => set({ verificationToken }),
  clear: () => set({ phone: '', verificationToken: null }),
}));

export const prettyPhone = (p: string) => (p ? `+977 ${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}` : '');
