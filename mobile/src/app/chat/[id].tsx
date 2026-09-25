// One conversation: live messages, "typing…", Seen ticks, retry on failure, block & report.
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useChatAction, useConversation, useMarkRead, useMessages, useSendMessage } from '../../api/chat';
import {
  ActionSheet,
  ChatAvatar,
  ChatListingBar,
  Composer,
  DaySeparator,
  MessageBubble,
  QuickReplies,
  SafetyNote,
  type SheetAction,
  sameDay,
  TypingBubble,
} from '../../components/chat';
import { ErrorView, Icon, IconButton, Loading } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { chatSocket, TYPING_SHOW_MS, useOpenChat, useTyping } from '../../lib/chatSocket';
import { type ChatMessage, newClientId, type ReportReason } from '../../lib/chatTypes';
import { colors, font, radius, space } from '../../lib/theme';

const GROUP_MS = 5 * 60_000;
type Row = ChatMessage | { id: '__typing' };

export default function ChatScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useAuth((s) => s.user);
  const conv = useConversation(id);
  const msgs = useMessages(id);
  const send = useSendMessage(id);
  const markRead = useMarkRead(id);
  const actions = useChatAction(id);
  const setOpenChat = useOpenChat((s) => s.set);
  const typingAt = useTyping((s) => s.at[id] ?? 0);
  const [text, setText] = useState('');
  const [menu, setMenu] = useState<'none' | 'main' | 'report'>('none');
  const [, forceTick] = useState(0);

  // This chat is on screen → new messages count as read right away
  useFocusEffect(
    useCallback(() => {
      setOpenChat(id);
      return () => setOpenChat(null);
    }, [id, setOpenChat]),
  );

  const messages = useMemo(() => msgs.data?.pages.flatMap((p) => p.items) ?? [], [msgs.data]);
  const newestFromOther = messages.find((m) => m.sender_id !== me?.id);

  // Mark read whenever a new message from the other person is on screen
  const lastMarked = useRef<string | null>(null);
  useEffect(() => {
    if (!newestFromOther || lastMarked.current === newestFromOther.id) return;
    lastMarked.current = newestFromOther.id;
    markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestFromOther?.id]);

  // Re-render until the "typing…" indicator should disappear
  const typing = Date.now() - typingAt < TYPING_SHOW_MS;
  useEffect(() => {
    if (!typing) return;
    const timer = setTimeout(() => forceTick((n) => n + 1), TYPING_SHOW_MS - (Date.now() - typingAt) + 50);
    return () => clearTimeout(timer);
  }, [typing, typingAt]);

  if (conv.isLoading || msgs.isLoading) return <Loading />;
  if (conv.isError || !conv.data) return <ErrorView error={conv.error} onRetry={() => conv.refetch()} />;
  const c = conv.data;

  const submit = (body = text) => {
    const clean = body.trim();
    if (!clean) return;
    setText('');
    send.mutate({ body: clean, client_id: newClientId() });
  };

  const retry = (m: ChatMessage) => send.mutate({ body: m.body, client_id: m.client_id ?? newClientId() });

  const rows: Row[] = typing ? [{ id: '__typing' }, ...messages] : messages;
  const seenUpTo = c.other_last_read_at ? new Date(c.other_last_read_at).getTime() : 0;
  const iSentAny = messages.some((m) => m.sender_id === me?.id);
  const quickReplies =
    c.my_side === 'owner' && !iSentAny && !c.blocked
      ? (t('chat.quickOwner', { returnObjects: true }) as string[])
      : [];

  const status = typing
    ? { text: t('chat.typing'), color: colors.primary }
    : c.other.online
      ? { text: t('chat.activeNow'), color: colors.fresh }
      : {
          text: `${t(`roles.${c.other.role}`)}${c.other.phone_verified ? ` · ${t('listing.phoneVerified')}` : ''}`,
          color: colors.textMuted,
        };

  const confirmBlock = () =>
    Alert.alert(t('chat.blockTitle', { name: c.other.name ?? '' }), t('chat.blockText'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('chat.block'), style: 'destructive', onPress: () => actions.block.mutate() },
    ]);

  const mainActions: SheetAction[] = [
    ...(c.listing
      ? [{ label: t('chat.viewRoom'), icon: 'home-outline' as const, onPress: () => router.push(`/listing/${c.listing!.id}`) }]
      : []),
    c.blocked_by_me
      ? { label: t('chat.unblock'), icon: 'lock-open-outline' as const, onPress: () => actions.unblock.mutate() }
      : { label: t('chat.block'), icon: 'ban-outline' as const, onPress: confirmBlock, danger: true },
    { label: t('chat.report'), icon: 'flag-outline' as const, onPress: () => setTimeout(() => setMenu('report'), 350), danger: true },
  ];
  const reportActions: SheetAction[] = (['scam', 'harassment', 'fake_listing', 'spam', 'other'] as ReportReason[]).map(
    (reason) => ({
      label: t(`chat.reasons.${reason}`),
      icon: 'flag-outline' as const,
      onPress: () =>
        actions.report.mutate(
          { reason },
          { onSuccess: () => Alert.alert(t('chat.reportedTitle'), t('chat.reportedText')) },
        ),
    }),
  );

  const renderItem = ({ item, index }: { item: Row; index: number }) => {
    if (item.id === '__typing') return <TypingBubble />;
    const m = item as ChatMessage;
    const older = rows[index + 1] as ChatMessage | undefined;
    const newer = index > 0 ? (rows[index - 1] as Row) : undefined;
    const t0 = new Date(m.created_at).getTime();
    const olderIsMsg = older && older.id !== '__typing';
    const newerIsMsg = newer && newer.id !== '__typing';
    const groupedWithOlder = Boolean(
      olderIsMsg && older.sender_id === m.sender_id && sameDay(older.created_at, m.created_at) &&
        t0 - new Date(older.created_at).getTime() < GROUP_MS,
    );
    const nm = newer as ChatMessage | undefined;
    const groupedWithNewer = Boolean(
      newerIsMsg && nm && nm.sender_id === m.sender_id && sameDay(nm.created_at, m.created_at) &&
        new Date(nm.created_at).getTime() - t0 < GROUP_MS,
    );
    const newDay = !olderIsMsg || !sameDay(older.created_at, m.created_at);
    return (
      <View>
        {newDay ? <DaySeparator iso={m.created_at} /> : null}
        <MessageBubble
          m={m}
          mine={m.sender_id === me?.id}
          groupedWithOlder={groupedWithOlder && !newDay}
          groupedWithNewer={groupedWithNewer}
          seen={!m.pending && !m.failed && new Date(m.created_at).getTime() <= seenUpTo}
          onRetry={() => retry(m)}
        />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.headerRow}>
          <IconButton name="chevron-back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/chats'))} bg="transparent" />
          <ChatAvatar id={c.other.id} name={c.other.name} size={40} online={c.other.online} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name} numberOfLines={1}>
              {c.other.name ?? t('chat.someone')}
            </Text>
            <Text style={[styles.status, { color: status.color }]} numberOfLines={1}>
              {status.text}
            </Text>
          </View>
          <IconButton name="ellipsis-vertical" onPress={() => setMenu('main')} bg="transparent" accessibilityLabel="Menu" />
        </View>
        <ChatListingBar
          listing={c.listing}
          title={c.listing_title}
          onPress={() => c.listing && router.push(`/listing/${c.listing.id}`)}
        />
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          inverted
          data={rows}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onEndReached={() => msgs.hasNextPage && !msgs.isFetchingNextPage && msgs.fetchNextPage()}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            msgs.hasNextPage ? (
              <ActivityIndicator style={{ margin: space.lg }} color={colors.primary} />
            ) : (
              <SafetyNote />
            )
          }
        />

        {c.blocked ? (
          <SafeAreaView edges={['bottom']} style={styles.blocked}>
            <Icon name="ban" size={18} color={colors.textMuted} />
            <Text style={styles.blockedText}>{c.blocked_by_me ? t('chat.blockedByMe') : t('chat.blockedByOther')}</Text>
            {c.blocked_by_me ? (
              <Pressable onPress={() => actions.unblock.mutate()} hitSlop={8}>
                <Text style={styles.unblock}>{t('chat.unblock')}</Text>
              </Pressable>
            ) : null}
          </SafeAreaView>
        ) : (
          <>
            {quickReplies.length ? <QuickReplies items={quickReplies} onPick={setText} /> : null}
            <Composer
              value={text}
              onChange={(v) => {
                setText(v);
                if (v.trim()) chatSocket.sendTyping(id);
              }}
              onSend={() => submit()}
              placeholder={t('chat.placeholder')}
            />
          </>
        )}
      </KeyboardAvoidingView>

      <ActionSheet visible={menu === 'main'} actions={mainActions} onClose={() => setMenu('none')} />
      <ActionSheet
        visible={menu === 'report'}
        title={t('chat.reportTitle')}
        actions={reportActions}
        onClose={() => setMenu('none')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.card,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, paddingTop: space.xs },
  name: { ...font.h3, color: colors.text },
  status: { ...font.small, marginTop: 1 },
  list: { paddingHorizontal: space.lg, paddingBottom: space.md },
  blocked: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    padding: space.lg,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  blockedText: { ...font.small, color: colors.textSecondary, flexShrink: 1 },
  unblock: { ...font.smallStrong, color: colors.primary, marginLeft: space.xs, borderRadius: radius.pill },
});
