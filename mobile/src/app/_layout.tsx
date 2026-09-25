import '../lib/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Loading } from '../components/ui';
import { useAuth } from '../lib/auth';
import { usePrefs } from '../lib/prefs';
import { colors } from '../lib/theme';

export default function RootLayout() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } }),
  );
  const authReady = useAuth((s) => s.ready);
  const prefsReady = usePrefs((s) => s.ready);
  const { t } = useTranslation();

  useEffect(() => {
    usePrefs.getState().load();
    useAuth.getState().hydrate();
  }, []);

  if (!authReady || !prefsReady) return <Loading />;

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: colors.bg },
          headerBackButtonDisplayMode: 'minimal',
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="search" options={{ title: t('search.title') }} />
        <Stack.Screen name="listing/[id]" options={{ title: '' }} />
        <Stack.Screen name="login" options={{ title: '', presentation: 'modal' }} />
        <Stack.Screen name="verify" options={{ title: '' }} />
        <Stack.Screen name="onboarding" options={{ title: '', headerBackVisible: false, gestureEnabled: false }} />
      </Stack>
    </QueryClientProvider>
  );
}
