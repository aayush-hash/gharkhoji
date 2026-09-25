import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { usePlaces, useSearch } from '../../api/hooks';
import { ListingCard } from '../../components/ListingCard';
import { Button, Chip, ErrorView, SectionTitle } from '../../components/ui';
import { formatRs } from '../../lib/format';
import { colors, space } from '../../lib/theme';
import type { ListingType } from '../../lib/types';

const BUDGETS = [10000, 15000, 20000, 30000];
const TYPES: ListingType[] = ['room', '1bhk', '2bhk', '3bhk', 'flat'];

export default function Home() {
  const { t, i18n } = useTranslation();
  const places = usePlaces();
  const freshest = useSearch({ sort: 'freshness' }, 5);

  const [place, setPlace] = useState<string | undefined>();
  const [maxRent, setMaxRent] = useState<number | undefined>();
  const [types, setTypes] = useState<ListingType[]>([]);

  const toggleType = (type: ListingType) =>
    setTypes((cur) => (cur.includes(type) ? cur.filter((x) => x !== type) : [...cur, type]));

  const search = () =>
    router.push({
      pathname: '/search',
      params: {
        ...(place ? { place } : {}),
        ...(maxRent ? { max_rent: String(maxRent) } : {}),
        ...(types.length ? { types: types.join(',') } : {}),
      },
    });

  const areas = (places.data ?? []).filter((p) => p.kind === 'area');
  const freshItems = freshest.data?.pages[0]?.items ?? [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={freshest.isRefetching}
            onRefresh={() => {
              freshest.refetch();
              places.refetch();
            }}
          />
        }>
        <Text style={styles.title}>🏠 {t('home.title')}</Text>

        <SectionTitle>📍 {t('home.where')}</SectionTitle>
        {places.isError ? (
          <ErrorView error={places.error} onRetry={() => places.refetch()} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
            {areas.map((p) => (
              <Chip
                key={p.slug}
                label={i18n.language === 'ne' ? p.name_ne : p.name}
                selected={place === p.slug}
                onPress={() => setPlace(place === p.slug ? undefined : p.slug)}
              />
            ))}
          </ScrollView>
        )}

        <SectionTitle>💰 {t('home.budget')}</SectionTitle>
        <View style={styles.wrap}>
          <Chip label={t('home.anyBudget')} selected={!maxRent} onPress={() => setMaxRent(undefined)} />
          {BUDGETS.map((b) => (
            <Chip
              key={b}
              label={t('home.upTo', { amount: formatRs(b) })}
              selected={maxRent === b}
              onPress={() => setMaxRent(b)}
            />
          ))}
        </View>

        <SectionTitle>🛏 {t('home.type')}</SectionTitle>
        <View style={styles.wrap}>
          {TYPES.map((type) => (
            <Chip
              key={type}
              label={t(`types.${type}`)}
              selected={types.includes(type)}
              onPress={() => toggleType(type)}
            />
          ))}
        </View>

        <Button title={`🔍 ${t('home.search')}`} onPress={search} style={{ marginTop: space.lg }} />

        <View style={styles.freshHeader}>
          <SectionTitle>🟢 {t('home.freshest')}</SectionTitle>
          <Text style={styles.seeAll} onPress={() => router.push('/search')}>
            {t('home.seeAll')} →
          </Text>
        </View>
        {freshest.isError ? (
          <ErrorView error={freshest.error} onRetry={() => freshest.refetch()} />
        ) : (
          freshItems.map((item) => <ListingCard key={item.id} item={item} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  hScroll: { marginHorizontal: -space.lg, paddingHorizontal: space.lg },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  freshHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: space.lg },
  seeAll: { color: colors.primary, fontWeight: '600', marginBottom: space.sm },
});
