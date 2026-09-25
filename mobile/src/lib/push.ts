// Push notifications: "Is your room still available?"
//
// Honest note: remote push needs an EAS project id, and Expo Go has limits on push
// (especially on Android). Everything here fails quietly — the app still shows
// "needs confirmation" on the My listings tab, which works everywhere.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { api } from './api';
import { storage } from './storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPush(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null; // simulators can't receive push
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null; // run `npx eas-cli init` to enable push (see DAY4.md)

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await api('/notifications/push-token', {
      method: 'POST',
      body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android' },
    });
    await storage.set('pushToken', token);
    return token;
  } catch (err) {
    console.log('Push registration skipped:', err);
    return null;
  }
}

/** On logout: stop sending this account's notifications to this phone. */
export async function unregisterPush(): Promise<void> {
  const token = await storage.get('pushToken');
  if (!token) return;
  await api('/notifications/push-token', { method: 'DELETE', body: { token } }).catch(() => {});
  await storage.remove('pushToken');
}

/** Tapping a notification opens the right screen. */
export function listenForNotificationTaps(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as {
      type?: string;
      listing_id?: string;
      conversation_id?: string;
    };
    if (data?.type === 'confirm_availability' || data?.type === 'listing_expired') {
      router.push('/(tabs)/mine');
    } else if (data?.type === 'chat' && data.conversation_id) {
      router.push(`/chat/${data.conversation_id}`);
    }
  });
  return () => sub.remove();
}
