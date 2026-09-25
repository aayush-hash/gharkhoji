import { create } from 'zustand';

import { loadSavedLanguage, setLanguage } from './i18n';
import type { Language } from './types';

type PrefsState = {
  ready: boolean;
  language: Language | null; // null = first launch, show the language screen
  load: () => Promise<void>;
  chooseLanguage: (lang: Language) => Promise<void>;
};

export const usePrefs = create<PrefsState>((set) => ({
  ready: false,
  language: null,
  load: async () => set({ language: await loadSavedLanguage(), ready: true }),
  chooseLanguage: async (lang) => {
    await setLanguage(lang);
    set({ language: lang });
  },
}));
