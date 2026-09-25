// Search: text box + area + filter sheet (type, budget, facilities, radius, sort).
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useListingMeta, usePlaces, useSearch } from '../api/hooks';
import { ListingCard, ListingCardSkeleton } from '../components/ListingCard';
import { Button, Chip, EmptyState, ErrorView, Field, IconButton, tap } from '../components/ui';
import { formatRs } from '../lib/format';
import { colors, font, radius, shadow, space } from '../lib/theme';
import type { ListingType, SortOption } from '../lib/types';

const TYPES: ListingType[] = ['room', '1bhk', '2bhk', '3bhk', 'flat'];
const BUDGETS = [8000, 12000, 15000, 20000, 30000];
const RADII = [1, 2, 3, 5, 10];

type Filters = {
  types: ListingType[];
  minRent?: number;
  maxRent?: number;
  amenities: string[];
  radiusKm: number;
  sort: SortOption;
};

function useDebounced<T>(value: T, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export default function SearchScreen() {
  const { t, i18n } = useTranslation();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{
    place?: string;
    placeName?: string;
    types?: string;
    max_rent?: string;
    sort?: SortOption;
    focus?: string;
  }>();
  const places = usePlaces();

  const [text, setText] = useState('');
  const q = useDebounced(text.trim());
  const [place, setPlace] = useState<string | undefined>(params.place);
  const [filters, setFilters] = useState<Filters>({
    types: params.types ? (params.types.split(',') as ListingType[]) : [],
    maxRent: params.max_rent ? Number(params.max_rent) : undefined,
    amenities: [],
    radiusKm: 3,
    sort: params.sort ?? 'freshness',
  });
  const [sheetOpen, setSheetOpen] = useState(false);

  const query = useSearch(
    useMemo(
      () => ({
        place,
        radius_km: filters.radiusKm,
        min_rent: filters.minRent,
        max_rent: filters.maxRent,
        types: filters.types.length ? filters.types : undefined,
        amenities: filters.amenities.length ? filters.amenities : undefined,
        sort: filters.sort === 'distance' && !place ? 'freshness' : filters.sort,
        q: q || undefined,
      }),
      [place, filters, q],
    ),
  );

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  const activeCount =
    filters.types.length + filters.amenities.length + (filters.minRent || filters.maxRent ? 1 : 0);
  const columns = width >= 700 ? 2 : 1;
  const allAreas = (places.data ?? []).filter((p) => p.kind === 'area');
  const placeLabel = allAreas.find((a) => a.slug === place);
  // Show the chosen area first so it's visible without scrolling
  const areas = placeLabel ? [placeLabel, ...allAreas.filter((a) => a.slug !== place)] : allAreas;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ---------- Top: back + search box ---------- */}
      <View style={styles.top}>
        <IconButton name="arrow-back" onPress={() => router.back()} bg={colors.bg} />
        <View style={[styles.searchBox, shadow(1)]}>
          <Ionicons name="search" size={19} color={colors.textMuted} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('search.placeholder')}
            placeholderTextColor={colors.textMuted}
            autoFocus={params.focus === '1'}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {text ? (
            <Pressable onPress={() => setText('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => {
            tap();
            setSheetOpen(true);
          }}
          style={[styles.filterBtn, activeCount > 0 && { backgroundColor: colors.primary }]}>
          <Ionicons name="options" size={20} color={activeCount > 0 ? '#fff' : colors.primary} />
          {activeCount > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {/* ---------- Area chips ---------- */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, flexShrink: 0 }}
        contentContainerStyle={styles.areaRow}>
        <Chip label={t('search.anywhere')} icon="globe-outline" selected={!place} onPress={() => setPlace(undefined)} />
        {areas.map((a) => (
          <Chip
            key={a.slug}
            label={i18n.language === 'ne' ? a.name_ne : a.name}
            selected={place === a.slug}
            onPress={() => setPlace(place === a.slug ? undefined : a.slug)}
          />
        ))}
      </ScrollView>

      <View style={styles.resultBar}>
        <Text style={styles.resultText}>
          {query.isLoading ? t('common.loading') : t('search.results', { count: total })}
          {placeLabel ? ` · ${t('search.within', { km: filters.radiusKm, place: placeLabel.name })}` : ''}
        </Text>
        <Pressable onPress={() => setSheetOpen(true)} hitSlop={8} style={styles.sortBtn}>
          <Ionicons name="swap-vertical" size={15} color={colors.primary} />
          <Text style={styles.sortText}>{t(`search.sort.${filters.sort}`)}</Text>
        </Pressable>
      </View>

      {/* ---------- Results ---------- */}
      {query.isLoading ? (
        <View style={styles.list}>
          <ListingCardSkeleton />
          <ListingCardSkeleton />
        </View>
      ) : query.isError ? (
        <ErrorView error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <FlatList
          key={columns}
          data={items}
          numColumns={columns}
          keyExtractor={(item) => item.id}
          columnWrapperStyle={columns > 1 ? { gap: space.lg } : undefined}
          renderItem={({ item }) => (
            <View style={{ flex: 1 }}>
              <ListingCard item={item} />
            </View>
          )}
          contentContainerStyle={[styles.list, { flexGrow: 1 }]}
          onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
          onEndReachedThreshold={0.5}
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={() => query.refetch()}
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            <EmptyState icon="search" title={t('search.emptyTitle')} text={t('search.empty')} />
          }
          ListFooterComponent={
            query.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={{ margin: space.lg }} /> : null
          }
        />
      )}

      <FilterSheet
        visible={sheetOpen}
        initial={filters}
        hasPlace={Boolean(place)}
        onClose={() => setSheetOpen(false)}
        onApply={(f) => {
          setFilters(f);
          setSheetOpen(false);
        }}
      />
    </SafeAreaView>
  );
}

function FilterSheet({
  visible,
  initial,
  hasPlace,
  onClose,
  onApply,
}: {
  visible: boolean;
  initial: Filters;
  hasPlace: boolean;
  onClose: () => void;
  onApply: (f: Filters) => void;
}) {
  const { t } = useTranslation();
  const meta = useListingMeta();
  const [f, setF] = useState(initial);
  const [minText, setMinText] = useState(initial.minRent ? String(initial.minRent) : '');
  const [maxText, setMaxText] = useState(initial.maxRent ? String(initial.maxRent) : '');

  useEffect(() => {
    if (visible) {
      setF(initial);
      setMinText(initial.minRent ? String(initial.minRent) : '');
      setMaxText(initial.maxRent ? String(initial.maxRent) : '');
    }
  }, [visible, initial]);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const sorts: SortOption[] = hasPlace ? ['freshness', 'distance', 'price_low', 'price_high'] : ['freshness', 'price_low', 'price_high'];
  const num = (s: string) => {
    const n = parseInt(s.replace(/\D/g, ''), 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.sheetTitle}>{t('search.filters')}</Text>
          <Pressable
            hitSlop={8}
            onPress={() => {
              setF({ types: [], amenities: [], radiusKm: 3, sort: 'freshness' });
              setMinText('');
              setMaxText('');
            }}>
            <Text style={styles.reset}>{t('search.reset')}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          <Text style={styles.group}>{t('search.sortBy')}</Text>
          <View style={styles.wrap}>
            {sorts.map((s) => (
              <Chip key={s} label={t(`search.sort.${s}`)} selected={f.sort === s} onPress={() => setF({ ...f, sort: s })} />
            ))}
          </View>

          <Text style={styles.group}>{t('home.type')}</Text>
          <View style={styles.wrap}>
            {TYPES.map((ty) => (
              <Chip key={ty} label={t(`types.${ty}`)} selected={f.types.includes(ty)} onPress={() => setF({ ...f, types: toggle(f.types, ty) })} />
            ))}
          </View>

          <Text style={styles.group}>{t('home.budget')}</Text>
          <View style={styles.wrap}>
            {BUDGETS.map((b) => (
              <Chip
                key={b}
                label={t('home.upTo', { amount: formatRs(b) })}
                selected={f.maxRent === b && !f.minRent}
                onPress={() => {
                  setF({ ...f, maxRent: b, minRent: undefined });
                  setMaxText(String(b));
                  setMinText('');
                }}
              />
            ))}
          </View>
          <View style={styles.rangeRow}>
            <Field label={t('search.min')} value={minText} onChangeText={setMinText} keyboardType="number-pad" placeholder="5000" prefix="Rs" style={{ flex: 1 }} />
            <Field label={t('search.max')} value={maxText} onChangeText={setMaxText} keyboardType="number-pad" placeholder="30000" prefix="Rs" style={{ flex: 1 }} />
          </View>

          {hasPlace ? (
            <>
              <Text style={styles.group}>{t('search.distance')}</Text>
              <View style={styles.wrap}>
                {RADII.map((r) => (
                  <Chip key={r} label={`${r} km`} selected={f.radiusKm === r} onPress={() => setF({ ...f, radiusKm: r })} />
                ))}
              </View>
            </>
          ) : null}

          <Text style={styles.group}>{t('listing.amenities')}</Text>
          <View style={styles.wrap}>
            {(meta.data?.amenities ?? []).map((a) => (
              <Chip
                key={a}
                label={t(`amenities.${a}`, { defaultValue: a })}
                selected={f.amenities.includes(a)}
                onPress={() => setF({ ...f, amenities: toggle(f.amenities, a) })}
              />
            ))}
          </View>
        </ScrollView>

        <View style={[styles.sheetFooter, shadow(3)]}>
          <Button
            title={t('search.apply')}
            onPress={() => onApply({ ...f, minRent: num(minText), maxRent: num(maxText) })}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.sm },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 48,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, height: '100%' },
  filterBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  filterBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  areaRow: { paddingHorizontal: space.lg, paddingTop: space.md },
  resultBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.xs,
    paddingBottom: space.sm,
  },
  resultText: { ...font.smallStrong, color: colors.textSecondary, flex: 1 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortText: { ...font.smallStrong, color: colors.primary },
  list: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xxxl },
  sheet: { flex: 1, backgroundColor: colors.bg },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  sheetTitle: { ...font.h3, color: colors.text },
  reset: { ...font.bodyStrong, color: colors.primary },
  sheetBody: { padding: space.lg, paddingBottom: 120 },
  group: { ...font.h3, color: colors.text, marginTop: space.lg, marginBottom: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  rangeRow: { flexDirection: 'row', gap: space.md, marginTop: space.sm },
  sheetFooter: { padding: space.lg, paddingBottom: space.xxl, backgroundColor: colors.card },
});
