// Explore — the home screen. Inspired by Airbnb/Zillow: search first, then curated rows.
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { usePlaces, useSearch } from '../../api/hooks';
import { ListingCard, ListingCardSkeleton } from '../../components/ListingCard';
import { Avatar, SectionHeader, tap } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { colors, font, gradients, radius, shadow, space } from '../../lib/theme';
import type { ListingCard as Card, ListingType } from '../../lib/types';

const CATEGORIES: { type: ListingType; icon: keyof typeof Ionicons.glyphMap }[] = [
  { type: 'room', icon: 'bed' },
  { type: '1bhk', icon: 'home' },
  { type: '2bhk', icon: 'business' },
  { type: '3bhk', icon: 'library' },
  { type: 'flat', icon: 'albums' },
];

function greetingKey() {
  const h = new Date().getHours();
  return h < 12 ? 'home.morning' : h < 17 ? 'home.afternoon' : 'home.evening';
}

export default function Explore() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const user = useAuth((s) => s.user);
  const places = usePlaces();
  const fresh = useSearch({ sort: 'freshness' }, 8);
  const cheap = useSearch({ sort: 'price_low' }, 8);

  const cardWidth = Math.min(280, Math.round(width * 0.72));
  const areas = (places.data ?? []).filter((p) => p.kind === 'area').slice(0, 10);
  const firstName = user?.full_name?.split(' ')[0];
  const isOwner = Boolean(user && user.role !== 'tenant');

  const refresh = () => {
    fresh.refetch();
    cheap.refetch();
    places.refetch();
  };

  const Row = ({ items, loading }: { items: Card[]; loading: boolean }) =>
    loading ? (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowContent}>
        {[0, 1].map((i) => (
          <View key={i} style={{ marginRight: space.md }}>
            <ListingCardSkeleton variant="compact" width={cardWidth} />
          </View>
        ))}
      </ScrollView>
    ) : (
      <FlatList
        horizontal
        data={items}
        keyExtractor={(i) => i.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rowContent}
        ItemSeparatorComponent={() => <View style={{ width: space.md }} />}
        snapToInterval={cardWidth + space.md}
        decelerationRate="fast"
        renderItem={({ item }) => <ListingCard item={item} variant="compact" width={cardWidth} />}
      />
    );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={fresh.isRefetching} onRefresh={refresh} tintColor="#fff" />}>
      {/* ---------- Hero ---------- */}
      <LinearGradient colors={gradients.hero} style={[styles.hero, { paddingTop: insets.top + space.md }]}>
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>
              {t(greetingKey())}
              {firstName ? `, ${firstName}` : ''} 👋
            </Text>
            <View style={styles.locationRow}>
              <Ionicons name="location" size={14} color={colors.primaryTint} />
              <Text style={styles.location}>{t('home.valley')}</Text>
            </View>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/profile')} hitSlop={8}>
            {user ? (
              <Avatar name={user.full_name} size={44} />
            ) : (
              <View style={styles.guestAvatar}>
                <Ionicons name="person" size={20} color="#fff" />
              </View>
            )}
          </Pressable>
        </View>
        <Text style={styles.heroTitle}>{t('home.heroTitle')}</Text>
      </LinearGradient>

      {/* ---------- Search bar (overlaps the hero) ---------- */}
      <Pressable
        onPress={() => {
          tap();
          router.push({ pathname: '/search', params: { focus: '1' } });
        }}
        style={[styles.searchBar, shadow(3)]}>
        <Ionicons name="search" size={20} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.searchTitle}>{t('home.searchTitle')}</Text>
          <Text style={styles.searchHint}>{t('home.searchHint')}</Text>
        </View>
        <View style={styles.filterIcon}>
          <Ionicons name="options" size={18} color={colors.primary} />
        </View>
      </Pressable>

      {/* ---------- Categories ---------- */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c.type}
            onPress={() => {
              tap();
              router.push({ pathname: '/search', params: { types: c.type } });
            }}
            style={styles.category}>
            <View style={[styles.categoryIcon, shadow(1)]}>
              <Ionicons name={c.icon} size={24} color={colors.primary} />
            </View>
            <Text style={styles.categoryText}>{t(`types.${c.type}`)}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* ---------- Trust promise ---------- */}
      <View style={styles.px}>
        <View style={[styles.trust, shadow(1)]}>
          {[
            { icon: 'shield-checkmark' as const, label: t('home.trustVerified') },
            { icon: 'time' as const, label: t('home.trustFresh') },
            { icon: 'receipt' as const, label: t('home.trustCost') },
          ].map((item, i) => (
            <View key={item.label} style={[styles.trustItem, i > 0 && styles.trustDivider]}>
              <Ionicons name={item.icon} size={20} color={colors.primary} />
              <Text style={styles.trustText}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ---------- Fresh today ---------- */}
      <View style={styles.px}>
        <SectionHeader
          title={t('home.freshest')}
          action={t('home.seeAll')}
          onAction={() => router.push({ pathname: '/search', params: { sort: 'freshness' } })}
        />
      </View>
      <Row items={fresh.data?.pages[0]?.items ?? []} loading={fresh.isLoading} />

      {/* ---------- Popular areas ---------- */}
      <View style={styles.px}>
        <SectionHeader title={t('home.areas')} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowContent}>
        {areas.map((p, i) => (
          <Pressable
            key={p.slug}
            onPress={() => {
              tap();
              router.push({ pathname: '/search', params: { place: p.slug, placeName: p.name } });
            }}
            style={({ pressed }) => [{ marginRight: space.md }, pressed && { opacity: 0.85 }]}>
            <LinearGradient colors={gradients.tiles[i % gradients.tiles.length]} style={styles.areaTile}>
              <Ionicons name="location" size={18} color="rgba(255,255,255,0.9)" />
              <View>
                <Text style={styles.areaName} numberOfLines={1}>
                  {i18n.language === 'ne' ? p.name_ne : p.name}
                </Text>
                <Text style={styles.areaSub} numberOfLines={1}>
                  {i18n.language === 'ne' ? p.name : p.name_ne}
                </Text>
              </View>
            </LinearGradient>
          </Pressable>
        ))}
      </ScrollView>

      {/* ---------- Budget picks ---------- */}
      <View style={styles.px}>
        <SectionHeader
          title={t('home.budgetPicks')}
          action={t('home.seeAll')}
          onAction={() => router.push({ pathname: '/search', params: { sort: 'price_low' } })}
        />
      </View>
      <Row items={cheap.data?.pages[0]?.items ?? []} loading={cheap.isLoading} />

      {/* ---------- Owner call to action ---------- */}
      <View style={styles.px}>
        <Pressable
          onPress={() => router.push(isOwner ? '/post' : user ? '/(tabs)/profile' : '/auth/role')}
          style={({ pressed }) => [pressed && { opacity: 0.9 }, { marginTop: space.xxl }]}>
          <LinearGradient colors={['#FF8A65', '#E8590C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cta}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ctaTitle}>{t('home.ctaTitle')}</Text>
              <Text style={styles.ctaText}>{t('home.ctaText')}</Text>
            </View>
            <View style={styles.ctaIcon}>
              <Ionicons name="arrow-forward" size={22} color={colors.agent} />
            </View>
          </LinearGradient>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  px: { paddingHorizontal: space.lg },
  hero: { paddingHorizontal: space.lg, paddingBottom: 56, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  heroTop: { flexDirection: 'row', alignItems: 'center' },
  greeting: { ...font.h3, color: '#fff' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  location: { ...font.small, color: colors.primaryTint },
  guestAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { ...font.hero, color: '#fff', marginTop: space.xl, lineHeight: 36 },
  searchBar: {
    marginHorizontal: space.lg,
    marginTop: -30,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: space.md,
    paddingLeft: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  searchTitle: { ...font.bodyStrong, color: colors.text },
  searchHint: { ...font.small, color: colors.textMuted, marginTop: 1 },
  filterIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categories: { paddingHorizontal: space.lg, paddingTop: space.xl, gap: space.lg },
  category: { alignItems: 'center', width: 64 },
  categoryIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryText: { ...font.smallStrong, color: colors.textSecondary, marginTop: space.sm },
  trust: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    paddingVertical: space.lg,
    marginTop: space.xl,
  },
  trustItem: { flex: 1, alignItems: 'center', gap: 6, paddingHorizontal: space.xs },
  trustDivider: { borderLeftWidth: 1, borderLeftColor: colors.border },
  trustText: { ...font.tiny, fontSize: 12, color: colors.text, textAlign: 'center' },
  rowContent: { paddingHorizontal: space.lg, paddingBottom: space.xs },
  areaTile: { width: 136, height: 96, borderRadius: radius.lg, padding: space.md, justifyContent: 'space-between' },
  areaName: { color: '#fff', fontWeight: '800', fontSize: 15 },
  areaSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 1 },
  cta: { borderRadius: radius.xl, padding: space.xl, flexDirection: 'row', alignItems: 'center', gap: space.md },
  ctaTitle: { ...font.h3, color: '#fff' },
  ctaText: { ...font.small, color: 'rgba(255,255,255,0.9)', marginTop: 4, lineHeight: 18 },
  ctaIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

