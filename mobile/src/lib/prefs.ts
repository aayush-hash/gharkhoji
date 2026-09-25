import { create } from 'zustand';

import { loadSavedLanguage, setLanguage } from './i18n';
import { storage } from './storage';
import type { Language, Role } from './types';

type PrefsState = {
  ready: boolean;
  language: Language | null;
  onboarded: boolean; // has seen the intro slides
  intendedRole: Exclude<Role, 'admin'>; // picked on "How will you use GharKhoji?"
  load: () => Promise<void>;
  chooseLanguage: (lang: Language) => Promise<void>;
  finishOnboarding: () => Promise<void>;
  setIntendedRole: (role: Exclude<Role, 'admin'>) => void;
};

export const usePrefs = create<PrefsState>((set) => ({
  ready: false,
  language: null,
  onboarded: false,
  intendedRole: 'tenant',
  load: async () => {
    const [language, onboarded] = await Promise.all([loadSavedLanguage(), storage.get('onboarded')]);
    set({ language, onboarded: onboarded === '1', ready: true });
  },
  chooseLanguage: async (lang) => {
    await setLanguage(lang);
    set({ language: lang });
  },
  finishOnboarding: async () => {
    await storage.set('onboarded', '1');
    set({ onboarded: true });
  },
  setIntendedRole: (intendedRole) => set({ intendedRole }),
}));
