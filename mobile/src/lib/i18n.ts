// English + Nepali translations. Add new text to BOTH src/i18n/en.json and ne.json.
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '../i18n/en.json';
import ne from '../i18n/ne.json';
import { storage } from './storage';
import type { Language } from './types';

const deviceLanguage: Language = getLocales()[0]?.languageCode === 'ne' ? 'ne' : 'en';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ne: { translation: ne } },
  lng: deviceLanguage,
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes text
});

/** Returns the saved language, or null if the user hasn't chosen one yet (first launch). */
export async function loadSavedLanguage(): Promise<Language | null> {
  const saved = await storage.get('language');
  if (saved === 'en' || saved === 'ne') {
    await i18n.changeLanguage(saved);
    return saved;
  }
  return null;
}

export async function setLanguage(lang: Language) {
  await storage.set('language', lang);
  await i18n.changeLanguage(lang);
}

export default i18n;
