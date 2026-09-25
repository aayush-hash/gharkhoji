import '../lib/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BootSplash } from '../components/BootSplash';
import { useAuth } from '../lib/auth';
import { useChatRealtime } from '../lib/chatSocket';
import { usePrefs } from '../lib/prefs';
import { listenForNotificationTaps, registerForPush } from '../lib/push';
import { colors } from '../lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

/** Keeps the live chat connection open on every screen while logged in. */
function ChatRealtime() {
  useChatRealtime();
  return null;
}

export default function RootLayout() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } }),
  );
  const authReady = useAuth((s) => s.ready);
  const prefsReady = usePrefs((s) => s.ready);
  const userId = useAuth((s) => s.user?.id);
  const { t } = useTranslation();
  const ready = authReady && prefsReady;

  useEffect(() => {
    usePrefs.getState().load();
    useAuth.getState().hydrate();
    // Swap the static native splash for our animated one as soon as JS is running
    SplashScreen.hideAsync().catch(() => {});
    return listenForNotificationTaps();
  }, []);

  useEffect(() => {
    if (userId) registerForPush();
  }, [userId]);

  return (
    <QueryClientProvider client={queryClient}>
      <ChatRealtime />
      <StatusBar style="dark" />
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        {ready ? (
          <Stack
            screenOptions={{
              headerTintColor: colors.text,
              headerTitleStyle: { color: colors.text, fontWeight: '700' },
              headerShadowVisible: false,
              headerStyle: { backgroundColor: colors.bg },
              contentStyle: { backgroundColor: colors.bg },
              headerBackButtonDisplayMode: 'minimal',
            }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="welcome" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="auth/login" options={{ title: '' }} />
            <Stack.Screen name="auth/role" options={{ title: '' }} />
            <Stack.Screen name="auth/phone" options={{ title: '' }} />
            <Stack.Screen name="auth/verify" options={{ title: '' }} />
            <Stack.Screen name="auth/profile" options={{ title: '', headerBackVisible: false, gestureEnabled: false }} />
            <Stack.Screen name="auth/new-password" options={{ title: '', headerBackVisible: false, gestureEnabled: false }} />
            <Stack.Screen name="auth/change-password" options={{ title: t('changePassword.title') }} />
            <Stack.Screen name="search" options={{ headerShown: false }} />
            <Stack.Screen name="listing/[id]/index" options={{ headerShown: false }} />
            <Stack.Screen name="listing/[id]/edit" options={{ title: t('post.editTitle') }} />
            <Stack.Screen name="listing/[id]/photos" options={{ title: t('photos.screenTitle') }} />
            <Stack.Screen name="post" options={{ title: t('post.newTitle') }} />
            <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="chat/start/[listingId]" options={{ headerShown: false }} />
          </Stack>
        ) : null}
        <BootSplash ready={ready} />
      </View>
    </QueryClientProvider>
  );
}
