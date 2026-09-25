import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useUnreadChats } from '../../api/chat';
import { useMyListings } from '../../api/hooks';
import { TabBar } from '../../components/TabBar';
import { useAuth } from '../../lib/auth';

export default function TabsLayout() {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const isOwner = Boolean(user && user.role !== 'tenant');
  const mine = useMyListings(isOwner);
  const attention = (mine.data ?? []).filter((l) => l.needs_confirmation).length;
  const unread = useUnreadChats().data?.unread_conversations ?? 0;

  // Seekers & guests: Explore · Map · Saved · Chats · Profile
  // Owners/agents:    Explore · Chats · [+] · My listings · Profile
  const visible = isOwner ? ['index', 'chats', 'mine', 'profile'] : ['index', 'map', 'saved', 'chats', 'profile'];

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} visible={visible} showPost={isOwner} badges={{ mine: attention, chats: unread }} />}>
      <Tabs.Screen name="index" options={{ title: t('tabs.explore') }} />
      <Tabs.Screen name="map" options={{ title: t('tabs.map') }} />
      <Tabs.Screen name="saved" options={{ title: t('tabs.saved') }} />
      <Tabs.Screen name="chats" options={{ title: t('tabs.chats') }} />
      <Tabs.Screen name="mine" options={{ title: t('tabs.mine') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
