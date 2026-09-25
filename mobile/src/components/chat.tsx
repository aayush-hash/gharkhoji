// Building blocks for chat screens: avatars, inbox rows, bubbles, typing dots, menus.
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { TFunction } from 'i18next';
import { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import type { ChatMessage, Conversation } from '../lib/chatTypes';
import { formatRs } from '../lib/format';
import { colors, font, gradients, radius, shadow, space } from '../lib/theme';
import { type IconName, tap } from './ui';

// ---------------------------------------------------------------- time labels

const pad = (n: number) => String(n).padStart(2, '0');
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "2:34 PM" */
export function clock(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  return `${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}

function daysAgo(iso: string): number {
  return Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86_400_000);
}

function shortDate(iso: string, t: TFunction): string {
  const d = new Date(iso);
  const months = t('chat.months', { returnObjects: true }) as string[];
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${months[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
}

/** Inbox: "2:34 PM" today, "Yesterday", "Mon" this week, else "12 Sep". */
export function inboxTime(iso: string | null, t: TFunction): string {
  if (!iso) return '';
  const ago = daysAgo(iso);
  if (ago <= 0) return clock(iso);
  if (ago === 1) return t('chat.yesterday');
  if (ago < 7) return (t('chat.weekdays', { returnObjects: true }) as string[])[new Date(iso).getDay()];
  return shortDate(iso, t);
}

/** Separator between days in a conversation. */
export function dayLabel(iso: string, t: TFunction): string {
  const ago = daysAgo(iso);
  if (ago <= 0) return t('chat.today');
  if (ago === 1) return t('chat.yesterday');
  const wd = (t('chat.weekdays', { returnObjects: true }) as string[])[new Date(iso).getDay()];
  return ago < 7 ? wd : `${wd}, ${shortDate(iso, t)}`;
}

export const sameDay = (a: string, b: string) => startOfDay(new Date(a)) === startOfDay(new Date(b));

// ---------------------------------------------------------------- avatar

const AVATAR_COLORS = ['#0B7A68', '#E8590C', '#3558C4', '#9C36B5', '#C2255C', '#2B8A3E', '#E67700', '#1971C2'];

export function ChatAvatar({
  id,
  name,
  size = 48,
  online,
}: {
  id: string;
  name: string | null;
  size?: number;
  online?: boolean;
}) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const bg = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  const initials = (name ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  const dot = Math.max(10, size * 0.26);
  return (
    <View style={{ width: size, height: size }}>
      <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.38 }}>{initials || '?'}</Text>
      </View>
      {online ? (
        <View
          style={[styles.onlineDot, { width: dot, height: dot, borderRadius: dot / 2, right: -1, bottom: -1 }]}
        />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- inbox row

export function ConversationRow({ c, onPress }: { c: Conversation; onPress: () => void }) {
  const { t } = useTranslation();
  const unread = c.unread_count > 0;
  const roleColor = c.other.role === 'agent' ? colors.agent : c.other.role === 'tenant' ? colors.stale : colors.owner;
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.bg }]}>
      <ChatAvatar id={c.other.id} name={c.other.name} online={c.other.online} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.rowTop}>
          <Text style={[styles.rowName, unread && { fontWeight: '800' }]} numberOfLines={1}>
            {c.other.name ?? t('chat.someone')}
          </Text>
          <Text style={[styles.rowRole, { color: roleColor }]}>{t(`roles.${c.other.role}`)}</Text>
          <Text style={[styles.rowTime, unread && { color: colors.primary, fontWeight: '700' }]}>
            {inboxTime(c.last_message_at, t)}
          </Text>
        </View>
        <View style={styles.rowListing}>
          <Ionicons name="home" size={12} color={colors.textMuted} />
          <Text style={styles.rowListingText} numberOfLines={1}>
            {c.listing?.title ?? c.listing_title}
          </Text>
        </View>
        <View style={styles.rowBottom}>
          {c.blocked ? <Ionicons name="ban" size={14} color={colors.textMuted} /> : null}
          <Text style={[styles.rowPreview, unread && styles.rowPreviewUnread]} numberOfLines={1}>
            {c.last_message_mine ? `${t('chat.you')}: ` : ''}
            {c.last_message_preview}
          </Text>
          {unread ? (
            <View style={styles.unreadPill}>
              <Text style={styles.unreadText}>{c.unread_count > 99 ? '99+' : c.unread_count}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------- the room this chat is about

export function ChatListingBar({
  listing: l,
  title,
  onPress,
}: {
  listing: Conversation['listing'];
  title: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const unavailable = !l || l.status !== 'active';
  return (
    <Pressable onPress={l ? onPress : undefined} style={({ pressed }) => [styles.listingBar, pressed && { opacity: 0.85 }]}>
      {l?.cover_photo_url ? (
        <Image source={{ uri: l.cover_photo_url }} style={styles.listingThumb} contentFit="cover" />
      ) : (
        <View style={[styles.listingThumb, styles.center, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="home" size={18} color={colors.primary} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.listingTitle} numberOfLines={1}>
          {l?.title ?? title}
        </Text>
        {unavailable ? (
          <Text style={[styles.listingSub, { color: colors.danger }]}>
            {l ? t('chat.noLongerAvailable') : t('chat.roomDeleted')}
          </Text>
        ) : (
          <Text style={styles.listingSub} numberOfLines={1}>
            <Text style={styles.listingPrice}>{formatRs(l.total_monthly_cost)}</Text>
            {t('listing.perMonth')} · {l.area}
          </Text>
        )}
      </View>
      {l ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

// ---------------------------------------------------------------- messages

export function DaySeparator({ iso }: { iso: string }) {
  const { t } = useTranslation();
  return (
    <View style={styles.dayWrap}>
      <Text style={styles.dayText}>{dayLabel(iso, t)}</Text>
    </View>
  );
}

export function MessageBubble({
  m,
  mine,
  groupedWithOlder,
  groupedWithNewer,
  seen,
  onRetry,
}: {
  m: ChatMessage;
  mine: boolean;
  groupedWithOlder: boolean;
  groupedWithNewer: boolean;
  seen: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const showMeta = !groupedWithNewer || m.pending || m.failed;
  const status: { icon: IconName; color: string } | null = !mine
    ? null
    : m.failed
      ? { icon: 'alert-circle', color: colors.danger }
      : m.pending
        ? { icon: 'time-outline', color: colors.textMuted }
        : seen
          ? { icon: 'checkmark-done', color: colors.primary }
          : { icon: 'checkmark', color: colors.textMuted };

  return (
    <View style={[styles.msgWrap, mine ? styles.msgMine : styles.msgTheirs, { marginTop: groupedWithOlder ? 2 : 10 }]}>
      <Pressable
        disabled={!m.failed}
        onPress={onRetry}
        style={[
          styles.bubble,
          mine ? styles.bubbleMine : [styles.bubbleTheirs, shadow(1)],
          mine && groupedWithNewer && { borderBottomRightRadius: 6 },
          mine && groupedWithOlder && { borderTopRightRadius: 6 },
          !mine && groupedWithNewer && { borderBottomLeftRadius: 6 },
          !mine && groupedWithOlder && { borderTopLeftRadius: 6 },
          m.failed && { opacity: 0.6 },
        ]}>
        <Text style={[styles.bubbleText, mine && { color: '#fff' }]} selectable>
          {m.body}
        </Text>
      </Pressable>
      {!mine && m.flagged ? (
        <View style={styles.warning}>
          <Ionicons name="warning" size={14} color={colors.ok} />
          <Text style={styles.warningText}>{t('chat.paymentWarning')}</Text>
        </View>
      ) : null}
      {showMeta ? (
        <Pressable disabled={!m.failed} onPress={onRetry} style={styles.meta}>
          {m.failed ? (
            <Text style={[styles.metaText, { color: colors.danger }]}>{t('chat.notSent')}</Text>
          ) : (
            <Text style={styles.metaText}>
              {clock(m.created_at)}
              {mine && seen && !groupedWithNewer ? ` · ${t('chat.seen')}` : ''}
            </Text>
          )}
          {status ? <Ionicons name={status.icon} size={14} color={status.color} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

export function TypingBubble() {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    const anims = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(d, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(d, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay((2 - i) * 150),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [dots]);
  return (
    <View style={[styles.msgWrap, styles.msgTheirs, { marginTop: 10 }]}>
      <View style={[styles.bubble, styles.bubbleTheirs, shadow(1), styles.typing]}>
        {dots.map((d, i) => (
          <Animated.View
            key={i}
            style={[
              styles.typingDot,
              { transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] },
              { opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

export function SafetyNote() {
  const { t } = useTranslation();
  return (
    <View style={styles.safety}>
      <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
      <Text style={styles.safetyText}>{t('chat.safety')}</Text>
    </View>
  );
}

/** Tap-to-fill suggestions (the user can still edit before sending). */
export function QuickReplies({ items, onPick }: { items: string[]; onPick: (text: string) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      style={{ flexGrow: 0 }}
      contentContainerStyle={styles.quickRow}>
      {items.map((q) => (
        <Pressable
          key={q}
          onPress={() => {
            tap();
            onPick(q);
          }}
          style={({ pressed }) => [styles.quick, pressed && { backgroundColor: colors.primaryTint }]}>
          <Text style={styles.quickText}>{q}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

// ---------------------------------------------------------------- message box

export const MAX_MESSAGE = 2000;

export function Composer({
  value,
  onChange,
  onSend,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const canSend = value.trim().length > 0;
  const left = MAX_MESSAGE - value.length;
  return (
    <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
      <View style={styles.inputWrap}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={MAX_MESSAGE}
          autoFocus={autoFocus}
          style={styles.input}
          textAlignVertical="center"
        />
        {left < 200 ? <Text style={styles.counter}>{left}</Text> : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send"
        disabled={!canSend}
        onPress={() => {
          tap();
          onSend();
        }}
        style={({ pressed }) => [styles.sendBtn, pressed && { transform: [{ scale: 0.92 }] }]}>
        {canSend ? (
          <LinearGradient colors={gradients.brand} style={styles.sendInner}>
            <Ionicons name="arrow-up" size={22} color="#fff" />
          </LinearGradient>
        ) : (
          <View style={[styles.sendInner, { backgroundColor: colors.border }]}>
            <Ionicons name="arrow-up" size={22} color={colors.textMuted} />
          </View>
        )}
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------- bottom sheet menu (works the same on iOS and Android)

export type SheetAction = { label: string; icon: IconName; onPress: () => void; danger?: boolean };

export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.lg) }]} onPress={() => {}}>
          <View style={styles.sheetHandle} />
          {title ? <Text style={styles.sheetTitle}>{title}</Text> : null}
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={() => {
                tap();
                onClose();
                a.onPress();
              }}
              style={({ pressed }) => [styles.sheetRow, pressed && { backgroundColor: colors.bg }]}>
              <Ionicons name={a.icon} size={22} color={a.danger ? colors.danger : colors.text} />
              <Text style={[styles.sheetLabel, a.danger && { color: colors.danger }]}>{a.label}</Text>
            </Pressable>
          ))}
          <Pressable onPress={onClose} style={styles.sheetCancel}>
            <Text style={styles.sheetCancelText}>{t('common.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  onlineDot: { position: 'absolute', backgroundColor: colors.fresh, borderWidth: 2, borderColor: colors.card },

  row: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, alignItems: 'center' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowName: { ...font.bodyStrong, color: colors.text, flexShrink: 1 },
  rowRole: { ...font.tiny, textTransform: 'uppercase' },
  rowTime: { ...font.small, color: colors.textMuted, marginLeft: 'auto' },
  rowListing: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  rowListingText: { ...font.small, color: colors.textMuted, flex: 1 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  rowPreview: { ...font.body, color: colors.textSecondary, flex: 1 },
  rowPreviewUnread: { color: colors.text, fontWeight: '600' },
  unreadPill: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  listingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: space.lg,
    marginTop: space.sm,
    padding: space.sm,
    paddingRight: space.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listingThumb: { width: 46, height: 46, borderRadius: radius.md },
  listingTitle: { ...font.smallStrong, color: colors.text },
  listingSub: { ...font.small, color: colors.textMuted, marginTop: 2 },
  listingPrice: { fontWeight: '800', color: colors.primaryDark },

  dayWrap: { alignItems: 'center', marginTop: space.lg, marginBottom: space.xs },
  dayText: {
    ...font.tiny,
    color: colors.textSecondary,
    backgroundColor: colors.card,
    paddingHorizontal: space.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    overflow: 'hidden',
    ...shadow(1),
  },
  msgWrap: { maxWidth: '80%' },
  msgMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  msgTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20 },
  bubbleMine: { backgroundColor: colors.primary },
  bubbleTheirs: { backgroundColor: colors.card },
  bubbleText: { fontSize: 16, lineHeight: 22, color: colors.text },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, paddingHorizontal: 4 },
  metaText: { fontSize: 11, color: colors.textMuted, fontWeight: '500' },
  warning: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'flex-start',
    backgroundColor: colors.okBg,
    padding: space.sm,
    borderRadius: radius.md,
    marginTop: 4,
  },
  warningText: { ...font.small, color: colors.text, flexShrink: 1, lineHeight: 18 },
  typing: { flexDirection: 'row', gap: 5, paddingVertical: 14 },
  typingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.textMuted },

  safety: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.lg,
    padding: space.md,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  safetyText: { ...font.small, color: colors.primaryDeep, flex: 1, lineHeight: 19 },

  quickRow: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  quick: {
    borderWidth: 1,
    borderColor: colors.primaryTint,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  quickText: { ...font.smallStrong, color: colors.primaryDark },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  inputWrap: {
    flex: 1,
    minHeight: 44,
    maxHeight: 130,
    backgroundColor: colors.bg,
    borderRadius: 22,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
  },
  input: { fontSize: 16, color: colors.text, paddingTop: 11, paddingBottom: 11, maxHeight: 128 },
  counter: { position: 'absolute', right: 12, top: 4, fontSize: 10, color: colors.textMuted },
  sendBtn: { width: 44, height: 44, marginBottom: 0 },
  sendInner: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },

  sheetBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: space.sm,
    paddingHorizontal: space.md,
  },
  sheetHandle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: space.sm },
  sheetTitle: { ...font.h3, color: colors.text, paddingHorizontal: space.md, paddingVertical: space.sm },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md },
  sheetLabel: { ...font.bodyStrong, color: colors.text },
  sheetCancel: { alignItems: 'center', padding: space.md, marginTop: space.xs },
  sheetCancelText: { ...font.bodyStrong, color: colors.textSecondary },
});
