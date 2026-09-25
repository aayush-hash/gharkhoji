// "Chat with owner" from a room page. If you already have a chat about this room it opens
// that one; otherwise you write the first message (with one-tap suggestions).
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useConversationForListing, useStartChat } from '../../../api/chat';
import { useListing } from '../../../api/hooks';
import { ChatListingBar, Composer, QuickReplies, SafetyNote } from '../../../components/chat';
import { EmptyState, ErrorView, IconButton, Loading, useErrorText } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import { colors, font, space } from '../../../lib/theme';

export default function StartChat() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const { listingId } = useLocalSearchParams<{ listingId: string }>();
  const user = useAuth((s) => s.user);
  const listing = useListing(listingId);
  const existing = useConversationForListing(listingId);
  const start = useStartChat();
  const [text, setText] = useState(() => t('chat.firstMessage'));

  // Already chatting about this room → go straight to that chat
  useEffect(() => {
    if (existing.data) router.replace(`/chat/${existing.data.id}`);
  }, [existing.data]);

  if (!user) {
    return (
      <EmptyState
        icon="chatbubbles-outline"
        title={t('chat.loginTitle')}
        text={t('chat.loginText')}
        action={t('profile.login')}
        onAction={() => router.replace('/auth/login')}
      />
    );
  }
  if (listing.isLoading || existing.isLoading || existing.data) return <Loading />;
  if (listing.isError || !listing.data) return <ErrorView error={listing.error} onRetry={() => listing.refetch()} />;

  const l = listing.data;
  const who = l.listed_by.name ?? t(`roles.${l.listed_by.role}`);
  const send = () => {
    const body = text.trim();
    if (!body) return;
    start.mutate(
      { listing_id: l.id, body },
      { onSuccess: (conv) => router.replace(`/chat/${conv.id}`) },
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.headerRow}>
          <IconButton name="chevron-back" onPress={() => router.back()} bg="transparent" />
          <Text style={styles.headerTitle} numberOfLines={1}>
            {t('chat.startTitle', { name: who })}
          </Text>
        </View>
        <ChatListingBar
          listing={{
            id: l.id,
            title: l.title,
            area: l.area,
            total_monthly_cost: l.cost.total_monthly,
            cover_photo_url: l.photos[0]?.url ?? null,
            status: l.status,
          }}
          title={l.title}
          onPress={() => router.back()}
        />
      </SafeAreaView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.hello}>{t('chat.startHello', { name: who })}</Text>
          <Text style={styles.hint}>{t('chat.startHint')}</Text>
          <SafetyNote />
          {start.isError ? <Text style={styles.error}>{errorText(start.error)}</Text> : null}
        </ScrollView>
        <Text style={styles.suggest}>{t('chat.suggestions')}</Text>
        <QuickReplies items={t('chat.quickTenant', { returnObjects: true }) as string[]} onPick={setText} />
        <Composer
          value={text}
          onChange={setText}
          onSend={send}
          placeholder={t('chat.placeholder')}
          autoFocus
        />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.card, paddingBottom: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, paddingTop: space.xs },
  headerTitle: { ...font.h3, color: colors.text, flex: 1 },
  body: { padding: space.lg },
  hello: { ...font.h2, color: colors.text },
  hint: { ...font.body, color: colors.textSecondary, marginTop: space.xs, lineHeight: 22 },
  error: { color: colors.danger, marginTop: space.md, ...font.small },
  suggest: { ...font.tiny, color: colors.textMuted, textTransform: 'uppercase', paddingHorizontal: space.lg },
});
