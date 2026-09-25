import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useMyListings } from '../../api/hooks';
import { useAuth } from '../../lib/auth';
import { colors } from '../../lib/theme';

const icon = (emoji: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;
  };

export default function TabsLayout() {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  // Tenants don't post, so they don't need this tab. Guests see it (it invites them to log in).
  const canPost = !user || user.role !== 'tenant';
  const mine = useMyListings(Boolean(user) && canPost);
  const attention = (mine.data ?? []).filter((l) => l.needs_confirmation).length;

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.primary, headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: icon('🏠') }} />
      <Tabs.Screen name="map" options={{ title: t('tabs.map'), tabBarIcon: icon('🗺️') }} />
      <Tabs.Screen
        name="mine"
        options={{
          title: t('tabs.mine'),
          tabBarIcon: icon('📋'),
          href: canPost ? undefined : null,
          tabBarBadge: attention > 0 ? attention : undefined,
        }}
      />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile'), tabBarIcon: icon('👤') }} />
    </Tabs>
  );
}
