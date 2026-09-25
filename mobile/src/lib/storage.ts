// Small wrapper around expo-secure-store (encrypted storage on the phone).
// Tokens must never go in plain AsyncStorage.
import * as SecureStore from 'expo-secure-store';

const KEYS = {
  accessToken: 'gk.access_token',
  refreshToken: 'gk.refresh_token',
  language: 'gk.language',
  pushToken: 'gk.push_token',
} as const;

type Key = keyof typeof KEYS;

export const storage = {
  get: (key: Key) => SecureStore.getItemAsync(KEYS[key]),
  set: (key: Key, value: string) => SecureStore.setItemAsync(KEYS[key], value),
  remove: (key: Key) => SecureStore.deleteItemAsync(KEYS[key]),
};
