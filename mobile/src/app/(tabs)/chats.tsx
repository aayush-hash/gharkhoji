// Inbox: every chat, newest first. Live updates arrive through the chat connection.
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useConversations } from '../../api/chat';
import { ConversationRow } from '../../components/chat';
import { Chip, EmptyState, ErrorView, Skeleton } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { colors, font, space } from '../../lib/theme';

export default function ChatsScreen() {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const chats = useConversations();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <EmptyState
          icon="chatbubbles-outline"
          title={t('chat.loginTitle')}
          text={t('chat.loginText')}
          action={t('profile.login')}
          onAction={() => router.push('/auth/login')}
        />
      </SafeAreaView>
    );
  }

  const all = chats.data ?? [];
  const unreadCount = all.filter((c) => c.unread_count > 0).length;
  const shown = filter === 'unread' ? all.filter((c) => c.unread_count > 0) : all;
  const isOwner = user.role !== 'tenant';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('chat.title')}</Text>
        <Text style={styles.subtitle}>{t('chat.subtitle')}</Text>
        <View style={styles.filters}>
          <Chip label={t('chat.all')} selected={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip
            label={unreadCount ? `${t('chat.unread')} (${unreadCount})` : t('chat.unread')}
            selected={filter === 'unread'}
            onPress={() => setFilter('unread')}
          />
        </View>
      </View>

      {chats.isLoading ? (
        <View style={{ padding: space.lg, gap: space.lg }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
              <Skeleton width={48} height={48} radius={24} />
              <View style={{ flex: 1, gap: 8 }}>
                <Skeleton width="55%" height={14} />
                <Skeleton width="85%" height={12} />
              </View>
            </View>
          ))}
        </View>
      ) : chats.isError && !chats.data ? (
        <ErrorView error={chats.error} onRetry={() => chats.refetch()} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => <ConversationRow c={item} onPress={() => router.push(`/chat/${item.id}`)} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl refreshing={chats.isRefetching} onRefresh={() => chats.refetch()} tintColor={colors.primary} />
          }
          contentContainerStyle={shown.length === 0 ? { flexGrow: 1 } : { paddingBottom: 120 }}
          ListEmptyComponent={
            filter === 'unread' ? (
              <EmptyState icon="checkmark-done-circle-outline" title={t('chat.allRead')} />
            ) : (
              <EmptyState
                icon="chatbubbles-outline"
                title={isOwner ? t('chat.emptyOwnerTitle') : t('chat.emptyTenantTitle')}
                text={isOwner ? t('chat.emptyOwnerText') : t('chat.emptyTenantText')}
                action={isOwner ? undefined : t('chat.findRooms')}
                onAction={isOwner ? undefined : () => router.push('/search')}
              />
            )
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  header: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.sm },
  title: { ...font.h1, color: colors.text },
  subtitle: { ...font.small, color: colors.textMuted, marginTop: 2 },
  filters: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  separator: { height: 1, backgroundColor: colors.border, marginLeft: 76 },
});
