import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { type ListingAction, useDeleteListing, useListingAction, useMyListings } from '../../api/hooks';
import { FreshnessBadge } from '../../components/badges';
import { Badge, Button, ErrorView, Loading, useErrorText } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { formatRs } from '../../lib/format';
import { colors, radius, space } from '../../lib/theme';
import type { ListingCard, ListingStatus } from '../../lib/types';

const STATUS_STYLE: Record<ListingStatus, { color: string; bg: string }> = {
  draft: { color: colors.stale, bg: colors.staleBg },
  active: { color: colors.fresh, bg: colors.freshBg },
  rented: { color: colors.primaryDark, bg: colors.primarySoft },
  expired: { color: colors.danger, bg: '#FEE2E2' },
  removed: { color: colors.stale, bg: colors.staleBg },
};

export default function MyListings() {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const query = useMyListings(Boolean(user));

  if (!user) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.emptyTitle}>🏠 {t('mine.loginTitle')}</Text>
        <Button title={t('profile.login')} onPress={() => router.push('/login')} style={{ alignSelf: 'stretch' }} />
      </SafeAreaView>
    );
  }

  const needAttention = (query.data ?? []).filter((l) => l.needs_confirmation).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('mine.title')}</Text>
        <Button title={`+ ${t('mine.post')}`} onPress={() => router.push('/post')} style={styles.postBtn} />
      </View>

      {needAttention > 0 ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>⏰ {t('mine.needAttention', { count: needAttention })}</Text>
        </View>
      ) : null}

      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorView error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <FlatList
          data={query.data}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <MyListingRow item={item} />}
          contentContainerStyle={{ padding: space.lg }}
          refreshing={query.isRefetching}
          onRefresh={() => query.refetch()}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{t('mine.empty')}</Text>
              <Text style={styles.muted}>{t('mine.emptyHint')}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function MyListingRow({ item }: { item: ListingCard }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const action = useListingAction();
  const remove = useDeleteListing();
  const status = STATUS_STYLE[item.status];

  const run = (a: ListingAction) =>
    action.mutate({ id: item.id, action: a }, { onError: (e) => Alert.alert(errorText(e)) });

  const askRented = () =>
    Alert.alert(t('mine.rentedTitle'), t('mine.rentedText'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('mine.rented'), onPress: () => run('mark-rented') },
    ]);

  const askDelete = () =>
    Alert.alert(t('mine.deleteTitle'), t('mine.deleteText'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('photos.delete'), style: 'destructive', onPress: () => remove.mutate(item.id) },
    ]);

  return (
    <View style={[styles.card, item.needs_confirmation && styles.cardAttention]}>
      <Pressable style={styles.row} onPress={() => router.push(`/listing/${item.id}`)}>
        {item.cover_photo_url ? (
          <Image source={item.cover_photo_url} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, styles.noThumb]}>
            <Text>📷</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.muted}>{item.area} · {formatRs(item.total_monthly_cost)}{t('listing.perMonth')}</Text>
          <View style={styles.badges}>
            <Badge label={t(`status.${item.status}`)} color={status.color} bg={status.bg} />
            {item.status === 'active' ? <FreshnessBadge confirmedAt={item.last_confirmed_at} /> : null}
          </View>
        </View>
      </Pressable>

      {/* The one-tap freshness question — the heart of GharKhoji */}
      {item.needs_confirmation ? (
        <View style={styles.question}>
          <Text style={styles.questionText}>{t('mine.stillAvailable')}</Text>
          <View style={styles.actions}>
            <Button title={`✅ ${t('mine.yes')}`} onPress={() => run('confirm-available')} loading={action.isPending}
              style={styles.flexBtn} />
            <Button title={`🏠 ${t('mine.rented')}`} variant="outline" onPress={askRented} style={styles.flexBtn} />
          </View>
        </View>
      ) : null}

      <View style={styles.actions}>
        {item.status === 'active' && !item.needs_confirmation ? (
          <>
            <SmallAction label={`✅ ${t('mine.confirm')}`} onPress={() => run('confirm-available')} />
            <SmallAction label={`🏠 ${t('mine.rented')}`} onPress={askRented} />
          </>
        ) : null}
        {item.status === 'draft' || item.status === 'rented' ? (
          <SmallAction label={`🚀 ${t('photos.publish')}`} onPress={() => router.push(`/listing/${item.id}/photos`)} />
        ) : null}
        {item.status !== 'rented' ? (
          <SmallAction label={`✏️ ${t('mine.edit')}`} onPress={() => router.push(`/listing/${item.id}/edit`)} />
        ) : null}
        <SmallAction label={`📷 ${item.photo_count}`} onPress={() => router.push(`/listing/${item.id}/photos`)} />
        <SmallAction label="🗑" onPress={askDelete} />
      </View>
    </View>
  );
}

function SmallAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.small, pressed && { opacity: 0.6 }]}>
      <Text style={styles.smallText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: space.lg, paddingTop: space.md,
  },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  postBtn: { height: 40, paddingHorizontal: space.lg },
  banner: {
    backgroundColor: colors.okBg, marginHorizontal: space.lg, marginTop: space.md,
    padding: space.md, borderRadius: radius.md,
  },
  bannerText: { color: colors.ok, fontWeight: '700' },
  card: {
    backgroundColor: colors.card, borderRadius: radius.lg, padding: space.md, marginBottom: space.md,
    borderWidth: 1, borderColor: colors.border,
  },
  cardAttention: { borderColor: colors.ok, borderWidth: 2 },
  row: { flexDirection: 'row', gap: space.md },
  thumb: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.border },
  noThumb: { alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  muted: { color: colors.textMuted, marginTop: 2 },
  badges: { flexDirection: 'row', gap: space.xs, marginTop: space.xs, flexWrap: 'wrap' },
  question: { backgroundColor: colors.okBg, borderRadius: radius.md, padding: space.md, marginTop: space.md },
  questionText: { fontWeight: '700', color: colors.text, marginBottom: space.sm },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm, flexWrap: 'wrap' },
  flexBtn: { flex: 1, height: 44, paddingHorizontal: space.sm },
  small: {
    paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.pill,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
  },
  smallText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  empty: { alignItems: 'center', marginTop: space.xxl, paddingHorizontal: space.xl },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: space.md, textAlign: 'center' },
});
