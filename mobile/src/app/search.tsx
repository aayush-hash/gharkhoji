import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useSearch } from '../api/hooks';
import { ListingCard } from '../components/ListingCard';
import { Chip, ErrorView, Loading } from '../components/ui';
import { colors, space } from '../lib/theme';
import type { ListingType, SortOption } from '../lib/types';

export default function SearchScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ place?: string; max_rent?: string; types?: string }>();
  const [sort, setSort] = useState<SortOption>('freshness');

  const filters = useMemo(
    () => ({
      place: params.place,
      radius_km: 3,
      max_rent: params.max_rent ? Number(params.max_rent) : undefined,
      types: params.types ? (params.types.split(',') as ListingType[]) : undefined,
      sort,
    }),
    [params.place, params.max_rent, params.types, sort],
  );
  const query = useSearch(filters);

  const sorts: SortOption[] = params.place
    ? ['freshness', 'distance', 'price_low', 'price_high']
    : ['freshness', 'price_low', 'price_high'];

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const first = query.data?.pages[0];

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        {first ? (
          <Text style={styles.count}>
            {t('search.results', { count: first.total })}
            {first.center?.place ? `  ·  ${t('search.within', { km: first.center.radius_km, place: first.center.place })}` : ''}
          </Text>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {sorts.map((s) => (
            <Chip key={s} label={t(`search.sort.${s}`)} selected={sort === s} onPress={() => setSort(s)} />
          ))}
        </ScrollView>
      </View>

      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorView error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ListingCard item={item} />}
          contentContainerStyle={{ padding: space.lg }}
          onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
          onEndReachedThreshold={0.5}
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={() => query.refetch()}
          ListEmptyComponent={<Text style={styles.empty}>{t('search.empty')}</Text>}
          ListFooterComponent={
            query.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={{ margin: space.lg }} /> : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  count: { color: colors.textMuted, marginBottom: space.sm, fontWeight: '600' },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: space.xxl, paddingHorizontal: space.xl },
});
